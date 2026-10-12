import { decodeString } from 'micromark-util-decode-string';
import type { PassageSelection } from '../src/model';

type PositionedNode = {
  type: string;
  tagName?: string;
  value?: string;
  position?: { start: { offset?: number }; end: { offset?: number } };
  properties?: Record<string, unknown>;
  children?: PositionedNode[];
};

/** Code normalizes line endings and indentation differently from ordinary Markdown text. */
function codeOffsets(source: string, start: number, end: number, value: string, block: boolean): number[] | undefined {
  const raw = source.slice(start, end);
  if (!block) {
    const ticks = /^`+/.exec(raw)?.[0].length ?? 0;
    const lineStart = Math.max(source.lastIndexOf('\n', start - 1), source.lastIndexOf('\r', start - 1)) + 1;
    const prefix = source.slice(lineStart, start);
    const quoteDepth = (/^ {0,3}(?:>[ \t]? {0,3})*/.exec(prefix)![0].match(/>/g) ?? []).length;
    let cursor = start + ticks;
    const limit = end - ticks;
    let rendered = '';
    let offsets = [cursor];
    while (cursor < limit) {
      const newline = /^(?:\r\n|\r|\n)/.exec(source.slice(cursor, limit))?.[0];
      rendered += newline ? ' ' : source[cursor];
      cursor += newline?.length ?? 1;
      offsets.push(cursor);
      if (newline) {
        // Container markers belong to Markdown structure, not the inline code value.
        for (let depth = 0; depth < quoteDepth; depth++) {
          const marker = /^ {0,3}>[ \t]?/.exec(source.slice(cursor, limit));
          if (!marker) break; // Lazy blockquote continuation can omit the marker.
          cursor += marker[0].length;
        }
        offsets[offsets.length - 1] = cursor;
      }
    }
    // CommonMark trims one padding space after replacing newlines with spaces.
    if (rendered.startsWith(' ') && rendered.endsWith(' ') && /[^ ]/.test(rendered)) {
      rendered = rendered.slice(1, -1);
      offsets = offsets.slice(1, -1);
    }
    return rendered === value ? offsets : undefined;
  }

  const fence = /^ {0,3}(`{3,}|~{3,})[^\r\n]*(?:\r\n|\r|\n)/.exec(raw);
  let cursor = start + (fence?.[0].length ?? 0);
  const offsets: number[] = [];
  const lines = [...value.matchAll(/([^\r\n]*)(\r\n|\r|\n|$)/g)].filter(match => match[0]);
  for (const [, line, ending] of lines) {
    const sourceLine = /^[^\r\n]*/.exec(source.slice(cursor, end))![0];
    let lineOffsets: number[] | undefined;
    if (sourceLine.endsWith(line)) {
      const removed = sourceLine.length - line.length;
      if (/^[ \t>]*$/.test(sourceLine.slice(0, removed))) {
        lineOffsets = Array.from({ length: line.length + 1 }, (_, i) => cursor + removed + i);
      }
    }
    if (!lineOffsets) {
      // A partially consumed indentation tab becomes spaces in the parsed code.
      for (let tab = sourceLine.indexOf('\t'); tab >= 0 && !lineOffsets; tab = sourceLine.indexOf('\t', tab + 1)) {
        if (!/^[ \t>]*$/.test(sourceLine.slice(0, tab))) break;
        const suffix = sourceLine.slice(tab + 1);
        for (let spaces = 1; spaces <= 4; spaces++) {
          if (' '.repeat(spaces) + suffix !== line) continue;
          lineOffsets = [cursor + tab];
          for (let i = 1; i <= spaces; i++) lineOffsets.push(cursor + tab + (i === spaces ? 1 : 0));
          for (let i = 1; i <= suffix.length; i++) lineOffsets.push(cursor + tab + 1 + i);
          break;
        }
      }
    }
    if (!lineOffsets) return undefined;
    if (!offsets.length) offsets.push(lineOffsets[0]);
    else offsets[offsets.length - 1] = lineOffsets[0];
    for (let i = 1; i < lineOffsets.length; i++) offsets.push(lineOffsets[i]);
    cursor += sourceLine.length;
    const newline = /^(?:\r\n|\r|\n)/.exec(source.slice(cursor, end))?.[0];
    const newlineLength = newline?.length ?? 0;
    for (let i = 0; i < ending.length; i++) {
      offsets.push(cursor + (i + 1 === ending.length ? newlineLength : Math.min(i + 1, newlineLength)));
    }
    cursor += newlineLength; // A code block's final newline can be renderer-generated.
  }
  return offsets.length === value.length + 1 ? offsets : undefined;
}

/** Map rendered UTF-16 text boundaries to Markdown offsets, including escapes and entities. */
export function textOffsets(source: string, start: number, end: number, value: string, code = false, block = false): number[] | undefined {
  if (code) return codeOffsets(source, start, end, value, block);
  let rendered = '';
  const offsets = [start];
  let cursor = start;
  while (rendered.length < value.length && cursor < end) {
    if ((source[cursor - 1] === '\n' || source[cursor - 1] === '\r') && source[cursor] !== value[rendered.length]) {
      const prefix = /^[ \t]*(?:>[ \t]*)*/.exec(source.slice(cursor, end))![0];
      cursor += prefix.length;
      offsets[offsets.length - 1] = cursor;
    }
    const token = /^(?:\\[!-/:-@[-`{-~]|&(?:#\d{1,7}|#x[\da-f]{1,6}|[\da-z]{1,31});)/i.exec(source.slice(cursor, end))?.[0];
    const rawToken = token ?? (source.slice(cursor, cursor + 2) === '\r\n' ? '\r\n' : source[cursor]);
    let text = token ? decodeString(token) : rawToken;
    if (!token && (rawToken === '\r\n' || rawToken === '\r') && !value.startsWith(rawToken, rendered.length)) text = '\n';
    if (!value.startsWith(text, rendered.length)) return undefined;
    for (let i = 0; i < text.length; i++) offsets.push(text === rawToken ? cursor + i + 1 : i === text.length - 1 ? cursor + rawToken.length : cursor);
    rendered += text;
    cursor += rawToken.length;
  }
  return rendered === value ? offsets : undefined;
}

/** Annotate actual text leaves; structural whitespace and UI reference details stay unmapped. */
export function passagePositions() {
  return (tree: PositionedNode, file: { value: unknown }) => {
    const source = String(file.value);
    function visit(parent: PositionedNode, inBlock = false) {
      if (!parent.children) return;
      const block = inBlock || parent.tagName === 'pre';
      parent.children = parent.children.map(node => {
        if (node.type !== 'text') { visit(node, block); return node; }
        const position = node.position ?? (parent.tagName === 'code' ? parent.position : undefined);
        const start = position?.start.offset, end = position?.end.offset;
        if (start === undefined || end === undefined || !node.value) return node;
        const offsets = textOffsets(source, start, end, node.value, parent.tagName === 'code', block);
        if (!offsets) return node;
        return { type: 'element', tagName: 'span', properties: { 'data-source-offsets': JSON.stringify(offsets) }, children: [node] };
      });
    }
    visit(tree);
  };
}

export function selectedPassage(root: HTMLElement, selection: Selection, source: string): (PassageSelection & { quote: string }) | undefined {
  if (!selection.rangeCount || selection.isCollapsed) return;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return;
  let start: number | undefined, end: number | undefined;
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!range.intersectsNode(node)) continue;
    const length = node.textContent?.length ?? 0;
    if (range.comparePoint(node, length) < 0 || range.comparePoint(node, 0) > 0) continue;
    const from = range.startContainer === node ? range.startOffset : 0;
    const to = range.endContainer === node ? range.endOffset : length;
    if (from === to) continue;
    const span = node.parentElement?.closest<HTMLElement>('[data-source-offsets]');
    if (!span) {
      // Layout whitespace is harmless; don't silently anchor a partly unmapped quote.
      if (node.textContent?.slice(from, to).trim()) return;
      continue;
    }
    const offsets = JSON.parse(span.dataset.sourceOffsets!) as number[];
    start ??= offsets[from];
    end = offsets[to];
  }
  const quote = selection.toString().trim();
  if (!quote || start === undefined || end === undefined || end <= start) return;
  return { quote, start, end, source: source.slice(start, end) };
}

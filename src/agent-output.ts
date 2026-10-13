import { messages, Problem, type Doc } from './model.js';

/** Section edits deliberately reject HTML outside fences rather than guess its block boundaries. */
function scanSections(body: string) {
  const headings: { title: string; level: number; start: number; content: number; end: number }[] = [];
  let offset = 0, fence: { marker: string; length: number } | undefined, unsupportedHtml = false;
  for (const line of body.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
    const fenced = /^ {0,3}(`{3,}|~{3,})(.*)\r?\n?$/.exec(line);
    if (fence) {
      if (fenced && fenced[1][0] === fence.marker && fenced[1].length >= fence.length && !fenced[2].trim()) fence = undefined;
    } else if (fenced) fence = { marker: fenced[1][0], length: fenced[1].length };
    else {
      if (/<(?:!--|[!?]|\/?[A-Za-z][A-Za-z0-9-]*(?=[\s/>]))/.test(line)) unsupportedHtml = true;
      const heading = /^ {0,3}(#{1,6})[ \t]+(.+?)\s*\r?\n?$/.exec(line);
      if (heading) headings.push({ title: heading[2].replace(/[ \t]+#+[ \t]*$/, '').trim(), level: heading[1].length, start: offset, content: offset + line.length, end: body.length });
    }
    offset += line.length;
  }
  for (let i = 0; i < headings.length; i++) headings[i].end = headings.slice(i + 1).find(h => h.level <= headings[i].level)?.start ?? body.length;
  return { headings, unsupportedHtml };
}

/** Only advertise sections whose boundaries this parser can safely establish. */
export function sections(body: string) {
  const scanned = scanSections(body);
  return scanned.unsupportedHtml ? [] : scanned.headings;
}

export function section(body: string, title: string) {
  const scanned = scanSections(body);
  if (scanned.unsupportedHtml) throw new Problem('Section operations do not support HTML outside fenced code. Read the full record and use an exact passage update instead.');
  const matches = scanned.headings.filter(h => h.title.toLowerCase() === title.trim().toLowerCase());
  if (matches.length !== 1) throw new Problem(matches.length ? 'Section is ambiguous; use an exact passage update.' : 'Section not found');
  return matches[0];
}

export function recordIndex(doc: Doc) {
  return { id: doc.meta.id, type: doc.meta.type, title: doc.meta.title, path: `.reduct/${doc.path}`, hash: doc.hash,
    ...(doc.meta.parent ? { parent: doc.meta.parent } : {}), ...(doc.meta.status ? { status: doc.meta.status } : {}),
    ...(doc.meta.related ? { related: doc.meta.related } : {}),
    ...(doc.meta.source_repository ? { source_repository: doc.meta.source_repository } : {}),
    ...(doc.meta.source_revision ? { source_revision: doc.meta.source_revision } : {}),
    ...(doc.meta.affected_features ? { affected_features: doc.meta.affected_features } : {}),
    ...(doc.meta.type === 'review' ? { target_id: doc.meta.target_id, target_hash: doc.meta.target_hash } : {}),
    sections: sections(doc.body).map(h => h.title) };
}

/** Keep all metadata and exact body text; only the transport formatting changes. */
export function readableRecord(doc: Doc, title?: string) {
  const selected = title ? section(doc.body, title) : undefined;
  return `Record: ${doc.meta.id}\nFile: .reduct/${doc.path}\nHash: ${doc.hash}\nMetadata: ${JSON.stringify(doc.meta)}\n${selected ? `Section: ${selected.title} (partial read; hash covers the whole record)\n` : ''}\n${selected ? doc.body.slice(selected.start, selected.end) : doc.body}`;
}

export function compactReview(doc: Doc) {
  return { meta: doc.meta, path: doc.path, hash: doc.hash, bodyStartLine: doc.bodyStartLine, messages: messages(doc) };
}

export function changedLines<T extends { kind: string }>(lines: T[], context = 3): (T | { omitted: number })[] {
  if (!Number.isInteger(context) || context < 0 || context > 100) throw new Problem('Diff context must be an integer from 0 to 100');
  const keep = new Set<number>();
  lines.forEach((line, i) => { if (line.kind !== 'same') for (let n = Math.max(0, i - context); n <= Math.min(lines.length - 1, i + context); n++) keep.add(n); });
  const result: (T | { omitted: number })[] = [];
  let omitted = 0;
  lines.forEach((line, i) => {
    if (!keep.has(i)) omitted++;
    else { if (omitted) result.push({ omitted }); omitted = 0; result.push(line); }
  });
  if (omitted) result.push({ omitted });
  return result;
}

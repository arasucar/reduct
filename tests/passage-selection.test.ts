import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DocumentMarkdown } from '../web/DocumentMarkdown.js';
import { textOffsets } from '../web/passageSelection.js';
import { anchor, decode, encode } from '../src/model.js';
import { initFixture } from './helpers.js';

test('text source boundaries account for entities, escapes, Unicode, and inline code', () => {
  const source = 'a &amp; \\* 😀';
  const offsets = textOffsets(source, 0, source.length, 'a & * 😀')!;
  assert.ok(offsets);
  assert.equal(source.slice(offsets[2], offsets[3]), '&amp;');
  assert.equal(source.slice(offsets[4], offsets[5]), '\\*');
  assert.equal(offsets.at(-1), source.length);
  assert.deepEqual(textOffsets('`code`', 0, 6, 'code', true), [1, 2, 3, 4, 5]);
  assert.deepEqual(textOffsets('`` a\nb ``', 0, 9, 'a b', true), [3, 4, 5, 6]);
  assert.equal(textOffsets('different', 0, 9, 'text'), undefined);
  const blockquote = 'first\n> second';
  const quoteOffsets = textOffsets(blockquote, 0, blockquote.length, 'first\nsecond')!;
  assert.ok(quoteOffsets);
  assert.equal(blockquote.slice(quoteOffsets[6], quoteOffsets.at(-1)), 'second');
});

test('rendered bold, links, table cells, paragraphs, and code carry exact text source positions', () => {
  const body = 'Allow **10% to 150%** and [a link](https://example.test).\n\nNext `code`.\n\n| Name |\n| --- |\n| **Value** |\n\n```js\nx = 1\n```\n';
  const doc = decode(encode({ schema_version: 1, id: 'FEATURE-test', type: 'feature', title: 'Test' }, body));
  const html = renderToStaticMarkup(createElement(DocumentMarkdown, { doc, docs: [doc], choose() {} }));
  const spans = [...html.matchAll(/data-source-offsets="([^"]+)"[^>]*>([^<]*)<\/span>/g)];
  for (const text of ['10% to 150%', 'a link', 'code', 'Value', 'x = 1\n']) {
    const span = spans.find(match => match[2] === text);
    assert.ok(span, text);
    const positions = JSON.parse(span[1]);
    assert.equal(body.slice(positions[0], positions.at(-1)), text);
  }
});

test('formatted comment quotes retain their source range, snapshots, and conservative tracking', async t => {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'reduct-formatted-comment-'));
  t.after(() => fs.rm(repo, { recursive: true, force: true }));
  const store = await initFixture(repo);
  const created = await store.create('feature', 'Selection', 'MODULE-alpha');
  const body = '# Selection\n\nAllow **10% to 150%**.\n\nAllow **10% to 150%**.\n';
  const feature = await store.saveBody(created.meta.id, body, created.hash);
  const source = 'Allow **10% to 150%**.';
  const start = body.lastIndexOf(source);
  const selection = { start, end: start + source.length, source };
  const author = { name: 'Owner', email: 'owner@example.test' };
  const thread = await store.comment(feature.meta.id, feature.hash, 'Why this range?', 'Allow 10% to 150%.', author, 'human', undefined, selection);
  assert.equal(thread.meta.quote, 'Allow 10% to 150%.');
  assert.equal(thread.meta.quote_source, source);
  assert.deepEqual(anchor(feature, thread), { state: 'current', offset: start });
  assert.equal((await store.get(String(thread.meta.target_revision))).body, body);
  assert.equal(thread.meta.quote_unique, false);
  // Keeping either identical occurrence is insufficient to identify the selected one.
  const moved = await store.saveBody(feature.meta.id, '# Selection\n\n' + source + '\n', feature.hash);
  assert.equal(anchor(moved, thread).state, 'outdated');
  const changed = await store.saveBody(feature.meta.id, moved.body.replace('**10% to 150%**', '10% to 150%'), moved.hash);
  assert.equal(anchor(changed, thread).state, 'outdated');
  await assert.rejects(store.comment(changed.meta.id, changed.hash, 'Invalid', 'Text', author, 'human', undefined, selection), /Selected passage/);
  await assert.rejects(store.comment(changed.meta.id, changed.hash, 'Invalid', 'Text', author, 'human', undefined, { start: -1, end: 3, source: 'bad' }), /Selected passage/);
  await assert.rejects(store.comment(changed.meta.id, feature.hash, 'Stale', 'Text', author, 'human', undefined, selection), /Document changed/);
  const legacy = await store.comment(changed.meta.id, changed.hash, 'Plain quote', '10% to 150%', author);
  assert.equal(anchor(changed, legacy).state, 'current');
});

test('unique formatted passages remain movable while deleted duplicate selections stay outdated', async t => {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'reduct-selection-identity-'));
  t.after(() => fs.rm(repo, { recursive: true, force: true }));
  const store = await initFixture(repo);
  const created = await store.create('feature', 'Identity', 'MODULE-alpha');
  const source = '**same**';
  const body = '# Identity\n\nFirst ' + source + '.\n\nSecond ' + source + '.\n';
  const feature = await store.saveBody(created.meta.id, body, created.hash);
  const start = body.lastIndexOf(source);
  const author = { name: 'Owner', email: 'owner@example.test' };
  const duplicate = await store.comment(feature.meta.id, feature.hash, 'Second occurrence', 'same', author, 'human', undefined, { start, end: start + source.length, source });
  const removed = await store.saveBody(feature.meta.id, body.slice(0, body.indexOf('Second')), feature.hash);
  assert.equal(anchor(removed, duplicate).state, 'outdated');
  // Older range-based comments without uniqueness evidence also stay conservative.
  const older = { ...duplicate, meta: { ...duplicate.meta } };
  delete older.meta.quote_unique;
  assert.equal(anchor(removed, older).state, 'outdated');
  const uniqueStart = removed.body.indexOf(source);
  const unique = await store.comment(removed.meta.id, removed.hash, 'Only occurrence', 'same', author, 'human', undefined, { start: uniqueStart, end: uniqueStart + source.length, source });
  assert.equal(unique.meta.quote_unique, true);
  const shifted = await store.saveBody(feature.meta.id, 'New introduction.\n\n' + removed.body, removed.hash);
  assert.deepEqual(anchor(shifted, unique), { state: 'moved', offset: shifted.body.indexOf(source) });
});

test('code mapping preserves nested indentation and normalizes inline newline padding', () => {
  const cases = [
    { body: '    first\n      indented\n', value: 'first\n  indented\n', block: true },
    { body: '\tfirst\n\t  indented\n', value: 'first\n  indented\n', block: true },
    { body: '```js\n  first\n    second\n```\n', value: '  first\n    second\n', block: true },
    { body: '  ```js\n    first\n      second\n  ```\n', value: '  first\n    second\n', block: true },
    { body: '    first\r\n      indented', value: 'first\r\n  indented\n', block: true },
    { body: '`\na\n`', value: 'a', block: false },
    { body: '`\r\na\r\n`', value: 'a', block: false },
    { body: '`   `', value: '   ', block: false },
  ];
  for (const { body, value, block } of cases) {
    const offsets = textOffsets(body, 0, body.length, value, true, block);
    assert.ok(offsets, JSON.stringify(body));
    assert.equal(offsets.length, value.length + 1);
    const doc = decode(encode({ schema_version: 1, id: 'FEATURE-code', type: 'feature', title: 'Code' }, body));
    const html = renderToStaticMarkup(createElement(DocumentMarkdown, { doc, docs: [doc], choose() {} }));
    const match = /data-source-offsets="([^"]+)"/.exec(html);
    assert.ok(match, JSON.stringify(body));
    const actual = JSON.parse(match[1]) as number[];
    if (block) {
      // Indented-code AST positions can omit the physical trailing newline.
      assert.deepEqual(actual.slice(0, -1), offsets.slice(0, -1));
      assert.ok(actual.at(-1)! >= actual.at(-2)! && actual.at(-1)! <= offsets.at(-1)!);
    } else assert.deepEqual(actual, offsets);
    if (value.includes('indented')) {
      const index = value.indexOf('  indented');
      assert.equal(body.slice(actual[index], actual[index + '  indented'.length]), '  indented');
    }
  }
});

function renderedOffsets(body: string, expected: string): number[] {
  const doc = decode(encode({ schema_version: 1, id: 'FEATURE-edge', type: 'feature', title: 'Edge' }, body));
  const html = renderToStaticMarkup(createElement(DocumentMarkdown, { doc, docs: [doc], choose() {} }));
  const match = [...html.matchAll(/data-source-offsets="([^"]+)"[^>]*>([^<]*)<\/span>/g)].find(span => span[2] === expected);
  assert.ok(match, JSON.stringify(body));
  const offsets = JSON.parse(match[1]) as number[];
  assert.equal(offsets.length, expected.length + 1);
  return offsets;
}

test('CRLF paragraphs, lists, and blockquotes map text after line breaks to its exact source', () => {
  for (const { body, value } of [
    { body: 'First line\r\nsecond line.', value: 'First line\r\nsecond line.' },
    { body: '> First\r\n> second.', value: 'First\r\nsecond.' },
    { body: '- one\r\n  continuation', value: 'one\r\ncontinuation' },
  ]) {
    const offsets = renderedOffsets(body, value);
    const index = value.indexOf('\n') + 1;
    assert.equal(body.slice(offsets[index], offsets.at(-1)), value.slice(index));
    assert.ok(offsets.every((offset, i) => i === 0 || offset >= offsets[i - 1]));
  }
});

test('inline code in quoted containers strips markers and preserves code spacing', () => {
  for (const { body, value } of [
    { body: '> `a\n> b`', value: 'a b' },
    { body: '> > `a\n> > b`', value: 'a b' },
    { body: '> `a\r\n> b`', value: 'a b' },
    { body: '> `a\n>   b`', value: 'a   b' },
    { body: '> `a\nb`', value: 'a b' },
  ]) {
    const offsets = renderedOffsets(body, value);
    const index = value.indexOf('b');
    assert.equal(body.slice(offsets[index], offsets[index + 1]), 'b');
    assert.equal(body.slice(offsets[0], offsets[1]), 'a');
    assert.ok(offsets.every((offset, i) => i === 0 || offset >= offsets[i - 1]));
  }
});

test('partially consumed tabs in fenced blocks retain source boundaries for the code', () => {
  for (const indent of [' ', '  ', '   ']) {
    const body = indent + '```\n\tfirst\n' + indent + '```';
    const value = ' '.repeat(4 - indent.length) + 'first\n';
    const offsets = renderedOffsets(body, value);
    const first = value.indexOf('first');
    assert.equal(body.slice(offsets[first], offsets[first + 5]), 'first');
    assert.equal(body.slice(offsets[0], offsets[first]), '\t');
    assert.ok(offsets.every((offset, i) => i === 0 || offset >= offsets[i - 1]));
  }
});

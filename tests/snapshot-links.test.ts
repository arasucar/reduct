import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {decode,encode} from '../src/model.js';
import {DocumentMarkdown} from '../web/DocumentMarkdown';

const record=(id:string,type:string,file:string,parent?:string,body='',extra:Record<string,unknown>={})=>decode(encode({schema_version:1,id,type,title:id,...(parent?{parent}:{}),...extra},body),file);
test('links in saved versions use the original document folder, with legacy and retained paths',()=>{
  const original=record('WORK','work','modules/settings/features/language/work/change/work.md','FEATURE');
  const analysis=record('ANALYSIS','analysis','modules/settings/features/language/work/change/analysis.md','WORK');
  const feature=record('FEATURE','feature','modules/settings/features/language/feature.md','AREA');
  const body='[Analysis](analysis.md) and [Feature](../../feature.md) and [External](https://example.com).';
  const saved=record('REV','snapshot','modules/settings/features/language/work/change/revisions/REV.md','WORK',body);
  for(const doc of [saved,{...saved,meta:{...saved.meta,source_path:original.path}}]) {
    const html=renderToStaticMarkup(React.createElement(DocumentMarkdown,{doc,docs:[original,analysis,feature,doc],choose:()=>{}}));
    assert.equal((html.match(/class="document-link"/g)??[]).length,2);
    assert.ok(!html.includes('href="analysis.md"'));
    assert.ok(!html.includes('href="../../feature.md"'));
    assert.ok(html.includes('href="https://example.com"'));
    assert.equal(doc.body,body);
  }
});

test('a snapshot retains its original link base if the source document moves',()=>{
  const sourcePath='modules/settings/work/old/work.md';
  const current=record('WORK','work','modules/settings/work/new/work.md','AREA');
  const analysis=record('ANALYSIS','analysis','modules/settings/work/old/analysis.md','WORK');
  const saved=record('REV','snapshot','modules/settings/work/old/revisions/REV.md','WORK','[Analysis](analysis.md)',{source_path:sourcePath});
  const html=renderToStaticMarkup(React.createElement(DocumentMarkdown,{doc:saved,docs:[current,analysis,saved],choose:()=>{}}));
  assert.ok(html.includes('class="document-link"'));
  assert.ok(!html.includes('href="analysis.md"'));
});

test('rebasing imported Markdown preserves labels, code, references, images, and URL suffixes',async()=>{
  const {rebaseMarkdownLinks}=await import('../src/markdown-links.js');
  const source='modules/alpha/features/export/bugs/failure/documents/logs/doc.md';
  const target='modules/alpha/features/export/bugs/failure/bug.md';
  const body='[~~Feature~~](../../../../feature.md?view=full#rules "Details")\n\n[Feature][ref]\n\n[ref]: ../../../../feature.md\n\n[Local section](#details)\n\n[![image](./image.png)](../../../../feature.md)\n\n[External](https://example.com) and [Source](code:src/export.ts)\n\n`[literal](./unchanged.md)`\n\n```md\n[example](./unchanged.md)\n## Plan\n```\n';
  const rebased=rebaseMarkdownLinks(body,source,target);
  assert.ok(rebased.includes('[~~Feature~~](../../feature.md?view=full#rules "Details")'));
  assert.ok(rebased.includes('[ref]: ../../feature.md'));
  assert.ok(rebased.includes('[Local section](documents/logs/doc.md#details)'));
  assert.ok(rebased.includes('[![image](documents/logs/image.png)](../../feature.md)'));
  assert.ok(rebased.includes('[External](https://example.com) and [Source](code:src/export.ts)'));
  assert.ok(rebased.includes('`[literal](./unchanged.md)`'));
  assert.ok(rebased.includes('```md\n[example](./unchanged.md)\n## Plan\n```'));
});

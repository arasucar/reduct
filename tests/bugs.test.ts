import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { initFixture } from './helpers.js';
import { encode } from '../src/model.js';
import { syncWorkspace } from '../src/upgrade.js';
import { summarizeWork } from '../src/workflow.js';
import { visibleTreeRecords } from '../src/tree.js';

async function fixture(t:{after:(fn:()=>Promise<void>)=>void}) {
  const repo=await fs.mkdtemp(path.join(os.tmpdir(),'reduct-bugs-'));
  t.after(()=>fs.rm(repo,{recursive:true,force:true}));
  return {repo,store:await initFixture(repo)};
}

test('one Feature-owned Bug holds the report and evidence without separate documents',async t=>{
  const {store,repo}=await fixture(t);
  const feature=await store.create('feature','Export','MODULE-alpha');
  const bug=await store.create('bug','Empty export',feature.meta.id);
  assert.equal(bug.meta.parent,feature.meta.id);
  await assert.rejects(store.create('bug_document','Reproduction',bug.meta.id),/documentation belongs in the Bug/);
  assert.match(bug.path,/features\/export\/bugs\/empty-export\/bug.md$/);
  await assert.rejects(store.create('bug','Wrong home','MODULE-alpha'),/Invalid parent/);
  await assert.rejects(store.create('bug_document','Wrong home',feature.meta.id),/documentation belongs in the Bug/);
  await assert.rejects(store.create('work','Duplicate bug','MODULE-alpha','bug'),/Create a bug/);
  await assert.rejects(store.create('analysis','Separate bug analysis',bug.meta.id),/Invalid parent/);
  await assert.rejects(store.create('implementation','Separate bug handoff',bug.meta.id),/Invalid parent/);
  const thread=await store.comment(bug.meta.id,bug.hash,'Please include a failing example.','',{name:'Owner',email:'owner@example.test'});
  const version=await store.snapshot(bug.meta.id,bug.hash);
  assert.equal(version.body,bug.body);
  assert.equal((await store.briefing(bug.meta.id)).openThreads,1);
  const context=await store.compactContext(feature.meta.id,{},true);
  for(const record of [bug,thread])assert.ok(context.includes(record.meta.id));
  assert.ok(!(await store.load()).docs.some(d=>d.meta.type==='work'));
  // CLI authoring and status tracking do not require Work commands.
  const cli=fileURLToPath(new URL('../src/cli.ts',import.meta.url));
  const run=(...args:string[])=>spawnSync(process.execPath,['--import',import.meta.resolve('tsx'),cli,...args,'--repo',repo,'--agent','Agent'],{encoding:'utf8'});
  const update=run('update-bug',bug.meta.id,'--hash',bug.hash,'--status','in_progress');
  assert.equal(update.status,0,update.stderr);
  const current=await store.get(bug.meta.id);assert.equal(current.meta.status,'in_progress');
  assert.deepEqual(current.meta.affected_features,[feature.meta.id]);
  const created=run('create','bug_document','--title','Logs','--parent',bug.meta.id);
  assert.equal(created.status,1);assert.match(created.stderr,/documentation belongs in the Bug/);
  assert.deepEqual((await store.load()).errors,[]);
});

test('Bug completion requires fix evidence and Feature reconciliation, and hides the entire closed branch',async t=>{
  const {store}=await fixture(t);
  const feature=await store.create('feature','Search','MODULE-alpha');
  let bug=await store.create('bug','Missing results',feature.meta.id);
  const version=await store.snapshot(bug.meta.id,bug.hash);
  await assert.rejects(store.finishWork(bug.meta.id,bug.hash,'passed'),/outcome/);
  bug=await store.saveBody(bug.meta.id,'# Missing results\n\n## Plan\nPreserve filters.\n\n## Implementation outcome\nResults now include matches.\n\n## Verification results\nExecuted the regression check; it passed.\n',bug.hash);
  await assert.rejects(store.finishWork(bug.meta.id,bug.hash,'passed'),/each affected feature/);
  const updates=[{id:feature.meta.id,hash:feature.hash,reason:'No change to intended search behavior.'}];
  bug=await store.finishWork(bug.meta.id,bug.hash,'pending',undefined,updates);
  assert.equal(bug.meta.status,'awaiting_verification');
  bug=await store.finishWork(bug.meta.id,bug.hash,'passed',undefined,updates);
  const docs=(await store.load()).docs;
  assert.deepEqual(summarizeWork(bug,docs).affectedFeatureIds,[feature.meta.id]);
  const visible=visibleTreeRecords(docs,false);
  assert.ok(visible.some(d=>d.meta.id===feature.meta.id));
  for(const record of [bug,version])assert.ok(!visible.some(d=>d.meta.id===record.meta.id));
  assert.ok(visibleTreeRecords(docs,true).some(d=>d.meta.id===version.meta.id));
});

test('sync converts legacy bug Works without breaking links, child records, discussions, or immutable versions',async t=>{
  const {store,repo}=await fixture(t);
  const feature=await store.create('feature','Legacy','MODULE-alpha');
  let work=await store.create('work','Old bug','MODULE-alpha');
  const analysis=await store.create('analysis','Evidence',work.meta.id);
  const snapshot=await store.snapshot(work.meta.id,work.hash);
  const thread=await store.comment(work.meta.id,work.hash,'Keep this evidence.','',{name:'Owner',email:'owner@example.test'});
  await store.write(work.path,encode({...work.meta,work_kind:'bug',affected_features:[feature.meta.id]},work.body),work.hash);
  const result=await syncWorkspace(repo);
  work=await store.get(work.meta.id);
  assert.equal(work.meta.type,'bug');assert.equal(work.meta.parent,feature.meta.id);
  assert.equal(work.path,snapshot.meta.source_path);
  assert.ok(result.updated.includes(work.path));
  assert.equal((await store.get(analysis.meta.id)).meta.parent,work.meta.id);
  assert.equal((await store.get(snapshot.meta.id)).hash,snapshot.hash);
  assert.equal((await store.get(thread.meta.id)).hash,thread.hash);
  assert.deepEqual((await store.load()).errors,[]);
  await syncWorkspace(repo);assert.deepEqual((await store.load()).errors,[]);
  const other=await store.create('feature','Cross-module owner','MODULE-beta');
  const cross=await store.create('work','Cross-module bug','MODULE-alpha');
  await store.write(cross.path,encode({...cross.meta,work_kind:'bug',affected_features:[other.meta.id]},cross.body),cross.hash);
  await syncWorkspace(repo);
  assert.equal((await store.get(cross.meta.id)).meta.parent,other.meta.id);
  assert.deepEqual((await store.load()).errors,[]);
  const ambiguous=await store.create('work','Unlinked bug','MODULE-alpha');
  await store.write(ambiguous.path,encode({...ambiguous.meta,work_kind:'bug'},ambiguous.body),ambiguous.hash);
  assert.ok((await syncWorkspace(repo)).skipped.some(s=>s.includes(ambiguous.meta.id)));
  assert.equal((await store.get(ambiguous.meta.id)).meta.type,'work');
});


test('sync folds discontinued bug documents into the Bug once and preserves archived evidence',async t=>{
  const {store,repo}=await fixture(t);
  const feature=await store.create('feature','Import','MODULE-alpha');
  const bug=await store.create('bug','Old evidence',feature.meta.id);
  const evidencePath=path.join(path.dirname(bug.path),'documents','logs','bug_document.md');
  await store.write(evidencePath,encode({schema_version:1,id:'BUG_DOCUMENT-legacy',type:'bug_document',title:'Legacy logs',parent:bug.meta.id,status:'draft'},'# Legacy logs\n\nUnique reproduction evidence.\n'),null);
  const evidence=await store.get('BUG_DOCUMENT-legacy');
  const version=await store.snapshot(evidence.meta.id,evidence.hash);
  const thread=await store.comment(evidence.meta.id,evidence.hash,'Keep the complete logs.','',{name:'Owner',email:'owner@example.test'});
  await syncWorkspace(repo);
  const imported=await store.get(bug.meta.id),archived=await store.get(evidence.meta.id);
  assert.ok(imported.body.includes('Unique reproduction evidence.'));
  assert.equal(archived.body,evidence.body);assert.equal(archived.meta.merged_into,bug.meta.id);
  assert.equal((await store.get(version.meta.id)).hash,version.hash);
  assert.equal((await store.get(thread.meta.id)).hash,thread.hash);
  await assert.rejects(store.saveBody(archived.meta.id,'Change it',archived.hash),/parent Bug/);
  assert.ok(!visibleTreeRecords((await store.load()).docs,false).some(d=>d.meta.id===archived.meta.id));
  assert.ok(visibleTreeRecords((await store.load()).docs,true).some(d=>d.meta.id===archived.meta.id));
  await syncWorkspace(repo);
  assert.equal((await store.get(bug.meta.id)).hash,imported.hash);
  assert.deepEqual((await store.load()).errors,[]);
});

test('legacy fix plans and analysis consolidate into the Bug with working Feature links',async t=>{
  const React=await import('react');
  const {renderToStaticMarkup}=await import('react-dom/server');
  const {DocumentMarkdown}=await import('../web/DocumentMarkdown.js');
  const {markdownSection}=await import('../src/document-content.js');
  const {store,repo}=await fixture(t);
  const feature=await store.create('feature','Export','MODULE-alpha');
  const work=await store.create('work','Legacy export bug','MODULE-alpha');
  let plan=await store.create('plan','Export repair',work.meta.id);
  plan=await store.saveBody(plan.meta.id,'# Export repair\n\n## Decisions\nPreserve existing filters.\n\n## Proposed behavior\nUnique essential fix instructions.\n',plan.hash);
  let analysis=await store.create('analysis','Export evidence',work.meta.id);
  const relative=path.relative(path.dirname(analysis.path),feature.path);
  analysis=await store.saveBody(analysis.meta.id,`# Export evidence\n\nUnique reproduction evidence. [Feature reference](${relative})\n\n\`\`\`md\n## Plan\nKeep code examples unchanged.\n\`\`\`\n`,analysis.hash);
  const reviewed=await store.comment(plan.meta.id,plan.hash,'Keep filters unchanged.','',{name:'Owner',email:'owner@example.test'});
  await store.write(work.path,encode({...work.meta,work_kind:'bug',affected_features:[feature.meta.id]},work.body),work.hash);
  await syncWorkspace(repo);
  const bug=await store.get(work.meta.id),docs=(await store.load()).docs;
  assert.ok(markdownSection(bug.body,['plan']).includes('Unique essential fix instructions.'));
  assert.ok(markdownSection(bug.body,['decisions']).includes('Preserve existing filters.'));
  assert.ok(bug.body.includes('Unique reproduction evidence.'));
  assert.ok(bug.body.includes('```md\n## Plan\nKeep code examples unchanged.\n```'));
  assert.deepEqual(summarizeWork(bug,docs).planIds,[]);
  assert.deepEqual(summarizeWork(bug,docs).analysisIds,[]);
  for(const source of [plan,analysis]) {
    const archived=await store.get(source.meta.id);
    assert.equal(archived.body,source.body);assert.equal(archived.meta.merged_into,bug.meta.id);
    assert.ok(!visibleTreeRecords(docs,false).some(d=>d.meta.id===source.meta.id));
    await assert.rejects(store.saveBody(archived.meta.id,'Change it',archived.hash),/parent Bug/);
  }
  assert.equal((await store.get(reviewed.meta.id)).hash,reviewed.hash);
  const html=renderToStaticMarkup(React.createElement(DocumentMarkdown,{doc:bug,docs,choose:()=>{}}));
  assert.ok(!html.includes(`href="${relative}"`));
  assert.equal((html.match(/class="document-link"/g)??[]).length,3);
  await syncWorkspace(repo);assert.equal((await store.get(bug.meta.id)).hash,bug.hash);
  assert.deepEqual((await store.load()).errors,[]);
});

test('Bugs appear on every affected Feature while retaining one owner and respecting history',async t=>{
  const {bugsAffectingFeature}=await import('../src/tree.js');
  const {store}=await fixture(t);
  const owner=await store.create('feature','Owner','MODULE-alpha');
  const other=await store.create('feature','Affected','MODULE-beta');
  let bug=await store.create('bug','Shared problem',owner.meta.id);
  bug=await store.updateWork(bug.meta.id,bug.hash,{status:'in_progress',workflow_mode:'simple',affected_features:[other.meta.id]});
  let docs=(await store.load()).docs;
  for(const feature of [owner,other])assert.deepEqual(bugsAffectingFeature(docs,feature.meta.id).map(d=>d.meta.id),[bug.meta.id]);
  assert.equal(bug.meta.parent,owner.meta.id);
  bug=await store.updateWork(bug.meta.id,bug.hash,{status:'rejected',workflow_mode:'simple',affected_features:[other.meta.id]});
  docs=(await store.load()).docs;
  assert.deepEqual(bugsAffectingFeature(docs,other.meta.id),[]);
  assert.deepEqual(bugsAffectingFeature(docs,other.meta.id,true).map(d=>d.meta.id),[bug.meta.id]);
});

test('sync repairs previously imported evidence without duplicating it or overwriting edited imports',async t=>{
  const {store,repo}=await fixture(t);
  const feature=await store.create('feature','Previous imports','MODULE-alpha');
  let bug=await store.create('bug','Imported earlier',feature.meta.id);
  const sourcePath=path.join(path.dirname(bug.path),'documents','logs','bug_document.md');
  const sourceBody='# Reproduction\n\n[Feature](../../../../feature.md)\n';
  await store.write(sourcePath,encode({schema_version:1,id:'BUG_DOCUMENT-previous',type:'bug_document',title:'Previous evidence',parent:bug.meta.id,status:'superseded',merged_into:bug.meta.id},sourceBody),null);
  const legacy=await store.get('BUG_DOCUMENT-previous');
  const relative=path.relative(path.dirname(bug.path),sourcePath);
  const previous=`## Imported evidence: Previous evidence\n\nOriginal source: [${legacy.meta.id}](<${relative}>). Relative references below retain the original source context.\n\n${sourceBody}`;
  await store.write(bug.path,encode({...bug.meta,imported_bug_documents:[{id:legacy.meta.id,hash:'retained-original-hash'}]},bug.body+'\n'+previous),bug.hash);
  await syncWorkspace(repo);
  bug=await store.get(bug.meta.id);
  assert.ok(bug.body.includes('[Feature](../../feature.md)'));
  assert.ok(!bug.body.includes('[Feature](../../../../feature.md)'));
  assert.equal(bug.body.split('Imported evidence: Previous evidence').length-1,1);
  assert.equal((await store.get(legacy.meta.id)).hash,legacy.hash);
  await syncWorkspace(repo);assert.equal((await store.get(bug.meta.id)).hash,bug.hash);
  const edited=await store.create('bug','Edited import',feature.meta.id);
  const editedPath=path.join(path.dirname(edited.path),'documents','logs','bug_document.md');
  await store.write(editedPath,encode({...legacy.meta,id:'BUG_DOCUMENT-edited',parent:edited.meta.id,merged_into:edited.meta.id},sourceBody),null);
  const ownerBody=edited.body+'\n## Imported evidence\nOwner changed the imported text.\n';
  await store.write(edited.path,encode({...edited.meta,imported_bug_documents:[{id:'BUG_DOCUMENT-edited',hash:'old-hash'}]},ownerBody),edited.hash);
  const result=await syncWorkspace(repo);
  assert.ok(result.skipped.some(message=>message.includes('BUG_DOCUMENT-edited')));
  assert.equal((await store.get(edited.meta.id)).body,ownerBody);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initFixture as init } from './helpers.js';

test('comments and submission preserve full versions without repeated unchanged snapshots',async t=>{
  const repo=await fs.mkdtemp(path.join(os.tmpdir(),'reduct-review-'));t.after(()=>fs.rm(repo,{recursive:true,force:true}));
  const store=await init(repo);const feature=await store.create('feature','Search','MODULE-delta');
  const author={name:'Owner',email:'owner@example.test'};
  const comment=await store.comment(feature.meta.id,feature.hash,'Clarify behavior.','',author);
  const saved=await store.get(String(comment.meta.target_revision));assert.equal(saved.body,feature.body);assert.equal(saved.meta.source_hash,feature.hash);
  await store.comment(feature.meta.id,feature.hash,'Another question.','',author);
  assert.equal((await store.load()).docs.filter(d=>d.meta.type==='snapshot'&&d.meta.parent===feature.meta.id).length,1);
  const work=await store.create('work','Search improvement',feature.meta.id,'investigation');assert.equal(work.meta.work_kind,'investigation');
  const plan=await store.create('plan','Review search',work.meta.id);const submitted=await store.submitReview(plan.meta.id,plan.hash);
  assert.equal(submitted.meta.status,'ready_for_review');
  assert.ok((await store.load()).docs.some(d=>d.meta.type==='snapshot'&&d.meta.source_hash===submitted.hash));
  const revised=await store.saveBody(plan.meta.id,submitted.body+'\nNew alternative.\n',submitted.hash);assert.equal(revised.meta.status,'draft');
  assert.deepEqual((await store.load()).errors,[]);
});

test('implementation brief has its own source version and approval; copying excludes planning language',async t=>{
  const repo=await fs.mkdtemp(path.join(os.tmpdir(),'reduct-brief-'));t.after(()=>fs.rm(repo,{recursive:true,force:true}));
  const store=await init(repo);const work=await store.create('work','Repair','MODULE-alpha');const plan=await store.create('plan','Review repair',work.meta.id);
  const review=await store.saveBody(plan.meta.id,'# Review\n\nIf blocking is approved, change deletion.\n\nConfirm the policy in owner review.\n',plan.hash);
  const brief=await store.create('implementation','Implement repair',work.meta.id);
  const source=await store.get(String(brief.meta.source_revision_id));assert.equal(source.meta.source_hash,review.hash);
  assert.ok(!brief.body.includes('If blocking is approved'));assert.equal(brief.meta.status,'draft');
  const author={name:'Owner',email:'owner@example.test'};
  await assert.rejects(store.readyBrief(brief.meta.id,brief.hash,author),/Fill in/);
  const body='# Implement repair\n\n## Accepted behavior\nReject deletion during active Calendar work.\n\n## Implementation tasks\nAdd the reservation guard.\n\n## Acceptance criteria\nRejected deletion preserves the asset and links.\n';
  const written=await store.saveBody(brief.meta.id,body,brief.hash);
  const approved=await store.readyBrief(written.meta.id,written.hash,author);assert.equal(approved.meta.status,'ready_for_handoff');
  const copied=(await store.briefing(approved.meta.id)).text;
  assert.ok(copied.includes('Implementation handoff'));assert.ok(!copied.includes('Confirm the policy'));assert.ok(!copied.includes('If blocking is approved'));
  const edited=await store.saveBody(approved.meta.id,body+'\nA changed task.\n',approved.hash);
  assert.equal(edited.meta.status,'draft');assert.equal(edited.meta.approved_by,undefined);
  assert.ok((await store.briefing(edited.meta.id)).text.includes('No separate approval record is required'));
  assert.deepEqual((await store.load()).errors,[]);
});

test('routine retention creates one revision per text change and preserves explicit checkpoints',async t=>{
  const {Store}=await import('../src/store.js');
  const repo=await fs.mkdtemp(path.join(os.tmpdir(),'reduct-revision-noise-'));t.after(()=>fs.rm(repo,{recursive:true,force:true}));
  const store=await init(repo);
  const work=await store.create('work','Revision policy','MODULE-alpha');
  const submitted=await store.submitReview(work.meta.id,work.hash);
  const versions=async()=>(await store.load()).docs.filter(d=>d.meta.type==='snapshot'&&d.meta.parent===work.meta.id);
  assert.equal((await versions()).length,1);
  assert.equal((await store.submitReview(submitted.meta.id,submitted.hash)).hash,submitted.hash);
  assert.equal((await versions()).length,1);
  const writer=new Store(repo,'Agent','Routine attribution update');
  const attributed=await writer.saveBody(submitted.meta.id,submitted.body,submitted.hash);
  assert.notEqual(attributed.hash,submitted.hash);
  const comment=await writer.comment(attributed.meta.id,attributed.hash,'Clarify the scope.','',{name:'Owner',email:'owner@example.test'});
  assert.equal((await versions()).length,1);
  assert.equal(comment.meta.target_hash,attributed.hash);
  assert.equal((await store.get(String(comment.meta.target_revision))).body,attributed.body);
  // Explicit checkpoints keep exact metadata even when text is unchanged.
  const checkpoint=await writer.snapshot(attributed.meta.id,attributed.hash,'agent_checkpoint');
  assert.equal(checkpoint.meta.source_hash,attributed.hash);
  assert.equal((await versions()).length,2);
  const changed=await writer.saveBody(attributed.meta.id,attributed.body+'\n## Scope\nA new requirement.\n',attributed.hash);
  const resubmitted=await writer.submitReview(changed.meta.id,changed.hash);
  assert.equal((await versions()).length,3);
  assert.equal((await writer.snapshot(resubmitted.meta.id,resubmitted.hash,'comment')).body,resubmitted.body);
  assert.equal((await versions()).length,3);
});

test('History groups old copies by document text while exact records remain readable',async t=>{
  const {distinctRevisions}=await import('../web/RevisionHistory.js');
  const repo=await fs.mkdtemp(path.join(os.tmpdir(),'reduct-history-groups-'));t.after(()=>fs.rm(repo,{recursive:true,force:true}));
  const store=await init(repo);
  const feature=await store.create('feature','History','MODULE-alpha');
  const original=await store.snapshot(feature.meta.id,feature.hash);
  const {encode}=await import('../src/model.js');
  await store.write(feature.path,encode({...feature.meta,status:'documented'},feature.body),feature.hash);
  const current=await store.get(feature.meta.id);
  const duplicate=await store.snapshot(current.meta.id,current.hash);
  const changed=await store.saveBody(current.meta.id,current.body+'\nDifferent text.\n',current.hash);
  const latest=await store.snapshot(changed.meta.id,changed.hash);
  assert.deepEqual(distinctRevisions([latest,duplicate,original]).map(d=>d.meta.id),[latest.meta.id,duplicate.meta.id]);
  assert.equal((await store.get(original.meta.id)).hash,original.hash);
});

test('handoff prefers the exact approval and only reuses semantically identical saved metadata',async t=>{
  const {Store}=await import('../src/store.js');
  const {encode}=await import('../src/model.js');
  const repo=await fs.mkdtemp(path.join(os.tmpdir(),'reduct-exact-handoff-'));t.after(()=>fs.rm(repo,{recursive:true,force:true}));
  const store=await init(repo);
  const work=await store.create('work','Fix export','MODULE-alpha');
  const template=await store.create('implementation','Export fix',work.meta.id);
  const brief=await store.saveBody(template.meta.id,'# Export fix\n\n## Accepted behavior\nFix large exports.\n\n## Implementation tasks\nCorrect the calculation.\n\n## Acceptance criteria\nLarge exports succeed.\n',template.hash);
  const owner={name:'Owner',email:'owner@example.test'};
  const first=await store.readyBrief(brief.meta.id,brief.hash,owner,'First approval.');
  const latest=await store.readyBrief(first.meta.id,first.hash,owner,'Latest approval.');
  // Filesystem order must not make an older same-body approval win.
  const load=store.load.bind(store);
  store.load=async()=>{const state=await load();state.docs.sort((a,b)=>Number(b.meta.source_hash===first.hash)-Number(a.meta.source_hash===first.hash));return state;};
  const exact=await store.shortBriefing(latest.meta.id);
  assert.ok(exact.text.includes(`REV-${latest.hash}`));assert.ok(!exact.text.includes(`REV-${first.hash}`));
  const writer=new Store(repo,'Agent','Attribution only');
  const attributed=await writer.saveBody(latest.meta.id,latest.body,latest.hash);
  assert.notEqual(attributed.hash,latest.hash);
  const fallback=await writer.shortBriefing(latest.meta.id);
  assert.ok(fallback.text.includes(`REV-${latest.hash}`));assert.ok(!fallback.text.includes(`REV-${first.hash}`));
  await store.write(attributed.path,encode({...attributed.meta,owner_decision:{instruction:'A different approval without a saved version.'}},attributed.body),attributed.hash);
  assert.ok(!(await store.shortBriefing(latest.meta.id)).text.includes('Saved version:'));
});

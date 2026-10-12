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

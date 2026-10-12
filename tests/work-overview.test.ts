import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initFixture as init } from './helpers.js';
import { encode, hash } from '../src/model.js';
import { briefPrepared } from '../src/document-content.js';
import { inspectBrief, summarizeWork } from '../src/workflow.js';
import { visibleTreeRecords } from '../src/tree.js';
import { serve } from '../src/server.js';
async function fixture(t:any) {
  const repo=await fs.mkdtemp(path.join(os.tmpdir(),'reduct-overview-'));t.after(()=>fs.rm(repo,{recursive:true,force:true}));
  const store=await init(repo);const a=await store.create('feature','Media','MODULE-alpha');const b=await store.create('feature','Canvas','MODULE-beta');
  const work=await store.create('work','Deletion repair',a.meta.id,'bug','simple');const plan=await store.create('plan','Review deletion',work.meta.id);
  return {store,a,b,work,plan};
}
test('work overview supports simple flow without analysis, cross-feature links, questions and real outcome evidence',async t=>{
  const {store,a,b,work,plan}=await fixture(t);
  const current=await store.saveBody(plan.meta.id,'# Review\n\n## Open questions\nShould deletion block Calendar work?\n',plan.hash);
  const updated=await store.updateWork(work.meta.id,work.hash,{workflow_mode:'simple',status:'needs_owner_decision',affected_features:[a.meta.id,b.meta.id]});
  await store.comment(current.meta.id,current.hash,'Explain the rejection behavior.','',{name:'Owner',email:'owner@example.test'});
  let state=await store.load();let overview=summarizeWork(updated,state.docs);
  assert.equal(overview.mode,'simple');assert.equal(overview.analysisIds.length,0);assert.equal(overview.stage,'needs_owner_decision');
  assert.deepEqual(overview.affectedFeatureIds.sort(),[a.meta.id,b.meta.id].sort());assert.equal(overview.openThreadIds.length,1);assert.ok(overview.questions[0].text.includes('Calendar'));
  assert.ok((await store.context(b.meta.id)).includes(work.meta.id));assert.ok((await store.briefing(b.meta.id)).text.includes(plan.path));
  assert.equal(overview.outcome,'');assert.equal(overview.verification,'');
  const result=await store.saveBody(work.meta.id,'# Repair\n\n## Implementation outcome\nGuard added; no schema changes.\n\n## Verification results\nSource checked. Device verification not run.\n',updated.hash);
  state=await store.load();overview=summarizeWork(result,state.docs);
  assert.ok(overview.outcome.includes('Guard added'));assert.ok(overview.verification.includes('not run'));
  await assert.rejects(store.updateWork(work.meta.id,updated.hash,{workflow_mode:'extended',status:'completed',affected_features:[]}),/changed/);
});
test('completed work and its documents hide together while features and review history remain recoverable',async t=>{
  const {store,a,b,work}=await fixture(t);
  const closed=await store.updateWork(work.meta.id,work.hash,{workflow_mode:'simple',status:'completed',affected_features:[b.meta.id]});
  const docs=(await store.load()).docs;const filtered=visibleTreeRecords(docs,false);
  assert.ok(filtered.some(d=>d.meta.id===a.meta.id));assert.ok(!filtered.some(d=>d.meta.id===closed.meta.id));
  assert.ok(!filtered.some(d=>d.meta.parent===closed.meta.id));
  assert.equal(visibleTreeRecords(docs,true).length,docs.length);
  assert.equal(summarizeWork(closed,docs).verification,'');
});
test('brief drift ignores metadata-only updates; body changes prevent silent ready handoff and reconciliation clears approval',async t=>{
  const {store,work,plan}=await fixture(t);
  const brief=await store.create('implementation','Implement deletion',work.meta.id);
  const body='# Implementation\n\nReject deletion during active Calendar work; preserve links.\n';
  const filled=await store.saveBody(brief.meta.id,body,brief.hash);const owner={name:'Owner',email:'owner@example.test'};
  const ready=await store.readyBrief(filled.meta.id,filled.hash,owner);
  await store.write(plan.path,encode({...plan.meta,status:'ready_for_review'},plan.body),plan.hash);
  assert.equal(inspectBrief(ready,(await store.load()).docs).drift,'current');
  const current=await store.get(plan.meta.id);const revised=await store.saveBody(current.meta.id,current.body+'\nA changed behavior requirement.\n',current.hash);
  let docs=(await store.load()).docs;assert.equal(inspectBrief(ready,docs).drift,'changed');
  assert.equal(summarizeWork(await store.get(work.meta.id),docs).stage,'brief_needs_update');
  await assert.rejects(store.readyBrief(ready.meta.id,ready.hash,owner),/changed/);
  assert.ok((await store.briefing(ready.meta.id)).text.includes('Do not execute this draft'));
  await assert.rejects(store.refreshBriefSource(ready.meta.id,ready.hash,current.hash),/changed/);
  const reconciled=await store.refreshBriefSource(ready.meta.id,ready.hash,revised.hash);
  assert.equal(reconciled.body,body);assert.equal(reconciled.meta.status,'draft');assert.equal(reconciled.meta.approved_body_hash,undefined);
  docs=(await store.load()).docs;assert.equal(inspectBrief(reconciled,docs).drift,'current');
  assert.ok(docs.some(d=>d.meta.type==='snapshot'&&d.meta.parent===ready.meta.id&&d.meta.source_hash===ready.hash));
  const tampered={...ready,body:'An unapproved direct-file edit.'};assert.notEqual(hash(tampered.body),tampered.meta.approved_body_hash);assert.equal(inspectBrief(tampered,docs).approvalValid,false);
});
test('manual handoff records an approved immutable version and is distinct from approval or launch',async t=>{
  const {store,work,plan}=await fixture(t);const brief=await store.create('implementation','Implement repair',work.meta.id);
  const filled=await store.saveBody(brief.meta.id,'# Implement\n\nPreserve shared media and add a focused check.\n',brief.hash);
  const owner={name:'Owner',email:'owner@example.test'};const ready=await store.readyBrief(filled.meta.id,filled.hash,owner);
  let state=await store.load();let summary=summarizeWork(await store.get(work.meta.id),state.docs);
  assert.equal(summary.handoffRevisionId,undefined);assert.equal(summary.approvedVersionIds.length,1);
  const planVersion=state.docs.find(d=>d.meta.type==='snapshot'&&d.meta.parent===plan.meta.id)!;
  await assert.rejects(store.recordHandoff(work.meta.id,work.hash,planVersion.meta.id,owner),/saved brief/);
  const updated=await store.recordHandoff(work.meta.id,work.hash,summary.approvedVersionIds[0],owner);
  summary=summarizeWork(updated,(await store.load()).docs);assert.equal(summary.handoffRevisionId,summary.approvedVersionIds[0]);
  assert.equal(updated.meta.status,'draft');assert.equal((updated.meta.handoffs as unknown[]).length,1);
  await store.saveBody(ready.meta.id,'# Later draft\n',ready.hash);
  const saved=await store.get(summary.handoffRevisionId!);assert.ok(saved.body.includes('Preserve shared media'));
});
test('reader workspace supplies overviews but rejects lifecycle updates',async t=>{
  const {store,work,b}=await fixture(t);const server=await serve(store,0);t.after(()=>new Promise<void>(resolve=>server.close(()=>resolve())));
  const address=server.address();assert.ok(address&&typeof address==='object');const base=`http://127.0.0.1:${address.port}`;
  const workspace=await (await fetch(base+'/api/workspace')).json();assert.equal(workspace.workOverviews[work.meta.id].mode,'simple');
  const input={id:work.meta.id,hash:work.hash,status:'review',workflow_mode:'extended',affected_features:[b.meta.id]};
  const headers={'Content-Type':'application/json','X-Reduct-Token':workspace.token};
  assert.equal((await fetch(base+'/api/work-settings',{method:'POST',headers,body:JSON.stringify(input)})).status,403);
  assert.equal((await fetch(base+'/api/work-settings',{method:'POST',headers,body:JSON.stringify(input)})).status,403);
  const updated=await (await fetch(base+'/api/workspace')).json();assert.equal(updated.workOverviews[work.meta.id].mode,'simple');assert.equal(updated.role,'reader');
  assert.ok(!updated.workOverviews[work.meta.id].affectedFeatureIds.includes(b.meta.id));
});

test('an unprepared implementation template leaves the work ready for plan review',async t=>{
  const {store,work,plan}=await fixture(t);
  const ready=await store.submitReview(plan.meta.id,plan.hash);
  const brief=await store.create('implementation','Deletion instructions',work.meta.id);
  const template=await store.saveBody(brief.meta.id,'# Instructions\n\n## Accepted behavior\n[Write settled behavior here.]\n\n## Implementation tasks\n[Write concrete tasks here.]\n',brief.hash);
  assert.equal(briefPrepared(template),false);
  assert.equal(summarizeWork(await store.get(work.meta.id),(await store.load()).docs).stage,'ready_for_review');
  const filled=await store.saveBody(template.meta.id,'# Instructions\n\nReject deletion during Calendar work; preserve links.\n',template.hash);
  assert.equal(briefPrepared(filled),true);
  assert.equal(summarizeWork(await store.get(work.meta.id),(await store.load()).docs).stage,'ready_for_implementation');
  assert.equal(ready.meta.status,'ready_for_review');
});

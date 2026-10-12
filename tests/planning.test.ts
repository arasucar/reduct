import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compareLines } from '../src/compare.js';
import { initFixture as init } from './helpers.js';
import { serve } from '../src/server.js';

test('line comparison is lossless for edits, duplicates, blank lines and large documents',()=>{
  const pairs=[['a\nb\nc','a\nnew\nc'],['same\nsame\n','same\n'],['','line'],['alpha','alpha'],[Array.from({length:1100},(_,i)=>`old-${i}`).join('\n'),Array.from({length:1100},(_,i)=>`new-${i}`).join('\n')]];
  for(const [before,after] of pairs) {
    const {lines}=compareLines(before,after);
    assert.equal(lines.filter(l=>l.kind!=='added').map(l=>l.text).join('\n'),before);
    assert.equal(lines.filter(l=>l.kind!=='removed').map(l=>l.text).join('\n'),after);
    const oldLines=lines.filter(l=>l.kind!=='added').map(l=>l.before);
    assert.deepEqual(oldLines,oldLines.map((_,i)=>i+1));
  }
  assert.equal(compareLines('a\nb','a\nc').lines.filter(l=>l.kind==='added')[0].text,'c');
  assert.equal(compareLines(pairs[4][0],pairs[4][1]).coarse,true);
});

test('comparison and briefing select the right plan revision, preserve open feedback, and reject stale focus',async t=>{
  const repo=await fs.mkdtemp(path.join(os.tmpdir(),'reduct-planning-'));
  t.after(()=>fs.rm(repo,{recursive:true,force:true}));
  const store=await init(repo);
  const feature=await store.create('feature','Media','MODULE-alpha');
  const work=await store.create('work','Deletion',feature.meta.id);
  const plan=await store.create('plan','Deletion plan',work.meta.id);
  const analysis=await store.create('analysis','Evidence',work.meta.id);
  const snapshot=await store.snapshot(plan.meta.id,plan.hash);
  const current=await store.saveBody(plan.meta.id,plan.body+'\nKeep global media.\n',plan.hash);
  const review=await store.comment(plan.meta.id,current.hash,'Check Calendar constraints.','', {name:'Owner',email:'owner@example.test'});
  const comparison=await store.compare(plan.meta.id,snapshot.meta.id);
  assert.equal(comparison.currentHash,current.hash);
  assert.ok(comparison.lines.some(l=>l.kind==='added'&&l.text==='Keep global media.'));
  const briefing=await store.briefing(plan.meta.id,current.hash);
  assert.ok(briefing.text.includes(analysis.path));assert.ok(briefing.text.includes('Check Calendar constraints.'));
  assert.equal(briefing.openThreads,1);assert.ok(briefing.text.includes('does not authorize implementation'));
  const featureBriefing=await store.briefing(feature.meta.id);
  assert.equal(featureBriefing.openThreads,1);assert.ok(featureBriefing.text.includes(plan.path));
  const snapshotBriefing=await store.briefing(snapshot.meta.id);
  assert.ok(snapshotBriefing.text.includes(snapshot.path));assert.ok(!snapshotBriefing.text.includes('Keep global media.'));
  assert.ok(snapshotBriefing.text.includes('may concern a newer draft'));
  await assert.rejects(store.briefing(plan.meta.id,plan.hash),/changed/);
  const other=await store.create('work','Other',feature.meta.id);const otherPlan=await store.create('plan','Other plan',other.meta.id);
  await assert.rejects(store.compare(otherPlan.meta.id,snapshot.meta.id),/this plan/);
  await store.reply(review.meta.id,review.hash,'Addressed.','resolve',{name:'Owner',email:'owner@example.test'},'agent','Planner');
  assert.equal((await store.briefing(plan.meta.id)).openThreads,0);
  const server=await serve(store,0);t.after(()=>new Promise<void>(resolve=>server.close(()=>resolve())));
  const address=server.address();assert.ok(address&&typeof address==='object');const base=`http://127.0.0.1:${address.port}`;
  const response=await fetch(`${base}/api/compare?id=${plan.meta.id}&revision=${snapshot.meta.id}`);assert.equal(response.status,200);assert.ok((await response.json()).added>0);
  const copied=await fetch(`${base}/api/briefing?id=${plan.meta.id}&hash=${current.hash}`);assert.equal(copied.status,200);
  assert.equal((await fetch(`${base}/api/briefing?id=${plan.meta.id}&hash=${plan.hash}`)).status,409);
});

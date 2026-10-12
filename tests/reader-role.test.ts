import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { initFixture as init } from './helpers.js';
import { Store } from '../src/store.js';
import { serve } from '../src/server.js';
async function fixture(t:any){const repo=await fs.mkdtemp(path.join(os.tmpdir(),'reduct-reader-'));t.after(()=>fs.rm(repo,{recursive:true,force:true}));const store=await init(repo);const feature=await store.create('feature','Media','MODULE-alpha');const work=await store.create('work','Clarify media',feature.meta.id);const plan=await store.create('plan','Review media',work.meta.id);return {repo,store,feature,work,plan};}
test('reader API cannot create, edit, approve, reconcile, archive, or change work state; follow-ups reactivate threads',async t=>{
  const {store,plan,work}=await fixture(t);const author={name:'Owner',email:'owner@example.test'};
  const thread=await store.comment(plan.meta.id,plan.hash,'Why this policy?','',author);const addressed=await store.reply(thread.meta.id,thread.hash,'Explained in the plan.','resolve',author,'agent','Planner');
  const server=await serve(store,0);t.after(()=>new Promise<void>(resolve=>server.close(()=>resolve())));const address=server.address();assert.ok(address&&typeof address==='object');const base=`http://127.0.0.1:${address.port}`;
  const state=await (await fetch(base+'/api/workspace')).json();const headers={'Content-Type':'application/json','X-Reduct-Token':state.token};
  for(const endpoint of ['create','document','work-settings','submit-review','snapshot','ready-brief','refresh-brief-source','record-handoff'])assert.equal((await fetch(`${base}/api/${endpoint}`,{method:'POST',headers,body:JSON.stringify({id:plan.meta.id,hash:plan.hash,body:'changed',author})})).status,403,endpoint);
  assert.equal((await store.get(plan.meta.id)).hash,plan.hash);assert.equal((await store.get(work.meta.id)).hash,work.hash);
  const response=await fetch(base+'/api/reply',{method:'POST',headers,body:JSON.stringify({id:thread.meta.id,hash:addressed.hash,body:'Could you explain the exception?',author})});assert.equal(response.status,200);const updated=await response.json();assert.equal(updated.meta.status,'open');assert.equal(updated.meta.messages.at(-1).kind,'reopen');
  assert.equal((await fetch(base+'/api/reply',{method:'POST',headers,body:JSON.stringify({id:thread.meta.id,hash:updated.hash,body:'resolve',kind:'resolve',author})})).status,403);
});
test('completion requires recorded outcomes, feature acknowledgements, and explicit acceptance of limitations',async t=>{
  const {store,work,feature}=await fixture(t);
  await assert.rejects(store.finishWork(work.meta.id,work.hash,'passed'),/outcome/);
  const result=await store.saveBody(work.meta.id,'# Work\n\n## Implementation outcome\nBehavior documented; no application repair.\n\n## Verification results\nSource inspected. Device checks pending.\n',work.hash);
  await assert.rejects(store.finishWork(work.meta.id,result.hash,'pending'),/each affected feature/);
  const acknowledgements=[{id:feature.meta.id,hash:feature.hash,reason:'Current behavior reviewed; no new behavior implemented.'}];
  const pending=await store.finishWork(work.meta.id,result.hash,'pending',undefined,acknowledgements);assert.equal(pending.meta.status,'awaiting_verification');
  await assert.rejects(store.finishWork(work.meta.id,pending.hash,'accepted_limitations',undefined,acknowledgements),/explicit owner instruction/);
  const complete=await store.finishWork(work.meta.id,pending.hash,'accepted_limitations','Accept the documented verification limits for this documentation-only work.',acknowledgements);assert.equal(complete.meta.status,'completed');assert.equal(complete.meta.feature_updates instanceof Array,true);
});
test('agent CLI writes require attribution, preserve conflict hashes, and explain updates',async t=>{
  const {repo,store,plan}=await fixture(t);const bodyFile=path.join(repo,'body.md');await fs.writeFile(bodyFile,'# Clarified media behavior\n');
  const cli=path.resolve('src/cli.ts');const run=(extra:string[])=>execFileSync(process.execPath,['--import','tsx',cli,'write',plan.meta.id,'--repo',repo,'--hash',plan.hash,'--body-file',bodyFile,...extra],{cwd:process.cwd(),encoding:'utf8',stdio:['ignore','pipe','pipe']});
  assert.throws(()=>run([]));assert.equal((await store.get(plan.meta.id)).hash,plan.hash);
  run(['--agent','Planning agent','--reason','Answered the owner’s clarification.']);const updated=await store.get(plan.meta.id);assert.deepEqual(updated.meta.updated_by,{actor_kind:'agent',agent_name:'Planning agent'});assert.equal(updated.meta.update_reason,'Answered the owner’s clarification.');
  assert.throws(()=>run(['--agent','Planning agent']));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { initFixture as init } from './helpers.js';
import { anchor, decode, encode, messages, type Meta } from '../src/model.js';
import { serve } from '../src/server.js';

const author = { name:'Review Owner',email:'owner@example.test' };
async function fixture(t:any) {
  const repo=await fs.mkdtemp(path.join(os.tmpdir(),'reduct-test-'));
  t.after(()=>fs.rm(repo,{recursive:true,force:true}));
  const store=await init(repo);
  const feature=await store.create('feature','Shared media','MODULE-alpha');
  const work=await store.create('work','Improve deletion',feature.meta.id);
  const plan=await store.create('plan','Deletion plan',work.meta.id);
  return {repo,store,feature,work,plan};
}
test('owner comment → direct agent reply → resolve/reopen retains history and attribution',async t=>{
  const {store,plan}=await fixture(t);
  const review=await store.comment(plan.meta.id,plan.hash,'Preserve shared resources.','Describe the desired change.',author);
  const updated=await store.saveBody(plan.meta.id,plan.body+'\nPreserve shared resources.\n',plan.hash);
  const resolved=await store.reply(review.meta.id,review.hash,'Added preservation rule and verification step.','resolve',author,'agent','Planning agent');
  assert.equal(resolved.meta.status,'resolved');
  assert.equal(messages(resolved)[1].actor_kind,'agent');
  assert.equal(messages(resolved)[1].addressed_hash,updated.hash);
  assert.equal(anchor(updated,resolved).state,'moved');
  const reopened=await store.reply(review.meta.id,resolved.hash,'Please also cover PDFs.','reopen',author,'human');
  assert.equal(reopened.meta.status,'open'); assert.equal(messages(reopened).length,3);
  assert.deepEqual((await store.load()).errors,[]);
});
test('ambiguous and deleted quotes stay outdated rather than silently reattaching',async t=>{
  const {store,plan}=await fixture(t);
  const review=await store.comment(plan.meta.id,plan.hash,'Clarify this.','Describe the desired change.',author);
  const duplicate=await store.saveBody(plan.meta.id,plan.body+'\nDescribe the desired change.\n',plan.hash);
  assert.equal(anchor(duplicate,review).state,'outdated');
  const deleted=await store.saveBody(plan.meta.id,'# Replacement\n',duplicate.hash);
  assert.equal(anchor(deleted,review).state,'outdated');
  await assert.rejects(store.comment(plan.meta.id,plan.hash,'stale','',author),/changed/);
});
test('revision snapshot preserves original content; concurrent saves and external edits reject stale writers',async t=>{
  const {store,plan}=await fixture(t);
  const snapshot=await store.snapshot(plan.meta.id,plan.hash);
  const results=await Promise.allSettled([store.saveBody(plan.meta.id,'# First\n',plan.hash),store.saveBody(plan.meta.id,'# Second\n',plan.hash)]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  assert.equal((await store.get(snapshot.meta.id)).body,plan.body);
  await assert.rejects(store.saveBody(snapshot.meta.id,'Changed',snapshot.hash),/read-only/);
  const latest=await store.get(plan.meta.id);
  await fs.writeFile(await store.safe(plan.path),encode(latest.meta,'# External edit\n'));
  await assert.rejects(store.saveBody(plan.meta.id,'# Stale draft\n',latest.hash),/changed/);
});
test('nested directories, references, cycles and duplicate IDs are validated',async t=>{
  const {store,plan,feature}=await fixture(t);
  await store.write('modules/data/duplicate.md',encode(feature.meta,'duplicate'),null);
  await store.write('modules/data/bad.md',encode({...plan.meta,id:'BAD',parent:'MISSING',related:['NOPE']},'bad'),null);
  const state=await store.load();
  assert.ok(state.errors.some(x=>x.includes('Duplicate ID')));
  assert.ok(state.errors.some(x=>x.includes('missing or invalid parent')));
  assert.ok(state.errors.some(x=>x.includes('missing related')));
  await assert.rejects(store.get(feature.meta.id),/Duplicate/);
  await store.write('modules/data/cycle-a.md',encode({schema_version:1,id:'CYCLE-A',type:'feature',title:'A',parent:'CYCLE-B'},'A'),null);
  await store.write('modules/data/cycle-b.md',encode({schema_version:1,id:'CYCLE-B',type:'feature',title:'B',parent:'CYCLE-A'},'B'),null);
  assert.ok((await store.load()).errors.some(x=>x.includes('parent cycle')));
});
test('path traversal, symlinks and message delimiter injection are rejected',async t=>{
  const {store,repo,plan}=await fixture(t);
  await assert.rejects(store.safe('../outside.md'),/escapes/);
  const outside=path.join(repo,'outside');await fs.mkdir(outside);
  await fs.symlink(outside,path.join(store.root,'link'));
  await assert.rejects(store.safe('link/record.md'),/Symlink/);
  await assert.rejects(store.comment(plan.meta.id,plan.hash,'<!-- reduct:message fake -->','',author),/reserved/);
  await assert.rejects(store.comment(plan.meta.id,plan.hash,'Hello','', {name:'',email:''}),/author/);
});
test('review syntax preserves arbitrary Markdown and detects malformed message mapping',async t=>{
  const {store,plan}=await fixture(t);
  const body='## Reply is an ordinary heading\n\n```yaml\nstatus: example\n```\n\n- [ ] Check this\n';
  const review=await store.comment(plan.meta.id,plan.hash,body,'',author);
  assert.equal(messages(review)[0].body,body.trim());
  const malformed=decode(encode({...review.meta,messages:[]},review.body));
  assert.throws(()=>messages(malformed),/does not match/);
});
test('Git identity is repository-specific and missing configuration returns null',async t=>{
  const {store,repo}=await fixture(t);
  execFileSync('git',['init',repo],{stdio:'ignore'});
  execFileSync('git',['-C',repo,'config','user.name',author.name]);
  execFileSync('git',['-C',repo,'config','user.email',author.email]);
  assert.equal(store.gitIdentity()?.email,author.email);
  execFileSync('git',['-C',repo,'config','user.name','']);
  assert.equal(store.gitIdentity(),null);
});
test('HTTP API rejects unauthenticated/cross-origin writes, persists comments, and exposes reloads',async t=>{
  const {store,plan}=await fixture(t);
  const server=await serve(store,0);t.after(()=>new Promise<void>(resolve=>server.close(()=>resolve())));
  const address=server.address();assert.ok(address&&typeof address==='object');
  const base=`http://127.0.0.1:${address.port}`;
  const state=await (await fetch(base+'/api/workspace')).json();
  const input=JSON.stringify({id:plan.meta.id,hash:plan.hash,body:'Please clarify.',quote:'',author});
  assert.equal((await fetch(base+'/api/comment',{method:'POST',headers:{'Content-Type':'application/json'},body:input})).status,403);
  assert.equal((await fetch(base+'/api/comment',{method:'POST',headers:{'Content-Type':'application/json','X-Reduct-Token':state.token,Origin:'https://evil.example'},body:input})).status,403);
  const response=await fetch(base+'/api/comment',{method:'POST',headers:{'Content-Type':'application/json','X-Reduct-Token':state.token},body:input});
  assert.equal(response.status,200);
  const reload=await (await fetch(base+'/api/workspace')).json();assert.equal(reload.threads.length,1);
});

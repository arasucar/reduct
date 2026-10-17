import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {init} from '../src/seed.js';
import {encode} from '../src/model.js';
import {typeLabels} from '../web/presentation';

test('new modules support features, work, comments, and saved versions',async t=>{
  const repo=await fs.mkdtemp(path.join(os.tmpdir(),'reduct-module-'));t.after(()=>fs.rm(repo,{recursive:true,force:true}));
  const store=await init(repo);
  const module=await store.create('module','Orders');
  assert.equal(module.meta.type,'module');assert.ok(module.meta.id.startsWith('MODULE-'));
  assert.equal(module.path,'modules/orders/module.md');
  const feature=await store.create('feature','Order tracking',module.meta.id);
  const work=await store.create('work','Order change',module.meta.id);
  const comment=await store.comment(module.meta.id,module.hash,'Clarify scope.','',{name:'Owner',email:'owner@example.test'});
  assert.equal(comment.meta.target_id,module.meta.id);
  const saved=await store.get(String(comment.meta.target_revision));
  assert.equal((await store.compare(module.meta.id,saved.meta.id)).added,0);
  assert.ok((await store.briefing(module.meta.id)).text.includes(feature.path));
  assert.ok((await store.context(work.meta.id)).includes(module.meta.id));
  assert.deepEqual((await store.load()).errors,[]);
});

test('the former parent type is rejected instead of being treated as a Module alias',async t=>{
  const repo=await fs.mkdtemp(path.join(os.tmpdir(),'reduct-module-only-'));t.after(()=>fs.rm(repo,{recursive:true,force:true}));
  const store=await init(repo);
  await assert.rejects(store.create('area','Old parent'),/record type/);
  await assert.rejects(store.write('modules/invalid/module.md',encode({schema_version:1,id:'INVALID',type:'area',title:'Invalid parent'},'# Invalid parent\n'),null),/invalid record metadata/);
  assert.equal(typeLabels.area,undefined);
  assert.equal(typeLabels.module,'Module');
  const module=await store.create('module','Orders');
  await assert.rejects(store.create('module','Nested module',module.meta.id),/Invalid parent/);
  const feature=await store.create('feature','Tracking',module.meta.id);
  assert.equal(feature.meta.parent,module.meta.id);
  assert.deepEqual((await store.load()).errors,[]);
});

test('Work always has a Module home and Feature documentation is optional at startup',async t=>{
  const repo=await fs.mkdtemp(path.join(os.tmpdir(),'reduct-work-home-'));t.after(()=>fs.rm(repo,{recursive:true,force:true}));
  const store=await init(repo);const module=await store.create('module','Orders');
  const work=await store.create('work','New behavior',module.meta.id);
  assert.equal(work.meta.parent,module.meta.id);
  assert.ok(work.path.startsWith('modules/orders/work/'));
  assert.ok(work.body.includes('### Implementation blockers'));
  assert.ok(work.body.includes('### Testing observations'));
  await store.updateWork(work.meta.id,work.hash,{workflow_mode:'simple',status:'in_progress',affected_features:[]});
  const feature=await store.create('feature','Tracking',module.meta.id);
  const linked=await store.create('work','Legacy caller',feature.meta.id);
  assert.equal(linked.meta.parent,module.meta.id);
  assert.deepEqual(linked.meta.affected_features,[feature.meta.id]);
  assert.ok(linked.path.startsWith('modules/orders/work/'));
  assert.deepEqual((await store.load()).errors,[]);
});

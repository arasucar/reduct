import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { initFixture as init } from './helpers.js';
import {syncWorkspace} from '../src/upgrade.js';
import {hash} from '../src/model.js';
import {version} from '../src/version.js';

test('guide updates preserve application instructions and all feature/discussion history',async t=>{
  const repo=await fs.mkdtemp(path.join(os.tmpdir(),'reduct-upgrade-'));t.after(()=>fs.rm(repo,{recursive:true,force:true}));
  await fs.writeFile(path.join(repo,'AGENTS.md'),'# App rules\nKeep these rules.\n');
  const store=await init(repo);
  const feature=await store.create('feature','Language','MODULE-gamma');
  await store.comment(feature.meta.id,feature.hash,'Question','',{name:'Owner',email:'owner@example.test'});
  const docs=(await store.load()).docs;
  const before=await Promise.all(docs.map(async d=>[d.path,await fs.readFile(path.join(store.root,d.path),'utf8')]));
  const file=path.join(store.root,'tool.json');const manifest=JSON.parse(await fs.readFile(file,'utf8'));manifest.version='0.0.1';
  await fs.writeFile(path.join(store.root,'agent/README.md'),'Old workflow\n');manifest.managed_files['agent/README.md']=hash('Old workflow\n');
  const agents=await fs.readFile(path.join(repo,'AGENTS.md'),'utf8');const oldBlock='<!-- reduct:application-agents -->\nOld application role\n<!-- /reduct:application-agents -->';
  await fs.writeFile(path.join(repo,'AGENTS.md'),agents.replace(/<!-- reduct:application-agents -->[\s\S]*?<!-- \/reduct:application-agents -->/,oldBlock)+'\n# Additional app rules\nKeep these too.\n');manifest.managed_files['application-agents-block']=hash(oldBlock);
  await fs.writeFile(file,JSON.stringify(manifest));
  const result=await syncWorkspace(repo);
  assert.equal(result.fromVersion,'0.0.1');assert.equal(result.version,version);
  assert.ok(result.updated.includes('agent/README.md'));assert.ok(result.updated.includes('application-agents-block'));
  const updated=await fs.readFile(path.join(repo,'AGENTS.md'),'utf8');assert.ok(updated.startsWith('# App rules\nKeep these rules.'));assert.ok(updated.endsWith('# Additional app rules\nKeep these too.\n'));
  for(const [relative,raw] of before)assert.equal(await fs.readFile(path.join(store.root,relative),'utf8'),raw);
});

test('sync preserves locally customized guides and rejects unknown workspace versions',async t=>{
  const repo=await fs.mkdtemp(path.join(os.tmpdir(),'reduct-custom-'));t.after(()=>fs.rm(repo,{recursive:true,force:true}));
  const store=await init(repo);const guide=path.join(store.root,'AGENTS.md');const custom='My custom planning instructions.\n';await fs.writeFile(guide,custom);
  const result=await syncWorkspace(repo);assert.ok(result.skipped.includes('AGENTS.md'));assert.equal(await fs.readFile(guide,'utf8'),custom);
  const file=path.join(store.root,'tool.json');const manifest=JSON.parse(await fs.readFile(file,'utf8'));manifest.schema_version=999;await fs.writeFile(file,JSON.stringify(manifest));
  await assert.rejects(syncWorkspace(repo),/Unsupported/);assert.equal(await fs.readFile(guide,'utf8'),custom);
});

test('sync rejects incompatible documents before modifying bundled guides',async t=>{
  const repo=await fs.mkdtemp(path.join(os.tmpdir(),'reduct-schema-'));t.after(()=>fs.rm(repo,{recursive:true,force:true}));
  const store=await init(repo);
  const target=path.join(store.root,'modules/gamma/module.md');
  const raw=await fs.readFile(target,'utf8');await fs.writeFile(target,raw.replace('schema_version: 1','schema_version: 999'));
  const guide=path.join(store.root,'agent/README.md');const before=await fs.readFile(guide,'utf8');
  await assert.rejects(syncWorkspace(repo),/Workspace validation failed/);
  assert.equal(await fs.readFile(guide,'utf8'),before);
});

test('sync adds an untracked guide and preserves custom or deleted managed copies',async t=>{
  const repo=await fs.mkdtemp(path.join(os.tmpdir(),'reduct-setup-upgrade-'));t.after(()=>fs.rm(repo,{recursive:true,force:true}));
  const store=await init(repo);
  const relative='agent/README.md',target=path.join(store.root,relative),file=path.join(store.root,'tool.json');
  const expected=await fs.readFile(target,'utf8');
  const manifest=JSON.parse(await fs.readFile(file,'utf8'));delete manifest.managed_files[relative];
  await fs.writeFile(file,JSON.stringify(manifest));await fs.unlink(target);
  const added=await syncWorkspace(repo);
  assert.ok(added.updated.includes(relative));assert.equal(await fs.readFile(target,'utf8'),expected);
  assert.equal((await store.load()).errors.length,0);
  await fs.writeFile(target,'Custom setup instructions.\n');
  const customized=await syncWorkspace(repo);
  assert.ok(customized.skipped.includes(relative));assert.equal(await fs.readFile(target,'utf8'),'Custom setup instructions.\n');
  await fs.unlink(target);
  const deleted=await syncWorkspace(repo);
  assert.ok(deleted.skipped.includes(relative));await assert.rejects(fs.access(target),{code:'ENOENT'});
});

test('an older full agent guide migrates to the compact entrypoint with a complete reference',async t=>{
  const repo=await fs.mkdtemp(path.join(os.tmpdir(),'reduct-guide-migration-'));t.after(()=>fs.rm(repo,{recursive:true,force:true}));
  const store=await init(repo);
  const manifestPath=path.join(store.root,'tool.json'),manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
  const referencePath='agent/reference/README.md',guidePath='agent/README.md';
  const full=await fs.readFile(path.join(store.root,referencePath),'utf8');
  await fs.writeFile(path.join(store.root,guidePath),full);
  manifest.managed_files[guidePath]=hash(full);delete manifest.managed_files[referencePath];
  await fs.unlink(path.join(store.root,referencePath));
  await fs.writeFile(manifestPath,JSON.stringify(manifest));
  const before=(await store.load()).docs;
  const migrated=await syncWorkspace(repo);
  assert.ok(migrated.updated.includes(referencePath));assert.ok(migrated.updated.includes(guidePath));
  assert.equal(await fs.readFile(path.join(store.root,referencePath),'utf8'),full);
  const compact=await fs.readFile(path.join(store.root,guidePath),'utf8');
  assert.ok(compact.length<full.length/3);
  for(const doc of before)assert.equal((await store.get(doc.meta.id)).hash,doc.hash);
  assert.deepEqual((await store.load()).errors,[]);
});

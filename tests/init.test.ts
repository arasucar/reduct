import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {init} from '../src/seed.js';
import {hash} from '../src/model.js';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('CLI confirms initialization of the current repository without agent attribution',async t=>{
  const repo=await fs.mkdtemp(path.join(os.tmpdir(),'reduct-init-cli-'));
  t.after(()=>fs.rm(repo,{recursive:true,force:true}));
  const cli=fileURLToPath(new URL('../src/cli.ts',import.meta.url));
  const result=spawnSync(process.execPath,['--import',import.meta.resolve('tsx'),cli,'init'],{cwd:repo,encoding:'utf8',input:'yes\n'});
  assert.equal(result.status,0,result.stderr);
  assert.ok(result.stdout.includes(path.join(repo,'.reduct')));
  assert.ok(result.stdout.includes('Continue? [y/N]'));
  assert.ok(result.stdout.includes(path.join(repo,'AGENTS.md')));
  await fs.access(path.join(repo,'.reduct/tool.json'));
  const repeated=spawnSync(process.execPath,['--import',import.meta.resolve('tsx'),cli,'init'],{cwd:repo,encoding:'utf8'});
  assert.equal(repeated.status,1);
  assert.match(repeated.stderr,/never overwrites/);
});

test('CLI leaves files untouched when initialization is declined or input ends',async t=>{
  const repo=await fs.mkdtemp(path.join(os.tmpdir(),'reduct-init-cancel-'));
  t.after(()=>fs.rm(repo,{recursive:true,force:true}));
  const cli=fileURLToPath(new URL('../src/cli.ts',import.meta.url));
  const instructions='# Existing application instructions\n';
  await fs.writeFile(path.join(repo,'AGENTS.md'),instructions);
  for(const input of ['no\n','\n','','maybe\n']) {
    const result=spawnSync(process.execPath,['--import',import.meta.resolve('tsx'),cli,'init'],{cwd:repo,encoding:'utf8',input});
    assert.equal(result.status,0,result.stderr);
    assert.match(result.stdout,/Initialization cancelled/);
    assert.deepEqual(await fs.readdir(repo),['AGENTS.md']);
    assert.equal(await fs.readFile(path.join(repo,'AGENTS.md'),'utf8'),instructions);
  }
});

test('initialization creates guides and version metadata but no product records',async t=>{
  const repo=await fs.mkdtemp(path.join(os.tmpdir(),'reduct-empty-'));
  t.after(()=>fs.rm(repo,{recursive:true,force:true}));
  await fs.writeFile(path.join(repo,'AGENTS.md'),'# Existing app rules\nKeep these.\n');
  const store=await init(repo);
  const state=await store.load();
  assert.deepEqual(state.errors,[]);
  assert.deepEqual(state.docs.map(doc=>doc.meta.type),['guide']);
  assert.deepEqual(await fs.readdir(path.join(store.root,'modules')),[]);
  const readme=await fs.readFile(path.join(store.root,'README.md'),'utf8');
  assert.ok(readme.includes('starts empty'));
  assert.ok(!readme.includes('modules/home'));
  const agents=await fs.readFile(path.join(repo,'AGENTS.md'),'utf8');
  assert.ok(agents.startsWith('# Existing app rules\nKeep these.\n'));
  assert.ok(agents.includes('<!-- reduct:application-agents -->'));
  const manifest=JSON.parse(await fs.readFile(path.join(store.root,'tool.json'),'utf8'));
  assert.equal(manifest.schema_version,1);
  const guide=await fs.readFile(path.join(store.root,'agent/README.md'),'utf8');
  assert.equal(guide,await fs.readFile(new URL('../README.md',import.meta.url),'utf8'));
  assert.equal(manifest.managed_files['agent/README.md'],hash(guide));
  const reader=state.docs.find(doc=>doc.meta.id==='GUIDE-ui')!;
  assert.match(reader.body,/Ask for clarification/);
  assert.doesNotMatch(reader.body,/## Development and release/);
  assert.equal(manifest.managed_files['help/how-to-use.md'],reader.hash);
  assert.deepEqual(await fs.readdir(path.join(store.root,'agent')),['README.md']);
  const module=await store.create('module','Orders');
  const feature=await store.create('feature','Order tracking',module.meta.id);
  assert.equal(feature.meta.parent,module.meta.id);
  await assert.rejects(init(repo),/never overwrites/);
  assert.equal((await store.get(feature.meta.id)).hash,feature.hash);
});

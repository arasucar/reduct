import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { initFixture } from './helpers.js';
import { Store } from '../src/store.js';
import { compactReview, readableRecord, recordIndex, changedLines, sections } from '../src/agent-output.js';
import { messages } from '../src/model.js';
import { readGuide } from '../src/guides.js';

async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const repo=await fs.mkdtemp(path.join(os.tmpdir(),'reduct-efficient-'));
  t.after(()=>fs.rm(repo,{recursive:true,force:true}));
  return {repo,store:await initFixture(repo)};
}
const cli=fileURLToPath(new URL('../src/cli.ts',import.meta.url));
function run(repo:string,...args:string[]) {
  return spawnSync(process.execPath,['--import',import.meta.resolve('tsx'),cli,...args,'--repo',repo],{encoding:'utf8'});
}

test('compact guides retain the complete reference and retrieve procedures independently',async()=>{
  const compact=await readGuide('readme'),full=await readGuide('reference');
  assert.ok(compact.length<full.length/3);
  for(const [topic,heading] of Object.entries({mapping:'Initial product mapping',roles:'Agent roles',workflow:'Agent workflow','planning-procedure':'Planning procedure',completion:'Implementation and completion procedure',formatting:'Document formatting',commands:'Commands'})) {
    const guide=await readGuide(topic);
    assert.ok(guide.startsWith(`${['mapping','roles','workflow'].includes(topic)?'##':'###'} ${heading}\n`));
    assert.ok(full.includes(guide));
  }
  assert.match(await readGuide('completion'),/accepted_limitations/);
  await assert.rejects(readGuide('unknown'),/Unknown guide topic/);
});

test('section reads and patches preserve exact surrounding content and reject ambiguous headings',async t=>{
  const {store,repo}=await fixture(t);
  const feature=await store.create('feature','Sections','MODULE-alpha');
  const body='# Sections\r\n\r\n## Behavior\r\n\r\nOriginal.\r\n\r\n```md\r\n## Behavior\r\nexample\r\n```\r\n\r\n## Evidence\r\n\r\nKeep this exactly.\r\n';
  const current=await store.saveBody(feature.meta.id,body,feature.hash);
  const read=readableRecord(current,'Behavior');
  assert.match(read,/partial read; hash covers the whole record/);
  assert.ok(read.endsWith(body.slice(body.indexOf('## Behavior'),body.indexOf('## Evidence'))));
  assert.equal(sections(body).filter(s=>s.title==='Behavior').length,1);
  const writer=new Store(repo,'Planner','Clarified behavior');
  const updated=await writer.patchBody(current.meta.id,current.hash,'Revised behavior.',{section:'Behavior'});
  assert.equal(updated.body,'# Sections\r\n\r\n## Behavior\r\n\nRevised behavior.\n\n## Evidence\r\n\r\nKeep this exactly.\r\n');
  assert.deepEqual(updated.meta.updated_by,{actor_kind:'agent',agent_name:'Planner'});
  assert.equal(updated.meta.update_reason,'Clarified behavior');
  await assert.rejects(writer.patchBody(current.meta.id,current.hash,'Stale.',{section:'Behavior'}),/changed/);
  await assert.rejects(writer.patchBody(updated.meta.id,updated.hash,'Missing.',{section:'Missing'}),/not found/);
  const duplicate=await writer.saveBody(updated.meta.id,'## Same\n\nOne\n\n## Same\n\nTwo\n',updated.hash);
  await assert.rejects(writer.patchBody(duplicate.meta.id,duplicate.hash,'No.',{section:'Same'}),/ambiguous/);
  assert.equal((await store.get(duplicate.meta.id)).hash,duplicate.hash);
});

test('exact passage updates reject empty, missing, overlapping duplicate matches and immutable history',async t=>{
  const {store}=await fixture(t);
  const feature=await store.create('feature','Passages','MODULE-alpha');
  const current=await store.saveBody(feature.meta.id,'# Passages\n\nUnique fact.\n\naaa\n',feature.hash);
  for(const match of ['', 'missing','aa'])await assert.rejects(store.patchBody(current.meta.id,current.hash,'replacement',{match}));
  assert.equal((await store.get(current.meta.id)).hash,current.hash);
  const snapshot=await store.snapshot(current.meta.id,current.hash);
  await assert.rejects(store.patchBody(snapshot.meta.id,snapshot.hash,'replacement',{match:'Unique fact.'}),/read-only/);
  const updated=await store.patchBody(current.meta.id,current.hash,'',{match:'Unique fact.'});
  assert.equal(updated.body,'# Passages\n\n\n\naaa\n');
  assert.equal((await store.get(snapshot.meta.id)).body,current.body);
});

test('HTML cannot supply false section boundaries or delete surrounding visible content',async t=>{
  const {store}=await fixture(t);
  const feature=await store.create('feature','Legacy markup','MODULE-alpha');
  const blocks=['<!--\n## Evidence\nHidden example.\n-->','<div>\n## Evidence\nHTML example.\n</div>','<script>\n## Evidence\nscript example\n</script>','<![CDATA[\n## Evidence\nexample\n]]>'];
  for(const block of blocks) {
    const latest=await store.get(feature.meta.id);
    const body=`# Legacy markup\n\n## Behavior\n\nVisible fact.\n\n${block}\n\nVisible continuation.\n\n## Sources\n\nsource.ts\n`;
    const current=await store.saveBody(latest.meta.id,body,latest.hash);
    assert.deepEqual(sections(body),[]);
    assert.throws(()=>readableRecord(current,'Evidence'),/HTML/);
    for(const title of ['Evidence','Behavior','Sources'])await assert.rejects(store.patchBody(current.meta.id,current.hash,'Replacement.',{section:title}),/HTML/);
    assert.equal((await store.get(current.meta.id)).hash,current.hash);
    assert.equal((await store.get(current.meta.id)).body,body);
    assert.ok(readableRecord(current).endsWith(body));
    const patched=await store.patchBody(current.meta.id,current.hash,'Revised fact.',{match:'Visible fact.'});
    assert.equal(patched.body,body.replace('Visible fact.','Revised fact.'));
  }
  const latest=await store.get(feature.meta.id);
  const body='# Example\n\n## Behavior\n\n<https://example.com>\n\n```html\n<!--\n## Evidence\n-->\n<div>example</div>\n```\n\n## Sources\n\nKeep exactly.\n';
  const current=await store.saveBody(latest.meta.id,body,latest.hash);
  assert.deepEqual(sections(body).map(s=>s.title),['Example','Behavior','Sources']);
  const patched=await store.patchBody(current.meta.id,current.hash,'Revised behavior.',{section:'Behavior'});
  assert.ok(patched.body.endsWith('## Sources\n\nKeep exactly.\n'));
});

test('compact historical plans and snapshots retain sibling evidence and unresolved reviews',async t=>{
  const {store}=await fixture(t);
  const feature=await store.create('feature','Historical context','MODULE-alpha');
  for(const status of ['completed','superseded','rejected']) {
    const work=await store.create('work',`History ${status}`,feature.meta.id,'investigation','extended');
    const plan=await store.create('plan',`Legacy plan ${status}`,work.meta.id);
    const analysis=await store.create('analysis',`Evidence ${status}`,work.meta.id);
    const review=await store.comment(analysis.meta.id,analysis.hash,'Unresolved evidence question.','',{name:'Owner',email:'owner@example.test'});
    const planVersion=await store.snapshot(plan.meta.id,plan.hash);
    const workVersion=await store.snapshot(work.meta.id,work.hash);
    await store.updateWork(work.meta.id,work.hash,{workflow_mode:'extended',status,affected_features:[feature.meta.id]});
    for(const target of [plan,planVersion,work,workVersion]) {
      const briefing=await store.briefing(target.meta.id),compact=await store.compactContext(target.meta.id);
      assert.equal(briefing.openThreads,1);
      for(const record of [analysis,review]) {assert.ok(briefing.text.includes(record.meta.id));assert.ok(compact.includes(record.meta.id));assert.ok(compact.includes(record.hash));}
      assert.ok(!compact.includes(analysis.body));
      if(target.meta.type==='snapshot')assert.ok(compact.includes(target.body));
    }
  }
});

test('the default guide accepts shared options without interpreting them as a topic',async t=>{
  const {repo}=await fixture(t);
  for(const args of [[],['--agent','Planner'],['--reason','Read instructions']]) {
    const result=run(repo,'guide',...args);
    assert.equal(result.status,0,result.stderr);
    assert.equal(result.stdout,(await readGuide('readme'))+'\n');
  }
  const topic=run(repo,'guide','completion');
  assert.equal(topic.status,0,topic.stderr);
  assert.equal(topic.stdout,(await readGuide('completion'))+'\n');
  assert.equal(run(repo,'guide','unknown').status,1);
});

test('patches use the same plan approval invalidation as full writes',async t=>{
  const {store}=await fixture(t);
  const feature=await store.create('feature','Plan','MODULE-alpha');
  const work=await store.create('work','Repair',feature.meta.id);
  const brief=await store.create('implementation','Repair brief',work.meta.id);
  const filled=await store.saveBody(brief.meta.id,'# Repair\n\n## Accepted behavior\n\nSettled repair.\n\n## Implementation tasks\n\nDeliver it.\n',brief.hash);
  const ready=await store.readyBrief(filled.meta.id,filled.hash,{name:'Owner',email:'owner@example.test'},'Implement this repair.');
  const updated=await store.patchBody(ready.meta.id,ready.hash,'Changed repair.',{section:'Accepted behavior'});
  assert.equal(updated.meta.status,'draft');
  assert.equal(updated.meta.approved_body_hash,undefined);
  assert.equal(updated.meta.approved_by,undefined);
  const draft=await store.get(work.meta.id);
  const before=await store.saveBody(draft.meta.id,draft.body+'\n## Implementation outcome\nPartial delivery retained.\n\n## Verification results\nExecuted check retained.\n',draft.hash);
  const changed=await store.patchBody(before.meta.id,before.hash,'Different plan.',{section:'Plan'});
  assert.equal(changed.meta.status,'draft');
  assert.equal(changed.body.slice(changed.body.indexOf('## Implementation outcome')),before.body.slice(before.body.indexOf('## Implementation outcome')));
  assert.equal((await store.contextRecords(work.meta.id)).find(d=>d.meta.id===updated.meta.id),undefined);
});

test('compact context includes cross-feature work, all discussions and hashes without dropping discoverability',async t=>{
  const {store}=await fixture(t);
  const a=await store.create('feature','A','MODULE-alpha'),b=await store.create('feature','B','MODULE-beta');
  const work=await store.create('work','Joint repair',a.meta.id);
  const current=await store.updateWork(work.meta.id,work.hash,{status:'planning',workflow_mode:'extended',affected_features:[a.meta.id,b.meta.id]});
  const analysis=await store.create('analysis','Findings',work.meta.id);
  const review=await store.comment(b.meta.id,b.hash,'Please preserve B.','',{name:'Owner',email:'owner@example.test'});
  const compact=await store.compactContext('MODULE-alpha');
  for(const d of [a,b,current,analysis,review]) {assert.ok(compact.includes(d.meta.id));assert.ok(compact.includes(d.hash));}
  assert.ok(!compact.includes(analysis.body));
  const known=await store.compactContext(a.meta.id,{[a.meta.id]:a.hash});
  assert.ok(!known.includes(a.body));assert.match(known,/unchanged/);
  const updated=await store.saveBody(a.meta.id,'# New A\n\nChanged.\n',a.hash);
  assert.ok((await store.compactContext(a.meta.id,{[a.meta.id]:a.hash})).includes(updated.body));
});

test('compact review and changed comparisons preserve evidence and all changed lines',async t=>{
  const {store}=await fixture(t);
  const feature=await store.create('feature','Reviewed','MODULE-alpha');
  const question='Distinct question about existing evidence.';
  const thread=await store.comment(feature.meta.id,feature.hash,question,'',{name:'Owner',email:'owner@example.test'});
  const compact=compactReview(thread);
  assert.deepEqual(compact.meta,thread.meta);assert.deepEqual(compact.messages,messages(thread));
  assert.equal(JSON.stringify(compact).split(question).length-1,1);
  const full=JSON.stringify({...thread,messages:messages(thread)});
  assert.ok(JSON.stringify(compact).length<full.length);
  const before=await store.saveBody(feature.meta.id,Array.from({length:100},(_,i)=>`Line ${i}`).join('\n'),feature.hash);
  const snapshot=await store.snapshot(before.meta.id,before.hash);
  await store.patchBody(before.meta.id,before.hash,'Changed line',{match:'Line 50'});
  const diff=await store.compare(before.meta.id,snapshot.meta.id),changes=changedLines(diff.lines);
  assert.deepEqual(changes.filter(l=>'kind' in l&&l.kind!=='same'),diff.lines.filter(l=>l.kind!=='same'));
  assert.ok(changes.length<diff.lines.length/5);
  assert.equal(changes.reduce((n,l)=>n+('omitted' in l?l.omitted:1),0),diff.lines.length);
  assert.throws(()=>changedLines(diff.lines,NaN),/integer/);
});

test('truncated full context exposes every record and full mode retains complete bodies',async t=>{
  const {store}=await fixture(t);
  const feature=await store.create('feature','Large','MODULE-alpha');
  const current=await store.saveBody(feature.meta.id,'# Large\n\n'+'Evidence.\n'.repeat(4000),feature.hash);
  const limited=await store.context(current.meta.id);
  assert.match(limited,/final body may be partial/);assert.match(limited,/Complete record manifest/);
  for(const d of await store.contextRecords(current.meta.id))assert.ok(limited.includes(d.hash));
  const full=await store.context(current.meta.id,true);
  assert.ok(full.includes(current.body));assert.doesNotMatch(full,/Context truncated/);
});

test('CLI discovery, batch reads, conditional receipts and guarded patching work end to end',async t=>{
  const {store,repo}=await fixture(t);
  const feature=await store.create('feature','Language','MODULE-alpha');
  const work=await store.create('work','Repair language',feature.meta.id);
  const listing=run(repo,'list','--type','feature','--parent','MODULE-alpha','--search','language');
  assert.equal(listing.status,0,listing.stderr);
  assert.deepEqual(JSON.parse(listing.stdout),[recordIndex(feature)]);
  const hashes=run(repo,'hash',`${feature.meta.id},${work.meta.id}`);
  assert.deepEqual(JSON.parse(hashes.stdout),{[feature.meta.id]:feature.hash,[work.meta.id]:work.hash});
  const known=path.join(repo,'known.json');await fs.writeFile(known,JSON.stringify({[feature.meta.id]:feature.hash}));
  const batch=run(repo,'read-many',`${feature.meta.id},${work.meta.id},${work.meta.id}`,'--known-file',known);
  assert.equal(batch.status,0,batch.stderr);
  assert.deepEqual(JSON.parse(batch.stdout),[{id:feature.meta.id,hash:feature.hash,unchanged:true},work]);
  const read=run(repo,'read',feature.meta.id,'--if-changed',feature.hash);
  assert.deepEqual(JSON.parse(read.stdout),{id:feature.meta.id,hash:feature.hash,unchanged:true});
  assert.ok(run(repo,'read',feature.meta.id,'--format','text').stdout.includes(feature.body));
  assert.match(run(repo,'read',work.meta.id,'--section','Plan').stdout,/partial read/);
  const patch=path.join(repo,'patch.md');await fs.writeFile(patch,'Settled question.');
  const written=run(repo,'patch',work.meta.id,'--hash',work.hash,'--section','Open questions','--body-file',patch,'--agent','Planner','--reason','Settled review');
  assert.equal(written.status,0,written.stderr);
  const updated=await store.get(work.meta.id);assert.ok(updated.body.includes('Settled question.'));assert.ok(!updated.body.includes('List unresolved decisions'));
  assert.equal(run(repo,'patch',work.meta.id,'--hash',work.hash,'--section','Plan','--body-file',patch,'--agent','Planner').status,1);
  await fs.writeFile(known,'[]');assert.equal(run(repo,'read-many',feature.meta.id,'--known-file',known).status,1);
  assert.equal(run(repo,'read',feature.meta.id,'--format','invalid').status,1);
  assert.equal(run(repo,'context',feature.meta.id,'--known-file',known).status,1);
  assert.equal(run(repo,'guide','completion').status,0);
  const thread=await store.comment(feature.meta.id,feature.hash,'Unique CLI review body.','',{name:'Owner',email:'owner@example.test'});
  const reviews=run(repo,'review','list',feature.meta.id,'--status','open','--compact');
  assert.equal(reviews.status,0,reviews.stderr);
  assert.deepEqual(JSON.parse(reviews.stdout),[compactReview(thread)]);
  const snapshot=await store.snapshot(updated.meta.id,updated.hash);
  await store.patchBody(updated.meta.id,updated.hash,'New question.',{match:'Settled question.'});
  const compared=run(repo,'compare',updated.meta.id,'--revision',snapshot.meta.id,'--changes-only','--context-lines','0');
  assert.equal(compared.status,0,compared.stderr);
  assert.ok(JSON.parse(compared.stdout).lines.some((line:{omitted?:number})=>line.omitted));
  assert.match(run(repo,'context',feature.meta.id,'--compact').stdout,/read_on_demand/);
  assert.equal(run(repo,'context',feature.meta.id,'--compact','--full').status,1);
  assert.equal((await store.load()).errors.length,0);
});

test('current context retains actionable intent while history remains exact and retrievable',async t=>{
  const {store,repo}=await fixture(t);
  const work=await store.create('work','Current intent','MODULE-alpha');
  const body='# Current intent\n\n## Current status\nToolbar implemented; export remains blocked. Next: owner tests narrow widths.\n\n## Plan\n\n### Decisions\nPreserve keyboard access.\n\n### Open questions\nDoes export include private records?\n\n### Investigation notes\nSuperseded investigation detail.\n\n### Testing observations\nObserve narrow widths.\n\n## Implementation outcome\nDated delivery chronology.\n\n## Verification results\nDated verification evidence.\n\n## History\nHistorical acknowledgement of reverted behavior.\n';
  const saved=await store.saveBody(work.meta.id,body,work.hash);
  const version=await store.snapshot(saved.meta.id,saved.hash);
  const current=await store.compactContext(saved.meta.id,{},true);
  for(const text of ['Toolbar implemented','Preserve keyboard access','Does export include private records?','Observe narrow widths.'])assert.ok(current.includes(text));
  for(const text of ['Superseded investigation detail.','Dated delivery chronology.','Dated verification evidence.','Historical acknowledgement of reverted behavior.'])assert.ok(!current.includes(text));
  assert.match(current,/partial read; hash covers the whole record/);
  assert.match(current,/Read on demand with read --section/);
  const manifest=JSON.parse(current.split('\n\n')[2]);
  const entry=manifest.find((d:{id:string})=>d.id===saved.meta.id);
  assert.deepEqual(entry.body_size,{characters:body.length,estimated_tokens:Math.ceil(body.length/4)});
  assert.ok((await store.compactContext(saved.meta.id)).includes(body));
  assert.ok(readableRecord(await store.get(saved.meta.id),'History').includes('Historical acknowledgement'));
  assert.ok((await store.compactContext(version.meta.id,{},true)).includes(body));
  const result=run(repo,'context',saved.meta.id,'--current');
  assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,current+'\n');
  for(const flag of ['--compact','--full'])assert.equal(run(repo,'context',saved.meta.id,'--current',flag).status,1);
  const known=path.join(repo,'known.json');await fs.writeFile(known,JSON.stringify({[saved.meta.id]:saved.hash}));
  const unchanged=run(repo,'context',saved.meta.id,'--current','--known-file',known);
  assert.equal(unchanged.status,0,unchanged.stderr);assert.match(unchanged.stdout,/unchanged/);assert.ok(!unchanged.stdout.includes('Toolbar implemented'));
  // Fenced examples are not section boundaries, and unknown HTML must not hide instructions.
  for(const exact of ['# Legacy\n\n```md\n## History\n```\nKeep this instruction.\n','# Legacy\n\n<div>\n## History\nKeep this instruction.\n</div>\n']) {
    const latest=await store.get(saved.meta.id);
    const updated=await store.saveBody(latest.meta.id,exact,latest.hash);
    assert.ok((await store.compactContext(updated.meta.id,{},true)).includes(exact));
  }
});

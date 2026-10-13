import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { init, Store, readGuide, readableRecord, compactReview, changedLines } from '../lib/index.js';

// Deterministic text-volume measurements; no model requests or existing-workspace edits.
// Build first. Character savings are not a claim about model tokens or quota.
const repo=await fs.mkdtemp(path.join(os.tmpdir(),'reduct-agent-benchmark-'));
try {
  const store=await init(repo);
  const module=await store.create('module','Settings');
  const feature=await store.create('feature','Language',module.meta.id);
  const evidence=Array.from({length:200},(_,i)=>`Source finding ${i}: existing behavior, boundary conditions, and evidence references.`).join('\n');
  const body=`# Language\n\n## Current behavior\n\n${evidence}\n\n## Open questions\n\nOriginal question.\n\n## Sources\n\nsettings.ts and inspected source revision.\n`;
  const current=await store.saveBody(feature.meta.id,body,feature.hash);
  const snapshot=await store.snapshot(current.meta.id,current.hash);
  const question='Preserve the language fallback behavior and its existing error handling.\n'.repeat(12).trim();
  const thread=await store.comment(current.meta.id,current.hash,question,'Original question.',{name:'Owner',email:'owner@example.test'});
  const compact=compactReview(thread);
  const rows=[];
  function measure(operation,before,after,note) {
    rows.push({operation,before_characters:before.length,after_characters:after.length,reduction_percent:Number((100*(1-after.length/before.length)).toFixed(1)),note});
  }
  // Compare current full and compact guides; the full reference includes the new command docs.
  const reference=await readGuide('reference'),guide=await readGuide('readme');
  measure('Agent startup guide',reference,guide,'Full reference remains available on demand; startup rules and required deeper procedures are linked.');
  measure('Whole-record read',JSON.stringify(current,null,2),readableRecord(current),'All metadata and exact body are preserved.');
  measure('Re-read unchanged record',JSON.stringify(current,null,2),JSON.stringify({id:current.meta.id,hash:current.hash,unchanged:true}),'Valid only when the full exact content is already available in the agent session.');
  const legacyThread={...thread,messages:compact.messages};
  assert.deepEqual(compact.meta,thread.meta);
  measure('Review thread read',JSON.stringify(legacyThread,null,2),JSON.stringify(compact,null,2),'Same metadata and messages; each message body appears once.');
  const replacement='Settled decision: preserve the current fallback.';
  const updated=await new Store(repo,'Benchmark','Settle the question').patchBody(current.meta.id,current.hash,replacement,{section:'Open questions'});
  assert.equal(updated.body,body.replace('Original question.',replacement));
  measure('Local document update payload',updated.body,replacement,'Exact final body verified; patch retains unchanged passages and requires the original whole-record hash.');
  const fullDiff=await store.compare(current.meta.id,snapshot.meta.id);
  const compactDiff={...fullDiff,lines:changedLines(fullDiff.lines)};
  assert.deepEqual(compactDiff.lines.filter(l=>'kind' in l&&l.kind!=='same'),fullDiff.lines.filter(l=>l.kind!=='same'));
  measure('Retained-version comparison',JSON.stringify(fullDiff,null,2),JSON.stringify(compactDiff,null,2),'All changed lines and version metadata preserved; unchanged runs carry omitted-line counts.');
  assert.deepEqual((await store.load()).errors,[]);
  console.log(JSON.stringify({measurement:'Characters, not model tokens. Fixtures verify content preservation; model quality and end-to-end reasoning usage require agent task evaluations.',current_full_reference_characters:reference.length,compact_guide_characters:guide.length,rows},null,2));
} finally {await fs.rm(repo,{recursive:true,force:true});}

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { compareLines } from './compare.js';
import { inspectBrief, summarizeWork } from './workflow.js';
import { planText, markdownSection, briefPrepared } from './document-content.js';
import { closedWorkStatuses } from './tree.js';
import { appendMessage, decode, encode, hash, identityValid, messages, Problem, type Doc, type Identity, type Message, type Meta, type PassageSelection } from './model.js';

export class Store {
  root: string;
  constructor(public repo: string, public agentName?:string, public updateReason?:string) { this.repo = path.resolve(repo); this.root = path.join(this.repo, '.reduct'); }
  async safe(relative: string) {
    if (!relative || path.isAbsolute(relative) || relative.includes('\0')) throw new Problem('Invalid record path');
    const root = await fs.realpath(this.root);
    const target = path.resolve(root, relative);
    if (!target.startsWith(root + path.sep)) throw new Problem('Path escapes the workspace');
    // Reject symlink components, including a symlink .reduct root.
    if ((await fs.lstat(this.root)).isSymbolicLink()) throw new Problem('Symlink workspaces are not supported');
    let cursor = root;
    for (const segment of path.relative(root, target).split(path.sep)) {
      cursor = path.join(cursor, segment);
      try { if ((await fs.lstat(cursor)).isSymbolicLink()) throw new Problem('Symlink records are not supported'); }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
    }
    return target;
  }
  async load() {
    const docs: Doc[] = [], errors: string[] = [];
    const walk = async (directory: string) => {
      for (const item of await fs.readdir(directory, { withFileTypes: true })) {
        if (item.name.startsWith('.')) continue;
        const absolute = path.join(directory, item.name);
        if (item.isSymbolicLink()) { errors.push(`Symlink skipped: ${path.relative(this.root, absolute)}`); continue; }
        if (item.isDirectory()) await walk(absolute);
        else if (item.name.endsWith('.md') && !['README.md','AGENTS.md'].includes(item.name)) {
          try { const doc = decode(await fs.readFile(absolute, 'utf8'), path.relative(this.root, absolute)); if (doc.meta.type === 'review') messages(doc); docs.push(doc); }
          catch (e) { errors.push((e as Error).message); }
        }
      }
    };
    try { await this.safe('README.md'); await walk(this.root); }
    catch (e) { errors.push((e as Error).message); }
    const byId = new Map<string, Doc>();
    for (const doc of docs) { if (byId.has(doc.meta.id)) errors.push(`Duplicate ID: ${doc.meta.id}`); byId.set(doc.meta.id, doc); }
    const allowed: Record<string, string[]> = { feature: ['module'], work: ['module','feature'], plan: ['work'], analysis: ['work'], task: ['work','feature'], review: ['module','feature','work','plan','analysis','implementation'], implementation: ['work'], snapshot: ['work','plan','feature','module','analysis','implementation'] };
    for (const doc of docs) {
      const parent = doc.meta.parent ? byId.get(doc.meta.parent) : undefined;
      if (!['module','guide'].includes(doc.meta.type) && (!parent || !allowed[doc.meta.type]?.includes(parent.meta.type))) errors.push(`${doc.meta.id}: missing or invalid parent`);
      if (['module','guide'].includes(doc.meta.type) && doc.meta.parent) errors.push(`${doc.meta.id}: modules and guides cannot have parents`);
      if (parent) {
        const prefix = path.dirname(parent.path) + path.sep;
        if (!doc.path.startsWith(prefix)) errors.push(`${doc.meta.id}: directory does not match parent`);
      }
      for (const id of doc.meta.related ?? []) if (!byId.has(id)) errors.push(`${doc.meta.id}: missing related record ${id}`);
      const seen = new Set([doc.meta.id]); let cursor = parent;
      while (cursor) { if (seen.has(cursor.meta.id)) { errors.push(`${doc.meta.id}: parent cycle`); break; } seen.add(cursor.meta.id); cursor = byId.get(cursor.meta.parent ?? ''); }
      if (doc.meta.type === 'review' && doc.meta.target_id !== doc.meta.parent) errors.push(`${doc.meta.id}: review target must equal parent`);
    }
    return { docs, errors };
  }
  async get(id: string) {
    const state = await this.load();
    const docs = state.docs.filter(d => d.meta.id === id);
    if (docs.length !== 1) throw new Problem(docs.length ? 'Duplicate record ID' : 'Record not found', docs.length ? 409 : 404);
    return docs[0];
  }
  gitIdentity(): Identity | null {
    const value = (key: string) => { try { return execFileSync('git', ['-C', this.repo, 'config', '--get', key], { encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }).trim(); } catch { return ''; } };
    const identity = { name: value('user.name'), email: value('user.email'), source: 'git' };
    return identityValid(identity) ? identity : null;
  }
  async write(relative: string, raw: string, expected: string | null) {
    const target = await this.safe(relative);
    const parsed=decode(raw,relative);
    if(this.agentName&&!['snapshot','review'].includes(parsed.meta.type))raw=encode({...parsed.meta,updated_by:{actor_kind:'agent',agent_name:this.agentName},updated_at:new Date().toISOString(),update_reason:this.updateReason??'Agent document update'},parsed.body);
    const locks = await this.safe('.locks'); await fs.mkdir(locks, { recursive: true });
    const lock = path.join(locks, hash(relative));
    let handle;
    try { handle = await fs.open(lock, 'wx'); } catch { throw new Problem('Another writer is saving this record. Retry.', 409); }
    const temporary = path.join(path.dirname(target), `.tmp-${randomUUID()}`);
    try {
      let current: string | null = null;
      try { current = hash(await fs.readFile(target, 'utf8')); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
      if (current !== expected) throw new Problem('This file changed since you opened it. Reload before saving.', 409);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(temporary, raw, { flag: 'wx' });
      // Recheck to catch direct external edits made while preparing the write.
      let latest: string | null = null;
      try { latest = hash(await fs.readFile(target, 'utf8')); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
      if (latest !== expected) throw new Problem('An external edit occurred. Reload before saving.', 409);
      await fs.rename(temporary, target);
    } finally { await fs.unlink(temporary).catch(() => {}); await handle.close(); await fs.unlink(lock).catch(() => {}); }
  }
  async saveBody(id: string, body: string, expected: string) {
    const doc = await this.get(id);
    if (['review','snapshot'].includes(doc.meta.type)) throw new Problem('Use review actions; revision snapshots are read-only.');
    if (typeof body !== 'string' || body.length > 200000) throw new Problem('Invalid document body');
    const meta={...doc.meta};
    if((['plan','implementation'].includes(meta.type)||(meta.type==='work'&&planText(doc)!==markdownSection(body,['plan'])))&&body!==doc.body){meta.status='draft';delete meta.approved_by;delete meta.approved_at;delete meta.approved_body_hash;}
    await this.write(doc.path, encode(meta, body), expected);
    return this.get(id);
  }
  async create(type: string, title: string, parentId?: string, workKind = 'enhancement', workflowMode = 'simple') {
    if (!['module','feature','work','plan','analysis','implementation'].includes(type) || typeof title !== 'string' || !title.trim() || title.length > 160) throw new Problem('Provide a record type and title.');
    const allowed: Record<string,string[]> = { feature:['module'],work:['module','feature'],plan:['work'],analysis:['work'],implementation:['work'] };
    const parent = parentId ? await this.get(parentId) : undefined;
    if (type === 'module' ? !!parent : !parent || !allowed[type]?.includes(parent.meta.type)) throw new Problem('Invalid parent for this record type');
    if(type==='work'&&!['enhancement','bug','investigation','maintenance'].includes(workKind))throw new Problem('Invalid work kind');
    if(type==='work'&&!['simple','extended'].includes(workflowMode))throw new Problem('Invalid workflow mode');
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,70) || 'untitled';
    let relative: string;
    if (type === 'module') relative = `modules/${slug}/module.md`;
    else if (type === 'plan' || type === 'analysis' || type === 'implementation') relative = path.join(path.dirname(parent!.path), `${type}.md`);
    else relative = path.join(path.dirname(parent!.path), type === 'feature' ? 'features' : 'work',slug,`${type}.md`);
    const id = `${type.toUpperCase()}-${randomUUID()}`;
    let body = type === 'plan' ? `# ${title.trim()}\n\n## Intention\n\nDescribe the desired change.\n\n## Current state\n\nRecord inspected evidence and uncertainty.\n\n## Proposed behavior\n\nDescribe what should change and what must remain true.\n\n## Implementation steps\n\n- [ ] Define the steps.\n\n## Acceptance criteria\n\nDefine how the implementation will be checked.\n\n## Out of scope\n\nState exclusions.\n\n## Open questions\n\nList decisions needing owner input.\n` : `# ${title.trim()}\n\n## ${type === 'feature' ? 'Current behavior' : 'Purpose'}\n\nDescribe this ${type}.\n\n## Challenges and unknowns\n\nRecord uncertainty and surrounding dependencies.\n`;
    if(type==='plan'&&parent?.meta.workflow_mode==='simple')body=`# ${title.trim()}\n\n## Intention\n\nDescribe the desired change.\n\n## Current behavior and proposed change\n\nDescribe the small repair and what must stay unchanged.\n\n## Proposed work\n\n- [ ] Define the repair.\n\n## Acceptance criteria\n\nDefine the relevant check.\n\n## Open questions\n\nList decisions needing owner input, or state none.\n`;
    let source:Record<string,unknown>={};
    if(type==='implementation') {
      const plan=(await this.load()).docs.find(d=>d.meta.type==='plan'&&d.meta.status!=='superseded'&&d.meta.parent===parentId)??(parent&&markdownSection(parent.body,['plan'])?parent:undefined);
      if(!plan)throw new Problem('Write the Plan section in this work document first.');
      const version=await this.snapshot(plan.meta.id,plan.hash,'brief_preparation');
      source={source_plan:plan.meta.id,source_revision_id:version.meta.id,source_plan_hash:plan.hash};
      const features=summarizeWork(parent!, (await this.load()).docs).affectedFeatureIds;
      const state=await this.load();
      const reporting=[`Work: ${path.join(this.root,parent!.path)} (${parent!.meta.id})`,...features.map(id=>{const feature=state.docs.find(d=>d.meta.id===id)!;return `Feature: ${path.join(this.root,feature.path)} (${id})`;})].join('\n');
      body=`# ${title.trim()}\n\n## Accepted behavior\n\n[Write settled behavior here.]\n\n## Implementation tasks\n\n[Write concrete tasks here.]\n\n## Acceptance criteria\n\n[Write verification criteria here.]\n\n## Scope and exclusions\n\n[Write agreed scope here.]\n\n## Verification and reporting\n\n${reporting}\n\nRead the application repository's AGENTS.md and ${path.join(this.root,'agent/README.md')}. Follow its validation restrictions. When implementation starts, set the linked Work to in_progress. Record delivered changes and actual checks in that Work, and update each listed feature to describe delivered behavior. Keep verification checklists out of feature pages. Report deviations and unresolved checks; complete Work only through the documented completion workflow. Escalate discoveries requiring a product or scope decision.\n`;
    }
    if(type==='work')body=`# ${title.trim()}\n\n## Plan\n\n### Requested change\n\nDescribe the requested change.\n\n### Current and proposed behavior\n\nDescribe what changes and what stays the same.\n\n### Scope and expected result\n\nDefine the scope and expected result.\n\n### Open questions\n\nList unresolved decisions, or state none.\n`;
    if(type==='work')body+=`\n## Implementation outcome\n\nRecord delivered changes, deviations, and remaining work after implementation.\n\n## Verification results\n\nRecord checks actually run, outcomes, and checks still pending.\n`;
    await this.write(relative,encode({schema_version:1,id,type,title:title.trim(),...(parent?{parent:parent.meta.id}:{}),status:'draft',...(type==='work'?{work_kind:workKind,workflow_mode:workflowMode}:{}),...source},body),null);
    return this.get(id);
  }
  async comment(id: string, expected: string, text: string, quote: string, author: Identity, actor: 'human' | 'agent' = 'human', agentName?: string, selection?: PassageSelection) {
    if (!identityValid(author) || (actor === 'agent' && !agentName)) throw new Problem('An author name and email (and agent name for agent replies) are required');
    const target = await this.get(id);
    if (target.hash !== expected) throw new Problem('Document changed; reload before commenting', 409);
    if (!['module','feature','work','plan','analysis','implementation'].includes(target.meta.type)) throw new Problem('This record cannot receive comments');
    if (typeof quote !== 'string' || quote.length > 10000) throw new Problem('Invalid selected passage');
    if (selection !== undefined) {
      if (!selection || !quote.trim() || !Number.isInteger(selection.start) || !Number.isInteger(selection.end) || selection.start < 0 || selection.end <= selection.start || selection.end > target.body.length || typeof selection.source !== 'string' || selection.source.length > 10000 || target.body.slice(selection.start, selection.end) !== selection.source) throw new Problem('Selected passage is not in this document');
    } else if (quote && !target.body.includes(quote)) throw new Problem('Selected passage is not in this document');
    const version = await this.snapshot(id,expected,'comment');
    const reviewId = `REVIEW-${randomUUID()}`;
    const meta: Meta = { schema_version: 1, id: reviewId, type: 'review', title: `Review of ${target.meta.title}`, parent: id, target_id: id, target_path: target.path, target_hash: target.hash, target_revision:version.meta.id, quote, ...(selection ? {quote_source: selection.source, quote_unique: target.body.indexOf(selection.source) === target.body.lastIndexOf(selection.source), quote_start: selection.start, quote_end: selection.end} : {}), intent:'clarification', status: 'open', messages: [] };
    const thread = decode(encode(meta, ''), '');
    const message: Message = { id: `MSG-${randomUUID()}`, author, actor_kind: actor, ...(agentName ? { agent_name: agentName } : {}), created_at: new Date().toISOString(), kind: 'comment' };
    const relative = path.join(path.dirname(target.path), 'reviews', `${reviewId}.md`);
    await this.write(relative, appendMessage(thread, message, text), null);
    return this.get(reviewId);
  }
  async reply(id: string, expected: string, text: string, kind: 'reply' | 'resolve' | 'reopen', author: Identity, actor: 'human' | 'agent', agentName?: string) {
    if (!identityValid(author) || (actor === 'agent' && !agentName)) throw new Problem('Invalid author/agent identity');
    const doc = await this.get(id);
    if (doc.meta.type !== 'review') throw new Problem('Not a review thread');
    const target = await this.get(String(doc.meta.target_id));
    const message: Message = { id: `MSG-${randomUUID()}`, author, actor_kind: actor, ...(agentName ? { agent_name: agentName } : {}), created_at: new Date().toISOString(), kind, addressed_hash: target.hash };
    const updated = { ...doc, meta: { ...doc.meta, status: kind === 'resolve' ? 'resolved' : kind === 'reopen' ? 'open' : doc.meta.status } };
    await this.write(doc.path, appendMessage(updated, message, text), expected);
    return this.get(id);
  }
  async followUp(id:string,expected:string,text:string,author:Identity) {
    const thread=await this.get(id);
    if(thread.meta.type!=='review')throw new Problem('Not a clarification thread');
    return this.reply(id,expected,text,thread.meta.status==='resolved'?'reopen':'reply',author,'human');
  }
  async snapshot(id: string, expected: string, reason = 'checkpoint') {
    const doc = await this.get(id);
    if (!['work','plan','module','feature','analysis','implementation'].includes(doc.meta.type) || doc.hash !== expected) throw new Problem('Plan changed; reload before retaining a revision', 409);
    const existing=(await this.load()).docs.find(d=>d.meta.type==='snapshot'&&d.meta.parent===id&&d.meta.source_hash===expected);
    if(existing)return existing;
    const snapshotId = `REV-${expected}`;
    const relative = path.join(path.dirname(doc.path), 'revisions', `${snapshotId}.md`);
    await this.write(relative, encode({ ...doc.meta, id: snapshotId, type: 'snapshot', source_type:doc.meta.type, source_path:doc.path, parent: id, source_hash: doc.hash, snapshot_reason:reason, retained_at: new Date().toISOString(), title: doc.meta.title }, doc.body), null);
    return this.get(snapshotId);
  }
  async submitReview(id:string,expected:string) {
    const doc=await this.get(id);
    if(!['work','plan'].includes(doc.meta.type)||(doc.meta.type==='work'&&!markdownSection(doc.body,['plan']))||doc.hash!==expected)throw new Problem('Plan changed. Reload before submitting.',409);
    await this.snapshot(id,expected,'submitted_for_review');
    await this.write(doc.path,encode({...doc.meta,status:'ready_for_review'},doc.body),expected);
    const updated=await this.get(id);
    await this.snapshot(id,updated.hash,'submitted_for_review');
    return updated;
  }
  async readyBrief(id:string,expected:string,author:Identity,ownerInstruction?:string) {
    const doc=await this.get(id);
    if(doc.meta.type!=='implementation'||!identityValid(author))throw new Problem('Choose an implementation brief and author profile.');
    if(doc.hash!==expected)throw new Problem('Brief changed; reload before approving.',409);
    if(/\[Write (settled behavior|concrete tasks|verification criteria|agreed scope) here\.\]/.test(doc.body))throw new Problem('Fill in settled behavior, tasks, scope, and acceptance criteria before handoff.');
    const revision=await this.get(String(doc.meta.source_revision_id));
    if(revision.meta.type!=='snapshot'||revision.meta.parent!==doc.meta.source_plan)throw new Problem('Brief has no valid source review version.');
    if(inspectBrief(doc,(await this.load()).docs).drift!=='current')throw new Problem('The plan changed. Reconcile the brief and update its source version before handoff.');
    const meta={...doc.meta,status:'ready_for_handoff',approved_by:author,approved_at:new Date().toISOString(),approved_body_hash:hash(doc.body),...(ownerInstruction?{owner_decision:{instruction:ownerInstruction,channel:'direct_agent_conversation',recorded_by:this.agentName??'agent'}}:{})};
    await this.write(doc.path,encode(meta,doc.body),expected);
    const updated=await this.get(id);await this.snapshot(id,updated.hash,'manual_handoff_approval');return updated;
  }
  async compare(id: string, revision: string) {
    const [current, previous] = await Promise.all([this.get(id),this.get(revision)]);
    if (!['work','plan','module','feature','analysis','implementation'].includes(current.meta.type) || previous.meta.type !== 'snapshot' || previous.meta.parent !== id) throw new Problem('Choose a retained revision of this plan or document');
    const comparison = compareLines(previous.body,current.body);
    return { ...comparison, currentHash:current.hash, revisionId:previous.meta.id, retainedAt:previous.meta.retained_at, sourceHash:previous.meta.source_hash, added:comparison.lines.filter(l=>l.kind==='added').length, removed:comparison.lines.filter(l=>l.kind==='removed').length };
  }
  async updateWork(id:string,expected:string,input:{workflow_mode:string;status:string;affected_features:string[]}) {
    const work=await this.get(id);
    if(work.meta.type!=='work'||work.hash!==expected)throw new Problem('Work item changed. Reload before saving.',409);
    if(!['simple','extended'].includes(input.workflow_mode)||!['draft','planning','review','ready_for_review','ready_for_implementation','needs_owner_decision','in_progress','awaiting_verification','completed','superseded','rejected'].includes(input.status))throw new Problem('Invalid work settings');
    const docs=(await this.load()).docs;
    if(!Array.isArray(input.affected_features)||input.affected_features.some(id=>!docs.some(d=>d.meta.id===id&&d.meta.type==='feature')))throw new Problem('Choose valid affected features');
    await this.write(work.path,encode({...work.meta,workflow_mode:input.workflow_mode,status:input.status,affected_features:[...new Set(input.affected_features)]},work.body),expected);
    return this.get(id);
  }
  async refreshBriefSource(id:string,expected:string,expectedPlanHash:string) {
    const brief=await this.get(id);
    if(brief.meta.type!=='implementation'||brief.hash!==expected)throw new Problem('Brief changed. Reload before updating its source.',409);
    const plan=await this.get(String(brief.meta.source_plan));
    if(!((plan.meta.type==='plan'&&plan.meta.parent===brief.meta.parent)||(plan.meta.type==='work'&&plan.meta.id===brief.meta.parent))||plan.hash!==expectedPlanHash)throw new Problem('Plan changed. Read it before updating the source.',409);
    await this.snapshot(id,brief.hash,'before_source_reconciliation');
    const version=await this.snapshot(plan.meta.id,plan.hash,'brief_source_reconciliation');
    const meta:Meta={...brief.meta,status:'draft',source_revision_id:version.meta.id,source_plan_hash:plan.hash};
    delete meta.approved_by;delete meta.approved_at;delete meta.approved_body_hash;
    await this.write(brief.path,encode(meta,brief.body),expected);
    return this.get(id);
  }
  async recordHandoff(id:string,expected:string,revisionId:string,author:Identity,ownerInstruction?:string) {
    const work=await this.get(id);
    if(work.meta.type!=='work'||work.hash!==expected)throw new Problem('Work item changed. Reload before recording the handoff.',409);
    if(!identityValid(author))throw new Problem('An owner profile is required.');
    const version=await this.get(revisionId);
    const brief=await this.get(String(version.meta.parent));
    if(version.meta.type!=='snapshot'||brief.meta.type!=='implementation'||brief.meta.parent!==id||!briefPrepared(version))throw new Problem('Choose a saved brief with complete instructions from this work item.');
    const record={revision_id:revisionId,at:new Date().toISOString(),by:author,...(ownerInstruction?{owner_instruction:ownerInstruction,recorded_by:this.agentName??'agent'}:{})};
    await this.write(work.path,encode({...work.meta,handoff_revision_id:revisionId,handoff_at:record.at,handoff_by:author,handoffs:[...(Array.isArray(work.meta.handoffs)?work.meta.handoffs:[]),record]},work.body),expected);
    return this.get(id);
  }
  async finishWork(id:string,expected:string,verificationState:string,ownerInstruction?:string,featureUpdates:{id:string;hash:string;reason:string}[]=[]) {
    const work=await this.get(id);
    if(work.meta.type!=='work'||work.hash!==expected)throw new Problem('Work item changed. Reload before recording completion.',409);
    if(!['passed','pending','accepted_limitations'].includes(verificationState))throw new Problem('Declare verification as passed, pending, or accepted_limitations.');
    const docs=(await this.load()).docs;const summary=summarizeWork(work,docs);
    if(!summary.outcome||!summary.verification||/^not reported/i.test(summary.outcome)||/^not reported/i.test(summary.verification))throw new Problem('Record an implementation outcome and actual verification results first.');
    if(verificationState==='accepted_limitations'&&!ownerInstruction)throw new Problem('An explicit owner instruction is required to accept verification limitations.');
    if(!Array.isArray(featureUpdates))throw new Problem('Feature acknowledgements must be an array.');
    if(summary.affectedFeatureIds.some(featureId=>{const feature=docs.find(d=>d.meta.id===featureId)!;return !featureUpdates.some(update=>update.id===featureId&&update.hash===feature.hash&&typeof update.reason==='string'&&update.reason.trim().length>3);}))throw new Problem('Review each affected feature and supply its current hash plus an update/no-change explanation.');
    await this.write(work.path,encode({...work.meta,status:verificationState==='pending'?'awaiting_verification':'completed',verification_state:verificationState,feature_updates:featureUpdates,...(ownerInstruction?{verification_owner_instruction:ownerInstruction}:{})},work.body),expected);
    return this.get(id);
  }
  async briefing(id: string, expected?: string) {
    const focus=await this.get(id);
    if(expected && focus.hash!==expected) throw new Problem('This document changed. Refresh before copying its briefing.',409);
    if(focus.meta.type==='implementation') {
      const source=await this.get(String(focus.meta.source_revision_id));
      const assessment=inspectBrief(focus,(await this.load()).docs);
      const ready=briefPrepared(focus)&&assessment.drift==='current';
      const driftNote=assessment.drift!=='current'?'The plan changed or its source is missing. Reconcile the brief before execution.\n\n':'';
      return {hash:focus.hash,openThreads:0,text:`# ${ready?'Implementation handoff':'Draft implementation brief — review only'}: ${focus.meta.title}\n\n${driftNote}${ready?'Implement these instructions when the owner manually hands this brief to you for implementation. No separate approval record is required.':'Do not execute this draft. Its content is incomplete or its source needs updating.'}\n\nBrief file: ${path.join(this.root,focus.path)}\nBrief hash: ${focus.hash}\nSource review version: ${path.join(this.root,source.path)}\n\n${focus.body}`};
    }
    if(focus.meta.type==='review') throw new Problem('Choose the feature or plan instead of a review thread');
    const state=await this.load();
    const primary=focus.meta.type==='snapshot'?await this.get(focus.meta.parent!):focus;
    const scope=new Map([[primary.meta.id,primary]]);
    let cursor=primary;
    while(cursor.meta.parent&&!scope.has(cursor.meta.parent)) { const parent=state.docs.find(d=>d.meta.id===cursor.meta.parent);if(!parent)break;scope.set(parent.meta.id,parent);cursor=parent; }
    for(const item of [...scope.values()]) for(const related of item.meta.related??[]) { const other=state.docs.find(d=>d.meta.id===related);if(other)scope.set(related,other); }
    if(primary.meta.type==='plan') for(const sibling of state.docs.filter(d=>d.meta.parent===primary.meta.parent && d.meta.type==='analysis'))scope.set(sibling.meta.id,sibling);
    if(['work','feature','module'].includes(primary.meta.type)) {
      let frontier=[primary.meta.id];
      for(let depth=0;depth<3;depth++) {
        const children=state.docs.filter(d=>frontier.includes(d.meta.parent??'')&&['feature','work','plan','analysis'].includes(d.meta.type));
        children.forEach(d=>scope.set(d.meta.id,d));frontier=children.map(d=>d.meta.id);
      }
    }
    const featureIds=new Set([...scope.values()].filter(d=>d.meta.type==='feature').map(d=>d.meta.id));
    for(const work of state.docs.filter(d=>d.meta.type==='work'&&!closedWorkStatuses.includes(String(d.meta.status)))) {
      const overview=summarizeWork(work,state.docs);
      if(scope.has(work.meta.id)||overview.affectedFeatureIds.some(id=>featureIds.has(id))) {
        scope.set(work.meta.id,work);
        for(const id of overview.affectedFeatureIds) { const feature=state.docs.find(d=>d.meta.id===id);if(feature)scope.set(id,feature); }
        for(const document of state.docs.filter(d=>d.meta.parent===work.meta.id&&['plan','analysis'].includes(d.meta.type)))scope.set(document.meta.id,document);
      }
    }
    const reviews=state.docs.filter(d=>d.meta.type==='review'&&d.meta.status==='open'&&scope.has(String(d.meta.target_id)));
    const selected=focus.meta.type==='snapshot'?focus:primary;
    const applicationRepository=selected.meta.source_repository??[...scope.values()].find(d=>typeof d.meta.source_repository==='string')?.meta.source_repository;
    const parts=[`# Agent briefing: ${selected.meta.title}`,`Documentation workspace: ${this.repo}\n${applicationRepository?`Application/source repository: ${applicationRepository}\n`:''}Selected document: .reduct/${selected.path}\nRecord ID: ${selected.meta.id}\nSelected file hash: ${selected.hash}\n${selected.meta.source_revision?`Inspected source revision: ${selected.meta.source_revision}\n`:''}`,
      '## Owner instruction\n\n[Add your intention or request here before sending.]\n\nThe owner manually hands the Implementation brief to an implementation agent. This planning context does not authorize implementation. If the owner requests planning, inspect the sources and address comments without changing application code. Implementation agents receive a separate implementation brief after the owner settles instructions; do not use this plan as an execution brief.',
      '## Documents to read\n\n'+[selected,...[...scope.values()].filter(d=>d.meta.id!==selected.meta.id && !(focus.meta.type==='snapshot'&&d.meta.id===primary.meta.id))].map(d=>`- ${d.meta.title}: ${path.join(this.root,d.path)} (ID ${d.meta.id})`).join('\n'),
      `## Selected document\n\n${selected.body}`];
    if(focus.meta.type==='snapshot') parts.push('## Revision note\n\nThe selected document is a retained snapshot. Comments below target their original reviewed revisions and may concern a newer draft; reconcile them explicitly rather than modifying this snapshot.');
    parts.push('## Open review threads\n\n'+(reviews.length?reviews.map(r=>`### ${r.meta.id}\nFile: ${path.join(this.root,r.path)}\nTarget: ${r.meta.target_id}\nReviewed hash: ${r.meta.target_hash}\nThread hash: ${r.hash}\nOriginal passage: ${String(r.meta.quote||'(document-level comment)')}\n\n${messages(r).map(m=>`${m.kind.toUpperCase()} — ${m.actor_kind==='agent'?m.agent_name:m.author.name}\n${m.body}`).join('\n\n')}`).join('\n\n'): 'No open threads in the selected context.'));
    parts.push('## Reporting\n\nUpdate the current draft when planning. Preserve review history; append a reply explaining each change and resolve only addressed feedback. Resolution is not approval. Keep accepted intent separate from observed implementation. Record source revisions and distinguish inspected tests from executed tests. Read the target project’s AGENTS.md before changing or running its application.');
    return { text:parts.join('\n\n'), hash:focus.hash, openThreads:reviews.length };
  }
  async shortBriefing(id: string, expected?: string) {
    const doc = await this.get(id);
    if(expected && expected!==doc.hash) throw new Problem('This document changed. Refresh before copying its briefing.',409);
    if(doc.meta.type==='implementation') {
      const docs=(await this.load()).docs;
      const assessment=inspectBrief(doc,docs);
      const ready=briefPrepared(doc)&&assessment.drift==='current';
      const revision = ready ? docs.find(d=>d.meta.type==='snapshot' && d.meta.parent===id && d.meta.source_hash===doc.hash) : undefined;
      return { hash:doc.hash, openThreads:0, text:[
        ready ? `Implement ${doc.meta.title} when the owner manually hands you this brief for implementation. No separate approval record is required.` : `Review the draft implementation brief for ${doc.meta.title}. Do not execute this draft.`,
        `Documentation workspace: ${this.root}`,
        `Read the application AGENTS.md and ${path.join(this.root,'agent/README.md')}.`,
        `Brief: ${path.join(this.root,doc.path)} (${doc.meta.id})`,
        ...(revision ? [`Saved version: ${path.join(this.root,revision.path)} (${revision.meta.id})`] : []),
        `Brief hash: ${doc.hash}`,
        ready ? 'Update the work outcome, verification results, and affected feature records when finished.' : '[Add your review request here.]'
      ].join('\n') };
    }
    const detailed = await this.briefing(id,expected);
    return { hash:doc.hash, openThreads:detailed.openThreads, text:[
      '[Add your request here.]',
      `Planning workspace: ${this.root}`,
      `Read ${path.join(this.root,'AGENTS.md')}.`,
      `Target: ${path.join(this.root,doc.path)} (${doc.meta.id})`,
      `Version viewed: ${doc.hash}`,
      `Read related context and ${detailed.openThreads} open discussion${detailed.openThreads===1?'':'s'}; update the relevant records and reply to addressed comments.`
    ].join('\n') };
  }
  async context(id: string) {
    const { docs } = await this.load(); const doc = await this.get(id); const selected = new Map([[id, doc]]);
    let cursor = doc;
    while (cursor.meta.parent && !selected.has(cursor.meta.parent)) { const parent = docs.find(d => d.meta.id === cursor.meta.parent); if (!parent) break; selected.set(parent.meta.id, parent); cursor = parent; }
    for (const d of [...selected.values()]) for (const related of d.meta.related ?? []) { const r = docs.find(x => x.meta.id === related); if (r) selected.set(related, r); }
    for(const work of docs.filter(d=>d.meta.type==='work'&&!closedWorkStatuses.includes(String(d.meta.status)))) {
      const summary=summarizeWork(work,docs);
      if(work.meta.id===id||summary.affectedFeatureIds.includes(id)) {
        selected.set(work.meta.id,work);
        for(const featureId of summary.affectedFeatureIds) { const feature=docs.find(d=>d.meta.id===featureId);if(feature)selected.set(featureId,feature); }
        for(const child of docs.filter(d=>d.meta.parent===work.meta.id&&['plan','analysis'].includes(d.meta.type)))selected.set(child.meta.id,child);
      }
    }
    for (const d of docs) if ((d.meta.parent === id && ['plan','analysis','task'].includes(d.meta.type)) || (d.meta.type === 'review' && selected.has(String(d.meta.target_id)) && d.meta.status === 'open')) selected.set(d.meta.id, d);
    const content = [...selected.values()].map(d => `# ${d.meta.title}\nID: ${d.meta.id}\nFile: .reduct/${d.path}\n\n${d.body}`).join('\n\n---\n\n');
    return content.length > 35000 ? content.slice(0,35000) + '\n\n[Context truncated at 35,000 characters. Open referenced files or request individual records for full content.]\n' : content;
  }
}

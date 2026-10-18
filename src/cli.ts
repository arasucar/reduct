#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { Store } from './store.js';
import { init } from './seed.js';
import { syncWorkspace } from './upgrade.js';
import { version } from './version.js';
import { serve } from './server.js';
import { messages } from './model.js';
import { cliHelp } from './help.js';
import { changedLines, compactReview, readableRecord, recordIndex } from './agent-output.js';
import { readGuide } from './guides.js';
const args=process.argv.slice(2);
function option(name: string, fallback = '') {
  const index = args.indexOf(`--${name}`);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`Provide a value for --${name}. Run reduct --help for usage.`);
  return value;
}
try {
const command=args[0]??'help';
const agent=option('agent');
const store=new Store(option('repo',process.cwd()),agent||undefined,option('reason',`Agent command: ${command}`));
function requireAgent(){if(!agent)throw new Error('Mutation commands require --agent NAME. The UI is for reading and clarification only.');}
async function fileText(name='body-file'){const file=option(name);if(!file)throw new Error(`Provide --${name} PATH`);return fs.readFile(path.resolve(file),'utf8');}
async function knownHashes() {
  if (!option('known-file')) return {} as Record<string, string>;
  const known = JSON.parse(await fileText('known-file'));
  if (!known || typeof known !== 'object' || Array.isArray(known) || Object.values(known).some(v => typeof v !== 'string')) throw new Error('Provide a JSON object mapping record IDs to previously read hashes.');
  return known as Record<string, string>;
}
function recordOutput(doc: Awaited<ReturnType<Store['get']>>, known: Record<string, string> = {}) {
  const format=option('format','json');
  if(!['json','text'].includes(format))throw new Error('Read format must be json or text');
  const title=option('section');
  if (doc.hash === (option('if-changed') || known[doc.meta.id])) return {id:doc.meta.id,hash:doc.hash,unchanged:true};
  if(title || format==='text')return readableRecord(doc,title||undefined);
  return doc;
}
function printRecord(output: ReturnType<typeof recordOutput>) {console.log(typeof output==='string'?output:JSON.stringify(output,null,2));}
async function ownerInstruction(){const text=(await fileText('owner-instruction-file')).trim();if(!text||text.length>20000)throw new Error('Record the explicit direct user instruction (maximum 20,000 characters).');return text;}
function owner(){const identity=store.gitIdentity();if(!identity)throw new Error('Git owner name/email must be configured to record attribution.');return identity;}
async function inputDoc(){const doc=await store.get(args[1]);const expected=option('hash');if(!expected)throw new Error('Provide --hash from the document you read to detect concurrent changes.');return {doc,expected};}
function result(doc:{meta:{id:string};path:string;hash:string}){console.log(`${doc.meta.id}\n.reduct/${doc.path}\nHash: ${doc.hash}`);}
async function confirmInit() {
  const existing=await fs.lstat(store.root).catch((error:NodeJS.ErrnoException)=>{if(error.code==='ENOENT')return undefined;throw error;});
  if(existing)throw new Error('A .reduct directory already exists; initialization never overwrites it.');
  console.log(`Initialize Reduct in ${store.repo}?\nThis creates .reduct/ with workspace guides and version metadata, and adds Reduct instructions to ${path.join(store.repo,'AGENTS.md')}. Existing application instructions are preserved.`);
  process.stdout.write('Continue? [y/N] ');
  const input=createInterface({input:process.stdin,terminal:false});
  input.on('SIGINT',()=>input.close());
  try {
    for await(const line of input)return /^(y|yes)$/i.test(line.trim());
    return false;
  } finally {input.close();}
}
  if(command==='help'||command==='--help'||command==='-h'||args.includes('--help')||args.includes('-h'))console.log(cliHelp);
  else if(command==='--version'||command==='version')console.log(version);
  else if(command==='sync'){requireAgent();const result=await syncWorkspace(store.repo);console.log(`Workspace guides synced to Reduct ${result.version}.`);if(result.updated.length)console.log(`Updated: ${result.updated.join(', ')}`);if(result.skipped.length)console.log(`Preserved local changes: ${result.skipped.join(', ')}`);}
  else if(command==='init'){if(await confirmInit()){await init(store.repo);console.log(`Created ${store.root}`);}else console.log('Initialization cancelled. No files were changed.');}
  else if(command==='ui'){const port=Number(option('port','4310'));if(!Number.isInteger(port)||port<0||port>65535)throw new Error('Invalid port');const server=await serve(new Store(store.repo),port);const address=server.address();console.log(`Reduct reader UI: http://127.0.0.1:${typeof address==='object'&&address?address.port:port}\nWorkspace: ${store.repo}`);}
  else if(command==='check'){const state=await store.load();console.log(`${state.docs.length} records checked`);state.errors.forEach(e=>console.error(e));process.exitCode=state.errors.length?1:0;}
  else if(command==='guide')console.log(await readGuide(args[1]&&!args[1].startsWith('-')?args[1]:'readme'));
  else if(command==='list') {
    const state=await store.load();
    if(state.errors.length)throw new Error(`Workspace validation failed:\n${state.errors.join('\n')}`);
    const query=option('search').toLowerCase();
    console.log(JSON.stringify(state.docs.filter(d=>(option('type')?d.meta.type===option('type'):!['snapshot','review','guide','bug_document'].includes(d.meta.type))&&(!option('parent')||d.meta.parent===option('parent'))&&(!option('status')||d.meta.status===option('status'))&&(!query||`${d.meta.id} ${d.meta.title} ${d.path}`.toLowerCase().includes(query))).map(recordIndex)));
  }
  else if(command==='hash') {
    const ids=args[1]?.split(',');if(!ids?.length)throw new Error('Provide record IDs separated by commas');
    const state=await store.load();
    const hashes:Record<string,string>={};
    for(const id of ids){const matches=state.docs.filter(d=>d.meta.id===id);if(matches.length!==1)throw new Error(`Record not found or duplicate: ${id}`);hashes[id]=matches[0].hash;}
    console.log(JSON.stringify(hashes));
  }
  else if(command==='read')printRecord(recordOutput(await store.get(args[1])));
  else if(command==='read-many') {
    const ids=[...new Set(args[1]?.split(',').filter(Boolean))];if(!ids.length)throw new Error('Provide record IDs separated by commas');
    const known=await knownHashes(),state=await store.load();
    const selected=ids.map(id=>{const matches=state.docs.filter(d=>d.meta.id===id);if(matches.length!==1)throw new Error(`Record not found or duplicate: ${id}`);return matches[0];});
    const outputs=selected.map(d=>recordOutput(d,known));
    if(option('format','json')==='json'&&!option('section'))console.log(JSON.stringify(outputs,null,2));
    else console.log(outputs.map(o=>typeof o==='string'?o:JSON.stringify(o)).join('\n\n---\n\n'));
  }
  else if(command==='context') {
    if(['--compact','--current','--full'].filter(flag=>args.includes(flag)).length>1)throw new Error('Choose one of --compact, --current, or --full');
    if(option('known-file')&&!args.includes('--compact')&&!args.includes('--current'))throw new Error('--known-file requires context --compact or --current');
    console.log(await (args.includes('--compact')||args.includes('--current')?store.compactContext(args[1],await knownHashes(),args.includes('--current')):store.context(args[1],args.includes('--full'))));
  }
  else if(command==='briefing')console.log((await (args.includes('--short')?store.shortBriefing(args[1]):store.briefing(args[1]))).text);
  else if(command==='compare') {
    const comparison=await store.compare(args[1],option('revision'));
    console.log(JSON.stringify(args.includes('--changes-only')?{...comparison,lines:changedLines(comparison.lines,Number(option('context-lines','3')))}:comparison,null,2));
  }
  else if(command==='create'){requireAgent();if(args[1]==='plan')throw new Error('Write a Plan section in the work document instead of creating a separate plan.');result(await store.create(args[1],option('title'),option('parent')||undefined,option('work-kind','enhancement'),option('workflow','simple')));}
  else if(command==='write'){requireAgent();const {doc,expected}=await inputDoc();result(await store.saveBody(doc.meta.id,await fileText(),expected));}
  else if(command==='patch') {
    requireAgent();const {doc,expected}=await inputDoc();
    if(Boolean(option('section'))===Boolean(option('match-file')))throw new Error('Provide exactly one of --section TITLE or --match-file PATH');
    result(await store.patchBody(doc.meta.id,expected,await fileText(),option('section')?{section:option('section')}:{match:await fileText('match-file')}));
  }
  else if(command==='submit-review'){requireAgent();const {doc,expected}=await inputDoc();result(await store.submitReview(doc.meta.id,expected));}
  else if(command==='snapshot'){requireAgent();const {doc,expected}=await inputDoc();result(await store.snapshot(doc.meta.id,expected,option('reason','agent_checkpoint')));}
  else if(command==='update-work'||command==='update-bug'){requireAgent();const {doc,expected}=await inputDoc();if(command==='update-bug'&&doc.meta.type!=='bug')throw new Error('Choose a Bug record for update-bug.');if(option('status')==='completed')throw new Error('Use complete with verification evidence and affected-feature acknowledgements.');const affected=option('affected-features');result(await store.updateWork(doc.meta.id,expected,{workflow_mode:option('workflow',String(doc.meta.workflow_mode??'simple')),status:option('status',String(doc.meta.status??'draft')),affected_features:affected?affected.split(','):Array.isArray(doc.meta.affected_features)?doc.meta.affected_features as string[]:[]}));}
  else if(command==='refresh-brief-source'){requireAgent();const {doc,expected}=await inputDoc();const planHash=option('plan-hash');if(!planHash)throw new Error('Read the current plan and supply --plan-hash.');result(await store.refreshBriefSource(doc.meta.id,expected,planHash));}
  else if(command==='record-approval'){requireAgent();const {doc,expected}=await inputDoc();result(await store.readyBrief(doc.meta.id,expected,owner(),await ownerInstruction()));}
  else if(command==='record-handoff'){requireAgent();const {doc,expected}=await inputDoc();result(await store.recordHandoff(doc.meta.id,expected,option('revision'),owner(),await ownerInstruction()));}
  else if(command==='complete'){requireAgent();const {doc,expected}=await inputDoc();const state=option('verification');const instruction=state==='accepted_limitations'?await ownerInstruction():undefined;const featureFile=option('feature-updates-file');const updates=featureFile?JSON.parse(await fs.readFile(path.resolve(featureFile),'utf8')):[];result(await store.finishWork(doc.meta.id,expected,state,instruction,updates));}
  else if(command==='review'){
    const action=args[1],id=args[2];
    if(action==='list'){const state=await store.load();console.log(JSON.stringify(state.docs.filter(d=>d.meta.type==='review'&&(!id||d.meta.target_id===id)&&(!option('status')||d.meta.status===option('status'))).map(d=>args.includes('--compact')?compactReview(d):({...d,messages:messages(d)})),null,2));}
    else if(['reply','resolve','reopen'].includes(action)){requireAgent();const doc=await store.get(id);const expected=option('hash');if(!expected)throw new Error('Provide the thread --hash you read.');result(await store.reply(id,expected,await fileText(),action as 'reply'|'resolve'|'reopen',owner(),'agent',agent));}
    else throw new Error('Use review list|reply|resolve|reopen');
  }
  else throw new Error(`Unknown command: ${command}. Run reduct --help for available commands.`);
}catch(error){console.error((error as Error).message);process.exitCode=1;}

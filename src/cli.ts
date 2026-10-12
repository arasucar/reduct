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
  else if(command==='read')console.log(JSON.stringify(await store.get(args[1]),null,2));
  else if(command==='context')console.log(await store.context(args[1]));
  else if(command==='briefing')console.log((await (args.includes('--short')?store.shortBriefing(args[1]):store.briefing(args[1]))).text);
  else if(command==='compare')console.log(JSON.stringify(await store.compare(args[1],option('revision')),null,2));
  else if(command==='create'){requireAgent();if(args[1]==='plan')throw new Error('Write a Plan section in the work document instead of creating a separate plan.');result(await store.create(args[1],option('title'),option('parent')||undefined,option('work-kind','enhancement'),option('workflow','simple')));}
  else if(command==='write'){requireAgent();const {doc,expected}=await inputDoc();result(await store.saveBody(doc.meta.id,await fileText(),expected));}
  else if(command==='submit-review'){requireAgent();const {doc,expected}=await inputDoc();result(await store.submitReview(doc.meta.id,expected));}
  else if(command==='snapshot'){requireAgent();const {doc,expected}=await inputDoc();result(await store.snapshot(doc.meta.id,expected,option('reason','agent_checkpoint')));}
  else if(command==='update-work'){requireAgent();const {doc,expected}=await inputDoc();if(option('status')==='completed')throw new Error('Use complete with verification evidence and affected-feature acknowledgements.');const affected=option('affected-features');result(await store.updateWork(doc.meta.id,expected,{workflow_mode:option('workflow',String(doc.meta.workflow_mode??'simple')),status:option('status',String(doc.meta.status??'draft')),affected_features:affected?affected.split(','):Array.isArray(doc.meta.affected_features)?doc.meta.affected_features as string[]:[]}));}
  else if(command==='refresh-brief-source'){requireAgent();const {doc,expected}=await inputDoc();const planHash=option('plan-hash');if(!planHash)throw new Error('Read the current plan and supply --plan-hash.');result(await store.refreshBriefSource(doc.meta.id,expected,planHash));}
  else if(command==='record-approval'){requireAgent();const {doc,expected}=await inputDoc();result(await store.readyBrief(doc.meta.id,expected,owner(),await ownerInstruction()));}
  else if(command==='record-handoff'){requireAgent();const {doc,expected}=await inputDoc();result(await store.recordHandoff(doc.meta.id,expected,option('revision'),owner(),await ownerInstruction()));}
  else if(command==='complete'){requireAgent();const {doc,expected}=await inputDoc();const state=option('verification');const instruction=state==='accepted_limitations'?await ownerInstruction():undefined;const featureFile=option('feature-updates-file');const updates=featureFile?JSON.parse(await fs.readFile(path.resolve(featureFile),'utf8')):[];result(await store.finishWork(doc.meta.id,expected,state,instruction,updates));}
  else if(command==='review'){
    const action=args[1],id=args[2];
    if(action==='list'){const state=await store.load();console.log(JSON.stringify(state.docs.filter(d=>d.meta.type==='review'&&(!id||d.meta.target_id===id)&&(!option('status')||d.meta.status===option('status'))).map(d=>({...d,messages:messages(d)})),null,2));}
    else if(['reply','resolve','reopen'].includes(action)){requireAgent();const doc=await store.get(id);const expected=option('hash');if(!expected)throw new Error('Provide the thread --hash you read.');result(await store.reply(id,expected,await fileText(),action as 'reply'|'resolve'|'reopen',owner(),'agent',agent));}
    else throw new Error('Use review list|reply|resolve|reopen');
  }
  else throw new Error(`Unknown command: ${command}. Run reduct --help for available commands.`);
}catch(error){console.error((error as Error).message);process.exitCode=1;}

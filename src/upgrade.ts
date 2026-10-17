import { promises as fs } from 'node:fs';
import path from 'node:path';
import { encode, hash } from './model.js';
import { Store } from './store.js';
import { version } from './version.js';
import { guides, readGuide, readApplicationGuide } from './guides.js';

const start='<!-- reduct:application-agents -->',end='<!-- /reduct:application-agents -->';
const block=(text:string)=>{const a=text.indexOf(start),b=text.indexOf(end,a);return a>=0&&b>=a?text.slice(a,b+end.length):undefined;};
type Manifest={schema_version:1;version:string;managed_files:Record<string,string>};
async function saveManifest(store:Store,manifest:Manifest) {
  const target=await store.safe('tool.json');
  const temporary=target+'.tmp';
  await fs.writeFile(temporary,JSON.stringify(manifest,null,2)+'\n');
  await fs.rename(temporary,target);
}
export async function recordWorkspaceVersion(repo:string) {
  const store=new Store(repo);const managed_files:Record<string,string>={};
  for(const relative of Object.keys(guides))managed_files[relative]=hash(await fs.readFile(await store.safe(relative),'utf8'));
  const appText=await fs.readFile(path.join(store.repo,'AGENTS.md'),'utf8');
  const generated=`${start}\n${await readApplicationGuide()}\n${end}`;
  if(block(appText)===generated)managed_files['application-agents-block']=hash(generated);
  await saveManifest(store,{schema_version:1,version,managed_files});
}
export async function syncWorkspace(repo:string) {
  const store=new Store(repo);
  const manifest=JSON.parse(await fs.readFile(await store.safe('tool.json'),'utf8')) as Manifest;
  if(manifest.schema_version!==1||typeof manifest.version!=='string'||!manifest.managed_files||typeof manifest.managed_files!=='object')throw new Error('Unsupported Reduct workspace version metadata. No files were changed.');
  const state=await store.load();
  if(state.errors.length)throw new Error(`Workspace validation failed. No files were changed: ${state.errors.join('; ')}`);
  const updated:string[]=[],skipped:string[]=[];
  // Keep paths and immutable history intact; hierarchy follows stable parent IDs.
  for(const work of state.docs.filter(d=>d.meta.type==='work')) {
    const feature=state.docs.find(d=>d.meta.id===work.meta.parent&&d.meta.type==='feature');
    if(!feature)continue;
    const affected=Array.isArray(work.meta.affected_features)?work.meta.affected_features as string[]:[];
    await store.write(work.path,encode({...work.meta,parent:feature.meta.parent,affected_features:[...new Set([feature.meta.id,...affected])]},work.body),work.hash);
    updated.push(work.path);
  }
  const managed={...manifest.managed_files};
  for(const [relative,template] of Object.entries(guides)) {
    const target=await store.safe(relative),next=await readGuide(template);
    const current=await fs.readFile(target,'utf8').catch((error:NodeJS.ErrnoException)=>{if(error.code==='ENOENT')return undefined;throw error;});
    if(current===next){managed[relative]=hash(next);continue;}
    // Install newly introduced guides without replacing a local file or restoring a deleted managed guide.
    if(current===undefined&&!Object.hasOwn(manifest.managed_files,relative)) {
      await fs.mkdir(path.dirname(target),{recursive:true});
      try {await fs.writeFile(target,next,{flag:'wx'});managed[relative]=hash(next);updated.push(relative);}
      catch(error){if((error as NodeJS.ErrnoException).code==='EEXIST')skipped.push(relative);else throw error;}
      continue;
    }
    if(current===undefined||hash(current)!==manifest.managed_files[relative]){skipped.push(relative);continue;}
    if(await fs.readFile(target,'utf8')!==current){skipped.push(relative);continue;}
    await fs.writeFile(target,next);managed[relative]=hash(next);updated.push(relative);
  }
  const appPath=path.join(store.repo,'AGENTS.md');
  const current=await fs.readFile(appPath,'utf8').catch((error:NodeJS.ErrnoException)=>{if(error.code==='ENOENT')return undefined;throw error;});
  const previous=current===undefined?undefined:block(current);
  const next=`${start}\n${await readApplicationGuide()}\n${end}`;
  if(previous===next)managed['application-agents-block']=hash(next);
  else if(previous&&hash(previous)===manifest.managed_files['application-agents-block']) {
    if(await fs.readFile(appPath,'utf8')!==current)skipped.push('application-agents-block');
    else {await fs.writeFile(appPath,current!.replace(previous,next));managed['application-agents-block']=hash(next);updated.push('application-agents-block');}
  } else skipped.push('application-agents-block');
  await saveManifest(store,{schema_version:1,version,managed_files:managed});
  return {fromVersion:manifest.version,version,updated,skipped};
}

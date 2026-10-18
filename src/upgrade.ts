import { promises as fs } from 'node:fs';
import path from 'node:path';
import { encode, hash } from './model.js';
import { Store } from './store.js';
import { version } from './version.js';
import { rebaseMarkdownLinks, nestMarkdown, containsHtml } from './markdown-links.js';
import { scanSections } from './markdown-sections.js';
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
    if(work.meta.work_kind==='bug') {
      const oldParent=state.docs.find(d=>d.meta.id===work.meta.parent);
      const features=state.docs.filter(d=>d.meta.type==='feature'&&[work.meta.parent,...(Array.isArray(work.meta.affected_features)?work.meta.affected_features:[]),...(work.meta.related??[])].includes(d.meta.id));
      // Do not guess which Feature owns a cross-feature or unlinked legacy bug.
      if(features.length!==1){skipped.push(`${work.meta.id}: choose one owning Feature before migrating this bug`);continue;}
      await store.write(work.path,encode({...work.meta,type:'bug',parent:features[0].meta.id,migrated_from_work:true,original_work_module:oldParent?.meta.type==='feature'?oldParent.meta.parent:work.meta.parent,affected_features:[features[0].meta.id]},work.body),work.hash);
      updated.push(work.path);
      continue;
    }
    const feature=state.docs.find(d=>d.meta.id===work.meta.parent&&d.meta.type==='feature');
    if(!feature)continue;
    const affected=Array.isArray(work.meta.affected_features)?work.meta.affected_features as string[]:[];
    await store.write(work.path,encode({...work.meta,parent:feature.meta.parent,affected_features:[...new Set([feature.meta.id,...affected])]},work.body),work.hash);
    updated.push(work.path);
  }
  // Reload after Work conversion so previously migrated Bugs are consolidated too.
  const bugState=await store.load();
  type ImportedSource={id:string;hash:string;source_type?:string;content_version?:number};
  function addSection(body:string,title:string,content:string,replace=false) {
    const section=scanSections(body).headings.find(h=>h.level===2&&h.title.toLowerCase()===title.toLowerCase());
    if(!section)return body.trimEnd()+`\n\n## ${title}\n\n${content}\n`;
    const current=replace?'':body.slice(section.content,section.end).trimEnd();
    return body.slice(0,section.content)+`\n${current?current+'\n\n':''}${content}\n\n`+body.slice(section.end);
  }
  const retainedBeforeConsolidation=new Set<string>();
  const sources=bugState.docs.filter(d=>['bug_document','plan','analysis','implementation','task'].includes(d.meta.type)&&bugState.docs.some(b=>b.meta.type==='bug'&&b.meta.id===d.meta.parent));
  for(const document of sources) {
    const bug=await store.get(document.meta.parent!);
    const imported=Array.isArray(bug.meta.imported_bug_documents)?bug.meta.imported_bug_documents as ImportedSource[]:[];
    const entry=imported.find(source=>source.id===document.meta.id);
    if(document.meta.merged_into&&entry?.content_version===2)continue;
    if(!document.meta.merged_into&&['superseded','rejected'].includes(String(document.meta.status)))continue;
    if(containsHtml(bug.body)||containsHtml(document.body)){skipped.push(`${document.meta.id}: reconcile HTML manually before consolidation`);continue;}
    const sourcePath=path.relative(path.dirname(bug.path),document.path).split(path.sep).join('/');
    const content=rebaseMarkdownLinks(document.body,document.path,bug.path);
    const label=document.meta.type==='plan'?'Imported plan':document.meta.type==='analysis'?'Investigation':'Imported evidence';
    const block=`### ${label}: ${document.meta.title}\n\nOriginal source: [${document.meta.id}](${sourcePath}).\n\n${nestMarkdown(content,4)}`;
    let body=bug.body;
    if(entry&&entry.content_version!==2) {
      // Repair evidence copied by the earlier migration, without replacing owner edits.
      const previous=`## Imported evidence: ${document.meta.title}\n\nOriginal source: [${document.meta.id}](<${sourcePath}>). Relative references below retain the original source context.\n\n${document.body}`;
      const start=body.indexOf(previous);
      if(start<0||body.indexOf(previous,start+previous.length)!==-1){skipped.push(`${document.meta.id}: reconcile edited imported evidence manually`);continue;}
      body=body.slice(0,start)+`## Imported evidence: ${document.meta.title}\n\nOriginal source: [${document.meta.id}](${sourcePath}).\n\n${nestMarkdown(content,3)}\n`+body.slice(start+previous.length);
    } else if(!entry) {
      const section=document.meta.type==='plan'?'Plan':document.meta.type==='implementation'?'Implementation instructions':document.meta.type==='task'?'Implementation tasks':'Investigation notes';
      // Legacy standalone Plans were canonical; preserve the previous embedded Plan in its snapshot.
      body=addSection(body,section,block,document.meta.type==='plan'&&!imported.some(source=>source.source_type==='plan'));
    }
    if(body!==bug.body||entry?.content_version!==2) {
      if(!retainedBeforeConsolidation.has(bug.meta.id)){await store.snapshot(bug.meta.id,bug.hash,'before_bug_document_consolidation');retainedBeforeConsolidation.add(bug.meta.id);}
      const next={id:document.meta.id,hash:entry?.hash??document.hash,source_type:document.meta.type,content_version:2};
      await store.write(bug.path,encode({...bug.meta,imported_bug_documents:[...imported.filter(source=>source.id!==document.meta.id),next]},body),bug.hash);
      updated.push(bug.path);
    }
    if(!document.meta.merged_into) {
      // Original files, IDs, discussions, and retained versions stay intact as archived evidence.
      if(document.meta.type!=='task')await store.snapshot(document.meta.id,document.hash,'before_bug_document_archive');
      await store.write(document.path,encode({...document.meta,status:'superseded',merged_into:bug.meta.id},document.body),document.hash);
      updated.push(document.path);
    }
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

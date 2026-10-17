import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Doc, Identity, Message, PassageSelection } from '../src/model';
import './style.css';
import { discussionReference } from './discussionReference';
import { RevisionHistory } from './RevisionHistory';
import { RecordIcon, statusInfo, typeLabels } from './presentation';
import { DocumentMarkdown } from './DocumentMarkdown';
import { WorkContext, AffectedFeatures } from './WorkContext';
import { useDocumentRouter, type Route } from './router';
import { Notifications, actionableNotifications, type Notification } from './Notifications';
import { visibleTreeRecords, closedWorkStatuses } from '../src/tree';
import type { BriefState, WorkOverview as WorkSummary } from '../src/workflow';
import { briefPrepared } from '../src/document-content';
import { selectedPassage } from './passageSelection';

type Thread = Doc & { messages: (Message & { body:string })[]; anchor:{state:string} };
type Workspace = { workOverviews?:Record<string,WorkSummary>; briefStates?:Record<string,BriefState>; docs:Doc[]; threads:Thread[]; errors:string[]; identity:Identity|null; repo:string; token:string };
const Icon = ({name}:{name:string}) => <RecordIcon type={name}/>;
function App() {
  const [workspace,setWorkspace]=useState<Workspace>();
  const projectName=workspace?.repo.split(/[\\/]/).filter(Boolean).at(-1)??'Product workspace';
  const [search,setSearch]=useState(''); const [showHistory,setShowHistory]=useState(false);
  const [collapsed,setCollapsed]=useState<Set<string>>(new Set());
  const [expandedFeatures,setExpandedFeatures]=useState<Set<string>>(new Set());
  const treeWorkspace=useRef<string|undefined>(undefined);
  const [error,setError]=useState(''); const [notice,setNotice]=useState('');
  useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),6000);return()=>clearTimeout(timer);},[notice]);
  const [busy,setBusy]=useState(false);
  const [composer,setComposer]=useState<{quote:string;hash:string;selection?:PassageSelection;selectionUnique?:boolean}|null>(null); const [comment,setComment]=useState('');
  const [profile,setProfile]=useState<Identity|null>(null);
  const [showProfile,setShowProfile]=useState(false);
  const [profileName,setProfileName]=useState(''); const [profileEmail,setProfileEmail]=useState('');
  const [selection,setSelection]=useState('');
  const selectedSource=useRef<(PassageSelection & {quote:string;hash:string})|undefined>(undefined);
  const [copyText,setCopyText]=useState('');
  const [openedHash,setOpenedHash]=useState('');
  const [readingNotice,setReadingNotice]=useState('');
  const [seenReplies,setSeenReplies]=useState<Record<string,string>>({});
  const {route,navigate}=useDocumentRouter(()=>!composer||!comment.trim()||window.confirm('Discard your unsent comment?'));
  const selected=route.id; const tab=route.tab; const focusThread=route.thread??'';
  function setTab(tab:Route['tab']) { navigate({...route,tab}); }
  const documentRef=useRef<HTMLDivElement>(null);
  const selectedTreeRow=useRef<HTMLDivElement>(null);
  async function refresh() {
    const response=await fetch('/api/workspace');
    const data=await response.json(); if(!response.ok) throw new Error(data.error);
    if(treeWorkspace.current!==data.repo) {
      let saved:{collapsed?:unknown;expandedFeatures?:unknown}={};
      try { saved=JSON.parse(localStorage.getItem(`reduct-tree:${data.repo}`)??'{}')??{}; } catch {}
      const ids=(value:unknown)=>new Set<string>(Array.isArray(value)?value.filter((id):id is string=>typeof id==='string'):[]);
      setCollapsed(ids(saved.collapsed));setExpandedFeatures(ids(saved.expandedFeatures));
      treeWorkspace.current=data.repo;
    }
    setWorkspace(data); return data as Workspace;
  }
  useEffect(()=> { refresh().catch(e=>setError(e.message)); const timer=setInterval(()=>refresh().catch(e=>setError(e.message)),3000); return ()=>clearInterval(timer); },[]);
  useEffect(()=> { try { setProfile(JSON.parse(localStorage.getItem(`reduct-profile:${workspace?.repo}`)??'null')); } catch { setProfile(null); } },[workspace?.repo]);
  useEffect(()=> { setComposer(null);setComment('');setSelection('');selectedSource.current=undefined; },[selected,tab,focusThread]);
  const doc=workspace?.docs.find(d=>d.meta.id===selected);
  const workOverview=workspace?.workOverviews?.[selected];
  const briefState=workspace?.briefStates?.[selected];
  const prepared=doc?.meta.type==='implementation'?briefPrepared(doc):true;
  const sourcePlan=workspace?.docs.find(d=>d.meta.id===doc?.meta.source_plan);
  const info=doc?(!prepared?{label:'Not prepared',meaning:'Implementation instructions have not been written.',next:'Your planning agent prepares the brief after the plan’s decisions are settled.'}:statusInfo(workOverview?{...doc.meta,status:workOverview.stage}:briefState&&briefState.drift!=='current'?{...doc.meta,status:'brief_needs_update'}:doc.meta)):null;
  const viewTab=tab;
  useEffect(()=>{if(!doc||!workspace)return;let reads:Record<string,string>={};try{reads=JSON.parse(localStorage.getItem(`reduct-read:${workspace.repo}`)??'{}');}catch{}
    if(!reads||typeof reads!=='object'||Array.isArray(reads))reads={};
    setReadingNotice(reads[doc.meta.id]&&reads[doc.meta.id]!==doc.hash?'This document changed since your last visit.':'');setOpenedHash(doc.hash);reads[doc.meta.id]=doc.hash;localStorage.setItem(`reduct-read:${workspace.repo}`,JSON.stringify(reads));
  },[selected,doc?.meta.id,workspace?.repo]);
  useEffect(()=>{if(!workspace)return;let seen:Record<string,string>={};try{const stored=localStorage.getItem(`reduct-seen-replies:${workspace.repo}`);if(stored)seen=JSON.parse(stored);else{const reads=JSON.parse(localStorage.getItem(`reduct-read:${workspace.repo}`)??'{}');for(const thread of workspace.threads){const last=thread.messages.at(-1);if(last&&reads[String(thread.meta.target_id)])seen[thread.meta.id]=last.id;}}}catch{}if(!seen||typeof seen!=='object'||Array.isArray(seen))seen={};setSeenReplies(seen);localStorage.setItem(`reduct-seen-replies:${workspace.repo}`,JSON.stringify(seen));},[workspace?.repo]);
  const notifications=actionableNotifications(workspace?.docs??[],workspace?.briefStates??{},seenReplies);
  function markReplyRead(threadId:string,replyId:string){if(!workspace)return;setSeenReplies(current=>{if(current[threadId]===replyId)return current;const next={...current,[threadId]:replyId};localStorage.setItem(`reduct-seen-replies:${workspace.repo}`,JSON.stringify(next));return next;});}
  function openNotification(item:Notification){if(!navigate({id:item.targetId,tab:'document',...(item.threadId?{thread:item.threadId}:{})}))return false;if(item.threadId&&item.replyId)markReplyRead(item.threadId,item.replyId);return true;}
  const related=(doc?.meta.related??[]).map(id=>workspace?.docs.find(d=>d.meta.id===id)).filter((d):d is Doc=>!!d);
  const identity=workspace?.identity ?? profile;
  const threads=workspace?.threads.filter(t=>t.meta.target_id===selected) ?? [];
  const snapshots=workspace?.docs.filter(d=>d.meta.type==='snapshot'&&d.meta.parent===selected).sort((a,b)=>String(b.meta.retained_at).localeCompare(String(a.meta.retained_at)))??[];
  async function post(endpoint:string,input:unknown) {
    const response=await fetch(`/api/${endpoint}`,{method:'POST',headers:{'Content-Type':'application/json','X-Reduct-Token':workspace?.token??''},body:JSON.stringify(input)});
    const data=await response.json(); if(!response.ok) throw new Error(data.error); return data;
  }
  async function perform(action:()=>Promise<unknown>,success:string) {
    setBusy(true);setError('');setNotice('');
    try { await action();await refresh();setNotice(success); return true; } catch(e) { setError((e as Error).message); return false; } finally { setBusy(false); }
  }
  async function copyImplementation() {
    if(doc?.meta.type!=='implementation')return;
    setError('');setNotice('');
    try { await navigator.clipboard.writeText(doc.body);setNotice('Implementation brief copied.'); }
    catch { setCopyText(doc.body); }
  }
  function startComment(quote=selection) {
    if(!identity) { setShowProfile(true);return; }
    if(!doc)return;
    const passage=quote&&selectedSource.current?.quote===quote?selectedSource.current:undefined;
    if(quote&&!passage) { setError('Select a passage within the document before commenting.');return; }
    if(passage&&passage.hash!==doc.hash) { setError('The document changed. Select the passage again before commenting.');return; }
    setComposer({quote,hash:doc.hash,...(passage?{selection:{start:passage.start,end:passage.end,source:passage.source},selectionUnique:doc.body.indexOf(passage.source)===doc.body.lastIndexOf(passage.source)}:{})});setComment('');
  }
  function choose(id:string) {
    return navigate({id,tab:'document'});
  }
  const breadcrumbs:Doc[]=[]; let ancestor=doc; const seen=new Set();
  while(ancestor&&!seen.has(ancestor.meta.id)) { seen.add(ancestor.meta.id);breadcrumbs.unshift(ancestor);ancestor=workspace?.docs.find(d=>d.meta.id===ancestor!.meta.parent); }
  const documentPath=breadcrumbs.map(d=>d.meta.id).join('/');
  useEffect(()=>{
    if(!doc||!workspace)return;
    const parents=breadcrumbs.slice(0,-1);
    const nextCollapsed=new Set(collapsed),nextExpanded=new Set(expandedFeatures);
    for(const parent of parents) {
      nextCollapsed.delete(parent.meta.id);
      if(parent.meta.type==='feature')nextExpanded.add(parent.meta.id);
    }
    setCollapsed(nextCollapsed);setExpandedFeatures(nextExpanded);setSearch('');
    if(breadcrumbs.some(d=>d.meta.type==='work'&&closedWorkStatuses.includes(String(d.meta.status))))setShowHistory(true);
    try { localStorage.setItem(`reduct-tree:${workspace.repo}`,JSON.stringify({collapsed:[...nextCollapsed],expandedFeatures:[...nextExpanded]})); } catch {}
    // Reveal once after navigation's expansion has rendered, not on manual toggles.
    const frame=requestAnimationFrame(()=>selectedTreeRow.current?.scrollIntoView({block:'nearest'}));
    return ()=>cancelAnimationFrame(frame);
  },[documentPath,workspace?.repo]);
  const navigable=workspace?visibleTreeRecords(workspace.docs,showHistory).filter(d=>!['review','snapshot','task','guide'].includes(d.meta.type)&&!(d.meta.type==='plan'&&d.meta.status==='superseded')):[];
  const treeSelection=[...breadcrumbs].reverse().find(d=>navigable.some(n=>n.meta.id===d.meta.id))?.meta.id;
  function toggleTree(d:Doc) {
    const nextCollapsed=new Set(collapsed),nextExpanded=new Set(expandedFeatures);
    const target=d.meta.type==='feature'?nextExpanded:nextCollapsed;
    target.has(d.meta.id)?target.delete(d.meta.id):target.add(d.meta.id);
    setCollapsed(nextCollapsed);setExpandedFeatures(nextExpanded);
    try { localStorage.setItem(`reduct-tree:${workspace!.repo}`,JSON.stringify({collapsed:[...nextCollapsed],expandedFeatures:[...nextExpanded]})); } catch {}
  }
  function node(d:Doc,depth=0):React.ReactNode {
    const children=navigable.filter(c=>c.meta.parent===d.meta.id);
    if(d.meta.type==='module')children.sort((a,b)=>Number(b.meta.type==='work')-Number(a.meta.type==='work'));
    const matches=(record:Doc):boolean=>record.meta.title.toLowerCase().includes(search.toLowerCase()) || navigable.some(c=>c.meta.parent===record.meta.id&&matches(c));
    if(search&&!matches(d))return null;
    const closed=(d.meta.type==='feature'?!expandedFeatures.has(d.meta.id):collapsed.has(d.meta.id))&&!search;
    return <React.Fragment key={d.meta.id}><div ref={treeSelection===d.meta.id?selectedTreeRow:undefined} className={`tree-row type-${d.meta.type} ${treeSelection===d.meta.id?'active':''}`} style={{marginLeft:10+depth*15,paddingLeft:14}}>
      <button className="tree-item" onClick={()=>choose(d.meta.id)}><Icon name={d.meta.type}/><span>{d.meta.title}{d.meta.type==='work'&&<small className="work-kind">{String(d.meta.work_kind??'enhancement')}</small>}</span></button>
      {!!children.length&&<button className="tree-toggle" aria-expanded={!closed} aria-label={`${closed?'Expand':'Collapse'} ${d.meta.title}`} onClick={()=>toggleTree(d)}>{closed?'›':'⌄'}</button>}
    </div>{!closed&&children.map(c=>node(c,depth+1))}</React.Fragment>;
  }
  const closedCount=workspace?.docs.filter(d=>d.meta.type==='work'&&closedWorkStatuses.includes(String(d.meta.status))).length??0;
  const linkedWork=doc?.meta.type==='feature'?Object.values(workspace?.workOverviews??{}).filter(w=>w.affectedFeatureIds.includes(selected)&&(showHistory||!closedWorkStatuses.includes(String(workspace?.docs.find(d=>d.meta.id===w.id)?.meta.status)))):[];
  return <div className="app">
    <aside className="sidebar">
      <a className="brand" href="/"><span className="brand-mark">r</span>reduct<span className="local-pill">LOCAL</span></a>
      <div className="project"><div className="project-symbol">{projectName.slice(0,1).toUpperCase()}</div><div><strong>{projectName}</strong><small>Documentation & planning</small></div></div>
      <label className="search"><span aria-hidden="true">⌕</span><input aria-label="Search documents" placeholder="Find a feature or plan…" value={search} onChange={e=>setSearch(e.target.value)}/></label>
      <div className="nav-label">PRODUCT MAP</div>
      <label className="tree-history-toggle"><input type="checkbox" checked={showHistory} onChange={e=>setShowHistory(e.target.checked)}/>Show closed work <span>{closedCount}</span></label><nav aria-label="Product hierarchy">{navigable.filter(d=>d.meta.type==='module').map(d=>node(d))}</nav>
      <button className="help-link" onClick={()=>choose('GUIDE-ui')}><Icon name="guide"/> How to use Reduct</button>
    </aside>
    <div className="workspace">
      <header className="topbar"><div className="breadcrumbs topbar-breadcrumbs">{breadcrumbs.map((b,i)=><React.Fragment key={b.meta.id}>{i>0&&<span>/</span>}<button onClick={()=>choose(b.meta.id)}>{b.meta.title}</button></React.Fragment>)}</div><div className="topbar-actions"><Notifications items={notifications} onOpen={openNotification}/>
<div className="profile top-profile"><div className="avatar" title={identity?.email}>{identity?.name.slice(0,1)??'?'}</div><div><strong>{identity?.name??'Set your author profile'}</strong><small>{identity?.email??'Name and email required to comment'}</small></div>{!workspace?.identity&&<button aria-label="Set author profile" className="quiet" onClick={()=>{setProfileName(profile?.name??'');setProfileEmail(profile?.email??'');setShowProfile(true);}}>✎</button>}</div></div></header>
      {!!workspace?.errors.length&&<details className="validation"><summary>{workspace.errors.length} record issues need attention</summary>{workspace.errors.map((e,i)=><p key={i}>{e}</p>)}</details>}
      {!workspace?<div className="empty-state">Opening your workspace…</div>:!doc?<div className="empty-state"><h2>Choose a document</h2><p>Browse a module or feature in the product map.</p></div>:<>
        <div className={`document-header type-${doc.meta.type}`}>
          <div className="title-row"><div><div className="eyebrow"><Icon name={doc.meta.type}/>{typeLabels[doc.meta.type]??doc.meta.type}{doc.meta.type!=='implementation'&&<><span>·</span><span className="status-chip" title={info?.meaning}>{info?.label}</span></>}</div><h1>{doc.meta.title}</h1></div>{doc.meta.type==='implementation'&&<div className="header-actions"><button className="button" disabled={busy} onClick={copyImplementation}>Copy for implementation</button></div>}</div>
          <div className="document-details file-path">.reduct/{doc.path}<span className="hash">{doc.hash.slice(0,8)}</span></div>
        </div>
          <div className="tabs document-tabs"><button className={viewTab==='document'?'selected':''} onClick={()=>setTab('document')}>{doc.meta.type==='work'?'Details':'Document'}</button>{['work','plan','feature','module','analysis','implementation'].includes(doc.meta.type)&&<button className={viewTab==='history'?'selected':''} onClick={()=>setTab('history')}>History <span>{snapshots.length}</span></button>}</div>
        {(readingNotice||(openedHash&&openedHash!==doc.hash))&&<div className="reading-update" role="status">{openedHash!==doc.hash?'The agent changed this document while you were reading. The latest version is shown below.':readingNotice}</div>}
        <div className="content-grid"><main className={`document-pane type-${doc.meta.type}`}>
          {viewTab==='history'?<RevisionHistory doc={doc} snapshots={snapshots} open={choose}/>:<>
            {doc.meta.type==='snapshot'&&<div className="saved-version-note">Saved version · <button className="document-link" onClick={()=>choose(String(doc.meta.parent))}>Open current document</button></div>}
            {doc.meta.type==='implementation'&&briefState&&briefState.drift!=='current'&&<div className="drift-warning" role="status"><strong>Brief needs updating</strong><p>{briefState.drift==='missing'?'The source plan or saved version is missing. Ask your planning agent to restore it.':'The plan changed after this brief was prepared. Ask your planning agent to update the instructions before implementation.'}</p>{sourcePlan&&<button className="button" onClick={()=>choose(sourcePlan.meta.id)}>Read current plan</button>}</div>}
            {!!doc.meta.owner_decision&&<details className="owner-decision"><summary>Decision recorded from your agent conversation</summary><blockquote>{String((doc.meta.owner_decision as {instruction?:string}).instruction??'Instruction not recorded')}</blockquote><small>Recorded by {String((doc.meta.owner_decision as {recorded_by?:string}).recorded_by??'agent')}. This is a local decision record, not an authenticated transcript.</small></details>}
            <div className="markdown" ref={documentRef} onMouseUp={()=> { const s=window.getSelection();if(s&&documentRef.current){const passage=selectedPassage(documentRef.current,s,doc.body);selectedSource.current=passage?{...passage,hash:doc.hash}:undefined;setSelection(passage?.quote??'');} }}><DocumentMarkdown doc={doc} docs={workspace.docs} choose={choose}/></div>
            {!!linkedWork.length&&<section className="linked-work"><h2>Work affecting this feature</h2>{linkedWork.map(w=>{const item=workspace.docs.find(d=>d.meta.id===w.id)!;return <button className="linked-work-card" key={w.id} onClick={()=>choose(w.id)}><Icon name="work"/><span><strong>{item.meta.title}</strong><small>{statusInfo({...item.meta,status:w.stage}).label}</small></span><span>↗</span></button>;})}</section>}
            {!!related.length&&<section className="related-features"><h2>Related features</h2>{related.map(r=><button key={r.meta.id} className="button" onClick={()=>choose(r.meta.id)}><Icon name={r.meta.type}/> {r.meta.title} ↗</button>)}</section>}
          </>}
        </main><aside className="review-pane">{doc.meta.type==='work'&&workOverview&&<WorkContext summary={workOverview} docs={workspace.docs} choose={choose}/>}{doc.meta.type==='work'&&workOverview&&<AffectedFeatures summary={workOverview} docs={workspace.docs} choose={choose}/>}<div className="review-heading"><div><h2>Discussion</h2></div><span className="count">{threads.length}</span></div>
          {selection&&['module','feature','work','plan','analysis','implementation'].includes(doc.meta.type)&&<div className="selection-toolbar"><span>Passage selected</span><button className="button primary" onClick={()=>startComment()}>Comment on selection</button></div>}

          {!threads.length&&!composer&&<div className="review-empty"><span>◌</span><h3>No discussions yet</h3><p>Select a passage or ask a question about this document.</p></div>}
          {threads.map(thread=><Review key={thread.meta.id} repo={workspace.repo} thread={thread} busy={busy} focused={focusThread===thread.meta.id} onRead={markReplyRead} act={body=>{if(!identity){setShowProfile(true);return;}return perform(()=>post('reply',{id:thread.meta.id,hash:thread.hash,body,author:identity}),'Follow-up saved. The planning agent can respond to this discussion.');}}/>)}
          {['module','feature','work','plan','analysis','implementation'].includes(doc.meta.type)&&<button className="button primary discussion-clarification" onClick={()=>startComment('')}>Add comment</button>}
          {composer&&<form className="comment-composer" onSubmit={e=>{e.preventDefault();perform(async()=>{await post('comment',{id:doc.meta.id,hash:composer.hash,body:comment,quote:composer.quote,selection:composer.selection,author:identity});setComposer(null);setSelection('');setComment('');},'Comment saved. Tell your planning agent which document has your feedback.');}}><strong>{composer.quote?'Comment on passage':'Document comment'}</strong>{doc.hash!==composer.hash&&<div className="comment-update"><p>The document changed while you were writing. Your question is preserved.</p><button className="button" type="button" onClick={()=>{const source=composer.selection?.source??composer.quote;const start=source?doc.body.indexOf(source):-1;if(source&&(composer.selectionUnique===false||start<0||doc.body.indexOf(source,start+source.length)!==-1)){setComment('About an earlier passage:\n> '+composer.quote+'\n\n'+comment);setComposer({quote:'',hash:doc.hash});}else setComposer({...composer,hash:doc.hash,...(source?{selection:{start,end:start+source.length,source}}:{})});}}>Attach question to the latest version</button></div>}{composer.quote&&<blockquote>{composer.quote}</blockquote>}<textarea autoFocus aria-label="Your comment" placeholder="Add a comment, question, or mismatch you noticed…" value={comment} onChange={e=>setComment(e.target.value)} required/><div className="composer-actions"><button type="button" className="quiet" onClick={()=>setComposer(null)}>Cancel</button><button className="button primary" disabled={busy||!comment.trim()}>Post comment</button></div></form>}

        </aside></div>
      </>}
    </div>
    {(error||notice)&&<div className={`toast ${error?'error':'success'}`} role={error?'alert':'status'}><span>{error||notice}</span><button className="quiet" onClick={()=>{setError('');setNotice('');}} aria-label="Dismiss notification">×</button></div>}
    {!!copyText&&<div className="modal-backdrop"><div className="modal briefing-modal"><h2>Implementation brief</h2><p>Your browser could not copy automatically. Select and copy the document below.</p><textarea aria-label="Implementation brief content" readOnly value={copyText} onFocus={e=>e.target.select()}/><button className="button primary" onClick={()=>setCopyText('')}>Done</button></div></div>}
    {showProfile&&<div className="modal-backdrop"><form className="modal" onSubmit={e=>{e.preventDefault();const identity={name:profileName.trim(),email:profileEmail.trim(),source:'local'};if(!identity.name||! /^[^\s@]+@[^\s@]+$/.test(identity.email)){setError('Enter a valid name and email.');return;}localStorage.setItem(`reduct-profile:${workspace?.repo}`,JSON.stringify(identity));setProfile(identity);setShowProfile(false);}}><h2>Your local author profile</h2><p>This workspace has no complete Git author identity. Set a local profile for comments. Your Git configuration will stay unchanged.</p><label>Name<input value={profileName} onChange={e=>setProfileName(e.target.value)} required/></label><label>Email<input type="email" value={profileEmail} onChange={e=>setProfileEmail(e.target.value)} required/></label><div className="composer-actions"><button type="button" className="quiet" onClick={()=>setShowProfile(false)}>Cancel</button><button className="button primary">Save profile</button></div><small>Author attribution, not authenticated sign-in.</small></form></div>}
  </div>;
}
function Review({thread,repo,busy,act,focused,onRead}:{thread:Thread;repo:string;busy:boolean;focused:boolean;onRead:(threadId:string,replyId:string)=>void;act:(body:string)=>Promise<boolean>|undefined}) {
  const [text,setText]=useState('');const [replying,setReplying]=useState(false);const [expanded,setExpanded]=useState(thread.meta.status==='open');
  const [copyFeedback,setCopyFeedback]=useState('');
  useEffect(()=>{if(!copyFeedback)return;const timer=setTimeout(()=>setCopyFeedback(''),2000);return()=>clearTimeout(timer);},[copyFeedback]);
  async function copyLocation() {
    try { await navigator.clipboard.writeText(discussionReference(thread,repo));setCopyFeedback('Copied'); }
    catch { setCopyFeedback('Could not copy'); }
  }
  const threadRef=useRef<HTMLElement>(null);
  useEffect(()=>{if(focused){setExpanded(true);threadRef.current?.scrollIntoView({block:'center',behavior:'auto'});}},[focused]);
  const lastMessage=thread.messages.at(-1);
  useEffect(()=>{if(expanded&&lastMessage?.actor_kind==='agent')onRead(thread.meta.id,lastMessage.id);},[expanded,lastMessage?.id]);
  const resolved=thread.meta.status==='resolved';
  return <article ref={threadRef} className={`thread ${resolved?'resolved':''}`}><div className="thread-status"><span className={resolved?'resolved-label':'open-label'}>{resolved?'✓ Addressed':'● Open discussion'}</span><span className="discussion-copy"><button className="quiet" type="button" aria-label="Copy comment location" title="Copy comment location" onClick={copyLocation}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg></button>{copyFeedback&&<span className="copy-tooltip" role="status">{copyFeedback}</span>}</span>{thread.anchor.state==='outdated'&&<span className="anchor-warning">Original passage outdated</span>}{thread.anchor.state==='moved'&&<span className="anchor-warning">Earlier revision</span>}<button className="quiet" onClick={()=>setExpanded(!expanded)} aria-label={`${expanded?'Collapse':'Expand'} thread`}>{expanded?'−':'＋'}</button></div>{expanded&&<>{!!thread.meta.quote&&<blockquote>{String(thread.meta.quote)}</blockquote>}{thread.messages.map(message=><div className="message" key={message.id}><div className="message-author"><div className="avatar small">{message.author.name[0]}</div><div><strong>{message.actor_kind==='agent'?message.agent_name:message.author.name}</strong><small title={message.author.email}>{message.actor_kind==='agent'?`Agent · ${new Date(message.created_at).toLocaleString()}`:new Date(message.created_at).toLocaleString()}</small></div>{['resolve','reopen'].includes(message.kind)&&<span className="message-kind">{message.kind==='resolve'?'Addressed':'Reopened'}</span>}</div><Markdown remarkPlugins={[remarkGfm]}>{message.body}</Markdown></div>)}{replying?<div className="reply-form"><textarea aria-label="Clarification follow-up" placeholder="Ask a follow-up or clarify your question…" value={text} onChange={e=>setText(e.target.value)}/><div className="reply-buttons"><button className="button" disabled={busy||!text.trim()} onClick={async()=>{if(await act(text)){setText('');setReplying(false);}}}>Reply</button><button className="quiet" onClick={()=>setReplying(false)}>Cancel</button></div></div>:<button className="quiet reply-link" onClick={()=>setReplying(true)}>{resolved?'Ask a follow-up':'Reply to discussion'}</button>}<details className="thread-file"><summary>Agent-readable file</summary><code>.reduct/{thread.path}</code></details></>}</article>;
}
createRoot(document.getElementById('root')!).render(<App/>);

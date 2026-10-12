import { useEffect, useRef, useState } from 'react';
import type { Doc, Message } from '../src/model';
import { briefPrepared } from '../src/document-content';
import { visibleTreeRecords } from '../src/tree';
import type { BriefState } from '../src/workflow';

export type Notification={id:string;targetId:string;threadId?:string;replyId?:string;kind:'decision'|'review'|'reply'|'drift';title:string;detail:string};
export function actionableNotifications(docs:Doc[],briefStates:Record<string,BriefState>,seenReplies:Record<string,string>):Notification[] {
  const items:Notification[]=[];
  const active=new Set(visibleTreeRecords(docs,false).map(d=>d.meta.id));
  for(const doc of docs) {
    if(active.has(doc.meta.id)&&doc.meta.type==='work'&&doc.meta.status==='needs_owner_decision')items.push({id:doc.meta.id,targetId:doc.meta.id,kind:'decision',title:doc.meta.title,detail:'Discuss this decision with your planning agent'});
    if(active.has(doc.meta.id)&&['plan','work'].includes(doc.meta.type)&&doc.meta.status==='ready_for_review'&&!docs.some(b=>b.meta.type==='implementation'&&b.meta.source_plan===doc.meta.id&&briefPrepared(b)&&briefStates[b.meta.id]?.drift==='current'))items.push({id:doc.meta.id,targetId:doc.meta.id,kind:'review',title:doc.meta.title,detail:'Read the proposal and give your decision directly to the agent'});
    if(active.has(doc.meta.id)&&doc.meta.type==='implementation'&&briefStates[doc.meta.id]?.drift&&briefStates[doc.meta.id].drift!=='current')items.push({id:doc.meta.id,targetId:doc.meta.id,kind:'drift',title:doc.meta.title,detail:briefStates[doc.meta.id].drift==='missing'?'The source plan or saved version is missing':'The source plan changed; ask your agent to update the brief'});
    if(doc.meta.type==='review') {
      const last=Array.isArray(doc.meta.messages)?(doc.meta.messages as Message[]).at(-1):undefined;
      if(last?.actor_kind==='agent'&&seenReplies[doc.meta.id]!==last.id)items.push({id:doc.meta.id,targetId:String(doc.meta.target_id),threadId:doc.meta.id,replyId:last.id,kind:'reply',title:doc.meta.title,detail:'Read the agent’s response to your clarification'});
    }
  }
  return items;
}
export function Notifications({items,onOpen}:{items:Notification[];onOpen:(item:Notification)=>boolean}) {
  const [open,setOpen]=useState(false);const container=useRef<HTMLDivElement>(null);const trigger=useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    if(!open)return;
    const outside=(event:PointerEvent)=>{if(container.current&&!container.current.contains(event.target as Node))setOpen(false);};
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){setOpen(false);trigger.current?.focus();}};
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
  },[open]);
  return <div className="notifications" ref={container}><button className="notification-trigger" ref={trigger} aria-label={`Notifications${items.length?`, ${items.length} actionable items`:''}`} aria-expanded={open} aria-controls="notification-menu" onClick={()=>setOpen(!open)}><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/></svg>{!!items.length&&<span className="notification-badge">{items.length>99?'99+':items.length}</span>}</button>{open&&<div className="notification-menu" id="notification-menu" role="dialog" aria-label="Actionable notifications"><div className="notification-heading"><strong>Needs your attention</strong><span>{items.length}</span></div>{items.length?<div className="notification-items">{items.map(item=><button className={`notification-item notification-${item.kind}`} key={item.id} onClick={()=>{if(onOpen(item))setOpen(false);}}><span className="notification-kind">{({decision:'Decision',review:'Plan review',reply:'Agent reply',drift:'Brief needs updating'})[item.kind]}</span><strong>{item.title}</strong><small>{item.detail}</small></button>)}</div>:<div className="notification-empty">Nothing needs your attention right now.</div>}</div>}</div>;
}

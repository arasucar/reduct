import type { Doc } from './model.js';

export function briefPrepared(brief:Doc):boolean {
  // Templates have no executable content until their instruction sections are filled.
  if(/\[Write[^\]]*\]/i.test(brief.body))return false;
  return !!brief.body.replace(/^#{1,6} .+$/gm,'').trim();
}

export function markdownSection(body:string,names:string[]):string {
  const headings=[...body.matchAll(/^(#{2,6})\s+(.+)\r?$/gm)];
  const index=headings.findIndex(m=>names.includes(m[2].trim().toLowerCase()));
  if(index<0)return '';
  const heading=headings[index];
  const next=headings.slice(index+1).find(m=>m[1].length<=heading[1].length);
  return body.slice(heading.index!+heading[0].length,next?.index).trim();
}
export function planText(doc:Doc):string {
  return doc.meta.type==='work'||(doc.meta.type==='snapshot'&&doc.meta.source_type==='work')?markdownSection(doc.body,['plan']):doc.body;
}

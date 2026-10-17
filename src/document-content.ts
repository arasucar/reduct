import type { Doc } from './model.js';
import { scanSections } from './markdown-sections.js';

export function briefPrepared(brief:Doc):boolean {
  // Templates have no executable content until their instruction sections are filled.
  if(/\[Write[^\]]*\]/i.test(brief.body))return false;
  return !!brief.body.replace(/^#{1,6} .+$/gm,'').trim();
}

export function markdownSection(body:string,names:string[]):string {
  const heading=scanSections(body).headings.find(h=>h.level>=2&&names.includes(h.title.toLowerCase()));
  return heading?body.slice(heading.content,heading.end).trim():'';
}
export function planText(doc:Doc):string {
  return doc.meta.type==='work'||(doc.meta.type==='snapshot'&&doc.meta.source_type==='work')?markdownSection(doc.body,['plan']):doc.body;
}

/** Discussion and testing notes can evolve without changing handed-off instructions. */
export function implementationPlanText(doc:Doc):string {
  // Unknown HTML block boundaries must not hide potentially changed instructions.
  if(scanSections(doc.body).unsupportedHtml)return doc.body;
  const body=planText(doc);
  const headings=scanSections(body).headings;
  const notes=new Set(['open questions','open questions for review','investigation notes','testing observations']);
  let result='',cursor=0;
  for(const heading of headings) {
    if(heading.start<cursor||!notes.has(heading.title.toLowerCase()))continue;
    result+=body.slice(cursor,heading.start);
    cursor=heading.end;
  }
  return (result+body.slice(cursor)).trim();
}

import path from 'node:path';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { toMarkdown } from 'mdast-util-to-markdown';
import type { Nodes } from 'mdast';
import { scanSections } from './markdown-sections.js';

/** Rebase parsed destinations only: labels, code examples, and surrounding formatting stay intact. */
export function rebaseMarkdownLinks(body:string, sourcePath:string, targetPath:string):string {
  const edits:{start:number;end:number;text:string}[]=[];
  function visit(node:Nodes) {
    if ('children' in node)for(const child of node.children)visit(child);
    if(!['link','image','definition'].includes(node.type)||!('url' in node)||!node.position)return;
    const url=node.url;
    if(/^(?:[a-z][a-z\d+.-]*:|\/)/i.test(url))return;
    const boundary=url.search(/[?#]/),file=boundary<0?url:url.slice(0,boundary),suffix=boundary<0?'':url.slice(boundary);
    const destination=file?path.posix.join(path.posix.dirname(sourcePath),file):sourcePath;
    node.url=(path.posix.relative(path.posix.dirname(targetPath),destination)||path.posix.basename(targetPath))+suffix;
    const start=node.position.start.offset!,end=node.position.end.offset!;
    if(node.type==='link') {
      // Keep the original label (including nested images and GFM formatting); replace just (...).
      const labelEnd=node.children.at(-1)?.position?.end.offset??start;
      const closing=body.indexOf('](',labelEnd);
      if(closing<0||closing>=end)return;
      const serialized=toMarkdown({...node,children:[{type:'text',value:'label'}]}).trimEnd();
      edits.push({start:closing+1,end,text:serialized.slice(serialized.indexOf(']')+1)});
    } else edits.push({start,end,text:toMarkdown(node).trimEnd()});
  }
  visit(fromMarkdown(body));
  let result=body;
  for(const edit of edits.sort((a,b)=>b.start-a.start))result=result.slice(0,edit.start)+edit.text+result.slice(edit.end);
  return result;
}

/** Nest imported sections so their headings cannot replace the Bug's canonical Plan or outcome. */
export function nestMarkdown(body:string, level:number):string {
  const headings=scanSections(body).headings;
  let result=body;
  for(const heading of [...headings].reverse()) {
    const lineEnd=body.indexOf('\n',heading.start);
    const end=lineEnd<0?body.length:lineEnd;
    result=result.slice(0,heading.start)+'#'.repeat(Math.min(6,heading.level+level-1))+' '+heading.title+result.slice(end);
  }
  return result.trim();
}

/** Markdown angle-bracket destinations are not HTML blocks. */
export function containsHtml(body:string):boolean {
  function visit(node:Nodes):boolean {
    return node.type==='html'||('children' in node&&node.children.some(visit));
  }
  return visit(fromMarkdown(body));
}

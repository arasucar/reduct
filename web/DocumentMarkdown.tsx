import { createContext, useContext, useState } from 'react';
import Markdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Doc } from '../src/model';
import { passagePositions } from './passageSelection';
function Reference({href,children,repository}:{href:string;children:React.ReactNode;repository?:string}) {
  const [expanded,setExpanded]=useState(false);
  const commit=href.startsWith('commit:');
  let value=href.slice(href.indexOf(':')+1);try{value=decodeURIComponent(value);}catch{/* Show malformed hand-edited references without crashing the document. */}
  const location=commit?value:`${repository?repository.replace(/\/$/,'')+'/':''}${value}`;
  return <span className={`reference ${commit?'commit-reference':'code-reference'}`}><button type="button" title={location} aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}><span aria-hidden="true">{commit?'◉':'⌘'}</span>{children}</button>{expanded&&<span className="reference-detail" role="note"><strong>{commit?'Source commit':'Code reference'}</strong><code>{location}</code><small>Select the location to copy it. Code inspected is not a runtime test pass.</small></span>}</span>;
}
type Context={doc:Doc;docs:Doc[];choose:(id:string)=>void};
const DocumentContext=createContext<Context|null>(null);
function DocumentLink({href,children}:{href?:string;children?:React.ReactNode}) {
  const context=useContext(DocumentContext)!;const {doc,docs,choose}=context;
  if(href&&/^(code|commit):/.test(href))return <Reference href={href} repository={typeof doc.meta.source_repository==='string'?doc.meta.source_repository:undefined}>{children}</Reference>;
  const original=doc.meta.type==='snapshot'?docs.find(d=>d.meta.id===doc.meta.parent):undefined;
  const documentPath=(doc.meta.type==='snapshot'&&typeof doc.meta.source_path==='string'?doc.meta.source_path:original?.path)??doc.path;
  const pieces=documentPath.split('/').slice(0,-1);
  if(doc.meta.type==='snapshot'&&!original&&!doc.meta.source_path&&pieces.at(-1)==='revisions')pieces.pop();
  if(href&&!/^(?:[a-z]+:|\/|#)/i.test(href))for(const piece of href.split('#')[0].split('/')){if(piece==='..')pieces.pop();else if(piece&&piece!=='.')pieces.push(piece);}
  const target=href&&!/^(?:[a-z]+:|\/|#)/i.test(href)?docs.find(d=>d.path===pieces.join('/')):undefined;
  return target?<button className="document-link" onClick={()=>choose(target.meta.id)}>{children}</button>:<a href={href} target={href?.startsWith('http')?'_blank':undefined} rel="noreferrer">{children}</a>;
}
const components={a:DocumentLink};
export function DocumentMarkdown(context:Context) {
  return <DocumentContext.Provider value={context}><Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[passagePositions]} urlTransform={url=>/^(code|commit):/.test(url)?url:defaultUrlTransform(url)} components={components}>{context.doc.body}</Markdown></DocumentContext.Provider>;
}

import { useEffect, useState } from 'react';
import type { Doc } from '../src/model';
import type { DiffLine } from '../src/compare';

/** Retain original records, but show one entry per distinct document text. */
export function distinctRevisions(snapshots:Doc[]):Doc[] {
  const seen=new Set<string>();
  return snapshots.filter(snapshot=>{
    const key=JSON.stringify([snapshot.meta.source_type,snapshot.meta.title,snapshot.body]);
    if(seen.has(key))return false;
    seen.add(key);return true;
  });
}

type Comparison = { lines:DiffLine[]; coarse:boolean; currentHash:string; sourceHash:string; added:number; removed:number };
export function RevisionHistory({doc,snapshots,open}:{doc:Doc;snapshots:Doc[];open:(id:string)=>void}) {
  const [chosen,setChosen]=useState('');
  const [comparison,setComparison]=useState<Comparison>();
  const [error,setError]=useState('');
  const revision=snapshots.find(d=>d.meta.id===chosen)??snapshots.find(d=>d.meta.source_hash!==doc.hash)??snapshots[0];
  useEffect(()=>{setChosen('');},[doc.meta.id]);
  useEffect(()=>{
    let cancelled=false;setComparison(undefined);setError('');
    if(revision) fetch(`/api/compare?id=${encodeURIComponent(doc.meta.id)}&revision=${encodeURIComponent(revision.meta.id)}`).then(async response=>{
      const data=await response.json();if(!response.ok)throw new Error(data.error);if(!cancelled)setComparison(data);
    }).catch(e=>{if(!cancelled)setError(e.message);});
    return ()=>{cancelled=true;};
  },[doc.meta.id,doc.hash,revision?.meta.id]);
  return <div className="history"><h2>History</h2><p>History shows distinct document text. Automatic saves reuse unchanged text; explicit checkpoints and implementation approvals retain their exact versions. Older duplicate records remain available through existing links.</p>
    {snapshots.length?<>
      <label className="revision-select">Compare against<select value={revision.meta.id} onChange={e=>setChosen(e.target.value)}>{snapshots.map((s,i)=><option key={s.meta.id} value={s.meta.id}>Version {snapshots.length-i} · {new Date(String(s.meta.retained_at)).toLocaleString()}</option>)}</select></label>
      <div className="comparison-heading"><strong>Saved version → Current version</strong><button className="quiet" onClick={()=>open(revision.meta.id)}>Read saved version ↗</button></div>
      {error?<p role="alert">{error}</p>:!comparison?<p>Loading comparison…</p>:<>
        <div className="comparison-summary"><span className="added-label">＋ {comparison.added} added lines</span><span className="removed-label">− {comparison.removed} removed lines</span><span>Document body</span></div>
        {comparison.coarse&&<p className="hint">Large change: showing the changed block in full without aligning individual lines.</p>}
        {!comparison.added&&!comparison.removed?<div className="reading-note">This saved version and the current version have the same document text.</div>:<div className="diff" role="table" aria-label="Document version comparison"><div className="diff-row diff-label" role="row"><span>Old</span><span>New</span><span/><span>Document text</span></div>{comparison.lines.map((line,i)=><div key={i} role="row" className={`diff-row ${line.kind}`}><span className="line-number">{line.before??''}</span><span className="line-number">{line.after??''}</span><span aria-label={line.kind}>{line.kind==='added'?'+':line.kind==='removed'?'−':' '}</span><code>{line.text||' '}</code></div>)}</div>}
      </>}
    </>:<p className="hint">No saved versions yet.</p>}
  </div>;
}

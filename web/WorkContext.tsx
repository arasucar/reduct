import type { Doc } from '../src/model';
import type { WorkOverview as Summary } from '../src/workflow';
import { briefPrepared } from '../src/document-content';
import { RecordIcon } from './presentation';

export function WorkContext({summary,docs,choose}:{summary:Summary;docs:Doc[];choose:(id:string)=>void}) {
  function card(label:string,type:string,ids:string[]) {
    if(!ids.length)return null;
    return <div className={`workflow-card type-${type}`}><RecordIcon type={type}/><div><strong>{label}</strong>{ids.map(id=>{const d=docs.find(d=>d.meta.id===id);return d?<div key={id}><button className="document-link" onClick={()=>choose(id)}>{d.meta.title}</button>{type==='implementation'&&!briefPrepared(d)&&<small className="brief-preparation">Not prepared</small>}</div>:null;})}</div></div>;
  }
  return <section className="work-context" aria-label="Work context">
    <h2>Work context</h2>

    <div className="workflow-documents">{card('Analysis','analysis',summary.analysisIds)}{card('Plan','plan',summary.planIds)}{card('Implementation brief','implementation',summary.briefIds)}</div>
    {summary.briefIds.map(id=>{const b=docs.find(d=>d.meta.id===id)!;const state=summary.briefStates[id];if(!briefPrepared(b))return null;return state.drift!=='current'?<div key={id} className="drift-warning"><strong>Brief needs updating</strong><p>{state.drift==='changed'?'The plan changed after this brief was prepared. Ask your planning agent to update the instructions before implementation.':'The source plan or saved version is missing. Ask your planning agent to restore it.'}</p><button className="document-link" onClick={()=>choose(id)}>Open brief</button></div>:null;})}
    {summary.handoffRevisionId&&<section className="handoff-summary"><strong>Implementation handoff</strong><p>Recorded {new Date(summary.handoffAt!).toLocaleString()}</p><button className="document-link" onClick={()=>choose(summary.handoffRevisionId!)}>Read the brief handed off</button></section>}
  </section>;
}

export function AffectedFeatures({summary,docs,choose}:{summary:Summary;docs:Doc[];choose:(id:string)=>void}) {
  return <section className="affected-work discussion-features"><strong>Affected features</strong><div>{summary.affectedFeatureIds.map(id=>{const feature=docs.find(d=>d.meta.id===id);return feature?<button className="button" key={id} onClick={()=>choose(id)}>{feature.meta.title} ↗</button>:null;})}{!summary.affectedFeatureIds.length&&<p>No feature links recorded yet.</p>}</div></section>;
}

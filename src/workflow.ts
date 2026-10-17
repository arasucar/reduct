import { briefPrepared, markdownSection, implementationPlanText } from './document-content.js';
import { hash, type Doc } from './model.js';

export { closedWorkStatuses, visibleTreeRecords } from './tree.js';
export type BriefState = { drift:'current'|'changed'|'missing'; sourceVersion?:string; planId?:string; approvalValid:boolean };
export function inspectBrief(brief:Doc, docs:Doc[]):BriefState {
  const plan=docs.find(d=>d.meta.id===brief.meta.source_plan&&((d.meta.type==='plan'&&d.meta.parent===brief.meta.parent)||(d.meta.type==='work'&&d.meta.id===brief.meta.parent)));
  const version=docs.find(d=>d.meta.id===brief.meta.source_revision_id&&d.meta.type==='snapshot'&&d.meta.parent===plan?.meta.id);
  return {drift:!plan||!version?'missing':implementationPlanText(plan)===implementationPlanText({...version,meta:{...version.meta,source_type:plan.meta.type}})?'current':'changed',sourceVersion:version?.meta.id,planId:plan?.meta.id,
    approvalValid:brief.meta.status==='ready_for_handoff'&&brief.meta.approved_body_hash===hash(brief.body)};
}
export { markdownSection } from './document-content.js';
export type WorkOverview = {
  id:string;plan:string;mode:'simple'|'extended';stage:string;analysisIds:string[];planIds:string[];briefIds:string[];
  affectedFeatureIds:string[];openThreadIds:string[];questions:{documentId:string;text:string}[];decisions:{documentId:string;text:string}[];blockers:{documentId:string;text:string}[];testingObservations:{documentId:string;text:string}[];
  outcome:string;verification:string;briefStates:Record<string,BriefState>;
  approvedVersionIds:string[];handoffRevisionId?:string;handoffAt?:string;
};
export function summarizeWork(work:Doc,docs:Doc[]):WorkOverview {
  const children=docs.filter(d=>d.meta.parent===work.meta.id);
  const plans=children.filter(d=>d.meta.type==='plan'&&d.meta.status!=='superseded');
  const briefs=children.filter(d=>d.meta.type==='implementation');
  const briefStates=Object.fromEntries(briefs.map(b=>[b.meta.id,inspectBrief(b,docs)]));
  const targetIds=new Set([work.meta.id,...children.map(d=>d.meta.id)]);
  let stage=String(work.meta.status??'planning');
  if(!['completed','superseded','rejected','in_progress','awaiting_verification','needs_owner_decision'].includes(stage)) {
    if(briefs.some(b=>briefStates[b.meta.id].drift!=='current'))stage='brief_needs_update';
    else if(briefs.some(briefPrepared))stage='ready_for_implementation';
    else if(work.meta.status==='ready_for_review'||plans.some(p=>p.meta.status==='ready_for_review'))stage='ready_for_review';
    else stage='planning';
  }
  const questionSources=plans.length?plans:markdownSection(work.body,['plan'])?[work]:children.filter(d=>d.meta.type==='analysis');
  const outcome=markdownSection(work.body,['implementation outcome','outcome']);
  const verification=markdownSection(work.body,['verification results','verification']);
  const requested=[work.meta.parent,...(work.meta.related??[]),...(Array.isArray(work.meta.affected_features)?work.meta.affected_features as string[]:[])];
  return {id:work.meta.id,plan:plans.length?'':markdownSection(work.body,['plan']),mode:work.meta.workflow_mode==='simple'?'simple':'extended',stage,
    analysisIds:children.filter(d=>d.meta.type==='analysis').map(d=>d.meta.id),planIds:plans.map(d=>d.meta.id),briefIds:briefs.map(d=>d.meta.id),briefStates,
    affectedFeatureIds:docs.filter(d=>d.meta.type==='feature'&&requested.includes(d.meta.id)).map(d=>d.meta.id),
    openThreadIds:docs.filter(d=>d.meta.type==='review'&&d.meta.status==='open'&&targetIds.has(String(d.meta.target_id))).map(d=>d.meta.id),
    questions:questionSources.map(d=>({documentId:d.meta.id,text:markdownSection(d.body,['open questions','open questions for review'])})).filter(q=>!!q.text&&!/^(none\.?|no open questions\.?)$/i.test(q.text)),
    decisions:questionSources.map(d=>({documentId:d.meta.id,text:markdownSection(d.body,['decisions','owner decisions'])})).filter(q=>!!q.text&&!/^Record owner answers/.test(q.text)),
    blockers:questionSources.map(d=>({documentId:d.meta.id,text:markdownSection(d.body,['implementation blockers','blockers'])})).filter(q=>!!q.text&&!/^List only decisions/.test(q.text)&&!/^(none\.?|no blockers\.?)$/i.test(q.text)),
    testingObservations:questionSources.map(d=>({documentId:d.meta.id,text:markdownSection(d.body,['testing observations'])})).filter(q=>!!q.text&&!/^Record reversible details/.test(q.text)&&!/^none\.?$/i.test(q.text)),
    approvedVersionIds:docs.filter(d=>d.meta.type==='snapshot'&&briefs.some(b=>b.meta.id===d.meta.parent)&&d.meta.status==='ready_for_handoff'&&d.meta.approved_body_hash===hash(d.body)).map(d=>d.meta.id),
    handoffRevisionId:typeof work.meta.handoff_revision_id==='string'?work.meta.handoff_revision_id:undefined,
    handoffAt:typeof work.meta.handoff_at==='string'?work.meta.handoff_at:undefined,
    outcome:/^Record delivered changes/.test(outcome)?'':outcome,verification:/^Record checks actually run/.test(verification)?'':verification};
}

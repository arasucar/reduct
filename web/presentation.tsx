import type { Meta } from '../src/model';
export const typeLabels:Record<string,string>={module:'Module',feature:'Feature',work:'Work',analysis:'Analysis',plan:'Plan',implementation:'Implementation brief',snapshot:'Saved version',guide:'How to use',task:'Task'};
export function RecordIcon({type}:{type:string}) {
  const paths:Record<string,React.ReactNode>={
    module:<><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    feature:<><path d="m12 2 10 6-10 6L2 8Z"/><path d="m2 12 10 6 10-6M2 16l10 6 10-6"/></>,
    work:<><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12h8m-3-3 3 3-3 3"/></>,
    analysis:<><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6M7 10h6m-3-3v6"/></>,
    plan:<><rect x="5" y="3" width="15" height="19" rx="2"/><path d="m8 8 1 1 2-2m2 1h4M8 14h9M8 18h7"/></>,
    implementation:<><path d="m9 8-5 4 5 4m6-8 5 4-5 4M13 5l-2 14"/></>,
    snapshot:<><path d="M3 10a9 9 0 1 1 2 8M3 4v6h6M12 7v5l3 2"/></>,
    guide:<><path d="M12 5C8 2 4 3 2 4v16c4-2 7-1 10 1 3-2 6-3 10-1V4c-2-1-6-2-10 1Zm0 0v16"/></>
  };
  return <span className={`record-icon type-${type}`} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{paths[type]??paths.work}</svg></span>;
}
export const statuses:Record<string,{label:string;meaning:string;next:string}>={
  brief_needs_update:{label:'Brief needs updating',meaning:'The source Plan changed after the brief was prepared.',next:'Read the changed plan and ask your planning agent to reconcile the brief before handoff.'},
  draft:{label:'Draft',meaning:'Still being written or revised; no handoff approval is implied.',next:'Read the draft and ask for clarification. The planning agent maintains the content and records your decisions.'},
  ready_for_review:{label:'Ready for review',meaning:'The plan is available for your feedback.',next:'Read and comment for clarification. Give decisions or change requests directly to your planning agent.'},
  needs_owner_decision:{label:'Awaiting your decision',meaning:'The next concrete change is blocked by a material owner decision.',next:'Tell your planning agent your decision directly; it records the answer and updates the proposal.'},
  documented_pending_verification:{label:'Documented · unverified',meaning:'Behavior has been described from evidence, but runtime verification is incomplete.',next:'Your agent records authorized checks and remaining uncertainty. Read the evidence or ask for clarification.'},
  needs_analysis:{label:'Not yet analyzed',meaning:'This feature is a provisional map entry.',next:'Ask an analysis agent to inspect the implementation and document behavior, evidence, and challenges.'},
  partially_documented:{label:'Partially documented',meaning:'Only some behavior has been mapped.',next:'Complete the missing paths and identify what has and has not been verified.'},
  review:{label:'Under review',meaning:'This work item is in the planning/review stage.',next:'Review its analysis and plan. Application implementation has not been authorized by this status.'},
  planning:{label:'Planning',meaning:'An agent is developing the proposal.',next:'Clarify intent and inspect its analysis and draft plan.'},
  ready_for_implementation:{label:'Ready for implementation',meaning:'The implementation brief is prepared and matches the current Plan.',next:'Manually pass the brief to your implementation agent.'},
  ready_for_handoff:{label:'Ready for implementation',meaning:'The implementation brief is ready to be handed off.',next:'Manually pass the brief to your implementation agent.'},
  in_progress:{label:'In progress',meaning:'Implementation work is underway.',next:'Test delivered changes and give feedback. Independent scope can continue while unrelated decisions remain open.'},
  awaiting_verification:{label:'Awaiting verification',meaning:'Implementation was reported complete but checks remain.',next:'The agent records agreed checks and outcomes. If manual evidence is needed, it asks you directly.'},
  completed:{label:'Completed',meaning:'The work is recorded as finished.',next:'Read the outcome and evidence. Agents keep the lasting feature record current.'},
  superseded:{label:'Superseded',meaning:'A newer decision or document replaces this one.',next:'Follow the replacement; keep this for history.'},
  rejected:{label:'Rejected',meaning:'This proposal was not accepted.',next:'Preserve the rationale; create a revised proposal if necessary.'}
};
export function statusInfo(meta:Meta) {
  if(meta.type==='feature'&&['documented','documented_pending_verification'].includes(String(meta.status)))return {label:'Documented',meaning:'Describes the existing feature.',next:'Compare this description with the app and add a comment if anything differs.'};
  if(meta.type==='snapshot')return {label:'Saved version',meaning:'An immutable reference point, not a new proposal.',next:'Read or compare this version. Return to the current document to read the latest version or ask for clarification.'};
  if(meta.type==='implementation'&&meta.status==='draft')return {label:'Draft',meaning:'A separate implementation document that is not ready for execution.',next:'The planning agent fills settled instructions after your decisions. Read the brief; communicate approval directly to that agent.'};
  return statuses[String(meta.status)]??{label:meta.status?String(meta.status).replaceAll('_',' '):'Working document',meaning:'A maintained document in the product workspace.',next:'Read the context and ask your planning agent to clarify or update it.'};
}

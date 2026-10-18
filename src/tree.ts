import type { Doc } from './model.js';
export const closedWorkStatuses = ['completed','superseded','rejected'];
/** Hide the whole completed work branch, while retaining permanent feature records. */
export function visibleTreeRecords(docs:Doc[],showHistory:boolean):Doc[] {
  if(showHistory)return docs;
  const byId=new Map(docs.map(d=>[d.meta.id,d]));
  return docs.filter(doc=>{
    let cursor:Doc|undefined=doc;const visited=new Set<string>();
    while(cursor&&!visited.has(cursor.meta.id)) {
      visited.add(cursor.meta.id);
      if(cursor.meta.type==='bug_document'||cursor.meta.merged_into)return false;
      if(['work','bug'].includes(cursor.meta.type)&&closedWorkStatuses.includes(String(cursor.meta.status)))return false;
      cursor=byId.get(cursor.meta.parent??'');
    }
    return true;
  });
}

/** Keep one owning Feature in the tree while showing Bugs on every affected Feature page. */
export function bugsAffectingFeature(docs:Doc[],featureId:string,showHistory=false):Doc[] {
  return visibleTreeRecords(docs,showHistory).filter(d=>d.meta.type==='bug'&&(d.meta.parent===featureId||(d.meta.related??[]).includes(featureId)||(Array.isArray(d.meta.affected_features)&&d.meta.affected_features.includes(featureId))));
}

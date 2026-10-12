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
      if(cursor.meta.type==='work'&&closedWorkStatuses.includes(String(cursor.meta.status)))return false;
      cursor=byId.get(cursor.meta.parent??'');
    }
    return true;
  });
}

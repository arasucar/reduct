import test from 'node:test';
import assert from 'node:assert/strict';
import { decode, encode, type Message } from '../src/model.js';
import { discussionReference } from '../web/discussionReference';

test('discussion reference contains only the file path and the latest owner comment’s actual line',()=>{
  const body='\n<!-- reduct:message MSG-original -->\n## Comment\n\nOriginal question.\n\n<!-- reduct:message MSG-followup -->\n## Reopened\n\nLatest question.\n\n<!-- reduct:message MSG-agent -->\n## Reply\n\nAgent answer.\n';
  const messages=[{id:'MSG-original',actor_kind:'human'},{id:'MSG-followup',actor_kind:'human'},{id:'MSG-agent',actor_kind:'agent'}] as Message[];
  const raw=encode({schema_version:1,id:'REVIEW-123',type:'review',title:'Question',messages,target_id:'WORK-123',target_path:'modules/settings/work/pressure/work.md'},body);
  const doc=decode(raw,'modules/settings/work/pressure/reviews/REVIEW-123.md');
  const line=raw.split('\n').findIndex(text=>text==='Latest question.')+1;
  assert.equal(discussionReference({...doc,messages},'/workspace/'),`/workspace/.reduct/modules/settings/work/pressure/reviews/REVIEW-123.md:${line}`);
});

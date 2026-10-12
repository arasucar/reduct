import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actionableNotifications } from '../web/Notifications';
import { decode,encode } from '../src/model.js';

const record=(id:string,type:string,status:string,extra:Record<string,unknown>={})=>decode(encode({schema_version:1,id,type,title:id,status,...extra},'body'));
test('notifications include decisions, plans needing review, unseen agent replies and source drift only',()=>{
  const docs=[record('WORK','work','needs_owner_decision'),record('PLAN','plan','ready_for_review'),record('BRIEF','implementation','draft',{source_plan:'PLAN'}),record('DONE','work','completed'),record('THREAD','review','resolved',{target_id:'PLAN',messages:[{id:'MSG',actor_kind:'agent'}]}),record('WAITING','review','open',{target_id:'PLAN',messages:[{id:'ASK',actor_kind:'human'}]})];
  const states={BRIEF:{drift:'changed' as const,approvalValid:false}};
  const notifications=actionableNotifications(docs,states,{});
  assert.deepEqual(notifications.map(i=>i.kind).sort(),['decision','review','drift','reply'].sort());
  assert.equal(notifications.find(i=>i.kind==='reply')?.threadId,'THREAD');
  assert.equal(notifications.some(i=>i.id==='DONE'||i.id==='WAITING'),false);
  assert.equal(actionableNotifications(docs,states,{THREAD:'MSG'}).some(i=>i.kind==='reply'),false);
  const prepared=actionableNotifications(docs,{BRIEF:{drift:'current',approvalValid:false}},{THREAD:'MSG'});
  assert.equal(prepared.some(i=>i.kind==='review'||i.kind==='drift'),false);
  assert.equal(prepared.length,1);
});

test('brief notifications distinguish a changed plan from a missing source',()=>{
  const docs=[record('BRIEF','implementation','draft')];
  assert.match(actionableNotifications(docs,{BRIEF:{drift:'changed',approvalValid:false}},{} )[0].detail,/source plan changed/);
  assert.match(actionableNotifications(docs,{BRIEF:{drift:'missing',approvalValid:false}},{} )[0].detail,/missing/);
});

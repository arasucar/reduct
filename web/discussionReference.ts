import type { Doc, Message } from '../src/model';

export function discussionReference(thread:Doc & {messages:Message[]},repo:string):string {
  const root=`${repo.replace(/\/$/,'')}/.reduct`;
  const comment=[...thread.messages].reverse().find(message=>message.actor_kind==='human');
  const marker=comment?thread.body.indexOf(`<!-- reduct:message ${comment.id} -->`):-1;
  const line=marker>=0?thread.bodyStartLine+thread.body.slice(0,marker).split('\n').length-1+3:thread.bodyStartLine;
  return `${root}/${thread.path}:${line}`;
}

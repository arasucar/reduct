import { createHash } from 'node:crypto';
import { parse, stringify } from 'yaml';

export type Identity = { name: string; email: string; source?: string };
export type Meta = {
  schema_version: number; id: string; type: string; title: string; parent?: string;
  status?: string; related?: string[]; [key: string]: unknown;
};
export type Doc = { meta: Meta; body: string; path: string; hash: string; bodyStartLine: number };
export type Message = { id: string; author: Identity; actor_kind: 'human' | 'agent'; agent_name?: string; created_at: string; kind: 'comment' | 'reply' | 'resolve' | 'reopen'; addressed_hash?: string };
export const hash = (s: string) => createHash('sha256').update(s).digest('hex');
export class Problem extends Error { constructor(message: string, public status = 400) { super(message); } }
export function decode(raw: string, path = ''): Doc {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(raw);
  if (!match) throw new Problem(`${path}: expected YAML frontmatter`);
  const meta = parse(match[1], { maxAliasCount: 20 }) as Meta;
  if (!meta || meta.schema_version !== 1 || typeof meta.id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(meta.id) || typeof meta.title !== 'string' || !['module',  'feature', 'work', 'plan', 'analysis', 'task', 'review', 'snapshot', 'implementation', 'guide'].includes(meta.type)) throw new Problem(`${path}: invalid record metadata`);
  if (meta.parent !== undefined && typeof meta.parent !== 'string') throw new Problem(`${path}: invalid parent`);
  if (meta.related !== undefined && (!Array.isArray(meta.related) || meta.related.some(x => typeof x !== 'string'))) throw new Problem(`${path}: invalid related IDs`);
  return { meta, body: match[2], path, hash: hash(raw), bodyStartLine: raw.slice(0,match[0].length-match[2].length).split('\n').length };
}
export function encode(meta: Meta, body: string) { return `---\n${stringify(meta, { lineWidth: 0 })}---\n${body}`; }
export function identityValid(v: unknown): v is Identity {
  const i = v as Identity;
  return !!i && typeof i.name === 'string' && !!i.name.trim() && typeof i.email === 'string' && /^[^\s@]+@[^\s@]+$/.test(i.email) && i.name.length < 200 && i.email.length < 254;
}
export function messageBody(text: string) {
  if (typeof text !== 'string' || !text.trim() || text.length > 50000) throw new Problem('Write a message (maximum 50,000 characters).');
  if (/<!--\s*reduct:message/.test(text)) throw new Problem('The reduct:message marker is reserved for thread structure.');
  return text.trim();
}
export function appendMessage(doc: Doc, message: Message, body: string) {
  const messages = [...((doc.meta.messages as Message[]) ?? []), message];
  const label = ({ comment: 'Comment', reply: 'Reply', resolve: 'Resolution', reopen: 'Reopened' })[message.kind];
  return encode({ ...doc.meta, messages }, `${doc.body.trimEnd()}\n\n<!-- reduct:message ${message.id} -->\n## ${label}\n\n${messageBody(body)}\n`);
}
export function messages(doc: Doc): (Message & { body: string })[] {
  const entries = doc.meta.messages as Message[];
  if (!Array.isArray(entries)) throw new Problem(`${doc.path}: missing message metadata`);
  const blocks = [...doc.body.matchAll(/^<!-- reduct:message ([A-Za-z0-9_-]+) -->\r?\n/gm)];
  if (blocks.length !== entries.length) throw new Problem(`${doc.path}: message metadata does not match body`);
  const seen = new Set<string>();
  return entries.map((entry, i) => {
    if (entry.id !== blocks[i][1] || seen.has(entry.id) || !identityValid(entry.author) || !['human','agent'].includes(entry.actor_kind) || (entry.actor_kind === 'agent' && !entry.agent_name) || !['comment','reply','resolve','reopen'].includes(entry.kind) || !Number.isFinite(Date.parse(entry.created_at))) throw new Problem(`${doc.path}: invalid message`);
    seen.add(entry.id);
    const start = blocks[i].index! + blocks[i][0].length;
    const body = doc.body.slice(start, blocks[i + 1]?.index).replace(/^## [^\n]+\n\n/, '').trim();
    if (!body) throw new Problem(`${doc.path}: empty message`);
    return { ...entry, body };
  });
}
export function anchor(doc: Doc, review: Doc): { state: 'current' | 'moved' | 'outdated' | 'document'; offset?: number } {
  const quote = review.meta.quote;
  if (typeof quote !== 'string' || !quote) return { state: review.meta.target_hash === doc.hash ? 'document' : 'outdated' };
  let count = 0, offset = -1, pos = 0;
  while ((pos = doc.body.indexOf(quote, pos)) !== -1) { count++; offset = pos; pos += Math.max(1, quote.length); }
  if (count !== 1) return { state: 'outdated' };
  return { state: review.meta.target_hash === doc.hash ? 'current' : 'moved', offset };
}

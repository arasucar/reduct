import { promises as fs } from 'node:fs';

export const guides = {
  'help/how-to-use.md': 'reader',
  'agent/README.md': 'readme',
  'agent/reference/README.md': 'reference',
  'AGENTS.md': 'planning'
} as const;

export async function readGuide(kind: string) {
  if (kind === 'planning') return fs.readFile(new URL('../docs/PLANNING_AGENTS.md', import.meta.url), 'utf8');
  if (kind === 'readme') return fs.readFile(new URL('../docs/AGENT_GUIDE.md', import.meta.url), 'utf8');
  const readme = await fs.readFile(new URL('../README.md', import.meta.url), 'utf8');
  if (kind === 'reference') return readme;
  const topics: Record<string, string> = { mapping: 'Initial product mapping', roles: 'Agent roles', workflow: 'Agent workflow', completion: 'Implementation and completion procedure', formatting: 'Document formatting', commands: 'Commands', 'planning-procedure': 'Planning procedure' };
  // "planning" remains the managed role entrypoint; the procedure is a separate topic.
  if (Object.hasOwn(topics,kind)) {
    const title=topics[kind],level=['mapping','roles','workflow'].includes(kind)?'##':'###';
    const expression=new RegExp(`^${level} ${title}\\n([\\s\\S]*?)(?=^#{1,${level.length}} |$(?![\\s\\S]))`,'m');
    const found=expression.exec(readme);
    if(!found)throw new Error(`README is missing ${title}`);
    return found[0];
  }
  if (kind !== 'reader') throw new Error('Unknown guide topic. Use readme, reference, mapping, roles, workflow, planning, planning-procedure, completion, formatting, or commands.');
  const section = /^## Using the reader\n([\s\S]*?)(?=^## |$(?![\s\S]))/m.exec(readme);
  if (!section) throw new Error('README is missing the Using the reader section.');
  const body = section[1].trim().replace(/\]\(#/g, '](../agent/reference/README.md#');
  return `---\nschema_version: 1\nid: GUIDE-ui\ntype: guide\ntitle: How to use Reduct\n---\n# How to use Reduct\n\n${body}\n`;
}

export const readApplicationGuide = () => fs.readFile(new URL('../docs/APPLICATION_AGENTS.md', import.meta.url), 'utf8');

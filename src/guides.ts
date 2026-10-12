import { promises as fs } from 'node:fs';

export const guides = {
  'help/how-to-use.md': 'reader',
  'agent/README.md': 'readme',
  'AGENTS.md': 'planning'
} as const;

export async function readGuide(kind: typeof guides[keyof typeof guides]) {
  if (kind === 'planning') return fs.readFile(new URL('../docs/PLANNING_AGENTS.md', import.meta.url), 'utf8');
  const readme = await fs.readFile(new URL('../README.md', import.meta.url), 'utf8');
  if (kind === 'readme') return readme;
  const section = /^## Using the reader\n([\s\S]*?)(?=^## |$(?![\s\S]))/m.exec(readme);
  if (!section) throw new Error('README is missing the Using the reader section.');
  const body = section[1].trim().replace(/\]\(#/g, '](../agent/README.md#');
  return `---\nschema_version: 1\nid: GUIDE-ui\ntype: guide\ntitle: How to use Reduct\n---\n# How to use Reduct\n\n${body}\n`;
}

export const readApplicationGuide = () => fs.readFile(new URL('../docs/APPLICATION_AGENTS.md', import.meta.url), 'utf8');

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Store } from './store.js';
import { recordWorkspaceVersion } from './upgrade.js';
import { guides, readGuide, readApplicationGuide } from './guides.js';

export async function init(repo: string) {
  const store = new Store(repo);
  await fs.mkdir(store.repo,{recursive:true});
  try { await fs.mkdir(store.root); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('A .reduct directory already exists; initialization never overwrites it.'); throw e; }
  await fs.writeFile(path.join(store.root,'README.md'), '# Product workspace\n\nThis product workspace starts empty. Ask your planning agent to inspect the application and create modules and feature records based on its actual behavior.\n\nRead [the Reduct guide](agent/README.md) for installation, mapping, agent roles, and record commands, or [How to use Reduct](help/how-to-use.md) for the reader.\n');
  for (const [relative, kind] of Object.entries(guides)) {
    const target = path.join(store.root, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, await readGuide(kind));
  }
  const applicationGuide = await readApplicationGuide();
  const appAgents = path.join(store.repo, 'AGENTS.md');
  const existing = await fs.readFile(appAgents, 'utf8').catch((error:NodeJS.ErrnoException) => { if(error.code==='ENOENT')return '';throw error; });
  if (!existing.includes('<!-- reduct:application-agents -->')) await fs.appendFile(appAgents, `\n<!-- reduct:application-agents -->\n${applicationGuide}\n<!-- /reduct:application-agents -->\n`);
  await fs.mkdir(path.join(store.root,'modules'),{recursive:true});
  await recordWorkspaceVersion(store.repo);
  return store;
}

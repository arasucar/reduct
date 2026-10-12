import { init } from '../src/seed.js';
import { encode } from '../src/model.js';

/** Product modules are explicitly created test fixtures, never initialization defaults. */
export async function initFixture(repo:string) {
  const store=await init(repo);
  for(const slug of ['alpha','beta','gamma','delta']) {
    await store.write(`modules/${slug}/module.md`,encode({schema_version:1,id:`MODULE-${slug}`,type:'module',title:`Fixture ${slug}`},`# Fixture ${slug}\n`),null);
  }
  return store;
}

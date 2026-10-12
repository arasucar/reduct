import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
function run(args: string[], cwd?: string) {
  return spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'), cli, ...args], {
    cwd,
    encoding: 'utf8',
    input: 'yes\n',
  });
}

test('help works outside an initialized workspace and includes setup and agent commands', async t => {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'reduct-help-'));
  t.after(() => fs.rm(repo, { recursive: true, force: true }));
  for (const args of [[], ['help'], ['--help'], ['-h'], ['create', '--help']]) {
    const result = run(args, repo);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Usage\n/);
    assert.match(result.stdout, /init\s+Initialize/);
    assert.match(result.stdout, /Agent commands \(require --agent NAME\)/);
  }
  assert.deepEqual(await fs.readdir(repo), []);
});

test('unknown commands fail with a useful help hint', () => {
  const result = run(['innit']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown command: innit.*reduct --help/);
  assert.equal(result.stdout, '');
});

test('missing option values do not initialize the wrong workspace', async t => {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'reduct-cli-options-'));
  t.after(() => fs.rm(repo, { recursive: true, force: true }));
  for (const args of [['init', '--repo'], ['init', '--repo', '--agent', 'Planner'], ['init', '--repo', '']]) {
    const result = run(args, repo);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Provide a value for --repo/);
    assert.equal(result.stdout, '');
  }
  assert.deepEqual(await fs.readdir(repo), []);
});

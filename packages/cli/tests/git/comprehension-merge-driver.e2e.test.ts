import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { compileModule, serializeUnit, type GenerateSemantic } from '@harness-engineering/core';

/**
 * ADR 0109 slice 5 — REAL git-merge exercise of the comprehension merge driver.
 *
 * Pins the behavior the injected-IO tests cannot: that git actually invokes the
 * driver with `%O %A %B %P`, the merge completes with NO conflict markers, and a
 * source-fresh ours shard is kept (semantic preserved). Skipped on win32 (git
 * merge-driver path semantics) and when the CLI dist is not built.
 */

const DIST_BIN = path.resolve(__dirname, '../../dist/bin/harness.js');
const distBuilt = fs.existsSync(DIST_BIN);
const MODULE = 'src/widget';
const SHARD = `.harness/comprehension/${MODULE}/_module.md`;

const extractStatic = () => ({ interfaceContract: 'export const w: number', dependencySlice: '' });
const gen =
  (summary: string): GenerateSemantic =>
  () => ({ summary, invariants: ['inv'], model: 't' });

async function freshShard(summary: string): Promise<string> {
  const unit = await compileModule(
    MODULE,
    [{ path: 'widget.ts', content: 'export const w = 1;' }],
    { extractStatic, generateSemantic: gen(summary) }
  );
  return serializeUnit(unit);
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

describe.skipIf(process.platform === 'win32' || !distBuilt)(
  'comprehension merge driver — real git merge',
  () => {
    let repo = '';

    beforeAll(() => {
      repo = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-driver-e2e-'));
      git(repo, 'init', '-q');
      git(repo, 'config', 'user.email', 't@t.dev');
      git(repo, 'config', 'user.name', 'T');
      git(repo, 'config', 'commit.gpgsign', 'false');
      // Configure the driver to invoke the built CLI.
      git(
        repo,
        'config',
        'merge.comprehension.driver',
        `node ${DIST_BIN} comprehension-merge-driver %O %A %B %P`
      );
      fs.writeFileSync(
        path.join(repo, '.gitattributes'),
        '.harness/comprehension/**/_module.md merge=comprehension\n'
      );
    });

    afterAll(() => {
      if (repo) fs.rmSync(repo, { recursive: true, force: true });
    });

    it('resolves a conflicting shard with no markers, keeping the source-fresh ours', async () => {
      const shardAbs = path.join(repo, SHARD);
      const srcAbs = path.join(repo, MODULE, 'widget.ts');
      fs.mkdirSync(path.dirname(shardAbs), { recursive: true });
      fs.mkdirSync(path.dirname(srcAbs), { recursive: true });
      // Source is identical on both sides; only the shard's summary conflicts.
      fs.writeFileSync(srcAbs, 'export const w = 1;');

      // base commit
      fs.writeFileSync(shardAbs, await freshShard('BASE summary'));
      git(repo, 'add', '-A');
      git(repo, 'commit', '-qm', 'base');

      // theirs branch: different summary
      git(repo, 'checkout', '-q', '-b', 'theirs');
      fs.writeFileSync(shardAbs, await freshShard('THEIRS summary'));
      git(repo, 'commit', '-qam', 'theirs');

      // ours (main): different summary again → 3-way conflict on the summary line
      git(repo, 'checkout', '-q', '-');
      fs.writeFileSync(shardAbs, await freshShard('OURS summary'));
      git(repo, 'commit', '-qam', 'ours');

      // Merge theirs — the driver must resolve the shard conflict, exit 0.
      git(repo, 'merge', '--no-edit', 'theirs');

      const resolved = fs.readFileSync(shardAbs, 'utf8');
      expect(resolved).not.toContain('<<<<<<<'); // no conflict markers
      expect(resolved).toContain('semantic: present'); // semantic preserved (kept ours)
      expect(resolved).toContain('OURS summary'); // ours is source-fresh ⇒ kept
    });
  }
);

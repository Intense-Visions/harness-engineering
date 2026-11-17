/**
 * Guard: the Dockerfile `deps` stage must COPY the package.json of EVERY pnpm
 * workspace member before `pnpm install --frozen-lockfile`.
 *
 * A member whose manifest is not copied gets no node_modules links in the image,
 * so the later `COPY . .` + `pnpm build` fails inside that package
 * (`Cannot find module '@harness-engineering/types'`). This drift has broken the
 * Release workflow's `docker / build-and-push` jobs twice: burn/local-models/signals
 * (9afd4e939, docs/changes/dockerfile-deps-missing-workspace-packages/) and then
 * stats. The npm release is unaffected, so nothing else catches it before release.
 *
 * Run with: node --test tests/scripts/
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Workspace member dirs (posix, repo-relative) from pnpm-workspace.yaml's `packages:` list. */
function workspaceMembers(root = ROOT) {
  const yaml = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8');
  const block = yaml.split(/\r?\n/);
  const start = block.findIndex((l) => /^packages:\s*$/.test(l));
  assert.ok(start >= 0, 'pnpm-workspace.yaml has no `packages:` list');
  const patterns = [];
  for (const line of block.slice(start + 1)) {
    const m = line.match(/^\s+-\s+['"]?([^'"#]+?)['"]?\s*$/);
    if (!m) break;
    patterns.push(m[1]);
  }
  const members = [];
  for (const pattern of patterns) {
    if (pattern.endsWith('/*')) {
      const parent = pattern.slice(0, -2);
      for (const entry of readdirSync(join(root, parent), { withFileTypes: true })) {
        if (entry.isDirectory() && existsSync(join(root, parent, entry.name, 'package.json'))) {
          members.push(`${parent}/${entry.name}`);
        }
      }
    } else {
      assert.ok(!pattern.includes('*'), `unsupported workspace glob: ${pattern}`);
      if (existsSync(join(root, pattern, 'package.json'))) members.push(pattern);
    }
  }
  return members.sort();
}

/** Member dirs whose package.json the Dockerfile `deps` stage COPYs. */
function depsStageManifestDirs(root = ROOT) {
  const lines = readFileSync(join(root, 'Dockerfile'), 'utf8').split(/\r?\n/);
  const start = lines.findIndex((l) => /^FROM\s+\S+\s+AS\s+deps\s*$/i.test(l));
  assert.ok(start >= 0, 'Dockerfile has no `deps` stage');
  const dirs = [];
  for (const line of lines.slice(start + 1)) {
    if (/^FROM\s/i.test(line)) break;
    const m = line.match(/^COPY\s+(\S+)\/package\.json\s+(\S+?)\/?\s*$/);
    if (m) {
      assert.equal(m[2], m[1], `deps COPY must land at the same path: ${line}`);
      dirs.push(m[1]);
    }
  }
  return dirs.sort();
}

test('Dockerfile deps stage copies the package.json of every workspace member', () => {
  const copied = new Set(depsStageManifestDirs());
  const missing = workspaceMembers().filter((dir) => !copied.has(dir));
  assert.deepEqual(
    missing,
    [],
    `Dockerfile deps stage is missing COPY lines for: ${missing.join(', ')} — ` +
      'add `COPY <dir>/package.json <dir>/` before `pnpm install --frozen-lockfile`'
  );
});

test('Dockerfile deps stage copies no manifest for a non-member (stale entry)', () => {
  const members = new Set(workspaceMembers());
  const stale = depsStageManifestDirs().filter((dir) => !members.has(dir));
  assert.deepEqual(
    stale,
    [],
    `Dockerfile deps stage copies non-member manifests: ${stale.join(', ')}`
  );
});

test('the guard sees a non-trivial member set (denominator check)', () => {
  const members = workspaceMembers();
  assert.ok(members.includes('packages/types'), 'expected packages/types to be a member');
  assert.ok(members.length >= 10, `expected >=10 workspace members, got ${members.length}`);
});

// Guards #1968: `.husky/pre-commit` regenerates plugin artifacts with
// `pnpm generate:plugin:all`, then `git add`s the regenerated dirs. The staged
// set must cover EVERY target that script regenerates — a target that is
// regenerated but not staged lands as a dirty working tree with drifted,
// committed artifacts (`.antigravity-extension/` was missed this way).
//
// The test EXECUTES the hook's staging statement (with `git add` swapped for
// `printf`) rather than pattern-matching its text, so it holds whether the
// hook lists the dirs literally or derives them from PLUGIN_CONFIGS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLUGIN_CONFIGS, getConfig } from '../../scripts/lib/plugin-config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const hook = readFileSync(path.join(ROOT, '.husky', 'pre-commit'), 'utf8');
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

/** Targets `pnpm generate:plugin:all` actually regenerates. */
function regeneratedTargets() {
  const all = pkg.scripts['generate:plugin:all'];
  return [...all.matchAll(/generate:plugin:([a-z]+)/g)].map((m) => {
    const script = pkg.scripts[`generate:plugin:${m[1]}`];
    const t = /--target\s+(\S+)/.exec(script);
    assert.ok(t, `generate:plugin:${m[1]} must pass --target`);
    return t[1];
  });
}

/** Paths the hook stages after regenerating, obtained by running its statements. */
function stagedPaths() {
  const start = hook.indexOf('pnpm generate:plugin:all');
  assert.ok(start !== -1, 'hook must run pnpm generate:plugin:all');
  const rest = hook.slice(start).split('\n').slice(1);
  const body = [];
  for (const line of rest) {
    if (/^\s*fi\s*$/.test(line)) break;
    body.push(line);
  }
  assert.ok(
    body.some((l) => /^\s*git add\b/.test(l)),
    'hook must git add after regenerating'
  );
  const script = body
    .map((l) => l.replace(/^(\s*)git add\b/, "$1printf '%s\\n'").replace(/2>\/dev\/null/g, ''))
    .join('\n');
  const out = execFileSync('sh', ['-c', script], { cwd: ROOT, encoding: 'utf8' });
  return out.split('\n').filter(Boolean).sort();
}

test('generate:plugin:all regenerates every configured plugin target', () => {
  assert.deepEqual(regeneratedTargets().sort(), Object.keys(PLUGIN_CONFIGS).sort());
});

test('pre-commit stages every plugin dir that generate:plugin:all regenerates (#1968)', () => {
  const expected = regeneratedTargets()
    .map((t) => getConfig(t).pluginDir)
    .sort();
  assert.deepEqual(stagedPaths(), expected);
});

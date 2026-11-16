/**
 * Regression test for #2051: a `pull_request.paths` filter that matches no
 * tracked file is a PR gate that can never fire.
 *
 * The generated persona workflows (agents/personas/*.yaml ->
 * `pnpm generate:persona-workflows`) carried `paths: [src/**]`, but this repo is
 * a pnpm monorepo with no top-level `src/` — its code lives under
 * `packages/<pkg>/src/`. So Architecture Enforcer never ran on a PR at all, and
 * Documentation Maintainer's trigger silently collapsed to `docs/**` alone.
 *
 * The failure mode is invisible by construction: a glob that matches nothing
 * looks exactly like a glob that simply did not match this PR. This test closes
 * the whole class by asserting every positive `pull_request.paths` glob in every
 * persona workflow matches at least one TRACKED file, using git's own `:(glob)`
 * pathspec magic (`**` / `*` semantics equivalent to GitHub's path filters for
 * these patterns).
 *
 * Run with: node --test tests/scripts/
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const workflowsDir = new URL('../../.github/workflows/', import.meta.url);

const personaWorkflows = readdirSync(workflowsDir).filter(
  (f) => f.startsWith('persona-') && f.endsWith('.yml')
);

function trackedMatches(glob) {
  const out = execFileSync('git', ['ls-files', '--', `:(glob)${glob}`], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.split('\n').filter(Boolean).length;
}

test('there are persona workflows to check (denominator is not empty)', () => {
  assert.ok(personaWorkflows.length > 0, 'expected generated persona-*.yml workflows');
  const withPaths = personaWorkflows.filter((f) => {
    const wf = parse(readFileSync(new URL(f, workflowsDir), 'utf8'));
    return Array.isArray(wf?.on?.pull_request?.paths);
  });
  assert.ok(withPaths.length > 0, 'expected at least one persona workflow with a paths filter');
});

for (const file of personaWorkflows) {
  test(`${file}: every pull_request.paths glob matches at least one tracked file`, () => {
    const wf = parse(readFileSync(new URL(file, workflowsDir), 'utf8'));
    const paths = wf?.on?.pull_request?.paths;
    if (!Array.isArray(paths)) return; // no filter (or no PR trigger) — nothing can be dead
    for (const glob of paths) {
      if (String(glob).startsWith('!')) continue; // exclusions narrow; they cannot be "dead"
      assert.ok(
        trackedMatches(glob) > 0,
        `${file}: pull_request.paths glob ${JSON.stringify(glob)} matches 0 tracked files, ` +
          'so it can never trigger the PR gate. Fix it at the persona source ' +
          '(agents/personas/*.yaml) and run `pnpm generate:persona-workflows`.'
      );
    }
  });
}

/**
 * Pins the deliberate split between the repo's two root test runners (#2212).
 *
 *   - vitest (`pnpm test:root`, root `vitest.config.mts`) collects
 *     `tests/**\/*.test.ts`.
 *   - node:test (`.github/workflows/*.yml`, `node --test '<glob>'`) runs
 *     `tests/**\/*.test.mjs` and the skill-local node:test suites under
 *     `agents/skills/claude-code/**\/*.test.mjs` (#2367). The codex / cursor /
 *     gemini-cli skill trees are generated mirrors of claude-code, so only the
 *     claude-code copy is owed a runner.
 *
 * Each runner reports "no test files found" — not an error — over the other's
 * files, so a `.test.mjs` that no workflow glob reaches is run by NOTHING and
 * still reads as clean. These tests make that split fail loudly instead:
 *
 *   1. every `tests/**\/*.test.mjs` and `agents/skills/claude-code/**\/*.test.mjs`
 *      file is matched by some workflow `node --test` glob;
 *   2. the vitest root `include` claims no `.test.mjs` file (the two runners
 *      own disjoint sets);
 *   3. `vitest.config.mts` itself says so, so the split is legible where a
 *      reader looks first.
 *
 * Run with: node --test tests/scripts/test-runner-split.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WORKFLOWS_DIR = path.join(ROOT, '.github', 'workflows');
const VITEST_CONFIG = path.join(ROOT, 'vitest.config.mts');

/** posix matcher: globs and paths are repo-relative with `/` on every OS. */
const matches = (file, glob) => path.posix.matchesGlob(file, glob);

/** Repo-relative, `/`-separated paths of every `*.test.mjs` under `dir`. */
function listTestMjsUnder(dir) {
  return readdirSync(path.join(ROOT, ...dir.split('/')), { recursive: true })
    .map((entry) => `${dir}/${String(entry).split(path.sep).join('/')}`)
    .filter((file) => file.endsWith('.test.mjs'));
}

/** Repo-relative, `/`-separated paths of every `*.test.mjs` under `tests/`. */
function listNodeTestFiles() {
  return listTestMjsUnder('tests').sort();
}

/**
 * Skill-local node:test suites (#2367). Only the claude-code tree: the other
 * platform trees are mirrors of it, and running them too would run the same
 * tests four times.
 */
function listSkillNodeTestFiles() {
  return listTestMjsUnder('agents/skills/claude-code').sort();
}

/**
 * Extracts the positional (glob/path) arguments of every `node --test`
 * invocation in a workflow's text. Single- or double-quoted globs are
 * unquoted; flags (`--foo`) and YAML comment lines are skipped.
 */
function parseNodeTestGlobs(workflowText) {
  const globs = [];
  for (const line of workflowText.split('\n')) {
    if (line.trimStart().startsWith('#')) continue; // a YAML comment runs nothing
    const match = line.match(/node\s+--test\b([^#]*)/);
    if (!match) continue;
    for (const token of match[1].trim().split(/\s+/).filter(Boolean)) {
      if (token.startsWith('-')) continue;
      globs.push(token.replace(/^(['"])(.*)\1$/, '$2'));
    }
  }
  return globs;
}

function listWorkflowNodeTestGlobs() {
  return readdirSync(WORKFLOWS_DIR)
    .filter((name) => /\.ya?ml$/.test(name))
    .flatMap((name) => parseNodeTestGlobs(readFileSync(path.join(WORKFLOWS_DIR, name), 'utf8')));
}

/** The string literals of the root vitest config's `test.include` array. */
function readVitestIncludeGlobs() {
  const source = readFileSync(VITEST_CONFIG, 'utf8');
  const block = source.match(/include:\s*\[([^\]]*)\]/);
  assert.ok(block, `no \`include: [...]\` array found in ${VITEST_CONFIG}`);
  return [...block[1].matchAll(/(['"])(.*?)\1/g)].map((m) => m[2]);
}

test('parseNodeTestGlobs ignores `node --test` mentioned in a YAML comment', () => {
  // ci.yml carries exactly such a comment; counting it would let a comment
  // keep the guard green after the real `run:` glob stopped matching.
  const yaml = [
    `      # the separate node --test 'tests/scripts/*.test.mjs' run above`,
    `        run: node --test 'tests/other/*.test.mjs'`,
  ].join('\n');
  assert.deepEqual(parseNodeTestGlobs(yaml), ['tests/other/*.test.mjs']);
});

test('parseNodeTestGlobs returns each unquoted glob argument, skipping flags, inline comments and non-test commands', () => {
  const yaml = [
    `        run: node --test 'tests/scripts/*.test.mjs'`,
    `        run: node --test --test-reporter=spec "tests/a/*.test.mjs" tests/b/x.test.mjs # note`,
    `        run: node scripts/not-a-test.mjs`,
  ].join('\n');
  assert.deepEqual(parseNodeTestGlobs(yaml), [
    'tests/scripts/*.test.mjs',
    'tests/a/*.test.mjs',
    'tests/b/x.test.mjs',
  ]);
});

test('every tests/**/*.test.mjs file is run by some workflow `node --test` glob', () => {
  const files = listNodeTestFiles();
  const globs = listWorkflowNodeTestGlobs();
  // Denominators: an empty set on either side would make the check below vacuous.
  assert.ok(files.length > 0, 'found no tests/**/*.test.mjs files — the walk is broken');
  assert.ok(globs.length > 0, 'found no `node --test` invocation in .github/workflows/*.yml');

  const orphans = files.filter((file) => !globs.some((glob) => matches(file, glob)));
  assert.deepEqual(
    orphans,
    [],
    `these node:test files are run by NO workflow (vitest skips .mjs, so nothing runs them). ` +
      `Workflow node --test globs: ${JSON.stringify(globs)}`
  );
});

test('every agents/skills/claude-code/**/*.test.mjs file is run by some workflow `node --test` glob', () => {
  const files = listSkillNodeTestFiles();
  const globs = listWorkflowNodeTestGlobs();
  // Denominator: harness-branch-buster ships node:test suites today (#2367);
  // an empty walk means the walk broke, not that the tree is clean.
  assert.ok(
    files.length > 0,
    'found no agents/skills/claude-code/**/*.test.mjs files — the walk is broken'
  );
  assert.ok(globs.length > 0, 'found no `node --test` invocation in .github/workflows/*.yml');

  const orphans = files.filter((file) => !globs.some((glob) => matches(file, glob)));
  assert.deepEqual(
    orphans,
    [],
    `these skill node:test files are run by NO workflow (agents/skills vitest collects only tests/**/*.test.ts). ` +
      `Workflow node --test globs: ${JSON.stringify(globs)}`
  );
});

test('the root vitest include claims no .test.mjs file (runners own disjoint sets)', () => {
  const includes = readVitestIncludeGlobs();
  assert.ok(includes.length > 0, 'root vitest include array is empty');
  // The real files, plus one synthetic path so a widened include is caught
  // even if every current .mjs file happened to sit outside it.
  const candidates = [...listNodeTestFiles(), 'tests/scripts/__probe__.test.mjs'];
  const claimed = candidates.filter((file) => includes.some((glob) => matches(file, glob)));
  assert.deepEqual(
    claimed,
    [],
    `vitest include ${JSON.stringify(includes)} would collect node:test files; ` +
      `they are written against node:test and owned by the workflow \`node --test\` run`
  );
});

test('vitest.config.mts names tests/**/*.test.mjs as node:test territory', () => {
  const source = readFileSync(VITEST_CONFIG, 'utf8');
  assert.match(
    source,
    /tests\/\*\*\/\*\.test\.mjs[\s\S]*node --test|node --test[\s\S]*tests\/\*\*\/\*\.test\.mjs/,
    'vitest.config.mts must say that tests/**/*.test.mjs is run by `node --test`, not vitest (#2212)'
  );
});

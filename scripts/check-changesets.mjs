#!/usr/bin/env node
/**
 * Fail if a PR changes a publishable package without a matching changeset.
 *
 * Driven by the incident in PR #332: schemas were added to
 * `packages/types/src/` across four commits but no `.changeset/` entry
 * bumped the types package. The release pipeline bumped downstream
 * packages (which had their own changesets) and shipped dists that
 * imported the new symbols — but the types package on npm stayed at
 * 0.11.0 without them. Every fresh `npm install -g @harness-engineering/cli`
 * crashed at module load.
 *
 * Heuristic: a publishable change is anything under `packages/<pkg>/src/`
 * or a modification to `packages/<pkg>/package.json` (deps moves are
 * publishable). Tests, .harness state, docs, and changelogs are not
 * publishable and never require a changeset.
 *
 * Escape hatch: an empty changeset (no packages listed in the
 * frontmatter, produced by `pnpm changeset --empty`) is accepted as
 * acknowledgement that this PR intentionally doesn't release anything.
 *
 * Usage: BASE_REF=origin/main node scripts/check-changesets.mjs
 */
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Parse a changeset file's frontmatter into `{ isEmpty, packages }`.
 *
 * A changeset's frontmatter is the block between the first `---` line and the
 * next `---` line. Accept both the canonical empty marker (`---\n\n---`) and
 * the form prettier collapses it to (`---\n---`) — both are valid no-release
 * markers. Parsing by line (rather than a fixed-shape regex) keeps the gate
 * from tripping over prettier reformatting the marker, which used to force a
 * `.prettierignore` entry per no-release changeset.
 *
 * @param {string} raw
 * @returns {{ isEmpty: boolean, packages: string[] }} `isEmpty` is false when
 *   the text is not a changeset at all (no frontmatter block).
 */
export function parseChangesetFrontmatter(raw) {
  const lines = raw.split(/\r?\n/);
  if (lines[0].trim() !== '---') return { isEmpty: false, packages: [] };
  const closeIdx = lines.indexOf('---', 1);
  if (closeIdx === -1) return { isEmpty: false, packages: [] };
  const body = lines.slice(1, closeIdx).join('\n').trim();
  if (body === '') return { isEmpty: true, packages: [] };
  const packages = [];
  for (const line of body.split(/\r?\n/)) {
    // Match `'@scope/pkg': patch|minor|major` or with double quotes.
    const m = line.match(/^["']([^"']+)["']\s*:\s*(patch|minor|major)\s*$/);
    if (m) packages.push(m[1]);
  }
  return { isEmpty: false, packages };
}

const BASE_REF = process.env.BASE_REF || 'origin/main';

/** Files under packages/<pkg>/ that should require a changeset when modified. */
const PUBLISHABLE_FILE = /^packages\/([^/]+)\/(src\/.+|package\.json)$/;

/**
 * Paths that are publishable-source-like but never require a release —
 * e.g. test fixtures co-located under src, or auto-managed harness state.
 */
const SKIP_FILE = [
  /\.test\.[cm]?[tj]sx?$/,
  /\.spec\.[cm]?[tj]sx?$/,
  /\/tests?\//,
  /\/__tests__\//,
  /\/__fixtures__\//,
  /\/\.harness\//,
];

function gitFiles({ extraArgs = '', pathspec = '' } = {}) {
  // Argument order matters: `git diff [opts] <ref> -- <paths>`. Putting `--`
  // before the ref makes git treat the ref as a path and the diff comes back
  // empty.
  const cmd =
    `git diff --name-only ${extraArgs} ${BASE_REF}...HEAD` + (pathspec ? ` -- ${pathspec}` : '');
  return execSync(cmd, { encoding: 'utf-8' }).split('\n').filter(Boolean);
}

function packageNameFor(dirName) {
  const path = `packages/${dirName}/package.json`;
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')).name ?? null;
  } catch {
    return null;
  }
}

function main() {
  const changedFiles = gitFiles();
  const changedPackages = new Set();
  for (const f of changedFiles) {
    if (SKIP_FILE.some((re) => re.test(f))) continue;
    const m = f.match(PUBLISHABLE_FILE);
    if (!m) continue;
    const name = packageNameFor(m[1]);
    if (name) changedPackages.add(name);
  }

  if (changedPackages.size === 0) {
    console.log('No publishable package changes detected.');
    process.exit(0);
  }

  // Look at every changeset file (added OR modified) in this PR. The standard
  // case is added, but reviewers sometimes amend an existing changeset to add a
  // missing package — both should count.
  const changesetFiles = gitFiles({
    extraArgs: '--diff-filter=AM',
    pathspec: '.changeset/',
  }).filter((f) => f.endsWith('.md') && !f.endsWith('README.md'));

  const mentionedPackages = new Set();
  let hasEmptyChangeset = false;

  for (const f of changesetFiles) {
    let raw;
    try {
      raw = readFileSync(f, 'utf-8');
    } catch {
      continue;
    }
    const { isEmpty, packages } = parseChangesetFrontmatter(raw);
    if (isEmpty) {
      hasEmptyChangeset = true;
      continue;
    }
    for (const p of packages) mentionedPackages.add(p);
  }

  if (hasEmptyChangeset) {
    console.log(
      `Empty changeset present — accepting source changes without per-package changesets.`
    );
    console.log(`Changed packages: ${[...changedPackages].sort().join(', ')}`);
    process.exit(0);
  }

  const missing = [...changedPackages].filter((p) => !mentionedPackages.has(p)).sort();
  if (missing.length === 0) {
    console.log(`Changeset check OK. Covered: ${[...changedPackages].sort().join(', ')}`);
    process.exit(0);
  }

  console.error('');
  console.error('Missing changeset for the following changed package(s):');
  for (const p of missing) console.error(`  - ${p}`);
  console.error('');
  console.error('Every PR that changes a publishable package must add a `.changeset/*.md`');
  console.error('file that lists that package and the bump level (patch | minor | major).');
  console.error('');
  console.error('Run `pnpm changeset` to create one interactively.');
  console.error('');
  console.error('If this change should NOT release, run `pnpm changeset --empty` to add an');
  console.error('explicit no-release marker.');
  console.error('');
  console.error(
    `Context: incident ${'#'}332 — a missing changeset shipped an orchestrator dist that imported`
  );
  console.error('symbols from an unreleased types build, breaking every fresh CLI install.');
  process.exit(1);
}

// Only run the git-driven gate when invoked as a script; importing the module
// (e.g. from tests) exposes `parseChangesetFrontmatter` without side effects.
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();

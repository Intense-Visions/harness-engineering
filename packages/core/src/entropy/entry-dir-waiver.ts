import { dirname, join } from 'path';
import { glob } from 'glob';
import { minimatch } from 'minimatch';
import { DEFAULT_SKIP_DIRS, skipDirGlobs } from '@harness-engineering/graph';
import { findFiles, relativePosix } from '../shared/fs-utils';

/**
 * A directory that holds a declared entry point, and the skip-dir names along
 * its path that must not hide it.
 *
 * `bin` is a default walker skip-dir (it is a build output in many ecosystems),
 * but `src/bin/` holding first-party CLI source is just as common — this repo
 * declares `packages/cli/src/bin/harness.ts` as an entry point. Before this, the
 * walker dropped the entry point and every sibling module before any config
 * was consulted, so the files it imports reported dead (issue #2075, D1).
 *
 * The rule: a directory a configured entry point lives in is first-party
 * source. A skip-dir glob of the shape `**\/<name>/**` whose `<name>` is a
 * segment of that directory's path is waived for files under it; every other
 * exclude (tests, `node_modules`, a nested `dist`, …) still applies.
 */
export interface EntryDirWaiver {
  /** Root-relative POSIX path of the waived directory (up to its deepest skipped segment). */
  dir: string;
  /** Skip-dir names along `dir` that are waived for files under it. */
  names: ReadonlySet<string>;
}

/** Matches a whole-directory exclude glob, `**\/<name>/**`, capturing `<name>`. */
const SKIP_DIR_GLOB_RE = /^\*\*\/([^/*?[\]{}!]+)\/\*\*$/;

function skipDirGlobName(pattern: string): string | undefined {
  return SKIP_DIR_GLOB_RE.exec(pattern)?.[1];
}

/**
 * Compute the waivers for the CONFIGURED entry points. Auto-detected entries
 * are not included on purpose: `package.json` `main: dist/index.js` would
 * otherwise re-admit a build-output directory wholesale.
 */
export function entryDirWaivers(
  rootDir: string,
  configuredEntryPoints: readonly string[],
  excludePatterns: readonly string[]
): EntryDirWaiver[] {
  const skippable = new Set<string>(DEFAULT_SKIP_DIRS);
  for (const pattern of excludePatterns) {
    const name = skipDirGlobName(pattern);
    if (name) skippable.add(name);
  }

  const byDir = new Map<string, Set<string>>();
  for (const entry of configuredEntryPoints) {
    const relDir = relativePosix(rootDir, dirname(entry));
    if (relDir === '' || relDir.startsWith('..')) continue;
    const segments = relDir.split('/');
    let deepest = -1;
    segments.forEach((seg, i) => {
      if (skippable.has(seg)) deepest = i;
    });
    if (deepest < 0) continue;
    const kept = segments.slice(0, deepest + 1);
    const dir = kept.join('/');
    const names = byDir.get(dir) ?? new Set<string>();
    for (const seg of kept) if (skippable.has(seg)) names.add(seg);
    byDir.set(dir, names);
  }

  return [...byDir].map(([dir, names]) => ({ dir, names }));
}

function waiverFor(rel: string, waivers: readonly EntryDirWaiver[]): EntryDirWaiver | undefined {
  return waivers.find((w) => rel.startsWith(w.dir + '/'));
}

/**
 * True when root-relative POSIX path `rel` matches an exclude pattern, with
 * the entry-directory waivers applied: a waived `**\/<name>/**` pattern is
 * matched only against the part of the path BELOW the waived directory, so a
 * nested `src/bin/sub/bin/x.ts` is still excluded by it.
 */
export function isExcludedPath(
  rel: string,
  patterns: readonly string[],
  waivers: readonly EntryDirWaiver[]
): boolean {
  const waiver = waiverFor(rel, waivers);
  return patterns.some((pattern) => {
    const name = waiver ? skipDirGlobName(pattern) : undefined;
    if (waiver && name && waiver.names.has(name)) {
      return minimatch(rel.slice(waiver.dir.length + 1), pattern);
    }
    return minimatch(rel, pattern);
  });
}

/**
 * Discover the source files under each waived directory that `findFiles`'
 * built-in skip-dir ignore list hid. Walking from INSIDE the directory keeps
 * that ignore list in force for anything nested below it.
 */
export async function discoverWaivedFiles(
  rootDir: string,
  waivers: readonly EntryDirWaiver[],
  includePatterns: readonly string[]
): Promise<string[]> {
  const found: string[] = [];
  for (const waiver of waivers) {
    if (![...waiver.names].some((name) => DEFAULT_SKIP_DIRS.has(name))) continue;
    for (const file of await findFiles('**/*', join(rootDir, waiver.dir))) {
      const rel = relativePosix(rootDir, file);
      if (includePatterns.some((pattern) => minimatch(rel, pattern))) found.push(file);
    }
  }
  return found;
}

/** The waived names that `findFiles`' built-in ignore list would hide. */
function waivedDefaultSkipNames(waivers: readonly EntryDirWaiver[]): Set<string> {
  const names = new Set<string>();
  for (const waiver of waivers) {
    for (const name of waiver.names) if (DEFAULT_SKIP_DIRS.has(name)) names.add(name);
  }
  return names;
}

/**
 * Discover test files that live under a directory named like a waived skip-dir
 * anywhere in the tree — e.g. `packages/cli/tests/bin/*.test.ts`, the tests of
 * `packages/cli/src/bin/`. Test files are never classified; they only
 * contribute import edges that keep their targets live. Without this, waiving
 * `src/bin/` surfaced its test-only exports as dead, because the tests that
 * import them sit in a `bin/` directory the walker still skipped (#2075).
 */
export async function discoverWaivedTestFiles(
  rootDir: string,
  waivers: readonly EntryDirWaiver[],
  includePatterns: readonly string[],
  isTestFile: (rel: string) => boolean
): Promise<string[]> {
  const names = waivedDefaultSkipNames(waivers);
  if (names.size === 0) return [];
  const ignore = skipDirGlobs(new Set([...DEFAULT_SKIP_DIRS].filter((n) => !names.has(n))));
  const found = new Set<string>();
  for (const pattern of includePatterns) {
    for (const file of await glob(pattern, { cwd: rootDir, absolute: true, dot: true, ignore })) {
      const rel = relativePosix(rootDir, file);
      if (isTestFile(rel) && rel.split('/').some((seg) => names.has(seg))) found.add(file);
    }
  }
  return [...found];
}

/**
 * Exclusion check for a TEST-IMPORT source: a whole-directory exclude naming a
 * waived skip-dir does not hide it (see {@link discoverWaivedTestFiles}); every
 * other exclude still does.
 */
export function isExcludedTestImportSource(
  rel: string,
  patterns: readonly string[],
  waivers: readonly EntryDirWaiver[]
): boolean {
  const names = new Set<string>();
  for (const waiver of waivers) for (const name of waiver.names) names.add(name);
  return patterns.some((pattern) => {
    const name = skipDirGlobName(pattern);
    if (name && names.has(name)) return false;
    return minimatch(rel, pattern);
  });
}

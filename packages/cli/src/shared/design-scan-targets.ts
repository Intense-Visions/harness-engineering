/**
 * Which files a design verifier scans — one definition, every caller.
 *
 * `harness check-design` composes four verifiers over one project, and three of
 * them (detect-design-drift, audit-brand-compliance, audit-component-anatomy)
 * need the same answer to "which files are this project's design surface?". It
 * lived as a copy-pasted extension list plus a byte-identical `walk` in
 * `drift/index.ts` and `brand/index.ts`, and audit-component-anatomy never got a
 * copy at all: it defaulted its candidate set to `[]`, audited nothing, and
 * reported that empty run as a clean audit for every caller that omitted
 * `files` (#2070). A missing file set is a silent hole, never a conservative
 * default.
 *
 * Direct precedent: `packages/core/src/security/scan-targets.ts`, which exists
 * because three copy-pasted security globs had already drifted apart.
 *
 * Adding an extension here widens every design verifier at once. That is the
 * intent — one run, one file set, no verifier quietly looking at less than its
 * siblings.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { minimatch } from 'minimatch';
import { loadAnalysisExclude, loadDesignExclude } from '../config/analysis-schema.js';

/**
 * Extensions the design verifiers scan.
 *
 * Gated by RULE APPLICABILITY, not by file exclusion. `token-bypass-rule.ts`
 * is pure regex over the raw `source` with no extension gate at all, so
 * DRIFT-T001..T004 produce identical, true findings on every dialect below —
 * measured, 2 findings each for the same `.x { color: #ff0000; background:
 * #00ff00; }` across css, scss, tsx, vue, svelte, astro, less, pcss, sass and
 * styl. Excluding a dialect from this list does not protect anyone from a bad
 * finding; it silently drops a real one, which is #2070.
 *
 * The rules that genuinely need a narrower surface already gate themselves —
 * `primitive-adoption-rule.ts:54` returns `[]` unless the file is jsx/tsx.
 * That is the governing pattern, and `.css`/`.scss` have always been scanned
 * DESPITE primitive-adoption not applying to them, which is the precedent this
 * list follows.
 *
 * Known under-reporting, deliberately accepted: the anatomy conventions and
 * BRAND-V001 voice rule key on JSX shapes, so on a single-file-component
 * container they see the `<script>` block but not the template. They
 * under-report there rather than throwing (verified: 0 findings, no error).
 * Under-reporting a component is strictly better than refusing to read it and
 * calling the result clean.
 *
 * Also exactly the eight ts/tsx/mts/cts/js/jsx/mjs/cjs suffixes `check-deps`
 * discovers, so the two commands agree on what counts as source.
 */
export const DESIGN_SCAN_EXTENSIONS = [
  // TypeScript / JavaScript, including the module-suffixed variants.
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  // Stylesheets. `.pcss` is literally CSS; the rest are preprocessor dialects
  // whose colour/spacing literals the token rules read verbatim.
  '.css',
  '.scss',
  '.less',
  '.pcss',
  '.sass',
  '.styl',
  // Single-file components. Their `<style>` blocks are the design surface and
  // the token rules work on them today.
  '.vue',
  '.svelte',
  '.astro',
] as const;

/** Directories never worth walking — heavy, vendored, or generated. */
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'build', 'coverage']);

/**
 * NO depth cap. There was one, at 8 and then 32, justified as protecting
 * against "a pathological or symlink-looping tree". That justification was
 * false: `readdirSync(dir, { withFileTypes: true })` is lstat-based, so
 * `Dirent.isDirectory()` is `false` for a symlink to a directory and the walk
 * never follows one — a direct symlink cycle terminates immediately. Real
 * directory depth is bounded by PATH_MAX, and the cost of a repository walk is
 * breadth, not depth; `SKIPPED_DIRECTORIES` plus exclude-pruning below already
 * remove the heavy trees.
 *
 * What the cap actually did was drop files without saying so, and then — once
 * truncation became an abstention — hard-fail every verifier on any repository
 * with a vendored tree deeper than the cap, with `design.exclude` unable to
 * clear it because the walk ran before excludes were applied. Silence was bad;
 * an unclearable abstention was worse. Both are gone.
 */

/**
 * Resolve the exclude globs a default design scan honours:
 * `design.exclude` stacked on the project-wide `analysis.exclude`.
 *
 * `designExcludeOverride` replaces the `design.exclude` config read (the
 * `detect_drift` MCP tool passes its own); `[]` forces "no design excludes".
 */
export function resolveDesignExcludePatterns(
  projectRoot: string,
  designExcludeOverride?: readonly string[]
): string[] {
  const designExclude = designExcludeOverride ?? loadDesignExclude(projectRoot);
  return [...designExclude, ...loadAnalysisExclude(projectRoot)];
}

/**
 * The abstention a design verifier raises when it read zero files.
 *
 * Every verifier here resolves a candidate set and then skips any candidate it
 * cannot open — a glob (the CLI flag documents `-f, --files` as "file/glob",
 * which no verifier has ever expanded), a typo, a deleted path. When that skip
 * swallows the whole set the run has audited nothing, and reporting that as
 * zero findings is the #2070 defect through the explicit-scope door rather
 * than the omitted-scope one. Zero files read is an abstention, never a pass.
 */
export function noFilesScannedError(verifier: string, projectRoot: string): Error {
  return new Error(
    `${verifier} read no files under ${projectRoot}. This is an abstention, not a clean ` +
      'audit. To act on it: check the `files` scope (explicit paths only, globs are not ' +
      'expanded), check `design.exclude` and `analysis.exclude`, or turn this verifier ' +
      `off with \`${DISABLE_CONFIG_KEYS}\` to acknowledge it does not apply here — an ` +
      'abstention you have acknowledged is not a failure, but it is never a pass.'
  );
}

/**
 * The real opt-out keys, spelled out rather than globbed.
 *
 * A `design.audit.*.enabled: false` glob is not actionable: the config schema
 * names these three (`schema.ts:251/253/255`) and anything else is rejected
 * with `ignored unknown key`. `validate.ts` already names them in full in its
 * own messages; the shared one used to hand the reader a wildcard and let them
 * guess.
 */
const DISABLE_CONFIG_KEYS =
  'design.audit.componentAnatomy.enabled / design.audit.driftDetection.enabled / ' +
  'design.audit.brandCompliance.enabled';

/**
 * The outcome of resolving a design verifier's scan targets.
 *
 * `files` is what to scan. `anyCandidateExisted` separates the two reasons that
 * list can be empty, which must NOT be reported the same way:
 *
 * - `false` — the project holds no design surface at all. "No files of this
 *   kind here" is a true statement, not an abstention. `harness init` followed
 *   by `harness validate` is exactly this case, and the repository already
 *   draws this line for the roadmap doctor: an ABSENT roadmap is "not
 *   applicable", not "could not check".
 * - `true` — candidates existed and the scope threw them all away: an exclude
 *   glob that matched everything, an unexpanded glob, a typo'd path. The
 *   verifier was asked to look at something and looked at nothing, and
 *   reporting that as clean is #2070. It abstains.
 */
export interface DesignScanTargets {
  /** Absolute paths to scan. */
  files: string[];
  /**
   * Whether the project has a design surface AT ALL — keyed off
   * the scannable extension set. Every dialect this project might reasonably
   * call a design surface is now IN that set, so there is no longer a gap
   * between "no design surface" and "a surface I decline to read".
   */
  anyCandidateExisted: boolean;
  /**
   * Why `files` is empty, so the abstention can name the actual cause instead
   * of sending every reader to check `design.exclude`. `'not-empty'` when there
   * is something to scan.
   */
  emptyReason: 'not-empty' | 'no-source' | 'scoped-out';
}

/**
 * Collect the paths a design verifier should scan.
 *
 * An explicit, non-empty `explicitFiles` list is a deliberate scoping and
 * bypasses `excludePatterns` — the caller has already said what it wants. An
 * omitted OR empty list means "no scoping given", and falls back to a walk of
 * the project root. Those two spellings of absence must agree: treating `[]` as
 * "scan nothing" is what made audit-component-anatomy report a clean audit over
 * zero files.
 */
export function collectDesignScanFiles(
  projectRoot: string,
  explicitFiles: readonly string[] | undefined,
  excludePatterns: readonly string[] = []
): DesignScanTargets {
  if (explicitFiles !== undefined && explicitFiles.length > 0) {
    return {
      files: explicitFiles.map((file) =>
        path.isAbsolute(file) ? file : path.join(projectRoot, file)
      ),
      anyCandidateExisted: true,
      emptyReason: 'not-empty',
    };
  }
  // Excludes are passed INTO the walk so an excluded directory is never
  // descended. That is a real cost saving on a vendored tree, and it is also
  // the correctness fix for the latch this used to have: the walk ran first and
  // excludes were applied only to its output, so anything the walk decided on
  // the way down could not be cleared by `design.exclude`. Pruning is
  // conservative — the per-file filter below still runs, so a pattern the
  // directory check does not recognise changes nothing.
  const candidates: string[] = [];
  // `pruned` is load-bearing, not bookkeeping. Pruning an excluded directory
  // means the walk never saw what was inside it, so `candidates.length === 0`
  // no longer distinguishes "this project has no design surface" from "the
  // config excluded all of it". Without this, `design.exclude: ['**/*']` would
  // prune everything, report `no-source`, skip the abstention and hand back a
  // clean result over an unread project — the exact silencing the abstention
  // exists to catch.
  const pruned = { any: false };
  walk(projectRoot, projectRoot, candidates, excludePatterns, pruned);
  const files =
    excludePatterns.length === 0
      ? candidates
      : candidates.filter((absolute) => !isExcluded(projectRoot, absolute, excludePatterns));
  return {
    files,
    anyCandidateExisted: candidates.length > 0 || pruned.any,
    emptyReason:
      files.length > 0
        ? 'not-empty'
        : candidates.length === 0 && !pruned.any
          ? 'no-source'
          : 'scoped-out',
  };
}

/**
 * The abstention rule for a resolved scan target set, in one place so the three
 * verifiers cannot drift apart on it. Returns the error to throw, or `null`
 * when the targets are safe to report on.
 *
 * A design surface exists and the resolved set is empty: an exclude glob
 * discarded all of it, or an explicit `files` list resolved to nothing. The
 * verifier was asked to look at something and looked at nothing, and reporting
 * that as clean is #2070.
 *
 * Everything else — including a project with no source at all — is a truthful
 * zero-file result. (A third case, "candidates resolved but none could be
 * opened", is checked by the caller after scanning, since only it knows.)
 */
export function designScanAbstention(
  verifier: string,
  projectRoot: string,
  targets: DesignScanTargets
): Error | null {
  if (targets.anyCandidateExisted && targets.files.length === 0) {
    return noFilesScannedError(verifier, projectRoot);
  }
  return null;
}

function isExcluded(
  projectRoot: string,
  absoluteFile: string,
  excludePatterns: readonly string[]
): boolean {
  const relative = path.relative(projectRoot, absoluteFile).replaceAll('\\', '/');
  return excludePatterns.some((pattern) => minimatch(relative, pattern, { matchBase: true }));
}

/**
 * True when a DIRECTORY should not be descended, because an exclude pattern
 * already covers everything under it. Conservative by design: the per-file
 * filter still runs, so a pattern this does not recognise costs a wasted
 * descent and nothing else.
 *
 * A trailing globstar is stripped before matching: a pattern like
 * `third_party` followed by slash-globstar matches files UNDER the directory
 * but never the directory itself, which is exactly why `design.exclude` could
 * not stop the walk from descending into it.
 */
function isExcludedDirectory(
  projectRoot: string,
  absoluteDir: string,
  excludePatterns: readonly string[]
): boolean {
  const relative = path.relative(projectRoot, absoluteDir).replaceAll('\\', '/');
  if (relative === '') return false;
  return excludePatterns.some((pattern) => {
    if (minimatch(relative, pattern, { matchBase: true })) return true;
    const withoutTrailingGlob = pattern.replace(/\/\*\*$/, '');
    return (
      withoutTrailingGlob !== pattern &&
      minimatch(relative, withoutTrailingGlob, { matchBase: true })
    );
  });
}

function walk(
  projectRoot: string,
  dir: string,
  out: string[],
  excludePatterns: readonly string[],
  pruned: { any: boolean }
): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || SKIPPED_DIRECTORIES.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // `isDirectory()` is false for a symlink to a directory (lstat-based), so
      // this never follows one and a symlink cycle cannot loop here.
      if (isExcludedDirectory(projectRoot, full, excludePatterns)) {
        pruned.any = true;
        continue;
      }
      walk(projectRoot, full, out, excludePatterns, pruned);
      continue;
    }
    if (!entry.isFile()) continue;
    if (DESIGN_SCAN_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) {
      out.push(full);
    }
  }
}

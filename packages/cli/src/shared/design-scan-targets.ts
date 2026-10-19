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
 * breadth, not depth, and `SKIPPED_DIRECTORIES` already removes the heavy trees.
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
      'expanded), or check `design.exclude` and `analysis.exclude`. On ' +
      '`harness check-design` and `harness validate` you can also set ' +
      `\`${disableConfigKey(verifier)}: false\` to acknowledge this verifier does not ` +
      'apply, which removes it from the run and has the report record it as not-run ' +
      'rather than as clean. (Only those two commands read that key — `harness align`, ' +
      'the design pipeline and the MCP tools call this verifier directly and will keep ' +
      'abstaining, so there scope the run instead.) What no path will do is report zero ' +
      'findings for files it did not read.'
  );
}

/**
 * The opt-out key for ONE verifier, spelled out rather than globbed.
 *
 * A `design.audit.*.enabled` glob is not actionable: the schema names exactly
 * three keys (`schema.ts:251/253/255`) and anything else is rejected with
 * `ignored unknown key`. Naming all three in every message was one notch
 * better and still wrong — the `detect-drift` abstention told the reader to set
 * `componentAnatomy`. The verifier name is already a parameter, so use it.
 */
function disableConfigKey(verifier: string): string {
  const key =
    verifier === 'audit-anatomy'
      ? 'componentAnatomy'
      : verifier === 'detect-design-drift'
        ? 'driftDetection'
        : verifier === 'audit-brand-compliance'
          ? 'brandCompliance'
          : null;
  return key === null
    ? 'design.audit.<componentAnatomy|driftDetection|brandCompliance>.enabled'
    : `design.audit.${key}.enabled`;
}

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
  // Walk everything; filter per-file. No directory pruning — see the note on
  // `walk` for why that was removed rather than narrowed.
  const candidates: string[] = [];
  walk(projectRoot, candidates);
  const files =
    excludePatterns.length === 0
      ? candidates
      : candidates.filter((absolute) => !isExcluded(projectRoot, absolute, excludePatterns));
  return {
    files,
    // Sourced from the FILTER, not from the walk: "candidates existed before
    // filtering and none survived it" is exactly the abstention condition, and
    // it is observable without any claim about what a pattern covers. So
    // `design.exclude: ['**/*']` still trips the abstention rather than
    // masquerading as "this project has no design surface".
    anyCandidateExisted: candidates.length > 0,
    emptyReason:
      files.length > 0 ? 'not-empty' : candidates.length === 0 ? 'no-source' : 'scoped-out',
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

export function isExcluded(
  projectRoot: string,
  absoluteFile: string,
  excludePatterns: readonly string[]
): boolean {
  const relative = path.relative(projectRoot, absoluteFile).replaceAll('\\', '/');
  return excludePatterns.some((pattern) => minimatch(relative, pattern, { matchBase: true }));
}

/**
 * Walk the project for scannable files. Deliberately has NO knowledge of
 * `excludePatterns`.
 *
 * An earlier revision pruned excluded directories here, as an optimization
 * introduced alongside removing the depth cap. It had to go, and it is worth
 * recording why rather than just deleting it:
 *
 * - Its original justification died with the cap. Pruning was added because the
 *   walk ran before excludes were applied to its output, so a truncated walk
 *   could not be cleared by `design.exclude`. Removing the cap removed
 *   truncation, which left pruning as pure optimization with no correctness
 *   role — a vestige of a problem that no longer existed.
 * - The property it needed is genuinely hard. "This pattern excludes everything
 *   the walk could find below here" is a universal claim over arbitrary
 *   minimatch input, and two successive attempts got it wrong — first a
 *   globstar-strip plus `matchBase` (which pruned `src/vendor` while the
 *   per-file filter keeps `src/vendor/nested.css`), then two synthetic probes
 *   that varied depth but not leaf name (so a brace alternation over
 *   non-contiguous depths, a leading-bang negation, an extension-less-only
 *   extglob, and the probe literal itself all slipped through). Each wrong version silently dropped real
 *   findings and reported a complete run — the exact defect this module exists
 *   to remove.
 * - `main` has no pruning and is correct, because the per-file filter already
 *   excludes correctly. The cost of walking an excluded subtree is wasted
 *   `readdirSync` calls on a walk that takes milliseconds over 4,274 files;
 *   `SKIPPED_DIRECTORIES` still removes `node_modules` and friends.
 *
 * Deleting the prune deletes the class, and with it the two safety comments
 * that kept asserting a property the code did not have.
 */
function walk(dir: string, out: string[]): void {
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
      walk(full, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (DESIGN_SCAN_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) {
      out.push(full);
    }
  }
}

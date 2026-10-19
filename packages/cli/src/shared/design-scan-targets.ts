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
 * Source extensions the design verifiers can meaningfully scan: the JS/TS
 * component surface plus the stylesheets the token rules read.
 *
 * The module variants (`.mts`/`.cts`/`.mjs`/`.cjs`) are the SAME two languages
 * the rules already parse, and omitting them meant an adopter whose JavaScript
 * is ESM-or-CJS-suffixed had it silently skipped. Widening here rather than
 * declaring them unreadable also matches the discovery set `check-deps` uses
 * (the same eight ts/tsx/mts/cts/js/jsx/mjs/cjs suffixes), so the two commands
 * no longer disagree about what counts as source in the same repository.
 */
export const DESIGN_SCAN_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.css',
  '.scss',
] as const;

/**
 * Anything that LOOKS like application source, whether or not a design verifier
 * can read it. This set is never scanned — it exists only to decide between the
 * two reasons a default scan can come back empty:
 *
 *   "there is no design surface here"        -> not applicable, report clean
 *   "there is one, in a dialect I cannot read" -> abstain
 *
 * Without that distinction, an adopter whose components are `.vue`/`.svelte`
 * got `totalFiles=0, findings=0`, exit 0 — bit-for-bit the #2070 report this
 * module exists to prevent. The narrowing in "a project with no design surface
 * is not applicable" is correct, but only if the predicate it keys off is a
 * fact about the PROJECT rather than a fact about this verifier's allowlist.
 *
 * Note what does NOT belong here: a dialect the verifiers could read is fixed
 * by adding it to `DESIGN_SCAN_EXTENSIONS`, not by declaring the project
 * unauditable. `.mjs` took that route.
 */
const SOURCE_SHAPED_EXTENSIONS = [
  ...DESIGN_SCAN_EXTENSIONS,
  // Single-file-component frameworks: a real design surface, in a container
  // format none of these verifiers can parse.
  '.vue',
  '.svelte',
  '.astro',
  // Stylesheet dialects the token rules do not understand.
  '.sass',
  '.less',
  '.styl',
  '.pcss',
] as const;

/** Directories never worth walking — heavy, vendored, or generated. */
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'build', 'coverage']);

/**
 * Depth cap on the project walk, so a pathological or symlink-looping tree
 * cannot stall a verifier.
 *
 * This was 8, which silently truncated real source trees: two files in THIS
 * repository sit at depth 9 and were never scanned, one of them a `.tsx`, so
 * the reported file denominator was quietly short. A cap that drops files
 * without saying so is the same defect as auditing nothing and reporting clean,
 * just partial. Two changes make it safe: the cap is now far beyond any
 * plausible source tree, and hitting it is RECORDED (`walkTruncated`) and
 * treated as an abstention instead of a complete scan.
 */
const MAX_WALK_DEPTH = 32;

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
      'audit — check the `files` scope (explicit paths only, globs are not expanded), ' +
      'design.exclude and analysis.exclude.'
  );
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
   * `SOURCE_SHAPED_EXTENSIONS`, not off the narrower set this verifier can
   * read, so "I do not handle `.vue`" can never render as "you have no
   * components".
   */
  anyCandidateExisted: boolean;
  /**
   * Whether the walk hit `MAX_WALK_DEPTH` and stopped descending. A truncated
   * walk cannot report a complete scan, whatever it did manage to read.
   */
  walkTruncated: boolean;
  /**
   * Why `files` is empty, so the abstention can name the actual cause instead
   * of sending every reader to check `design.exclude`. `'not-empty'` when there
   * is something to scan.
   */
  emptyReason: 'not-empty' | 'no-source' | 'unreadable-dialect' | 'scoped-out';
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
      walkTruncated: false,
      emptyReason: 'not-empty',
    };
  }
  const walked: WalkResult = { candidates: [], sawSourceShaped: false, truncated: false };
  walk(projectRoot, walked, 0);
  const files =
    excludePatterns.length === 0
      ? walked.candidates
      : walked.candidates.filter((absolute) => !isExcluded(projectRoot, absolute, excludePatterns));
  return {
    files,
    // Either reading is evidence of a design surface: a file this verifier can
    // read, or one it cannot. Only "neither" means "nothing to look at".
    anyCandidateExisted: walked.candidates.length > 0 || walked.sawSourceShaped,
    walkTruncated: walked.truncated,
    emptyReason:
      files.length > 0
        ? 'not-empty'
        : walked.candidates.length === 0
          ? walked.sawSourceShaped
            ? 'unreadable-dialect'
            : 'no-source'
          : 'scoped-out',
  };
}

/**
 * The abstention rule for a resolved scan target set, in one place so the three
 * verifiers cannot drift apart on it. Returns the error to throw, or `null`
 * when the targets are safe to report on.
 *
 * Three ways a scan is not a clean result:
 *
 * 1. The walk was truncated — whatever it read, it did not read everything, so
 *    it cannot speak for the project.
 * 2. A design surface exists and the resolved set is empty: an exclude glob
 *    discarded all of it, or an explicit `files` list resolved to nothing, or
 *    every file is in a dialect this verifier does not handle.
 * 3. (Checked by the caller after scanning, since only it knows.) Candidates
 *    resolved but none could be opened.
 *
 * Everything else — including a project with no source at all — is a truthful
 * zero-file result.
 */
export function designScanAbstention(
  verifier: string,
  projectRoot: string,
  targets: DesignScanTargets
): Error | null {
  if (targets.walkTruncated) {
    return new Error(
      `${verifier} stopped descending at ${MAX_WALK_DEPTH} directory levels under ` +
        `${projectRoot}, so it did not see the whole project. This is an abstention, ` +
        'not a clean audit — a truncated walk cannot report a complete scan.'
    );
  }
  if (targets.anyCandidateExisted && targets.files.length === 0) {
    if (targets.emptyReason === 'unreadable-dialect') {
      // Sending a Vue or Svelte adopter to check `design.exclude` is a wrong
      // answer confidently delivered. Name the real cause.
      return new Error(
        `${verifier} found a design surface under ${projectRoot} but none of it in a ` +
          `format it can parse (it reads ${DESIGN_SCAN_EXTENSIONS.join(', ')}; single-file ` +
          'component and stylesheet dialects such as .vue/.svelte/.sass are not supported). ' +
          'This is an abstention, not a clean audit — scan the compiled output with ' +
          '`--files`, or turn the verifier off with `design.audit.*.enabled: false`.'
      );
    }
    return noFilesScannedError(verifier, projectRoot);
  }
  return null;
}

/**
 * True when the file's project-relative, POSIX-normalized path matches any
 * exclude glob. `matchBase` lets a bare `*.test.ts` match at any depth,
 * consistent with skill/dispatcher.ts and the `analysis.exclude` semantics.
 */
function isExcluded(
  projectRoot: string,
  absoluteFile: string,
  excludePatterns: readonly string[]
): boolean {
  const relative = path.relative(projectRoot, absoluteFile).replaceAll('\\', '/');
  return excludePatterns.some((pattern) => minimatch(relative, pattern, { matchBase: true }));
}

/** Accumulator for one project walk. */
interface WalkResult {
  /** Files this verifier can read. */
  candidates: string[];
  /** Whether any source-shaped file was seen, readable by this verifier or not. */
  sawSourceShaped: boolean;
  /** Whether the depth cap stopped a descent. */
  truncated: boolean;
}

function walk(dir: string, out: WalkResult, depth: number): void {
  if (depth > MAX_WALK_DEPTH) {
    // Record it rather than returning quietly: the caller turns this into an
    // abstention, because a walk that stopped early has not seen the project.
    out.truncated = true;
    return;
  }
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
      walk(full, out, depth + 1);
      continue;
    }
    if (!entry.isFile()) continue;
    if (DESIGN_SCAN_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) {
      out.candidates.push(full);
      out.sawSourceShaped = true;
    } else if (SOURCE_SHAPED_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) {
      // A design surface this verifier cannot read. Not scanned, but it is the
      // difference between "no components" and "components I do not handle".
      out.sawSourceShaped = true;
    }
  }
}

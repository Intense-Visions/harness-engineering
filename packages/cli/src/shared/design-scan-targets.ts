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
 */
export const DESIGN_SCAN_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.css', '.scss'] as const;

/** Directories never worth walking — heavy, vendored, or generated. */
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'build', 'coverage']);

/** Depth cap on the project walk, so a pathological tree cannot stall a verifier. */
const MAX_WALK_DEPTH = 8;

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
  /** Whether ANY candidate existed before excludes and readability narrowed it. */
  anyCandidateExisted: boolean;
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
    };
  }
  const candidates: string[] = [];
  walk(projectRoot, candidates, 0);
  const files =
    excludePatterns.length === 0
      ? candidates
      : candidates.filter((absolute) => !isExcluded(projectRoot, absolute, excludePatterns));
  return { files, anyCandidateExisted: candidates.length > 0 };
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

function walk(dir: string, out: string[], depth: number): void {
  if (depth > MAX_WALK_DEPTH) return;
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
    } else if (
      entry.isFile() &&
      DESIGN_SCAN_EXTENSIONS.some((extension) => entry.name.endsWith(extension))
    ) {
      out.push(full);
    }
  }
}

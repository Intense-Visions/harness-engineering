/**
 * Changed-surface derivation for `harness validate --changed` / `--affected`.
 *
 * The hot path for `harness validate` is the set of file-walking design audits
 * (detect-drift, component-anatomy, brand-compliance) which today scan the whole
 * project on every invocation. Adoption telemetry (GH #1523) shows `cli/validate`
 * is 68% of all harness CLI calls, so re-walking the full surface each time is the
 * single highest-leverage latency cost in the tool.
 *
 * Affected mode derives the changed surface from git — the files that differ from
 * the merge-base with the default branch (or an explicit `--since <ref>`), plus
 * any uncommitted or untracked working-tree changes — and hands that explicit file
 * list to the walkers, which already support a `files` scoping arg. The fixed-scope
 * checks (AGENTS.md, roadmap, ADR numbers, STRATEGY.md, pulse) are cheap and always
 * run; only the project walkers are scoped.
 *
 * Affected mode is OPT-IN. Bare `harness validate` keeps the full sweep, so the
 * default behavior is unchanged for existing adopters and CI/pre-merge runs.
 *
 * STALENESS CONTRACT: a scoped run only re-validates files in the changed surface.
 * A finding whose input file is unchanged since the base ref is NOT re-checked, so
 * affected mode must never be the sole gate before a merge or a release. Reserve the
 * full sweep (bare `harness validate`) for pre-merge, scheduled, and release runs.
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { minimatch } from 'minimatch';
import { loadAnalysisExclude, loadDesignExclude } from '../config/analysis-schema.js';

/**
 * The design walkers that are scoped to the changed surface in affected mode.
 *
 * Only detect-drift and audit-brand walk the whole tree in a bare `harness
 * validate`; component-anatomy is called with no file list (a no-op in validate
 * today), so scoping it would ACTIVATE it and make an affected run report findings
 * a full run does not — the opposite of parity. It is deliberately left unscoped.
 */
export const SCOPED_WALKERS = ['driftDetection', 'brandCompliance'] as const;

/**
 * File extensions the design walkers actually scan (detect-drift and audit-brand
 * share this set). A changed file outside this set is never scanned by a full sweep
 * either, so it is dropped from the scoped surface to keep scoped ⊆ full.
 */
const DESIGN_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.css', '.scss'];

/** Directories the walkers skip during a full walk; mirrored so scoped ⊆ full. */
const SKIP_DIR_SEGMENTS = new Set(['node_modules', 'dist', 'build', 'coverage']);

export interface ChangedSurface {
  /** True when a changed surface was successfully derived from git. */
  ok: boolean;
  /**
   * The base ref the surface was diffed against — the merge-base commit with the
   * default branch, or the explicit `--since` ref. Undefined when derivation failed.
   */
  ref?: string;
  /**
   * Project-relative, POSIX-normalized paths of files that changed vs the base ref,
   * filtered to those that still exist on disk (a deleted file has no surface to
   * validate). Empty is a valid result — it means nothing changed.
   */
  files: string[];
  /**
   * Populated only when {@link ok} is false: why the surface could not be derived.
   * The caller falls back to a full sweep and surfaces this as a warning, so a
   * broken derivation degrades to the safe (complete) behavior rather than a false
   * green over an empty file list.
   */
  reason?: string;
}

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

/**
 * Resolve the base ref to diff against. With an explicit `since`, use it verbatim.
 * Otherwise compute the merge-base between HEAD and the default branch so that a
 * feature branch is scoped to only its own changes, not every commit since the
 * branch point.
 */
function resolveBaseRef(cwd: string, since: string | undefined, defaultBranch: string): string {
  if (since !== undefined && since.length > 0) {
    // Validate the ref exists; throws (caught by caller) if it does not.
    git(['rev-parse', '--verify', '--quiet', `${since}^{commit}`], cwd);
    return since;
  }
  return git(['merge-base', 'HEAD', defaultBranch], cwd);
}

/**
 * Derive the changed surface from git.
 *
 * The surface is the union of:
 *  - tracked files that differ from the base ref (`git diff --name-only <base>` —
 *    this compares the base to the WORKING TREE, so it includes staged and unstaged
 *    edits, exactly what an interactive/agent run is touching), and
 *  - untracked files (`git ls-files --others --exclude-standard`), so brand-new
 *    files an interactive run just wrote are validated too.
 *
 * Never throws: any git failure is reported as `{ ok: false, reason }` so the caller
 * can fall back to a full sweep.
 */
export function deriveChangedSurface(
  cwd: string,
  opts: { since?: string; defaultBranch?: string } = {}
): ChangedSurface {
  const defaultBranch = opts.defaultBranch ?? 'main';
  let base: string;
  try {
    base = resolveBaseRef(cwd, opts.since, defaultBranch);
  } catch (err) {
    const target = opts.since ? `ref "${opts.since}"` : `default branch "${defaultBranch}"`;
    return {
      ok: false,
      files: [],
      reason: `could not resolve a base ref (${target}): ${(err as Error).message.trim()}`,
    };
  }

  let tracked: string[];
  let untracked: string[];
  try {
    tracked = git(['diff', '--name-only', base], cwd).split('\n').filter(Boolean);
    untracked = git(['ls-files', '--others', '--exclude-standard'], cwd)
      .split('\n')
      .filter(Boolean);
  } catch (err) {
    return {
      ok: false,
      files: [],
      reason: `git diff against "${base}" failed: ${(err as Error).message.trim()}`,
    };
  }

  const seen = new Set<string>();
  const files: string[] = [];
  for (const raw of [...tracked, ...untracked]) {
    const rel = raw.replaceAll('\\', '/');
    if (seen.has(rel)) continue;
    seen.add(rel);
    // A file that no longer exists (deleted/renamed-away) has no surface to
    // validate; the walkers would fail to read it. Filter to what is on disk.
    if (!fs.existsSync(path.join(cwd, rel))) continue;
    files.push(rel);
  }

  return { ok: true, ref: base, files };
}

/**
 * Narrow a raw changed surface to the files a full design sweep would actually
 * scan, so an affected run stays a SUBSET of the full run (scoped ⊆ full) — the
 * "affected and full agree" contract. Without this, the raw git surface (docs,
 * JSON, config, generated files) would be handed to the walkers' explicit-`files`
 * path, which by design bypasses the exclude filter, so an affected run could
 * report findings on files a full sweep skips.
 *
 * A file survives only when it (1) has a design-relevant extension, (2) lives
 * outside the walkers' hard-skipped directories, and (3) is not matched by the
 * project's `analysis.exclude` ∪ `design.exclude` globs (the same union detect-drift
 * applies to its walk).
 */
export function filterToDesignSurface(cwd: string, files: readonly string[]): string[] {
  const excludePatterns = [...loadDesignExclude(cwd), ...loadAnalysisExclude(cwd)];
  return files.filter((rel) => {
    if (!DESIGN_EXTENSIONS.some((ext) => rel.endsWith(ext))) return false;
    const segments = rel.split('/');
    if (segments.some((seg) => seg.startsWith('.') || SKIP_DIR_SEGMENTS.has(seg))) return false;
    if (excludePatterns.some((pattern) => minimatch(rel, pattern, { matchBase: true }))) {
      return false;
    }
    return true;
  });
}

import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import { ArchBaselineSchema, ArchMetricCategorySchema } from './types';
import type {
  ArchBaseline,
  ArchDiffResult,
  ArchMetricCategory,
  CategoryRegression,
  Violation,
} from './types';
import type { ArchBaselineManager } from './baseline-manager';

/**
 * Base-aware baseline resolution + per-PR allowance files.
 *
 * WHY THIS EXISTS (the `baselines.json` GitHub merge cascade): the arch gate used to
 * compare current metrics against the COMMITTED working-tree baseline. A PR that added
 * complexity failed the gate, the author ran `--update-baseline`, and that REWROTE the
 * shared snapshot on the branch — diverging value/violationId lines from main. `merge=ours`
 * only runs on a LOCAL merge, so GitHub's server-side 3-way merge conflicted, and every
 * merge into main re-conflicted all other open PRs. A treadmill.
 *
 * The fix: (1) in a PR context resolve the base baseline from the merge target
 * (`git show origin/main:…`) so the gate is a true delta-vs-main, and (2) acknowledge
 * intentional regressions with a UNIQUELY-NAMED per-PR allowance file (the same
 * one-file-per-PR pattern as `.changeset/*.md`), so the committed snapshot is never
 * rewritten on a branch and can never conflict. The snapshot becomes single-writer:
 * only the post-merge `refresh-baselines` job on main advances it.
 *
 * Everything here is FAIL-OPEN on infra gaps (no remote, fresh clone, detached HEAD,
 * not-a-git-repo): resolution falls back to today's working-tree behavior rather than
 * ever producing a false gate failure.
 */

/** Default base ref to diff against; overridable via env for non-`main` trunks. */
const DEFAULT_BASE_REF = 'origin/main';

/** Run git read-only; return trimmed stdout or null on any failure (fail-open). */
function git(projectRoot: string, args: string[]): string | null {
  try {
    return execFileSync('git', args, {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function parseBaseline(raw: string): ArchBaseline | null {
  try {
    const parsed = ArchBaselineSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** The branch name a base ref points at (`origin/main` → `main`, `main` → `main`). */
function baseBranchName(baseRef: string): string {
  const slash = baseRef.lastIndexOf('/');
  return slash >= 0 ? baseRef.slice(slash + 1) : baseRef;
}

export type ArchBaselineSource = 'base-ref' | 'working-tree' | 'none';

/**
 * WHY a resolution did NOT use the base ref. Only set when `source !== 'base-ref'`. This is
 * what lets the `--update-baseline` WRITE path tell apart the LEGITIMATE single-writer
 * whole-snapshot contexts (`forced` / `non-git` / `base-branch`) — where rewriting the
 * committed snapshot is correct — from a FEATURE-BRANCH context where the base ref was merely
 * unreadable (`base-ref-unreachable` / `base-ref-invalid`). In the latter case rewriting the
 * shared snapshot on a branch silently reintroduces the `baselines.json` merge cascade, so the
 * WRITE path must acknowledge via an allowance instead. `base-ref-absent` means the base branch
 * has no baseline at all (a genuine bootstrap), where a whole-snapshot CREATE is safe.
 */
export type ArchBaselineFallback =
  | 'forced'
  | 'non-git'
  | 'base-branch'
  | 'base-ref-unreachable'
  | 'base-ref-absent'
  | 'base-ref-invalid';

export interface ArchBaselineResolution {
  /** The baseline to gate against (null when neither base nor working-tree file exists). */
  baseline: ArchBaseline | null;
  /** Where it came from. `base-ref` marks a PR context (drives allowance-write behavior). */
  source: ArchBaselineSource;
  /** The ref used when `source === 'base-ref'`. */
  baseRef?: string;
  /** Why the base ref was NOT used (set only when `source !== 'base-ref'`); see the type doc. */
  fallback?: ArchBaselineFallback;
}

export interface ResolveArchBaselineOptions {
  /** Base ref to diff against (default `origin/main`, or `$HARNESS_ARCH_BASE_REF`). */
  baseRef?: string;
}

/**
 * Resolve the baseline the gate should compare against for the current context.
 *
 * PR context (feature branch, base ref reachable) → the base ref's committed copy, so the
 * branch's own working-tree `baselines.json` is irrelevant and never needs to change.
 * Otherwise (on the base branch, no reachable base ref, not a git repo, or the base copy is
 * missing/invalid) → the working-tree file, exactly as before. Always fail-open.
 */
export function resolveArchBaseline(
  projectRoot: string,
  baselinePath: string,
  manager: Pick<ArchBaselineManager, 'load'>,
  options?: ResolveArchBaselineOptions
): ArchBaselineResolution {
  const workingTree = (fallback: ArchBaselineFallback): ArchBaselineResolution => {
    const baseline = manager.load();
    return { baseline, source: baseline ? 'working-tree' : 'none', fallback };
  };

  // Escape hatch for the authoritative post-merge `refresh-baselines` job (and any other
  // caller that must own the committed snapshot): force whole-snapshot / working-tree
  // resolution regardless of git context. In CI the refresh job runs on a DETACHED HEAD at
  // the merged main SHA, where branch-name detection ('main') fails and, if `origin/main`
  // happened to be reachable, this resolver would otherwise pick `base-ref` and make
  // `--update-baseline` write an ALLOWANCE instead of advancing the snapshot — which would
  // never fold merged allowances in (an allowance treadmill). This env pins it to today's
  // whole-snapshot behavior so the refresh job always advances the authoritative baseline.
  if (process.env.HARNESS_ARCH_FORCE_WORKING_TREE) return workingTree('forced');

  const baseRef = options?.baseRef ?? process.env.HARNESS_ARCH_BASE_REF ?? DEFAULT_BASE_REF;

  // Not a git repo → nothing to diff against; use the working-tree file.
  if (git(projectRoot, ['rev-parse', '--is-inside-work-tree']) !== 'true')
    return workingTree('non-git');

  // On the base branch itself (e.g. `main`) the working-tree file is authoritative — the
  // base ref may lag HEAD after a just-merged advance, so diffing against it could report
  // a phantom regression. This preserves today's behavior on main.
  const branch = git(projectRoot, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch === baseBranchName(baseRef)) return workingTree('base-branch');

  // Base ref unreachable (fresh shallow clone, no remote, unfetched worktree) → fall back.
  if (git(projectRoot, ['rev-parse', '--verify', '--quiet', baseRef]) === null) {
    return workingTree('base-ref-unreachable');
  }

  // `git show` needs a repo-root-relative path; `baselinePath` is relative to projectRoot,
  // which may be a nested package (e.g. `packages/cli`). `--show-prefix` bridges the two.
  const prefix = git(projectRoot, ['rev-parse', '--show-prefix']) ?? '';
  const gitPath = (prefix + baselinePath).replace(/\\/g, '/');
  const raw = git(projectRoot, ['show', `${baseRef}:${gitPath}`]);
  if (raw === null) return workingTree('base-ref-absent'); // absent on base (new project) → fall back
  const baseline = parseBaseline(raw);
  if (!baseline) return workingTree('base-ref-invalid'); // unparseable on base → fail-open

  return { baseline, source: 'base-ref', baseRef };
}

/**
 * Whether a resolution is a LEGITIMATE single-writer whole-snapshot context — the ONLY
 * contexts in which `--update-baseline` may REWRITE the committed `baselines.json`:
 *
 *   - `base-branch`  — on the trunk itself; the working-tree file is authoritative.
 *   - `non-git`      — nothing to diff against a base.
 *   - `forced`       — `HARNESS_ARCH_FORCE_WORKING_TREE` (the post-merge refresh-baselines job).
 *   - `base-ref-absent` — the base branch has NO baseline, so a whole-snapshot CREATE cannot
 *     conflict with anything (a genuine bootstrap).
 *
 * A `base-ref` resolution is a PR context (allowance-write), never whole-snapshot. Crucially, a
 * FEATURE branch whose base ref was merely UNREADABLE (`base-ref-unreachable` — unfetched
 * worktree / shallow clone — or `base-ref-invalid`) is NOT a whole-snapshot context: rewriting
 * the shared snapshot there silently reintroduces the `baselines.json` merge cascade #1140
 * exists to prevent. Such a branch must acknowledge via an allowance instead.
 */
export function isWholeSnapshotContext(resolution: ArchBaselineResolution): boolean {
  if (resolution.source === 'base-ref') return false;
  switch (resolution.fallback) {
    case 'forced':
    case 'non-git':
    case 'base-branch':
    case 'base-ref-absent':
      return true;
    default:
      return false;
  }
}

// --- Per-PR allowance files -------------------------------------------------

/**
 * A per-PR acknowledgment that a metric intentionally regresses. Uniquely named per branch
 * so two open PRs never touch the same file (conflict-free), and transient: consumed and
 * deleted by the post-merge `refresh-baselines` job once folded into the committed snapshot.
 */
export const ArchAllowanceSchema = z.object({
  /** Human reason the regression is accepted (required). */
  reason: z.string().min(1),
  /** Per-category allowed aggregate ceiling: `currentValue` is accepted for this category. */
  categories: z.record(ArchMetricCategorySchema, z.number()).default({}),
  /** New (warning-severity) violation ids this allowance accepts. */
  violationIds: z.array(z.string()).default([]),
  /** Commit the allowance was authored from (provenance only). */
  createdFrom: z.string().default(''),
});

export type ArchAllowance = z.infer<typeof ArchAllowanceSchema>;

/** Directory holding the per-PR allowance files, alongside the baseline it guards. */
export function archAllowancesDir(projectRoot: string, baselinePath: string): string {
  return join(projectRoot, dirname(baselinePath), 'allowances');
}

export interface ArchAllowanceCoverage {
  /** Union of accepted new-violation ids across all present allowances. */
  violationIds: Set<string>;
  /** Per-category max accepted aggregate ceiling across all present allowances. */
  categoryCeilings: Map<ArchMetricCategory, number>;
  /** Absolute paths of the allowance files consumed (for the refresh job to delete). */
  files: string[];
  /** The reasons, for audit/reporting. */
  reasons: string[];
}

function emptyCoverage(): ArchAllowanceCoverage {
  return { violationIds: new Set(), categoryCeilings: new Map(), files: [], reasons: [] };
}

export interface LoadAllowancesOptions {
  /**
   * Absolute paths to skip. Used by the WRITE path so a branch rebuilding its OWN allowance
   * excludes its own file from the coverage filter — otherwise a re-run would only re-record
   * the newly-uncovered violations and silently DROP the ones it acknowledged on a prior run.
   */
  excludeFiles?: string[];
}

/**
 * Read + aggregate every `*.json` allowance in the allowances dir. Invalid or unparseable
 * files are skipped (never a hard failure — a malformed allowance must not break the gate).
 */
export function loadArchAllowances(
  projectRoot: string,
  baselinePath: string,
  options?: LoadAllowancesOptions
): ArchAllowanceCoverage {
  const dir = archAllowancesDir(projectRoot, baselinePath);
  const coverage = emptyCoverage();
  if (!existsSync(dir)) return coverage;
  const excluded = new Set((options?.excludeFiles ?? []).map((f) => resolve(f)));

  for (const entry of readdirSync(dir).sort()) {
    if (!entry.endsWith('.json')) continue;
    const full = join(dir, entry);
    if (excluded.has(resolve(full))) continue;
    let parsed: z.SafeParseReturnType<unknown, ArchAllowance>;
    try {
      parsed = ArchAllowanceSchema.safeParse(JSON.parse(readFileSync(full, 'utf-8')));
    } catch {
      continue; // unreadable / non-JSON → skip
    }
    if (!parsed.success) continue;
    coverage.files.push(full);
    coverage.reasons.push(parsed.data.reason);
    for (const id of parsed.data.violationIds) coverage.violationIds.add(id);
    for (const [category, ceiling] of Object.entries(parsed.data.categories)) {
      const cat = category as ArchMetricCategory;
      const prev = coverage.categoryCeilings.get(cat);
      if (prev === undefined || ceiling > prev) coverage.categoryCeilings.set(cat, ceiling);
    }
  }
  return coverage;
}

export interface AllowanceFilteredDiff extends ArchDiffResult {
  /** New violations suppressed by an allowance (warning-severity only). */
  allowedNewViolations: Violation[];
  /** Regressions suppressed by an allowance ceiling. */
  allowedRegressions: CategoryRegression[];
}

/**
 * Remove allowance-covered items from a diff result.
 *
 * CRITICAL (keeps the gate honest): error-severity new violations are a genuine threshold
 * breach and are NEVER coverable — an allowance can only acknowledge accumulation of
 * tracked (warning-level) complexity or an aggregate-total ratchet, not a real breach.
 * A regression is covered iff a present allowance's ceiling for that category is >= the
 * current value.
 */
export function filterDiffByAllowances(
  diffResult: ArchDiffResult,
  coverage: ArchAllowanceCoverage
): AllowanceFilteredDiff {
  const uncoveredNew: Violation[] = [];
  const allowedNew: Violation[] = [];
  for (const v of diffResult.newViolations) {
    if (v.severity !== 'error' && coverage.violationIds.has(v.id)) allowedNew.push(v);
    else uncoveredNew.push(v);
  }

  const uncoveredReg: CategoryRegression[] = [];
  const allowedReg: CategoryRegression[] = [];
  for (const r of diffResult.regressions) {
    const ceiling = coverage.categoryCeilings.get(r.category);
    if (ceiling !== undefined && r.currentValue <= ceiling) allowedReg.push(r);
    else uncoveredReg.push(r);
  }

  return {
    ...diffResult,
    passed: uncoveredNew.length === 0 && uncoveredReg.length === 0,
    newViolations: uncoveredNew,
    regressions: uncoveredReg,
    allowedNewViolations: allowedNew,
    allowedRegressions: allowedReg,
  };
}

/** Filesystem-safe, stable-per-branch slug (so re-running `--update-baseline` overwrites). */
function sanitizeSlug(raw: string): string {
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || 'allowance';
}

/**
 * A unique-per-PR allowance filename stem. The current branch name gives a name that is
 * stable across commits on the same branch (re-runs overwrite one file) yet distinct from
 * any other branch (two PRs never collide). Detached HEAD → a timestamp+random stem.
 */
export function archAllowanceSlug(projectRoot: string): string {
  const branch = git(projectRoot, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch && branch !== 'HEAD') return sanitizeSlug(branch);
  return `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
}

/**
 * Write a per-PR allowance file atomically. Returns the absolute path written.
 * `slug` defaults to the current branch's slug.
 */
export function writeArchAllowance(
  projectRoot: string,
  baselinePath: string,
  allowance: ArchAllowance,
  slug?: string
): string {
  const dir = archAllowancesDir(projectRoot, baselinePath);
  mkdirSync(dir, { recursive: true });
  const name = `${slug ?? archAllowanceSlug(projectRoot)}.json`;
  const full = join(dir, name);
  const tmp = `${full}.${randomBytes(4).toString('hex')}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(allowance, null, 2)}\n`);
  renameSync(tmp, full);
  return full;
}

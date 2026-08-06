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
import { dirname, join } from 'node:path';
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

export interface ArchBaselineResolution {
  /** The baseline to gate against (null when neither base nor working-tree file exists). */
  baseline: ArchBaseline | null;
  /** Where it came from. `base-ref` marks a PR context (drives allowance-write behavior). */
  source: ArchBaselineSource;
  /** The ref used when `source === 'base-ref'`. */
  baseRef?: string;
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
  const workingTree = (): ArchBaselineResolution => {
    const baseline = manager.load();
    return { baseline, source: baseline ? 'working-tree' : 'none' };
  };

  const baseRef = options?.baseRef ?? process.env.HARNESS_ARCH_BASE_REF ?? DEFAULT_BASE_REF;

  // Not a git repo → nothing to diff against; use the working-tree file.
  if (git(projectRoot, ['rev-parse', '--is-inside-work-tree']) !== 'true') return workingTree();

  // On the base branch itself (e.g. `main`) the working-tree file is authoritative — the
  // base ref may lag HEAD after a just-merged advance, so diffing against it could report
  // a phantom regression. This preserves today's behavior on main.
  const branch = git(projectRoot, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch === baseBranchName(baseRef)) return workingTree();

  // Base ref unreachable (fresh shallow clone, no remote) → fall back.
  if (git(projectRoot, ['rev-parse', '--verify', '--quiet', baseRef]) === null) {
    return workingTree();
  }

  // `git show` needs a repo-root-relative path; `baselinePath` is relative to projectRoot,
  // which may be a nested package (e.g. `packages/cli`). `--show-prefix` bridges the two.
  const prefix = git(projectRoot, ['rev-parse', '--show-prefix']) ?? '';
  const gitPath = (prefix + baselinePath).replace(/\\/g, '/');
  const raw = git(projectRoot, ['show', `${baseRef}:${gitPath}`]);
  if (raw === null) return workingTree(); // absent on base (new project) → fall back
  const baseline = parseBaseline(raw);
  if (!baseline) return workingTree(); // unparseable on base → fail-open

  return { baseline, source: 'base-ref', baseRef };
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

/**
 * Read + aggregate every `*.json` allowance in the allowances dir. Invalid or unparseable
 * files are skipped (never a hard failure — a malformed allowance must not break the gate).
 */
export function loadArchAllowances(
  projectRoot: string,
  baselinePath: string
): ArchAllowanceCoverage {
  const dir = archAllowancesDir(projectRoot, baselinePath);
  const coverage = emptyCoverage();
  if (!existsSync(dir)) return coverage;

  for (const entry of readdirSync(dir).sort()) {
    if (!entry.endsWith('.json')) continue;
    const full = join(dir, entry);
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

import type { ClassifyInput, RollbackDecision } from './types';
import type { RollbackIO } from './io';

/**
 * Migration/irreversibility path heuristics. Matching is CONTEXT ONLY — it
 * emits warning strings and never flips `revertReady` (spec D3).
 *
 * NOTE (v1, deliberately narrow): heuristic only — matches migrations/, *.sql,
 * and schema.{prisma,sql,graphql,rb}. It does NOT recognize db/migrate, Flyway
 * (V__*.sql conventions), Alembic (versions/*.py), or ORM-specific layouts.
 * Broaden with evidence, not speculation. Case-insensitive per finding #1.
 */
const MIGRATION_PATTERNS: ReadonlyArray<{ test: (p: string) => boolean; label: string }> = [
  { test: (p) => /(^|\/)migrations\//.test(p), label: 'migration directory' },
  { test: (p) => p.endsWith('.sql'), label: 'SQL file' },
  { test: (p) => /(^|\/)schema\.(prisma|sql|graphql|rb)$/.test(p), label: 'schema file' },
];

function detectMigrationWarnings(changedFiles: string[]): string[] {
  const warnings: string[] = [];
  for (const file of changedFiles) {
    // #1: match case-insensitively, but keep the ORIGINAL casing in the warning.
    const p = file.toLowerCase();
    for (const { test, label } of MIGRATION_PATTERNS) {
      if (test(p)) {
        warnings.push(`${file} (${label}) — verify revert does not orphan schema state`);
        break;
      }
    }
  }
  return warnings;
}

function intersects(a: string[], b: string[]): boolean {
  const set = new Set(a);
  return b.some((x) => set.has(x));
}

/**
 * Pure revert-readiness classifier. Reaches git/gh only through the injected
 * `RollbackIO` seam. Gate order (spec D3): a conflicting revert short-circuits
 * to `skipped`; a dependent later merge blocks; otherwise revert-ready.
 * `blastRadius`/`migrationWarnings` are attached as context and never gate.
 */
export async function classifyRevert(
  input: ClassifyInput,
  io: RollbackIO
): Promise<RollbackDecision> {
  // #2: an empty changed-file set means the target could not be resolved to any
  // files — there is nothing to revert, so skip rather than silently propose.
  if (input.changedFiles.length === 0) {
    return {
      targetPr: input.targetPr,
      trigger: input.trigger,
      revertReady: false,
      reasons: ['no changed files resolved for the target PR — cannot classify a revert'],
      cleanRevert: false,
      dependentMerges: [],
      migrationWarnings: [],
      ...(input.blastRadius !== undefined ? { blastRadius: input.blastRadius } : {}),
      action: 'skipped',
    };
  }

  const migrationWarnings = detectMigrationWarnings(input.changedFiles);
  const { clean, conflictPaths } = await io.revertDryRun(input.mergeSha);

  // #3: exclude the target PR itself from dependent-merge detection (a later
  // listing may include the target; it can't be its own dependent).
  const dependentMerges = input.laterMerges
    .filter((m) => m.pr !== input.targetPr)
    .filter((m) => intersects(input.changedFiles, m.changedFiles))
    .map((m) => m.pr);

  const reasons: string[] = [];
  let revertReady: boolean;
  let action: RollbackDecision['action'];

  if (!clean) {
    revertReady = false;
    action = 'skipped';
    // #4: distinguish "we know the conflicting paths" from "the adapter couldn't
    // recover them" rather than emitting a bare `unknown`.
    const detail =
      conflictPaths.length > 0
        ? `conflicts: ${conflictPaths.join(', ')}`
        : 'conflicting paths unavailable';
    reasons.push(`git revert did not apply cleanly (${detail})`);
  } else if (dependentMerges.length > 0) {
    revertReady = false;
    action = 'blocked';
    reasons.push(`dependent later merge(s) touch the same files: ${dependentMerges.join(', ')}`);
  } else {
    revertReady = true;
    action = 'proposed';
    reasons.push('clean revert with no dependent later merge');
  }

  return {
    targetPr: input.targetPr,
    trigger: input.trigger,
    revertReady,
    reasons,
    cleanRevert: clean,
    dependentMerges,
    // `blastRadius` is optional context; only attach when provided so the field
    // stays absent (not `undefined`) under `exactOptionalPropertyTypes`.
    ...(input.blastRadius !== undefined ? { blastRadius: input.blastRadius } : {}),
    migrationWarnings,
    action,
  };
}

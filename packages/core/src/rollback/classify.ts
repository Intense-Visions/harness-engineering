import type { ClassifyInput, RollbackDecision } from './types';
import type { RollbackIO } from './io';

/**
 * Migration/irreversibility path heuristics. Matching is CONTEXT ONLY — it
 * emits warning strings and never flips `revertReady` (spec D3).
 */
const MIGRATION_PATTERNS: ReadonlyArray<{ test: (p: string) => boolean; label: string }> = [
  { test: (p) => /(^|\/)migrations\//.test(p), label: 'migration directory' },
  { test: (p) => p.endsWith('.sql'), label: 'SQL file' },
  { test: (p) => /(^|\/)schema\.(prisma|sql|graphql|rb)$/.test(p), label: 'schema file' },
];

function detectMigrationWarnings(changedFiles: string[]): string[] {
  const warnings: string[] = [];
  for (const file of changedFiles) {
    for (const { test, label } of MIGRATION_PATTERNS) {
      if (test(file)) {
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
  const migrationWarnings = detectMigrationWarnings(input.changedFiles);
  const { clean, conflictPaths } = await io.revertDryRun(input.mergeSha);

  const dependentMerges = input.laterMerges
    .filter((m) => intersects(input.changedFiles, m.changedFiles))
    .map((m) => m.pr);

  const reasons: string[] = [];
  let revertReady: boolean;
  let action: RollbackDecision['action'];

  if (!clean) {
    revertReady = false;
    action = 'skipped';
    reasons.push(
      `git revert did not apply cleanly (conflicts: ${conflictPaths.join(', ') || 'unknown'})`
    );
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

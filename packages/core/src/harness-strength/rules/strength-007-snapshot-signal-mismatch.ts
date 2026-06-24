import type { ProjectContext, StrengthFinding, StrengthRule } from '../types';

/**
 * STRENGTH-007 — snapshot/signal mismatch.
 *
 * Maps a health-snapshot check key to the `signals` entry that would CONTRADICT a
 * passing result for that check. Derived from this repo's live
 * `.harness/health-snapshot.json`, where `checks.security` is contradicted by the
 * `security-findings` signal. Signals outside this table are ignored (a documented
 * limitation, not a false pass).
 */
export const CHECK_SIGNAL_MAP: Record<string, string> = {
  security: 'security-findings',
  entropy: 'entropy-drift',
  deps: 'dependency-violations',
  perf: 'perf-regression',
  docs: 'doc-coverage',
  lint: 'lint-issues',
};

interface SnapshotShape {
  checks: Record<string, { passed?: boolean }>;
  signals?: string[];
}

/** Narrow an unknown health snapshot to the minimal shape this rule needs. */
function isSnapshot(value: unknown): value is SnapshotShape {
  if (value === null || typeof value !== 'object') return false;
  const checks = (value as Record<string, unknown>).checks;
  return checks !== null && typeof checks === 'object';
}

export const strength007SnapshotSignalMismatch: StrengthRule = {
  id: 'STRENGTH-007',
  gearPiece: 'snapshot-honesty',
  defaultSeverity: 'error',
  appliesIn: () => true,
  evaluable: (ctx) => isSnapshot(ctx.healthSnapshot),
  detect(ctx: ProjectContext): Omit<StrengthFinding, 'severity'>[] {
    if (!isSnapshot(ctx.healthSnapshot)) return [];
    const { checks, signals } = ctx.healthSnapshot;
    const present = new Set(Array.isArray(signals) ? signals : []);
    const findings: Omit<StrengthFinding, 'severity'>[] = [];
    for (const [check, result] of Object.entries(checks)) {
      const signal = CHECK_SIGNAL_MAP[check];
      // Signals outside the map are ignored (documented limitation).
      if (signal === undefined) continue;
      if (result?.passed === true && present.has(signal)) {
        findings.push({
          id: 'STRENGTH-007',
          gearPiece: 'snapshot-honesty',
          file: '.harness/health-snapshot.json',
          message: `Health snapshot reports the "${check}" check as passing while the contradicting signal "${signal}" is present — the snapshot is dishonest.`,
          remediation: `Reconcile the snapshot: either the "${check}" check did not actually pass, or the "${signal}" signal is stale. Regenerate the snapshot from a clean run.`,
        });
      }
    }
    return findings;
  },
};

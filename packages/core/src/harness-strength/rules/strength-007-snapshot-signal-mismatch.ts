import type { ProjectContext, StrengthFinding, StrengthRule } from '../types';
import { CHECK_SIGNAL_MAP } from '../../health-signals';

/**
 * STRENGTH-007 — snapshot/signal mismatch (defense-in-depth backstop).
 *
 * Flags a health-snapshot check reported as passing while one of its
 * contradicting signals (per the canonical, core-owned `CHECK_SIGNAL_MAP`) is
 * present. The write-path reconciliation in `captureHealthSnapshot` is the
 * primary guarantee; this rule catches hand-edited or stale snapshots that
 * bypass it. Checks with no contradicting signal (e.g. `lint`) are ignored.
 */

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
      const contradicting = CHECK_SIGNAL_MAP[check as keyof typeof CHECK_SIGNAL_MAP];
      // Checks outside the contract (or with no signals, e.g. lint) are ignored.
      if (!contradicting || contradicting.length === 0) continue;
      const hit = contradicting.find((signal) => present.has(signal));
      if (result?.passed === true && hit) {
        findings.push({
          id: 'STRENGTH-007',
          gearPiece: 'snapshot-honesty',
          file: '.harness/health-snapshot.json',
          message: `Health snapshot reports the "${check}" check as passing while the contradicting signal "${hit}" is present — the snapshot is dishonest.`,
          remediation: `Reconcile the snapshot: either the "${check}" check did not actually pass, or the "${hit}" signal is stale. Regenerate the snapshot from a clean run.`,
        });
      }
    }
    return findings;
  },
};

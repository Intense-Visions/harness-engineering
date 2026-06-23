import type { ProjectContext, StrengthFinding, StrengthRule } from '../types';

/**
 * STRENGTH-002 — auto-baseline on regression.
 *
 * A pre-commit that, when a check REGRESSES, silently rewrites the baseline (e.g.
 * `harness check-arch --update-baseline` + `git add .harness/arch/baselines.json`)
 * instead of failing the commit, defeats the regression gate: every regression is
 * absorbed as the new normal.
 *
 * Heuristic (regex over raw shell text — false-positive mitigation):
 *   flag a `--update-baseline` (or baseline-json rewrite) invocation ONLY when it
 *   sits inside a failure branch — i.e. somewhere above it the script opens an
 *   `if ! ... then` block that has not yet been closed by `fi`. This requires the
 *   token to co-occur with a reachable failure branch, not just appear anywhere.
 */

const BASELINE_REWRITE =
  /--update-baseline|(?:check-arch|baselines?\.json).*(?:--update-baseline|>\s*\S*baselines?\.json)/;

export const strength002Autobaseline: StrengthRule = {
  id: 'STRENGTH-002',
  gearPiece: 'regression-baseline',
  defaultSeverity: 'error',
  appliesIn: () => true,
  evaluable: (ctx) => ctx.preCommit !== null,
  detect(ctx: ProjectContext): Omit<StrengthFinding, 'severity'>[] {
    if (ctx.preCommit === null) return [];
    const lines = ctx.preCommit.split('\n');
    // Track failure-branch depth: `if ! ... then` opens one; `fi` closes one.
    let failureDepth = 0;
    let inFailureBlock = false; // becomes true once any `if ! ... then` is open
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]!;
      if (/\bif\s+!/.test(l)) {
        // Opens a failure branch; the matching `then` may be same line or later.
        failureDepth++;
        inFailureBlock = true;
      }
      if (/\bfi\b/.test(l)) {
        failureDepth = Math.max(0, failureDepth - 1);
        if (failureDepth === 0) inFailureBlock = false;
      }
      if (inFailureBlock && failureDepth > 0 && BASELINE_REWRITE.test(l)) {
        return [
          {
            id: 'STRENGTH-002',
            gearPiece: 'regression-baseline',
            file: '.husky/pre-commit',
            line: i + 1,
            message:
              'pre-commit auto-rewrites the baseline inside a failure branch — regressions are silently absorbed instead of blocking the commit.',
            remediation:
              'Remove the auto `--update-baseline` from the failure path; let the hook fail and update baselines deliberately in a separate, reviewed step.',
          },
        ];
      }
    }
    return [];
  },
};

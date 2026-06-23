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
  /--update-baseline|(?:check-arch|baselines?\.json).*(?:--update-baseline|>\s*\S*baselines?\.json)/i;

/**
 * Scan pre-commit lines and return the 0-based index of the first baseline
 * rewrite that sits inside a failure branch, or -1 if none.
 *
 * Tracks ALL if/fi nesting with a boolean stack so failure-branch membership
 * stays correct under nesting. Each `if` pushes whether it opened a failure
 * branch (`if !` / negated condition); each `fi` pops the matching frame. A
 * line is "inside a failure branch" iff ANY enclosing `if` on the stack is one
 * — so a nested non-failure `if...fi` closing first cannot drop the outer
 * failure branch.
 */
function findRewriteInFailureBranch(lines: string[]): number {
  const ifStack: boolean[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    // `if` may appear with its `then` on the same line (e.g. `if b; then x; fi`),
    // and a one-liner can open and close on the same line.
    const ifCount = (l.match(/\bif\b/g) ?? []).length;
    const fiCount = (l.match(/\bfi\b/g) ?? []).length;
    const opensFailure = /\bif\s+!/.test(l);
    for (let k = 0; k < ifCount; k++) ifStack.push(opensFailure);
    // Evaluate membership AFTER opening this line's `if`s but BEFORE popping its
    // `fi`s: a rewrite on a one-liner failure branch
    // (`if ! a; then x --update-baseline; fi`) is still inside that branch.
    const inFailureBranch = ifStack.includes(true);
    for (let k = 0; k < fiCount; k++) ifStack.pop();
    if (inFailureBranch && BASELINE_REWRITE.test(l)) return i;
  }
  return -1;
}

export const strength002Autobaseline: StrengthRule = {
  id: 'STRENGTH-002',
  gearPiece: 'regression-baseline',
  defaultSeverity: 'error',
  appliesIn: () => true,
  evaluable: (ctx) => ctx.preCommit !== null,
  detect(ctx: ProjectContext): Omit<StrengthFinding, 'severity'>[] {
    if (ctx.preCommit === null) return [];
    const idx = findRewriteInFailureBranch(ctx.preCommit.split('\n'));
    if (idx < 0) return [];
    return [
      {
        id: 'STRENGTH-002',
        gearPiece: 'regression-baseline',
        file: '.husky/pre-commit',
        line: idx + 1,
        message:
          'pre-commit auto-rewrites the baseline inside a failure branch — regressions are silently absorbed instead of blocking the commit.',
        remediation:
          'Remove the auto `--update-baseline` from the failure path; let the hook fail and update baselines deliberately in a separate, reviewed step.',
      },
    ];
  },
};

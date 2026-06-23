import type { ProjectContext, StrengthFinding, StrengthRule } from '../types';

/**
 * STRENGTH-001 — non-blocking hooks.
 *
 * A hook that cannot fail the commit is theatre: it runs checks but always exits
 * 0, so a regression sails through. We flag a hook file when its text matches an
 * explicit "never blocks" marker, an "always exits 0" marker, OR contains a
 * guaranteed sole `exit 0` (a top-level `exit 0` with no other non-zero exit and
 * no conditional gate), which means the hook can never fail the commit.
 */

const NEVER_BLOCKS = /never\s+blocks/i;
const ALWAYS_EXIT_ZERO = /always\s+exits?\s+0/i;
const EXIT_ZERO_LINE = /^\s*exit\s+0\s*$/;
const NONZERO_EXIT = /\bexit\s+[1-9]\b/;
// Conditional / gating tokens that could make a downstream exit 0 meaningful.
const GATE = /\bif\b|\|\||&&|\bthen\b/;

export const strength001NonblockingHooks: StrengthRule = {
  id: 'STRENGTH-001',
  gearPiece: 'blocking-gate',
  defaultSeverity: 'error',
  appliesIn: () => true,
  evaluable: (ctx) => ctx.hookFiles.length > 0,
  detect(ctx: ProjectContext): Omit<StrengthFinding, 'severity'>[] {
    const findings: Omit<StrengthFinding, 'severity'>[] = [];
    for (const hook of ctx.hookFiles) {
      const lines = hook.text.split('\n');
      let line: number | undefined;

      const markerIdx = lines.findIndex((l) => NEVER_BLOCKS.test(l) || ALWAYS_EXIT_ZERO.test(l));
      if (markerIdx >= 0) {
        line = markerIdx + 1;
      } else {
        // Guaranteed sole exit 0: a bare `exit 0` line where the hook has no
        // non-zero exit and no conditional gate to make failure reachable.
        const exitIdx = lines.findIndex((l) => EXIT_ZERO_LINE.test(l));
        const hasGuard = NONZERO_EXIT.test(hook.text) || GATE.test(hook.text);
        if (exitIdx >= 0 && !hasGuard) {
          line = exitIdx + 1;
        }
      }

      if (line !== undefined) {
        findings.push({
          id: 'STRENGTH-001',
          gearPiece: 'blocking-gate',
          file: hook.path,
          line,
          message: `Hook "${hook.name}" cannot block the commit — it always succeeds, so a regression passes through.`,
          remediation:
            'Remove the unconditional `exit 0` / "never blocks" escape hatch so the hook fails (non-zero exit) when a check fails.',
        });
      }
    }
    return findings;
  },
};

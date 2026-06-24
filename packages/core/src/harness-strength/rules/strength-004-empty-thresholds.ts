import type { HarnessConfigSubset, ProjectContext, StrengthFinding, StrengthRule } from '../types';

/**
 * STRENGTH-004 — empty architecture.thresholds.
 *
 * Declaring `layers` but no `architecture.thresholds` means the architecture
 * check has nothing to enforce: drift is invisible. Both `thresholds: {}` and an
 * omitted `thresholds` key are "no thresholds configured".
 *
 * In toolkit mode this ALSO checks each shipped `harness.config.json.hbs` template
 * (best-effort JSON parse; Handlebars tokens can make a template unparseable —
 * those are skipped to avoid false positives).
 */

function thresholdsEmpty(cfg: HarnessConfigSubset | null | undefined): boolean {
  if (!cfg) return false;
  const hasLayers = (cfg.layers?.length ?? 0) > 0;
  if (!hasLayers) return false;
  const thresholds = cfg.architecture?.thresholds;
  return !thresholds || Object.keys(thresholds).length === 0;
}

export const strength004EmptyThresholds: StrengthRule = {
  id: 'STRENGTH-004',
  gearPiece: 'architecture-thresholds',
  defaultSeverity: 'error',
  appliesIn: () => true,
  evaluable: (ctx) =>
    ctx.config !== null || (ctx.mode === 'toolkit' && (ctx.templates?.length ?? 0) > 0),
  detect(ctx: ProjectContext): Omit<StrengthFinding, 'severity'>[] {
    const findings: Omit<StrengthFinding, 'severity'>[] = [];

    if (thresholdsEmpty(ctx.config)) {
      findings.push(makeFinding('harness.config.json'));
    }

    if (ctx.mode === 'toolkit') {
      for (const tpl of ctx.templates ?? []) {
        if (!tpl.path.endsWith('harness.config.json.hbs')) continue;
        let parsed: HarnessConfigSubset;
        try {
          parsed = JSON.parse(tpl.text) as HarnessConfigSubset;
        } catch {
          // Handlebars tokens break JSON — skip rather than false-flag.
          continue;
        }
        if (thresholdsEmpty(parsed)) findings.push(makeFinding(tpl.path));
      }
    }

    return findings;
  },
};

function makeFinding(file: string): Omit<StrengthFinding, 'severity'> {
  return {
    id: 'STRENGTH-004',
    gearPiece: 'architecture-thresholds',
    file,
    message:
      'Architecture layers are declared but no thresholds are set — the architecture check has nothing to enforce, so drift goes undetected.',
    remediation:
      'Add concrete `architecture.thresholds` (e.g. maxFanOut, maxDependencyDepth) so layer/coupling regressions actually fail the check.',
  };
}

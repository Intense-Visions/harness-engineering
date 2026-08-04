import { Ok, Err, type Result } from '../shared/result';
import { buildProjectContext, resolveMode, type ModeOptions } from './context';
import { ALL_RULES } from './rules/index';
import { rollupScore } from './scoring';
import type {
  AuditResult,
  ProjectContext,
  Severity,
  SkippedRule,
  StrengthFinding,
  StrengthRule,
  Tier,
} from './types';

export type AuditOptions = ModeOptions;

/**
 * Builds the project context once, runs every applicable + evaluable rule, applies
 * config severity overrides, scores the findings, and returns a Result. The
 * audit is total (never throws): context building tolerates missing files, and
 * rule execution is wrapped defensively so an unforeseen rule error yields Err
 * rather than crashing the caller.
 *
 * "Not evaluable" rules (required input absent) are excluded from BOTH
 * `summary.rulesRun` and `summary.rulesPassing` so absent input never masks a
 * weakness as a pass (success criterion #7). They are instead surfaced in
 * `summary.skipped` and, when they leave coverage partial, cap the tier at
 * `incomplete` so a partial audit never reads as a full `solid` pass (#1013).
 */
export class HarnessStrengthAuditor {
  audit(root: string, opts: AuditOptions = {}): Result<AuditResult, Error> {
    try {
      const mode = resolveMode(opts, root);
      const ctx = buildProjectContext(root, mode);

      // Partition the patterns that APPLY to this mode into evaluable (required
      // input present) and skipped (input absent → abstained). The applicable
      // count is the coverage denominator; skipped is reported, never silently
      // dropped (#1013).
      const applicable = ALL_RULES.filter((r) => r.appliesIn(mode));
      const evaluable: StrengthRule[] = [];
      const skipped: SkippedRule[] = [];
      for (const r of applicable) {
        if (!r.evaluable || r.evaluable(ctx)) {
          evaluable.push(r);
        } else {
          skipped.push({
            id: r.id,
            gearPiece: r.gearPiece,
            reason: 'not evaluable: a required input for this pattern is absent',
          });
        }
      }

      const findings: StrengthFinding[] = [];
      let rulesPassing = 0;
      for (const rule of evaluable) {
        const raw = rule.detect(ctx);
        if (raw.length === 0) {
          rulesPassing++;
          continue;
        }
        const severity = severityFor(rule, ctx);
        for (const f of raw) findings.push({ ...f, severity });
      }

      const { score, tier: scoredTier } = rollupScore(findings);
      // Withhold `solid` when coverage is partial: a clean score across only
      // some of the applicable patterns is `incomplete`, not `solid` (#1013).
      // Weaker tiers (`at-risk`/`theatre`) already signal detected problems and
      // are left as-is.
      const tier: Tier = scoredTier === 'solid' && skipped.length > 0 ? 'incomplete' : scoredTier;

      const summary = {
        errors: findings.filter((f) => f.severity === 'error').length,
        warnings: findings.filter((f) => f.severity === 'warning').length,
        info: findings.filter((f) => f.severity === 'info').length,
        rulesRun: evaluable.length,
        rulesPassing,
        rulesApplicable: applicable.length,
        skipped,
      };

      return Ok({ mode, score, tier, findings, summary });
    } catch (err) {
      return Err(err instanceof Error ? err : new Error(String(err)));
    }
  }
}

function severityFor(rule: StrengthRule, ctx: ProjectContext): Severity {
  const override = ctx.config?.audit?.harnessStrength?.severities?.[rule.id];
  return override ?? rule.defaultSeverity;
}

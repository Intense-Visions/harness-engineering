import { Ok, Err, type Result } from '../shared/result';
import { buildProjectContext, resolveMode, type ModeOptions } from './context';
import { ALL_RULES } from './rules/index';
import { rollupScore } from './scoring';
import type { AuditResult, ProjectContext, Severity, StrengthFinding, StrengthRule } from './types';

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
 * weakness as a pass (success criterion #7).
 */
export class HarnessStrengthAuditor {
  audit(root: string, opts: AuditOptions = {}): Result<AuditResult, Error> {
    try {
      const mode = resolveMode(opts, root);
      const ctx = buildProjectContext(root, mode);
      const evaluable = ALL_RULES.filter(
        (r) => r.appliesIn(mode) && (r.evaluable ? r.evaluable(ctx) : true)
      );

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

      const { score, tier } = rollupScore(findings);
      const summary = {
        errors: findings.filter((f) => f.severity === 'error').length,
        warnings: findings.filter((f) => f.severity === 'warning').length,
        info: findings.filter((f) => f.severity === 'info').length,
        rulesRun: evaluable.length,
        rulesPassing,
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

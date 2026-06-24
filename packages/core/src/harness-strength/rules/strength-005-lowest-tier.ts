import type { ProjectContext, StrengthFinding, StrengthRule } from '../types';

/**
 * STRENGTH-005 — lowest-tier default.
 *
 * Defaulting to the `basic` tier ships the weakest gate set. The source forks by
 * mode:
 *   - adopter: flag iff `config.template.level === 'basic'`.
 *   - toolkit: scan the init skill text for a default-`basic` recommendation.
 */

const INIT_SKILL_PATH = 'agents/skills/claude-code/initialize-harness-project/SKILL.md';

const DEFAULT_BASIC =
  /default(?:s| recommendation)?[^\n]*\bbasic\b|\bbasic\b[^\n]*\b(?:default|recommend)/i;

export const strength005LowestTier: StrengthRule = {
  id: 'STRENGTH-005',
  gearPiece: 'tier-default',
  defaultSeverity: 'warning',
  appliesIn: () => true,
  evaluable: (ctx) =>
    ctx.mode === 'adopter' ? ctx.config !== null : (ctx.initSkill ?? null) !== null,
  detect(ctx: ProjectContext): Omit<StrengthFinding, 'severity'>[] {
    if (ctx.mode === 'adopter') {
      if (ctx.config?.template?.level === 'basic') {
        return [
          {
            id: 'STRENGTH-005',
            gearPiece: 'tier-default',
            file: 'harness.config.json',
            message:
              'Project is pinned to the `basic` tier — the weakest gate set. Most projects warrant `standard` or higher.',
            remediation:
              'Raise `template.level` to `standard` (or higher) unless `basic` is a deliberate, documented choice.',
          },
        ];
      }
      return [];
    }

    // toolkit
    const text = ctx.initSkill ?? null;
    if (text === null) return [];
    const lines = text.split('\n');
    const idx = lines.findIndex((l) => DEFAULT_BASIC.test(l));
    if (idx < 0) return [];
    return [
      {
        id: 'STRENGTH-005',
        gearPiece: 'tier-default',
        file: INIT_SKILL_PATH,
        line: idx + 1,
        message:
          'The init skill recommends the `basic` tier by default — new projects ship with the weakest gate set.',
        remediation:
          'Change the default recommendation to `standard` so new projects start with a meaningful gate set.',
      },
    ];
  },
};

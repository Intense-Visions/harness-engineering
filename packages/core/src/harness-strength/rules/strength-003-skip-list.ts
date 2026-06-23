import type { ProjectContext, StrengthFinding, StrengthRule } from '../types';

/**
 * STRENGTH-003 — oversized --skip list.
 *
 * Skipping a couple of slow checks in the pre-commit hook (deferred to CI) is
 * normal discipline. Skipping MORE than 2 categories without an inline `#`
 * justification means the local gate is mostly hollow.
 *
 * Heuristic: extract the `--skip <a,b,c>` value, count comma-separated categories,
 * and flag when count > 2 AND the matched line has no inline `#` comment after the
 * skip value (the comment is treated as the author's justification). Absent
 * `--skip` is a pass (discipline holds), not "not evaluable".
 */

const SKIP_RE = /--skip[= ]+([\w,-]+)/;

export const strength003SkipList: StrengthRule = {
  id: 'STRENGTH-003',
  gearPiece: 'skip-discipline',
  defaultSeverity: 'warning',
  appliesIn: () => true,
  evaluable: (ctx) => ctx.preCommit !== null,
  detect(ctx: ProjectContext): Omit<StrengthFinding, 'severity'>[] {
    if (ctx.preCommit === null) return [];
    const lines = ctx.preCommit.split('\n');
    const findings: Omit<StrengthFinding, 'severity'>[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const m = SKIP_RE.exec(line);
      if (!m) continue;
      const categories = m[1]!.split(',').filter(Boolean);
      if (categories.length <= 2) continue;
      // Inline justification: a `#` SHELL COMMENT appearing after the --skip
      // value. The `#` must sit at a comment boundary (start-of-segment or
      // preceded by whitespace) so a `#` inside a token (e.g. `--tag "#release"`)
      // does not count as justification.
      const afterSkip = line.slice(m.index + m[0].length);
      if (/(^|\s)#/.test(afterSkip)) continue;
      findings.push({
        id: 'STRENGTH-003',
        gearPiece: 'skip-discipline',
        file: '.husky/pre-commit',
        line: i + 1,
        message: `pre-commit skips ${categories.length} check categories (${categories.join(', ')}) with no inline justification — the local gate barely guards anything.`,
        remediation:
          'Reduce the --skip list to at most 2 categories, or add an inline `# justified: ...` comment explaining why each is deferred (e.g. runs in CI).',
      });
    }
    return findings;
  },
};

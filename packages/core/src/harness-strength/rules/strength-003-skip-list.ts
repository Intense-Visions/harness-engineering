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
 *
 * Two forms of the skip argument are supported (#965), so the drift-free
 * single-source `SKIP="…"` + `--skip "$SKIP"` hook pattern (roadmap #529) stays
 * under review-time coverage:
 *   1. Literal:  `--skip a,b,c`  (also `--skip "a,b,c"` / `--skip 'a,b,c'`)
 *   2. Variable: `--skip "$SKIP"` / `--skip $SKIP` / `--skip "${SKIP}"` — resolved
 *      by finding the matching `SKIP="a,b,c"` (or `SKIP='a,b,c'` / `SKIP=a,b,c`)
 *      assignment in the same file and auditing that value.
 * A `--skip "$VAR"` with no matching assignment in the file falls back gracefully
 * (treated as unresolvable → no finding, no crash).
 */

// Captures the skip ARGUMENT token: a double-quoted run, a single-quoted run, or a
// bare (unquoted) run of non-whitespace. The token may be a literal category list
// or a shell-variable reference — resolveSkipCategories() disambiguates.
const SKIP_RE = /--skip[= ]+("[^"]*"|'[^']*'|\S+)/;

// A bare or braced variable reference: $SKIP or ${SKIP}.
const VAR_REF_RE = /^\$\{?(\w+)\}?$/;

/**
 * Resolve the raw `--skip` argument token to a category list.
 * - Literal token (optionally quoted) → its comma-split categories.
 * - Variable reference ($VAR / ${VAR}, optionally quoted) → the value of the
 *   matching `VAR=…` assignment in the same file, or `null` if none is found.
 */
function resolveSkipCategories(rawToken: string, fileContent: string): string[] | null {
  let tok = rawToken;
  if ((tok.startsWith('"') && tok.endsWith('"')) || (tok.startsWith("'") && tok.endsWith("'"))) {
    tok = tok.slice(1, -1);
  }
  const varRef = VAR_REF_RE.exec(tok);
  if (varRef) {
    const varName = varRef[1]!;
    // Find `VAR="a,b,c"`, `VAR='a,b,c'`, or `VAR=a,b,c` at the start of a line.
    const assignRe = new RegExp(`^\\s*${varName}=(?:"([^"]*)"|'([^']*)'|([\\w,-]+))`, 'm');
    const am = assignRe.exec(fileContent);
    if (!am) return null;
    const value = am[1] ?? am[2] ?? am[3] ?? '';
    return value.split(',').filter(Boolean);
  }
  return tok.split(',').filter(Boolean);
}

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
      const categories = resolveSkipCategories(m[1]!, ctx.preCommit);
      // Unresolvable variable (no matching assignment in the file) → skip gracefully.
      if (categories === null) continue;
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

/**
 * A "hardcoded secret" finding is only genuine when the matched value is a
 * literal. Both the deterministic secret rules (SEC-SEC-*) and the heuristic
 * review-tier secret detector match assignment shapes like `TOKEN="..."`, and
 * both mis-fire when the right-hand side is a *reference* rather than a literal:
 *
 *  - a shell/env variable: `$NAME`, `${NAME}`, `${NAME:-default}`
 *  - a CI expression: `${{ secrets.X }}`, `${{ env.X }}`, `${{ vars.X }}`, or
 *    any `${{ ... }}`
 *
 * These reference forms appear on essentially every CI workflow line that wires
 * a secret into an env var (`GH_TOKEN="$AUTOAPPROVE_PAT"`,
 * `TOKEN: "${{ secrets.FOO }}"`). Nothing is embedded in source there — the real
 * secret is resolved at runtime from the environment or the CI secret store — so
 * reporting it as a leaked literal is a false positive that blocks unrelated PRs.
 * This module decides whether an extracted value is reference-only.
 */

// CI expression: `${{ ... }}` (secrets / env / vars / anything). The inner
// class excludes braces so the whole `${{ … }}` is consumed as one token rather
// than leaving a stray `}` behind.
const CI_EXPRESSION = /\$\{\{[^{}]*\}\}/g;
// Shell/env brace form: `${NAME}`, `${NAME:-default}`, `${NAME#glob}`, …
const SHELL_BRACE_VAR = /\$\{[^{}]*\}/g;
// Shell/env bare form: `$NAME`.
const SHELL_BARE_VAR = /\$[A-Za-z_][A-Za-z0-9_]*/g;

/**
 * True when `value` (the extracted right-hand side of a secret-shaped
 * assignment) carries no literal secret material — i.e. it is composed solely of
 * variable/expression references plus surrounding punctuation and whitespace.
 *
 * Order matters: `${{ … }}` is stripped before `${ … }` so the CI-expression
 * form is consumed whole rather than leaving a stray `{ … }`. After every
 * reference form is removed, a genuine literal leaves alphanumeric residue
 * (`sk-ant-...` → `skant...`), whereas a pure reference leaves none. A partial
 * literal such as `prefix-${VAR}` deliberately keeps its `prefix` residue and is
 * therefore NOT treated as reference-only — the conservative choice keeps real
 * secret detection intact.
 */
export function isReferenceOnlySecretValue(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === '') return false;
  const withoutRefs = trimmed
    .replace(CI_EXPRESSION, '')
    .replace(SHELL_BRACE_VAR, '')
    .replace(SHELL_BARE_VAR, '');
  return !/[A-Za-z0-9]/.test(withoutRefs);
}

/**
 * Extract the quoted value from a matched secret assignment, e.g.
 * `TOKEN="$AUTOAPPROVE_PAT"` → `$AUTOAPPROVE_PAT`. Returns `null` when the match
 * carries no quoted value, so callers treat unquoted/bare-token matches (which
 * the reference forms never produce) as literals rather than suppressing them.
 */
export function extractQuotedSecretValue(matchText: string): string | null {
  const m = /['"]([^'"]*)['"]/.exec(matchText);
  return m ? (m[1] ?? '') : null;
}

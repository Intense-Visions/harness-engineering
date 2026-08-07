/**
 * A "hardcoded secret" finding is only genuine when the matched value is a
 * literal. Both the deterministic secret rules (SEC-SEC-*) and the heuristic
 * review-tier secret detector match assignment shapes like `TOKEN="..."`, and
 * both mis-fire when the right-hand side is a *reference* rather than a literal:
 *
 *  - a shell/env variable: `$NAME`, `${NAME}`, `${NAME:-default}`
 *  - a CI expression: `${{ secrets.X }}`, `${{ env.X }}`, `${{ vars.X }}`, or
 *    any `${{ ... }}`
 *  - a command substitution: `$( ... )` or a backtick `` ` ... ` `` — the value
 *    is the command's runtime output, so no secret literal is assigned in source
 *    (`GH_TOKEN="$(gh auth token)"`)
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
// Command substitution, single level: `$( ... )`. The value is produced by
// running the command at runtime — nothing is embedded in source. The inner
// class excludes parens so a single level is consumed whole; a nested
// substitution (`$(a $(b))`) is deliberately NOT fully consumed, leaving
// residue so the conservative branch keeps it flagged.
const COMMAND_SUBSTITUTION = /\$\([^()]*\)/g;
// Backtick command substitution: `` ` ... ` ``. Same runtime-output rationale.
const BACKTICK_SUBSTITUTION = /`[^`]*`/g;

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
 *
 * Command substitution is stripped whole, so `"$(gh auth token)"` is
 * reference-only. Two conservative boundaries follow from that, both favoring a
 * false positive over a false negative:
 *  - a mixed value keeps its literal residue and stays flagged
 *    (`"$(id)-sk-ant-live"` → `-skantlive`);
 *  - a literal placed *inside* a command substitution (`"$(echo sk-ant-x)"`) is
 *    treated as reference-only. This is accepted: a command substitution assigns
 *    the command's runtime output, not a static literal, and a directly written
 *    literal is still caught — the entropy/gitleaks tiers backstop the
 *    adversarial `echo`-a-secret shape.
 */
export function isReferenceOnlySecretValue(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === '') return false;
  const withoutRefs = trimmed
    .replace(CI_EXPRESSION, '')
    .replace(COMMAND_SUBSTITUTION, '')
    .replace(BACKTICK_SUBSTITUTION, '')
    .replace(SHELL_BRACE_VAR, '')
    .replace(SHELL_BARE_VAR, '');
  return !/[A-Za-z0-9]/.test(withoutRefs);
}

/**
 * Body of a quoted string: characters up to the *matching* close quote.
 *
 * Two properties matter, and getting either wrong truncates the value:
 *
 *  - **Quote-type aware.** `(?!\1)` lets the opposite quote appear inside, so
 *    `"$(sed -n 's/^TOKEN=//p' .env)"` yields the whole command substitution
 *    rather than stopping at the inner `'`. A class like `[^'"]` stops at the
 *    first quote of *either* type.
 *  - **Escape aware.** `\\.` consumes `\"` as one unit, so
 *    `"${TOKEN#\"}"` yields the whole brace expansion rather than stopping at
 *    the escaped quote.
 *
 * Truncation is what makes this a correctness bug rather than cosmetics: a
 * half-captured `$(sed -n ` or `${TOKEN#\` is no longer recognizable as a
 * reference, so `isReferenceOnlySecretValue` sees literal residue and the line
 * is reported as a hardcoded secret (capwell#1372).
 */
const QUOTED_BODY = /(['"])((?:\\.|(?!\1)[^\\])*)\1/;

/**
 * Extract the quoted value from a matched secret assignment, e.g.
 * `TOKEN="$AUTOAPPROVE_PAT"` → `$AUTOAPPROVE_PAT`. Returns `null` when the match
 * carries no quoted value, so callers treat unquoted/bare-token matches (which
 * the reference forms never produce) as literals rather than suppressing them.
 */
export function extractQuotedSecretValue(matchText: string): string | null {
  const m = QUOTED_BODY.exec(matchText);
  return m ? (m[2] ?? '') : null;
}

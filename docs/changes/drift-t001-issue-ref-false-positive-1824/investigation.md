# Debug Session: DRIFT-T001 flags issue references as hex colours (#1824)

Status: resolved
Started: 2026-09-05
Resolved: 2026-09-05
Error: `harness check-design` emits DRIFT-T001 `Hardcoded color "#1824" is not in the design
token palette` for GitHub issue references. Reporter measured 143 of 413 findings (35%) on
first adoption of `check-design` against a private monorepo (@harness-engineering/cli@11.3.0).

## Investigation Log

### Phase 1 — INVESTIGATE

1.  `harness cleanup -t all` — no entropy findings implicating `src/drift/rules/`.
2.  Read the complete symptom. Root pattern at `packages/cli/src/drift/rules/token-bypass-rule.ts:29`
    (base SHA 5cd661d74):

        const HEX_PATTERN = /#[0-9a-fA-F]{3,8}\b/g;

    `0-9` are all valid hex digits, so every `#NNN`..`#NNNNNNNN` issue reference matches.
    `#1824` is 4 chars, all in `[0-9a-fA-F]`, and 4 is inside `{3,8}`.

3.  Reproduced consistently (3/3 runs) by calling `runTokenBypassRule` directly at the base SHA:

    | source                                       | DRIFT-T001 emitted         |
    | -------------------------------------------- | -------------------------- |
    | `export const n = 'see #1824 for triage';`   | `#1824`                    |
    | `Refs #1824 and #493 and #abc123` (code ctx) | `#1824`, `#493`, `#abc123` |
    | `const a = '#12345'; const b = '#1234567';`  | `#12345`, `#1234567`       |

4.  Checked recent changes. The prior partial fix is 7c6a4e741
    `fix(design): drift scanner ignores hex-shaped strings in comments/string-literals (#750)`,
    shipped in cli 10.0.0 — i.e. it is ALREADY present in the reporter's 11.3.0 and at HEAD.
    It rejects COMMENT context outright and, inside STRING context, rejects only the
    parenthesized idiom `(#NNN)` (`isHexColorContext`, `source[offset - 1] !== '('`).
    That is why 143 findings survive: an issue ref in a non-parenthesized string literal
    (`'see #1824 for triage'`, `describe('regression #1824')`) or in bare code context
    (JSX text, CSS) is still flagged.

5.  Scan scope is `['.ts', '.tsx', '.js', '.jsx', '.css', '.scss']`
    (`packages/cli/src/drift/index.ts:58`) — so the FP class is issue refs living in TS/JS
    string literals and JSX/CSS text, not markdown.

### Phase 2 — ANALYZE (working example in the same file)

`detectHexBypass` is the ONLY detector in `token-bypass-rule.ts` with no declaration anchor.
Its two siblings both anchor on a value-bearing carrier and consequently do not suffer this
false-positive class:

- `FONT_FAMILY_PATTERN` requires `(?:fontFamily|font-family)\s*[:=]\s*` before the value.
- `PX_VALUE_PATTERN` requires `margin|padding|gap|top|right|bottom|left` + `[:=]` before the value.

The difference IS the bug: T001 matches a bare `#`-token anywhere, so any token that happens to
be hex-shaped (an issue reference) is admitted. A secondary correctness gap: `{3,8}` admits
lengths 5 and 7, which are not legal CSS hex colours (legal lengths are 3, 4, 6, 8).

## Hypotheses

H1 (falsifiable): DRIFT-T001 fires on issue references because `detectHexBypass` requires no
colour-bearing syntactic context and applies no shape test beyond `[0-9a-fA-F]{3,8}`, unlike
its sibling detectors. Prediction: requiring a colour value position AND rejecting an
all-decimal match that lacks a colour carrier removes `#1824` / `#493` / `#abc123` in prose
while every existing T001 true-positive test still passes.

Test: the reproduction table above, run against the amended rule.
Result: see Resolution.

## Assumptions (surfaced, not buried)

- A1. Fork F2 ("how to kill the issue-reference false positive?") was answered by the human at
  the fleet CONFIRM gate as **(b) AND (c) together** — reject all-decimal matches AND require a
  colour-bearing syntactic context. Both, not either. This session implements both.
- A2. `#666` / `#333` style all-decimal greys are genuine colours and must survive. They are
  preserved via the colour-carrier override on the all-decimal rule; the existing regression
  test `STILL flags an all-numeric hex color literal in real code (#666 true positive preserved)`
  is treated as a hard invariant, not as negotiable.
- A3. Deferrable: `design.tokenPath` being accepted-and-ignored (the "adjacent, much smaller"
  half of the report) is a separate defect in the tokens resolver, not in this rule. Out of scope
  for this session; it is not the 35%-noise cause.

## Resolution

Root cause: `detectHexBypass` required no colour-bearing syntactic context, unlike its two
siblings in the same file (`FONT_FAMILY_PATTERN` for DRIFT-T002 and `PX_VALUE_PATTERN` for
DRIFT-T003), which both anchor on a declaring property before the value. Because `0-9` are
valid hex digits, every 3-8 character issue reference matched `HEX_PATTERN`. The earlier
partial fix 7c6a4e741 (#750) rejected COMMENT context and the parenthesized `(#NNN)` idiom
only, so a reference in ordinary string prose, JSX text or CSS still fired.

Fix (`packages/cli/src/drift/rules/token-bypass-rule.ts`), implementing fork F2 answer (b)+(c):

- (c) `hexValuePosition` classifies each match as POS_NONE / POS_VALUE / POS_COLOR. A match
  must sit in a value position — after a `name:` / `name=` declaration separator, as the
  leading content of a string literal, or inside a colour function's argument list — with
  only CSS value tokens between the separator and the `#`. This generalizes and replaces the
  narrower `(#NNN)`-only rejection from #750.
- (b) `isAllDecimal` rejects an all-decimal match (`#1824`, `#493`) unless its value position
  carries a colour: a colour-bearing property or variable name, or a colour function. The
  carrier is what separates `const ISSUE = '#1824'` from `background: '#666'`.
- `HEX_PATTERN` narrowed to the CSS-valid lengths 3, 4, 6, 8. `{3,8}` admitted 5 and 7,
  which can never be a colour (the report's suggestion 2).

Hypothesis H1 CONFIRMED. End-to-end over a fixture carrying 8 issue references and 7 genuine
colours: 7 DRIFT-T001 findings, every one a real colour, zero issue references. Preserved:
`color: '#e63535'`, `background: '#666'`, `1px solid #0066cc`, `.badge { color: #1824 }`,
gradient stops `#fff` / `#000`, `$grey-700: #666`. Suppressed: `(#529)` and `#493:` in
comments, `'see #1824 ... #abc123'` prose, `Error('... see #493')`, `<p>...#1824 and #493</p>`,
the `#1824 { }` CSS id selector, and `see #604` in a CSS comment.

Regression test: `packages/cli/tests/drift/rules/token-bypass.test.ts`, suite
`DRIFT-T001 — issue-reference false positives (#1824)`. 5 failed / 24 passed before the fix;
29 passed after. Revert-and-fail confirmed by stashing only the rule file.

Learnings: when one detector in a family is noisy and its siblings are not, the difference
between them is the diagnosis. T002 and T003 were quiet because they demand a declaring
property; T001 was noisy because it demanded nothing. Also: a shape-only test can never
separate `#493` from `#666` — only the surrounding carrier can, which is why the shape rule
(b) and the context rule (c) had to ship together rather than either alone.

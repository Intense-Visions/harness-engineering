---
'@harness-engineering/cli': patch
---

fix(design): drift scanner ignores hex-shaped strings in comments and issue-ref string literals (#750)

The DRIFT-T\* token-bypass scanner (`detect-design-drift`, surfaced by
`harness check-design` / `align-design-system`) matched hex- and px-shaped
strings anywhere in the raw source, including comment text. This produced two
false-positive classes: GitHub issue/PR references like `(#529)` in a JSDoc
were reported as `DRIFT-T001` "color #529", and hex values merely described
in comment prose (e.g. ``e.g. `#e63535` ``) were flagged as hardcoded colors —
with the same matcher also flagging spacing prose as `DRIFT-T003`.

The scanner now classifies each source offset as code, string, or comment with
a lightweight lexer (`//` line comments, `/* */` block comments across lines,
and quoted strings with escapes) and skips comment-context matches. Hex matches
inside string literals are additionally rejected only when they match the
parenthesized issue-reference idiom `(#NNN)` (e.g. test titles like
`describe('… (#332 Tier-3)')`). Genuine in-code color literals — including
all-numeric ones like `#666`/`#333` and CSS-shorthand values like
`"1px solid #0066cc"` — still flag, so no true positives are traded away. This
is deliberately _not_ the lossy "skip bare 3–4 digit numerics" heuristic, which
would suppress real 3-digit hex literals.

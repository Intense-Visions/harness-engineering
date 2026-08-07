---
'@harness-engineering/core': patch
---

Fix STRENGTH-005 (`tier-default`) false positive in toolkit mode.

The toolkit-mode detector matched any line where `basic` merely co-occurred with
`default`/`recommend`, so after the init skill began recommending
`load-bearing-minimum` as the default (with `basic` offered as an explicit
opt-down), the audit falsely reported that the init skill "recommends the `basic`
tier by default" — the opposite of the truth.

The regex now fires only when `basic` sits adjacent (within ~40 non-newline
characters, in either direction) to a `default`/`recommend` token, so a line that
names `basic` as an opt-down far from the recommendation no longer trips the rule
while a genuine "defaults to basic" still does. The init skill's wording is also
adjusted so `basic` and `default`/`recommend` no longer share a line, giving the
fix defense in depth. A regression test pins both the real-world opt-down phrasing
(must not fire) and a literal default-to-basic line (must fire).

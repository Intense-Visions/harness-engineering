---
'@harness-engineering/cli': patch
---

craft(code): lift the `--since` semantic-regression narrative out of `comprehend --check`

`runCheckMode` opened as a tidy freshness reporter and then dropped an altitude into
the `--since` regression story — base/head ref reads, unreadable-ref handling,
`pr`-vs-`main` branching, three logger calls — all inlined in the same body.

That narrative now lives in `reportSemanticRegression(since, context, deps, log)`,
which returns `{ regressed, refUnreadable }`; `runCheckMode` feeds it and consumes the
verdict, so the outer function tells one story. Behaviour-preserving: the moved logger
strings are byte-identical, `runCheckMode`'s signature is unchanged, and no CLI flag or
output changed.

Because the git seam and the logger are both injected, the gate is now unit-testable —
including the "refuse to report a pass on an unreadable ref" invariant, which had no
test anywhere before.

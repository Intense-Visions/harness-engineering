---
'@harness-engineering/core': patch
---

fix(roadmap): do not auto-reopen human-closed issues on a planned status (#1327)

The roadmap→issue sync push (`syncToExternal`) unconditionally set an issue's
state to `open` whenever a row's status mapped to an open state, so a `planned`/
`in-progress` row whose issue a human (or the auto-done workflow) had already
closed was reopened on the next ~5-minute sync — destroying the deliberate
close. The push now consults the prefetched ticket state it already holds and
suppresses the state patch for that write alone when it would reopen an
already-closed issue, reporting the suppressed transition in
`skippedStateChanges`. Labels still converge, closing an open issue for a `done`
row is unchanged, and the pull phase converges the lagging row to `done`.

---
'@harness-engineering/core': patch
'@harness-engineering/cli': patch
---

fix(roadmap): make merge-triggered auto-done resilient to malformed closing keywords

Roadmap rows stayed `planned` after their PR merged when the PR body's closing
keyword was malformed (e.g. `Closes roadmap #569` — the intervening word breaks
GitHub's parser), leaving `closingIssuesReferences` empty so auto-done had nothing
to reconcile.

- **Backstop:** `roadmap-auto-done.yml` now, when the formal closing references are
  empty, parses issue references from the PR body+title, keeps only those closed as
  completed, and feeds the existing `roadmap reconcile --from-refs` (rows flip only
  on a matching `External-ID`; unmatched refs are ignored).
- **New pure parser** `parseReferencedIssues` (`@harness-engineering/core`) and a
  testable `harness roadmap referenced-issues` CLI subcommand back the fallback.
- **Prevention:** autopilot's PR-creation guidance now emits a bare `Closes #<N>`
  (keyword immediately before the ref) derived from the roadmap row's External-ID.

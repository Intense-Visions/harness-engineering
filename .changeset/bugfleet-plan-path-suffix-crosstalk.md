---
'@harness-engineering/core': patch
---

Anchor autopilot plan-path matching to a path separator. The unanchored `endsWith` suffix test linked a phase for `docs/changes/multi-auth/plan.md` to a roadmap row whose plan is `auth/plan.md`, carrying an unrelated feature's completion into that row's inferred status.

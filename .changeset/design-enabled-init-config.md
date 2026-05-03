---
'@harness-engineering/cli': minor
---

feat(config): add `design.enabled` tri-state config field for design-system opt-in/decline.

- New `design.enabled?: boolean` field on `DesignConfigSchema`. Tri-state runtime semantics:
  - `true` — design system enabled; `harness-design-system` fires on `on_new_feature`.
  - `false` — explicitly declined; skill skips with a permanent-decline log line.
  - absent — undecided; skill surfaces a gentle prompt.
- `.superRefine()` ensures `design.platforms` is a non-empty `('web' | 'mobile')[]` whenever `design.enabled === true`.
- `initialize-harness-project` Phase 3 step 5b now records the choice via `emit_interaction` (yes / no / not sure) for non-test-suite projects; Phase 4 step 4 promotes the roadmap nudge to an active question and auto-adds a `Set up design system` planned roadmap entry when both answers are yes.
- 6-variant fixture matrix and a yes/yes end-to-end test cover all answer combinations.

Spec: `docs/changes/init-design-roadmap-config/proposal.md`. Verification report: `docs/changes/init-design-roadmap-config/verification/2026-05-03-phase5-report.md`.

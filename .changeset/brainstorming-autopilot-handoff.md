---
'@harness-engineering/cli': patch
---

`harness-brainstorming` Phase 4 now offers both build paths at the handoff instead of only planning. After a spec is approved, it asks the human — in plain text — to choose between **autopilot** (recommended: autonomously chains plan → execute → verify → review) and **planning** (interactive plan only), then sets `suggestedNext` and dispatches accordingly. Autopilot is the recommended default when the spec's `## Implementation Order` lays out clear phases.

The choice is asked in plain text rather than via `emit_interaction`, since a `transition` records the handoff but does not surface a question. `harness-autopilot` is added to the skill's `depends_on`.

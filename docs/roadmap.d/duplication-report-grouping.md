---
slug: 'duplication-report-grouping'
milestone: 'v5.0 — Enforcement Hardening'
order: 221
---

### Group the structurally-concentrated clone classes on the printed page

- **Status:** planned
- **Spec:** docs/changes/duplication-detection/proposal.md
- **Summary:** Deferred from `duplication-detection` with its reason verbatim: "Named here with its reason rather than deferred a third time to 'Phase 4/5': Phase 4 measurably does not aggravate the 38/96 platform-mirror concentration (0 of 38 mirror classes are labelled) and measurably improves it for free (mirror rows on the printed top ten fall 4 -> 2). Grouping itself is a distinct presentation feature needing a grouping key (mirrors-of-each-other? same owning skill?), a presentation form, and a decision on whether a group counts as ONE class against `maxClasses` — which would move criterion 13's semantics a SECOND time in one release. Phase 5 is `code-craft` prompt wiring, a different subsystem, so it is not Phase 5's either." The concentration is real and measured: 38 of this repository's 96 reported classes are platform mirrors (the same skill file copied across `claude-code` / `cursor` / `codex` / `gemini-cli`), holding 152 of 382 members, and they are unactionable individually because the copies are generated.
- **Blockers:** Depends on `duplication-detection`
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** —

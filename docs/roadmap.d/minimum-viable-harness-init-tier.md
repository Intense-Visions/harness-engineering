---
slug: "minimum-viable-harness-init-tier"
milestone: "Full-lifecycle reach"
order: 7
---

### Minimum-Viable-Harness init tier

- **Status:** planned
- **Spec:** docs/knowledge/decisions/0101-minimum-viable-harness-init-tier.md
- **Summary:** Formalize a `minimal` tier as the documented floor of the existing init adoption ladder ("basic → intermediate → load-bearing-minimum → advanced"), mapped one-to-one to the field's 5-item Minimum Viable Harness (OpenAI; Augment Code). Motivation: `harness-initialize-project` front-loads a 10–20 min STRATEGY.md interview + framework confirmation (~10 options) + design-system before any guardrail lands, so time-to-first-guardrail is high — friction precisely where the field has standardized on a fast, minimal on-ramp, and it matters more for us because our skills are adopter-portable. **Scope if pursued:** (1) Define the `minimal` tier contract in the init adoption-level model = exactly these 5 artifacts and nothing else: a short generated `AGENTS.md` via the existing `generateAgentsMap()`; one runnable local check (a single `harness verify`-style command wired in); one fail-closed `check-arch` rule with baseline seeded; one pre-commit (or pre-push) verification hook running that check; one permission boundary (`block-no-verify` or equivalent single guarded action). (2) Wire `harness init --tier minimal` to scaffold exactly those 5 and print an explicit, ordered upgrade path ("run `/harness:strategy` … then `harness init --tier intermediate` to add …") — STRATEGY/framework/design-system/telemetry/Tier-0 MCP integrations are **deferred, not skipped**. (3) Add a "start minimal" fast-path branch in `harness-initialize-project` Phase 1 (`agents/skills/claude-code/harness-initialize-project/SKILL.md`). (4) Verify re-running init at a higher tier is additive over a `minimal` install (no clobber). **Acceptance:** `--tier minimal` produces those 5 artifacts and only those; the printed upgrade path lands you at `intermediate` additively; existing full-flow init behavior unchanged (minimal is opt-in via `--tier`). **Dependencies:** none. **Source analysis:** docs/architecture/harness-ecosystem-pattern-adoption/analysis.md.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1470
</content>

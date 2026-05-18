---
'@harness-engineering/types': minor
'@harness-engineering/core': minor
'@harness-engineering/orchestrator': minor
'@harness-engineering/cli': minor
'@harness-engineering/dashboard': minor
---

Hermes Phase 4: Skill proposal / refinement loop with provenance + soundness gate

Agent-emitted skill proposals routed through a review queue gated by a
mechanical soundness check before promotion to the catalog. Closes the
K1 killer-adoption row from the Hermes adoption meta-spec.

**New surfaces:**

- MCP tool `emit_skill_proposal` (tier `standard`) — writes
  `.harness/proposals/<id>.json` and emits `proposal.created`. Emit is
  non-blocking; the soundness gate fires on approve, not on emit.
- CLI `harness proposals list|show|approve|reject` for queue management
  plus one-shot `harness backfill-skill-provenance` migration that
  stamps `provenance: user-authored` on every pre-Phase-4 catalog skill.
- Dashboard `/s/proposals` page with inline content, gate findings,
  approve / reject / edit / run-gate actions; reviewer-UX budget < 30s
  per proposal.
- Seven gateway routes under `/api/v1/proposals/*` (list / get /
  run-gate / approve / reject / edit) — reads use `read-status`,
  mutations require the new `manage-proposals` scope (8th entry in
  `SCOPE_VOCABULARY` and `TokenScopeSchema`).
- Three lifecycle events (`proposal.created` / `approved` / `rejected`)
  fan out via the Phase 0 webhook bus and Phase 3 notification sinks
  with envelope derivers.
- Maintenance task `proposal-provenance-backfill` (housekeeping #4,
  Feb 31 cron so the loop never fires automatically).

**Strict invariants:** `kind` ↔ content shape (new-skill ⇒
skillYaml+skillMd; refinement ⇒ targetSkill+diff); gate freshness
< 24h before promotion; refinement edits must diverge from git HEAD
before approval stamps provenance; provenance enum is closed
(`community | agent-proposed | user-authored`, expansion requires ADR
amendment).

**Skills-mode soundness review degradation:** v1 ships mechanical
structural checks (kebab-case name, parseable skill.yaml, SKILL.md
bounds, unified-diff well-formedness). The full
`harness:soundness-review --mode skill` vocabulary is a follow-up spec;
both implementations share the same finding shape so the swap is
purely additive.

**Test coverage:** 75 new tests across five packages (types schema 15,
core store + usage 9, MCP tool 8, CLI subcommand 6 + backfill 6,
orchestrator gate 6 + promote 7 + events 4 + routes 10, envelope
derivers 4 new rows). Existing scopes test passes with the new
vocabulary entry.

ADRs: 0016 (workflow), 0017 (token scope). Knowledge nodes:
`skill-proposals.md`, `skill-provenance.md`. Spec + plan at
`docs/changes/hermes-phase-4-skill-proposals/`.

**Incidental fix:** Replaces a fixed 150ms wait in
`packages/orchestrator/src/server/webhooks-integration.test.ts` with a
poll loop. The fixed wait flaked under coverage instrumentation and
blocked the Phase 4 pre-push hook.

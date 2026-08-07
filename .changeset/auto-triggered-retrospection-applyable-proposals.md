---
'@harness-engineering/types': patch
'@harness-engineering/orchestrator': patch
'@harness-engineering/cli': patch
---

Auto-triggered retrospection with applyable proposals.

Archiving a session — the session terminus — now optionally fires a
retrospection over the archived session corpus and emits _applyable_ skill
proposals into `.harness/proposals/`, rather than requiring a manual retro run.

The trigger reuses the existing session-archive lifecycle: `buildArchiveHooks()`
gains a third `onArchived` step (alongside summary and search-index) that runs a
new `retrospectArchivedSession()` in `@harness-engineering/orchestrator`. It is
opt-in and safe — it fires only when a `sessions.retrospection` config block is
present (`enabled !== false`) and an analysis provider is available, and every
step remains individually non-fatal. The `manage_state` `archive_session` MCP
action activates it live when `HARNESS_SESSION_RETROSPECTION` is set and a
provider resolves; otherwise behaviour is unchanged.

Emitted proposals are ordinary `SkillProposal` records — the same shape produced
by `emit_skill_proposal` — so they carry the target (`targetSkill` for
refinements), the change (`content.diff`, or `content.skillYaml` + `skillMd` for
new skills), and the rationale (`justification`), and they surface, gate, and
promote through the unchanged review pipeline. New in
`@harness-engineering/types`: `RetrospectionProposalDraftSchema` /
`RetrospectionProposalsResponseSchema` (a projection of the emit input, no
parallel proposal type) and a `RetrospectionConfig` on `SessionsConfig`.

Emission only — nothing is auto-applied. Approval and promotion stay a separate,
human-gated step.

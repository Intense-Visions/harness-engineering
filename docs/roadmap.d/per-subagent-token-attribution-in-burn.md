---
slug: "per-subagent-token-attribution-in-burn"
milestone: "Intake"
order: 30
---

### Per-subagent token attribution in burn

- **Status:** planned
- **Spec:** docs/changes/per-subagent-token-attribution-in-burn/proposal.md
- **Summary:** Group burn's existing transcript scan by `attributionAgent` to produce per-subagent and per-fleet-lane token attribution. Claude Code writes one transcript per subagent to `~/.claude/projects/<project>/<sessionId>/subagents/agent-<id>.jsonl` (816 present locally), each carrying `agentId`, `attributionAgent`, `sessionId`, `sourceToolAssistantUUID`, `requestId`, `model` and a full `usage` block. `burn`'s `listTranscripts()` already recurses into those directories, so the data is ingested today and the identity discarded — this is a grouping key on a scan that already runs, plus the existing `requestId` dedup (transcripts repeat each usage block ~3x). Corrects a documented falsehood: `fleet-command/SKILL.md:319` states subagent tokens "are not observable, so a token governor would be a promise the skill cannot keep". Must assert the transcript shape and degrade to "unattributed" rather than 0 when the undocumented fields change, so a CLI update cannot silently report a fleet run as free. Unblocks per-lane cost measurement for Adaptive Model Routing (#1032). Source: paperclip budget-enforcement model (76.1k stars, MIT) — mechanism only, not the platform. Ideation: docs/ideation/external-source-adoption-tria-2026-08-09.md (score 9.00).
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1270

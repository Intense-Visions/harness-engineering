---
'@harness-engineering/cli': minor
---

Add `adr-fleet` — the **decide** stage of the `-fleet` family (issue-fleet → adr-fleet → roadmap-fleet → pr-fleet). It sweeps the backlog of pending architectural decisions (undocumented decision points, decision-blocked work, parked forks), fans out worktree-isolated subagents that each run the real `harness-architecture-advisor` pipeline to draft one ADR under `docs/knowledge/decisions/` at `status: proposed`, independently verifies every draft is a well-formed record (never a subagent self-report) on a CI-green branch, and hands the human one batch sign-off pass. It never auto-accepts — a drafted ADR stays `proposed` until an explicit human sign-off flips it to `accepted`.

The skill is self-contained `SKILL.md` + `skill.yaml` that cites the shared spine (`docs/reference/fleet-family.md`) and defines only its decide-stage parts: the pending-decision queue, advisor-drafting with orchestrator-pre-allocated ADR numbers, and the terminal human batch sign-off gate. Ships with platform symlinks (codex/cursor/gemini-cli), the decide-stage batch-sign-off-gate ADR (the complement to the fan-out, interaction-model, and land-merge-gate ADRs), a new `proposed` status in the ADR vocabulary, and regenerated plugin/catalog artifacts.

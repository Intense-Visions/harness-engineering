---
'@harness-engineering/cli': patch
---

Add `harness proposals status` — a provider-independent observability subcommand
for the skill-proposal loop, plus an honesty/docs correction.

`status` reports queue counts by status (open/gate-running/gate-failed/approved/
rejected/total) and, per emission surface, whether it is live or dormant and why:
the manual `emit_skill_proposal` surface is always available, and session-terminus
retrospection reports `enabled` only when `HARNESS_SESSION_RETROSPECTION` is truthy
**and** an analysis provider is resolvable (`ANTHROPIC_API_KEY` or
`HARNESS_ANALYSIS_BASE_URL`) — otherwise a `dormantReason` names the missing
precondition. It reads only env-var presence and counts queue files (never
constructs a provider, never imports `@harness-engineering/intelligence`), so it
is safe in CI and offline and always exits 0. `--json` emits the full report.

Also documents the loop's real (opt-in / dormant-by-default) posture in a new
operator guide (`docs/guides/skill-proposal-loop.md`), corrects the README Skill
Proposals bullet so it no longer implies an always-on loop, and fixes the stale
ADR 0016 link.

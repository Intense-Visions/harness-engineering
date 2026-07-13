---
'@harness-engineering/orchestrator': minor
'@harness-engineering/core': minor
---

AMR single-agent quality escalation is now live (completes ADR 0069). The
escalation mechanism + seam were already complete; this adds the _sound_
quality-verdict source that was missing: a **baseline-relative** security scan of
the diff a single-agent dispatch introduced.

On a normal single-agent exit, when AMR is active, the orchestrator scans only the
**added lines** of the agent's changes (working-tree diff vs the merge-base of the
worktree and the base ref, so a base branch that advanced mid-dispatch never
attributes other merges to the agent; the seeded handoff overlay is excluded). A
**new error-severity** security finding on an added line → `quality-fail`, which
climbs the coherence unit's escalation floor. This is sound (not approximate)
because every security rule is single-line, so per-added-line matching yields
exactly the findings the agent introduced — pre-existing patterns never count.

Success stays escalation-neutral (never a premature `quality-pass`, per ADR 0069).
Fully guarded — any git/scan error degrades to neutral, never breaking completion —
and a **no-op when AMR is off** (dispatch stays byte-identical). Staged workflows
already escalate on their per-stage gate; this is the single-agent equivalent.

Adds `WorkspaceManager.getIntroducedDiff` and `SecurityScanner.scanFileContent`
(fileGlob-aware in-memory scanning).

# Skill Advisor — cicd-fleet

Signals extracted from the spec: autonomous orchestration, CI/CD-red triage, flaky-test deflaking, root-cause debugging, workflow-config auditing, batch fan-out, worktree isolation, artifact + all-OS-CI verification, deterministic-green verification, batch remediation PRs, skill authoring.

## Apply

- **harness-debugging** — the real per-item root-cause-before-fix pipeline each remediation subagent runs for real-failures and flakes (heal / deflake); the quality gate cicd-fleet composes and never reimplements.
- **harness-workflow-audit** — the per-item pipeline for infra/config red (workflow-file, permissions, action-pinning, self-trigger defects).
- **harness-roadmap-pilot** — reuse its impact-scoring to order remediable items by remediation-priority (Decision 3 / SELECT).
- **harness-skill-authoring** — author the new skill in the rich format (required sections, tier, Rationalizations to Reject).
- **harness-parallel-coordinator** — prior art for dispatching independent work across isolated agents; informs the DISPATCH fan-out.

## Reference

- **roadmap-fleet** — the structural twin (build stage; REPORT terminal, never merges); cicd-fleet is a quality-queue sibling and shares the documented spine.
- **pr-fleet** — the land-stage sibling; the human optionally lands a verified cicd-fleet remediation batch through it.
- **harness-audit** — precedent for fan-out parallel agents plus dedup plus report.

## Consider

- **The Workflow primitive** — a future deterministic/resumable execution substrate for the DISPATCH phase (named as an upgrade in the family's fan-out ADR, not v1).
- **harness-tdd** — a regression-test discipline for a healed real-failure, to lock in the fix.
- **harness-rollback** — the post-ship circuit breaker; the safety net downstream of a landed remediation batch.

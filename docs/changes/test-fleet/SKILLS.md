# Skill Advisor — test-fleet

Signals extracted from the spec: autonomous orchestration, test-coverage backlog, coverage-gap enumeration, critical-path targeting, batch fan-out, worktree isolation, test authoring, artifact + all-OS-CI verification, never auto-merge, skill authoring.

## Apply

- **harness-test-advisor** — the composed coverage engine: project-wide coverage audit ("what's untested?") plus uncovered critical paths, used in SELECT to enumerate targets and in VERIFY to re-audit the coverage delta.
- **harness-tdd** — the real per-target authoring flow each subagent runs to write behavior-covering tests; the quality gate test-fleet composes and never reimplements.
- **test-craft** — the LLM-judgment test-quality critique run after tdd to raise assertion strength and reject brittle / coverage-theater tests.
- **harness-roadmap-pilot** — reuse its impact-scoring to order coverage targets by (criticality × coverage-deficit) rather than ad-hoc ranking.
- **harness-skill-authoring** — author the new skill in the rich format (required sections, tier, domain-specific Rationalizations to Reject).

## Reference

- **roadmap-fleet** — the structural twin (both fan out over a work-queue and stop at reviewable PRs they never merge); test-fleet shares the documented family spine and differs only in queue, per-item pipeline, and verification-artifact shape.
- **pr-fleet** — the land-stage sibling; prior art for the five-phase spine reuse and the domain-specific triage/verification variance.
- **harness-audit** — precedent for fan-out parallel agents plus dedup plus report.

## Consider

- **canary test-authoring plugin** — an optional per-target authoring composition where a project ships it; kept optional so the skill runs standalone on the harness authoring flow in any adopter project.
- **The Workflow primitive** — a future deterministic/resumable execution substrate for DISPATCH (named as an upgrade in the fan-out ADR, not v1).

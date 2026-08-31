# Skill Advisor — perf-fleet

Signals extracted from the spec: autonomous orchestration, perf-budget/regression backlog, benchmark measurement, measured before/after bar, critical-path weighting, tiered remediate-vs-file, batch fan-out, worktree isolation, all-OS-CI + re-measurement verification, batch human review, skill authoring.

## Apply

- **harness-perf** — the real measurement/benchmark pipeline each DISPATCH subagent runs for its before/after; the measurement engine perf-fleet composes (owns `check-perf`, `get_perf_baselines`, `update_perf_baselines`) and never reimplements.
- **harness-debugging** — the real fix pipeline for a runtime regression with an investigable cause (the diagnosis-and-fix pipeline bug-fleet also uses).
- **harness-refactoring** — the real fix pipeline for a structural complexity/coupling budget breach.
- **harness-skill-authoring** — author the new skill in the rich format (required sections, tier, domain-specific Rationalizations to Reject).

## Reference

- **bug-fleet** — the structural twin: a measured-bar quality-queue member with a tiered terminal (fix PRs + filed issues); perf-fleet mirrors its reproduction bar as a measured-before/after bar.
- **cleanup-fleet / docs-fleet** — quality-queue siblings sharing the documented spine (`docs/reference/fleet-family.md`); the Boundary section scopes perf-fleet against cleanup-fleet on the measurement line.
- **harness-roadmap-pilot** — reuse its impact-scoring to order targets by composite tier × critical-path × churn (SELECT).

## Consider

- **check_performance / get_critical_paths (MCP)** — posture-vs-budget and hot-path weighting folded into the target queue alongside the detectors.
- **The Workflow primitive** — a future deterministic/resumable execution substrate for DISPATCH (named as an upgrade per the fan-out ADR, not v1).
- **pr-fleet** — the downstream land-stage member the human optionally uses to land the verified perf-fix batch.

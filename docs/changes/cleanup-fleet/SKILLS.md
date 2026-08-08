# Skill Advisor — cleanup-fleet

Signals extracted from the spec: autonomous orchestration, entropy/hotspot backlog, churn analysis, dead-code remediation, batch fan-out, worktree isolation, convergence + all-OS-CI verification, batch human review, skill authoring.

## Apply

- **harness-codebase-cleanup** — the real per-target remediation pipeline each DISPATCH subagent runs; the convergence engine cleanup-fleet composes and never reimplements.
- **harness-hotspot-detector** — composed in SELECT to enumerate structural-risk hotspots via co-change + churn.
- **cleanup-dead-code** — composed in SELECT to enumerate dead-export / commented-out / orphaned-dependency findings.
- **harness-dependency-health** — composed in SELECT for graph-metric risk (coupling, centrality, dependents).
- **harness-skill-authoring** — author the new skill in the rich format (required sections, tier, Rationalizations to Reject).

## Reference

- **roadmap-fleet / pr-fleet** — the structural twins on the core spine; cleanup-fleet is a quality-queue sibling sharing the documented spine (`docs/reference/fleet-family.md`).
- **harness-roadmap-pilot** — reuse its impact-scoring to order remediation targets by composite value (SELECT).
- **harness-audit** — precedent for fan-out parallel agents plus dedup plus grouped report.

## Consider

- **detect_entropy (MCP)** — drift/entropy findings folded into the target queue alongside the detection skills.
- **The Workflow primitive** — a future deterministic/resumable execution substrate for DISPATCH (named as an upgrade per the fan-out ADR, not v1).
- **harness-rollback** — the post-ship circuit breaker downstream of a landed cleanup batch.

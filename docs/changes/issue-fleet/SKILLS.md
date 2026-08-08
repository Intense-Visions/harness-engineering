# Skill Advisor — issue-fleet

Signals extracted from the spec: autonomous orchestration, open-issue-backlog triage, labeling, dedup, routing, prioritization, batch fan-out, queue-slice partitioning, artifact/signal verification, human destructive-close gate, skill authoring.

## Apply

- **harness-roadmap-pilot** — reuse its impact-scoring for the `prioritize` axis so the ranked queue is principled and reproducible rather than ad-hoc.
- **harness-skill-authoring** — author the new skill in the rich format (required sections, tier, domain-specific Rationalizations to Reject).
- **harness-parallel-coordinator** — prior art for dispatching independent work across isolated agents; informs the DISPATCH queue-slice fan-out.

## Reference

- **roadmap-fleet** — the build-stage sibling; shares the extracted spine and the SELECT→CONFIRM→DISPATCH→VERIFY→terminal skeleton issue-fleet reuses.
- **pr-fleet** — the land-stage sibling; its human-authorization-in-CONFIRM gate is the model for issue-fleet's destructive-close authorization.
- **harness-audit** — precedent for fan-out parallel agents plus dedup plus grouped-report.

## Consider

- **The Workflow primitive** — a future deterministic/resumable execution substrate for the DISPATCH phase (named as an upgrade per ADR 0087, not v1).
- **adr-fleet / cicd-fleet / test-fleet / cleanup-fleet** — the downstream fleets issue-fleet routes to; the routing axis targets these queues.

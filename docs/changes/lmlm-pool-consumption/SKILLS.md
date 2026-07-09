# Skill Advisor — LMLM Pool Consumption Improvements

Relevant skills for building this spec.

## Apply

- **harness-planning** — break the 5-phase implementation order into a task plan with dependency ordering and checkpoints.
- **harness-execution** — execute the plan task-by-task with state tracking and verification.
- **harness-tdd** — each phase has concrete EARS requirements and observable success criteria; drive them test-first.

## Reference

- **harness-soundness-review** — deep soundness pass over the spec/plan before execution (task-aware selection is the riskiest phase).
- **harness-architecture-enforcer** — the new selection path crosses the local-models → orchestrator boundary; verify layer/import direction.

## Consider

- **harness-skill-authoring / ADR** — Phase 4 (task-aware selection via per-profile pool scoring) warrants a standalone ADR per the spec's Integration Points.
- **harness-performance-guardian** — warming + circuit-breaker touch the dispatch hot path; watch latency budgets.

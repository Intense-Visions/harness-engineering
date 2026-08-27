---
'@harness-engineering/cli': minor
---

Add `harness init --tier minimal` (ADR 0101): a load-bearing floor below the existing adoption ladder mapped one-to-one to the field's 5-item Minimum Viable Harness. It scaffolds exactly five artifacts — a generated `AGENTS.md` repo guide, a `harness.config.json` wiring `harness check-arch` as the runnable local check, a seeded `.harness/arch/baselines.json` making one hard architectural rule (a cyclomatic-complexity cap of 15) fail-closed, a git pre-commit verification loop that runs the check, and the `block-no-verify` permission boundary — then prints an explicit, ordered upgrade path to the fuller tiers. STRATEGY.md, framework selection, design system, and MCP integration are deferred (not skipped); re-running init at a higher tier is additive over a `minimal` install. Degrades gracefully outside a git repo. `--tier` also accepts `basic`/`intermediate`/`load-bearing-minimum`/`advanced`, delegating to the existing level scaffold.

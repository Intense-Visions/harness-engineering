# @harness-engineering/stats

Statistical instruments for the decisions the harness makes repeatedly under uncertainty:
which model tier to route a task to, which fleet gets the next concurrency slot, which
roadmap track gets the next pick.

Each instrument is one directory exported as one namespace, so `stats.bandit.*` and
`stats.sprt.*` can never collide. The package depends only on `@harness-engineering/types`
(no graph, no provider), so core, intelligence, orchestrator, and the CLI can all import it
without a layer exception.

| Namespace | Instrument                                                                                      | Status                                                |
| --------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `bandit`  | Explore/exploit bandit: `scoutFraction` and `thompson` policies over a half-life-decayed ledger | Scaffolded (Phase 1); implementation lands in Phase 2 |
| `sprt`    | Bernoulli sequential probability ratio test with Wald bounds                                    | Scaffolded (Phase 1); implementation lands in Phase 3 |

Shared shapes (`Pull`, `ArmState`, `BanditConfig`, `Choice`, `SprtVerdict`, `SprtConfig`) live in
`@harness-engineering/types` (`packages/types/src/stats.ts`) so this package and every consumer
read one ledger line the same way.

Design: `docs/changes/stats-explore-exploit/proposal.md`.

## Tests

```bash
pnpm --filter @harness-engineering/stats test
```

# @harness-engineering/stats

Statistical instruments for the decisions the harness makes repeatedly under uncertainty:
which model tier to route a task to, which fleet gets the next concurrency slot, which
roadmap track gets the next pick.

Each instrument is one directory exported as one namespace, so `stats.bandit.*` and
`stats.sprt.*` can never collide. The package depends only on `@harness-engineering/types`
(no graph, no provider), so core, intelligence, orchestrator, and the CLI can all import it
without a layer exception.

| Namespace | Instrument                                                                                      | Status                                                          |
| --------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `bandit`  | Explore/exploit bandit: `scoutFraction` and `thompson` policies over a half-life-decayed ledger | Implemented (Phase 2): ledger, decayed arm model, both policies |
| `sprt`    | Bernoulli sequential probability ratio test with Wald bounds                                    | Scaffolded (Phase 1); implementation lands in Phase 3           |

## Usage

```ts
import { bandit } from '@harness-engineering/stats';

const ledger = new bandit.BanditLedger({
  // .harness/metrics/bandit.jsonl; IO failures (append, or a fold read that is not ENOENT) land here
  onError: (error) => console.warn('bandit ledger', error),
});
const config = { policy: 'scoutFraction', halfLifeDays: 30, minEffectiveN: 2 } as const;
const { arms, malformed, bytes, readError } = ledger.fold(
  'routing',
  'quick-fix',
  config,
  new Date()
);
// bytes: file length folded; a hot consumer re-folds only when it changes.
// readError: the ledger was unreadable (EISDIR, EACCES, ...): arms is [] and onError was told.
const choice = bandit.choose(eligibleSubsetOf(arms), config, Math.random); // eligibility is yours (D7)
const pull = {
  ts: new Date().toISOString(),
  consumer: 'routing',
  context: 'quick-fix',
  arm: choice.arm,
  mode: choice.mode,
  ref: 'issue-1557',
};
ledger.append(pull);
// later, score it by ref: a full Pull with the same ref plus a reward; keep the dispatch ts
ledger.append({ ...pull, reward: { outcome: 1, costUsd: 0.02 } });
```

The consumer owns eligibility (`eligibleSubsetOf` above is yours): floors, vetoes, and budgets never enter the package.

The scoring line replaces the earlier unscored line wholesale, so its `ts` is the instant that
gets decayed and reported as `lastPull`: preserve the dispatch `ts` when scoring, or a decision
made weeks ago re-enters at full weight the day it is scored. Every `ts` must be a UTC instant
with a zone designator (`Date#toISOString`); a designator-less timestamp is a malformed line.

`outcomePerDollar` treats a missing `costUsd` as the `COST_EPSILON_USD` floor ($0.001), so an
unpriced pull scores as if it were nearly free and dominates the mean. Record `costUsd` on every
pull in a bucket that folds with `outcomePerDollar`, or fold it with `outcomeOnly`.

Shared shapes (`Pull`, `ArmState`, `BanditConfig`, `Choice`, `SprtVerdict`, `SprtConfig`) live in
`@harness-engineering/types` (`packages/types/src/stats.ts`) so this package and every consumer
read one ledger line the same way.

Design: `docs/changes/stats-explore-exploit/proposal.md`.

## Tests

```bash
pnpm --filter @harness-engineering/stats test
```

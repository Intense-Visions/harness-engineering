# @harness-engineering/stats

Statistical instruments for the decisions the harness makes repeatedly under uncertainty:
which model tier to route a task to, which fleet gets the next concurrency slot, which
roadmap track gets the next pick.

Each instrument is one directory exported as one namespace, so `stats.bandit.*` and
`stats.sprt.*` can never collide. The package depends only on `@harness-engineering/types`
(no graph, no provider), so core, intelligence, orchestrator, and the CLI can all import it
without a layer exception.

| Namespace | Instrument                                                                                      | Status                                                                                       |
| --------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `bandit`  | Explore/exploit bandit: `scoutFraction` and `thompson` policies over a half-life-decayed ledger | Implemented (Phase 2): ledger, decayed arm model, both policies                              |
| `sprt`    | Bernoulli sequential probability ratio test with Wald bounds                                    | Implemented (Phase 3): createSprt with Wald bounds, sticky terminal verdict, maxN resolution |

## Usage

### Bandit

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

### SPRT

```ts
import { sprt } from '@harness-engineering/stats';

// h0: the cheap tier succeeds half the time; h1: seven times in ten. 5% declared error each way.
const config = { alpha: 0.05, beta: 0.05, p0: 0.5, p1: 0.7, maxN: 200 };
const test = sprt.createSprt(config); // throws InvalidSprtConfigError on a bad config, never later
const outcomes = [1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1] as const; // your stream: 0/1 or boolean, oldest first
for (const outcome of outcomes) {
  if (test.observe(outcome) !== 'continue') break; // a terminal verdict is sticky anyway
}
const { verdict, llr, n } = test.state; // 'reject' → favor h1; 'accept' → favor h0; 'continue' → stream ran out
const { upper, lower } = sprt.waldBounds(config); // A = ln 19 ≈ 2.94, B = −A
console.log(
  `${verdict} after ${n} observations: llr ${llr.toFixed(2)} in (${lower.toFixed(2)}, ${upper.toFixed(2)})`
);
// → reject after 12 observations: llr 3.19 in (-2.94, 2.94)
```

Nothing on the observe path throws except two consumer bugs. `createSprt` validates the config once
(`alpha`, `beta`, `p0`, `p1` in (0, 1); `alpha + beta < 1`; `p0 ≠ p1`; `maxN` a positive integer when
present) and throws `InvalidSprtConfigError` there. `observe` accepts exactly `0`, `1`, `true`, or
`false`; any other value (`0.5`, `'1'`, `undefined`, `NaN`) throws `InvalidSprtObservationError` and
leaves the state untouched rather than being counted as a failure. Once the verdict leaves `continue` it is sticky: further observations
are ignored and `state.n` is the stopping time. With `maxN`, a test still undecided at the `maxN`-th
observation resolves to whichever hypothesis the log-likelihood ratio favors (exactly 0 accepts h0).

Shared shapes (`Pull`, `ArmState`, `BanditConfig`, `Choice`, `SprtVerdict`, `SprtConfig`) live in
`@harness-engineering/types` (`packages/types/src/stats.ts`) so this package and every consumer
read one ledger line the same way.

Design: `docs/changes/stats-explore-exploit/proposal.md`.

## Tests

```bash
pnpm --filter @harness-engineering/stats test
```

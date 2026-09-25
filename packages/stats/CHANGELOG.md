# @harness-engineering/stats

## 0.2.0

### Minor Changes

- 3cdc0ba: `stats.bandit` is live: `BanditLedger` (synchronous JSONL append, bucketed fold with half-life decay and late scoring by `ref`), `foldArms`, `choose` under the `scoutFraction` and `thompson` policies with an injectable `rng`, default utilities `outcomeOnly` / `outcomePerDollar`, config validation that fills the spec defaults for every field but `policy` (`DEFAULT_SCOUT_FRACTION`, `DEFAULT_HALF_LIFE_DAYS`, `DEFAULT_MIN_EFFECTIVE_N`, `DEFAULT_PRIOR`), and typed `NoEligibleArmsError` / `InvalidBanditConfigError`.
- f8dae74: Two corrections to `stats.bandit`, both found by adversarial review of would-be consumers.

  **The exploit branch now requires minimum evidence before it ranks arms.** It previously ranked on
  `meanUtility` alone, and an arm with no scored pulls folds to `meanUtility: 0` — so one successful
  scout pull anywhere scored 1.0 against every untried arm's 0.0 and took every subsequent exploit
  pull. `choose` now ranks only arms that have cleared `minEffectiveN` (the ones the fold reports with
  `novel: false`); while none has, it returns `eligible[0]` with `mode: 'exploit'` and a reason saying
  so. Pass your eligible arms in preference order: `eligible[0]` is your declared default and holds
  the exploit branch until evidence exists, so a cold start behaves exactly as your own ordering
  would, and the scout share still reaches every arm. `thompson` is unchanged — a thin arm's posterior
  is near the prior, so its draw is already evidence-weighted.

  **The ledger is now bounded by a retention rule instead of growing forever.** `BanditConfig` gains
  an optional `retentionHalfLives` (default 10, exported as `DEFAULT_RETENTION_HALF_LIVES`, validated
  finite and positive). A pull older than `retentionHalfLives × halfLifeDays` weighs at most 2^-10 —
  about 0.001 — so `fold` skips it outright and reports how many in the new `FoldResult.expired`
  field, which is deliberately separate from `malformed` because an expired pull is well-formed, just
  too old to matter. The new `BanditLedger.compact(config, now)` deletes exactly those lines and
  reports `{ kept, dropped, bytes }`. It cannot change a posterior, it is idempotent, it is a no-op on
  a missing file, it keeps any line whose `ts` it cannot judge so your `malformed` count survives, and
  IO failures go to `onError` rather than throwing. Call it on whatever cadence suits you; a positive
  `expired` count is the signal that it has work to do. `DEFAULT_LEDGER_PATH` is relative and resolves
  against `process.cwd()`, so a git worktree gets its own ledger — pass an absolute `path` to share one.

- 3cdc0ba: New leaf package `@harness-engineering/stats`: the durable home for the harness's statistical instruments. This first release ships two instruments, each as one namespace so their functions can never collide: `bandit` (explore/exploit over a half-life-decayed ledger) and `sprt` (Bernoulli sequential probability ratio test); the two instrument entries in this release describe each surface. Later instruments land as sibling namespaces. Runtime dependency is exactly `@harness-engineering/types`, so any consumer can import it without a layer exception.
- 3cdc0ba: `stats.sprt` is live: `createSprt(config)` runs a Bernoulli sequential probability ratio test against Wald's bounds (`reject` favors h1, `accept` favors h0, `continue` otherwise) with a sticky terminal verdict and optional `maxN` resolution to the currently favored hypothesis; `waldBounds`, `validateSprtConfig`, and the typed `InvalidSprtConfigError` (bad config at construction) and `InvalidSprtObservationError` (`observe` given anything but `0`, `1`, `true`, `false`) complete the surface.

### Patch Changes

- Updated dependencies [f8dae74]
- Updated dependencies [3cdc0ba]
  - @harness-engineering/types@0.35.0

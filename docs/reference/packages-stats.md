# Reference: packages / stats

Reference index for `@harness-engineering/stats` — statistical instruments for the decisions the harness makes repeatedly under uncertainty. Each entry links the source file and summarizes its purpose and key exports. Design: [`docs/changes/stats-explore-exploit/proposal.md`](../changes/stats-explore-exploit/proposal.md).

## packages/stats/src/index.ts

[`packages/stats/src/index.ts`](/packages/stats/src/index.ts)

Package barrel. Exports each instrument as one namespace (`bandit`, `sprt`) so instrument functions can never collide; later instruments land as sibling namespaces.

**Exports:** `bandit`, `sprt`

## packages/stats/src/bandit/index.ts

[`packages/stats/src/bandit/index.ts`](/packages/stats/src/bandit/index.ts)

Public surface of the explore/exploit bandit: `BanditLedger` (append + fold), `foldArms`, `decayWeight`, `choose`, the default utilities, config validation, and the typed errors. Sampling and line parsing are internal.

**Exports:** `BanditLedger`, `DEFAULT_LEDGER_PATH`, `foldArms`, `decayWeight`, `choose`, `outcomeOnly`, `outcomePerDollar`, `COST_EPSILON_USD`, `resolveBanditConfig`, `DEFAULT_SCOUT_FRACTION`, `DEFAULT_PRIOR`, `NoEligibleArmsError`, `InvalidBanditConfigError`; types `ResolvedBanditConfig`, `BanditLedgerOptions`, `FoldResult`, `Rng`, `Reward`, `Utility`

## packages/stats/src/bandit/ledger.ts

[`packages/stats/src/bandit/ledger.ts`](/packages/stats/src/bandit/ledger.ts)

`BanditLedger` over `.harness/metrics/bandit.jsonl` (path injectable): synchronous `append` (one `appendFileSync` per pull, IO failures to `onError`), and `fold(consumer, context, config, now, utility?)` — whole-file re-read, bucket filter, late scoring by `ref` (latest scored wins, never downgraded, arm mismatch is malformed), then `foldArms`. Missing file is an empty ledger; `FoldResult` carries the malformed count and the byte length read.

**Exports:** `BanditLedger`, `DEFAULT_LEDGER_PATH`, `BanditLedgerOptions`, `FoldResult`

## packages/stats/src/bandit/ledger-parse.ts

[`packages/stats/src/bandit/ledger-parse.ts`](/packages/stats/src/bandit/ledger-parse.ts)

`parseLine`: one ledger line to a `Pull` or a `MalformedReason` (invalid JSON, missing/wrong-typed field, non-ISO `ts`, outcome outside [0, 1], negative cost). Never throws.

**Exports:** `parseLine`, `ParsedLine`, `MalformedReason`

## packages/stats/src/bandit/arm-model.ts

[`packages/stats/src/bandit/arm-model.ts`](/packages/stats/src/bandit/arm-model.ts)

Decayed Beta posterior: `decayWeight(ageDays, halfLifeDays) = 0.5^(age/halfLife)`; `foldArms(pulls, config, now, utility)` accumulates alpha/beta/effectiveN with those weights, flags `novel` below `minEffectiveN`, computes the decay-weighted `meanUtility`, and tracks `lastPull` for unscored pulls too. The reference instant is always the `now` argument, never the clock.

**Exports:** `decayWeight`, `foldArms`

## packages/stats/src/bandit/policy.ts

[`packages/stats/src/bandit/policy.ts`](/packages/stats/src/bandit/policy.ts)

`choose(eligible, config, rng)`: `scoutFraction` (probability f → least-sampled, novel-first, rng tie-break, mode explore; else highest `meanUtility` with the same rng tie-break so a cold start spreads across unscored arms, exploit) and `thompson` (one Beta draw per arm, max wins, explore when the pick's posterior mean is below the best). Single eligible arm → exploit without consulting `rng`; empty → `NoEligibleArmsError`. Every `Choice.reason` is one printable line.

**Exports:** `choose`

## packages/stats/src/bandit/sampling.ts

[`packages/stats/src/bandit/sampling.ts`](/packages/stats/src/bandit/sampling.ts)

`sampleBeta(alpha, beta, rng)` via Marsaglia–Tsang Gamma draws and Box–Muller normals, driven only by the injected `rng` so seeded tests are deterministic.

**Exports:** `sampleBeta`, `Rng`

## packages/stats/src/bandit/config.ts

[`packages/stats/src/bandit/config.ts`](/packages/stats/src/bandit/config.ts)

`resolveBanditConfig`: fills defaults (`scoutFraction` 0.1, prior Beta(1,1)) and validates the table of guards (`policy` is `scoutFraction` or `thompson`, `scoutFraction` in [0, 1], `halfLifeDays` > 0, `minEffectiveN` ≥ 0, prior parameters > 0), throwing `InvalidBanditConfigError` with the first failed guard's message.

**Exports:** `resolveBanditConfig`, `ResolvedBanditConfig`, `DEFAULT_SCOUT_FRACTION`, `DEFAULT_PRIOR`

## packages/stats/src/bandit/utility.ts

[`packages/stats/src/bandit/utility.ts`](/packages/stats/src/bandit/utility.ts)

Default utilities over the raw reward pair (D8): `outcomeOnly` and the epsilon-guarded `outcomePerDollar`.

**Exports:** `outcomeOnly`, `outcomePerDollar`, `COST_EPSILON_USD`, `Utility`, `Reward`

## packages/stats/src/bandit/errors.ts

[`packages/stats/src/bandit/errors.ts`](/packages/stats/src/bandit/errors.ts)

Typed errors: `NoEligibleArmsError` (empty eligible set, a consumer bug) and `InvalidBanditConfigError` (config rejected at construction).

**Exports:** `NoEligibleArmsError`, `InvalidBanditConfigError`

## packages/stats/tests/helpers/prng.ts

[`packages/stats/tests/helpers/prng.ts`](/packages/stats/tests/helpers/prng.ts)

Test helper: seeded mulberry32 PRNG so every statistical test (SC1, SC6, SC7) is reproducible without a property-testing dependency.

## packages/stats/src/sprt/index.ts

[`packages/stats/src/sprt/index.ts`](/packages/stats/src/sprt/index.ts)

Public surface of the Bernoulli sequential probability ratio test. Phase 1 placeholder; `createSprt` with Wald bounds lands in Phase 3.

**Exports:** none yet

## packages/stats/tsup.config.ts

[`packages/stats/tsup.config.ts`](/packages/stats/tsup.config.ts)

Build config: CJS + ESM library entry with declarations, compiled against `tsconfig.build.json`. No hot-path binary, unlike `packages/burn`.

## packages/stats/vitest.config.mts

[`packages/stats/vitest.config.mts`](/packages/stats/vitest.config.mts)

Test config mirroring `packages/burn`: node environment, v8 coverage with 80% thresholds, pre-push JSON reporter via `scripts/vitest-prepush-reporter.mjs`.

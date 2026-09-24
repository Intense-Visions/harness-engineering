# Reference: packages / stats

Reference index for `@harness-engineering/stats` — statistical instruments for the decisions the harness makes repeatedly under uncertainty. Each entry links the source file and summarizes its purpose and key exports. Design: [`docs/changes/stats-explore-exploit/proposal.md`](../changes/stats-explore-exploit/proposal.md).

## packages/stats/src/index.ts

[`packages/stats/src/index.ts`](/packages/stats/src/index.ts)

Package barrel. Exports each instrument as one namespace (`bandit`, `sprt`) so instrument functions can never collide; later instruments land as sibling namespaces.

**Exports:** `bandit`, `sprt`

## packages/stats/src/bandit/index.ts

[`packages/stats/src/bandit/index.ts`](/packages/stats/src/bandit/index.ts)

Public surface of the explore/exploit bandit. Phase 1 placeholder; the ledger, arm model, policies, and default utilities land in Phase 2.

**Exports:** none yet

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

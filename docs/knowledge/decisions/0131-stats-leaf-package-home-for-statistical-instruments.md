---
number: 0131
title: '@harness-engineering/stats is the leaf-package home for statistical instruments, one namespace per instrument'
date: 2026-09-24
status: accepted
tier: large
source: docs/changes/stats-explore-exploit/proposal.md
---

## Context

> **Retrospective record.** This ADR documents spec decision D6 of
> `docs/changes/stats-explore-exploit/proposal.md`, approved with the spec and shipped in
> Phases 1–3 of its autopilot run (branch `docs/stats-explore-exploit-spec`). Every claim
> below was re-read against the code as of the PR head; citations are in **References**.

The harness needs statistical instruments in three places that do not share a dependency
direction. The adaptive router lives in `packages/orchestrator`, fleet-command and roadmap
scoring live in skills backed by `packages/core` and the CLI, and roadmap row #1557
(`bandit-allocation-with-sequential-stopping`) names two instruments — Thompson-sampling
allocation and SPRT sequential testing — that all of them should share. Three more tracked
rows (IRT #1657, Kelly staking, Kalman fusion) are statistical siblings waiting on consumers.

`packages/core` and `packages/intelligence` do not depend on each other
(`packages/core/package.json` and `packages/intelligence/package.json` each depend on
`graph` and `types` only; `packages/orchestrator/package.json` depends on both). Placing the
instruments in either would make them unreachable from the other without a layer exception.
The undeclared packages `burn` (a leaf) and `signals` (which depends on `graph` and `zod`)
are not declared as layers, so `checkLayerViolations` skips every edge touching them
(`packages/core/src/constraints/dependencies.ts:229-241`) — they are importable from
anywhere, and nothing is positioned to enforce their dependency direction.

## Decision

1. **A new leaf package, `packages/stats` (`@harness-engineering/stats`), is the home for
   statistical instruments.** Its runtime dependency is exactly `@harness-engineering/types`
   (`packages/stats/package.json` `dependencies`), so core, intelligence, orchestrator, and the
   CLI can all import it without a layer exception. Shared shapes (`Pull`, `ArmState`,
   `BanditConfig`, `Choice`, `SprtConfig`, `SprtVerdict`) live in
   `packages/types/src/stats.ts` and are exported from the types barrel.
2. **`stats` is a declared layer.** `harness.config.json` `layers` carries `stats` with
   `packages/stats/src/**` and `allowedDependencies: ["types"]`, and `entropy.entryPoints`
   lists `packages/stats/src/index.ts` and `packages/stats/tsup.config.ts`. Unlike `burn` and
   `signals`, the declaration records the intended direction where the validator reads it,
   and relative imports inside `packages/stats/src/**` are checked against it. It does not
   yet machine-check the cross-package direction: the validator resolves only relative
   specifiers (`packages/core/src/constraints/dependencies.ts:100-103` skips every bare
   `@harness-engineering/*` import), so the enforced guarantee behind SC10 is the
   `package.json` dependency pin, verified by inspection. Each consumer phase adds `stats`
   to its own package's `allowedDependencies` so the rule is in place when the validator
   learns to resolve workspace specifiers.
3. **One directory per instrument, exported as one namespace.** `packages/stats/src/index.ts`
   is `export * as bandit from './bandit/index.js'; export * as sprt from './sprt/index.js'`,
   so `stats.bandit.choose` and any `stats.sprt.*` name (or a later `stats.irt.*`) can never
   collide. Instruments do
   not import each other's internals; each has its own typed errors
   (`packages/stats/src/bandit/errors.ts`, `packages/stats/src/sprt/errors.ts`). SC12 pins
   `packages/stats/src/` to exactly `bandit/`, `index.ts`, `sprt/`
   (`packages/stats/tests/barrel.test.ts`). Later instruments (`irt/`, `kelly/`, `kalman/`)
   land as sibling directories with the same shape, each with its first consumer.
4. **Consumers import the package rather than reimplementing.** The routing, fleet-command,
   and roadmap consumers (D1, D2) are follow-on specs; in this change no package imports
   `@harness-engineering/stats` (SC11), so the first publish can be bootstrapped manually
   without leaving a dependent pointing at an unpublished version.
5. **No CLI in the package.** A read-only `harness stats bandit` view ships with the routing
   consumer, the first phase that writes the ledger, so `cli` does not depend on `stats`
   before the package is live on npm.

### Alternatives Considered

- **Put the instruments in `packages/core`.** Rejected: `intelligence` cannot import core
  without a new layer edge, and the orchestrator's router would pull all of core onto its
  dispatch path for a hundred lines of arithmetic.
- **Put them in `packages/intelligence`.** Rejected symmetrically: core (fleet and roadmap
  scoring) cannot import intelligence.
- **Add them to `packages/burn`.** Rejected: burn is a leaf with a single job (cost
  attribution) and an undeclared layer; the precedent worth copying is its shape (types-only
  leaf, tsup, vitest), not its contents.
- **Ship as an undeclared package like `burn`/`signals`.** Rejected: the validator would skip
  every edge by design rather than by gap, so nothing would be positioned to stop `stats` from
  growing a graph or provider dependency, which D4 forbids on the router's hot path. Today the
  practical guard is the same either way (the `package.json` pin, see Negative); declaring the
  layer is what lets the validator take over without a config change.
- **One flat module instead of namespaces.** Rejected: four tracked instruments with
  overlapping vocabulary (`test`, `choose`, `state`) would collide on a flat barrel.

## Consequences

### Positive

- One placement importable from every consumer; one ledger format and one arm model instead of
  three (D1).
- The runtime dependency set is pinned to `types` by `packages/stats/package.json` (SC10,
  verified by inspection). `harness check-deps` reports 10 layers with 0 `stats` findings and
  the arch baseline is unchanged, which today is a necessary but not sufficient check: it does
  not see bare-specifier imports, so it covers relative imports inside the package only.
- The package is the durable home for #1557's second instrument (SPRT, shipped) and for IRT,
  Kelly, and Kalman (G6), each landing as a namespace without touching the others.
- The package adds nothing heavy to a hot path: no graph, no provider, one synchronous append
  per pull. The router is the intended first beneficiary once its consumer spec wires it.

### Negative / trade-offs

- A new public npm package needs a one-time manual first publish plus trusted-publisher
  registration before any dependent can be released (spec "Registrations required"); the
  routing consumer's release is blocked until that operator step completes.
- The package is dark until its first consumer lands: 152 tests, zero importers (SC11).
- Consumers must add `stats` to their layer's `allowedDependencies` explicitly. Forgetting it
  does not fail `check-deps` today (the same bare-specifier gap as above), so the rule is
  reviewed by inspection until the validator resolves workspace specifiers; it exists so that
  the check fires without a config change once it does.
- **Layer enforcement gap.** Neither `check-deps` nor the `no-layer-violation` ESLint rule
  resolves bare `@harness-engineering/*` specifiers
  (`packages/core/src/constraints/dependencies.ts:100-103`,
  `packages/eslint-plugin/src/rules/no-layer-violation.ts:37`), so a `stats` import of `core`
  via `@harness-engineering/core` would pass both today. Tracked in the layer-validator
  bare-specifier issue, #2216.

### Neutral

- Types-only dependency means `stats` cannot use `Result<T, E>` helpers from core; it throws
  typed errors when a config is resolved (per `choose()`/`fold()` for the bandit, at `createSprt()`/`waldBounds()` for SPRT) and reports IO through `onError` (see ADR 0132).
- `burn` and `signals` remain undeclared; declaring them is a separate cleanup, not implied
  here.

## References

- Spec: `docs/changes/stats-explore-exploit/proposal.md` — Decisions D1, D2, D4, D6, D10;
  "Package layout"; "Registrations required"; SC10, SC11, SC12.
- `packages/stats/package.json` (`dependencies`: `@harness-engineering/types` only;
  `publishConfig.access: public`).
- `harness.config.json` — `layers` entry `stats` (`allowedDependencies: ["types"]`) and
  `entropy.entryPoints` for `packages/stats`.
- `packages/stats/src/index.ts` (namespace barrel); `packages/stats/tests/barrel.test.ts`
  (SC12 directory and export pins).
- `packages/core/src/constraints/dependencies.ts:229-241` — undeclared packages are skipped by
  the layer validator; `:100-103` — bare (non-relative) specifiers are skipped for every
  package, declared or not (#2216).
- `packages/core/package.json`, `packages/intelligence/package.json`,
  `packages/orchestrator/package.json` — dependency direction that rules out core and
  intelligence as homes.
- `docs/knowledge/architecture/layer-boundaries.md` — layer inventory listing `stats`.
- Concept doc: `docs/knowledge/stats/explore-exploit.md`. Companion decision: ADR 0132
  (`0132-safety-agnostic-stats-primitive.md`).
- Roadmap rows: `docs/roadmap.d/bandit-allocation-with-sequential-stopping.md` (#1557),
  `docs/roadmap.d/irt-capability-difficulty-model.md` (#1657).

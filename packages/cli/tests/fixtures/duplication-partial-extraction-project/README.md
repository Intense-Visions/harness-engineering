# Fixture: a planted `partial-extraction` class beside a larger plain duplicate

Consumed by:

- `packages/cli/tests/integration/cleanup-duplication-exit-code.e2e.test.ts` (the real
  `harness cleanup -t duplication` process)
- `packages/cli/tests/mcp/tools/entropy-duplication.test.ts` (the real `detect_entropy` handler)

Both copy this directory to a `mkdtempSync` dir and scan THAT as `rootDir`.

A SECOND fixture project rather than an edit to `duplication-cli-project`: that one's pinned
numbers (1 class / 3 members / 83 tokens / rank 249 / `signal: 'duplicate'`) are what prove the
no-regression side of Phase 4, so it has to stay byte-identical.

## What is planted

| Unit                                       | Kind     | Tokens | Reported?                                           |
| ------------------------------------------ | -------- | ------ | --------------------------------------------------- |
| `keepBeta` / `keepAlpha` / `keepGamma`     | function | 62     | **yes** — `partial-extraction`, 3 members, rank 186 |
| `sumOne` / `sumTwo` / `sumThree`           | function | 103    | **yes** — `duplicate`, 3 members, rank 309          |
| `labelOne` / `labelTwo` / `labelThree`     | function | < 40   | no — counted in `stats.unitsBelowMinTokens`         |
| `extractPayload` (`src/shared/payload.ts`) | function | < 40   | no — the shared helper itself, and a singleton      |

The three wrappers differ only in function, parameter and local identifier names (Type-2, per
spec decision D1). So do the three plain duplicates.

### The ordering this fixture exists to prove

`rank_PE (186) < rank_plain (309) < 2 x rank_PE (372)`.

That interval is the only one in which "sorted by `priority`" and "sorted by `rank`" disagree,
so the labelled class comes FIRST despite being the smaller duplication. Outside the interval
both orderings agree and any ordering assertion over this fixture would be vacuous.

### The control: a file-level common import that must NOT label

Each of `src/plain/{one,two,three}.ts` imports `LABEL` from `../shared/labels.js` and uses it —
but in a separate, below-`minTokens` function, never inside the cloned body. A file-level
derivation (the spec's original D8 wording) labels that class; the shipped body-level one leaves
it `duplicate`. See `packages/core/src/duplication/imports.ts` for the measured ladder.

## Why three depths

The three wrappers import the same module three different ways:

```
src/beta.ts              ->  './shared/payload.js'
src/wrappers/alpha.ts    ->  '../shared/payload.js'
src/deep/nested/gamma.ts ->  '../../shared/payload.js'
```

Three distinct specifier STRINGS, one module key (`src/shared/payload`). An implementation that
intersects raw specifiers sees three modules and never labels this class — which is the arm the
flat sibling fixture cannot test.

## Measured, not estimated

Run at execution time against `packages/core/dist/index.js`'s `buildCloneIndex` with
`DEFAULT_DUPLICATION_CONFIG` except `ignorePatterns: []` (see trap 2 below):

```
filesScanned 9, filesIgnored 0, filesSkipped 0
unitsFingerprinted 6, unitsBelowMinTokens 4
classesReported 2, classesSuppressed 0, classesTruncated 0, collisionsObserved 0

classes[0]: 3 members / 62 tokens / rank 186 / priority 372 / fingerprint ad1d31714ebf72d4
            signal 'partial-extraction', sharedImport 'src/shared/payload'
            keepBeta (src/beta.ts), keepGamma (src/deep/nested/gamma.ts),
            keepAlpha (src/wrappers/alpha.ts)

classes[1]: 3 members / 103 tokens / rank 309 / priority 309 / fingerprint 796305222f8f8937
            signal 'duplicate', sharedImport absent
            sumOne (src/plain/one.ts), sumThree (src/plain/three.ts), sumTwo (src/plain/two.ts)
```

## Two traps this fixture sits in

1. **`entryPoints` is required.** Without `entropy.entryPoints`, `buildSnapshot` returns
   `Err ENTRY_POINT_NOT_FOUND` and no detector runs at all (Phase 2 decision P9, measured).
   `src/index.ts` re-exports every unit above so all nine source files are reachable.

2. **`DEFAULT_DUPLICATION_CONFIG.ignorePatterns` contains `**/fixtures/**`**, and this fixture
   lives under `packages/cli/tests/fixtures/`. The patterns are matched against the path
   **relative to the scanned `rootDir`**, so scanning a temp-dir COPY yields `src/beta.ts` and
   the ignore does not fire. Scanning this directory in place inside the repo would ignore all
   of it. Both consumers copy first, deliberately.

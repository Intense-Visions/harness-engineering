# Fixture: a planted clone class for the CLI and MCP surfaces

Consumed by:

- `packages/cli/tests/integration/cleanup-duplication-exit-code.e2e.test.ts` (the real
  `harness cleanup -t duplication` process)
- `packages/cli/tests/mcp/tools/entropy-duplication.test.ts` (the real `detect_entropy` handler)

Both copy this directory to a `mkdtempSync` dir and scan THAT as `rootDir`.

## What is planted

| Unit                                            | Kind     | Tokens | Reported?                                   |
| ----------------------------------------------- | -------- | ------ | ------------------------------------------- |
| `totalAlpha` / `accumulateBeta` / `reduceGamma` | function | 83     | **yes** — one class, 3 members, rank 249    |
| `bumpSolo` (`src/solo.ts`)                      | function | < 40   | no — counted in `stats.unitsBelowMinTokens` |

The three members differ **only** in the function name, the parameter name, the local
identifier names and the interface name. Normalization erases all of those, which is what makes
this a Type-2 (not a copy-paste) test — spec decision D1.

## Measured, not estimated

Run at execution time against `packages/core/dist/index.js`'s `EntropyAnalyzer` with
`analyze: { drift: false, deadCode: false, patterns: false, duplication: true }` and
`DEFAULT_DUPLICATION_CONFIG` otherwise, from a temp-dir copy:

```
filesScanned 5, filesIgnored 0, filesSkipped 0
unitsFingerprinted 3, unitsBelowMinTokens 1
classesReported 1, classesSuppressed 0, classesTruncated 0, collisionsObserved 0
class: 3 members / 83 tokens / rank 249 / fingerprint 22b275978510fe10
        totalAlpha (src/alpha.ts), accumulateBeta (src/beta.ts), reduceGamma (src/gamma.ts)
EntropyReport.summary.totalIssues 1  (core's own summary counts the class;
                                      the CLI's CleanupResult.totalIssues does NOT — ADR 0134)
```

Override arms, same driver:

```
duplication: { minInstances: 4 } -> classesReported 0, classesSuppressed 1
duplication: { minTokens: 200 }  -> classesReported 0, unitsBelowMinTokens 4
```

## Two traps this fixture sits in

1. **`entryPoints` is required.** Without `entropy.entryPoints`, `buildSnapshot` returns
   `Err ENTRY_POINT_NOT_FOUND` and no detector runs at all (Phase 2 decision P9, measured).
   `src/index.ts` re-exports all four modules so every file is reachable.

2. **`DEFAULT_DUPLICATION_CONFIG.ignorePatterns` contains `**/fixtures/**`**, and this fixture
   lives under `packages/cli/tests/fixtures/`. The patterns are matched against the path
   **relative to the scanned `rootDir`**, so scanning a temp-dir COPY yields `src/alpha.ts` and
   the ignore does not fire (`filesIgnored: 0` above). Scanning this directory in place inside
   the repo would ignore all of it. Both consumers copy first, deliberately.

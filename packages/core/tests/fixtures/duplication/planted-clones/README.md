# Fixture: planted clone classes

Consumed by `packages/core/tests/duplication/acceptance.test.ts` (spec success criterion 15).
Every class below is planted deliberately; token counts are measured, not estimated.

| Class | Members                                       | Kind     | Tokens | Rank | Qualifies at minInstances 3 / minTokens 40?                                               |
| ----- | --------------------------------------------- | -------- | ------ | ---- | ----------------------------------------------------------------------------------------- |
| D     | `src/generated/gen-{a,b,c}.ts`                | function | 87     | 261  | **yes** when `ignorePatterns: []`; absent under `['**/generated/**']`                     |
| A     | `src/alpha.ts`, `src/beta.ts`, `src/gamma.ts` | function | 83     | 249  | **yes** — reported                                                                        |
| B     | `src/pair-one.ts`, `src/pair-two.ts`          | function | 85     | 170  | no — 2 members, counted in `classesSuppressed`                                            |
| C     | `src/short-{one,two,three}.ts`                | function | 16     | 48   | no — 16 < `minTokens`, so its 3 units never group (see below)                             |
| —     | `src/unique.ts`                               | function | 139    | —    | no — singleton group; fingerprinted, counted in neither `classes` nor `classesSuppressed` |

Class A's three members differ **only** in the function name and the identifier names inside
the body, which is exactly the Type-2 property decision D1 relies on.

Class D is listed first because it **outranks** Class A (261 > 249). Class D's body is
structurally different from Class B's (`while`/`pop`/`break` rather than `for…of`), which is
load-bearing: literals and member names normalize away, so two bodies differing only in those
would share one fingerprint.

## `minTokens` is applied before grouping

A unit below `minTokens` is excluded from fingerprinting **before** any grouping, so it can never
form or join a clone class. Those units are counted in `stats.unitsBelowMinTokens`, never in
`stats.classesSuppressed` — that counter is only for classes that actually formed (≥ 2 members)
and were then dropped for falling below `minInstances`.

So at the defaults, Class C is **not** a suppressed class: it is three excluded units, and no
`aa4d181bced59cb4` group ever exists. Class B _is_ a suppressed class: it formed with 2 members
and was dropped by `minInstances: 3`. Hence `classesSuppressed: 1`, not 2.

Measured stats with `ignorePatterns: []` over the 14 paths discovered by
`**/*.{ts,tsx,js,jsx,mjs,cjs,md}`:

```
filesScanned: 12, filesSkipped: 0, unitsFingerprinted: 9, unitsBelowMinTokens: 3,
classesReported: 2, classesSuppressed: 1, classesTruncated: 0
```

The 3 excluded units are `src/short-{one,two,three}.ts` (16 tokens each); 12 extracted units
minus those 3 leaves 9 fingerprinted. `src/unique.ts` (139 tokens, fingerprint
`55151f0d9ab9afac`) **is** fingerprinted and forms a singleton group, which is counted nowhere —
neither in `classesReported` nor in `classesSuppressed`. That path exists in the fixture
deliberately: a group of exactly one `>= minTokens` unit is the "fingerprinted but not
duplication" case, and without `src/unique.ts` above the bar nothing here exercises it.

Further measured cases (all with `ignorePatterns: []` unless stated):

| Override                              | Reported classes          | Notable stats                                     |
| ------------------------------------- | ------------------------- | ------------------------------------------------- |
| none                                  | D (261), A (249)          | `units 9, below 3, suppressed 1`                  |
| `ignorePatterns: ['**/generated/**']` | A only                    | `scanned 9, units 6, below 3, suppressed 1`       |
| `minInstances: 2`                     | D (261), A (249), B (170) | `reported 3, suppressed 0`                        |
| `minTokens: 10`                       | D (261), A (249), C (48)  | `units 12, below 0, suppressed 1` (B still 2-mbr) |
| `maxClasses: 1`                       | D only                    | `reported 1, suppressed 1, truncated 1`           |

`src/notes.md` is present so the acceptance test can prove a non-source file is dropped
without being counted as scanned or skipped.

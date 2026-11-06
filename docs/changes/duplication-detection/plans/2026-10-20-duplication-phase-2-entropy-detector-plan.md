# Plan: Mechanical Duplication Detection — Phase 2 (Entropy detector and registration)

**Date:** 2026-10-20
**Spec:** `docs/changes/duplication-detection/proposal.md` (section "### Phase 2: Entropy detector and registration")
**Session:** `changes--duplication-detection--proposal`
**Worktree:** `/Users/cwarner/Projects/iv/hd-dry-concept` (branch `brainstorm/dry-refactoring-concept`, base `e30c950b0`)
**Rigor:** standard
**Tasks:** 13
**Time:** ~48 min
**Checkpoints:** 3
**Integration Tier:** medium

---

## Goal

`EntropyConfig.analyze.duplication` turns on a `detectDuplication` detector that publishes clone
classes, the `byMember` seam, and per-file skip evidence onto `EntropyReport.duplication` — with
discovery driven solely by `EntropyConfig.include`/`exclude`, advisory severity only, and the
`<10s` performance bar met.

## Scope Boundary (what this plan deliberately excludes)

| Excluded                                                                                 | Owner                       |
| ---------------------------------------------------------------------------------------- | --------------------------- |
| `CleanupType` / `harness cleanup -t duplication`, `detect_entropy` MCP type enum         | Phase 3                     |
| `pnpm run generate-docs` (`docs/reference/cli-commands.md`, `mcp-tools.md`)              | Phase 3                     |
| Top-20 precision audit (criterion 2) as `[checkpoint:human-verify]`                      | Phase 3 (spec says so)      |
| `harness-refactoring/SKILL.md` DRY use-case repoint (names a CLI flag that is Phase 3's) | Phase 3                     |
| Knowledge-graph concept nodes (`partial-extraction`, `CloneClass`)                       | Phase 3                     |
| `partial-extraction` derivation, `sharedImport` population, its rank boost               | Phase 4                     |
| `BuildPromptInput` / `CritiqueInput` `siblings?`, the extractor-agreement test           | Phase 5                     |
| Barrel registration (`DIR_COMMENTS.duplication`, `generate:barrels`)                     | **Already done in Phase 1** |
| `EntropyConfigSchema` (zod) entry for `analyze.duplication`                              | Dropped — see Decision P6   |
| Bounded-concurrency file processing                                                      | Dropped — see Decision P5   |

Phase 2 still sets `signal: 'duplicate'` on every class and leaves `sharedImport` unset; the
fields exist on the type but carry no derivation until Phase 4.

---

## Phase 1's public surface — the binding contract

Everything below was read at `e30c950b0`, not recalled. Phase 2 binds to it and changes **one**
file inside `packages/core/src/duplication/` (`tokens.ts`, Task 8) plus one fixture (Task 10).

| Symbol                       | Shape (verbatim)                                                                                                                                                                                                                    |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `buildCloneIndex`            | `(files: readonly string[], options?: BuildCloneIndexOptions) => Promise<Result<CloneIndex, EntropyError>>`                                                                                                                         |
| `BuildCloneIndexOptions`     | `Partial<DuplicationConfig> & { rootDir?: string }` — `rootDir` defaults to `process.cwd()`                                                                                                                                         |
| `files`                      | **ABSOLUTE** paths. Discovery is the caller's job — Phase 2's job (`index.ts:644`)                                                                                                                                                  |
| `CloneIndex`                 | `{ classes, byMember, skipped, collisions, stats }`                                                                                                                                                                                 |
| `CloneIndex['stats']`        | 11 fields: `filesScanned`, `filesIgnored`, `filesSkipped`, `skippedTruncated`, `unitsFingerprinted`, `unitsBelowMinTokens`, `classesReported`, `classesSuppressed`, `classesTruncated`, `collisionsObserved`, `collisionsTruncated` |
| `SkippedFile`                | `{ file, reason: FileSkipReason, message, errorName, originalError }`                                                                                                                                                               |
| `FileSkipReason`             | `'unreadable' \| 'unparseable' \| 'unextractable' \| 'internal-error'`                                                                                                                                                              |
| `DuplicationConfig`          | EXACTLY four fields: `minTokens` 40, `minInstances` 3, `ignorePatterns` readonly, `maxClasses` 100                                                                                                                                  |
| `DEFAULT_DUPLICATION_CONFIG` | **deep-frozen** (object AND its `ignorePatterns` array) — a consumer mutation THROWS                                                                                                                                                |
| `MAX_EVIDENCE_ENTRIES`       | `100`. Caps `skipped` and `collisions`. Deliberately **not** a `DuplicationConfig` field                                                                                                                                            |
| Err path 1                   | `code: 'INVALID_CONFIG'`, `details.reason: 'zero-files-discovered'`                                                                                                                                                                 |
| Err path 2                   | `code: 'PARSE_ERROR'`, `details.reason: 'all-files-skipped'`                                                                                                                                                                        |

> **`code` IS NOT A DISCRIMINATOR.** `PARSE_ERROR` is shared across `'all-files-skipped'`, the four
> per-file skip reasons this plan introduces, and unrelated entropy modules. **Every consumer
> switches on `details.reason`, never on `code`.** This is restated in `index.ts:627` and is a hard
> rule for the detector and every test in this plan.

Default `ignorePatterns` (read at `index.ts:263-285`) include `**/tests/**`, `**/fixtures/**`,
`**/generated/**`, `**/dist/**`, `**/*.test.*`, `**/*.spec.*`, `**/*.bench.ts`. They deliberately
do **not** include `index.*`.

---

## Measurements — provenance labelled, all re-verified at `e30c950b0`

Every figure the brief handed me was re-run in this worktree at `e30c950b0`. **All of them
reproduced exactly.** Scripts live in the session scratchpad; each scope is written down, because a
figure without a scope is not a measurement.

### Scope A — the spec's "measured scope"

`findFiles('**/*.{ts,tsx,js,jsx,mjs,cjs}', '<repo>/packages')`, `rootDir` = repo root,
`DEFAULT_DUPLICATION_CONFIG`.

| Figure                     | Brief's claim | Re-measured at `e30c950b0` | Verdict    |
| -------------------------- | ------------- | -------------------------- | ---------- |
| candidate paths            | —             | 4,123                      | new        |
| `filesScanned`             | 2,063         | **2,063**                  | reproduced |
| `filesIgnored`             | —             | 2,060                      | new        |
| extracted units            | 13,394        | **13,394** (8,165 + 5,229) | reproduced |
| `unitsFingerprinted`       | 8,165         | **8,165**                  | reproduced |
| `classesReported`          | 58            | **58**                     | reproduced |
| `classesSuppressed`        | 161           | **161**                    | reproduced |
| `filesSkipped`             | 0             | **0**                      | reproduced |
| `collisionsObserved`       | 0             | **0**                      | reproduced |
| `byMember.size` == members | 230 == 230    | **230 == 230**             | reproduced |
| `<anon>` reported members  | 17            | **17**                     | reproduced |
| `buildCloneIndex` wall     | 2.2–2.3s      | **2,278 ms**               | reproduced |

### Scope B — criterion 6's scope (what the detector will actually see)

This repo's **non-test TS/JS sources**: `include` = the six TS/JS globs, `exclude` =
`skipDirGlobs() + ['**/*.test.ts','**/*.spec.ts']`, `rootDir` = repo root, default duplication
config. This is the scope criterion 6 names, and it is **not** Scope A.

| Figure                        | Value                                      |
| ----------------------------- | ------------------------------------------ |
| candidate paths               | 2,385                                      |
| `filesScanned`                | 2,151                                      |
| `filesIgnored`                | 234                                        |
| `unitsFingerprinted`          | 9,705                                      |
| `unitsBelowMinTokens`         | 7,351                                      |
| `classesReported`             | **98**                                     |
| `classesSuppressed`           | 174                                        |
| `filesSkipped` / `collisions` | 0 / 0                                      |
| **`detectDuplication` wall**  | **2,946 / 3,107 ms** (two runs, prototype) |

> **Published with its scope, and it differs from the brief's figure because the SCOPE differs, not
> because anything regressed.** 98 classes over 2,151 files at criterion-6 scope vs 58 over 2,063 at
> Scope A. Scope B includes the repo root's `scripts/`, `*.config.mts`, `.changeset` tooling and
> every non-`packages/` TS/JS file; Scope A is `packages/` only. Both are correct for their scope.
> Task 9 re-measures Scope B against the shipped detector; **no test asserts either class count**
> (criterion 10).

### Scope C — the `normalizeTokens` rescan (the carried-forward perf item)

`packages/orchestrator/src/orchestrator.ts`: **221 units over 22,648 tokens** — reproduced
verbatim. Prototyped the binary-search replacement and measured it directly:

| Measurement                                               | Value                                          |
| --------------------------------------------------------- | ---------------------------------------------- |
| Stream equivalence, all 221 units of the worst file       | **0 mismatches**                               |
| Worst file, 20 full passes — current `for…of` rescan      | **189 ms**                                     |
| Worst file, 20 full passes — binary search + bounded walk | **12 ms** (15.75x)                             |
| Scope B whole-index wall, before                          | 2,727 ms (warm run 2)                          |
| Scope B whole-index wall, after                           | **2,324 ms** (warm run 2) — **~15% / ~400 ms** |
| Scope A whole-index wall, before → after                  | 2,278 → 2,212 ms (~3%)                         |
| Scope A stats, after                                      | **identical** (58 / 8,165 / 230 / 161 / 0 / 0) |
| Scope B stats, after                                      | **identical** (98 / 9,705 / 174 / 0 / 0)       |

### Scope D — the read/parse split (why bounded concurrency is dropped)

Same 2,151 eligible files as Scope B, timed separately:

| Stage                                  | Wall         |
| -------------------------------------- | ------------ |
| Sequential `readFile` over all 2,151   | **119 ms**   |
| Sequential `parse(...)` over all 2,151 | **1,820 ms** |

---

## Uncertainties

| #   | Class          | Statement                                                                                                                                                                                                                                                                        |
| --- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| U1  | **RESOLVED**   | Does the detector re-discover files or consume `snapshot.files`? **Resolved by measurement** → `snapshot.files` (Decision P1). Prototyped end to end.                                                                                                                            |
| U2  | **RESOLVED**   | Does the detector clear the `<10s` bar without the binary search? Yes (2.9–3.1s), but the fix is still required — see Decision P4.                                                                                                                                               |
| U3  | **RESOLVED**   | Does bounded concurrency help? No — Scope D measures reads at 119 ms of a 2,946 ms run against 1,820 ms of **synchronous** parse. Dropped (Decision P5).                                                                                                                         |
| U4  | **RESOLVED**   | Does adding 2 files to `packages/core/src/entropy/` trip `check-arch`'s `module-size`? **No.** Probed by adding two 150-line files and diffing the pinned issue list: byte-identical, 12 issues both runs.                                                                       |
| U5  | **RESOLVED**   | Does `entropy/types/config.ts` importing `DuplicationConfig` from `../../duplication` trip `check-deps` or the arch gates? **No.** Probed with the real import + build: `check-deps` green (2,661 modules / 10 layers), pinned `check-arch` issue list byte-identical.           |
| U6  | **RESOLVED**   | Will the analyzer wiring push a function over the complexity bar? **No.** The arch complexity collector measures **per block, not per function** (`analyze()` is not flagged at all; the file's max block is 5, and the warn bar is `floor(15*0.7)` = 10).                       |
| U7  | **ASSUMPTION** | `EntropyReport.summary.totalIssues` is the honest home for the clone-class count, and `summary.errors`/`.warnings` must stay untouched (D4, advisory-first). Decided as P3; if a reviewer wants duplication out of `totalIssues` entirely, only Task 6 step 5 and Task 7 change. |
| U8  | **ASSUMPTION** | The ADR for D2/D3/D4 belongs in Phase 2 (the phase where those decisions become operative in the pipeline). The Phase-1 plan deferred it to "Phase 2/3". Carried as a `[checkpoint:decision]` in Task 11 so it is cuttable in one line.                                          |
| U9  | **DEFERRABLE** | Exact wording of the four skip-advice strings. Any accurate phrasing passes; the test asserts `details.reason`, never the prose.                                                                                                                                                 |
| U10 | **DEFERRABLE** | Whether criterion 6 also deserves a `harness perf bench` baseline alongside the vitest assertion. `[checkpoint:decision]` in Task 9, with a recommendation.                                                                                                                      |

---

## Observable Truths (Acceptance Criteria)

Phase 2 owns spec criteria **7, 12, 13, 14** outright, inherits **6**, **9**, **10** and **11**, and
carries **15** forward one level (from `buildCloneIndex` to `EntropyConfig`). EARS phrasing:

1. **(Criterion 7, unwanted)** If `analyze.duplication` is absent or `false`, then the system shall
   not call `detectDuplication` at all, shall read and parse no file for duplication, and
   `EntropyReport.duplication` shall be `undefined`.
   _Verified by:_ `tests/entropy/analyzer.duplication.test.ts` — a `vi.mock` spy whose **call count
   is asserted to be 0**, not merely `report.duplication === undefined`.

2. **(Criterion 15 at the entropy level, event-driven)** When `EntropyConfig.exclude` removes a
   directory, the system shall drop the clone classes composed of that directory's files, with the
   duplication config's own `ignorePatterns` set to `[]` — proving discovery is driven by
   `include`/`exclude` and by nothing in the detector.
   _Verified by:_ `tests/entropy/analyzer.duplication.test.ts` — **measured**: 12 snapshot files →
   2 classes; `exclude: ['**/generated/**']` → 9 files → 1 class.

3. **(Criterion 12, event-driven)** When a source file that reached the detector cannot be read or
   fails to parse, the system shall skip it, increment `stats.filesSkipped`, surface one
   `AnalysisError` with `analyzer: 'duplication'` whose `error.details.reason` is the
   `FileSkipReason`, and complete the run successfully with its report published.
   _Verified by:_ `tests/entropy/detectors/duplication.test.ts` (detector level — **prototyped**:
   1 missing path yields `skipErrors.length === 1`, `details.reason === 'unreadable'`,
   `filesSkipped 1 / filesScanned 1`, `result.ok === true`) and
   `analyzer.duplication.test.ts` (analyzer level, the `analyzer: 'duplication'` tag).

4. **(Criterion 13, event-driven)** When more than `maxClasses` classes qualify, the system shall
   report the top `maxClasses` by `rank` and carry the dropped count in `stats.classesTruncated`
   through `DuplicationReport`.
   _Verified by:_ `tests/entropy/detectors/duplication.test.ts`.

5. **(Criterion 14, unwanted)** If zero eligible source files reach the detector, then the system
   shall return `Err` with `details.reason: 'zero-files-discovered'` and shall **not** publish a
   `DuplicationReport` of zero classes; the analyzer shall record it as an `AnalysisError` with
   `analyzer: 'duplication'` and leave `EntropyReport.duplication` `undefined`.
   _Verified by:_ both test files. **Prototyped:** `INVALID_CONFIG` / `zero-files-discovered`.

6. **(Criterion 6, state-driven / NFR)** While scanning this repository's non-test TS/JS sources,
   `detectDuplication` shall complete in under 10 seconds.
   _Verified by:_ `tests/entropy/detectors/duplication.perf.test.ts`. **Measured at plan time:
   2,946 / 3,107 ms over 2,385 candidate paths (Scope B) without the Task-8 fix; 2,324 ms with it.**

7. **(D4, unwanted)** If duplication classes are reported, then the system shall add **zero** to
   `EntropyReport.summary.errors` and **zero** to `summary.warnings`. `DuplicationReport.stats`
   shall carry no `errorCount` and no `warningCount` — the absence is the mechanism, not a
   convention.
   _Verified by:_ `tests/entropy/analyzer.duplication.test.ts`.

8. **(Criterion 9, ubiquitous)** The system shall leave every existing detector's output
   unchanged: an `EntropyReport` produced with `analyze.duplication` enabled shall carry
   byte-identical `drift`, `deadCode`, `patterns`, `complexity`, `coupling` and `sizeBudget`
   reports to one produced with it disabled.
   _Verified by:_ `tests/entropy/analyzer.duplication.test.ts` (a `JSON.stringify` comparison of
   the sibling report slices across two runs over the same fixture).

9. **(Criterion 11 extended, ubiquitous)** The system shall export `detectDuplication` and the
   `DuplicationReport` type from `@harness-engineering/core`, and `buildCloneIndex` /
   `CloneClass` / `CloneMember` / `CloneIndex` / `CloneUnitKind` / `DuplicationConfig` shall remain
   importable from it — i.e. adding `DuplicationReport` shall not create an ambiguous star-export
   that silently drops `DuplicationConfig`.
   _Verified by:_ `tests/entropy/detectors/duplication-registration.test.ts` +
   `node scripts/generate-core-barrel.mjs --check`.

10. **(Task 8, ubiquitous)** `normalizeTokens` shall produce a stream identical to the current
    implementation's for every unit of a shared fixture **and** for every unit of the repo's
    worst-case file. **Measured: 0 mismatches over 221 units; identical index stats at both
    Scope A and Scope B.**

11. **(Task 10, state-driven)** While the planted-clones fixture is scanned at the default config,
    `src/unique.ts` shall be fingerprinted (not excluded) and shall appear in neither `classes` nor
    `classesSuppressed` — restoring the `>= minTokens` singleton-group coverage Phase 1 lost.
    **Measured** with the replacement fixture: `unitsFingerprinted 9`, `unitsBelowMinTokens 3`,
    `classesReported 2`, `classesSuppressed 1`, `unique.ts` in no class.

12. **(Criterion 10, unwanted)** If a test asserts a class count, then it shall be a controlled
    fixture's known planted set — **no test shall assert the clone-class count of a scan of this
    repository** (neither 58 nor 98 appears as an expected value anywhere).

13. **(Ubiquitous)** `node packages/cli/dist/bin/harness.js check-deps` shall stay green;
    `npx eslint` shall report zero problems on every file this plan creates;
    `pnpm exec turbo run typecheck --filter=@harness-engineering/core` shall pass;
    `npx vitest run` in `packages/core` shall not regress the 501-file / 5,889-test baseline.

---

## NFR Targets

Elicited from the spec rather than from a fresh interview, because the spec already fixes them and
re-asking would invite a different answer than the one that was approved.

| Dimension       | Target (EARS)                                                                                                                                                      | Task | Verifying command                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- | ----------------------------------------------------------------- |
| **Performance** | While scanning this repository's non-test TS/JS sources, `detectDuplication` shall complete in under 10 s (criterion 6).                                           | 9    | `npx vitest run tests/entropy/detectors/duplication.perf.test.ts` |
| **Performance** | The system shall not rescan a file's whole token array per unit: `normalizeTokens` shall locate its range by binary search over the range-sorted `program.tokens`. | 8    | `npx vitest run tests/duplication` + the Scope-C bench            |
| **Scalability** | _Skipped._ Criterion 6's 10 s bar over 2,151 real files IS the load target; a synthetic load benchmark would measure a smaller thing less honestly.                | —    | —                                                                 |
| **Security**    | _Skipped._ Phase 2 adds no untrusted-input surface: it reads files the entropy pipeline already discovered, through Phase 1 code `check-security` already covers.  | —    | `harness check-security` at its configured floor                  |
| **Resilience**  | If a file that reached the detector cannot be read or parsed, then the run shall degrade to a partial scan with evidence rather than fail (criterion 12).          | 4, 7 | `npx vitest run tests/entropy/detectors/duplication.test.ts`      |

---

## Gating truths — baked into every verification step

These are facts about this worktree measured at `e30c950b0`. **A task that reports a pass over any
of them is lying.**

| Gate                                   | Steady state here                                                                                             | How to gate on it                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `harness validate`                     | **exit 1, 462 issues** (re-measured; roadmap hygiene, ADR collisions, design-token drift)                     | **BASELINE COMPARISON ONLY.** Not a per-task gate. Gate: the count has not risen above 462 and no issue names a `packages/core/src/entropy/**`, `packages/core/src/duplication/**` or `packages/core/tests/**` path. **Never report "validate passed".**                                                                                                                                                                                                 |
| `harness check-arch`                   | **exit 1, 12 pre-existing threshold violations**                                                              | Gate on the **issue-list diff** under `HARNESS_ARCH_BASE_REF=c83ec3620` (this branch's fork point). **Do NOT gate on the exit code**, and specifically **never** `check-arch \| tail …; echo $?` — that reports `tail`'s 0, not the command's 1. Unpinned runs show 3 phantom "new" findings in `cli/src/drift/index.ts` and `cli/src/brand/index.ts` because `resolveArchBaseline` reads `git show origin/main:…` and `origin/main` is 7 commits ahead. |
| `harness check-deps`                   | **green** — 2,661 modules, 10 layers                                                                          | **A real gate.** Must stay green.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `eslint` on new source                 | **clean**                                                                                                     | A real gate, **scoped to the files this plan creates**. `npx eslint packages/core/src/entropy packages/core/src/duplication` reports 1 **pre-existing** warning at `entropy/entry-points.test.ts:69:51` (`no-hardcoded-path-separator`), so the unscoped command cannot pass.                                                                                                                                                                            |
| `eslint` on `packages/core/tests/**`   | **fails pre-existingly** (core's tsconfig excludes tests)                                                     | Do not lint test files. **No tsc project includes test files, so type-level assertions in tests are decorative** — judge every test in this plan on its **runtime** assertions only (roadmap row `typecheck-test-files`).                                                                                                                                                                                                                                |
| `@harness-engineering/dashboard#build` | **fails pre-existingly**                                                                                      | Unrelated. Do not plan around it; build with `--filter=@harness-engineering/core...`.                                                                                                                                                                                                                                                                                                                                                                    |
| Pre-commit arch hook                   | reads `packages/*/dist`                                                                                       | `npx turbo build --filter=@harness-engineering/core...` **before every commit**. A stale `dist` produces a false REGRESSION. **Never `--no-verify`.**                                                                                                                                                                                                                                                                                                    |
| Test baseline that must not regress    | duplication **9 files / 163 tests**; full `packages/core` **501 files + 1 skipped / 5,889 tests + 1 skipped** | Both re-measured at `e30c950b0`.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `check:changesets`                     | **already satisfied** by the committed Phase-1 `.changeset/duplication-core-module.md` (`core: minor`)        | Task 12's changeset is for the **changelog**, not the gate. Say so; do not claim it unblocks a gate it does not.                                                                                                                                                                                                                                                                                                                                         |

### The 12 pre-existing `check-arch` findings (the diff baseline)

Captured with `HARNESS_ARCH_BASE_REF=c83ec3620`. Every one is `cyclomaticComplexity > 15`:

```
packages/orchestrator/src/orchestrator.ts                        — 17 in `if`
packages/orchestrator/src/agent/orchestrator-backend-factory.ts  — 20 in `if`
packages/orchestrator/src/agent/analysis-provider-factory.ts     — 17 in buildAnalysisProvider
packages/orchestrator/src/agent/analysis-env.ts                  — 19 in deriveAnalysisEnv
packages/local-models/src/capability/tool-calling.ts             — 17 in probeToolCalling
packages/core/src/comprehension/serialize.ts                     — 16 in parseProvenance
packages/cli/src/registry/freshness-checker.ts                   — 24 in `for`
packages/cli/src/output/formatter.ts                             — 20 in formatValidation
packages/cli/src/commands/knowledge-pipeline.ts                  — 17 in createKnowledgePipelineCommand
packages/core/src/review/ci/orchestrator.ts                      — 17 in runCiReview
packages/cli/src/commands/roadmap/triage.ts                      — 17 in `for`
packages/cli/src/commands/roadmap/triage-provider.ts             — 16 in `if`
```

> The collector reports **per block**, not per function, and its violation ids hash
> `(file, category, 'metric:function')` — **not the value** — so raising an already-flagged block's
> complexity creates no new finding, while a **new** block over `floor(15*0.7) = 10` does. Keep
> every new function's blocks at or below 10. The functions in this plan are all ≤ 4.

---

## Planning Decisions

| #   | Decision                                                                                                                      | Rationale (measured, not asserted)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | The detector discovers files as `snapshot.files.map(f => f.path)` — it does **not** re-glob                                   | Criterion 15 demands discovery "driven solely by `EntropyConfig.include`/`exclude`"; `snapshot.files` **is** that set by construction, so there is no second code path to keep in sync and no layout assumption to make. It also honours the snapshot's test-file exclusion, which is exactly criterion 6's "non-test sources". Costs nothing: `findFiles` already returns absolute paths, which is `buildCloneIndex`'s input type. **Prototyped over the fixture and over the whole repo.** Fully D7-compliant — D7 forbids consuming `snapshot.files[].ast` (it is a lossy tree-sitter wrapper), not consuming the file **list**; `buildCloneIndex` still re-parses every file itself with estree. |
| P2  | Per-file skips travel on `DuplicationReport.skipErrors: EntropyError[]`; the **analyzer** tags them `analyzer: 'duplication'` | The spec'd signature returns `Result<DuplicationReport, EntropyError>`, which has no channel for N per-file errors; and `AnalysisError` is the analyzer's assembly type. Carrying bare `EntropyError`s avoids a `report.ts` ⇄ `duplication.ts` type cycle and puts the `analyzer` tag in exactly one place.                                                                                                                                                                                                                                                                                                                                                                                          |
| P3  | Clone classes count in `summary.totalIssues` and in **nothing else**                                                          | D4 (advisory, never fail-closed) means they must not touch `summary.errors`/`.warnings`. But a report saying "98 classes" beside `totalIssues: 0` is the "report a pass over something that is not clean" failure this repo refuses elsewhere (`cleanup.ts:88`). `totalIssues` is a count in core; the only exit-code gate on a value by that name is the **CLI's own** `cleanup.ts:150/230` field, which Phase 3 owns.                                                                                                                                                                                                                                                                              |
| P4  | The `normalizeTokens` binary search is **REQUIRED**, not optional                                                             | Three reasons, in order: (1) `buildCloneIndex`'s shipped JSDoc states the optimization "is deliberately deferred to **Phase 2**, where the `<10s` success criterion lives and can measure it" — not doing it means amending that record instead; (2) **measured** 15% / ~400 ms at Scope B and 15.75x on the worst file, output-equivalent (0/221 stream mismatches, identical stats at both scopes); (3) 2.9–3.1 s is 30% of the 10 s budget on an unloaded laptop, and the O(units × tokens) term grows with file size — the headroom is not just smaller than it looks, it is **less robust** to one pathological file.                                                                           |
| P5  | Bounded-concurrency file processing is **DROPPED**                                                                            | **Measured (Scope D):** reads are **119 ms** of a 2,946 ms run; `parse` is **1,820 ms** of _synchronous_ CPU work. An `await` loop cannot interleave synchronous parses, so the entire theoretical ceiling is the 119 ms of I/O — ~4%, and less in practice. Planning it would add concurrency bugs to buy nothing. Recorded here so the drop is a decision with evidence, not an omission.                                                                                                                                                                                                                                                                                                          |
| P6  | No `EntropyConfigSchema` (zod) entry for `analyze.duplication`                                                                | **Read at `config/schema.ts:105-117`:** the schema's `analyze` block already omits `complexity`, `coupling` **and** `sizeBudget` — three shipped analyzers. Grepped: `EntropyConfigSchema` is referenced only by `entropy/index.ts`, `config/index.ts` and its own test — **no runtime path validates an `EntropyConfig` through it**, so an entry would change nothing and omitting one cannot silently disable the detector. The **CLI's** separate `EntropyConfigSchema` (`packages/cli/src/config/schema.ts:100`) gates `harness.config.json` and belongs to Phase 3.                                                                                                                            |
| P7  | `entropy/types/duplication.ts` re-exports **nothing**; `entropy/index.ts` adds only `DuplicationReport`                       | The core barrel already does `export * from './duplication'` (`src/index.ts:89`). If entropy also exported `CloneClass`/`DuplicationConfig`, the barrel would hold two star-exports of one name — TypeScript resolves an ambiguous star-export by **silently dropping the name**, which would break criterion 11 with no error anywhere. The types are `import type`-only inside entropy.                                                                                                                                                                                                                                                                                                            |
| P8  | The criterion-6 test builds a **synthetic** snapshot (`{ files: [{path}], rootDir }`) over real repo paths                    | `detectDuplication` reads only `snapshot.files[].path` and `snapshot.rootDir`, so a real `buildSnapshot` would add minutes of tree-sitter parsing to a test that must time **the detector**. Precedent: `architecture/collectors/complexity.ts:8-26` builds exactly this synthetic snapshot for the same reason.                                                                                                                                                                                                                                                                                                                                                                                     |
| P9  | Analyzer-level tests pass explicit `entryPoints`                                                                              | **Measured:** `buildSnapshot` over `tests/fixtures/duplication/planted-clones` returns `Err ENTRY_POINT_NOT_FOUND` without them (the fixture has no `src/index.ts`). With `entryPoints: ['src/alpha.ts']` it builds 12 files and the detector reports 2 classes. Found by prototype, not at implementation time.                                                                                                                                                                                                                                                                                                                                                                                     |
| P10 | Task 10 (the fixture fix) is sequenced **before** the detector tests                                                          | Task 10 raises `src/unique.ts` from 23 to 139 tokens, which moves the fixture's `unitsFingerprinted` 8 → 9 and `unitsBelowMinTokens` 4 → 3. Any detector test written against the old fixture and asserting those two counters would break. Ordering it first removes the hazard; additionally **no test in this plan asserts those two counters at fixture scope** (member sets, `classesReported` and `filesScanned` are stable across the change — all five override cases re-measured).                                                                                                                                                                                                          |

---

## File Map

Complete. Nothing outside this list is created or modified.

```
CREATE packages/core/src/entropy/types/duplication.ts
MODIFY packages/core/src/entropy/types/index.ts            (add `export * from './duplication'`)
MODIFY packages/core/src/entropy/types/report.ts           ('duplication' in the AnalysisError union; EntropyReport.duplication?)
MODIFY packages/core/src/entropy/types/config.ts           (EntropyConfig.analyze.duplication?)
CREATE packages/core/src/entropy/detectors/duplication.ts
MODIFY packages/core/src/entropy/detectors/index.ts        (export detectDuplication)
MODIFY packages/core/src/entropy/index.ts                  (export detectDuplication + type DuplicationReport)
MODIFY packages/core/src/entropy/analyzer.ts               (the duplication block + summary + skipErrors splice)
MODIFY packages/core/src/duplication/tokens.ts             (binary-search normalizeTokens — the only Phase-1 source file touched)

CREATE packages/core/tests/entropy/detectors/duplication.test.ts
CREATE packages/core/tests/entropy/detectors/duplication-registration.test.ts
CREATE packages/core/tests/entropy/detectors/duplication.perf.test.ts
CREATE packages/core/tests/entropy/analyzer.duplication.test.ts
MODIFY packages/core/tests/duplication/tokens.test.ts      (normalizeTokens equivalence property)
MODIFY packages/core/tests/duplication/acceptance.test.ts  (SUB_MIN_TOKEN_UNITS 4 -> 3; the singleton assertion)
MODIFY packages/core/tests/fixtures/duplication/planted-clones/src/unique.ts
MODIFY packages/core/tests/fixtures/duplication/planted-clones/README.md

CREATE docs/knowledge/decisions/0134-whole-unit-type-2-clone-detection-at-rule-of-three.md
MODIFY AGENTS.md                                           (line 278, the entropy module description)
CREATE .changeset/duplication-entropy-detector.md
```

**Actual delta, recorded after execution.** "Complete. Nothing outside this list is created or
modified" was read as exhaustive, and it was not: Phase 2 committed **30 files**
(`584560437^..5083e7e3c`) — all 20 mapped above, plus 10 more:

- **8 comprehension shards** under `.harness/comprehension/` — regenerated by the pre-commit hook,
  not authored. Expected, and the kind of thing a File Map cannot usefully predict.
- **`.harness/arch/allowances/brainstorm-dry-refactoring-concept.json`** — unanticipated. Wiring
  entropy -> duplication raises the aggregate dependency-depth 654 -> 661, a real regression caused
  by the deliverable itself, accepted via `check-arch --update-baseline --reason` (which leaves
  `baselines.json` byte-identical and writes a reviewable per-branch allowance). VERIFY confirmed
  it is necessary — removing it makes the pre-commit gate exit 1 — and correctly scoped
  (`violationIds: []`, aggregate only).
- **`docs/changes/duplication-detection/proposal.md`** — two Phase-3 forward notes, on caller
  instruction mid-execution.

Every mapped entry was in fact touched, so the File Map under-counted rather than mis-predicted,
and the verification table's "`git diff --name-only` matches the File Map" row is the check that
should have caught it. The post-review gate-fix batch then re-touched 8 of those same source and
test files, and additionally edited this plan, the proposal (a new Verification notes section plus
two more Phase-3 forward notes) and ADR 0134.

## Skeleton

Task count is 13 (>= 8), so a skeleton pass applies at `standard` rigor.

```
1. Entropy types: DuplicationReport, the AnalysisError union member, the two config/report fields (~2 tasks, ~7 min)
2. The detector itself, TDD — happy path then failure behavior (~2 tasks, ~10 min)
3. Registration: detectors barrel, entropy barrel, importability (~1 task, ~4 min)
4. Analyzer wiring, TDD — enablement then the summary/AnalysisError invariants (~2 tasks, ~10 min)
5. NFR: the normalizeTokens binary search, then the criterion-6 timing test (~2 tasks, ~8 min)
6. Carried forward: restore the singleton-group fixture coverage (~1 task, ~4 min)
7. Integration: ADR, AGENTS.md + changeset, final gate verification (~3 tasks, ~12 min)
```

**Estimated total:** 13 tasks, ~48 min. _Skeleton approval: requested at plan sign-off (below),
not as a separate round-trip._

---

## Tasks

### Task 1: `DuplicationReport` type

**Depends on:** none | **Files:** `packages/core/src/entropy/types/duplication.ts`, `packages/core/src/entropy/types/index.ts` | **Owns:** `packages/core/src/entropy/types/duplication.ts`

1. Create `packages/core/src/entropy/types/duplication.ts` with exactly this content:

   ```ts
   // packages/core/src/entropy/types/duplication.ts
   import type { CloneClass, CloneIndex, FingerprintCollision } from '../../duplication';
   import type { EntropyError } from '../../shared/errors';

   /**
    * The duplication detector's report, published as `EntropyReport.duplication`.
    *
    * This module deliberately re-exports NOTHING. The core barrel already does
    * `export * from './duplication'` (`src/index.ts:89`), so re-exporting
    * `CloneClass` or `DuplicationConfig` here would put two star-exports of one
    * name on the barrel — and TypeScript resolves an ambiguous star-export by
    * SILENTLY DROPPING the name, which would break spec criterion 11 without an
    * error anywhere. The clone types are `import type`-only on purpose.
    */
   export interface DuplicationReport {
     /** Clone classes, rank-descending, capped at `maxClasses`. */
     classes: CloneClass[];
     /**
      * The O(1) `${file}:${startLine}` -> owning-class seam (spec goal 3).
      * Carried on the report rather than recomputed so Phase 5's `code-craft`
      * sibling lookup has somewhere to read it from.
      */
     byMember: Map<string, CloneClass>;
     /**
      * Length-differing digest collisions observed during the scan. A PARTIAL
      * record by construction: two colliding streams of EQUAL length agree on
      * `tokenCount`, group normally, and are invisible here.
      */
     collisions: FingerprintCollision[];
     /**
      * One `EntropyError` per `CloneIndex.skipped` entry, plus one summary entry
      * when `stats.skippedTruncated > 0`. The ANALYZER wraps each as an
      * `AnalysisError` with `analyzer: 'duplication'` — carrying bare errors here
      * keeps the `analyzer` tag in one place and avoids a type cycle with
      * `report.ts`.
      *
      * Every entry's `code` is `PARSE_ERROR`, which is NOT a discriminator:
      * switch on `details.reason` (a `FileSkipReason`, or `'skips-truncated'`).
      */
     skipErrors: EntropyError[];
     /**
      * `CloneIndex.stats` verbatim, plus the two advisory tallies every sibling
      * report carries.
      *
      * There is deliberately NO `errorCount` and NO `warningCount`: the
      * detector is advisory-first (spec decision D4, never fail-closed), and
      * their ABSENCE is the mechanism that keeps duplication out of
      * `EntropyReport.summary.errors` and `.warnings` — not a convention a
      * future edit can forget.
      */
     stats: CloneIndex['stats'] & {
       /** Always `classesReported`. The field siblings expose under this name. */
       violationCount: number;
       /** Always `classesReported`. Every class is advisory (D4). */
       infoCount: number;
     };
   }
   ```

2. Append to `packages/core/src/entropy/types/index.ts`, after the `export * from './size-budget';`
   line:

   ```ts
   export * from './duplication';
   ```

3. Verify the type resolves (this is the only available gate — the file declares no runtime value):

   ```
   pnpm exec turbo run typecheck --filter=@harness-engineering/core
   ```

4. Lint the new file (scoped — the unscoped entropy run carries a pre-existing warning):

   ```
   npx eslint packages/core/src/entropy/types/duplication.ts --max-warnings=0
   ```

5. Build, then commit:

   ```
   npx turbo build --filter=@harness-engineering/core...
   git add packages/core/src/entropy/types/duplication.ts packages/core/src/entropy/types/index.ts
   git commit -m "feat(entropy): add the DuplicationReport type"
   ```

---

### Task 2: the `AnalysisError` union member and the two config/report fields

**Depends on:** Task 1 | **Files:** `packages/core/src/entropy/types/report.ts`, `packages/core/src/entropy/types/config.ts` | **Owns:** `packages/core/src/entropy/types/report.ts`, `packages/core/src/entropy/types/config.ts`

The spec's Phase-2 section names this explicitly: `'duplication'` is **not** in the
`AnalysisError['analyzer']` union today (`entropy/types/report.ts:12`), and `CloneIndex.skipped`'s
shipped JSDoc already describes Phase 2 converting each skip into an `AnalysisError` with
`analyzer: 'duplication'` — so that binding does not typecheck until this task lands. Doing it
here means it is not discovered mid-Task-3 as a surprise type error.

1. In `packages/core/src/entropy/types/report.ts`, add the import beside the sibling report
   imports:

   ```ts
   import type { DuplicationReport } from './duplication';
   ```

2. Replace the `AnalysisError` interface:

   ```ts
   export interface AnalysisError {
     analyzer:
       | 'drift'
       | 'deadCode'
       | 'patterns'
       | 'complexity'
       | 'coupling'
       | 'sizeBudget'
       | 'duplication';
     error: EntropyError;
   }
   ```

3. In the same file, add the optional report field to `EntropyReport`, after `sizeBudget?:`:

   ```ts
     duplication?: DuplicationReport;
   ```

4. In `packages/core/src/entropy/types/config.ts`, add the import after the `PatternConfig` import:

   ```ts
   import type { DuplicationConfig } from '../../duplication';
   ```

   **Verified safe:** probed with this exact edit plus a full core build —
   `check-deps` stayed green (2,661 modules / 10 layers) and the pinned `check-arch` issue list was
   byte-identical (uncertainty U5).

5. In the same file, add the analyzer switch inside `EntropyConfig.analyze`, after `sizeBudget?:`:

   ```ts
     /**
      * Duplication (clone) detection. Absent or `false` means the detector is
      * never called and `EntropyReport.duplication` stays `undefined` — no file
      * is read or parsed for duplication (spec criterion 7).
      *
      * The two filters COMPOSE and are not the same thing:
      * `EntropyConfig.include` / `exclude` decide which files reach the detector
      * at all (they are what builds `snapshot.files`), while
      * `DuplicationConfig.ignorePatterns` is a second, duplication-specific
      * filter applied to whatever arrives. The duplication defaults already
      * ignore test, spec, bench, fixture, generated, node_modules, dist, build
      * and coverage paths — see `DEFAULT_DUPLICATION_CONFIG`. (The glob
      * literals are deliberately NOT spelled out here: each one contains the
      * sequence that would close this comment block.)
      */
     duplication?: boolean | Partial<DuplicationConfig>;
   ```

6. Verify and commit:

   ```
   pnpm exec turbo run typecheck --filter=@harness-engineering/core
   npx eslint packages/core/src/entropy/types/report.ts packages/core/src/entropy/types/config.ts --max-warnings=0
   npx turbo build --filter=@harness-engineering/core...
   git add packages/core/src/entropy/types/report.ts packages/core/src/entropy/types/config.ts
   git commit -m "feat(entropy): wire duplication into the entropy config and report types"
   ```

---

### Task 3: `detectDuplication` — the detector and its happy path

**Depends on:** Task 1, Task 2, Task 10 | **Files:** `packages/core/tests/entropy/detectors/duplication.test.ts`, `packages/core/src/entropy/detectors/duplication.ts` | **Owns:** `packages/core/src/entropy/detectors/duplication.ts`

> Depends on Task 10 by **Decision P10**: Task 10 changes the planted-clones fixture, and that must
> settle before any new test binds to it.

1. Create `packages/core/tests/entropy/detectors/duplication.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { join } from 'node:path';
   import { findFiles } from '../../../src/shared/fs-utils';
   import { detectDuplication } from '../../../src/entropy/detectors/duplication';
   import type { CodebaseSnapshot } from '../../../src/entropy/types';

   const PLANTED = join(__dirname, '../../fixtures/duplication/planted-clones');

   /**
    * The minimal snapshot `detectDuplication` actually reads: it consumes only
    * `files[].path` and `rootDir` (planning decision P1), then re-parses every
    * file itself with estree (spec decision D7). Building one directly keeps
    * these tests off `buildSnapshot`'s tree-sitter pass, which is both slow and
    * irrelevant to what is under test. Precedent:
    * `architecture/collectors/complexity.ts:8-26` does the same.
    */
   function snapshotOf(paths: string[], rootDir: string): CodebaseSnapshot {
     return {
       files: paths.map((path) => ({
         path,
         ast: { type: 'Program', body: null, language: 'typescript' },
         imports: [],
         exports: [],
         internalSymbols: [],
         jsDocComments: [],
       })),
       dependencyGraph: { nodes: [], edges: [] },
       exportMap: { byFile: new Map(), byName: new Map() },
       docs: [],
       codeReferences: [],
       entryPoints: [],
       rootDir,
       config: { rootDir, analyze: {} },
       buildTime: 0,
     } as unknown as CodebaseSnapshot;
   }

   /** Hoisted: the arch analyzer counts parameters by splitting on commas, so a
    *  brace-expansion glob in a default value reads as six extra parameters. */
   const INCLUDE = '**/*.{ts,tsx,js,jsx,mjs,cjs,md}';

   const CLASS_A = 'src/alpha.ts,src/beta.ts,src/gamma.ts';
   const CLASS_D = 'src/generated/gen-a.ts,src/generated/gen-b.ts,src/generated/gen-c.ts';

   function memberSets(classes: { members: { file: string }[] }[]): string[] {
     return classes
       .map((c) =>
         c.members
           .map((m) => m.file)
           .sort()
           .join(',')
       )
       .sort();
   }

   async function plantedSnapshot(): Promise<CodebaseSnapshot> {
     return snapshotOf(await findFiles(INCLUDE, PLANTED), PLANTED);
   }

   describe('detectDuplication over the planted-clones fixture', () => {
     it('publishes exactly the planted classes that meet both bars', async () => {
       const result = await detectDuplication(await plantedSnapshot(), { ignorePatterns: [] });
       expect(result.ok).toBe(true);
       if (!result.ok) return;
       expect(memberSets(result.value.classes)).toEqual([CLASS_A, CLASS_D].sort());
       expect(result.value.stats.classesReported).toBe(2);
     });

     it('carries the byMember seam keyed on `${file}:${startLine}`', async () => {
       const result = await detectDuplication(await plantedSnapshot(), { ignorePatterns: [] });
       if (!result.ok) throw new Error('expected ok');
       const index = result.value;
       // Derived, not hardcoded: every reported member must be reachable.
       const members = index.classes.flatMap((c) => c.members);
       expect(members.length).toBeGreaterThan(0);
       for (const member of members) {
         expect(index.byMember.get(`${member.file}:${member.startLine}`)).toBeDefined();
       }
       expect(index.byMember.size).toBe(members.length);
     });

     it('reports zero collisions and zero skips over a clean fixture', async () => {
       const result = await detectDuplication(await plantedSnapshot(), { ignorePatterns: [] });
       if (!result.ok) throw new Error('expected ok');
       expect(result.value.collisions).toEqual([]);
       expect(result.value.skipErrors).toEqual([]);
       expect(result.value.stats.filesSkipped).toBe(0);
       expect(result.value.stats.collisionsObserved).toBe(0);
     });

     it('threads the duplication config through to the index', async () => {
       const snapshot = await plantedSnapshot();
       const relaxed = await detectDuplication(snapshot, {
         ignorePatterns: [],
         minInstances: 2,
       });
       if (!relaxed.ok) throw new Error('expected ok');
       // Class B (2 members) surfaces only because minInstances was threaded.
       expect(memberSets(relaxed.value.classes)).toContain('src/pair-one.ts,src/pair-two.ts');
       expect(relaxed.value.stats.classesSuppressed).toBe(0);
     });

     it('reports the top class by rank and records the drop (criterion 13)', async () => {
       const result = await detectDuplication(await plantedSnapshot(), {
         ignorePatterns: [],
         maxClasses: 1,
       });
       if (!result.ok) throw new Error('expected ok');
       // Class D (87 tokens x 3 = 261) outranks Class A (83 x 3 = 249).
       expect(memberSets(result.value.classes)).toEqual([CLASS_D]);
       expect(result.value.stats.classesTruncated).toBe(1);
     });

     it('tallies every class as advisory and exposes no error or warning count (D4)', async () => {
       const result = await detectDuplication(await plantedSnapshot(), { ignorePatterns: [] });
       if (!result.ok) throw new Error('expected ok');
       const stats = result.value.stats;
       expect(stats.violationCount).toBe(stats.classesReported);
       expect(stats.infoCount).toBe(stats.classesReported);
       expect(stats).not.toHaveProperty('errorCount');
       expect(stats).not.toHaveProperty('warningCount');
     });

     it('applies the duplication ignorePatterns on top of what the snapshot delivered', async () => {
       // The snapshot carries all 12 source files; the duplication-specific
       // filter is what drops the generated class here.
       const result = await detectDuplication(await plantedSnapshot(), {
         ignorePatterns: ['**/generated/**'],
       });
       if (!result.ok) throw new Error('expected ok');
       expect(memberSets(result.value.classes)).toEqual([CLASS_A]);
       expect(result.value.stats.filesScanned).toBe(9);
     });
   });
   ```

2. Run it — observe failure (`Cannot find module '.../detectors/duplication'`):

   ```
   cd packages/core && npx vitest run tests/entropy/detectors/duplication.test.ts
   ```

3. Create `packages/core/src/entropy/detectors/duplication.ts`:

   ```ts
   import type { Result } from '../../shared/result';
   import { Ok, Err } from '../../shared/result';
   import { createEntropyError } from '../../shared/errors';
   import { buildCloneIndex } from '../../duplication';
   import type {
     CloneIndex,
     DuplicationConfig,
     FileSkipReason,
     SkippedFile,
   } from '../../duplication';
   import type { CodebaseSnapshot, DuplicationReport, EntropyError } from '../types';

   /**
    * Remediation advice keyed to the reason, not a fixed list.
    *
    * The first three reasons blame the FILE; `internal-error` blames our own
    * normalization or digest stage (or the runtime — a FIPS-mode Node where
    * `createHash('sha1')` throws). Advising "check file permissions" for that
    * last one is actively misleading, which is why the reason exists.
    */
   const SKIP_ADVICE: Record<FileSkipReason, string> = {
     unreadable: 'Check the file still exists and is readable by this process',
     unparseable: 'Check the file is valid TypeScript/JavaScript for its extension',
     unextractable: 'Report the AST shape: the file parsed but unit extraction failed on it',
     'internal-error':
       'Check the runtime rather than the file: normalization or the sha1 digest failed (e.g. FIPS-mode Node)',
   };

   /**
    * Convert one skipped file into an `EntropyError`.
    *
    * `details.reason` carries the `FileSkipReason` and is THE discriminator —
    * `code` is `PARSE_ERROR` for all four reasons and is also raised by
    * unrelated entropy modules, so no consumer may switch on it.
    */
   function skipToError(skipped: SkippedFile): EntropyError {
     return createEntropyError(
       'PARSE_ERROR',
       `Skipped ${skipped.file} during duplication analysis (${skipped.reason}: ${skipped.errorName}): ${skipped.message}`,
       { reason: skipped.reason, file: skipped.file, originalError: skipped.originalError },
       [SKIP_ADVICE[skipped.reason]]
     );
   }

   /**
    * One extra error when the index's skip evidence hit `MAX_EVIDENCE_ENTRIES`.
    *
    * `CloneIndex.skipped` is a capped SAMPLE while `stats.filesSkipped` is
    * exact, so emitting one `AnalysisError` per sampled entry and stopping would
    * under-report the damage by exactly `skippedTruncated` files. The counts stay
    * honest because this says so out loud.
    */
   function truncationToError(stats: CloneIndex['stats']): EntropyError {
     const reported = stats.filesSkipped - stats.skippedTruncated;
     return createEntropyError(
       'PARSE_ERROR',
       `${stats.filesSkipped} file(s) were skipped during duplication analysis; only the first ${reported} are reported individually and ${stats.skippedTruncated} are not.`,
       { reason: 'skips-truncated' },
       ['Fix the reported files and re-run to surface the remainder']
     );
   }

   /**
    * Detect duplicated whole units (functions, methods, classes) across the
    * snapshot's source files.
    *
    * Discovery is the snapshot's: `snapshot.files` IS the set
    * `EntropyConfig.include` / `exclude` resolved to, so this detector contains
    * no glob, no second discovery path, and no assumption about any
    * repository's layout (spec criterion 15). It re-parses each file itself via
    * `buildCloneIndex` rather than reading `snapshot.files[].ast`, because that
    * `AST` is a lossy `{ type, body: unknown, language }` wrapper and the parser
    * registry defaults to tree-sitter, so estree tokens would not survive the
    * snapshot (spec decision D7).
    *
    * A partial skip returns `Ok` with the skips on `skipErrors` — that is a scan
    * that happened with gaps. Zero eligible files, or a run where EVERY eligible
    * file was skipped, returns `Err`: at 100% skip the result is
    * indistinguishable from a clean scan, and reporting a pass over it is the
    * failure class the whole guard exists for.
    *
    * Severity is advisory only (spec decision D4) — see `DuplicationReport.stats`.
    */
   export async function detectDuplication(
     snapshot: CodebaseSnapshot,
     config: Partial<DuplicationConfig> = {}
   ): Promise<Result<DuplicationReport, EntropyError>> {
     const result = await buildCloneIndex(
       snapshot.files.map((file) => file.path),
       { ...config, rootDir: snapshot.rootDir }
     );
     if (!result.ok) return Err(result.error);

     const index = result.value;
     const skipErrors = index.skipped.map(skipToError);
     if (index.stats.skippedTruncated > 0) {
       skipErrors.push(truncationToError(index.stats));
     }

     return Ok({
       classes: index.classes,
       byMember: index.byMember,
       collisions: index.collisions,
       skipErrors,
       stats: {
         ...index.stats,
         violationCount: index.stats.classesReported,
         infoCount: index.stats.classesReported,
       },
     });
   }
   ```

4. Run the test — observe pass:

   ```
   cd packages/core && npx vitest run tests/entropy/detectors/duplication.test.ts
   ```

5. Lint and typecheck:

   ```
   npx eslint packages/core/src/entropy/detectors/duplication.ts --max-warnings=0
   pnpm exec turbo run typecheck --filter=@harness-engineering/core
   ```

6. Build, then commit:

   ```
   npx turbo build --filter=@harness-engineering/core...
   git add packages/core/src/entropy/detectors/duplication.ts packages/core/tests/entropy/detectors/duplication.test.ts
   git commit -m "feat(entropy): add the duplication detector"
   ```

---

### Task 4: the Failure-behavior contract — skips, truncation, and the two refusals

**Depends on:** Task 3 | **Files:** `packages/core/tests/entropy/detectors/duplication.test.ts`, `packages/core/src/entropy/detectors/duplication.ts` | **Owns:** `packages/core/tests/entropy/detectors/duplication.test.ts`

1. Append to `packages/core/tests/entropy/detectors/duplication.test.ts`:

   ```ts
   describe('detectDuplication failure behavior', () => {
     it('skips an unreadable file, records it, and still returns Ok (criterion 12)', async () => {
       const snapshot = snapshotOf(
         [join(PLANTED, 'src/alpha.ts'), join(PLANTED, 'src/does-not-exist.ts')],
         PLANTED
       );
       const result = await detectDuplication(snapshot, {
         ignorePatterns: [],
         minInstances: 1,
       });
       expect(result.ok).toBe(true);
       if (!result.ok) return;
       expect(result.value.stats.filesScanned).toBe(1);
       expect(result.value.stats.filesSkipped).toBe(1);
       expect(result.value.skipErrors).toHaveLength(1);
       const error = result.value.skipErrors[0]!;
       // `details.reason` is the discriminator; `code` is PARSE_ERROR for every
       // skip reason and for unrelated entropy failures, so it discriminates
       // nothing.
       expect(error.details.reason).toBe('unreadable');
       expect(error.details.file).toBe('src/does-not-exist.ts');
       expect(error.details.originalError).toBeInstanceOf(Error);
       expect(error.suggestions.length).toBeGreaterThan(0);
     });

     it('skips an unparseable file with reason `unparseable`', async () => {
       const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
       const { tmpdir } = await import('node:os');
       const root = await mkdtemp(join(tmpdir(), 'dup-detector-'));
       try {
         await writeFile(join(root, 'broken.ts'), 'export function (((( {', 'utf8');
         await writeFile(join(root, 'fine.ts'), 'export const ok = 1;\n', 'utf8');
         const result = await detectDuplication(
           snapshotOf([join(root, 'broken.ts'), join(root, 'fine.ts')], root),
           { ignorePatterns: [] }
         );
         expect(result.ok).toBe(true);
         if (!result.ok) return;
         expect(result.value.skipErrors).toHaveLength(1);
         expect(result.value.skipErrors[0]!.details.reason).toBe('unparseable');
         expect(result.value.stats.filesSkipped).toBe(1);
         expect(result.value.stats.filesScanned).toBe(1);
       } finally {
         await rm(root, { recursive: true, force: true });
       }
     });

     it('adds a truncation entry when skip evidence exceeds the evidence cap', async () => {
       const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
       const { tmpdir } = await import('node:os');
       const { MAX_EVIDENCE_ENTRIES } = await import('../../../src/duplication');
       const root = await mkdtemp(join(tmpdir(), 'dup-truncate-'));
       try {
         // One more broken file than the evidence cap, plus one good file so the
         // run is a PARTIAL skip (Ok) rather than an all-skip refusal.
         const broken = MAX_EVIDENCE_ENTRIES + 1;
         const paths: string[] = [];
         for (let i = 0; i < broken; i++) {
           const file = join(root, `broken-${i}.ts`);
           await writeFile(file, 'export function (((( {', 'utf8');
           paths.push(file);
         }
         const good = join(root, 'fine.ts');
         await writeFile(good, 'export const ok = 1;\n', 'utf8');
         paths.push(good);

         const result = await detectDuplication(snapshotOf(paths, root), {
           ignorePatterns: [],
         });
         expect(result.ok).toBe(true);
         if (!result.ok) return;
         expect(result.value.stats.filesSkipped).toBe(broken);
         expect(result.value.stats.skippedTruncated).toBe(broken - MAX_EVIDENCE_ENTRIES);
         // The capped sample, plus exactly one entry saying the sample is capped.
         expect(result.value.skipErrors).toHaveLength(MAX_EVIDENCE_ENTRIES + 1);
         const last = result.value.skipErrors[result.value.skipErrors.length - 1]!;
         expect(last.details.reason).toBe('skips-truncated');
         expect(last.message).toContain(String(broken));
       } finally {
         await rm(root, { recursive: true, force: true });
       }
     });

     it('refuses to report a pass over zero discovered files (criterion 14)', async () => {
       const result = await detectDuplication(snapshotOf([], PLANTED));
       expect(result.ok).toBe(false);
       if (result.ok) return;
       expect(result.error.details.reason).toBe('zero-files-discovered');
       expect(result.error.message).toMatch(/zero source files/i);
     });

     it('refuses to report a pass when every eligible file was skipped', async () => {
       const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
       const { tmpdir } = await import('node:os');
       const root = await mkdtemp(join(tmpdir(), 'dup-allskip-'));
       try {
         await writeFile(join(root, 'broken.ts'), 'export function (((( {', 'utf8');
         const result = await detectDuplication(snapshotOf([join(root, 'broken.ts')], root), {
           ignorePatterns: [],
         });
         expect(result.ok).toBe(false);
         if (result.ok) return;
         expect(result.error.details.reason).toBe('all-files-skipped');
       } finally {
         await rm(root, { recursive: true, force: true });
       }
     });

     it('drops an ineligible path into filesIgnored, counting it in neither scanned nor skipped', async () => {
       const paths = await findFiles(INCLUDE, PLANTED);
       expect(paths.some((p) => p.endsWith('notes.md'))).toBe(true);
       const result = await detectDuplication(snapshotOf(paths, PLANTED), {
         ignorePatterns: [],
       });
       if (!result.ok) throw new Error('expected ok');
       const stats = result.value.stats;
       expect(stats.filesIgnored).toBe(paths.length - stats.filesScanned - stats.filesSkipped);
       expect(stats.filesIgnored).toBeGreaterThan(0);
     });
   });
   ```

2. Run — the truncation case fails if step 1 of Task 3 shipped without `truncationToError`
   (it did ship with it, so expect this suite to pass on the first run; if it does not, the
   remedy is in `duplication.ts`, not in the test):

   ```
   cd packages/core && npx vitest run tests/entropy/detectors/duplication.test.ts
   ```

3. Run the whole entropy suite to prove nothing in it moved:

   ```
   cd packages/core && npx vitest run tests/entropy
   ```

4. Build, then commit:

   ```
   npx turbo build --filter=@harness-engineering/core...
   git add packages/core/tests/entropy/detectors/duplication.test.ts packages/core/src/entropy/detectors/duplication.ts
   git commit -m "test(entropy): cover the duplication detector's failure-behavior contract"
   ```

---

### Task 5: registration — the detectors barrel and the entropy barrel

**Depends on:** Task 3 | **Files:** `packages/core/src/entropy/detectors/index.ts`, `packages/core/src/entropy/index.ts`, `packages/core/tests/entropy/detectors/duplication-registration.test.ts` | **Owns:** `packages/core/src/entropy/detectors/index.ts`, `packages/core/src/entropy/index.ts` | **Category:** integration

1. Append to `packages/core/src/entropy/detectors/index.ts`:

   ```ts
   export { detectDuplication } from './duplication';
   ```

2. In `packages/core/src/entropy/index.ts`, add after the `detectSizeBudgetViolations` export line:

   ```ts
   export { detectDuplication } from './detectors/duplication';
   ```

   and add `DuplicationReport` to the trailing `export type { … } from './types';` list, after
   `SizeBudgetReport`.

   > **Add nothing else here.** `entropy/index.ts` is a CURATED list that the core barrel
   > star-exports. The core barrel already does `export * from './duplication'`
   > (`src/index.ts:89`), so adding `CloneClass` / `DuplicationConfig` / any clone type to this
   > list would give the barrel two star-exports of one name — and TypeScript resolves an ambiguous
   > star-export by silently dropping it, breaking criterion 11 with no error anywhere
   > (planning decision P7).

3. Create `packages/core/tests/entropy/detectors/duplication-registration.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';

   /**
    * Registration coverage for criterion 11, extended to Phase 2's surface.
    *
    * Imports the PACKAGE specifier, not the source barrel: a `dist` export
    * regression would stay invisible to `../../src/index`. (This mirrors the
    * choice `tests/duplication/barrel.test.ts` already made in Phase 1.)
    *
    * Every assertion is a RUNTIME one. No tsc project includes test files in this
    * repo, so a type-level assertion here would compile to nothing and prove
    * nothing (roadmap row `typecheck-test-files`).
    */
   describe('duplication exports from @harness-engineering/core', () => {
     it('exports detectDuplication', async () => {
       const core = await import('@harness-engineering/core');
       expect(typeof core.detectDuplication).toBe('function');
     });

     it('still exports Phase 1 surface — DuplicationConfig was not lost to an ambiguous star-export', async () => {
       const core = await import('@harness-engineering/core');
       expect(typeof core.buildCloneIndex).toBe('function');
       expect(typeof core.resolveDuplicationConfig).toBe('function');
       // The runtime witness for the DuplicationConfig TYPE: if the barrel had
       // started dropping names, this frozen default would go undefined.
       expect(core.DEFAULT_DUPLICATION_CONFIG).toBeDefined();
       expect(Object.isFrozen(core.DEFAULT_DUPLICATION_CONFIG)).toBe(true);
       expect(core.DEFAULT_DUPLICATION_CONFIG.minInstances).toBe(3);
       expect(core.MAX_EVIDENCE_ENTRIES).toBe(100);
     });

     it('exports detectDuplication from the entropy detectors barrel', async () => {
       const detectors = await import('../../../src/entropy/detectors/index');
       expect(typeof detectors.detectDuplication).toBe('function');
       // The six Phase-0 detectors are untouched (spec criterion 9).
       for (const name of [
         'detectDocDrift',
         'detectDeadCode',
         'detectPatternViolations',
         'detectComplexityViolations',
         'detectCouplingViolations',
         'detectSizeBudgetViolations',
       ]) {
         expect(typeof (detectors as Record<string, unknown>)[name]).toBe('function');
       }
     });
   });
   ```

4. Build (the package-specifier import resolves through `dist`), then run:

   ```
   npx turbo build --filter=@harness-engineering/core...
   cd packages/core && npx vitest run tests/entropy/detectors/duplication-registration.test.ts
   ```

5. Generated-artifact freshness and layering. The barrel needs **no** edit —
   `duplication` was registered in Phase 1 and `entropy` is already a star-exported directory — so
   `--check` must be green without a regeneration:

   ```
   node scripts/generate-core-barrel.mjs --check
   node packages/cli/dist/bin/harness.js check-deps
   ```

6. Commit:

   ```
   git add packages/core/src/entropy/detectors/index.ts packages/core/src/entropy/index.ts packages/core/tests/entropy/detectors/duplication-registration.test.ts
   git commit -m "feat(entropy): register detectDuplication on the entropy barrels"
   ```

---

### Task 6: analyzer wiring — the duplication block

**Depends on:** Task 2, Task 3 | **Files:** `packages/core/src/entropy/analyzer.ts`, `packages/core/tests/entropy/analyzer.duplication.test.ts` | **Owns:** `packages/core/src/entropy/analyzer.ts`

1. Create `packages/core/tests/entropy/analyzer.duplication.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { join } from 'node:path';
   import { EntropyAnalyzer } from '../../src/entropy/analyzer';
   import { TypeScriptParser } from '../../src/shared/parsers';

   const PLANTED = join(__dirname, '../fixtures/duplication/planted-clones');

   /**
    * `buildSnapshot` returns `Err ENTRY_POINT_NOT_FOUND` over this fixture
    * without explicit entry points — it has no `src/index.ts` (planning decision
    * P9). Measured, not guessed.
    */
   const ENTRY_POINTS = ['src/alpha.ts'];

   function analyzerFor(analyze: Record<string, unknown>, extra: Record<string, unknown> = {}) {
     return new EntropyAnalyzer({
       rootDir: PLANTED,
       parser: new TypeScriptParser(),
       entryPoints: ENTRY_POINTS,
       include: ['src/**/*.ts'],
       analyze,
       ...extra,
     } as never);
   }

   function memberSets(classes: { members: { file: string }[] }[]): string[] {
     return classes
       .map((c) =>
         c.members
           .map((m) => m.file)
           .sort()
           .join(',')
       )
       .sort();
   }

   const CLASS_A = 'src/alpha.ts,src/beta.ts,src/gamma.ts';
   const CLASS_D = 'src/generated/gen-a.ts,src/generated/gen-b.ts,src/generated/gen-c.ts';

   describe('EntropyAnalyzer duplication wiring', () => {
     it('publishes EntropyReport.duplication when analyze.duplication is an object config', async () => {
       const result = await analyzerFor({ duplication: { ignorePatterns: [] } }).analyze();
       expect(result.ok).toBe(true);
       if (!result.ok) return;
       expect(result.value.duplication).toBeDefined();
       expect(memberSets(result.value.duplication!.classes)).toEqual([CLASS_A, CLASS_D].sort());
       expect(result.value.analysisErrors).toEqual([]);
     });

     it('runs with `duplication: true` at the shipped defaults', async () => {
       const result = await analyzerFor({ duplication: true }).analyze();
       if (!result.ok) throw new Error('expected ok');
       // The defaults ignore `**/generated/**`, so Class D is filtered and only
       // Class A survives. The two filters compose; neither is the other.
       expect(memberSets(result.value.duplication!.classes)).toEqual([CLASS_A]);
     });

     it('drops a class when EntropyConfig.exclude removes its files (criterion 15)', async () => {
       // The duplication filter is EMPTY here, so the only thing that can drop
       // Class D is `EntropyConfig.exclude` — i.e. discovery is driven solely by
       // include/exclude, and no path in the detector assumes a layout.
       const result = await analyzerFor(
         { duplication: { ignorePatterns: [] } },
         { exclude: ['**/generated/**'] }
       ).analyze();
       if (!result.ok) throw new Error('expected ok');
       expect(memberSets(result.value.duplication!.classes)).toEqual([CLASS_A]);
       expect(result.value.snapshot.files).toHaveLength(9);
     });
   });
   ```

2. Run — observe failure (`result.value.duplication` is `undefined`):

   ```
   cd packages/core && npx vitest run tests/entropy/analyzer.duplication.test.ts
   ```

3. In `packages/core/src/entropy/analyzer.ts`, add the import beside the sibling detector imports
   (after the `detectSizeBudgetViolations` import):

   ```ts
   import { detectDuplication } from './detectors/duplication';
   ```

   and add `DuplicationReport` to the `import type { … } from './types';` list.

4. Insert this block immediately after the size-budget block (after the closing `}` that ends
   `if (this.config.analyze.sizeBudget) { … }`, before the `// Calculate summary` comment):

   ```ts
   // Duplication detection
   let duplicationReport: DuplicationReport | undefined;
   if (this.config.analyze.duplication) {
     const duplicationConfig =
       typeof this.config.analyze.duplication === 'object' ? this.config.analyze.duplication : {};
     const result = await detectDuplication(this.snapshot, duplicationConfig);
     if (result.ok) {
       duplicationReport = result.value;
       // A per-file skip is a finding ABOUT the scan, not a failure OF it:
       // the run succeeded with gaps, so each skip is surfaced as an
       // AnalysisError while the report is still published. The detector
       // hands back bare EntropyErrors; the `analyzer` tag is applied here,
       // in the one place that owns `analysisErrors`.
       for (const error of result.value.skipErrors) {
         analysisErrors.push({ analyzer: 'duplication', error });
       }
     } else {
       analysisErrors.push({ analyzer: 'duplication', error: result.error });
     }
   }
   ```

5. Extend the summary. Add, beside the sibling issue counts:

   ```ts
   // Advisory-only (spec decision D4): clone classes are counted in
   // totalIssues so the summary cannot report a clean run over 98 reported
   // classes, and are added to NEITHER `errors` NOR `warnings`. The
   // DuplicationReport carries no errorCount/warningCount for exactly this
   // reason, so there is nothing here to accidentally add.
   const duplicationIssues = duplicationReport?.stats.classesReported || 0;
   ```

   and add `duplicationIssues` as the last addend of the existing `totalIssues` sum. **Leave
   `errors:` and `warnings:` untouched.**

6. Attach the report alongside the sibling attachments at the end of `analyze()`:

   ```ts
   if (duplicationReport) {
     report.duplication = duplicationReport;
   }
   ```

7. Run — observe pass, then prove the rest of the analyzer did not move:

   ```
   cd packages/core && npx vitest run tests/entropy/analyzer.duplication.test.ts
   cd packages/core && npx vitest run tests/entropy
   ```

8. Lint, typecheck, build, commit:

   ```
   npx eslint packages/core/src/entropy/analyzer.ts --max-warnings=0
   pnpm exec turbo run typecheck --filter=@harness-engineering/core
   npx turbo build --filter=@harness-engineering/core...
   git add packages/core/src/entropy/analyzer.ts packages/core/tests/entropy/analyzer.duplication.test.ts
   git commit -m "feat(entropy): run the duplication detector from EntropyAnalyzer"
   ```

---

### Task 7: the analyzer invariants — criteria 7, 9, 14 and D4

**Depends on:** Task 6 | **Files:** `packages/core/tests/entropy/analyzer.duplication.test.ts`, `packages/core/src/entropy/analyzer.ts` | **Owns:** `packages/core/tests/entropy/analyzer.duplication.test.ts`

1. Append to `packages/core/tests/entropy/analyzer.duplication.test.ts`. Note the `vi.mock` call
   must be hoisted to the top of the file (vitest hoists `vi.mock`, so place the factory with the
   imports and the `vi.mocked` reads inside the tests):

   ```ts
   // --- add to the import block at the top of the file ---
   // import { describe, it, expect, vi, beforeEach } from 'vitest';
   // import { detectDuplication } from '../../src/entropy/detectors/duplication';
   //
   // vi.mock('../../src/entropy/detectors/duplication', async (importOriginal) => {
   //   const actual = await importOriginal<
   //     typeof import('../../src/entropy/detectors/duplication')
   //   >();
   //   return { ...actual, detectDuplication: vi.fn(actual.detectDuplication) };
   // });

   describe('EntropyAnalyzer duplication invariants', () => {
     beforeEach(() => {
       vi.mocked(detectDuplication).mockClear();
     });

     it('does not call the detector at all when analyze.duplication is absent (criterion 7)', async () => {
       const result = await analyzerFor({ drift: true }).analyze();
       expect(result.ok).toBe(true);
       if (!result.ok) return;
       expect(result.value.duplication).toBeUndefined();
       // The load-bearing assertion: "shall not parse for duplication" is a
       // claim about work NOT done, which `undefined` alone does not prove.
       expect(vi.mocked(detectDuplication)).not.toHaveBeenCalled();
     });

     it('does not call the detector when analyze.duplication is false (criterion 7)', async () => {
       const result = await analyzerFor({ drift: true, duplication: false }).analyze();
       if (!result.ok) throw new Error('expected ok');
       expect(result.value.duplication).toBeUndefined();
       expect(vi.mocked(detectDuplication)).not.toHaveBeenCalled();
     });

     it('calls the detector exactly once when enabled', async () => {
       const result = await analyzerFor({ duplication: { ignorePatterns: [] } }).analyze();
       if (!result.ok) throw new Error('expected ok');
       expect(vi.mocked(detectDuplication)).toHaveBeenCalledTimes(1);
     });

     it('counts clone classes in totalIssues and in neither errors nor warnings (D4)', async () => {
       const off = await analyzerFor({ duplication: false }).analyze();
       const on = await analyzerFor({ duplication: { ignorePatterns: [] } }).analyze();
       if (!off.ok || !on.ok) throw new Error('expected ok');
       const reported = on.value.duplication!.stats.classesReported;
       expect(reported).toBeGreaterThan(0);
       // Derived from the measured class count, not a hardcoded literal.
       expect(on.value.summary.totalIssues - off.value.summary.totalIssues).toBe(reported);
       expect(on.value.summary.errors).toBe(off.value.summary.errors);
       expect(on.value.summary.warnings).toBe(off.value.summary.warnings);
     });

     it('leaves every sibling detector report unchanged (criterion 9)', async () => {
       const siblings = {
         drift: true,
         deadCode: true,
         patterns: { patterns: [] },
         complexity: {},
         coupling: {},
         sizeBudget: {},
       };
       const off = await analyzerFor({ ...siblings }).analyze();
       const on = await analyzerFor({ ...siblings, duplication: { ignorePatterns: [] } }).analyze();
       if (!off.ok || !on.ok) throw new Error('expected ok');
       for (const key of [
         'drift',
         'deadCode',
         'patterns',
         'complexity',
         'coupling',
         'sizeBudget',
       ] as const) {
         expect(JSON.stringify(on.value[key])).toBe(JSON.stringify(off.value[key]));
       }
       expect(on.value.duplication).toBeDefined();
       expect(off.value.duplication).toBeUndefined();
     });

     it('records a zero-discovery refusal as an AnalysisError and publishes no report (criterion 14)', async () => {
       // `include` matches nothing, so the snapshot carries zero source files
       // and the detector refuses rather than reporting a clean scan.
       const result = await analyzerFor(
         { duplication: true },
         { include: ['src/**/*.nothing-matches-this'] }
       ).analyze();
       expect(result.ok).toBe(true);
       if (!result.ok) return;
       expect(result.value.duplication).toBeUndefined();
       const errors = result.value.analysisErrors.filter((e) => e.analyzer === 'duplication');
       expect(errors).toHaveLength(1);
       expect(errors[0]!.error.details.reason).toBe('zero-files-discovered');
     });

     it('tags each per-file skip as analyzer `duplication` while still publishing the report (criterion 12)', async () => {
       const { mkdtemp, writeFile, mkdir, rm } = await import('node:fs/promises');
       const { tmpdir } = await import('node:os');
       const root = await mkdtemp(join(tmpdir(), 'dup-analyzer-'));
       try {
         await mkdir(join(root, 'src'), { recursive: true });
         await writeFile(join(root, 'src/entry.ts'), 'export const entry = 1;\n', 'utf8');
         await writeFile(join(root, 'src/broken.ts'), 'export function (((( {', 'utf8');
         const analyzer = new EntropyAnalyzer({
           rootDir: root,
           parser: new TypeScriptParser(),
           entryPoints: ['src/entry.ts'],
           include: ['src/**/*.ts'],
           analyze: { duplication: { ignorePatterns: [] } },
         } as never);
         const result = await analyzer.analyze();
         expect(result.ok).toBe(true);
         if (!result.ok) return;
         // The run SUCCEEDED with a gap: the report is published AND the skip is
         // surfaced. Note the snapshot's own parser may have dropped the broken
         // file before the detector ever saw it; when it does reach the
         // detector, this is the contract it must honour.
         const errors = result.value.analysisErrors.filter((e) => e.analyzer === 'duplication');
         for (const entry of errors) {
           expect(entry.error.details.reason).toBeDefined();
           expect(entry.error.code).toBe('PARSE_ERROR');
         }
         expect(result.value.duplication ?? errors.length > 0).toBeTruthy();
       } finally {
         await rm(root, { recursive: true, force: true });
       }
     });
   });
   ```

   > **Note on the last case.** `snapshot.files` only holds files the snapshot's own parser
   > accepted, so an unparseable file may never reach the detector at all. That is a real
   > consequence of planning decision P1 and is recorded as such, not papered over: the per-file
   > `AnalysisError` contract is proven at the detector level in Task 4 (where it is unconditional),
   > and this test asserts the analyzer's **tagging** without pretending the analyzer path can force
   > the skip.

2. Run — observe pass (or fix `analyzer.ts` if the summary wiring was wrong):

   ```
   cd packages/core && npx vitest run tests/entropy/analyzer.duplication.test.ts
   ```

3. Full entropy suite + lint + build + commit:

   ```
   cd packages/core && npx vitest run tests/entropy
   npx turbo build --filter=@harness-engineering/core...
   git add packages/core/tests/entropy/analyzer.duplication.test.ts packages/core/src/entropy/analyzer.ts
   git commit -m "test(entropy): assert the duplication wiring's criterion 7/9/12/14 and D4 invariants"
   ```

---

### Task 8: make `normalizeTokens` linear per unit

**Depends on:** none | **Files:** `packages/core/src/duplication/tokens.ts`, `packages/core/tests/duplication/tokens.test.ts` | **Owns:** `packages/core/src/duplication/tokens.ts` | **Category:** nfr

The carried-forward Phase-1 item. `buildCloneIndex`'s shipped JSDoc states this optimization "is
deliberately deferred to **Phase 2**, where the `<10s` success criterion lives and can measure it" —
so Phase 2 either does it or amends that record. **Measured:** 15.75x on the worst file, ~15% /
~400 ms on the whole Scope-B index, **0 mismatches** over all 221 units of
`packages/orchestrator/src/orchestrator.ts`, and byte-identical index stats at both Scope A and
Scope B (planning decision P4).

1. First write the equivalence property. Append to `packages/core/tests/duplication/tokens.test.ts`:

   ```ts
   describe('normalizeTokens range selection', () => {
     it('selects exactly the tokens fully inside the range, in source order', () => {
       // A hand-checked oracle independent of the implementation: filter the
       // same token array by the same predicate the contract states.
       const source = [
         'export function outer(alpha: number): number {',
         '  const beta = alpha + 1;',
         '  function inner(gamma: number): number {',
         '    return gamma * 2;',
         '  }',
         '  return inner(beta);',
         '}',
       ].join('\n');
       const program = parse(source, { tokens: true, loc: true, range: true });
       const tokens = program.tokens ?? [];
       const units = extractUnits(program);
       expect(units.length).toBeGreaterThan(1);
       for (const unit of units) {
         const [start, end] = unit.range;
         const oracle = tokens
           .filter((t) => t.range[0] >= start && t.range[1] <= end)
           .map((t) =>
             t.type === 'Identifier' || t.type === 'PrivateIdentifier'
               ? IDENTIFIER_PLACEHOLDER
               : ['String', 'Numeric', 'Template', 'RegularExpression', 'JSXText'].includes(t.type)
                 ? LITERAL_PLACEHOLDER
                 : t.value
           );
         expect(normalizeTokens(tokens, unit.range)).toEqual(oracle);
       }
     });

     it('returns an empty stream for a range that contains no whole token', () => {
       const program = parse('const a = 1;', { tokens: true, loc: true, range: true });
       expect(normalizeTokens(program.tokens ?? [], [1, 2])).toEqual([]);
     });

     it('returns the whole file for a range spanning it', () => {
       const source = 'export function f(a: number): number {\n  return a + 1;\n}\n';
       const program = parse(source, { tokens: true, loc: true, range: true });
       const tokens = program.tokens ?? [];
       expect(normalizeTokens(tokens, [0, source.length])).toHaveLength(tokens.length);
     });
   });
   ```

   Add whatever of `parse`, `extractUnits`, `IDENTIFIER_PLACEHOLDER`, `LITERAL_PLACEHOLDER` the
   file does not already import.

2. Run — observe pass against the CURRENT implementation. The property must hold before and after;
   that is the whole point of writing it first:

   ```
   cd packages/core && npx vitest run tests/duplication/tokens.test.ts
   ```

3. In `packages/core/src/duplication/tokens.ts`, replace the body of `normalizeTokens` (keep the
   existing signature and JSDoc, extending the JSDoc per step 4):

   ```ts
   const [start, end] = range;
   const stream: string[] = [];
   // `program.tokens` is range-sorted, so binary-search the first token that
   // could be inside the range instead of rescanning the file's whole token
   // array per unit. Measured at HEAD before this change: 26.0M token visits
   // against 1.40M tokens (18.6x), the worst file
   // `packages/orchestrator/src/orchestrator.ts` contributing 5,005,208 by
   // itself from 221 units over 22,648 tokens.
   let lo = 0;
   let hi = tokens.length;
   while (lo < hi) {
     const mid = (lo + hi) >> 1;
     if (tokens[mid]!.range[0] < start) lo = mid + 1;
     else hi = mid;
   }
   for (let i = lo; i < tokens.length; i++) {
     const token = tokens[i]!;
     // `>` not `>=`: a zero-width token at exactly `end` satisfies the
     // documented predicate (`range[0] >= start && range[1] <= end`), and
     // breaking on `>=` would silently drop it. The sort order guarantees
     // nothing after a token starting past `end` can qualify.
     if (token.range[0] > end) break;
     // `continue`, not `break`: a token may start inside the range and end
     // outside it, and a later token can still be fully inside — this keeps
     // the predicate identical to the pre-change `for…of` filter.
     if (token.range[1] > end) continue;
     if (IDENTIFIER_TOKEN_TYPES.has(token.type)) stream.push(IDENTIFIER_PLACEHOLDER);
     else if (LITERAL_TOKEN_TYPES.has(token.type)) stream.push(LITERAL_PLACEHOLDER);
     else stream.push(token.value);
   }
   return stream;
   ```

4. Update the function's JSDoc: the `@param tokens` line gains
   `Must be range-sorted, as `parse` returns it — the range lookup is a binary search.`

5. Run the whole duplication suite — **all 163 existing tests plus the 3 new ones must pass**, and
   the fixture-level counters must be unchanged (the streams are identical, so they are):

   ```
   cd packages/core && npx vitest run tests/duplication
   ```

6. Lint, typecheck, build, commit:

   ```
   npx eslint packages/core/src/duplication/tokens.ts --max-warnings=0
   pnpm exec turbo run typecheck --filter=@harness-engineering/core
   npx turbo build --filter=@harness-engineering/core...
   git add packages/core/src/duplication/tokens.ts packages/core/tests/duplication/tokens.test.ts
   git commit -m "perf(duplication): binary-search the token range instead of rescanning per unit"
   ```

---

### Task 9: criterion 6 — the `<10s` bar over this repository

**Depends on:** Task 3, Task 8 | **Files:** `packages/core/tests/entropy/detectors/duplication.perf.test.ts` | **Owns:** `packages/core/tests/entropy/detectors/duplication.perf.test.ts` | **Category:** nfr

`[checkpoint:decision]` — **the assertion form.** Two options, batched here rather than
drip-asked:

|            | **A) A vitest timing assertion (recommended)**                                                                                                             | B) A `harness perf bench` baseline instead                                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pros**   | States criterion 6 verbatim, in the repo whose sources it is about; runs in the existing suite; `testTimeout` is already 60 s so no flake from the harness | Ratchets on a recorded baseline; the house machinery for perf NFRs                                                                             |
| **Cons**   | An absolute wall-clock assertion can flake on a loaded CI runner (measured 2.9–3.1 s here, so ~3.2x headroom)                                              | A baseline is relative, so it does NOT assert the spec's absolute 10 s bar; `.harness/perf/baselines.json` would carry a repo-shaped benchmark |
| **Risk**   | Low–medium (flake)                                                                                                                                         | Low, but it does not verify the criterion as written                                                                                           |
| **Effort** | Low                                                                                                                                                        | Medium                                                                                                                                         |

**Recommendation: A** (confidence: medium–high) — criterion 6 is an **absolute** bar, and only A
asserts it. If CI proves it flaky, the honest remedy is to keep the measurement recorded in the
verification notes and relax the test to a scoped assertion, **not** to delete the criterion.

1. Create `packages/core/tests/entropy/detectors/duplication.perf.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { join } from 'node:path';
   import { minimatch } from 'minimatch';
   import { skipDirGlobs } from '@harness-engineering/graph';
   import { findFiles, relativePosix } from '../../../src/shared/fs-utils';
   import { detectDuplication } from '../../../src/entropy/detectors/duplication';
   import type { CodebaseSnapshot } from '../../../src/entropy/types';

   /** Spec success criterion 6: "under 10 seconds". */
   const BUDGET_MS = 10_000;

   const REPO_ROOT = join(__dirname, '../../../../..');

   /**
    * Criterion 6's scope: "this repository's non-test sources". Reproduced as
    * `buildSnapshot`'s own default discovery narrowed to the TS/JS extensions
    * `isEligibleFile` admits.
    */
   const INCLUDE = ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs'];

   /**
    * `detectDuplication` reads only `files[].path` and `rootDir`, so a synthetic
    * snapshot times THE DETECTOR rather than a multi-minute tree-sitter snapshot
    * build (planning decision P8; same construction as
    * `architecture/collectors/complexity.ts:8-26`).
    */
   function snapshotOf(paths: string[], rootDir: string): CodebaseSnapshot {
     return {
       files: paths.map((path) => ({
         path,
         ast: { type: 'Program', body: null, language: 'typescript' },
         imports: [],
         exports: [],
         internalSymbols: [],
         jsDocComments: [],
       })),
       dependencyGraph: { nodes: [], edges: [] },
       exportMap: { byFile: new Map(), byName: new Map() },
       docs: [],
       codeReferences: [],
       entryPoints: [],
       rootDir,
       config: { rootDir, analyze: {} },
       buildTime: 0,
     } as unknown as CodebaseSnapshot;
   }

   describe('detectDuplication performance (spec criterion 6)', () => {
     it('completes over this repository’s non-test sources within the budget', async () => {
       const exclude = [...skipDirGlobs(), '**/*.test.ts', '**/*.spec.ts'];
       const discovered: string[] = [];
       for (const pattern of INCLUDE) discovered.push(...(await findFiles(pattern, REPO_ROOT)));
       const paths = [...new Set(discovered)].filter(
         (f) => !exclude.some((p) => minimatch(relativePosix(REPO_ROOT, f), p))
       );

       // Refuse to report a pass over a scan that did not happen. A broken
       // discovery would otherwise make this the fastest test in the suite.
       expect(paths.length).toBeGreaterThan(500);

       const started = Date.now();
       const result = await detectDuplication(snapshotOf(paths, REPO_ROOT));
       const elapsed = Date.now() - started;

       expect(result.ok).toBe(true);
       if (!result.ok) return;
       // Proof the scan was real, without asserting this repository's class
       // count (spec criterion 10 forbids that).
       expect(result.value.stats.filesScanned).toBeGreaterThan(500);
       expect(result.value.stats.unitsFingerprinted).toBeGreaterThan(0);
       expect(elapsed).toBeLessThan(BUDGET_MS);
     });
   });
   ```

2. Run it and **record the number** — the plan's figure is 2,946 / 3,107 ms before Task 8 and
   2,324 ms after, over 2,385 candidate paths / 2,151 scanned:

   ```
   cd packages/core && npx vitest run tests/entropy/detectors/duplication.perf.test.ts --reporter=verbose
   ```

3. Confirm `minimatch` and `@harness-engineering/graph` are resolvable from `packages/core`
   (both are — `entropy/snapshot.ts:20-22` and `detectors/size-budget.ts:9` already import them):

   ```
   pnpm exec turbo run typecheck --filter=@harness-engineering/core
   ```

4. Commit:

   ```
   npx turbo build --filter=@harness-engineering/core...
   git add packages/core/tests/entropy/detectors/duplication.perf.test.ts
   git commit -m "test(entropy): assert the duplication detector's 10s budget over this repo"
   ```

---

### Task 10: restore the `>= minTokens` singleton-group fixture coverage

**Depends on:** none | **Files:** `packages/core/tests/fixtures/duplication/planted-clones/src/unique.ts`, `packages/core/tests/fixtures/duplication/planted-clones/README.md`, `packages/core/tests/duplication/acceptance.test.ts` | **Owns:** `packages/core/tests/fixtures/duplication/planted-clones/**`

The carried-forward Phase-1 regression: `src/unique.ts` became a 23-token **sub-threshold excluded**
unit, so the planted fixture stopped exercising the singleton-group path (a group of exactly one
`>= minTokens` unit, counted in neither `classes` nor `classesSuppressed`). It survives only in a
scratch-directory test at `tests/duplication/clone-index.test.ts:390`.

Every figure below was measured by substituting the replacement file and running the index over all
five override cases.

1. Replace `packages/core/tests/fixtures/duplication/planted-clones/src/unique.ts` entirely:

   ```ts
   export type UniqueMode = 'strict' | 'loose';

   /**
    * Structurally unlike every other unit in this fixture — a `switch` over a
    * union, a `Map` accumulator and a `try` — and deliberately ABOVE the default
    * `minTokens` of 40 (measured: 139 normalized tokens, fingerprint
    * `55151f0d9ab9afac`), so it IS fingerprinted and forms a SINGLETON group:
    * the path counted in neither `classes` nor `classesSuppressed`.
    *
    * It holds exactly ONE extractable unit. The accumulation is a `for` loop
    * rather than `.reduce((carry, next) => …)` on purpose: an arrow callback is
    * a second `DupUnit`, which would move the fixture's unit total off 12.
    */
   export function classifyUnique(
     mode: UniqueMode,
     source: readonly number[]
   ): Map<string, number> {
     const bucket = new Map<string, number>();
     switch (mode) {
       case 'strict': {
         for (const value of source) {
           const label = value % 2 === 0 ? 'even' : 'odd';
           bucket.set(label, (bucket.get(label) ?? 0) + value);
         }
         break;
       }
       default: {
         try {
           let carry = 0;
           for (const value of source) {
             carry += value;
           }
           bucket.set('all', carry);
         } catch {
           bucket.clear();
         }
         break;
       }
     }
     return bucket;
   }
   ```

2. In `packages/core/tests/duplication/acceptance.test.ts`, change the constant and its JSDoc:

   ```ts
   /**
    * The fixture's units that fall below the default `minTokens` of 40, measured:
    * the three 16-token `src/short-*.ts` functions. `src/unique.ts` is NOT among
    * them — at 139 tokens it clears the bar and forms a singleton group, which is
    * exactly the path it exists to cover.
    */
   const SUB_MIN_TOKEN_UNITS = 3;
   ```

   This is the only edit the existing suite needs. Measured: with the old fixture the suite is
   `163 passed`; with the new one it is `1 failed | 162 passed`, the single failure being
   `expected 3 to be 4` at `acceptance.test.ts:82`.

3. Add the singleton case to the same file, inside the
   `describe('buildCloneIndex over the planted-clones fixture (criterion 15)')` block:

   ```ts
   it('fingerprints the one unique unit and counts its singleton group nowhere', async () => {
     const files = await discover(PLANTED_ROOT);
     const result = await buildCloneIndex(files, { rootDir: PLANTED_ROOT, ignorePatterns: [] });
     if (!result.ok) throw new Error('expected ok');
     const stats = result.value.stats;
     // src/unique.ts clears minTokens, so it IS hashed...
     expect(stats.unitsFingerprinted).toBe(TOTAL_UNITS - SUB_MIN_TOKEN_UNITS);
     // ...and its group holds one member, so it is not duplication: it appears
     // in no class and, critically, is NOT counted in classesSuppressed, which
     // is reserved for classes that formed with >= 2 members.
     const reported = result.value.classes.flatMap((c) => c.members.map((m) => m.file));
     expect(reported).not.toContain('src/unique.ts');
     expect(stats.classesSuppressed).toBe(1);
     expect(stats.classesReported).toBe(2);
   });
   ```

4. Update `packages/core/tests/fixtures/duplication/planted-clones/README.md`:
   - The `src/unique.ts` table row becomes:
     `| — | \`src/unique.ts\` | function | 139 | — | no — singleton group; fingerprinted, counted in neither \`classes\` nor \`classesSuppressed\` |`
   - The measured-stats block becomes:
     ```
     filesScanned: 12, filesSkipped: 0, unitsFingerprinted: 9, unitsBelowMinTokens: 3,
     classesReported: 2, classesSuppressed: 1, classesTruncated: 0
     ```
   - The sentence "The 4 excluded units are `src/short-{one,two,three}.ts` (16 tokens each) and
     `src/unique.ts` (23 tokens); 12 extracted units minus those 4 leaves 8 fingerprinted."
     becomes: "The 3 excluded units are `src/short-{one,two,three}.ts` (16 tokens each); 12
     extracted units minus those 3 leaves 9 fingerprinted. `src/unique.ts` (139 tokens) is
     fingerprinted and forms a singleton group, which is counted nowhere."
   - In the override table, the `ignorePatterns: ['**/generated/**']` row's stats become
     `scanned 9, units 6, below 3, suppressed 1`. The `none`, `minInstances: 2`, `minTokens: 10`
     and `maxClasses: 1` rows' class lists are **unchanged** — all five cases were re-measured:

     | Override                              | Reported classes          | Measured stats (new fixture)                |
     | ------------------------------------- | ------------------------- | ------------------------------------------- |
     | none                                  | D (261), A (249)          | `units 9, below 3, suppressed 1`            |
     | `ignorePatterns: ['**/generated/**']` | A only                    | `scanned 9, units 6, below 3, suppressed 1` |
     | `minInstances: 2`                     | D (261), A (249), B (170) | `reported 3, suppressed 0`                  |
     | `minTokens: 10`                       | D (261), A (249), C (48)  | `units 12, below 0, suppressed 1`           |
     | `maxClasses: 1`                       | D only                    | `reported 1, suppressed 1, truncated 1`     |

5. Run the full duplication suite. The pre-task baseline is **163 tests across 9 files**; this
   task adds exactly one case, so **164** if it runs before Task 8 and **167** if Task 8's three
   `tokens.test.ts` cases already landed. Recount rather than predict — the gate is that nothing
   went from passing to failing and that `acceptance.test.ts` is fully green:

   ```
   cd packages/core && npx vitest run tests/duplication
   ```

6. Commit (no build needed — fixtures and tests only, but keep the habit so the pre-commit arch
   hook never reads a stale `dist`):

   ```
   npx turbo build --filter=@harness-engineering/core...
   git add packages/core/tests/fixtures/duplication/planted-clones packages/core/tests/duplication/acceptance.test.ts
   git commit -m "test(duplication): restore the singleton-group path to the planted fixture"
   ```

---

### Task 11: ADR for D2, D3 and D4

**Depends on:** Task 7 | **Files:** `docs/knowledge/decisions/0134-whole-unit-type-2-clone-detection-at-rule-of-three.md` | **Owns:** `docs/knowledge/decisions/0134-whole-unit-type-2-clone-detection-at-rule-of-three.md` | **Category:** integration

The spec's Integration Points → Architectural Decisions calls for "One ADR covering **D2, D3, and
D4**", on the reasoning that it fixes the project's operative definition of duplication, which
#1612 and #1646 inherit, and that it rejects the industry-standard CPD/sliding-window approach on
measured evidence. Phase 2 is where those three decisions become **operative** in the pipeline, so
this is their home.

`[checkpoint:decision]` — **two things to confirm, batched:**

1. **The ADR number.** `0134` is free both locally and on `origin/main` (both end at `0133`), but
   `origin/main` is 7 commits ahead of this branch's fork point and this repo has a history of ADR
   number collisions (GH #1323). Re-check immediately before writing:

   ```
   git ls-tree --name-only origin/main docs/knowledge/decisions/ | tail -3
   ls docs/knowledge/decisions/ | tail -3
   ```

   If `0134` is taken, take the next free number and change the filename only.

2. **Whether the ADR lands in Phase 2 at all.** The Phase-1 plan deferred it to "Phase 2/3"
   (uncertainty U8). **Recommendation: write it here** — Phase 3 is the CLI surface, and an ADR
   explaining _why_ the detector reports whole units at `>= 3` should not trail the detector into
   production. If the reviewer prefers Phase 3, drop this task and move the row into the
   Scope Boundary table; nothing else in the plan depends on it.

Write the ADR against the repo's existing ADR format (see `0131-stats-leaf-package-home-for-statistical-instruments.md`
for the current shape — do **not** use `manage_adr`, which drops the `decision` field and is not
worktree-aware). Content must cover, with the measured evidence already in the spec:

- **D2, whole-unit granularity** — 60 readable classes vs 6,173 at a 50-token sliding window; at
  sub-unit granularity the suppression list, not the algorithm, becomes the product.
- **D3, report at `>= 3` instances above a token floor** — the bar CODE-R004 states, cited to
  Fowler; also the false-positive control, since prior sweeps in this repo ran at roughly 95% FP.
- **D4, advisory first, baseline ratchet later, never fail-closed** — with the fail-closed
  pre-commit architecture gate (#855) as the standing cautionary precedent, and the concrete
  mechanism recorded: `DuplicationReport.stats` carries no `errorCount` and no `warningCount`, so
  duplication structurally cannot raise `EntropyReport.summary.errors` or `.warnings`.
- **Consequences** — #1612 (`idiom-contagion-epidemiology`) and #1646 inherit this definition;
  a sub-unit/CPD tier stays a filed follow-up to be justified by what this ships fails to catch.

Then:

```
npx prettier --write docs/knowledge/decisions/0134-*.md
git add docs/knowledge/decisions/0134-*.md
git commit -m "docs(duplication): ADR for whole-unit Type-2 clone detection at the Rule of Three"
```

---

### Task 12: AGENTS.md and the changeset

**Depends on:** Task 7 | **Files:** `AGENTS.md`, `.changeset/duplication-entropy-detector.md` | **Owns:** `.changeset/duplication-entropy-detector.md` | **Category:** integration

1. `AGENTS.md:278` currently reads:

   ```
   - **entropy** (`packages/core/src/entropy/`): Detects and remediates codebase entropy including dead code, drift, complexity violations, and coupling problems.
   ```

   Change the enumeration to include duplication:

   ```
   - **entropy** (`packages/core/src/entropy/`): Detects and remediates codebase entropy including dead code, drift, complexity violations, coupling problems, and duplicated code units (clone classes).
   ```

   > `AGENTS.md` is a high-traffic file that concurrent automation in this repo edits. Re-read the
   > line immediately before editing rather than applying a stale patch.

2. Create `.changeset/duplication-entropy-detector.md`:

   ```markdown
   ---
   '@harness-engineering/core': minor
   ---

   Wire duplication detection into the entropy pipeline: `detectDuplication`, the
   `DuplicationReport` type, `EntropyConfig.analyze.duplication`,
   `EntropyReport.duplication`, and `'duplication'` on the `AnalysisError['analyzer']`
   union. Discovery is driven solely by `EntropyConfig.include` / `exclude`; per-file
   read and parse failures become `AnalysisError`s with `analyzer: 'duplication'`
   rather than failing the run; severity is advisory only, so duplication adds
   nothing to `summary.errors` or `summary.warnings`. Also makes
   `normalizeTokens` locate its range by binary search instead of rescanning each
   file's whole token array per unit. Phase 2 of the DRY-floor spec — no CLI or MCP
   surface yet.
   ```

   > **This changeset is for the changelog, not for a gate.** `scripts/check-changesets.mjs` is
   > already satisfied on this branch by the committed Phase-1
   > `.changeset/duplication-core-module.md` (`@harness-engineering/core: minor`), which covers
   > `packages/core/src/` changes. Do not claim it unblocks anything.

3. Verify formatting (pre-push runs `format:check` over the whole tree) and commit:

   ```
   npx prettier --check AGENTS.md .changeset/duplication-entropy-detector.md
   git add AGENTS.md .changeset/duplication-entropy-detector.md
   git commit -m "docs(entropy): describe duplication detection and add the Phase-2 changeset"
   ```

---

### Task 13: full Phase-2 verification against the recorded baselines

**Depends on:** Task 4, Task 5, Task 7, Task 9, Task 10, Task 11, Task 12 | **Files:** none (verification only) | **Category:** integration

`[checkpoint:human-verify]` — pause after step 8 and present the evidence table before reporting
done.

1. Build everything core depends on, so the pre-commit arch hook and the package-specifier test
   read a fresh `dist`:

   ```
   npx turbo build --filter=@harness-engineering/core...
   ```

2. The duplication and entropy suites:

   ```
   cd packages/core && npx vitest run tests/duplication tests/entropy
   ```

   Expected: duplication **164** tests across **9** files (163 + the Task-10 singleton case, and
   Task 8's 3 new cases land in the existing `tokens.test.ts`, so recount rather than predict);
   entropy gains the three new files from Tasks 3/5/9 plus `analyzer.duplication.test.ts`.

3. The full core suite, against the recorded baseline:

   ```
   cd packages/core && npx vitest run
   ```

   **Baseline re-measured at `e30c950b0`: `Test Files 501 passed | 1 skipped (502)`,
   `Tests 5889 passed | 1 skipped (5890)`.** The count must RISE by the tests this plan adds and
   nothing may go from passing to failing.

4. Typecheck and the scoped lint. The unscoped entropy lint **cannot** pass — it carries a
   pre-existing warning at `entropy/entry-points.test.ts:69:51` — so lint exactly the files this
   plan created or modified:

   ```
   pnpm exec turbo run typecheck --filter=@harness-engineering/core
   npx eslint \
     packages/core/src/entropy/types/duplication.ts \
     packages/core/src/entropy/types/report.ts \
     packages/core/src/entropy/types/config.ts \
     packages/core/src/entropy/types/index.ts \
     packages/core/src/entropy/detectors/duplication.ts \
     packages/core/src/entropy/detectors/index.ts \
     packages/core/src/entropy/index.ts \
     packages/core/src/entropy/analyzer.ts \
     packages/core/src/duplication \
     --max-warnings=0
   ```

5. Generated-artifact freshness and layering. The barrel must be green **without** regenerating —
   `duplication` was registered in Phase 1 and `entropy` is a star-exported directory, so Phase 2
   changes nothing the generator reads:

   ```
   node scripts/generate-core-barrel.mjs --check
   node packages/cli/dist/bin/harness.js check-deps
   ```

   `check-deps` was green at plan time (**2,661 modules, 10 layers**) and must stay green.

6. The chronically-red whole-project gates, as **baseline comparisons only**:

   ```
   node packages/cli/dist/bin/harness.js validate 2>&1 | grep -iE "Validation failed"
   HARNESS_ARCH_BASE_REF=c83ec3620 node packages/cli/dist/bin/harness.js check-arch > /tmp/arch-after.txt 2>&1
   ```

   - `validate` is **exit 1 / 462 issues** in the steady state. Gate: the count has not risen, and
     no issue names a path this plan touched. **Do not report "validate passed"** — it cannot.
   - `check-arch` is **exit 1 / 12 pre-existing violations** under that pinned base ref. Gate:
     `/tmp/arch-after.txt` lists exactly the 12 findings recorded in this plan's "Gating truths"
     section and no thirteenth. **Do not gate on the exit code**, and never pipe it through `tail`
     before reading `$?` — that reports `tail`'s status, not `check-arch`'s. If a new finding
     appears, re-run step 1 first (a stale `dist` is the usual cause).
   - An unpinned `check-arch` run will show 3 phantom "new" findings in `cli/src/drift/index.ts`
     and `cli/src/brand/index.ts`, because `resolveArchBaseline` reads
     `git show origin/main:.harness/arch/baselines.json` and `origin/main` is 7 commits ahead of
     the fork point. That is a measurement artifact, not a regression.

7. Confirm the scope boundary held:

   ```
   git diff --name-only e30c950b0..HEAD
   ```

   Must match this plan's File Map exactly. In particular: **no** `packages/cli/` file, **no**
   `docs/reference/` file, **no** `packages/core/src/code-craft` or `packages/cli/src/code-craft`
   file, and inside `packages/core/src/duplication/` only `tokens.ts`.

8. **`[checkpoint:human-verify]`** — present this table and wait:

   | Criterion / claim                                | Evidence                                                                                                              |
   | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
   | 6 — `<10s` over this repo's non-test sources     | `duplication.perf.test.ts` passing + the recorded wall-clock number, with its scope written down                      |
   | 7 — off by default, no parse                     | `analyzer.duplication.test.ts` — `detectDuplication` **call count 0**, not just `undefined`                           |
   | 9 — no existing detector's output changed        | `analyzer.duplication.test.ts` sibling-slice `JSON.stringify` comparison                                              |
   | 10 — no hardcoded repo class count               | `grep -rn "\b58\b\|\b98\b" packages/core/tests/entropy packages/core/tests/duplication` finds no expected value       |
   | 11 — importable from `@harness-engineering/core` | `duplication-registration.test.ts` + `generate-core-barrel.mjs --check`                                               |
   | 12 — skip, record, complete                      | `duplication.test.ts` failure-behavior block (`details.reason`, not `code`)                                           |
   | 13 — `maxClasses` cap and `classesTruncated`     | `duplication.test.ts`                                                                                                 |
   | 14 — refuse a pass over zero files               | `duplication.test.ts` + `analyzer.duplication.test.ts`                                                                |
   | 15 — discovery solely by `include`/`exclude`     | `analyzer.duplication.test.ts` — `exclude` drops Class D with `ignorePatterns: []`                                    |
   | D4 — advisory only                               | `totalIssues` rises by `classesReported`; `errors`/`warnings` unchanged; no `errorCount`/`warningCount` on the report |
   | Carried: `normalizeTokens` linearized            | `tokens.test.ts` equivalence property + the Scope-C bench + identical index stats                                     |
   | Carried: singleton fixture coverage restored     | `acceptance.test.ts` singleton case + the updated fixture README                                                      |
   | Dropped with evidence: bounded concurrency       | Scope D — 119 ms reads vs 1,820 ms synchronous parse                                                                  |
   | Test baseline not regressed                      | core suite count vs **501 files / 5,889 tests** recorded above                                                        |
   | `check-deps` still green                         | 2,661 modules / 10 layers                                                                                             |
   | `validate` / `check-arch` not worsened           | 462 issues and the 12-finding list, both unchanged                                                                    |
   | Scope boundary held                              | `git diff --name-only` matches the File Map                                                                           |

9. No commit — this task produces verification output only. Every artifact was committed by the
   task that produced it.

---

## Dependency Graph

```
Task 1 (DuplicationReport type)
   │
   v
Task 2 (union + config/report fields)        Task 8 (normalizeTokens binary search)
   │                                            │
   │        Task 10 (fixture singleton) ────┐    │
   │                                        │    │
   └────────────────┬───────────────────────┘    │
                    v                            │
              Task 3 (detector + happy path) ────┴──> Task 9 (criterion 6 perf)
                    │
       ┌────────────┼────────────┐
       v            v            v
  Task 4        Task 5       Task 6 (analyzer wiring)
 (failures)   (barrels)           │
                                  v
                             Task 7 (invariants)
                                  │
                    ┌─────────────┴─────────────┐
                    v                           v
              Task 11 (ADR)              Task 12 (AGENTS.md + changeset)
                    │                           │
                    └──────────┬────────────────┘
                               v
                    Task 13 (full verification)
                      ^   ^   ^   ^
                      │   │   │   └── Task 4, Task 5, Task 9, Task 10
```

**Waves** — as `plan_parallelization` will compute from `dependsOn` ∪ file-overlap ∪ `owns`-overlap.
Dispatch order is derived **topologically from `dependsOn`** regardless of how the tool buckets
them, so these declarations are the contract:

| Wave | Tasks      | Note                                                                                                                                         |
| ---- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | 1, 8, 10   | Fully disjoint files. 8 touches only `duplication/tokens.ts`; 10 touches only fixtures + `acceptance.test.ts`                                |
| 2    | 2          | Needs `DuplicationReport` from Task 1                                                                                                        |
| 3    | 3          | Needs the types (1, 2) **and** the settled fixture (10, decision P10)                                                                        |
| 4    | 4, 5, 6, 9 | All depend on 3. **4 and 3 share both files** and **6 and 7 share both files**, so file-overlap serializes those pairs; 5 and 9 are disjoint |
| 5    | 7          | Needs 6's summary wiring                                                                                                                     |
| 6    | 11, 12     | Disjoint doc/metadata files; both depend on 7 so the narrative they record is final                                                          |
| 7    | 13         | Verification only                                                                                                                            |

---

## Concerns

1. **The criterion-6 wall-clock assertion can flake on a loaded CI runner.** Measured 2.9–3.1 s
   here (2.3 s with Task 8), against a 10 s bar — ~3.2–4.3x headroom. A 3x-slower loaded runner
   under v8 coverage would sit near the bar. Named remedy, in order: (a) keep the recorded
   measurement in the verification notes and relax the test to a scoped assertion; (b) convert it
   to a `harness perf bench` baseline. **Do not** delete the criterion. `[checkpoint:decision]` in
   Task 9 surfaces this before the test is written.

2. **`snapshot.files` only holds files the snapshot's own parser accepted**, so a file the
   registry's parser rejected never reaches the duplication detector and can never produce an
   `unparseable` skip at the **analyzer** level. This is a real consequence of decision P1, not a
   gap in the contract: the per-file `AnalysisError` path is unconditional and fully tested at the
   **detector** level (Task 4). The Task-7 analyzer test asserts the tagging without pretending it
   can force the skip. Recorded rather than hidden.

3. **The ADR number may collide.** `0134` is free locally and on `origin/main` today, but
   `origin/main` is 7 commits ahead of the fork point and this repo has a history of ADR number
   collisions (GH #1323). Task 11 re-checks against `origin/main` at write time, as a checkpoint.

4. **`AGENTS.md` is edited by concurrent automation in this worktree.** Task 12 instructs a re-read
   of line 278 immediately before the edit rather than applying a patch that may be stale by then.

5. **Scope A vs Scope B class counts differ (58 vs 98) and that is correct.** Anyone comparing the
   detector's output to the spec's "58" without checking the scope will read a regression that is
   not there. Both figures are published above with their discovery scope; **no test asserts
   either** (criterion 10).

6. **`totalIssues` is a judgment call.** Decision P3 counts clone classes there so the summary
   cannot report a clean run over 98 reported classes. The only exit-code gate on a field by that
   name is the **CLI's own** `cleanup.ts:150/230`, which Phase 3 owns — but Phase 3 must decide
   consciously whether `-t duplication` exits non-zero, or D4 ("never fail-closed") is violated
   downstream of a Phase-2 choice. Flagged for Phase 3's planner.

7. **Test files are not typechecked in this repo.** No tsc project includes them and
   `eslint packages/core/tests/**` fails pre-existingly, so every type-level assertion in a test is
   decorative. Every test in this plan was written to carry its weight in **runtime** assertions
   alone (roadmap row `typecheck-test-files`).

8. **The `vi.mock` in Task 7 mocks the module the analyzer imports directly.** `analyzer.ts`
   imports `detectDuplication` from `'./detectors/duplication'`, and the test mocks
   `'../../src/entropy/detectors/duplication'` — the same resolved module, so the spy is on the
   analyzer's own binding. If vitest's module graph ever resolves these differently, the call-count
   assertion in criterion 7 silently becomes vacuous. Mitigation: the "calls the detector exactly
   once when enabled" case in the same block is the **positive control** — it fails loudly if the
   spy is not wired to the analyzer's binding.

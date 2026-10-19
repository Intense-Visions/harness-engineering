# Plan: Mechanical Duplication Detection — Phase 1 (Core duplication module)

**Date:** 2026-10-19
**Spec:** `docs/changes/duplication-detection/proposal.md` (section "### Phase 1: Core duplication module")
**Session:** `changes--duplication-detection--proposal`
**Worktree:** `/Users/cwarner/Projects/iv/hd-dry-concept` (branch `brainstorm/dry-refactoring-concept`)

---

> ## ⚠️ PARTIALLY SUPERSEDED by spec amendment `3a14eac83`
>
> This plan was written **before** the spec amendment that made `minTokens` a **unit-level bar
> applied before grouping** (sub-threshold units are never fingerprinted and land in the new
> `stats.unitsBelowMinTokens`; `classesSuppressed` counts only classes that formed and were then
> dropped for falling below `minInstances`). **The shipped implementation follows the SPEC, not
> this document.** The plan text is retained as the historical record of how Phase 1 was planned
> and is deliberately NOT rewritten — but these nine places are stale, and the spec wins at every
> one of them:
>
> 1. **Observable Truth 7** — asserts a group is counted in `classesSuppressed` when its
>    `tokenCount` is below `minTokens`. Superseded: that is `unitsBelowMinTokens`, pre-grouping.
> 2. **Decision P4** — decides the bars are applied "at group level after grouping". Superseded.
> 3. **The `CloneIndex` sketch** — its comment conflates the two bars and the sketch has no
>    `unitsBelowMinTokens` field at all. The shipped `stats` has **seven** fields.
> 4. **The reference implementation** — `if (units.length < minInstances || tokenCount < minTokens)`
>    is the superseded single-stage bar.
> 5. **Task 5 test description** — "suppresses a three-member group below minTokens" expecting
>    `classesSuppressed: 1`. Shipped instead: no class ever forms; `unitsBelowMinTokens: 3`,
>    `classesSuppressed: 0`.
> 6. **Task 8 test description** — "counts the two sub-bar groups in classesSuppressed" expecting 2. Shipped: `1`.
> 7. **Task 7 fixture table** — Class C "counted in `classesSuppressed`" and `classesSuppressed: 2`.
>    Shipped fixture README and an independent probe both measure **1**; Class C never groups.
> 8. **Uncertainty U3** — anticipated this exact fork and predicted the 2→1 change. It is the
>    branch that was taken, so U3 is RESOLVED, not open.
> 9. **Observable Truth 1** — pins criterion 11 to `import … from '../../src/index'`. The shipped
>    `barrel.test.ts` imports the package specifier `@harness-engineering/core` instead, because
>    the source barrel would stay green through a `dist` export regression.
>
> Also note: `extractUnits` gained a `NON_CHILD_KEYS` skip list and a visited set after
> verification proved the plan's verbatim walker overflowed the stack on a parent-linked AST, and
> `walk`/`toUnit` were split out of the original single function to clear the complexity bar.

---

**Rigor:** standard
**Tasks:** 11
**Time:** ~42 min
**Checkpoints:** 2
**Integration Tier:** medium

## Goal

`packages/core/src/duplication/` exists and exports `buildCloneIndex` plus the `CloneIndex` /
`CloneClass` / `CloneMember` / `CloneUnitKind` / `DuplicationConfig` types through the
`@harness-engineering/core` barrel, producing a deterministic Type-2 clone index over a
glob-discovered set of TS/JS files — with no wiring into the entropy pipeline, CLI, MCP, or
`code-craft`.

## Scope Boundary (what this plan deliberately excludes)

| Excluded                                                                                                                                  | Owner                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `entropy/detectors/duplication.ts`, `EntropyConfig.analyze.duplication?`, `EntropyReport.duplication?`, `AnalysisError['analyzer']` union | Phase 2                                                                     |
| `CleanupType` / `-t duplication`, `detect_entropy` enum, `generate-docs`, top-20 precision audit                                          | Phase 3                                                                     |
| `partial-extraction` **derivation** and `sharedImport` population                                                                         | Phase 4                                                                     |
| `BuildPromptInput` / `CritiqueInput` `siblings?`, extractor-agreement test                                                                | Phase 5                                                                     |
| ADR for D2/D3/D4, knowledge-graph concept nodes, `harness-refactoring/SKILL.md`                                                           | Phase 2/3 (spec assigns to Architectural Decisions / Documentation Updates) |

Phase 1 sets `signal: 'duplicate'` on every class and leaves `sharedImport` unset. The fields exist
on the type (so #1612/#1646 and Phase 4 bind against a stable interface) but carry no derivation.

## Observable Truths (Acceptance Criteria)

Phase 1 owns spec criteria **11** and **15**, plus the Phase-1 share of the Failure-behavior
contract. EARS phrasing:

1. **(Criterion 11, ubiquitous)** The system shall export `buildCloneIndex`,
   `CloneIndex`, `CloneClass`, `CloneMember`, `CloneUnitKind`, and `DuplicationConfig` from
   `packages/core/src/index.ts`, such that
   `import { buildCloneIndex } from '../../src/index'` resolves at runtime and at type level.
   _Verified by:_ `packages/core/tests/duplication/barrel.test.ts` +
   `node scripts/generate-core-barrel.mjs --check`.
2. **(Criterion 15, event-driven)** When `buildCloneIndex` is given a file list discovered solely by
   include/exclude globs over the fixture project `tests/fixtures/duplication/planted-clones/`,
   the system shall report exactly the planted classes meeting `minInstances` and `minTokens`
   and no others.
   _Verified by:_ `packages/core/tests/duplication/acceptance.test.ts`.
3. **(D1, event-driven)** When two functions differ only in their function name and parameter
   names, the system shall assign them the same `fingerprint` and group them into one
   `CloneClass`. **Verified substrate** — a direct probe in this worktree produced identical
   fingerprint `22b275978510fe10` for `sumAlpha(items: Item[])` and `addBeta(rows: Row[])`.
4. **(D9, unwanted)** If a file's extension is not one of `.ts/.tsx/.js/.jsx/.mjs/.cjs`, then the
   system shall not read or parse it and shall count it in neither `filesScanned` nor `filesSkipped`.
5. **(Failure behavior, event-driven)** When a listed source file cannot be read, the system shall
   skip it, increment `filesSkipped`, and complete successfully.
6. **(Failure behavior, event-driven)** When a listed source file fails to parse, the system shall
   skip it, increment `filesSkipped`, and complete successfully. (The `AnalysisError` record is
   Phase 2's — the entropy types live there.)
7. **(Failure behavior, state-driven)** While a fingerprint group holds at least two members but
   fewer than `minInstances`, or its `tokenCount` is below `minTokens`, the system shall exclude it
   from `classes` and count it in `stats.classesSuppressed`.
8. **(Failure behavior, event-driven)** When more than `maxClasses` groups qualify, the system shall
   report the top `maxClasses` by `rank` (descending) and record the dropped count in
   `stats.classesTruncated`.
9. **(Failure behavior, unwanted)** If the file list resolves to zero eligible source files, then the
   system shall return `Err` with an explicit zero-discovery message and shall **not** return an
   `Ok` index reporting zero duplication. (Convention: `packages/cli/src/commands/cleanup.ts:88`,
   "Refusing to report a pass over zero rules".)
10. **(Ubiquitous)** The system shall report `CloneMember.file` as a repo-relative, POSIX-normalized
    path (forward slashes on every platform).
11. **(Ubiquitous)** `node scripts/generate-core-barrel.mjs --check` and
    `pnpm exec turbo run typecheck --filter=@harness-engineering/core` shall pass, and
    `npx vitest run tests/duplication` shall pass from `packages/core`.

## NFR Targets

**No NFR task is emitted in Phase 1.** Rationale, stated rather than assumed:

- The spec carries exactly one performance NFR — criterion 6, "`detectDuplication` shall complete
  over this repository's non-test sources in under 10 seconds (probe baseline: 2.4s)". That
  criterion names `detectDuplication`, which **Phase 2** creates. Its benchmark and
  `.harness/perf/baselines.json` entry therefore belong to Phase 2, where the measured surface
  exists. Phase 1 records the target rather than gating on it.
- Security: no new dependency, no untrusted-input surface beyond `readFile` on paths the caller
  already chose. `harness check-security --severity error` runs at its configured floor.
- Scalability: the algorithm is single-pass — one parse per file, one hash per unit, one
  `Map` grouping pass. No member-vs-member comparison, so no quadratic term. Task 5 states this as
  an implementation constraint; it is not separately benchmarked in Phase 1.
- Resilience: covered by the failure-path tests in Tasks 4 and 6 (unreadable file, unparseable file,
  zero discovery) rather than by a scanner — the harness ships no resilience gate, and this plan
  does not claim one.

Interactive NFR elicitation was not possible in this invocation (planner ran as a subagent with no
human channel); the above are the skill's documented defaults plus the spec's own stated target.
**Flagged for the approving human** — see Uncertainties U5.

## Decisions (settled upstream — do not re-litigate)

Carried from the spec's Decisions table: **D1** (Type-2 normalization map), **D5** (shared core
module, not logic in the detector), **D6** (`@typescript-eslint/typescript-estree` with
`tokens: true`; core has **no** `typescript` dependency and must not gain one), **D7** (the module
reads and parses files itself; it must **not** consume `snapshot.files[].ast`, which is the lossy
`{type, body: unknown, language}` wrapper at `shared/parsers/base.ts:8` behind a tree-sitter-default
registry at `shared/parsers/registry.ts:3`), **D9** (TS/JS only).

## Decisions made during planning

These resolve wording tensions in the spec. Each is mechanical, local to Phase 1, and testable.

| #   | Decision                                                                                                                                                                                                                                                                         | Rationale / evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P1  | `CloneUnitKind` is **declared in `units.ts`** and re-exported from `index.ts`.                                                                                                                                                                                                   | `units.ts`'s `DupUnit.kind` needs it. Declaring it in `index.ts` would make `units.ts` import `index.ts` while `index.ts` imports `units.ts` — a cycle, and `harness.config.json` sets `circular-deps.max = 0`. Re-export keeps the spec's three-file shape and satisfies criterion 11 at the package barrel.                                                                                                                                                                                                                  |
| P2  | `extractUnits` **skips the `FunctionExpression` that is a `MethodDefinition`'s `.value`**.                                                                                                                                                                                       | **Measured:** without the skip, one method yields three overlapping units at the same start line — `class BoxA` (65 tokens), `method tallyA` (50), and an `<anon> function` (49) — because `MethodDefinition.value` is itself a `FunctionExpression`. Two of those collide on the `byMember` key `${file}:${startLine}`. Only `MethodDefinition` consumes its value; a class-field arrow (`handler = (x) => …`) stays a unit of kind `function`.                                                                               |
| P3  | `byMember` is populated **first-writer-wins over classes in rank-descending order**.                                                                                                                                                                                             | **Measured:** `function g() { return [1].map((x) => x * 2); }` yields `g` and the inner arrow **both at line 2**, so the key `${file}:2` is genuinely ambiguous. Last-write-wins would be order-dependent. Rank-descending + no overwrite makes the key resolve deterministically to the highest-ranked class containing that line.                                                                                                                                                                                            |
| P4  | All extracted units are fingerprinted; the `minTokens` / `minInstances` bars are applied **at group level** after grouping. A group with ≥2 members failing either bar increments `classesSuppressed`. A singleton group (1 member) is counted nowhere.                          | The spec says a sub-`minTokens` unit is "excluded from fingerprinting **and** counted in `classesSuppressed`" — those are mutually exclusive, since counting a suppressed _class_ requires grouping first. Group-level application satisfies the observable intent (excluded from `classes`, visible in `classesSuppressed`) and is deterministic.                                                                                                                                                                             |
| P5  | `ignorePatterns` filters at **file** level, before any read. Ignored and wrong-extension files are counted in neither `filesScanned` nor `filesSkipped`.                                                                                                                         | Matches the `CloneIndex.stats` field comments verbatim: `filesSkipped` is documented as "unreadable or unparseable". `classesSuppressed`'s "or matched `ignorePatterns`" clause is therefore vacuous by construction — ignored files never produce a group.                                                                                                                                                                                                                                                                    |
| P6  | `buildCloneIndex(files, options)` where `options: Partial<DuplicationConfig> & { rootDir?: string }`, `rootDir` defaulting to `process.cwd()`. `DuplicationConfig` itself stays **verbatim per the spec** — exactly `minTokens`, `minInstances`, `ignorePatterns`, `maxClasses`. | `CloneMember.file` must be "repo-relative, posix-normalized" (`relativePosix(rootDir, abs)`), and `DuplicationConfig` has no root field. Adding `rootDir` to `DuplicationConfig` would alter a type the spec pins and that Phase 2 wires into `EntropyConfig.analyze.duplication`. An options bag keeps the pinned type untouched.                                                                                                                                                                                             |
| P7  | **Phase 1 regenerates the core barrel** (`DIR_COMMENTS.duplication` + `pnpm run generate:barrels`), even though the spec assigns barrel work to Phase 2.                                                                                                                         | **Verified:** `scripts/generate-core-barrel.mjs` `discoverStarModules()` keys purely on the existence of `<dir>/index.ts` (line ~177), and `SKIP_DIRS = new Set(Object.keys(SELECTIVE_EXPORTS))` (line 123) does not include `duplication`. The moment `duplication/index.ts` lands, `generate-core-barrel.mjs --check` goes **red** — it is green today. Phase 1 also _owns_ criterion 11 (importable from `@harness-engineering/core`), which is unachievable without it. Deferring it to Phase 2 would ship a red CI check. |
| P8  | `tokens.ts` exports `normalizeTokens` **and** `fingerprintStream`.                                                                                                                                                                                                               | The sha1-truncated-to-16-hex step is a property of the token stream, not of index assembly; keeping them adjacent means the normalization map and its digest are tested in one file. The spec names only `normalizeTokens` for `tokens.ts` but does not assign the hash elsewhere.                                                                                                                                                                                                                                             |
| P9  | Zero-discovery returns `Err(createEntropyError('INVALID_CONFIG', …))`.                                                                                                                                                                                                           | `EntropyError['code']` is a closed union in `shared/errors.ts:60-67` — `SNAPSHOT_BUILD_FAILED \| PARSE_ERROR \| ENTRY_POINT_NOT_FOUND \| INVALID_CONFIG \| CONFIG_VALIDATION_ERROR \| FIX_FAILED \| BACKUP_FAILED`. `INVALID_CONFIG` is the closest fit and avoids editing a shared union in Phase 1.                                                                                                                                                                                                                          |
| P10 | `CloneMember.unit` uses the node's own `id` / `key` name, else `'<anon>'`. No inference from an enclosing `VariableDeclarator`.                                                                                                                                                  | Spec-faithful ("`name: '<anon>'` when absent"). Checked the headline evidence: `sumCosts` is a `FunctionDeclaration` (`packages/cli/src/naming-craft/index.ts:457`, `knowledge-craft/index.ts:364`), so the named cases are unaffected. Name inference is noted as a deferrable follow-up (U4), not silently added.                                                                                                                                                                                                            |

## Uncertainties

- **[ASSUMPTION] U1** — `buildCloneIndex`'s `files` parameter is a list of **absolute file paths**
  (the shape `findFiles` returns), not `SourceFile` objects and not pre-relativized paths. Glob
  discovery stays with the caller: Phase 2's detector resolves `EntropyConfig.include`/`exclude`,
  and Phase 1's acceptance test discovers via `findFiles` over the fixture root. _If wrong:_
  Task 3's signature and Tasks 5/8 change.
- **[ASSUMPTION] U2** — P6's `rootDir` option is acceptable. _If the reviewer prefers `rootDir` on
  `DuplicationConfig` itself:_ Task 3 changes and Phase 2's config wiring gains a field.
- **[ASSUMPTION] U3** — P4's group-level bar application is the intended reading of the
  Failure-behavior bullet. _If the reviewer intends sub-`minTokens` units to be dropped before
  grouping (so they never appear in `classesSuppressed`):_ Task 5's accounting changes and the
  fixture's expected `classesSuppressed` drops from 2 to 1.
- **[DEFERRABLE] U4** — `CloneMember.unit` is `'<anon>'` for arrow functions and function
  expressions assigned to variables. This degrades report readability for `const f = () => {}`
  duplication but not grouping. Candidate Phase 3 follow-up (it affects the audit's readability,
  not the index).
- **[DEFERRABLE] U5** — NFR dimensions were not interactively elicited (no human channel in this
  invocation). The approving human should confirm the "no Phase-1 NFR task" call above, or name a
  target to add.
- **[DEFERRABLE] U6** — a changeset is required by pre-push (`pnpm run check:changesets`). Task 11
  adds a `patch` changeset for `@harness-engineering/core`. Bump level is the human's call at
  review.

## Pre-existing baseline (read this before interpreting any gate)

Measured in this worktree at plan time. **Do not attribute these to the diff.**

| Gate                                            | Status at plan time                                                                                                                                                                                              |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `harness validate`                              | **RED — exit 1, 461 pre-existing issues** (roadmap milestone/assignee hygiene, 10 grandfathered ADR number collisions per GH #1323, design-token drift in `design-craft`/`drift` tests). Unrelated to this plan. |
| `harness check-deps`                            | **GREEN** — "Analyzed 2657 module(s) across 10 layer(s). validation passed".                                                                                                                                     |
| `node scripts/generate-core-barrel.mjs --check` | **GREEN** — "Core barrel is up to date." (goes red the moment `duplication/index.ts` exists — see P7)                                                                                                            |

**Therefore:** every task below uses the targeted vitest run + package typecheck as its gate, and
treats `harness validate` as a **baseline comparison** ("no _new_ issue naming a
`packages/core/src/duplication/**` or `packages/core/tests/duplication/**` path"), never as a
pass/fail gate. A task that reports "harness validate passed" is reporting something that cannot
happen in this worktree.

## Environment facts (verified, so no task has to rediscover them)

- Core tests live in `packages/core/tests/**/*.test.ts` (386 files) — not co-located. `packages/core/tsconfig.json` **excludes** `tests`.
- `packages/core/vitest.config.mts` → `include: ['src/**/*.test.ts', 'tests/**/*.test.ts']`; `testTimeout: 60_000`; coverage thresholds lines/functions/statements 80, branches 73.
- Fixture-project precedent: `packages/core/tests/fixtures/entropy/dead-code-entrypoints/` (a `package.json` + `src/*.ts`), consumed via `join(__dirname, '../../fixtures/...')` at `packages/core/tests/entropy/detectors/dead-code.test.ts:296`.
- Core barrel test precedent: `packages/core/tests/identity/barrel.test.ts` imports from `'../../src/index'` (not from the package name — no dist build needed).
- `harness.config.json` `architecture.excludePatterns` includes `**/tests/fixtures/**`, so fixtures do not affect arch metrics.
- Helpers already in core: `readFileContent`, `findFiles(pattern, cwd, extraIgnore)`, `relativePosix(from, to)` in `src/shared/fs-utils.ts`; `createEntropyError(code, message, details?, suggestions?)` at `src/shared/errors.ts:137`; `minimatch` and `glob` are direct core dependencies.
- `@typescript-eslint/types` `AST_TOKEN_TYPES` members: `Boolean, Identifier, JSXIdentifier, PrivateIdentifier, JSXText, Keyword, Null, Numeric, Punctuator, RegularExpression, String, Template, Block, Line`. `Block`/`Line` do **not** appear in `ast.tokens` — comments are a separate array — so no comment filtering is needed.
- `parse()` **throws** on a syntax error (measured: `"'}' expected."`), so the read/parse path needs try/catch, mirroring `src/shared/parsers/typescript.ts:131-155`.
- Pre-commit runs `harness ci check` fail-closed with `SKIP="entropy,docs,perf,security,deps,phase-gate"` — **arch is not skipped**. Build core before committing (`pnpm exec turbo build --filter=@harness-engineering/core...`) or the arch gate can report a false regression from stale `dist`.
- Pre-push runs `pnpm run check:changesets`, then prettier `--check` over changed `{ts,tsx,md,json}` (**including fixture `.ts` files**), then affected typecheck + coverage ratchet.

## Dry-run evidence (this plan's code was executed before the plan was written)

Every code block below was assembled into a throwaway module in this worktree and run against the
exact fixture in Task 7, then deleted (`git status` clean). These are **measured outputs**, not
predictions — the executor should expect them verbatim.

Over the planted-clones fixture, 13 paths discovered by `findFiles('**/*.{ts,tsx,js,jsx,mjs,cjs,md}', root)`:

| Case                                  | classes reported                           | stats                                                                                                     |
| ------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `ignorePatterns: []`                  | D (87 tok, rank 261), A (83 tok, rank 249) | `scanned 12, skipped 0, units 12, reported 2, suppressed 2, truncated 0`                                  |
| `ignorePatterns: ['**/generated/**']` | A only                                     | `scanned 9, skipped 0, units 9, reported 1, suppressed 2, truncated 0`                                    |
| `minInstances: 2`                     | D, A, B (85 tok, rank 170)                 | `reported 3, suppressed 1`                                                                                |
| `minTokens: 10`                       | D, A, C (16 tok, rank 48)                  | `reported 3, suppressed 1`                                                                                |
| `maxClasses: 1`                       | D only                                     | `reported 1, suppressed 2, truncated 1`                                                                   |
| defaults (no overrides)               | A only                                     | `scanned 9, reported 1, suppressed 2` — the defaults exclude `**/generated/**`                            |
| `files: []`                           | —                                          | `Err` `INVALID_CONFIG`, "Refusing to report a pass over zero source files…"                               |
| one unreadable path only              | —                                          | `Ok`, `scanned 0, skipped 1, reported 0` — a scan that happened and found nothing, **not** zero-discovery |
| fixture + one unreadable path         | D, A                                       | `scanned 12, skipped 1, reported 2, suppressed 2`                                                         |
| input order reversed                  | identical fingerprint order                | ordering is input-independent                                                                             |

Over the nested-units fixture (3 files, `**/*.ts`):

```
{"filesScanned":3,"filesSkipped":0,"unitsFingerprinted":6,"classesReported":2,"classesSuppressed":0,"classesTruncated":0}
  class  65 tok rank 195   src/box-a.ts:1(BoxA)  src/box-b.ts:1(BoxB)  src/box-c.ts:1(BoxC)
  method 50 tok rank 150   src/box-a.ts:4(tallyA) src/box-b.ts:4(tallyB) src/box-c.ts:4(tallyC)
byMember keys: 6 distinct — src/box-{a,b,c}.ts:{1,4}
```

Six units from three files — two per file, not three: the `MethodDefinition`-value dedupe (P2) is
working, and no `<anon>` member appears.

Two further measured facts the plan depends on:

- `skipDirGlobs()` (which `DEFAULT_FIND_FILES_IGNORE` is built from) contains **no** `tests`,
  `fixtures`, or `generated` entry, so `findFiles` over the fixture root really does see the planted
  files. It _does_ skip `coverage`, `dist`, `bin`, `out`, `target`, `deps` — none of which the
  fixture uses.
- Brace-expansion globs work through `findFiles`: `'**/*.{ts,tsx,js,jsx,mjs,cjs,md}'` and `'**/*.ts'`
  both returned the same 5 files over `tests/fixtures/entropy/dead-code-entrypoints`.

## File Map

```
CREATE packages/core/src/duplication/tokens.ts
CREATE packages/core/src/duplication/units.ts
CREATE packages/core/src/duplication/index.ts
CREATE packages/core/tests/duplication/tokens.test.ts
CREATE packages/core/tests/duplication/units.test.ts
CREATE packages/core/tests/duplication/clone-index.test.ts
CREATE packages/core/tests/duplication/failure-behavior.test.ts
CREATE packages/core/tests/duplication/acceptance.test.ts
CREATE packages/core/tests/duplication/barrel.test.ts
CREATE packages/core/tests/fixtures/duplication/planted-clones/package.json
CREATE packages/core/tests/fixtures/duplication/planted-clones/README.md
CREATE packages/core/tests/fixtures/duplication/planted-clones/src/alpha.ts
CREATE packages/core/tests/fixtures/duplication/planted-clones/src/beta.ts
CREATE packages/core/tests/fixtures/duplication/planted-clones/src/gamma.ts
CREATE packages/core/tests/fixtures/duplication/planted-clones/src/pair-one.ts
CREATE packages/core/tests/fixtures/duplication/planted-clones/src/pair-two.ts
CREATE packages/core/tests/fixtures/duplication/planted-clones/src/short-one.ts
CREATE packages/core/tests/fixtures/duplication/planted-clones/src/short-two.ts
CREATE packages/core/tests/fixtures/duplication/planted-clones/src/short-three.ts
CREATE packages/core/tests/fixtures/duplication/planted-clones/src/unique.ts
CREATE packages/core/tests/fixtures/duplication/planted-clones/src/notes.md
CREATE packages/core/tests/fixtures/duplication/planted-clones/src/generated/gen-a.ts
CREATE packages/core/tests/fixtures/duplication/planted-clones/src/generated/gen-b.ts
CREATE packages/core/tests/fixtures/duplication/planted-clones/src/generated/gen-c.ts
CREATE packages/core/tests/fixtures/duplication/nested-units/package.json
CREATE packages/core/tests/fixtures/duplication/nested-units/src/box-a.ts
CREATE packages/core/tests/fixtures/duplication/nested-units/src/box-b.ts
CREATE packages/core/tests/fixtures/duplication/nested-units/src/box-c.ts
CREATE .changeset/duplication-core-module.md
MODIFY scripts/generate-core-barrel.mjs            (add DIR_COMMENTS.duplication)
MODIFY packages/core/src/index.ts                  (GENERATED — via pnpm run generate:barrels)
```

No other file is touched. In particular: **no** change to `packages/core/package.json` (zero new
dependencies — D6), **no** change to `shared/parsers/*` or `shared/errors.ts` (D7, P9), and **no**
file under `packages/core/src/entropy/`, `packages/cli/`, or `packages/core/src/index.ts` except the
generated barrel line.

## Skeleton

_Produced because task count (11) ≥ 8 at `standard` rigor._

1. **Fingerprint primitives** — `tokens.ts` (normalization + digest) and `units.ts` (ESTree unit
   extraction with the method-value dedupe) — 2 tasks, ~8 min
2. **Index assembly** — config defaults + file eligibility, per-file fingerprinting with the
   read/parse failure paths, then grouping / bars / rank / cap / `byMember` / stats, then the
   zero-discovery guard — 4 tasks, ~17 min
3. **Fixtures and acceptance** — the two fixture projects, the criterion-15 acceptance test, the
   D1 Type-2-equivalence regression test — 3 tasks, ~11 min
4. **Integration** — barrel `DIR_COMMENTS` + regeneration + criterion-11 barrel test; changeset,
   build, arch baseline, full verification — 2 tasks, ~6 min

**Estimated total:** 11 tasks, ~42 minutes.

**Skeleton approval:** ⛔ **PENDING.** The planner ran as a subagent with no human channel and could
not hold the approval gate open. The approving human should confirm this direction (and
Uncertainties U1-U3, U5) before execution begins. See the Sign-off section.

---

## Tasks

### Task 1: `tokens.ts` — Type-2 normalization and fingerprint digest

**Depends on:** none | **Files:** `packages/core/src/duplication/tokens.ts`, `packages/core/tests/duplication/tokens.test.ts` | **Owns:** `packages/core/src/duplication/tokens.ts`
**Skills:** `ts-type-guards` (reference)

1. Create `packages/core/tests/duplication/tokens.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { parse } from '@typescript-eslint/typescript-estree';
   import { normalizeTokens, fingerprintStream } from '../../src/duplication/tokens';

   function tokensOf(src: string) {
     return parse(src, { tokens: true, loc: true, range: true }).tokens ?? [];
   }

   describe('normalizeTokens', () => {
     it('maps identifiers to I and literals to L, keeping keywords and punctuators verbatim', () => {
       const src = `const abc = 'x' + 1;`;
       const stream = normalizeTokens(tokensOf(src), [0, src.length]);
       expect(stream.join(' ')).toBe('const I = L + L ;');
     });

     it('maps private identifiers to I', () => {
       const src = `class K { #p = 1; }`;
       const stream = normalizeTokens(tokensOf(src), [0, src.length]);
       expect(stream.join(' ')).toBe('class I { I = L ; }');
     });

     it('maps template literals and regular expressions to L', () => {
       const src = 'const t = `a`; const r = /x/;';
       const stream = normalizeTokens(tokensOf(src), [0, src.length]);
       expect(stream).toContain('L');
       expect(stream.join(' ')).toBe('const I = L ; const I = L ;');
     });

     it('keeps boolean and null tokens verbatim (keyword-like, not literals)', () => {
       const src = `const a = true; const b = null;`;
       const stream = normalizeTokens(tokensOf(src), [0, src.length]);
       expect(stream.join(' ')).toBe('const I = true ; const I = null ;');
     });

     it('selects only tokens fully inside the given range', () => {
       const src = `const outside = 1;\nfunction inner() { return 2; }`;
       const fnStart = src.indexOf('function');
       const stream = normalizeTokens(tokensOf(src), [fnStart, src.length]);
       expect(stream.join(' ')).toBe('function I ( ) { return L ; }');
     });
   });

   describe('fingerprintStream', () => {
     it('is a 16-character lowercase hex digest', () => {
       expect(fingerprintStream(['const', 'I', '=', 'L', ';'])).toMatch(/^[0-9a-f]{16}$/);
     });

     it('is deterministic for the same stream and differs for a different one', () => {
       const a = fingerprintStream(['const', 'I']);
       expect(fingerprintStream(['const', 'I'])).toBe(a);
       expect(fingerprintStream(['let', 'I'])).not.toBe(a);
     });

     it('separates tokens so concatenation cannot alias', () => {
       expect(fingerprintStream(['ab', 'c'])).not.toBe(fingerprintStream(['a', 'bc']));
     });
   });
   ```

2. Run `cd packages/core && npx vitest run tests/duplication/tokens.test.ts` — observe failure
   (module not found).

3. Create `packages/core/src/duplication/tokens.ts`:

   ```ts
   import { createHash } from 'node:crypto';
   import type { TSESTree } from '@typescript-eslint/typescript-estree';

   /**
    * Type-2 clone normalization (spec decision D1).
    *
    * `Identifier` / `PrivateIdentifier` / `JSXIdentifier` collapse to `I`;
    * `String` / `Numeric` / `Template` / `RegularExpression` / `JSXText` collapse
    * to `L`; every other token (`Keyword`, `Punctuator`, `Boolean`, `Null`) is
    * kept verbatim. Collapsing identifiers is load-bearing, not incidental: the
    * 16 orchestrator JSON-response copies span three different function names
    * (`sendJSON`, `sendJson`, `jsonResponse`) and cluster only once names
    * normalize away.
    *
    * `Block` / `Line` comment tokens never appear here — typescript-estree keeps
    * comments in a separate `comments` array, so the stream is comment-free by
    * construction.
    */
   const IDENTIFIER_TOKEN_TYPES = new Set<string>([
     'Identifier',
     'PrivateIdentifier',
     'JSXIdentifier',
   ]);
   const LITERAL_TOKEN_TYPES = new Set<string>([
     'String',
     'Numeric',
     'Template',
     'RegularExpression',
     'JSXText',
   ]);

   /** The normalized placeholder for any identifier-shaped token. */
   export const IDENTIFIER_PLACEHOLDER = 'I';
   /** The normalized placeholder for any literal-shaped token. */
   export const LITERAL_PLACEHOLDER = 'L';

   /**
    * Normalize the tokens falling entirely inside `range` into a Type-2 stream.
    *
    * @param tokens - The full token array from `parse(src, { tokens: true })`.
    * @param range - A `[start, end]` character range; a token is included only
    *   when `token.range[0] >= range[0] && token.range[1] <= range[1]`.
    * @returns The normalized token stream, in source order.
    */
   export function normalizeTokens(
     tokens: readonly TSESTree.Token[],
     range: readonly [number, number]
   ): string[] {
     const [start, end] = range;
     const stream: string[] = [];
     for (const token of tokens) {
       if (token.range[0] < start || token.range[1] > end) continue;
       if (IDENTIFIER_TOKEN_TYPES.has(token.type)) stream.push(IDENTIFIER_PLACEHOLDER);
       else if (LITERAL_TOKEN_TYPES.has(token.type)) stream.push(LITERAL_PLACEHOLDER);
       else stream.push(token.value);
     }
     return stream;
   }

   /**
    * Fingerprint a normalized token stream: sha1, truncated to 16 hex characters
    * (64 bits) for log and report readability. At this repository's scale
    * (~8,000 units) the expected collision count is ~1.7e-12; a collision would
    * surface as one false clone class, never as corruption. Widen to the full
    * digest if a collision is ever observed.
    *
    * Tokens are joined with a space so that `['ab','c']` and `['a','bc']` cannot
    * alias to the same digest.
    */
   export function fingerprintStream(stream: readonly string[]): string {
     return createHash('sha1').update(stream.join(' ')).digest('hex').slice(0, 16);
   }
   ```

4. Run `cd packages/core && npx vitest run tests/duplication/tokens.test.ts` — observe pass.
5. Run `cd packages/core && npx tsc --noEmit` — observe no errors.
6. Run `pnpm exec prettier --check packages/core/src/duplication/tokens.ts packages/core/tests/duplication/tokens.test.ts` (use `--write` then re-check if it fails).
7. Commit: `feat(duplication): Type-2 token normalization and fingerprint digest`

---

### Task 2: `units.ts` — ESTree unit extraction with method-value dedupe

**Depends on:** none | **Files:** `packages/core/src/duplication/units.ts`, `packages/core/tests/duplication/units.test.ts` | **Owns:** `packages/core/src/duplication/units.ts`

1. Create `packages/core/tests/duplication/units.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { parse } from '@typescript-eslint/typescript-estree';
   import { extractUnits } from '../../src/duplication/units';

   function unitsOf(src: string) {
     return extractUnits(parse(src, { tokens: true, loc: true, range: true }));
   }

   describe('extractUnits', () => {
     it('extracts a named function declaration as kind function', () => {
       const units = unitsOf(`export function f(a: number) {\n  return a;\n}\n`);
       expect(units.map((u) => [u.kind, u.name, u.startLine, u.endLine])).toEqual([
         ['function', 'f', 1, 3],
       ]);
     });

     it('excludes the export keyword from the unit range', () => {
       const src = `export function f() { return 1; }`;
       const [unit] = unitsOf(src);
       expect(src.slice(unit!.range[0], unit!.range[1]).startsWith('function')).toBe(true);
     });

     it('extracts a class and its method without a duplicate anonymous function', () => {
       // MethodDefinition.value is itself a FunctionExpression. Without the
       // dedupe this yields THREE overlapping units at the same start line.
       const units = unitsOf(
         `export class Box {\n  tally(xs: number[]) {\n    return xs.length;\n  }\n}\n`
       );
       expect(units.map((u) => `${u.kind}:${u.name}`)).toEqual(['class:Box', 'method:tally']);
     });

     it('still extracts a class-field arrow function as its own unit', () => {
       const units = unitsOf(`class Box {\n  handler = (x: number) => x + 1;\n}\n`);
       expect(units.map((u) => u.kind)).toEqual(['class', 'function']);
     });

     it('names a function expression or arrow function <anon>', () => {
       const units = unitsOf(`const f = (a: number) => a + 1;\n`);
       expect(units.map((u) => `${u.kind}:${u.name}`)).toEqual(['function:<anon>']);
     });

     it('extracts nested units (an inner arrow inside a function)', () => {
       const units = unitsOf(`function g() {\n  return [1].map((x) => x * 2);\n}\n`);
       expect(units.map((u) => `${u.kind}:${u.name}`)).toEqual(['function:g', 'function:<anon>']);
     });

     it('returns units in deterministic source order', () => {
       const units = unitsOf(`function a() { return 1; }\nfunction b() { return 2; }\n`);
       expect(units.map((u) => u.range[0])).toEqual(
         [...units.map((u) => u.range[0])].sort((x, y) => x - y)
       );
     });

     it('returns an empty array for a file with no units', () => {
       expect(unitsOf(`export const x = 1;\n`)).toEqual([]);
     });
   });
   ```

2. Run `cd packages/core && npx vitest run tests/duplication/units.test.ts` — observe failure.

3. Create `packages/core/src/duplication/units.ts`:

   ```ts
   import type { TSESTree } from '@typescript-eslint/typescript-estree';

   /**
    * The granularity at which duplication is reported (spec decision D2):
    * whole functions, methods, and classes — never sub-unit windows.
    */
   export type CloneUnitKind = 'function' | 'method' | 'class';

   /** A single fingerprintable source unit, located in its file. */
   export interface DupUnit {
     kind: CloneUnitKind;
     /** The unit's declared identifier, or `'<anon>'` when it has none. */
     name: string;
     startLine: number;
     endLine: number;
     /** `[start, end]` character offsets, used to select the unit's tokens. */
     range: [number, number];
   }

   /** ESTree node types that constitute a reportable unit, mapped to their kind. */
   const UNIT_KINDS: Record<string, CloneUnitKind> = {
     FunctionDeclaration: 'function',
     FunctionExpression: 'function',
     ArrowFunctionExpression: 'function',
     MethodDefinition: 'method',
     ClassDeclaration: 'class',
   };

   /** The declared name of a unit node, or `'<anon>'`. */
   function unitName(node: Record<string, unknown>): string {
     const id = node['id'] as { name?: string } | null | undefined;
     if (id?.name !== undefined) return id.name;
     const key = node['key'] as { name?: string } | null | undefined;
     if (key?.name !== undefined) return key.name;
     return '<anon>';
   }

   /**
    * Extract every reportable unit from an ESTree program, in source order.
    *
    * A `MethodDefinition`'s `.value` is itself a `FunctionExpression`, so a naive
    * walk reports one method three times — as the enclosing class, as the method,
    * and as an anonymous function — two of which collide on the
    * `${file}:${startLine}` key `CloneIndex.byMember` uses. The method therefore
    * consumes its own value node. A class-field arrow (`handler = (x) => …`) is a
    * `PropertyDefinition` value and is deliberately NOT consumed: it is a real
    * unit with no method wrapper of its own.
    */
   export function extractUnits(ast: TSESTree.Program): DupUnit[] {
     const units: DupUnit[] = [];
     const consumed = new Set<object>();

     const walk = (node: unknown): void => {
       if (node === null || typeof node !== 'object') return;
       const record = node as Record<string, unknown>;
       if (typeof record['type'] === 'string') {
         const kind = UNIT_KINDS[record['type'] as string];
         if (kind !== undefined && !consumed.has(node)) {
           if (record['type'] === 'MethodDefinition') {
             const value = record['value'];
             if (value !== null && typeof value === 'object') consumed.add(value);
           }
           const loc = record['loc'] as TSESTree.SourceLocation;
           const range = record['range'] as [number, number];
           units.push({
             kind,
             name: unitName(record),
             startLine: loc.start.line,
             endLine: loc.end.line,
             range: [range[0], range[1]],
           });
         }
       }
       for (const value of Object.values(record)) {
         if (Array.isArray(value)) {
           for (const item of value) walk(item);
         } else {
           walk(value);
         }
       }
     };

     walk(ast);
     units.sort((a, b) => a.range[0] - b.range[0] || a.range[1] - b.range[1]);
     return units;
   }
   ```

4. Run `cd packages/core && npx vitest run tests/duplication/units.test.ts` — observe pass.
5. Run `cd packages/core && npx tsc --noEmit`.
6. Run `pnpm exec prettier --check` on both files (`--write` then re-check if needed).
7. Commit: `feat(duplication): ESTree whole-unit extraction with method-value dedupe`

---

### Task 3: `index.ts` — config types, defaults, and file eligibility

**Depends on:** Task 1, Task 2 | **Files:** `packages/core/src/duplication/index.ts`, `packages/core/tests/duplication/clone-index.test.ts` | **Owns:** `packages/core/src/duplication/index.ts`
**Skills:** `ts-utility-types` (reference — `Partial<DuplicationConfig>`)

1. Create `packages/core/tests/duplication/clone-index.test.ts` with only the config/eligibility
   describe block for now (Task 5 appends to this file):

   ```ts
   import { describe, it, expect } from 'vitest';
   import {
     DEFAULT_DUPLICATION_CONFIG,
     resolveDuplicationConfig,
     isEligibleFile,
   } from '../../src/duplication/index';

   describe('resolveDuplicationConfig', () => {
     it('applies the Rule-of-Three defaults', () => {
       expect(DEFAULT_DUPLICATION_CONFIG.minTokens).toBe(40);
       expect(DEFAULT_DUPLICATION_CONFIG.minInstances).toBe(3);
       expect(DEFAULT_DUPLICATION_CONFIG.maxClasses).toBe(100);
     });

     it('returns the defaults when given nothing', () => {
       expect(resolveDuplicationConfig()).toEqual(DEFAULT_DUPLICATION_CONFIG);
     });

     it('overrides only the supplied fields', () => {
       const resolved = resolveDuplicationConfig({ minInstances: 2 });
       expect(resolved.minInstances).toBe(2);
       expect(resolved.minTokens).toBe(DEFAULT_DUPLICATION_CONFIG.minTokens);
     });

     it('honours an explicitly empty ignorePatterns rather than falling back to defaults', () => {
       expect(resolveDuplicationConfig({ ignorePatterns: [] }).ignorePatterns).toEqual([]);
     });
   });

   describe('isEligibleFile', () => {
     const noIgnore = { ignorePatterns: [] as string[] };

     it.each(['a.ts', 'a.tsx', 'a.js', 'a.jsx', 'a.mjs', 'a.cjs'])(
       'accepts the supported extension %s',
       (file) => {
         expect(isEligibleFile(file, noIgnore.ignorePatterns)).toBe(true);
       }
     );

     it.each(['a.py', 'a.go', 'a.md', 'a.json', 'a.d.ts'])('rejects %s', (file) => {
       expect(isEligibleFile(file, noIgnore.ignorePatterns)).toBe(false);
     });

     it('rejects a file matched by an ignore pattern', () => {
       expect(isEligibleFile('src/generated/gen.ts', ['**/generated/**'])).toBe(false);
     });

     it('rejects test, fixture, and barrel files under the defaults', () => {
       const ignore = DEFAULT_DUPLICATION_CONFIG.ignorePatterns;
       expect(isEligibleFile('src/a.test.ts', ignore)).toBe(false);
       expect(isEligibleFile('tests/fixtures/x/src/a.ts', ignore)).toBe(false);
       expect(isEligibleFile('src/index.ts', ignore)).toBe(false);
       expect(isEligibleFile('src/service.ts', ignore)).toBe(true);
     });
   });
   ```

2. Run `cd packages/core && npx vitest run tests/duplication/clone-index.test.ts` — observe failure.

3. Create `packages/core/src/duplication/index.ts` with the types, defaults, and eligibility filter
   (Tasks 4-6 append to this file; nothing here is rewritten later):

   ```ts
   import { minimatch } from 'minimatch';
   import type { CloneUnitKind } from './units';

   export type { CloneUnitKind, DupUnit } from './units';
   export { extractUnits } from './units';
   export {
     normalizeTokens,
     fingerprintStream,
     IDENTIFIER_PLACEHOLDER,
     LITERAL_PLACEHOLDER,
   } from './tokens';

   /** One occurrence of a clone class, located in its file. */
   export interface CloneMember {
     /** Repo-relative, POSIX-normalized path. */
     file: string;
     /** The unit's identifier, or `'<anon>'`. */
     unit: string;
     kind: CloneUnitKind;
     startLine: number;
     endLine: number;
   }

   /** A set of units sharing one normalized token-stream fingerprint. */
   export interface CloneClass {
     /** sha1 of the normalized token stream, 16 hex characters. */
     fingerprint: string;
     tokenCount: number;
     /** Length is always `>= minInstances`. */
     members: CloneMember[];
     /** `tokenCount * members.length` — the ranking key. */
     rank: number;
     /**
      * Always `'duplicate'` in Phase 1. The `'partial-extraction'` derivation
      * (spec decision D8) lands in Phase 4; the field exists now so #1612/#1646
      * bind against a stable interface.
      */
     signal: 'duplicate' | 'partial-extraction';
     /** Set only when `signal === 'partial-extraction'` — unset in Phase 1. */
     sharedImport?: string;
   }

   /** The clone index over one discovered file set. */
   export interface CloneIndex {
     /** Qualifying classes, rank-descending, capped at `maxClasses`. */
     classes: CloneClass[];
     /** `${file}:${startLine}` -> owning class. The seam for code-craft (Phase 5). */
     byMember: Map<string, CloneClass>;
     stats: {
       filesScanned: number;
       /** Unreadable or unparseable — see the spec's Failure behavior section. */
       filesSkipped: number;
       unitsFingerprinted: number;
       classesReported: number;
       /** Groups of >= 2 members dropped by the minInstances / minTokens bars. */
       classesSuppressed: number;
       /** Groups dropped by the maxClasses report cap. */
       classesTruncated: number;
     };
   }

   /** Tunables for the duplication index. */
   export interface DuplicationConfig {
     /** Minimum normalized tokens for a class to be reported. Default 40. */
     minTokens: number;
     /** Minimum members for a class to be reported. Default 3 (Rule of Three). */
     minInstances: number;
     /** Globs matched against the repo-relative path; matches are never read. */
     ignorePatterns: string[];
     /** Report cap; the top `maxClasses` by rank survive. Default 100. */
     maxClasses: number;
   }

   /**
    * TS/JS only (spec decision D9) — exactly the existing static-analysis
    * surface. Mirrors `comprehension/static-extractor.ts`'s
    * `STATIC_SUPPORTED_EXTENSIONS`; duplicated as a local constant rather than
    * imported so the duplication module takes on no cross-module dependency.
    */
   const SUPPORTED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'] as const;

   /** Default exclusions: tests, fixtures, generated files, declarations, barrels. */
   const DEFAULT_IGNORE_PATTERNS: string[] = [
     '**/*.test.ts',
     '**/*.test.tsx',
     '**/*.test.js',
     '**/*.test.jsx',
     '**/*.spec.ts',
     '**/*.spec.tsx',
     '**/*.spec.js',
     '**/*.spec.jsx',
     '**/*.bench.ts',
     '**/tests/**',
     '**/test/**',
     '**/__tests__/**',
     '**/fixtures/**',
     '**/__fixtures__/**',
     '**/generated/**',
     '**/*.generated.ts',
     '**/index.ts',
     '**/index.js',
     '**/index.mjs',
     '**/index.cjs',
   ];

   /** The shipped defaults: Rule of Three above a 40-token floor, capped at 100. */
   export const DEFAULT_DUPLICATION_CONFIG: DuplicationConfig = {
     minTokens: 40,
     minInstances: 3,
     ignorePatterns: DEFAULT_IGNORE_PATTERNS,
     maxClasses: 100,
   };

   /** Options accepted by {@link buildCloneIndex}. */
   export interface BuildCloneIndexOptions extends Partial<DuplicationConfig> {
     /**
      * Root that `CloneMember.file` is made relative to. Defaults to
      * `process.cwd()`. Kept off `DuplicationConfig` so that type stays exactly
      * as specified and as Phase 2 wires it into `EntropyConfig`.
      */
     rootDir?: string;
   }

   /** Merge partial options over the defaults. */
   export function resolveDuplicationConfig(
     overrides: Partial<DuplicationConfig> = {}
   ): DuplicationConfig {
     return { ...DEFAULT_DUPLICATION_CONFIG, ...overrides };
   }

   /**
    * True when a repo-relative path is a supported source file that no ignore
    * pattern matches. Ineligible files are never read, so they appear in neither
    * `filesScanned` nor `filesSkipped`.
    *
    * `.d.ts` is rejected explicitly: it ends in `.ts` but carries no logic, so a
    * declaration clone class would be a guaranteed false positive under the
    * spec's own audit rejection criteria.
    */
   export function isEligibleFile(relPath: string, ignorePatterns: readonly string[]): boolean {
     if (relPath.endsWith('.d.ts')) return false;
     if (!SUPPORTED_EXTENSIONS.some((ext) => relPath.endsWith(ext))) return false;
     return !ignorePatterns.some((pattern) => minimatch(relPath, pattern, { dot: true }));
   }
   ```

4. Run `cd packages/core && npx vitest run tests/duplication/clone-index.test.ts` — observe pass.
5. Run `cd packages/core && npx tsc --noEmit`.
6. Run `pnpm exec prettier --check` on both files.
7. Commit: `feat(duplication): clone index types, defaults, and file eligibility`

---

### Task 4: per-file fingerprinting with the read and parse failure paths

**Depends on:** Task 3 | **Files:** `packages/core/src/duplication/index.ts`, `packages/core/tests/duplication/failure-behavior.test.ts` | **Owns:** `packages/core/src/duplication/index.ts`

1. Create `packages/core/tests/duplication/failure-behavior.test.ts`:

   ```ts
   import { describe, it, expect, beforeAll, afterAll } from 'vitest';
   import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
   import { tmpdir } from 'node:os';
   import { join } from 'node:path';
   import { fingerprintFile } from '../../src/duplication/index';

   let root: string;

   beforeAll(async () => {
     root = await mkdtemp(join(tmpdir(), 'dup-fail-'));
     await mkdir(join(root, 'src'), { recursive: true });
     await writeFile(
       join(root, 'src', 'good.ts'),
       `export function ok(a: number) {\n  return a + 1;\n}\n`,
       'utf8'
     );
     await writeFile(join(root, 'src', 'broken.ts'), `export function broken( {\n`, 'utf8');
   });

   afterAll(async () => {
     await rm(root, { recursive: true, force: true });
   });

   describe('fingerprintFile', () => {
     it('returns fingerprinted units for a readable, parseable file', async () => {
       const result = await fingerprintFile(join(root, 'src', 'good.ts'), 'src/good.ts');
       expect(result.status).toBe('scanned');
       if (result.status !== 'scanned') return;
       expect(result.units.map((u) => u.member.unit)).toEqual(['ok']);
       expect(result.units[0]!.fingerprint).toMatch(/^[0-9a-f]{16}$/);
       expect(result.units[0]!.member.file).toBe('src/good.ts');
     });

     it('reports skipped for an unreadable file rather than throwing', async () => {
       const result = await fingerprintFile(join(root, 'src', 'absent.ts'), 'src/absent.ts');
       expect(result.status).toBe('skipped');
       if (result.status !== 'skipped') return;
       expect(result.reason).toBe('unreadable');
     });

     it('reports skipped for an unparseable file rather than throwing', async () => {
       const result = await fingerprintFile(join(root, 'src', 'broken.ts'), 'src/broken.ts');
       expect(result.status).toBe('skipped');
       if (result.status !== 'skipped') return;
       expect(result.reason).toBe('unparseable');
       expect(result.message.length).toBeGreaterThan(0);
     });

     it('parses .tsx with the jsx option enabled', async () => {
       const tsx = join(root, 'src', 'view.tsx');
       await writeFile(
         tsx,
         `export function View() {\n  return <div className="a">hi</div>;\n}\n`,
         'utf8'
       );
       const result = await fingerprintFile(tsx, 'src/view.tsx');
       expect(result.status).toBe('scanned');
     });
   });
   ```

2. Run `cd packages/core && npx vitest run tests/duplication/failure-behavior.test.ts` — observe
   failure.

3. **Append** to `packages/core/src/duplication/index.ts`:

   ```ts
   import { parse } from '@typescript-eslint/typescript-estree';
   import type { TSESTree } from '@typescript-eslint/typescript-estree';
   import { readFileContent } from '../shared/fs-utils';
   import { extractUnits as extractUnitsImpl } from './units';
   import { normalizeTokens as normalize, fingerprintStream as digest } from './tokens';

   /** One fingerprinted unit: its digest, token count, and located member. */
   export interface FingerprintedUnit {
     fingerprint: string;
     tokenCount: number;
     member: CloneMember;
   }

   /** Why a file produced no units. */
   export type FileSkipReason = 'unreadable' | 'unparseable';

   /** Outcome of fingerprinting one file. */
   export type FingerprintFileResult =
     | { status: 'scanned'; units: FingerprintedUnit[] }
     | { status: 'skipped'; reason: FileSkipReason; message: string };

   /**
    * Read, parse, and fingerprint every unit in one file.
    *
    * The module parses the file itself rather than consuming
    * `snapshot.files[].ast` (spec decision D7): `AST` is a lossy
    * `{ type, body: unknown, language }` wrapper and the parser registry
    * defaults to tree-sitter, so estree tokens would not survive the snapshot.
    * Precedent for a detector doing its own reads:
    * `entropy/detectors/complexity.ts`.
    *
    * Never throws: an unreadable or unparseable file resolves to
    * `{ status: 'skipped' }` so the caller can increment `filesSkipped` and
    * continue. Phase 2's detector converts a skip into an `AnalysisError` with
    * `analyzer: 'duplication'`; the entropy types live there, not here.
    *
    * @param absPath - Absolute path to read.
    * @param relPath - Repo-relative POSIX path recorded on each `CloneMember`.
    */
   export async function fingerprintFile(
     absPath: string,
     relPath: string
   ): Promise<FingerprintFileResult> {
     const contentResult = await readFileContent(absPath);
     if (!contentResult.ok) {
       return { status: 'skipped', reason: 'unreadable', message: contentResult.error.message };
     }

     // Explicitly typed, not an evolving `let`. Definite-assignment analysis
     // proves it is set: the catch arm returns. Verified: `tsc --noEmit -p
     // packages/core/tsconfig.json` accepts this shape.
     let program: TSESTree.Program;
     try {
       program = parse(contentResult.value, {
         tokens: true,
         loc: true,
         range: true,
         jsx: relPath.endsWith('.tsx') || relPath.endsWith('.jsx'),
         errorOnUnknownASTType: false,
       });
     } catch (e) {
       return { status: 'skipped', reason: 'unparseable', message: (e as Error).message };
     }

     const tokens = program.tokens ?? [];
     const units: FingerprintedUnit[] = [];
     for (const unit of extractUnitsImpl(program)) {
       const stream = normalize(tokens, unit.range);
       units.push({
         fingerprint: digest(stream),
         tokenCount: stream.length,
         member: {
           file: relPath,
           unit: unit.name,
           kind: unit.kind,
           startLine: unit.startLine,
           endLine: unit.endLine,
         },
       });
     }
     return { status: 'scanned', units };
   }
   ```

   Note: `jsx` is enabled for `.tsx`/`.jsx` only, mirroring
   `src/shared/parsers/typescript.ts:137`.

4. Run `cd packages/core && npx vitest run tests/duplication/failure-behavior.test.ts` — observe
   pass.
5. Run `cd packages/core && npx tsc --noEmit`.
6. Run `pnpm exec prettier --check` on both files.
7. Commit: `feat(duplication): per-file fingerprinting with read and parse skip paths`

---

### Task 5: `buildCloneIndex` — grouping, bars, rank, cap, byMember, stats

**Depends on:** Task 4 | **Files:** `packages/core/src/duplication/index.ts`, `packages/core/tests/duplication/clone-index.test.ts` | **Owns:** `packages/core/src/duplication/index.ts`

1. **Append** to `packages/core/tests/duplication/clone-index.test.ts`. Move the four `import`
   statements to the top of the file alongside the existing ones (ESM hoists them, but keep
   `import/first` satisfied); `buildCloneIndex` joins the existing
   `'../../src/duplication/index'` import line:

   ```ts
   import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
   import { tmpdir } from 'node:os';
   import { join } from 'node:path';

   /** A >=40-token body parameterised only by identifier names (Type-2 clone). */
   const body = (fn: string, p: string, acc: string, el: string) =>
     `export function ${fn}(${p}: { cost: number; label: string }[]) {\n` +
     `  let ${acc} = 0;\n` +
     `  const seen: string[] = [];\n` +
     `  for (const ${el} of ${p}) {\n` +
     `    if (${el}.cost > 0) {\n` +
     `      ${acc} += ${el}.cost;\n` +
     `      seen.push(${el}.label);\n` +
     `    }\n` +
     `  }\n` +
     `  return { total: ${acc}, labels: seen };\n` +
     `}\n`;

   /**
    * A second, STRUCTURALLY distinct >=40-token body (`while`/`pop`/`break`
    * instead of `for…of`/`if`). Varying only literals or member names would NOT
    * produce a second fingerprint — see the "near miss" note in Task 7.
    */
   const bodyB = (fn: string, p: string, acc: string, el: string) =>
     `export function ${fn}(${p}: Record<string, number>): string[] {\n` +
     `  const ${acc}: string[] = [];\n` +
     `  const keys = Object.keys(${p});\n` +
     `  while (keys.length > 0) {\n` +
     `    const ${el} = keys.pop();\n` +
     `    if (${el} === undefined) {\n` +
     `      break;\n` +
     `    }\n` +
     `    ${acc}.push(${el} + '=' + String(${p}[${el}]));\n` +
     `  }\n` +
     `  return ${acc};\n` +
     `}\n`;

   async function scratch(files: Record<string, string>): Promise<string> {
     const root = await mkdtemp(join(tmpdir(), 'dup-idx-'));
     for (const [rel, content] of Object.entries(files)) {
       const abs = join(root, rel);
       await mkdir(join(abs, '..'), { recursive: true });
       await writeFile(abs, content, 'utf8');
     }
     return root;
   }

   describe('buildCloneIndex', () => {
     it('groups three Type-2 clones into one class and reports stats', async () => {
       const root = await scratch({
         'src/a.ts': body('sumAlpha', 'items', 'total', 'item'),
         'src/b.ts': body('addBeta', 'rows', 'acc', 'row'),
         'src/c.ts': body('tallyGamma', 'entries', 'sum', 'entry'),
       });
       try {
         const result = await buildCloneIndex(
           ['src/a.ts', 'src/b.ts', 'src/c.ts'].map((f) => join(root, f)),
           { rootDir: root, ignorePatterns: [] }
         );
         expect(result.ok).toBe(true);
         if (!result.ok) return;
         const index = result.value;
         expect(index.classes.map((c) => c.members.length)).toEqual([3]);
         expect(index.classes[0]!.members.map((m) => m.file)).toEqual([
           'src/a.ts',
           'src/b.ts',
           'src/c.ts',
         ]);
         expect(index.classes[0]!.signal).toBe('duplicate');
         expect(index.classes[0]!.sharedImport).toBeUndefined();
         expect(index.classes[0]!.rank).toBe(
           index.classes[0]!.tokenCount * index.classes[0]!.members.length
         );
         expect(index.stats.filesScanned).toBe(3);
         expect(index.stats.filesSkipped).toBe(0);
         expect(index.stats.classesReported).toBe(index.classes.length);
         expect(index.stats.unitsFingerprinted).toBe(3);
       } finally {
         await rm(root, { recursive: true, force: true });
       }
     });

     it('suppresses a two-member group under the default minInstances of 3', async () => {
       const root = await scratch({
         'src/a.ts': body('sumAlpha', 'items', 'total', 'item'),
         'src/b.ts': body('addBeta', 'rows', 'acc', 'row'),
       });
       try {
         const result = await buildCloneIndex([join(root, 'src/a.ts'), join(root, 'src/b.ts')], {
           rootDir: root,
           ignorePatterns: [],
         });
         if (!result.ok) throw new Error('expected ok');
         expect(result.value.classes).toEqual([]);
         expect(result.value.stats.classesSuppressed).toBe(1);
       } finally {
         await rm(root, { recursive: true, force: true });
       }
     });

     it('suppresses a three-member group below minTokens', async () => {
       const tiny = (n: string) => `export function ${n}(a: number) {\n  return a + 1;\n}\n`;
       const root = await scratch({
         'src/a.ts': tiny('one'),
         'src/b.ts': tiny('two'),
         'src/c.ts': tiny('three'),
       });
       try {
         const result = await buildCloneIndex(
           ['src/a.ts', 'src/b.ts', 'src/c.ts'].map((f) => join(root, f)),
           { rootDir: root, ignorePatterns: [] }
         );
         if (!result.ok) throw new Error('expected ok');
         expect(result.value.classes).toEqual([]);
         expect(result.value.stats.classesSuppressed).toBe(1);
       } finally {
         await rm(root, { recursive: true, force: true });
       }
     });

     it('counts a singleton group in neither classes nor classesSuppressed', async () => {
       const root = await scratch({ 'src/a.ts': body('sumAlpha', 'items', 'total', 'item') });
       try {
         const result = await buildCloneIndex([join(root, 'src/a.ts')], {
           rootDir: root,
           ignorePatterns: [],
         });
         if (!result.ok) throw new Error('expected ok');
         expect(result.value.classes).toEqual([]);
         expect(result.value.stats.classesSuppressed).toBe(0);
       } finally {
         await rm(root, { recursive: true, force: true });
       }
     });

     it('caps at maxClasses by rank and records the dropped count', async () => {
       // Two STRUCTURALLY distinct bodies. `bodyB` must differ in keywords and
       // punctuators, not merely in literals or member names — those normalize
       // to `L` / `I` and would collapse both groups into one fingerprint.
       const root = await scratch({
         'src/a1.ts': body('sumAlpha', 'items', 'total', 'item'),
         'src/a2.ts': body('addBeta', 'rows', 'acc', 'row'),
         'src/a3.ts': body('tallyGamma', 'entries', 'sum', 'entry'),
         'src/b1.ts': bodyB('pickOne', 'table', 'out', 'key'),
         'src/b2.ts': bodyB('pickTwo', 'lookup', 'list', 'name'),
         'src/b3.ts': bodyB('pickThree', 'map', 'acc', 'field'),
       });
       try {
         const abs = ['a1', 'a2', 'a3', 'b1', 'b2', 'b3'].map((f) => join(root, `src/${f}.ts`));
         const uncapped = await buildCloneIndex(abs, { rootDir: root, ignorePatterns: [] });
         if (!uncapped.ok) throw new Error('expected ok');
         const allRanks = uncapped.value.classes.map((c) => c.rank);
         expect(allRanks).toEqual([...allRanks].sort((x, y) => y - x));
         expect(uncapped.value.stats.classesReported).toBe(2);

         const capped = await buildCloneIndex(abs, {
           rootDir: root,
           ignorePatterns: [],
           maxClasses: 1,
         });
         if (!capped.ok) throw new Error('expected ok');
         expect(capped.value.stats.classesReported).toBe(1);
         expect(capped.value.stats.classesTruncated).toBe(allRanks.length - 1);
         expect(capped.value.classes.map((c) => c.rank)).toEqual([Math.max(...allRanks)]);
       } finally {
         await rm(root, { recursive: true, force: true });
       }
     });

     it('sorts classes rank-descending and deterministically', async () => {
       const root = await scratch({
         'src/a.ts': body('sumAlpha', 'items', 'total', 'item'),
         'src/b.ts': body('addBeta', 'rows', 'acc', 'row'),
         'src/c.ts': body('tallyGamma', 'entries', 'sum', 'entry'),
       });
       try {
         const abs = ['src/a.ts', 'src/b.ts', 'src/c.ts'].map((f) => join(root, f));
         const first = await buildCloneIndex(abs, { rootDir: root, ignorePatterns: [] });
         const second = await buildCloneIndex([...abs].reverse(), {
           rootDir: root,
           ignorePatterns: [],
         });
         if (!first.ok || !second.ok) throw new Error('expected ok');
         expect(second.value.classes.map((c) => c.fingerprint)).toEqual(
           first.value.classes.map((c) => c.fingerprint)
         );
         const ranks = first.value.classes.map((c) => c.rank);
         expect(ranks).toEqual([...ranks].sort((a, b) => b - a));
       } finally {
         await rm(root, { recursive: true, force: true });
       }
     });

     it('maps byMember by file:startLine, resolving a collision to the higher-ranked class', async () => {
       const root = await scratch({
         'src/a.ts': body('sumAlpha', 'items', 'total', 'item'),
         'src/b.ts': body('addBeta', 'rows', 'acc', 'row'),
         'src/c.ts': body('tallyGamma', 'entries', 'sum', 'entry'),
       });
       try {
         const result = await buildCloneIndex(
           ['src/a.ts', 'src/b.ts', 'src/c.ts'].map((f) => join(root, f)),
           { rootDir: root, ignorePatterns: [] }
         );
         if (!result.ok) throw new Error('expected ok');
         const index = result.value;
         for (const cls of index.classes) {
           for (const member of cls.members) {
             expect(index.byMember.get(`${member.file}:${member.startLine}`)).toBe(cls);
           }
         }
       } finally {
         await rm(root, { recursive: true, force: true });
       }
     });

     it('skips an ineligible extension without counting it as scanned or skipped', async () => {
       const root = await scratch({
         'src/a.ts': body('sumAlpha', 'items', 'total', 'item'),
         'src/b.ts': body('addBeta', 'rows', 'acc', 'row'),
         'src/c.ts': body('tallyGamma', 'entries', 'sum', 'entry'),
         'src/notes.md': '# not source\n',
       });
       try {
         const result = await buildCloneIndex(
           ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/notes.md'].map((f) => join(root, f)),
           { rootDir: root, ignorePatterns: [] }
         );
         if (!result.ok) throw new Error('expected ok');
         expect(result.value.stats.filesScanned).toBe(3);
         expect(result.value.stats.filesSkipped).toBe(0);
       } finally {
         await rm(root, { recursive: true, force: true });
       }
     });

     it('counts an unreadable listed file in filesSkipped and still completes', async () => {
       const root = await scratch({
         'src/a.ts': body('sumAlpha', 'items', 'total', 'item'),
         'src/b.ts': body('addBeta', 'rows', 'acc', 'row'),
         'src/c.ts': body('tallyGamma', 'entries', 'sum', 'entry'),
       });
       try {
         const result = await buildCloneIndex(
           ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/absent.ts'].map((f) => join(root, f)),
           { rootDir: root, ignorePatterns: [] }
         );
         if (!result.ok) throw new Error('expected ok');
         expect(result.value.stats.filesSkipped).toBe(1);
         expect(result.value.stats.classesReported).toBe(1);
       } finally {
         await rm(root, { recursive: true, force: true });
       }
     });
   });
   ```

2. Run `cd packages/core && npx vitest run tests/duplication/clone-index.test.ts` — observe failure.

3. **Append** to `packages/core/src/duplication/index.ts`:

   ```ts
   import type { Result } from '../shared/result';
   import { Ok, Err } from '../shared/result';
   import type { EntropyError } from '../shared/errors';
   import { createEntropyError } from '../shared/errors';
   import { relativePosix } from '../shared/fs-utils';

   /**
    * Build a Type-1/2 clone index over `files`.
    *
    * Single-pass by construction — one parse per file, one digest per unit, one
    * `Map` grouping pass. There is no member-against-member comparison, so cost
    * is linear in total tokens, not quadratic in unit count.
    *
    * Discovery is the caller's: `files` is a list of absolute paths, so nothing
    * here assumes any repository layout (success criterion 15). Ineligible paths
    * (unsupported extension, or matched by `ignorePatterns`) are dropped before
    * any read and are counted in neither `filesScanned` nor `filesSkipped`.
    *
    * @param files - Absolute file paths, e.g. the output of `findFiles`.
    * @param options - Partial {@link DuplicationConfig} plus an optional
    *   `rootDir` (default `process.cwd()`) that member paths are relative to.
    */
   export async function buildCloneIndex(
     files: readonly string[],
     options: BuildCloneIndexOptions = {}
   ): Promise<Result<CloneIndex, EntropyError>> {
     const { rootDir = process.cwd(), ...overrides } = options;
     const config = resolveDuplicationConfig(overrides);

     const eligible: Array<{ abs: string; rel: string }> = [];
     for (const abs of files) {
       const rel = relativePosix(rootDir, abs);
       if (isEligibleFile(rel, config.ignorePatterns)) eligible.push({ abs, rel });
     }

     if (eligible.length === 0) {
       return Err(
         createEntropyError(
           'INVALID_CONFIG',
           `Refusing to report a pass over zero source files: duplication discovery resolved ${files.length} candidate path(s) and 0 eligible TS/JS source file(s) under ${rootDir}.`,
           { reason: 'zero-files-discovered', file: rootDir },
           [
             'Check that EntropyConfig.include matches real source paths',
             'Check that EntropyConfig.exclude / duplication.ignorePatterns are not excluding everything',
             'Confirm the project contains .ts/.tsx/.js/.jsx/.mjs/.cjs sources',
           ]
         )
       );
     }

     let filesScanned = 0;
     let filesSkipped = 0;
     let unitsFingerprinted = 0;
     const groups = new Map<string, FingerprintedUnit[]>();

     for (const { abs, rel } of eligible) {
       const outcome = await fingerprintFile(abs, rel);
       if (outcome.status === 'skipped') {
         filesSkipped += 1;
         continue;
       }
       filesScanned += 1;
       for (const unit of outcome.units) {
         unitsFingerprinted += 1;
         const bucket = groups.get(unit.fingerprint);
         if (bucket === undefined) groups.set(unit.fingerprint, [unit]);
         else bucket.push(unit);
       }
     }

     // Apply the bars at GROUP level (see plan decision P4): a group of >= 2
     // members that fails minInstances or minTokens is suppressed, not reported.
     // A singleton group is not duplication and is counted nowhere.
     const qualifying: CloneClass[] = [];
     let classesSuppressed = 0;
     for (const [fingerprint, units] of groups) {
       if (units.length < 2) continue;
       const tokenCount = units[0]!.tokenCount;
       if (units.length < config.minInstances || tokenCount < config.minTokens) {
         classesSuppressed += 1;
         continue;
       }
       const members = units
         .map((u) => u.member)
         .sort((a, b) => a.file.localeCompare(b.file) || a.startLine - b.startLine);
       qualifying.push({
         fingerprint,
         tokenCount,
         members,
         rank: tokenCount * members.length,
         // Phase 1 always 'duplicate'; the partial-extraction derivation is Phase 4.
         signal: 'duplicate',
       });
     }

     // Rank-descending, with fingerprint as a deterministic tiebreak so the
     // reported order never depends on filesystem or input ordering.
     qualifying.sort((a, b) => b.rank - a.rank || a.fingerprint.localeCompare(b.fingerprint));
     const classes = qualifying.slice(0, config.maxClasses);
     const classesTruncated = qualifying.length - classes.length;

     // byMember: first writer wins, iterating rank-descending, so an ambiguous
     // `${file}:${startLine}` key (a function and a nested arrow can share a
     // line) resolves deterministically to the highest-ranked owning class.
     const byMember = new Map<string, CloneClass>();
     for (const cls of classes) {
       for (const member of cls.members) {
         const key = `${member.file}:${member.startLine}`;
         if (!byMember.has(key)) byMember.set(key, cls);
       }
     }

     return Ok({
       classes,
       byMember,
       stats: {
         filesScanned,
         filesSkipped,
         unitsFingerprinted,
         classesReported: classes.length,
         classesSuppressed,
         classesTruncated,
       },
     });
   }
   ```

   Consolidate these with the imports added in Tasks 3 and 4 — the finished `index.ts` has one
   import block at the top, not four. `readFileContent` and `relativePosix` come from the same
   `../shared/fs-utils` module, and `EntropyError` / `createEntropyError` from the same
   `../shared/errors` module.

4. Run `cd packages/core && npx vitest run tests/duplication/clone-index.test.ts` — observe pass.
5. Run `cd packages/core && npx vitest run tests/duplication` — observe all four suites pass.
6. Run `cd packages/core && npx tsc --noEmit`.
7. Run `pnpm exec prettier --check` on both files.
8. Commit: `feat(duplication): buildCloneIndex grouping, ranking, report cap, and stats`

---

### Task 6: zero-discovery guard — never report a pass over zero files

**Depends on:** Task 5 | **Files:** `packages/core/tests/duplication/failure-behavior.test.ts` | **Owns:** `packages/core/tests/duplication/failure-behavior.test.ts`

The guard itself landed in Task 5 (it must precede the scan loop). This task pins its contract.

1. Add `buildCloneIndex` to the **existing top-of-file import** in
   `packages/core/tests/duplication/failure-behavior.test.ts` (ESM hoists imports, but
   `import/first` and readability both want it at the top):

   ```ts
   import { fingerprintFile, buildCloneIndex } from '../../src/duplication/index';
   ```

   Then **append** the new describe block to the same file:

   ```ts
   describe('zero-discovery guard', () => {
     it('returns Err for an empty file list rather than an empty index', async () => {
       const result = await buildCloneIndex([], { rootDir: root });
       expect(result.ok).toBe(false);
       if (result.ok) return;
       expect(result.error.code).toBe('INVALID_CONFIG');
       expect(result.error.message).toMatch(/zero source files/i);
       expect(result.error.details.reason).toBe('zero-files-discovered');
       expect(result.error.suggestions.length).toBeGreaterThan(0);
     });

     it('returns Err when every candidate is filtered out by extension', async () => {
       const result = await buildCloneIndex([join(root, 'notes.md')], { rootDir: root });
       expect(result.ok).toBe(false);
     });

     it('returns Err when ignorePatterns exclude every candidate', async () => {
       const result = await buildCloneIndex([join(root, 'src', 'good.ts')], {
         rootDir: root,
         ignorePatterns: ['**/src/**'],
       });
       expect(result.ok).toBe(false);
       if (result.ok) return;
       expect(result.error.message).toMatch(/zero source files/i);
     });

     it('does NOT return Err when files are eligible but all fail to read', async () => {
       // An eligible-but-unreadable set is a scan that happened and found
       // nothing — distinct from a scan that never happened.
       const result = await buildCloneIndex([join(root, 'src', 'absent.ts')], {
         rootDir: root,
         ignorePatterns: [],
       });
       expect(result.ok).toBe(true);
       if (!result.ok) return;
       expect(result.value.stats.filesSkipped).toBe(1);
       expect(result.value.stats.filesScanned).toBe(0);
       expect(result.value.classes).toEqual([]);
     });
   });
   ```

2. Run `cd packages/core && npx vitest run tests/duplication/failure-behavior.test.ts` — observe
   pass (no source change expected; if the fourth case fails, the guard is misplaced relative to the
   scan loop and Task 5's ordering must be corrected, not this test).
3. Run `pnpm exec prettier --check packages/core/tests/duplication/failure-behavior.test.ts`.
4. Commit: `test(duplication): pin the zero-discovery guard contract`

---

### Task 7: fixture projects with planted clone classes

**Depends on:** none | **Files:** `packages/core/tests/fixtures/duplication/planted-clones/**`, `packages/core/tests/fixtures/duplication/nested-units/**` | **Owns:** `packages/core/tests/fixtures/duplication/**`

Mirrors the existing fixture-project convention at
`packages/core/tests/fixtures/entropy/dead-code-entrypoints/` (a `package.json` plus a `src/` tree).
`harness.config.json` `architecture.excludePatterns` already contains `**/tests/fixtures/**`, so
these files do not affect arch metrics. They are **not** named `*.test.ts`, so vitest will not
collect them.

All token counts below were **measured** in this worktree with
`parse(src, { tokens: true, loc: true, range: true })` and the Task 1 normalization map.

1. Create `packages/core/tests/fixtures/duplication/planted-clones/package.json`:

   ```json
   {
     "name": "duplication-planted-clones-fixture",
     "version": "0.0.0",
     "private": true
   }
   ```

2. Create `packages/core/tests/fixtures/duplication/planted-clones/README.md` documenting the
   planted set exactly as the acceptance test asserts it:

   ```markdown
   # Fixture: planted clone classes

   Consumed by `packages/core/tests/duplication/acceptance.test.ts` (spec success criterion 15).
   Every class below is planted deliberately; token counts are measured, not estimated.

   | Class | Members                                       | Kind     | Tokens | Rank | Qualifies at minInstances 3 / minTokens 40?                           |
   | ----- | --------------------------------------------- | -------- | ------ | ---- | --------------------------------------------------------------------- |
   | D     | `src/generated/gen-{a,b,c}.ts`                | function | 87     | 261  | **yes** when `ignorePatterns: []`; absent under `['**/generated/**']` |
   | A     | `src/alpha.ts`, `src/beta.ts`, `src/gamma.ts` | function | 83     | 249  | **yes** — reported                                                    |
   | B     | `src/pair-one.ts`, `src/pair-two.ts`          | function | 85     | 170  | no — 2 members, counted in `classesSuppressed`                        |
   | C     | `src/short-{one,two,three}.ts`                | function | 16     | 48   | no — below `minTokens`, counted in `classesSuppressed`                |
   | —     | `src/unique.ts`                               | function | —      | —    | singleton — counted nowhere                                           |

   Class A's three members differ **only** in the function name and the identifier names inside
   the body, which is exactly the Type-2 property decision D1 relies on.

   Class D is listed first because it **outranks** Class A (261 > 249). Class D's body is
   structurally different from Class B's (`while`/`pop`/`break` rather than `for…of`), which is
   load-bearing: literals and member names normalize away, so two bodies differing only in those
   would share one fingerprint.

   Measured stats with `ignorePatterns: []` over 13 discovered paths:
   `filesScanned: 12, filesSkipped: 0, unitsFingerprinted: 12, classesReported: 2,
   classesSuppressed: 2, classesTruncated: 0`.

   `src/notes.md` is present so the acceptance test can prove a non-source file is dropped
   without being counted as scanned or skipped.
   ```

3. Create the Class-A members. `src/alpha.ts`:

   ```ts
   export interface Item {
     cost: number;
     label: string;
   }

   export function sumAlpha(items: Item[]): { total: number; labels: string[] } {
     let total = 0;
     const seen: string[] = [];
     for (const item of items) {
       if (item.cost > 0) {
         total += item.cost;
         seen.push(item.label);
       }
     }
     return { total: total, labels: seen };
   }
   ```

   `src/beta.ts` — identical structure, every identifier renamed:

   ```ts
   export interface Row {
     cost: number;
     label: string;
   }

   export function addBeta(rows: Row[]): { total: number; labels: string[] } {
     let acc = 0;
     const seen: string[] = [];
     for (const row of rows) {
       if (row.cost > 0) {
         acc += row.cost;
         seen.push(row.label);
       }
     }
     return { total: acc, labels: seen };
   }
   ```

   `src/gamma.ts` — same again with a third naming:

   ```ts
   export interface Entry {
     cost: number;
     label: string;
   }

   export function tallyGamma(entries: Entry[]): { total: number; labels: string[] } {
     let sum = 0;
     const seen: string[] = [];
     for (const entry of entries) {
       if (entry.cost > 0) {
         sum += entry.cost;
         seen.push(entry.label);
       }
     }
     return { total: sum, labels: seen };
   }
   ```

4. Create the Class-B pair (qualifies on tokens, fails `minInstances`). `src/pair-one.ts`:

   ```ts
   export function pickPairOne(table: Record<string, number>): string[] {
     const out: string[] = [];
     for (const key of Object.keys(table)) {
       const value = table[key];
       if (value !== undefined && value > 10) {
         out.push(key + ':' + String(value));
       }
     }
     out.sort();
     return out;
   }
   ```

   `src/pair-two.ts` — same body, renamed:

   ```ts
   export function pickPairTwo(lookup: Record<string, number>): string[] {
     const list: string[] = [];
     for (const name of Object.keys(lookup)) {
       const amount = lookup[name];
       if (amount !== undefined && amount > 10) {
         list.push(name + ':' + String(amount));
       }
     }
     list.sort();
     return list;
   }
   ```

5. Create the Class-C trio (three members, 16 tokens — below `minTokens`).
   `src/short-one.ts`, `src/short-two.ts`, `src/short-three.ts`, each:

   ```ts
   export function tinyOne(a: number): number {
     return a + 1;
   }
   ```

   with `tinyOne` -> `tinyTwo` / `tinyThree` and `a` -> `b` / `c` respectively.

6. Create the Class-D trio under `src/generated/`. ⚠️ **Near miss, caught by a dry run — read
   before writing these files.** The first draft of this fixture gave Class D the same `for…of`
   shape as Class B and varied only the comparison literal (`> 25` vs `> 10`), the separator string
   (`'='` vs `':'`), and the method name (`reverse` vs `sort`). All three normalize away — literals
   to `L`, member names to `I` — so the two "different" classes produced the **same fingerprint** and
   merged into one 5-member group. Class D must therefore differ in **keywords and punctuators**:
   `while`/`pop`/`break` instead of `for…of`/`if`-with-`&&`. **Measured after the fix:** Class D is
   87 tokens and its own fingerprint.

   `src/generated/gen-a.ts`:

   ```ts
   export function pickGenA(table: Record<string, number>): string[] {
     const out: string[] = [];
     const keys = Object.keys(table);
     while (keys.length > 0) {
       const key = keys.pop();
       if (key === undefined) {
         break;
       }
       out.push(key + '=' + String(table[key]));
     }
     return out;
   }
   ```

   `gen-b.ts` and `gen-c.ts` are the same with identifiers renamed — `pickGenB`/`lookup`/`list`/`names`/`name`
   and `pickGenC`/`map`/`acc`/`fields`/`field` respectively.

7. Create `src/unique.ts` (a singleton — matches nothing):

   ```ts
   export function distinctOnly(flag: boolean): string {
     if (flag) {
       return 'yes';
     }
     return 'no';
   }
   ```

8. Create `src/notes.md` with `# not source\n`.

9. Create the nesting fixture. `packages/core/tests/fixtures/duplication/nested-units/package.json`
   mirrors step 1 with `"name": "duplication-nested-units-fixture"`. Then `src/box-a.ts`:

   ```ts
   export class BoxA {
     private readonly rows: number[] = [];

     tallyA(input: number[]): number {
       let sum = 0;
       for (const entry of input) {
         if (entry > 0) {
           sum += entry;
           this.rows.push(entry);
         }
       }
       return sum;
     }
   }
   ```

   `src/box-b.ts` and `src/box-c.ts` are the same with `BoxA`/`tallyA` -> `BoxB`/`tallyB` and
   `BoxC`/`tallyC`. **Measured:** each file yields exactly two units — `class` (65 tokens) and
   `method` (50 tokens) — and across the three files both groups have 3 members, so
   **both qualify**. That is the intended nesting semantics and Task 8 asserts it.

10. Run `pnpm exec prettier --write "packages/core/tests/fixtures/duplication/**/*.{ts,json,md}"`
    then `pnpm exec prettier --check "packages/core/tests/fixtures/duplication/**/*.{ts,json,md}"`.
    Prettier reformatting is harmless here: Type-2 fingerprints are whitespace-insensitive by
    construction (the token stream carries no whitespace).
11. Run `cd packages/core && npx vitest run tests/duplication` — observe the existing suites still
    pass (no fixture consumer yet).
12. Commit: `test(duplication): planted clone-class and nested-unit fixture projects`

---

### Task 8: acceptance test — criterion 15, glob-driven discovery over the fixture

**Depends on:** Task 5, Task 6, Task 7 | **Files:** `packages/core/tests/duplication/acceptance.test.ts` | **Owns:** `packages/core/tests/duplication/acceptance.test.ts`
**Skills:** `ts-testing-types` (reference)

⚠️ **Trap to avoid:** `DEFAULT_DUPLICATION_CONFIG.ignorePatterns` contains `**/fixtures/**`,
`**/tests/**`, and `**/index.ts`. The fixture lives under `tests/fixtures/`, so a test that omits
`ignorePatterns` gets an `Err` (zero discovery), not an empty index. Every case below passes
`ignorePatterns` explicitly.

Also note: `rootDir` is the **fixture root**, so `CloneMember.file` values are fixture-relative
(`src/alpha.ts`), never repo-relative — which is the point of criterion 15's "no path may assume
this repository's layout".

1. Create `packages/core/tests/duplication/acceptance.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { join } from 'node:path';
   import { findFiles } from '../../src/shared/fs-utils';
   import { buildCloneIndex } from '../../src/duplication/index';

   const PLANTED_ROOT = join(__dirname, '../fixtures/duplication/planted-clones');
   const NESTED_ROOT = join(__dirname, '../fixtures/duplication/nested-units');

   /** Discovery driven solely by include globs — criterion 15. */
   async function discover(root: string, include = '**/*.{ts,tsx,js,jsx,mjs,cjs,md}') {
     return findFiles(include, root);
   }

   /** The planted set, named by the fixture README. */
   const CLASS_A_MEMBERS = ['src/alpha.ts', 'src/beta.ts', 'src/gamma.ts'];
   const CLASS_D_MEMBERS = [
     'src/generated/gen-a.ts',
     'src/generated/gen-b.ts',
     'src/generated/gen-c.ts',
   ];

   describe('buildCloneIndex over the planted-clones fixture (criterion 15)', () => {
     it('reports exactly the planted classes that meet both bars, and no others', async () => {
       const files = await discover(PLANTED_ROOT);
       const result = await buildCloneIndex(files, { rootDir: PLANTED_ROOT, ignorePatterns: [] });
       expect(result.ok).toBe(true);
       if (!result.ok) return;
       const index = result.value;

       const reported = index.classes
         .map((c) =>
           c.members
             .map((m) => m.file)
             .sort()
             .join(',')
         )
         .sort();
       const expected = [CLASS_A_MEMBERS.join(','), CLASS_D_MEMBERS.join(',')].sort();
       expect(reported).toEqual(expected);
       expect(index.stats.classesReported).toBe(expected.length);
     });

     it('counts the two sub-bar groups in classesSuppressed', async () => {
       // Class B: 2 members (below minInstances 3). Class C: 16 tokens (below minTokens 40).
       const files = await discover(PLANTED_ROOT);
       const result = await buildCloneIndex(files, { rootDir: PLANTED_ROOT, ignorePatterns: [] });
       if (!result.ok) throw new Error('expected ok');
       expect(result.value.stats.classesSuppressed).toBe(2);
     });

     it('drops the generated class when an exclude glob removes it', async () => {
       const files = await discover(PLANTED_ROOT);
       const result = await buildCloneIndex(files, {
         rootDir: PLANTED_ROOT,
         ignorePatterns: ['**/generated/**'],
       });
       if (!result.ok) throw new Error('expected ok');
       const reported = result.value.classes.map((c) =>
         c.members
           .map((m) => m.file)
           .sort()
           .join(',')
       );
       expect(reported).toEqual([CLASS_A_MEMBERS.join(',')]);
     });

     it('surfaces Class B once minInstances drops to 2', async () => {
       const files = await discover(PLANTED_ROOT);
       const result = await buildCloneIndex(files, {
         rootDir: PLANTED_ROOT,
         ignorePatterns: [],
         minInstances: 2,
       });
       if (!result.ok) throw new Error('expected ok');
       const reported = result.value.classes.map((c) =>
         c.members
           .map((m) => m.file)
           .sort()
           .join(',')
       );
       expect(reported).toContain('src/pair-one.ts,src/pair-two.ts');
     });

     it('surfaces Class C once minTokens drops below its measured size', async () => {
       const files = await discover(PLANTED_ROOT);
       const result = await buildCloneIndex(files, {
         rootDir: PLANTED_ROOT,
         ignorePatterns: [],
         minTokens: 10,
       });
       if (!result.ok) throw new Error('expected ok');
       const reported = result.value.classes.map((c) =>
         c.members
           .map((m) => m.file)
           .sort()
           .join(',')
       );
       expect(reported).toContain('src/short-one.ts,src/short-three.ts,src/short-two.ts');
     });

     it('records member paths POSIX-relative to the supplied rootDir, not to this repo', async () => {
       const files = await discover(PLANTED_ROOT);
       const result = await buildCloneIndex(files, { rootDir: PLANTED_ROOT, ignorePatterns: [] });
       if (!result.ok) throw new Error('expected ok');
       for (const cls of result.value.classes) {
         for (const member of cls.members) {
           expect(member.file).not.toContain('\\');
           expect(member.file.startsWith('src/')).toBe(true);
           expect(member.file).not.toContain('packages/core');
         }
       }
     });

     it('labels every Phase-1 class as a plain duplicate with no sharedImport', async () => {
       const files = await discover(PLANTED_ROOT);
       const result = await buildCloneIndex(files, { rootDir: PLANTED_ROOT, ignorePatterns: [] });
       if (!result.ok) throw new Error('expected ok');
       for (const cls of result.value.classes) {
         expect(cls.signal).toBe('duplicate');
         expect(cls.sharedImport).toBeUndefined();
       }
     });

     it('drops the markdown file without counting it as scanned or skipped', async () => {
       const files = await discover(PLANTED_ROOT);
       expect(files.some((f) => f.endsWith('notes.md'))).toBe(true);
       const result = await buildCloneIndex(files, { rootDir: PLANTED_ROOT, ignorePatterns: [] });
       if (!result.ok) throw new Error('expected ok');
       const tsFiles = files.filter((f) => !f.endsWith('.md'));
       expect(result.value.stats.filesScanned).toBe(tsFiles.length);
       expect(result.value.stats.filesSkipped).toBe(0);
     });
   });

   describe('nesting semantics over the nested-units fixture', () => {
     it('reports the class-level and method-level groups as separate classes', async () => {
       const files = await discover(NESTED_ROOT, '**/*.ts');
       const result = await buildCloneIndex(files, { rootDir: NESTED_ROOT, ignorePatterns: [] });
       if (!result.ok) throw new Error('expected ok');
       const kinds = result.value.classes.map((c) => c.members[0]!.kind).sort();
       expect(kinds).toEqual(['class', 'method']);
       // The class group outranks the method group: more tokens, same member count.
       expect(result.value.classes[0]!.members[0]!.kind).toBe('class');
     });

     it('emits no duplicate anonymous function unit for the methods', async () => {
       const files = await discover(NESTED_ROOT, '**/*.ts');
       const result = await buildCloneIndex(files, { rootDir: NESTED_ROOT, ignorePatterns: [] });
       if (!result.ok) throw new Error('expected ok');
       const names = result.value.classes.flatMap((c) => c.members.map((m) => m.unit));
       expect(names).not.toContain('<anon>');
     });
   });
   ```

2. Run `cd packages/core && npx vitest run tests/duplication/acceptance.test.ts` — observe pass.
   If the expected member sets differ, **correct the fixture or the expectation, never loosen the
   assertion to a count**: spec criterion 10 forbids hardcoded scan counts, and a fixture whose
   expected set is derived from the implementation's own output proves nothing.
3. Run `pnpm exec prettier --check packages/core/tests/duplication/acceptance.test.ts`.
4. Commit: `test(duplication): criterion-15 acceptance over a planted-clone fixture`

---

### Task 9: D1 regression — the verified Type-2 equivalence property

**Depends on:** Task 5 | **Files:** `packages/core/tests/duplication/tokens.test.ts` | **Owns:** `packages/core/tests/duplication/tokens.test.ts`

Pins the single property decision D1 rests on. Without it, a future "optimization" that stops
normalizing identifiers would still pass every other suite while silently destroying the 16× and
10× clusters the spec's evidence names.

1. **Append** to `packages/core/tests/duplication/tokens.test.ts`:

   ```ts
   describe('D1 Type-2 equivalence (verified substrate)', () => {
     const shape = (fn: string, p: string, acc: string, el: string) =>
       `export function ${fn}(${p}: { cost: number; label: string }[]) {\n` +
       `  let ${acc} = 0;\n` +
       `  const seen: string[] = [];\n` +
       `  for (const ${el} of ${p}) {\n` +
       `    if (${el}.cost > 0) {\n` +
       `      ${acc} += ${el}.cost;\n` +
       `      seen.push(${el}.label);\n` +
       `    }\n` +
       `  }\n` +
       `  return { total: ${acc}, labels: seen };\n` +
       `}\n`;

     function fingerprintSource(src: string): string {
       const ast = parse(src, { tokens: true, loc: true, range: true });
       return fingerprintStream(normalizeTokens(ast.tokens ?? [], [0, src.length]));
     }

     it('assigns the same fingerprint to functions differing only in names', () => {
       expect(fingerprintSource(shape('addBeta', 'rows', 'acc', 'row'))).toBe(
         fingerprintSource(shape('sumAlpha', 'items', 'total', 'item'))
       );
     });

     it('is insensitive to whitespace and comments', () => {
       const plain = shape('sumAlpha', 'items', 'total', 'item');
       const decorated = `// a leading comment\n${plain.replace(/\n/g, '\n\n')}`;
       expect(fingerprintSource(decorated)).toBe(fingerprintSource(plain));
     });

     it('is sensitive to a changed operator — not merely a name hash', () => {
       const changed = shape('sumAlpha', 'items', 'total', 'item').replace('> 0', '>= 0');
       expect(fingerprintSource(changed)).not.toBe(
         fingerprintSource(shape('sumAlpha', 'items', 'total', 'item'))
       );
     });

     it('is sensitive to a changed keyword', () => {
       const changed = shape('sumAlpha', 'items', 'total', 'item').replace(
         'let total',
         'var total'
       );
       expect(fingerprintSource(changed)).not.toBe(
         fingerprintSource(shape('sumAlpha', 'items', 'total', 'item'))
       );
     });
   });
   ```

2. Run `cd packages/core && npx vitest run tests/duplication/tokens.test.ts` — observe pass.
3. Run `pnpm exec prettier --check packages/core/tests/duplication/tokens.test.ts`.
4. Commit: `test(duplication): pin the D1 Type-2 equivalence property`

---

### Task 10: barrel registration — criterion 11

**Depends on:** Task 5 | **Files:** `scripts/generate-core-barrel.mjs`, `packages/core/src/index.ts`, `packages/core/tests/duplication/barrel.test.ts` | **Owns:** `scripts/generate-core-barrel.mjs`, `packages/core/src/index.ts` | **Category:** integration

**Why this is in Phase 1, not Phase 2** (plan decision P7): `discoverStarModules()` keys purely on
`<dir>/index.ts` existing and `duplication` is not in `SKIP_DIRS`, so
`node scripts/generate-core-barrel.mjs --check` — **green today** — goes red the instant Task 3
lands. Phase 1 also owns criterion 11.

1. Create `packages/core/tests/duplication/barrel.test.ts`, mirroring
   `packages/core/tests/identity/barrel.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { buildCloneIndex, DEFAULT_DUPLICATION_CONFIG } from '../../src/index';
   import type {
     CloneIndex,
     CloneClass,
     CloneMember,
     CloneUnitKind,
     DuplicationConfig,
   } from '../../src/index';

   describe('core barrel — duplication surface (criterion 11)', () => {
     it('re-exports buildCloneIndex from the package entry point', () => {
       expect(typeof buildCloneIndex).toBe('function');
       expect(DEFAULT_DUPLICATION_CONFIG.minInstances).toBe(3);
     });

     it('re-exports the CloneClass / CloneMember / CloneIndex / CloneUnitKind types', () => {
       const kind: CloneUnitKind = 'function';
       const member: CloneMember = {
         file: 'src/a.ts',
         unit: 'f',
         kind,
         startLine: 1,
         endLine: 9,
       };
       const cls: CloneClass = {
         fingerprint: '0123456789abcdef',
         tokenCount: 40,
         members: [member],
         rank: 40,
         signal: 'duplicate',
       };
       const index: CloneIndex = {
         classes: [cls],
         byMember: new Map([[`${member.file}:${member.startLine}`, cls]]),
         stats: {
           filesScanned: 1,
           filesSkipped: 0,
           unitsFingerprinted: 1,
           classesReported: 1,
           classesSuppressed: 0,
           classesTruncated: 0,
         },
       };
       expect(index.byMember.get('src/a.ts:1')).toBe(cls);
     });

     it('re-exports DuplicationConfig with exactly the four specified fields', () => {
       const config: DuplicationConfig = {
         minTokens: 40,
         minInstances: 3,
         ignorePatterns: [],
         maxClasses: 100,
       };
       expect(Object.keys(config).sort()).toEqual([
         'ignorePatterns',
         'maxClasses',
         'minInstances',
         'minTokens',
       ]);
     });
   });
   ```

2. Run `cd packages/core && npx vitest run tests/duplication/barrel.test.ts` — observe failure
   (the barrel does not yet re-export `./duplication`).

3. Edit `scripts/generate-core-barrel.mjs`. Inside the `DIR_COMMENTS` object, add an entry
   positioned immediately after the `entropy` entry so the generated barrel's canonical ordering
   groups it with the quality-analysis modules:

   ```js
     duplication:
       'Duplication module — Type-1/2 whole-unit clone index (normalized token fingerprints) over TS/JS sources; the shared substrate for the duplication entropy detector, code-craft sibling evidence, and idiom epidemiology.',
   ```

4. Run `pnpm run generate:barrels`. This regenerates both
   `packages/core/src/index.ts` and the CLI barrel exports; confirm the core diff is exactly the
   added comment block plus `export * from './duplication';`:

   ```
   git diff --stat packages/core/src/index.ts
   git diff packages/core/src/index.ts
   ```

   If `generate-barrel-exports.mjs` also rewrote unrelated files, keep only the
   `packages/core/src/index.ts` change in this commit and report the extra drift.

5. Run `pnpm run generate:barrels:check` — observe pass.
6. Run `cd packages/core && npx vitest run tests/duplication` — observe all six suites pass.
7. Run `cd packages/core && npx tsc --noEmit`.
8. Run `pnpm exec prettier --check packages/core/src/index.ts packages/core/tests/duplication/barrel.test.ts scripts/generate-core-barrel.mjs`.
9. Commit: `feat(duplication): export the duplication module through the core barrel`

---

### Task 11: changeset, build, and full Phase-1 verification

**Depends on:** Task 6, Task 8, Task 9, Task 10 | **Files:** `.changeset/duplication-core-module.md` | **Owns:** `.changeset/duplication-core-module.md` | **Category:** integration

`[checkpoint:human-verify]` — the final gate review. Pause after step 7 and present the evidence
table before committing.

1. Create `.changeset/duplication-core-module.md` (pre-push runs `pnpm run check:changesets`, which
   fails without one):

   ```markdown
   ---
   '@harness-engineering/core': patch
   ---

   Add the `duplication` module: a deterministic, offline Type-1/2 clone index over TS/JS sources
   (`buildCloneIndex`, `CloneIndex`, `CloneClass`, `CloneMember`, `CloneUnitKind`,
   `DuplicationConfig`). Whole-unit granularity over normalized token-stream fingerprints, with no
   new dependencies. Phase 1 of the DRY-floor spec — reusable module only; nothing is wired into
   the entropy pipeline, CLI, MCP, or code-craft yet.
   ```

   `[checkpoint:decision]` — the bump level is `patch` because the change is purely additive to a
   pre-1.0 package. If the reviewer wants `minor` for a new public surface, change the one line.

2. Build core (the pre-commit arch gate reads `packages/*/dist`; a stale `dist` produces a false
   regression):

   ```
   pnpm exec turbo build --filter=@harness-engineering/core...
   ```

3. Full duplication suite:

   ```
   cd packages/core && npx vitest run tests/duplication
   ```

4. Full core suite, to prove nothing existing regressed (spec criterion 9 in spirit — no existing
   detector's output changes; Phase 1 touches no detector):

   ```
   cd packages/core && npx vitest run
   ```

5. Typecheck and lint:

   ```
   pnpm exec turbo run typecheck --filter=@harness-engineering/core
   pnpm exec turbo run lint --filter=@harness-engineering/core
   ```

6. Generated-artifact freshness and dependency layering:

   ```
   pnpm run generate:barrels:check
   node packages/cli/dist/bin/harness.js check-deps
   ```

   `check-deps` was green at plan time (2657 modules, 10 layers); it must stay green. A
   `circular-deps` failure here means plan decision P1 was not followed (`CloneUnitKind` was
   declared in `index.ts` instead of `units.ts`).

7. Baseline comparison for the chronically-red whole-project gates. Run:

   ```
   node packages/cli/dist/bin/harness.js validate 2>&1 | head -5
   node packages/cli/dist/bin/harness.js check-arch
   ```

   **`harness validate` exits 1 with ~461 pre-existing issues in this worktree** (roadmap hygiene,
   ADR number collisions per GH #1323, design-token drift). The gate is: **no new issue naming a
   `packages/core/src/duplication/**`or`packages/core/tests/duplication/**` path, and the issue
   count has not risen.** Do not report "validate passed" — it cannot. If `check-arch` reports a
   regression, re-run step 2 first (stale `dist` is the usual cause); only then consider
   `harness check-arch --update-baseline` as a visible, staged edit.

8. **`[checkpoint:human-verify]`** — present this evidence table and wait for confirmation:

   | Criterion                                    | Evidence                                                               |
   | -------------------------------------------- | ---------------------------------------------------------------------- |
   | 11 — importable from core                    | `tests/duplication/barrel.test.ts` passing + `generate:barrels:check`  |
   | 15 — planted fixture, exact set, glob-driven | `tests/duplication/acceptance.test.ts` passing                         |
   | D1 Type-2 equivalence                        | `tests/duplication/tokens.test.ts` D1 describe block                   |
   | Failure behavior (skip / cap / zero)         | `tests/duplication/failure-behavior.test.ts` + `clone-index.test.ts`   |
   | No new dependency (D6)                       | `git diff packages/core/package.json` is empty                         |
   | No entropy / CLI / code-craft touch          | `git diff --name-only origin/main...HEAD` matches the File Map exactly |
   | Baseline not worsened                        | `harness validate` issue count vs the 461 recorded above               |

9. Commit: `chore(duplication): changeset for the core duplication module`

---

## Dependency Graph

```
Task 1 (tokens.ts) ──┐
Task 2 (units.ts) ───┼──> Task 3 (index.ts types) ──> Task 4 (fingerprintFile) ──> Task 5 (buildCloneIndex)
Task 7 (fixtures) ───┘                                                                   │
                                                                     ┌───────────────────┼──────────────┐
                                                                     v                   v              v
                                                                 Task 6 (zero)      Task 9 (D1)   Task 10 (barrel)
                                                                     │                   │              │
                                                                     └────> Task 8 (acceptance) <───────┘
                                                                                         │
                                                                                         v
                                                                                   Task 11 (verify)
```

**Waves** (as `plan_parallelization` will compute from `dependsOn` ∪ file-overlap ∪ `owns`-overlap):

| Wave | Tasks    | Note                                                                |
| ---- | -------- | ------------------------------------------------------------------- |
| 1    | 1, 2, 7  | Disjoint files; Task 7 is pure fixture data with no code dependency |
| 2    | 3        | Needs `CloneUnitKind` from Task 2 and the digest from Task 1        |
| 3    | 4        | Appends to `index.ts` — serialized with 3 and 5 by file overlap     |
| 4    | 5        | Appends to `index.ts`                                               |
| 5    | 6, 9, 10 | Disjoint files; all depend on Task 5                                |
| 6    | 8        | Needs the fixtures (7) and the finished index (5, 6)                |
| 7    | 11       | Final verification                                                  |

Tasks 3, 4, and 5 all own `packages/core/src/duplication/index.ts` and are therefore strictly
serial — that file-overlap edge is intentional and recorded.

## Traceability

| Observable truth | Delivered by  | Verified by                                                  |
| ---------------- | ------------- | ------------------------------------------------------------ |
| 1 (crit. 11)     | Task 10       | `tests/duplication/barrel.test.ts`, `generate:barrels:check` |
| 2 (crit. 15)     | Tasks 5, 7, 8 | `tests/duplication/acceptance.test.ts`                       |
| 3 (D1)           | Tasks 1, 9    | `tests/duplication/tokens.test.ts`                           |
| 4 (D9)           | Task 3        | `tests/duplication/clone-index.test.ts` (`isEligibleFile`)   |
| 5 (unreadable)   | Tasks 4, 5    | `failure-behavior.test.ts`, `clone-index.test.ts`            |
| 6 (unparseable)  | Task 4        | `failure-behavior.test.ts`                                   |
| 7 (bars)         | Task 5        | `clone-index.test.ts`, `acceptance.test.ts`                  |
| 8 (maxClasses)   | Task 5        | `clone-index.test.ts`                                        |
| 9 (zero files)   | Tasks 5, 6    | `failure-behavior.test.ts`                                   |
| 10 (posix rel)   | Task 5        | `acceptance.test.ts`                                         |
| 11 (gates)       | Tasks 10, 11  | Task 11 steps 3-7                                            |

## Risks

| Risk                                                                                                                                                                                             | Mitigation                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default `ignorePatterns` contain `**/fixtures/**` and `**/tests/**`, so the acceptance test silently gets `Err` instead of an index                                                              | Called out inline in Task 8; every acceptance case passes `ignorePatterns` explicitly                                                                                                                                                    |
| `MethodDefinition.value` double-counting collides on the `byMember` key                                                                                                                          | Measured and fixed in Task 2 (P2), asserted in Tasks 2 and 8                                                                                                                                                                             |
| A function and a nested arrow share a start line, making the `byMember` key ambiguous                                                                                                            | Measured; resolved by the rank-descending first-writer-wins rule (P3), asserted in Task 5                                                                                                                                                |
| `CloneUnitKind` declared in `index.ts` would create a `units.ts` ↔ `index.ts` cycle against `circular-deps.max = 0`                                                                              | P1 declares it in `units.ts`; Task 11 step 6 runs `check-deps` as the mechanical check                                                                                                                                                   |
| Barrel `--check` goes red as soon as `duplication/index.ts` exists, mid-plan                                                                                                                     | P7 pulls the barrel work into Task 10; Tasks 3-9 run the targeted vitest/typecheck gates rather than `generate:barrels:check`                                                                                                            |
| Stale `packages/core/dist` makes the fail-closed pre-commit arch gate report a false regression                                                                                                  | Task 11 step 2 builds core before the gate; step 7 says re-build before ever touching the baseline                                                                                                                                       |
| Pre-push prettier `--check` covers fixture `.ts` files                                                                                                                                           | Task 7 step 10 formats then verifies them; token streams are whitespace-insensitive so formatting cannot change the planted fingerprints                                                                                                 |
| Coverage ratchet (core thresholds 80/80/73/80) regresses if a branch in `buildCloneIndex` is untested                                                                                            | Every branch — ineligible extension, ignore match, unreadable, unparseable, singleton, sub-bar, cap, byMember collision — has an explicit test                                                                                           |
| A task "verifies" with `harness validate` and reports a pass that cannot occur                                                                                                                   | The Pre-existing-baseline section records exit 1 / 461 issues; Task 11 step 7 makes the gate a baseline comparison and forbids a "passed" claim                                                                                          |
| **Fixture clone classes silently merge.** Literals (`10` vs `25`, `':'` vs `'='`) and member names (`sort` vs `reverse`) all normalize away, so two "different" bodies can share one fingerprint | Caught by the dry run (Class B and Class D merged into a 5-member group in the first draft). Class D now differs in keywords and punctuators; the Dry-run evidence table pins the measured outcome, and Task 7 step 6 documents the trap |
| An executor "fixes" a failing fixture assertion by relaxing it to a count or by regenerating the expectation from the implementation's own output                                                | Task 8 step 2 forbids it explicitly; spec criterion 10 forbids hardcoded scan counts, and the Dry-run evidence table gives the independently measured expected set                                                                       |

## Follow-ups filed forward (not Phase 1 work)

- `CloneMember.unit` name inference from an enclosing `VariableDeclarator` (U4) — improves Phase 3's
  audit readability.
- Benchmark + perf baseline for the duplication scan, attached to `detectDuplication` in Phase 2
  (spec criterion 6, <10s).
- `DIR_COMMENTS.duplication` wording may want revisiting in Phase 2 once `detectDuplication` exists.

## Sign-off

**Status: AWAITING HUMAN APPROVAL.**

- Plan: `docs/changes/duplication-detection/plans/2026-10-19-duplication-phase-1-core-module-plan.md`
- Tasks: 11 · Estimated: ~42 min · Checkpoints: 2 (`[checkpoint:human-verify]` and
  `[checkpoint:decision]`, both in Task 11)
- Open for the approver: the skeleton direction, and Uncertainties **U1** (`files` is a path list),
  **U2** (`rootDir` as an option rather than a config field), **U3** (group-level bar application /
  `classesSuppressed` accounting), and **U5** (no Phase-1 NFR task).

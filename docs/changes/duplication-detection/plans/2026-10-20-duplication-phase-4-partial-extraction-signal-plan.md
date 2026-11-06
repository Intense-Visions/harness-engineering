# Plan: Duplication Phase 4 — `partial-extraction` signal

**Date:** 2026-10-20 | **Spec:** `docs/changes/duplication-detection/proposal.md` (§ Phase 4, `<!-- complexity: low -->`) |
**Tasks:** 13 | **Checkpoints:** 2 | **Time:** ~55 min of task work plus gate runtime |
**Integration Tier:** medium | **Worktree:** `/Users/cwarner/Projects/iv/hd-dry-concept`, branch `brainstorm/dry-refactoring-concept`, base HEAD `521eb0ea8`

---

## Goal

Label a clone class `partial-extraction` and name its `sharedImport` when every member's body calls
into one common first-party module, and order the report so those classes surface above plain
duplicates — without inventing a signal that fires on 92% of classes and without silently
invalidating Phases 1-3's recorded evidence.

---

## Observable Truths (acceptance criteria)

Every behavioural truth is phrased in EARS. Scope and denominator are named for every figure.

1. **(Event-driven, criterion 3 — restated; see "The spec's literal D8 reading is refuted".)**
   When every member of a clone class references, inside its own unit body, a value binding
   imported from one common first-party module, the system shall set `signal` to
   `'partial-extraction'` and set `sharedImport` to that module's repo-relative extensionless key.
   Verified against the named case: `parseFencedJson`, fingerprint `c21f9afcb0085ffd`, 6 members,
   87 tokens, `sharedImport === 'packages/cli/src/shared/craft/fenced-json'` at Scope C.
2. **(Unwanted.)** If the only module common to the members is a bare specifier (a Node builtin or
   an installed dependency), or is referenced only in the FILE and not inside the unit bodies, or is
   imported type-only, then the system shall leave `signal` at `'duplicate'` and shall not set
   `sharedImport`.
3. **(Ubiquitous.)** The system shall derive the module key from the importing file's own path
   (`../../shared/craft/fenced-json.js` from `src/copy-craft/phases/` and `./shared/payload.js`
   from `src/` both resolve to one key), without touching the filesystem.
4. **(Ubiquitous.)** `CloneClass.rank` shall remain exactly `tokenCount * members.length` for every
   class, labelled or not; a new `CloneClass.priority` shall carry
   `rank * PARTIAL_EXTRACTION_PRIORITY_BOOST` for a labelled class and `rank` otherwise.
5. **(Ubiquitous, criterion 13 — restated.)** When more than `maxClasses` classes qualify, the
   system shall report the top `maxClasses` by `priority` and record the dropped count in
   `classesTruncated`; `priority === rank` for every plain duplicate, so a project with no
   partial-extraction class sees byte-identical output to Phase 3.
6. **(State-driven.)** While two classes tie on `priority`, the system shall order them by
   `fingerprint` then `tokenCount` — the Phase-1 determinism guarantee, unchanged.
7. **(Ubiquitous.)** A plain-duplicate `CloneClass` object shall carry exactly the keys
   `fingerprint`, `members`, `priority`, `rank`, `signal`, `tokenCount` — `sharedImport` absent, not
   present-and-`undefined`.
8. **(Event-driven.)** When `harness cleanup -t duplication --json` reports a labelled class, the
   payload shall carry its `signal`, `sharedImport` and `priority`, and the printed advisory line for
   that class shall name the signal and the shared module.
9. **(Event-driven.)** When `detect_entropy` summarises a labelled class in `topClasses`, the line
   shall name the signal and the shared module; and `advisory.duplication` shall carry
   `filesSkipped` (the gap the Phase-3 record names as still open).
10. **(Ubiquitous, criterion 6 unchanged.)** `detectDuplication` shall still complete over this
    repository's sources in under 10 seconds.
11. **(Ubiquitous, criterion 11 extended.)** `moduleKey`, `collectFileImports`, `usedImportKeys`,
    `sharedImportKey` and `PARTIAL_EXTRACTION_PRIORITY_BOOST` shall be importable from
    `@harness-engineering/core`, and `node scripts/generate-core-barrel.mjs --check` shall pass.
12. **(Ubiquitous, criterion 9 unchanged.)** No existing entropy detector's output shall change, and
    the Phase-1/2/3 fixture `duplication-cli-project` shall stay byte-identical with its one class
    still `signal: 'duplicate'`, `priority === rank === 249`.
13. **(Ubiquitous.)** The spec's record shall state the measured label rate with its scope and
    denominator, the ranking decision with its measured alternatives, and the new by-priority
    positions of the criterion-1 evidence classes.

### NFR targets

None elicited. Rigor is `standard`; this phase adds no new hot path, no untrusted-input surface and
no new failure mode. One pre-existing budget is re-verified rather than newly targeted: criterion 6's
10-second bar (truth 10, Task 11) — `collectFileImports` adds one extra pass over every token of
every scanned file, so the figure must be re-measured, not assumed.

---

## Scope and denominator conventions

Every figure below was measured first-hand in this worktree at HEAD `521eb0ea8` on 2026-10-20.

| Scope       | What it is                                                                        | Reproduced here                                                                                                  |
| ----------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Scope C** | the product scope — what `harness cleanup -t duplication` sees on this repository | 2,144 filesScanned / 96 classesReported / 382 members / 162 suppressed / 0 truncated / 0 skipped, exit 0, 12.4 s |
| Scope A     | `packages/` only                                                                  | not re-run; the caller's 58 classes / 230 members and the digest `7e0f1622fb75abbc` are taken as recorded        |

Scope C matches the caller's brief exactly, counter for counter. **All label-rate figures in this
plan have denominator 96 = the Scope C reported classes.**

---

## The spec's literal D8 reading is REFUTED by measurement

The spec says (§ `partial-extraction` derivation (D8)): "A clone class is labelled
`partial-extraction` when every member's file imports a common module… Roughly ten lines over the
import lists the snapshot already carries." Criterion 3 says the same thing at file level.

Implemented literally, that is not a signal. Measured over the 96 Scope C classes, five candidate
predicates (each one condition stricter than the last):

| #   | Predicate                                                                   | Labelled / 96 |      % | Mirror classes labelled / 38 |
| --- | --------------------------------------------------------------------------- | ------------: | -----: | ---------------------------: |
| A   | raw import-specifier strings intersect (the literal "import lists" reading) |        **89** | 92.7 % |                           38 |
| B   | A, but specifiers resolved to a module identity                             |        **88** | 91.7 % |                           38 |
| C   | B, and the binding is referenced inside every member's unit body            |        **37** | 38.5 % |                            5 |
| D   | C, minus type-only imports                                                  |        **27** | 28.1 % |                            5 |
| E   | D, minus bare specifiers (builtins and installed dependencies) — **CHOSEN** |        **10** | 10.4 % |                        **0** |

Three findings this produced, each one load-bearing:

1. **A is not merely noisy, it is WRONG.** The 10 craft `phases/critique.ts` files all sit at the
   same depth, so their raw specifiers happen to match — but `../catalog/rubrics/index.js` and
   `../findings/schema.js` also match across them while resolving to **different files per craft
   package**. Candidate A reports 3 common modules for the `parseFencedJson` class, two of which are
   not shared at all. Candidate B reports exactly 1. Resolution is a correctness requirement, not
   hygiene.
2. **B would make the known presentation problem worse.** All 38 platform-mirror classes (the 39.6%
   concentration the Phase-3 record names) are 4 copies of one file, so their import lists are
   identical by construction and B labels every one of them. Boosting them would put the mirror
   block at the head of the operator's page. Candidate E labels **0 of 38**.
3. **The type-only exclusion is not arbitrary** — it is criterion 2's own false-positive clause.
   Criterion 2 rejects a class whose members "are structurally forced by a framework or interface
   contract". A shared `import type` IS that contract; a shared value helper that the duplicated
   wrappers CALL is the half-done extraction D8 was earned by. (Two classes drop between D and E on
   an inline `import { type LlmProvider }` specifier, which is why the exclusion must be per
   specifier, not just per declaration.)

The 10 classes candidate E labels, Scope C, priority-relevant fields:

| rank | shape   | unit                     | sharedImport (key)                               |
| ---: | ------- | ------------------------ | ------------------------------------------------ |
| 1320 | 3 × 440 | `collectApiCraftPrompts` | `packages/cli/src/mcp/utils/sanitize-path` (+1)  |
|  916 | 4 × 229 | `runAction`              | `packages/cli/src/output/formatter` (+3)         |
|  846 | 3 × 282 | `printResult`            | `packages/cli/src/output/formatter`              |
|  630 | 3 × 210 | `parseFindingFromRaw`    | `packages/cli/src/shared/craft/findings/derived` |
|  525 | 5 × 105 | `<anon>`                 | `packages/core/src/review/constants`             |
|  522 | 6 × 87  | **`parseFencedJson`**    | **`packages/cli/src/shared/craft/fenced-json`**  |
|  417 | 3 × 139 | `detectTsIgnore`         | `packages/core/src/review/constants`             |
|  265 | 5 × 53  | `getRules`               | `packages/core/src/architecture/collectors/hash` |
|  216 | 4 × 54  | `resolveOutputMode`      | `packages/cli/src/output/formatter`              |
|  147 | 3 × 49  | `resolveOutputMode`      | `packages/cli/src/output/formatter`              |

All ten read as genuine partial extractions (a shared helper exists; the wrapper layer stayed
duplicated). **2 of the 10 have more than one common module**, which is why the choice of
`sharedImport` needs a stated deterministic rule.

**Consequence for the plan:** criterion 3 and the D8 section must be restated to the predicate that
actually ships (Task 11). Shipping the literal criterion is not an option — it is refuted above.
This is the one judgment in this plan a reviewer should overrule first if they disagree; everything
downstream follows from it.

### D8 evidence, re-verified first-hand

`packages/cli/src/shared/craft/fenced-json.ts` exports `extractFencedJsonPayload`. Ten files import
it, and the same ten each declare their own local `parseFencedJson`:

```
grep -rln "shared/craft/fenced-json\|extractFencedJsonPayload" --include="*.ts" packages/ | grep -vE '\.(test|spec)\.ts$'
grep -rln "parseFencedJson" --include="*.ts" packages/ | grep -vE '\.(test|spec)\.ts$'
```

Both return the same 10 `packages/cli/src/*-craft/phases/critique.ts` files (the first additionally
returns the shared module itself). Denominator: 10 of the 11 `*-craft` packages that have a
`phases/critique.ts`; `design-craft` is the one that does neither. Six of the ten wrappers are
byte-identical enough to fingerprint together — the class is 6 members, not 10, which is itself the
honest figure (`grep -v test` would have dropped `test-craft` by substring; `grep -vE
'\.(test|spec)\.ts$'` is the filter used here).

---

## The ranking decision

D8 says "rank `partial-extraction` above plain duplication". Three mechanisms were measured over the
96 Scope C classes. Positions are by the resulting sort order; the printed page is the CLI's top 10.

| ordering                           | `sumCosts` (rank 980) | JSON-response (704) | `parseFencedJson` (522) | labelled on printed page | mirror rows on printed page |
| ---------------------------------- | --------------------: | ------------------: | ----------------------: | -----------------------: | --------------------------: |
| current (Phase 3)                  |                **#6** |             **#11** |                     #21 |                   3 / 10 |                  **4 / 10** |
| `priority = rank × 1.5`            |                    #8 |                 #14 |                     #12 |                   4 / 10 |                      3 / 10 |
| **`priority = rank × 2`** (CHOSEN) |               **#11** |             **#15** |                  **#9** |               **6 / 10** |                  **2 / 10** |
| strict tier (all labelled first)   |                   #15 |                 #18 |                      #6 |                  10 / 10 |                      0 / 10 |

**Chosen: a `priority` key, `PARTIAL_EXTRACTION_PRIORITY_BOOST = 2`, with `rank` left alone.**

Why a separate key and not a multiplier folded into `rank`:

- `rank` is documented as `tokenCount * members.length`, pinned by
  `packages/core/tests/duplication/clone-index.test.ts:309`, published by the CLI's `--json`, and is
  the magnitude field #1612/#1646 are specified to bind to. Folding a policy constant into it makes
  a consumer's "tokens × copies" arithmetic silently 2× wrong for exactly the classes it most wants
  to act on.
- The spec's criterion-1 evidence quotes rank **980** and **704** as size figures. Under this choice
  those values are untouched and stay valid; only their by-priority POSITIONS move, which Task 11
  records explicitly.
- The ordering policy becomes inspectable: one named exported constant and one published field, so a
  `--json` consumer can reproduce the order from the payload. Publishing a reordered list whose order
  cannot be derived from the published fields is the same defect one layer out.
- Cost, stated plainly: criterion 13's wording changes from "top `maxClasses` by `rank`" to "by
  `priority`", and `CloneClass` gains a field (Phase 4 was scoped as "flip a field the interface
  already carries"). Both are recorded, not hidden. `priority === rank` for every plain duplicate, so
  no project without a labelled class sees any change.

Why boost 2 and not a strict tier: the strict tier puts 10 of 10 labelled rows on the printed page
and pushes the largest clone in the repository (4 × 648 tokens) off it entirely, while dropping
`sumCosts` to #15. It replaces one presentation problem with another. Boost 2 keeps 4 plain
duplicates on the page including that largest clone at #2.

Why 2 and not 1.5: 2 is the smallest round multiplier that brings the criterion-3 named class onto
the default printed page (#9 vs #12), and it halves the mirror rows on that page (4 → 2) — a
measured, free improvement to the 38/96 concentration without implementing grouping. Its cost is
that `sumCosts` leaves the printed page (#6 → #11); it remains in `--json` and in the 96, so
criterion 1 ("shall report") still holds. **Task 4 carries a `[checkpoint:decision]` so the operator
can choose 1.5 instead with this table in front of them.**

Determinism is preserved: the comparator becomes
`b.priority - a.priority || a.fingerprint.localeCompare(b.fingerprint) || a.tokenCount - b.tokenCount`.
The fingerprint/tokenCount tiebreak exists because a digest collision can tie two classes on the
numeric key (10 × 6 = 20 × 3); the boost does not remove that possibility, so the tiebreak stays
exactly as Phase 1 measured it.

---

## Carried-forward items — judged

1. **Grouping the 38/96 structural concentration → NOT Phase 4, and not Phase 5 either.** Phase 4's
   signal measurably does not aggravate it (0 of 38 mirror classes labelled) and measurably improves
   it (mirror rows on the printed page 4 → 2). Grouping itself is a distinct presentation feature: it
   needs a grouping key (mirror-of-each-other? same owning skill?), a presentation form, and a
   decision about whether a group counts as one class against `maxClasses` — which would move
   criterion 13's semantics a second time, in the same release. Phase 5 is `code-craft` prompt
   wiring, a different subsystem. Verdict: convert the dangling "Phase 4/5 follow-up" into a NAMED
   deferred follow-up with this reason (Task 11), rather than deferring it a third time.
2. **`filesSkipped` unobservable in MCP summary mode → rides along (Task 7).** One key in
   `summarizeDuplication`, one assertion, one mutant. It is a named open gap in the spec's own record
   and the phase is already editing that function to carry the signal into `topClasses`. Flagged as a
   ride-along in the changeset so it is not mistaken for signal work.
3. **ADR 0111 `skipUnlessBin` only partly adopted (`comprehend-smoke.e2e.test.ts`, local `HAS_BIN`
   at 6 sites) → NOT Phase 4's business.** Different subsystem (comprehension e2e), no interaction
   with the duplication surfaces, and already filed by the Phase-3 executor. Agreed with that
   executor's judgment; no action.
4. **Knowledge-graph concept nodes (`partial-extraction`, `CloneClass`) → stay deferred.** Phase 4 is
   where `partial-extraction` becomes real, so this is the natural home — but `manage_adr`/graph
   enrichment is still not worktree-aware (#1507), and writing to the main checkout from this
   worktree is worse than not writing. Recorded in the spec as deferred WITH the blocking reason
   (Task 11), not silently skipped.

---

## File map

Complete. Nothing outside this list is created or modified.

```
CREATE packages/core/src/duplication/imports.ts
CREATE packages/core/tests/duplication/imports.test.ts
CREATE packages/core/tests/duplication/partial-extraction.test.ts
MODIFY packages/core/src/duplication/index.ts          (FingerprintedUnit.importKeys, fingerprintFile, CloneClass.priority/signal/sharedImport, comparator, truncation, re-exports, doc comments at :48 :114 :228 :993-995)
MODIFY packages/core/src/entropy/types/duplication.ts  (doc comment at :16 — "rank-descending")
MODIFY packages/core/tests/duplication/barrel.test.ts  (export-name list; CloneClass key set; labelled-class key set)
MODIFY packages/core/tests/duplication/clone-index.test.ts (priority === rank on a plain duplicate; two test titles at :407 :441)
MODIFY packages/core/tests/duplication/acceptance.test.ts  (test title at :147)
MODIFY packages/core/tests/entropy/detectors/duplication.test.ts (signal/priority survive detectDuplication; title at :103)
MODIFY packages/cli/src/commands/cleanup.ts            (CleanupResult.duplication fields + projectDuplication + printDuplicationSection + doc comment at :70)
MODIFY packages/cli/src/config/schema.ts               (doc comment at :128 — "top maxClasses by rank")
MODIFY packages/cli/tests/commands/cleanup-duplication.test.ts
MODIFY packages/cli/src/mcp/tools/entropy.ts           (summarizeDuplication: signal in topClasses + filesSkipped)
MODIFY packages/cli/tests/mcp/tools/entropy-duplication.test.ts
CREATE packages/cli/tests/fixtures/duplication-partial-extraction-project/README.md
CREATE packages/cli/tests/fixtures/duplication-partial-extraction-project/harness.config.json
CREATE packages/cli/tests/fixtures/duplication-partial-extraction-project/src/index.ts
CREATE packages/cli/tests/fixtures/duplication-partial-extraction-project/src/shared/payload.ts
CREATE packages/cli/tests/fixtures/duplication-partial-extraction-project/src/shared/labels.ts
CREATE packages/cli/tests/fixtures/duplication-partial-extraction-project/src/beta.ts
CREATE packages/cli/tests/fixtures/duplication-partial-extraction-project/src/wrappers/alpha.ts
CREATE packages/cli/tests/fixtures/duplication-partial-extraction-project/src/deep/nested/gamma.ts
CREATE packages/cli/tests/fixtures/duplication-partial-extraction-project/src/plain/one.ts
CREATE packages/cli/tests/fixtures/duplication-partial-extraction-project/src/plain/two.ts
CREATE packages/cli/tests/fixtures/duplication-partial-extraction-project/src/plain/three.ts
MODIFY packages/cli/tests/integration/cleanup-duplication-exit-code.e2e.test.ts
MODIFY docs/changes/duplication-detection/proposal.md  (criterion 3, criterion 13, criterion 1 evidence note, D8 section, Technical Design type block, Verification notes + deferred list)
MODIFY AGENTS.md                                       (:561-569 entropy/duplication paragraph)
MODIFY agents/skills/claude-code/harness-refactoring/SKILL.md (:10 and :68)
CREATE .changeset/duplication-partial-extraction-signal.md
```

Deliberately NOT modified, and why:

- `packages/cli/tests/fixtures/duplication-cli-project/**` — byte-identical, so its pinned numbers
  (1 class / 3 members / 83 tokens / rank 249) prove the no-regression side (truth 12). The new
  behaviour gets its own fixture project.
- `packages/core/src/entropy/detectors/duplication.ts` — it spreads `index.classes` through, so new
  fields flow with no edit. Verified: `DuplicationReport.classes` is `CloneClass[]` by reference
  (`packages/core/src/entropy/types/duplication.ts:16`) and the MCP `toJsonSafeDuplication` uses
  `...rest` (`packages/cli/src/mcp/tools/entropy.ts:280`). Only the CLI's `projectDuplication` and
  `summarizeDuplication` enumerate fields explicitly — both are in the file map.
- `scripts/generate-core-barrel.mjs` — `packages/core/src/index.ts:89` is `export * from
'./duplication'` and the `duplication` DIR_COMMENTS entry already exists, so new exports flow
  automatically. Verified at HEAD: `node scripts/generate-core-barrel.mjs --check` → "Core barrel is
  up to date.", exit 0.
- `harness.config.json`, `.harness/arch/baselines.json`, `.harness/arch/allowances/*` — no
  `--update-baseline`, no allowance extension. A threshold breach is refactored, never allowanced.

---

## Gating truths every task inherits

Bake these into every task; they are measured facts about this worktree, not style preferences.

- **Build with `pnpm --filter @harness-engineering/core run build`** (and
  `pnpm --filter @harness-engineering/cli run build` when CLI source changed). Do NOT use
  `npx turbo build --filter=...`: `@harness-engineering/dashboard` is a build dependency whose build
  fails here, so turbo prints `Tasks: N successful` and still exits 1 while leaving `dist` stale —
  and the pre-commit arch hook reads `dist`.
- **Run the CLI suite from `packages/cli`**, never `npx vitest run --root packages/cli` from the repo
  root (7 spurious failures from an unmocked `roadmapHealth` reading the live `docs/roadmap.md`).
  `packages/core/tests/duplication/barrel.test.ts` imports the PACKAGE specifier, so core must be
  rebuilt before it can see a new export.
- **`harness validate` cannot pass here**: 462 issues, exit 1. Baseline comparison only. Never a
  per-task gate; never report "validate passed".
- **`harness check-arch` exits 1 in the steady state** on 12 pre-existing `cyclomaticComplexity > 15`
  findings (orchestrator ×4, cli ×5, core ×3 — none in any Phase-4 file). Do not gate on the exit
  code, and never read `$?` through a pipe. Gate on the sorted issue-list diff:

  ```bash
  cd /Users/cwarner/Projects/iv/hd-dry-concept
  HARNESS_ARCH_BASE_REF=c83ec3620 node packages/cli/dist/bin/harness.js check-arch 2>&1 \
    | grep -E '^\s+\* |Threshold exceeded' | sort > /tmp/arch-after.txt
  diff /tmp/arch-before.txt /tmp/arch-after.txt   # must be empty
  ```

- **The real pre-commit gate** is `harness ci check --skip "entropy,docs,perf,security,deps,phase-gate"`
  plus `npx lint-staged`. Measured at HEAD: **exit 0 in 12.7 s**, arch reported `warn` with exactly
  three pre-existing NEW complexity lines at the stricter threshold 10 —
  `resolveDriftConfig` (cli/src/drift/index.ts), `walk` (cli/src/drift/index.ts), `walk`
  (cli/src/brand/index.ts). Warnings do not block, but **a task must not add a line to that list**:
  keep every new or edited function under cyclomatic 10 and under 50 lines. Dry-run before each
  commit:

  ```bash
  node packages/cli/dist/bin/harness.js ci check --skip "entropy,docs,perf,security,deps,phase-gate"
  ```

- **Never bypass hooks** — not `--no-verify`, nor `core.hooksPath`, `HUSKY=0`, or a hook-disabled
  subshell.
- **Revert telemetry churn** before every commit: the test suite, `validate` and `generate-docs`
  append to `.harness/security/timeline.json` and `packages/cli/.harness/security/timeline.json`.
  `git checkout -- .harness/security/timeline.json packages/cli/.harness/security/timeline.json`.
- **Test baselines re-verified in this worktree at HEAD** (all exit 0):
  `packages/core` `tests/duplication` + `tests/entropy` = 38 files / **466** passed (duplication
  **176** + entropy **290**); the six CLI duplication-facing suites
  (`tests/commands/cleanup-duplication.test.ts`, `tests/mcp/tools/entropy-duplication.test.ts`,
  `tests/mcp/tools/entropy.test.ts`, `tests/integration/cleanup-duplication-exit-code.e2e.test.ts`,
  `tests/shared/duplication-request.test.ts`, `tests/config/duplication-schema.test.ts`) = 6 files /
  **90** passed. Whole-suite baselines from the Phase-3 record, re-checked only in Task 13:
  `packages/cli` 750 files / 8,877 passed + 2 skipped; `packages/core` 505 + 1 skipped / 5,935 + 1
  skipped.
- **Coverage ratchet gives no non-vacuous verdict here** (5 of 7 packages report FAIL for missing
  data because the dashboard build blocks `test:coverage`; `--allow-missing` has no floor, #2307).
  Grade `cli` and `core` by hand in Task 13; do not quote the ratchet's sentence as a pass.
- **eslint on `packages/{core,cli}/tests/**` fails pre-existingly** and no tsc project includes test
  files. Judge every test by its RUNTIME assertions only. **Five vacuous tests have already shipped
  in this feature and been caught by later passes\*\* — so every task below names the mutation its
  test must fail against, and the task is not done until that mutant has been planted, observed red,
  and reverted.

---

## Skeleton (standard rigor, 13 tasks ≥ 8 → skeleton produced)

1. Core derivation module, pure and FS-free (~2 tasks, ~9 min)
2. Wire into the index: per-unit import keys, then signal + sharedImport (~2 tasks, ~9 min)
3. Ordering: `priority`, comparator, truncation `[checkpoint:decision]` (~1 task, ~5 min)
4. Truth sweep over core docs and detector-level pass-through (~1 task, ~4 min)
5. CLI and MCP surfaces, plus the `filesSkipped` ride-along (~2 tasks, ~9 min)
6. Portable fixture project and the two end-to-end proofs (~3 tasks, ~13 min)
7. Evidence record, spec amendments, project docs `[checkpoint:human-verify]` (~2 tasks, ~9 min)
8. Gate sweep (~1 task, ~5 min)

**Estimated total:** 13 tasks, ~55 min of task work. Skeleton approved: pending — the plan proceeds
to full detail because the caller's brief fixed the phase content; a reviewer rejecting the skeleton
should reject at the "literal D8 refuted" and "ranking decision" sections, which are the only
directional choices.

---

## Tasks

### Task 1: the FS-free import-derivation module

**Depends on:** none | **Files:** `packages/core/src/duplication/imports.ts` (CREATE),
`packages/core/tests/duplication/imports.test.ts` (CREATE) |
**Owns:** `packages/core/src/duplication/imports.ts`

Pure functions only: no I/O, no filesystem probing, no config. Everything this task writes is
decidable from one parsed `Program` plus the file's repo-relative path.

1. Create `packages/core/src/duplication/imports.ts`:

```ts
import { posix as pathPosix } from 'node:path';
import type { TSESTree } from '@typescript-eslint/typescript-estree';

/**
 * The module-identity key for one import, and the token offsets of the local
 * bindings it introduces.
 *
 * `byKey` maps a module key to the VALUE binding names that module introduces
 * into the file; `positions` maps each of those names to the ascending start
 * offsets at which it appears as an identifier token anywhere in the file.
 * Both are built in one pass per file so that asking "does THIS unit reference
 * an import" costs no further token scan — the detector extracts ~13,400 units
 * over ~1.6M tokens at this repository's scope, so a per-unit rescan is not an
 * option (`normalizeTokens` binary-searches for the same reason).
 */
export interface FileImports {
  byKey: ReadonlyMap<string, readonly string[]>;
  positions: ReadonlyMap<string, readonly number[]>;
}

/** Specifier extensions stripped so `./a.js`, `./a.ts` and `./a` share one key. */
const SPECIFIER_EXTENSION = /\.(ts|tsx|js|jsx|mjs|cjs)$/i;

/**
 * Resolve one import specifier to a repo-relative, extensionless module key —
 * or `null` when it is not a first-party module of this project.
 *
 * FS-FREE and therefore deterministic: keys are only ever COMPARED across the
 * members of a clone class, never read, so proving the file exists buys
 * nothing and would cost one `existsSync` per candidate extension per import.
 *
 * Resolution is a CORRECTNESS requirement, not hygiene. Measured over the 96
 * clone classes this repository reports: intersecting RAW specifier strings
 * labels 89 of them (92.7%) — and labels them WRONG, because
 * `../catalog/rubrics/index.js` is the same string in six craft packages while
 * naming six different files. Keyed on identity instead, that same class
 * reports exactly one shared module.
 *
 * `null` for a BARE specifier (`node:fs`, `commander`,
 * `@harness-engineering/core`): nobody extracts a wrapper into a Node builtin
 * or an installed dependency, and "every member calls `node:path`" labelled 17
 * further classes that are plain duplicates. `null` also for a relative
 * specifier that escapes `rootDir`, which cannot be a module of the project
 * being scanned and whose key would contradict the repo-relative contract
 * every other path in this module keeps.
 */
export function moduleKey(fromRelPath: string, specifier: string): string | null {
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) return null;
  const joined = pathPosix.normalize(pathPosix.join(pathPosix.dirname(fromRelPath), specifier));
  if (joined === '..' || joined.startsWith('../')) return null;
  return joined.replace(SPECIFIER_EXTENSION, '');
}

/**
 * Collect one file's first-party value imports and its binding positions.
 *
 * TYPE-ONLY imports are excluded, per declaration (`import type { X } from`)
 * AND per specifier (`import { type X, y } from`) — two of this repository's
 * classes hinge on the per-specifier arm alone. The exclusion is spec
 * criterion 2's own false-positive clause, not a convenience: a shared
 * `import type` IS the "structurally forced by an interface contract" case
 * that criterion rejects, while a shared helper the duplicated bodies CALL is
 * the half-done extraction decision D8 was earned by.
 *
 * A side-effect-only import (`import './polyfill.js'`) introduces no binding,
 * so it can never be referenced and is dropped here rather than carried as an
 * un-referenceable key.
 */
export function collectFileImports(program: TSESTree.Program, relPath: string): FileImports {
  const byKey = new Map<string, string[]>();
  const locals = new Set<string>();
  for (const node of program.body) {
    if (node.type !== 'ImportDeclaration' || node.importKind === 'type') continue;
    const key = moduleKey(relPath, node.source.value);
    if (key === null) continue;
    const names = node.specifiers
      .filter((s) => s.type !== 'ImportSpecifier' || s.importKind !== 'type')
      .map((s) => s.local.name);
    if (names.length === 0) continue;
    const existing = byKey.get(key);
    if (existing === undefined) byKey.set(key, [...names]);
    else existing.push(...names);
    for (const name of names) locals.add(name);
  }

  const positions = new Map<string, number[]>();
  if (locals.size > 0) {
    for (const token of program.tokens ?? []) {
      if (token.type !== 'Identifier' && token.type !== 'JSXIdentifier') continue;
      if (!locals.has(token.value)) continue;
      const at = positions.get(token.value);
      if (at === undefined) positions.set(token.value, [token.range[0]]);
      else at.push(token.range[0]);
    }
  }
  return { byKey, positions };
}

/**
 * The module keys referenced INSIDE one unit's character range, sorted.
 *
 * "Inside the unit body", not "anywhere in the file", is what turns a
 * non-signal into a signal: measured over this repository's 96 classes, the
 * file-level predicate the spec's D8 sentence describes labels 88 of them
 * (91.7%), including all 38 platform-mirror classes, whose four copies share
 * an import list by construction. The body-level predicate labels 10, none of
 * them a mirror.
 *
 * A token is counted when its START offset lies in `[start, end]`. An
 * identifier is one token and a unit's range ends on its own closing token, so
 * a binding that starts inside the unit ends inside it — the same selection
 * `normalizeTokens` documents (`range[0] >= start && range[1] <= end`) without
 * carrying a second offset per position. Positions are ascending from one
 * left-to-right pass, so the scan stops at the first offset past `end`.
 */
export function usedImportKeys(imports: FileImports, range: readonly [number, number]): string[] {
  const [start, end] = range;
  const used: string[] = [];
  for (const [key, locals] of imports.byKey) {
    if (locals.some((local) => referencedIn(imports.positions.get(local), start, end))) {
      used.push(key);
    }
  }
  return used.sort();
}

function referencedIn(at: readonly number[] | undefined, start: number, end: number): boolean {
  if (at === undefined) return false;
  for (const offset of at) {
    if (offset > end) return false;
    if (offset >= start) return true;
  }
  return false;
}

/**
 * The one module key every member references, or `undefined`.
 *
 * When a class shares more than one module — 2 of the 10 classes this
 * repository labels — the LEXICOGRAPHICALLY SMALLEST key wins. `sharedImport`
 * is a single field by interface (spec's `CloneClass`), so an arbitrary pick
 * would make the published value depend on file-discovery order; this one is
 * total, stable under any input ordering, and cheap to state in the docs.
 * `usedImportKeys` returns sorted keys and `filter` preserves order, so
 * `common[0]` IS that minimum.
 */
export function sharedImportKey(perMember: ReadonlyArray<readonly string[]>): string | undefined {
  if (perMember.length === 0) return undefined;
  let common = [...perMember[0]!];
  for (const keys of perMember.slice(1)) {
    const other = new Set(keys);
    common = common.filter((key) => other.has(key));
    if (common.length === 0) return undefined;
  }
  return common[0];
}
```

2. Create `packages/core/tests/duplication/imports.test.ts`, importing from
   `../../src/duplication/imports` and parsing with
   `parse(src, { tokens: true, loc: true, range: true, jsx: false, errorOnUnknownASTType: false })`
   from `@typescript-eslint/typescript-estree`. Cover, each case asserting a VALUE (never just
   "is defined"):
   - `moduleKey('src/copy-craft/phases/critique.ts', '../../shared/craft/fenced-json.js')` ===
     `'src/shared/craft/fenced-json'`; `moduleKey('src/beta.ts', './shared/payload.js')` ===
     `'src/shared/payload'` — **the two differ as raw strings and MUST be equal as keys**
     (`moduleKey('src/deep/nested/gamma.ts', '../../shared/payload.js')` likewise).
   - `moduleKey(x, 'node:fs')`, `moduleKey(x, 'commander')`, `moduleKey(x, '@scope/pkg')` all `null`.
   - `moduleKey('src/a.ts', '../../outside/thing.js')` === `null` (escapes `rootDir`).
   - `.js` / `.ts` / `.tsx` / no-extension specifiers for one file all yield one key.
   - `collectFileImports`: `import type { A } from './t.js'` contributes nothing;
     `import { type A, b } from './m.js'` contributes `['b']` only; `import './side.js'`
     contributes nothing; `import * as ns from './n.js'` and `import d from './d.js'` contribute
     `['ns']` / `['d']`; two declarations of one module merge into one key with both names.
   - `usedImportKeys`: a binding referenced only OUTSIDE the given range is absent; referenced
     inside is present; output is sorted.
   - `sharedImportKey([['a','b'],['b','c']])` === `undefined` is wrong — assert `'b'`;
     `sharedImportKey([['a'],['b']])` === `undefined`; `sharedImportKey([])` === `undefined`;
     `sharedImportKey([['z','a'],['a','z']])` === `'a'` **and equals the result with the two member
     arrays reversed** (determinism).
3. Run: `cd /Users/cwarner/Projects/iv/hd-dry-concept/packages/core && npx vitest run tests/duplication/imports.test.ts`
4. **Mutations to plant, observe red, revert** (each in `imports.ts`):
   - return `specifier` instead of the joined key → the depth-pair equality case fails.
   - drop the bare-specifier `null` → the `node:fs` case fails.
   - drop the `s.importKind !== 'type'` arm → the inline-type case fails.
   - replace `common[0]` with `common.pop()` → the determinism case fails.
   - drop the `offset > end` early return (make it `continue`) → the outside-range case still
     passes, so **also assert a range BEFORE the reference** (`[0, start-1]`), which that mutant
     breaks. (Plant this one before claiming the range test is load-bearing.)
5. Run: `cd /Users/cwarner/Projects/iv/hd-dry-concept && node packages/cli/dist/bin/harness.js check-deps` — expect exit 0 and one more module than the recorded 2,664.
6. Revert telemetry churn, then commit:
   `feat(duplication): derive first-party module keys and body-referenced imports`

### Task 2: attach per-unit import keys in `fingerprintFile`

**Depends on:** Task 1 | **Files:** `packages/core/src/duplication/index.ts`,
`packages/core/tests/duplication/failure-behavior.test.ts` |
**Owns:** `packages/core/src/duplication/index.ts`

1. In `packages/core/src/duplication/index.ts`, add to the public re-export block near the top
   (beside the `./tokens` re-exports):

```ts
export type { FileImports } from './imports';
export { moduleKey, collectFileImports, usedImportKeys, sharedImportKey } from './imports';
```

and `import { collectFileImports, usedImportKeys, sharedImportKey } from './imports';` with the
other relative imports.

2. Extend `FingerprintedUnit` (currently at `:506-511`):

```ts
/** One fingerprinted unit: its digest, token count, located member, and the
 * first-party module keys its BODY references. Empty for a unit that
 * references no first-party import — the overwhelmingly common case, and the
 * reason this is an array rather than an optional field: absent and "none"
 * are the same statement here, and a required field cannot be forgotten by a
 * future producer. */
export interface FingerprintedUnit {
  fingerprint: string;
  tokenCount: number;
  member: CloneMember;
  importKeys: readonly string[];
}
```

3. In `fingerprintFile`, inside the existing `try` that yields `'internal-error'` (import collection
   is OUR code, not the file's, so it is classified with normalization and the digest — see
   `FileSkipReason`), before the `for (const unit of extracted)` loop:

```ts
const fileImports = collectFileImports(program, relPath);
```

and in the `units.push({...})` literal add `importKeys: usedImportKeys(fileImports, unit.range),`
immediately after `tokenCount`.

4. In `packages/core/tests/duplication/failure-behavior.test.ts`'s existing
   `describe('fingerprintFile')`, add one case: a file importing `./helper.js` whose unit body calls
   the imported binding, and a second unit in the same file that does not →
   `result.units[i].importKeys` is `['src/helper']` for the first and `[]` for the second. Assert the
   literal arrays.
5. Run: `cd /Users/cwarner/Projects/iv/hd-dry-concept/packages/core && npx vitest run tests/duplication`
   — expect 176 + the new cases, exit 0.
6. **Mutation:** pass `[0, Number.MAX_SAFE_INTEGER]` instead of `unit.range` → the second unit's
   `[]` assertion fails. Plant, observe, revert.
7. Revert telemetry churn, commit: `feat(duplication): record each unit's body-referenced imports`

### Task 3: derive `signal` and `sharedImport` on the clone class

**Depends on:** Task 2 | **Files:** `packages/core/src/duplication/index.ts`,
`packages/core/tests/duplication/partial-extraction.test.ts` (CREATE),
`packages/core/tests/duplication/barrel.test.ts` |
**Owns:** `packages/core/src/duplication/index.ts`

1. In the class-building loop of `buildCloneIndex` (currently `:963-979`), replace the
   `qualifying.push({...})` literal with:

```ts
// D8, as MEASURED rather than as first written: the spec's file-level
// sentence ("every member's file imports a common module") labels 88 of
// this repository's 96 classes, 38 of them platform mirrors whose four
// copies share an import list by construction. The predicate that ships
// is the body-level, first-party, value-only one — 10 of 96 — and it is
// documented in `imports.ts`, where each condition is earned separately.
const sharedImport = sharedImportKey(units.map((unit) => unit.importKeys));
const signal: CloneClass['signal'] =
  sharedImport === undefined ? 'duplicate' : 'partial-extraction';
qualifying.push({
  fingerprint,
  tokenCount,
  members,
  rank: tokenCount * members.length,
  signal,
  // Spread, never `sharedImport: undefined`: a plain duplicate's key set
  // is pinned by the barrel suite, and a present-but-undefined key is a
  // different object on the wire (`JSON.stringify` drops it, `Object.keys`
  // does not).
  ...(sharedImport !== undefined && { sharedImport }),
});
```

2. Update the `CloneClass.signal` / `.sharedImport` doc comments (`:50-57`) — they currently say
   "Always `'duplicate'` in Phase 1" and "unset in Phase 1". State the predicate and point at
   `imports.ts` for the measurement.
3. Create `packages/core/tests/duplication/partial-extraction.test.ts` using the existing
   `scratch(files)` helper shape from `clone-index.test.ts` (mkdtemp + `mkdir -p` + write). Fixtures
   write a shared helper and three identical wrappers **at three different directory depths** so the
   raw-specifier implementation cannot pass:

```ts
const shared = `export function extract(raw: string): string {\n  return raw.trim();\n}\n`;
const wrapper = (spec: string, fn: string, p: string, out: string) =>
  `import { extract } from '${spec}';\n` +
  `export function ${fn}(${p}: string[]): string[] {\n` +
  `  const ${out}: string[] = [];\n` +
  `  for (const item of ${p}) {\n` +
  `    const value = extract(item);\n` +
  `    if (value.length > 0) {\n` +
  `      ${out}.push(value);\n` +
  `    }\n` +
  `  }\n` +
  `  return ${out};\n` +
  `}\n`;
```

Cases, each asserting values:

- **labels the class and names the module across three import depths** —
  `src/shared/extract.ts` + `src/beta.ts` (`'./shared/extract.js'`) +
  `src/wrappers/alpha.ts` (`'../shared/extract.js'`) +
  `src/deep/nested/gamma.ts` (`'../../shared/extract.js'`); expect one class, 3 members,
  `signal === 'partial-extraction'`, `sharedImport === 'src/shared/extract'`. Use
  `{ minTokens: 10, ignorePatterns: [] }` if the wrapper body measures below 40 tokens — assert
  the actual `tokenCount` value the run produces, do not guess it.
- **file-level-only common import stays `'duplicate'`** — same three wrappers, but the imported
  binding is referenced in a SECOND function in each file and not in the cloned body.
- **a common Node builtin stays `'duplicate'`** — three identical bodies that each call
  `path.join`, importing `node:path`.
- **a common type-only import stays `'duplicate'`** — `import type { Shape }` used in the
  signature of all three members.
- **`sharedImport` is absent on a plain duplicate** — `Object.keys(cls)` has no `sharedImport`
  and `'sharedImport' in cls === false`.
- **determinism** — building the same file list reversed yields the same `sharedImport`.

4. In `packages/core/tests/duplication/barrel.test.ts`: add `moduleKey`, `collectFileImports`,
   `usedImportKeys`, `sharedImportKey` to the `it.each` export-name list, and add one case over a
   LABELLED class asserting `Object.keys(cls).sort()` is exactly
   `['fingerprint','members','priority','rank','sharedImport','signal','tokenCount']` — note
   `priority` arrives in Task 4, so write this case in Task 4 and only extend the export list here.
5. Run, in order:
   `cd /Users/cwarner/Projects/iv/hd-dry-concept && pnpm --filter @harness-engineering/core run build`
   then
   `cd packages/core && npx vitest run tests/duplication`
6. **Mutations:** (a) use the raw specifier in `moduleKey` → the three-depth case fails (the
   file-level mutant would NOT fail it, which is why the depths differ); (b) replace `usedImportKeys`
   with all of `byKey.keys()` → the file-level-only case fails; (c) change the spread to
   `sharedImport,` unconditionally → the absent-key case fails. Plant each, observe red, revert.
7. Revert telemetry churn, commit:
   `feat(duplication): label partial-extraction classes and name the shared module`

### Task 4: `priority`, the comparator, and the report cap `[checkpoint:decision]`

**Depends on:** Task 3 | **Files:** `packages/core/src/duplication/index.ts`,
`packages/core/tests/duplication/partial-extraction.test.ts`,
`packages/core/tests/duplication/barrel.test.ts` |
**Owns:** `packages/core/src/duplication/index.ts`

**[checkpoint:decision]** Before editing, present the ranking table from this plan's "The ranking
decision" section and ask, in plain text: boost **2** (recommended — brings the criterion-3 named
class onto the printed page at #9 and halves the mirror rows there, at the cost of `sumCosts` moving
#6 → #11) or **1.5** (keeps `sumCosts` at #8, leaves `parseFencedJson` at #12, off the page)? A
strict tier is NOT offered: measured, it puts 10 of 10 labelled rows on the page and pushes the
repository's largest clone off it. Wait for the reply; use 2 if the operator declines to choose, and
record which was chosen in the commit message.

1. Add the exported constant beside `MAX_EVIDENCE_ENTRIES` (`:356`):

```ts
/**
 * How much a `partial-extraction` class outweighs a plain duplicate of the
 * same size (spec decision D8, "rank partial-extraction above plain
 * duplication").
 *
 * A POLICY constant, deliberately separate from `rank`: a half-extracted class
 * is the cheapest fix on the page, because the shared module already exists
 * and the refactor is delete-and-import rather than design.
 *
 * Measured over this repository's 96 reported classes when this landed: at 2,
 * six of the printed top ten are labelled, the mirror rows on that page fall
 * from four to two, and the spec's named `parseFencedJson` case rises from #21
 * to #9 — while the largest clone in the repository stays visible at #2. A
 * strict tier (every labelled class first) instead fills all ten printed rows
 * and pushes that largest clone off the page entirely.
 */
export const PARTIAL_EXTRACTION_PRIORITY_BOOST = 2;
```

2. Add the field to `CloneClass`, immediately after `rank` (`:48-49`), and correct `rank`'s own
   comment so neither lies:

```ts
/**
 * `tokenCount * members.length` — the SIZE of the duplication, and nothing
 * else. Unchanged by the signal, so a consumer can read it as "tokens x
 * copies" for any class (#1612 / #1646 bind to it as a magnitude).
 */
rank: number;
/**
 * The ORDERING key: `rank`, times
 * {@link PARTIAL_EXTRACTION_PRIORITY_BOOST} when
 * `signal === 'partial-extraction'`.
 *
 * `classes` is sorted by this and the `maxClasses` cap keeps the top
 * `maxClasses` by this (spec criterion 13). It equals `rank` for every plain
 * duplicate, so a project with no partial-extraction class sees exactly the
 * pre-Phase-4 order. Published rather than kept private because a consumer
 * handed a reordered list must be able to derive the order from the payload.
 */
priority: number;
```

3. Set it in the `qualifying.push` literal:

```ts
    const rank = tokenCount * members.length;
    ...
      rank,
      priority: signal === 'partial-extraction' ? rank * PARTIAL_EXTRACTION_PRIORITY_BOOST : rank,
```

4. Change the comparator (`:985-989`) to lead with `priority`, keeping both tiebreaks and extending
   the existing comment (the collision case it documents — 10 × 6 = 20 × 3 — is unaffected by the
   boost, so the tiebreak is still load-bearing):

```ts
qualifying.sort(
  (a, b) =>
    b.priority - a.priority ||
    a.fingerprint.localeCompare(b.fingerprint) ||
    a.tokenCount - b.tokenCount
);
```

5. Update the three doc comments that now misdescribe the order: `CloneIndex.classes` (`:114`,
   "rank-descending" → "priority-descending"), `DuplicationConfig.maxClasses` (`:228`, "top
   `maxClasses` by rank" → "by `priority`"), and the `byMember` comment (`:993-995`,
   "iterating rank-descending … highest-ranked owning class" → priority).
6. Tests:
   - In `partial-extraction.test.ts`: a fixture with ONE labelled class of lower `rank` and ONE
     plain-duplicate class of higher `rank`, where `rank_PE < rank_plain < 2 × rank_PE` — assert
     `classes[0].signal === 'partial-extraction'`, `classes[0].priority === classes[0].rank * 2`,
     `classes[1].priority === classes[1].rank`, and `classes[0].rank < classes[1].rank`. Then rebuild
     with `maxClasses: 1` and assert the SURVIVOR is the labelled class and `classesTruncated === 1`
     (criterion 13 by `priority`).
   - In `clone-index.test.ts:309`: add `expect(index.classes[0]!.priority).toBe(index.classes[0]!.rank)`
     beside the existing `rank === tokenCount * members.length` assertion, and retitle `:407` /
     `:441` to "by priority".
   - In `barrel.test.ts`: add `PARTIAL_EXTRACTION_PRIORITY_BOOST` to the export-name list, add
     `'priority'` to the plain-duplicate `CloneClass` key set (`:132-139`), and add the labelled-class
     key-set case described in Task 3 step 4.
7. Run: `cd /Users/cwarner/Projects/iv/hd-dry-concept && pnpm --filter @harness-engineering/core run build && cd packages/core && npx vitest run tests/duplication`
8. **Mutations:** (a) `priority: rank` unconditionally → the ordering case and the `maxClasses`
   survivor case both fail; (b) keep the comparator on `rank` while `priority` is set → the ordering
   case fails and the truncation case fails; (c) drop the `fingerprint` tiebreak → the Phase-1
   determinism case in `clone-index.test.ts` fails. Plant each, observe, revert.
9. Revert telemetry churn, commit:
   `feat(duplication): order and cap clone classes by priority, boosting partial extraction`

### Task 5: core truth sweep and detector-level pass-through

**Depends on:** Task 4 | **Files:** `packages/core/src/entropy/types/duplication.ts`,
`packages/core/tests/entropy/detectors/duplication.test.ts`,
`packages/core/tests/duplication/acceptance.test.ts` |
**Owns:** `packages/core/src/entropy/types/**`

1. `packages/core/src/entropy/types/duplication.ts:16` — "Clone classes, rank-descending, capped at
   `maxClasses`" → "priority-descending (`CloneClass.priority`), capped at `maxClasses`".
2. `packages/core/tests/entropy/detectors/duplication.test.ts` — retitle `:103` to "by priority" and
   add one case proving the fields SURVIVE the detector (it spreads `index.classes`, so this pins the
   pass-through rather than re-testing the derivation): a three-member partial-extraction fixture
   through `detectDuplication` whose report's `classes[0]` carries
   `signal === 'partial-extraction'`, a `sharedImport` string, and `priority === rank * 2`.
3. `packages/core/tests/duplication/acceptance.test.ts:147` — retitle to "by priority".
4. Run: `cd /Users/cwarner/Projects/iv/hd-dry-concept/packages/core && npx vitest run tests/duplication tests/entropy`
   — expect 466 + the cases added in Tasks 1-5, 38 files, exit 0.
5. **Mutation:** in `detectDuplication`, map `classes` to a field-by-field literal that omits
   `signal` → the new pass-through case fails. Plant, observe, revert. (This is the mutant that
   proves the "new fields flow automatically" claim is actually guarded, rather than merely true
   today.)
6. Revert telemetry churn, commit: `test(duplication): pin signal and priority through the detector`

### Task 6: CLI projection and printed advisory line

**Depends on:** Task 4 | **Files:** `packages/cli/src/commands/cleanup.ts`,
`packages/cli/src/config/schema.ts`, `packages/cli/tests/commands/cleanup-duplication.test.ts` |
**Owns:** `packages/cli/src/commands/cleanup.ts`

1. `CleanupResult.duplication.classes` (`:79-90`) — add after `rank: number;`:

```ts
      priority: number;
      signal: 'duplicate' | 'partial-extraction';
      sharedImport?: string;
```

and correct the field's doc comment at `:70` ("ADVISORY clone classes, rank-descending" →
"priority-descending; `priority` is `rank` for a plain duplicate and `rank x 2` for a
`partial-extraction` class, so the published order is derivable from the published fields"). 2. `projectDuplication` (`:139-151`) — carry the three fields, keeping the conditional spread so a
plain duplicate's JSON object is unchanged from Phase 3:

```ts
      rank: cls.rank,
      priority: cls.priority,
      signal: cls.signal,
      ...(cls.sharedImport !== undefined && { sharedImport: cls.sharedImport }),
```

and extend the projection's "DROPPED, and this is a real loss" doc block to say the signal is
KEPT and why. 3. `printDuplicationSection` (`:404-410`) — name the signal on the row that has one, so the reorder
explains itself to the operator:

```ts
for (const cls of duplication.classes.slice(0, 10)) {
  const first = cls.members[0];
  const where = first ? `${first.unit} (${first.file}:${first.startLine})` : '(no members)';
  // The signal is what makes a row jump the size ordering, so a row that
  // jumped says why. Without it the printed order is unexplainable from the
  // printed text — the same defect as publishing `priority` nowhere.
  const signal =
    cls.signal === 'partial-extraction' && cls.sharedImport !== undefined
      ? ` [partial-extraction -> ${cls.sharedImport}]`
      : '';
  console.log(`  - ${cls.memberCount}x ${cls.tokenCount} tokens: ${where}${signal}`);
}
```

Keep `printDuplicationSection` under 50 lines and under cyclomatic 10 (it is currently ~26 lines;
if the arithmetic gets close, extract the signal suffix into a module-level
`function signalSuffix(cls): string`). 4. `packages/cli/src/config/schema.ts:128` — "top `maxClasses` by rank survive" → "by `priority`". 5. `packages/cli/tests/commands/cleanup-duplication.test.ts` — the suite drives a MOCKED analyzer, so
extend the mock's class fixtures (`:169`, `:179`, `:258`, `:340`) with `priority` and `signal`, add
one labelled class, and add cases:

- the projection carries `signal`, `sharedImport` and `priority` for the labelled class, and the
  plain class's object has NO `sharedImport` key;
- the existing `classes.map(c => c.rank)` order assertion at `:267` is extended with a
  `priority` order assertion;
- the printed output contains `[partial-extraction -> <key>]` on the labelled row and NOT on the
  plain row (capture `console.log` the way the suite already does).

6. Run:
   `cd /Users/cwarner/Projects/iv/hd-dry-concept && pnpm --filter @harness-engineering/cli run build`
   then `cd packages/cli && npx vitest run tests/commands/cleanup-duplication.test.ts tests/config/duplication-schema.test.ts`
7. **Mutations:** (a) drop `signal` from `projectDuplication` → the projection case fails; (b) drop
   the suffix from the printed line → the printed case fails; (c) make the spread unconditional
   (`sharedImport: cls.sharedImport`) → the no-key case fails. Plant each, observe, revert.
8. Revert telemetry churn, commit: `feat(cleanup): publish and print the partial-extraction signal`

### Task 7: MCP summary — signal in `topClasses`, and the `filesSkipped` ride-along

**Depends on:** Task 4 | **Files:** `packages/cli/src/mcp/tools/entropy.ts`,
`packages/cli/tests/mcp/tools/entropy-duplication.test.ts` |
**Owns:** `packages/cli/src/mcp/tools/entropy.ts`

1. In `summarizeDuplication` (`:215-234`) add `filesSkipped: duplication.stats.filesSkipped,` beside
   the other counters, and extend the `topClasses` line with the signal:

```ts
    topClasses: duplication.classes
      .slice(0, 3)
      .map((cls: {
        members: Array<{ unit: string; file: string }>;
        tokenCount: number;
        signal: string;
        sharedImport?: string;
      }) => {
        const head = `${cls.members.length}x ${cls.tokenCount} tokens: ${cls.members[0]?.unit ?? '<anon>'} (${cls.members[0]?.file ?? '?'})`;
        return cls.signal === 'partial-extraction' && cls.sharedImport !== undefined
          ? `${head} [partial-extraction -> ${cls.sharedImport}]`
          : head;
      }),
```

Extend the function's doc comment: the top three are where an agent decides, so the cheapest-fix
signal belongs there; and `filesSkipped` closes the gap the spec's Phase-3 record names as "the
remaining gap, not closed here" (summary mode was the one surface with no skip counter). 2. In `packages/cli/tests/mcp/tools/entropy-duplication.test.ts`, extend the existing summary-mode
case (`:93`) to assert `advisory.duplication.filesSkipped === 0` on the Phase-3 fixture, and note
in a comment that a non-zero arm is covered by core's own skip suites (this surface only forwards
the counter). 3. Run: `cd /Users/cwarner/Projects/iv/hd-dry-concept && pnpm --filter @harness-engineering/cli run build && cd packages/cli && npx vitest run tests/mcp/tools/entropy-duplication.test.ts tests/mcp/tools/entropy.test.ts` 4. **Mutations:** (a) drop `filesSkipped` from the projection → the summary case fails; (b) drop the
signal suffix → the Task-10 MCP case fails (so this mutant is re-planted in Task 10, after the
fixture exists; note that explicitly rather than claiming coverage here). 5. Revert telemetry churn, commit:
`feat(mcp): name the partial-extraction signal and the skip count in the duplication summary`

### Task 8: the portable partial-extraction fixture project

**Depends on:** Task 4 | **Files:** the eleven files under
`packages/cli/tests/fixtures/duplication-partial-extraction-project/` (CREATE) |
**Owns:** `packages/cli/tests/fixtures/duplication-partial-extraction-project/**`

A SECOND fixture project, so the Phase-1/2/3 fixture stays byte-identical and its pinned numbers keep
proving the no-regression side (truth 12). Criterion 15: discovery is driven solely by the fixture's
own `entropy.entryPoints`; no path in the detector may assume this repository's layout.

1. `harness.config.json` — copy the sibling fixture's shape verbatim:
   `{ "version": 1, "rootDir": ".", "docsDir": "./docs", "entropy": { "entryPoints": ["src/index.ts"], "excludePatterns": ["**/node_modules/**"], "duplication": true } }`
   (`duplication: true` so `-t all` arms can be exercised too).
2. `src/shared/payload.ts` — `export function extractPayload(raw: string): string` returning
   `raw.trim()`.
3. `src/shared/labels.ts` — `export const LABEL = 'plain';`
4. Three wrappers with IDENTICAL normalized bodies at three depths, each calling `extractPayload`:
   `src/beta.ts` (`'./shared/payload.js'`), `src/wrappers/alpha.ts` (`'../shared/payload.js'`),
   `src/deep/nested/gamma.ts` (`'../../shared/payload.js'`). Differ only in function, parameter and
   local identifier names (Type-2, per D1).
5. Three plain duplicates with a LARGER identical body that does NOT reference any import:
   `src/plain/one.ts`, `src/plain/two.ts`, `src/plain/three.ts`, each importing `LABEL` from
   `'../shared/labels.js'` and using it in a SECOND, non-duplicated function in the same file. This
   is the control: a file-level common import that must NOT label the class.
6. `src/index.ts` re-exporting every unit above, so the snapshot's entry-point discovery reaches all
   nine source files.
7. **Measure, do not estimate.** Drive the built core directly and record the real numbers:

```bash
cd /Users/cwarner/Projects/iv/hd-dry-concept
node -e "
const { buildCloneIndex } = require('./packages/core/dist/index.js');
const { globSync } = require('node:fs');
const root = 'packages/cli/tests/fixtures/duplication-partial-extraction-project';
const files = globSync(root + '/src/**/*.ts', {}).map((f) => require('node:path').resolve(f));
buildCloneIndex(files, { rootDir: require('node:path').resolve(root), ignorePatterns: [] }).then((r) => {
  if (!r.ok) throw new Error(r.error.message);
  console.log(JSON.stringify(r.value.classes.map((c) => ({ n: c.members.length, tok: c.tokenCount, rank: c.rank, priority: c.priority, signal: c.signal, sharedImport: c.sharedImport, fp: c.fingerprint })), null, 1));
  console.log(JSON.stringify(r.value.stats));
});
"
```

**Required invariants — adjust the fixture bodies until all hold, then record the measured
numbers:** exactly 2 classes; the labelled one has 3 members, `signal
   'partial-extraction'`, `sharedImport 'src/shared/payload'`; the plain one has 3 members and
`signal 'duplicate'`; and `rank_PE < rank_plain < 2 × rank_PE`, so `classes[0]` is the LABELLED
class despite its smaller size. Both bodies must clear `minTokens: 40` under the shipped defaults
(enlarge the loop bodies if the measurement says otherwise — do not lower the fixture's bar). 8. `README.md` — follow the sibling fixture's format exactly: consumers, what is planted (a table of
unit / kind / tokens / reported?), a "## Measured, not estimated" block holding the verbatim
driver output above, and a "## Why three depths" note recording that the three import specifiers
are three different strings resolving to one module key, which is the arm a raw-specifier
implementation fails. 9. Run: `cd /Users/cwarner/Projects/iv/hd-dry-concept && npx prettier --check "packages/cli/tests/fixtures/duplication-partial-extraction-project/**"` 10. Revert telemetry churn, commit:
`test(duplication): add a partial-extraction fixture project with measured expectations`

### Task 9: end-to-end through the real `harness cleanup` process

**Depends on:** Task 6, Task 8 |
**Files:** `packages/cli/tests/integration/cleanup-duplication-exit-code.e2e.test.ts` |
**Owns:** `packages/cli/tests/integration/**`

1. Add a second `describe.skipIf(skipUnlessBin)` block for the new fixture, copying the existing
   block's `beforeEach`/`afterEach` temp-dir copy and `runHarness` usage (ADR 0111's shared predicate
   — do NOT introduce a local `HAS_BIN`; the suite is already covered by the `main-health.yml`
   reachability assertion).
2. Cases, all against `cleanup -t duplication --json` on the copied fixture:
   - `status === 0`, `payload.totalIssues === 0` (D4 holds for a labelled class too — the signal must
     not leak into the exit code),
   - `payload.duplication.classes` has length 2, `classes[0].signal === 'partial-extraction'`,
     `classes[0].sharedImport === 'src/shared/payload'`,
     `classes[0].priority === classes[0].rank * 2`, `classes[1].signal === 'duplicate'`,
     `classes[1].priority === classes[1].rank`, and `classes[0].rank < classes[1].rank` — **the
     ordering proof: the smaller class is first because it is labelled**,
   - the human-readable run (`cleanup -t duplication`, no `--json`) prints
     `[partial-extraction -> src/shared/payload]` and the plain row without it.
3. Run: `cd /Users/cwarner/Projects/iv/hd-dry-concept && pnpm --filter @harness-engineering/cli run build && cd packages/cli && npx vitest run tests/integration/cleanup-duplication-exit-code.e2e.test.ts`
   — and confirm the suite was REACHED, not skipped (`npx vitest run ... --reporter=verbose` shows
   the case names; a skipped suite must not read as a pass).
4. **Mutation:** set `PARTIAL_EXTRACTION_PRIORITY_BOOST = 1` in core, rebuild core AND cli, re-run →
   the ordering case fails because `classes[0]` becomes the plain duplicate. Revert and rebuild. This
   is the whole-pipeline proof that the boost is load-bearing through two package builds and a
   spawned process.
5. Revert telemetry churn, commit:
   `test(cleanup): prove the partial-extraction signal and order through the real CLI`

### Task 10: end-to-end through the real `detect_entropy` handler

**Depends on:** Task 7, Task 8 |
**Files:** `packages/cli/tests/mcp/tools/entropy-duplication.test.ts` |
**Owns:** `packages/cli/tests/mcp/**`

1. Add cases against the new fixture, mirroring the suite's existing temp-copy pattern:
   - detailed mode (`compact: false`): `duplication.classes[0]` carries `signal`, `sharedImport` and
     `priority` — the fields survive `toJsonSafeDuplication`'s `...rest`;
   - summary mode: `advisory.duplication.topClasses` — remember the compaction middleware COLLAPSES a
     single-element array to a scalar, so assert over a 2-class fixture (which this one is) and
     assert `topClasses[0]` contains `partial-extraction -> src/shared/payload` while
     `topClasses[1]` does not.
2. Run: `cd /Users/cwarner/Projects/iv/hd-dry-concept/packages/cli && npx vitest run tests/mcp/tools/entropy-duplication.test.ts`
3. **Mutation (deferred from Task 7):** drop the signal suffix from `summarizeDuplication` →
   the `topClasses[0]` case fails. Plant, observe, revert.
4. Revert telemetry churn, commit:
   `test(mcp): prove the partial-extraction signal on the detect_entropy surface`

### Task 11: Scope C acceptance evidence and the spec record `[checkpoint:human-verify]`

**Depends on:** Task 9, Task 10 | **Files:** `docs/changes/duplication-detection/proposal.md` |
**Owns:** `docs/changes/duplication-detection/**`

1. Re-measure at Scope C with the SHIPPED build (not the plan's measurement script):

```bash
cd /Users/cwarner/Projects/iv/hd-dry-concept
pnpm --filter @harness-engineering/core run build && pnpm --filter @harness-engineering/cli run build
node packages/cli/dist/bin/harness.js cleanup -t duplication --json > /tmp/scopec-phase4.json
node -e "
const d = require('/tmp/scopec-phase4.json').duplication;
const lab = d.classes.filter((c) => c.signal === 'partial-extraction');
const pos = (p) => d.classes.findIndex(p) + 1;
console.log({ scanned: d.filesScanned, classes: d.classesReported, members: d.classes.reduce((s,c)=>s+c.members.length,0), suppressed: d.classesSuppressed, truncated: d.classesTruncated, skipped: d.filesSkipped, labelled: lab.length });
console.log('parseFencedJson', JSON.stringify(d.classes.find((c) => c.members[0].unit === 'parseFencedJson')), 'position', pos((c) => c.members[0].unit === 'parseFencedJson'));
console.log('sumCosts position', pos((c) => c.members.some((m) => m.unit === 'sumCosts')));
console.log('jsonResponse position', pos((c) => c.members.some((m) => ['sendJSON','sendJson','jsonResponse'].includes(m.unit))));
console.log('mirror classes labelled', lab.filter((c) => c.members.every((m) => m.file.includes('agents/skills/'))).length);
"
```

**Expected from this plan's measurement, and each one is a CLAIM to confirm or contradict:**
2,144 / 96 / 382 / 162 / 0 / 0 unchanged; **10 labelled**; `parseFencedJson` labelled with
`sharedImport 'packages/cli/src/shared/craft/fenced-json'`, 6 members, 87 tokens, rank 522,
priority 1044, position **#9**; `sumCosts` **#11** (rank still 980); JSON-response **#15** (rank
still 704); **0 of 38** mirror classes labelled. If any figure differs, record YOURS and say so —
do not reconcile to this plan's number. 2. Re-measure criterion 6 (truth 10): three runs of `detectDuplication` alone at the same scope
Phase 2 used, reporting the median and naming the wall clock as load-sensitive (it varies several
fold with machine load, so it is evidence, not a gate). Compare against Phase 2's recorded
2.4-3.0 s and state the delta `collectFileImports` costs. 3. Amend `docs/changes/duplication-detection/proposal.md`:

- **Criterion 3** — restate to the shipped predicate: "When every member of a clone class
  references, inside its own unit body, a value binding imported from one common first-party
  module, the system shall label the class `partial-extraction` and populate `sharedImport` with
  that module's repo-relative extensionless key — verified against the `parseFencedJson` case (6
  members; all 10 craft packages import `shared/craft/fenced-json` and all 10 declare their own
  wrapper)." Add a sentence naming that the original file-level wording was refuted by
  measurement, with the 89 / 88 / 37 / 27 / 10 ladder and its denominator of 96.
- **Criterion 13** — "top `maxClasses` by `priority`", with the note that `priority === rank` for
  every plain duplicate so the pre-Phase-4 truncation semantics are unchanged for any project
  without a labelled class.
- **Criterion 1's evidence paragraph** — `sumCosts` rank 980 and the JSON-response class rank 704
  are UNCHANGED as ranks; their by-priority positions move #6 → #11 and #11 → #15. State both,
  and that criterion 1 is a reporting claim (all 96 remain in `--json`), not a printed-page claim.
- **§ `partial-extraction` derivation (D8)** — replace the two-sentence sketch with the four
  conditions, each with its measured justification, and the honest correction that the
  derivation is NOT "roughly ten lines over the import lists the snapshot already carries": the
  module parses files itself (D7), so the imports come from its own parse, and three further
  conditions are what separate a signal from a 92.7% label rate.
- **§ Technical Design type block** — add `priority: number;` to the `CloneClass` listing and fix
  the `rank` comment.
- **§ Verification notes** — a new "### Phase 4 — the measured derivation, the ranking decision,
  and what moved" section holding: the scope/denominator conventions; the five-candidate table;
  the ranking options table with positions; the shipped Scope C figures from step 1; the criterion-6
  re-measurement from step 2; and the four carried-forward judgments from this plan's
  "Carried-forward items — judged" section (grouping deferred with its reason; `filesSkipped`
  closed; `skipUnlessBin` not this phase's business; graph concepts deferred on #1507).
- **§ Deferred follow-ups** and the Phase-3 note that reads "Recorded as a Phase 4/5 follow-up" —
  convert to a NAMED deferred follow-up with the measured reason, so it is not deferred a third
  time to a phase that does not exist.

4. **[checkpoint:human-verify]** Show the operator: the step-1 figures beside this plan's predicted
   ones (naming any contradiction), the criterion-3 and criterion-13 rewordings verbatim, and the
   two moved positions. Wait for confirmation before committing — this is the commit that changes
   the feature's acceptance criteria.
5. Run: `cd /Users/cwarner/Projects/iv/hd-dry-concept && npx prettier --check docs/changes/duplication-detection/proposal.md`
6. Revert telemetry churn, commit:
   `docs(duplication): restate criteria 3 and 13 against the measured derivation`

### Task 12: project documentation and the changeset

**Depends on:** Task 10 | **Files:** `AGENTS.md`,
`agents/skills/claude-code/harness-refactoring/SKILL.md`,
`.changeset/duplication-partial-extraction-signal.md` (CREATE) |
**Owns:** `AGENTS.md`, `agents/skills/**`, `.changeset/**`

**Category:** integration

1. `AGENTS.md:561-569` — the paragraph says clone classes are "ranked `tokenCount x members`", which
   is now incomplete. Replace with: ranked by `priority` (`tokenCount x members`, doubled for a
   `partial-extraction` class — a class whose every member's body calls into one common first-party
   module, named in `sharedImport`). Keep the advisory/exit-code sentences untouched.
2. `agents/skills/claude-code/harness-refactoring/SKILL.md` — `:10` same ranking correction; `:68`
   extend "take the top-ranked class" with: a `partial-extraction` row is the cheapest fix on the
   page, because the shared module already exists and the repair is delete-and-import. This closes
   the loop the spec's Integration Points names (a DRY procedure with no detector upstream).
   **Note:** the four platform directories are symlinks to `claude-code`, so one edit updates all
   four; `lint-staged` runs prettier on `SKILL.md` and the Gemini `.toml` mirror regenerates in the
   pre-commit hook — stage whatever the hook rewrites rather than fighting it.
3. Create `.changeset/duplication-partial-extraction-signal.md` with
   `'@harness-engineering/core': minor` and `'@harness-engineering/cli': minor`, in the established
   prose style of `.changeset/duplication-cli-mcp-surface.md`. It must state: what the signal means;
   that the predicate is body-level, first-party and value-only, and WHY (the file-level reading
   labels 92.7% of this repository's classes, mirror copies included); that `rank` is unchanged and
   `CloneClass.priority` is new; that the `maxClasses` cap is now by `priority` and equals the old
   behaviour for any project without a labelled class; the two surfaces' new output; and the
   `filesSkipped` ride-along in MCP summary mode, named as a ride-along.
4. Run:
   ```bash
   cd /Users/cwarner/Projects/iv/hd-dry-concept
   pnpm run generate-docs        # expect ZERO diff: no CLI flag or help string changed
   git status --short            # confirm no docs/reference/* drift
   node packages/cli/dist/bin/harness.js ci check --skip "entropy,docs,perf,security,deps,phase-gate"
   npx prettier --check AGENTS.md ".changeset/duplication-partial-extraction-signal.md"
   ```
   If `generate-docs` DOES produce a diff, commit the regenerated file with this task (pre-push
   blocks on stale reference docs) and say so in the commit message.
5. Revert telemetry churn, commit:
   `docs(duplication): describe the partial-extraction signal in AGENTS.md and the refactoring skill`

### Task 13: gate sweep

**Depends on:** Task 11, Task 12 | **Files:** none (verification only) | **Owns:** none

Run every gate, compare to the recorded baselines, and report figures with their scope. Nothing here
may be reported as a pass without the command's own output.

```bash
cd /Users/cwarner/Projects/iv/hd-dry-concept
pnpm --filter @harness-engineering/core run build
pnpm --filter @harness-engineering/cli run build

# 1. full suites, from the package directories
( cd packages/core && npx vitest run )   # baseline 505 files + 1 skipped / 5,935 + 1 skipped
( cd packages/cli  && npx vitest run )   # baseline 750 files / 8,877 passed + 2 skipped
# Report the DELTA and tie every added test to a task. New files: 2 (core imports,
# core partial-extraction). No file count may drop.

# 2. typecheck + lint on touched SOURCE files only (tests fail eslint pre-existingly)
( cd packages/core && npx tsc --noEmit -p tsconfig.json )
( cd packages/cli  && npx tsc --noEmit -p tsconfig.json )
npx eslint --max-warnings 0 packages/core/src/duplication/imports.ts packages/core/src/duplication/index.ts \
  packages/core/src/entropy/types/duplication.ts packages/cli/src/commands/cleanup.ts \
  packages/cli/src/mcp/tools/entropy.ts packages/cli/src/config/schema.ts

# 3. arch: SORTED issue-list diff, never the exit code, never $? through a pipe
HARNESS_ARCH_BASE_REF=c83ec3620 node packages/cli/dist/bin/harness.js check-arch 2>&1 \
  | grep -E '^\s+\* |Threshold exceeded' | sort > /tmp/arch-after.txt
diff /tmp/arch-before.txt /tmp/arch-after.txt   # empty; 12 findings, none in a Phase-4 file

# 4. the real pre-commit gate (exit 0 at HEAD, arch warn with exactly 3 pre-existing NEW lines)
node packages/cli/dist/bin/harness.js ci check --skip "entropy,docs,perf,security,deps,phase-gate"

# 5. barrel, deps, formatting, changesets, generated docs
node scripts/generate-core-barrel.mjs --check
node packages/cli/dist/bin/harness.js check-deps      # baseline exit 0, 2,664 modules / 10 layers
npx prettier --check .
npx changeset status 2>&1 | tail -5
pnpm run generate-docs && git status --short

# 6. validate: BASELINE COMPARISON ONLY — 462 issues, exit 1. Never "validate passed".
node packages/cli/dist/bin/harness.js validate 2>&1 | tail -3

# 7. telemetry churn
git checkout -- .harness/security/timeline.json packages/cli/.harness/security/timeline.json
git status --short    # must show no unintended file
```

Coverage: grade `cli` and `core` by hand (the ratchet cannot give a non-vacuous verdict here, #2307).
New source lines are `imports.ts` plus small edits, all covered by the suites added in Tasks 1-10;
state the covered/uncovered lines rather than quoting a ratchet sentence.

If any gate regresses: **refactor**. No `--update-baseline`, no allowance extension, no
`--no-verify`. Report the final figures, the delta against every baseline above, and any
contradiction with this plan's predicted numbers.

---

## Dependency graph

```
T1 ─ T2 ─ T3 ─ T4 ─┬─ T5 ─────────────────────┐
                   ├─ T6 ──┐                  │
                   ├─ T7 ──┼─ T10 ─┐          │
                   └─ T8 ──┴─ T9 ──┴─ T11 ────┼─ T13
                              └──── T12 ──────┘
```

`dependsOn` verbatim: T1 none · T2 [T1] · T3 [T2] · T4 [T3] · T5 [T4] · T6 [T4] · T7 [T4] · T8 [T4] ·
T9 [T6, T8] · T10 [T7, T8] · T11 [T9, T10] · T12 [T10] · T13 [T11, T12].

T1-T4 are strictly serial: each edits `packages/core/src/duplication/index.ts` (T2-T4) and each
depends on the previous one's type. T5-T8 are genuinely independent (core types / cleanup.ts /
mcp/entropy.ts / fixture dir — no shared file). T11 and T12 touch disjoint files and can run
together.

---

## Open questions and uncertainties

- **[RESOLVED by measurement]** Whether the spec's file-level D8 predicate is usable. It is not:
  89/96 under the literal reading. Restated in Task 11.
- **[DECISION, checkpointed]** Boost 2 vs 1.5. Measured table in Task 4; 2 recommended; the operator
  can choose at the checkpoint.
- **[ASSUMPTION]** Scope A's recorded figures (58 classes / 230 members, digest `7e0f1622fb75abbc`)
  are taken from the Phase-2 gate-fix handoff without re-running that scope. Phase 4 changes no
  discovery or grouping logic, so set identity is unaffected — but the figure is inherited, not
  re-verified here, and nothing in this plan depends on it.
- **[ASSUMPTION]** `collectFileImports`'s extra token pass keeps criterion 6 inside its 10 s bar.
  Task 11 measures it. If it does not, the mitigation is to build `positions` lazily (only when the
  file has first-party value imports — most files do, so the honest fallback is a binary search over
  `positions` rather than a linear scan, which Task 1's structure already permits).
- **[DEFERRABLE]** Exact printed-suffix wording (`[partial-extraction -> key]`). Pinned by tests in
  Tasks 6/9/10; changing it later is a one-line edit plus those assertions.
- **[DEFERRABLE]** `sharedImport` publishes an extensionless key
  (`packages/cli/src/shared/craft/fenced-json`), not a file path. Deliberate: the key is a module
  identity derived without touching the filesystem, so claiming a file exists would be a claim the
  derivation never checked.

---

## Success criteria for this plan's execution

- Every task's named mutation was planted, observed red, and reverted — recorded per task. Five
  vacuous tests have already shipped in this feature; "the test passes" is not evidence.
- Scope C re-measured with the shipped build, every figure published with scope and denominator, and
  any contradiction with this plan's numbers recorded as the executor's figure.
- `sumCosts` rank 980 and the JSON-response rank 704 still present and unchanged as ranks; their
  moved positions recorded in the spec rather than discovered later.
- The Phase-1/2/3 fixture `duplication-cli-project` is byte-identical and its class still reports
  `signal: 'duplicate'`, `priority === rank === 249`.
- `harness validate` compared to baseline (462 / exit 1) and never reported as passing;
  `check-arch`'s sorted issue list byte-identical; the pre-commit gate exits 0 with no new warn line.
- No hook bypassed, no baseline updated, no allowance extended, no telemetry churn committed.

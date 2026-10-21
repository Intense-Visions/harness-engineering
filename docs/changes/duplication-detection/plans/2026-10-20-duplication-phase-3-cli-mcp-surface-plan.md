# Plan: Mechanical Duplication Detection — Phase 3 (CLI and MCP surface)

**Date:** 2026-10-20
**Spec:** `docs/changes/duplication-detection/proposal.md` (section "### Phase 3: CLI and MCP surface" + its four forward notes)
**Session:** `changes--duplication-detection--proposal`
**Worktree:** `/Users/cwarner/Projects/iv/hd-dry-concept` (branch `brainstorm/dry-refactoring-concept`, HEAD `91df7e311`)
**Rigor:** standard
**Tasks:** 18
**Time:** ~75 min of task work + two audit rounds (~25 min) + one checkpoint
**Checkpoints:** 1 (`[checkpoint:human-verify]`, Task 13 — spec criterion 2)
**Integration Tier:** medium

---

## Goal

`harness cleanup -t duplication` and `detect_entropy type: "duplication"` make Phase 2's detector
reachable by a user — advisory only, with a validated config surface, a serializable payload, and a
recorded top-20 precision audit that decides whether the shipped exclusions are tight enough.

---

## Scope Boundary

| Excluded                                                               | Owner                                     |
| ---------------------------------------------------------------------- | ----------------------------------------- |
| `partial-extraction` derivation, `sharedImport`, its rank boost        | Phase 4                                   |
| `code-craft` `siblings?`, the extractor-agreement test (criteria 4, 5) | Phase 5                                   |
| Baseline ratchet for duplication                                       | Deferred follow-up (D4)                   |
| Sub-unit / CPD tier                                                    | Deferred follow-up                        |
| Knowledge-graph concept nodes (`partial-extraction`, `CloneClass`)     | Deferred — see Decision P12               |
| `EntropyConfig.exclude: [null]` throwing in `buildSnapshot`            | Out of scope (named in Phase 2's handoff) |
| `snapshot.exportMap.byFile` serializing to `{}`                        | Out of scope — pre-existing; see P8       |

---

## What Phase 3 binds to — read at HEAD `91df7e311`, not recalled

| Surface                             | Fact (verbatim / measured)                                                                                                                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `EntropyConfig.analyze.duplication` | `boolean \| Partial<DuplicationConfig>` (`entropy/types/config.ts:70`)                                                                                                                           |
| `EntropyReport.duplication`         | `DuplicationReport \| undefined` (`entropy/types/report.ts:32`)                                                                                                                                  |
| `EntropyReport.analysisErrors`      | `AnalysisError[]`; `AnalysisError['analyzer']` includes `'duplication'` (`report.ts:12-21`)                                                                                                      |
| `DuplicationReport`                 | `{ classes, byMember: Map, collisions, skipErrors: EntropyError[], stats }` (`entropy/types/duplication.ts:15-65`)                                                                               |
| `DuplicationReport.stats`           | `CloneIndex['stats']` (11 counters) **+** `violationCount` **+** `infoCount`. No `errorCount` / `warningCount` — layer 1 of D4                                                                   |
| `DuplicationConfig`                 | exactly 4 fields: `minTokens` 40, `minInstances` 3, `ignorePatterns` (21 globs), `maxClasses` 100 (`duplication/index.ts:207-229`, `:301-337`)                                                   |
| `resolveDuplicationConfig`          | **MERGE by key** — supplying `ignorePatterns` REPLACES the 21 defaults, it does not append (`duplication/index.ts:383-392`)                                                                      |
| `buildCloneIndex` validation        | only `ignorePatterns` is validated (`findInvalidIgnorePattern`, `Err INVALID_CONFIG` / `reason: 'invalid-ignore-pattern'`). `minTokens`/`minInstances`/`maxClasses` are **unvalidated anywhere** |
| `maxClasses: 0` behavior            | `classes = qualifying.slice(0, 0)` → **0 classes reported, every one counted in `classesTruncated`** (`index.ts:990-991`). A pass over findings that were found                                  |
| `minInstances <= 1` behavior        | `units.length < 2 → continue` still holds, so 0/1/negative silently means "report every pair" (`index.ts:963`)                                                                                   |
| analyzer snapshot-bypass            | both graph keys supplied ⇒ `analysisErrors.push({analyzer:'duplication', ... reason:'snapshot-bypassed'})`, report left `undefined` (`analyzer.ts:194-223`)                                      |
| `summary.totalIssues`               | **includes** `classesReported`; `summary.errors` / `.warnings` do **not** (`analyzer.ts:273-282`)                                                                                                |
| `cleanup.ts` exit gate              | `process.exit(result.value.totalIssues === 0 ? SUCCESS : VALIDATION_FAILED)` (`cleanup.ts:230`); `totalIssues` computed at `:149-150`                                                            |
| `cleanup.ts --findings-json`        | `formatFindingsContract(result.value.totalIssues, 'cleanup')` (`cleanup.ts:226`) — **a second gating channel on the same field**                                                                 |
| `detect_entropy` detailed response  | `resultToMcpResponse(result)` → `JSON.stringify(result.value, bigIntSafeReplacer)` (`mcp/utils/result-adapter.ts:14-27`) — a `Map` renders as `{}`                                               |
| `detect_entropy` summary response   | `buildSummaryResponse` has branches for drift / deadCode / patterns only; `totalIssues` = sum of those categories (`mcp/tools/entropy.ts:134-150`)                                               |
| `loadEntropyGraphOptions`           | returns BOTH `graphDriftData` and `graphDeadCodeData` whenever a graph exists (`entropy.ts:23-51`) — the live snapshot-bypass path                                                               |
| `logger.warn`                       | exists (`output/logger.ts:23`)                                                                                                                                                                   |
| `EntropyError`                      | `{ code, message, details: {file?, reason?, issues?, originalError?: Error}, suggestions: string[] }` (`shared/errors.ts:10-19`, `:60-80`)                                                       |

### The two non-obvious facts that change the plan

1. **`entropy.duplication` is STRIPPED by the CLI config schema today.** `EntropyConfigSchema`
   (`packages/cli/src/config/schema.ts:100-116`) is a bare `z.object` — zod strips unknown keys —
   and it has no `duplication` member. **Measured at HEAD** (`npx tsx`, real schema):

   ```
   collectStrippedKeys(HarnessConfigSchema, {version:1, entropy:{duplication:{minTokens:50, maxClasses:0}}})
     → [{"path":"entropy.duplication"}]
   HarnessConfigSchema.safeParse(...).data.entropy keys → [ 'excludePatterns', 'autoFix' ]
   ```

   So `loadConfig` already prints `⚠ harness.config.json: ignored unknown key 'entropy.duplication'`
   and the value never reaches the analyzer. Without Task 2 the config surface does not exist, the
   validation forward note 3 asks for has nowhere to live, and Task 12's tightening is impossible.
   Phase 2's Decision P6 assigned this file to Phase 3 explicitly.

2. **This repository's own `harness.config.json` already excludes the vitepress cache.**
   `entropy.excludePatterns` contains `**/.vitepress/cache/**`, and `cleanup.ts:107` threads
   `excludePatterns` into `EntropyConfig.exclude`. The product scope therefore differs from Phase 2's
   recorded Scope B, and forward note 2's two false-positive classes **do not appear through the
   CLI at all**. See "Scope C" below. The defaults question survives for adopters; the audit question
   does not.

---

## Measurements taken at plan time — scope AND denominator on every figure

Everything below was executed at HEAD `91df7e311` in `/Users/cwarner/Projects/iv/hd-dry-concept`.
Nothing here is carried over from Phase 1 or Phase 2.

### Scope C — the product scope (NEW; what `harness cleanup -t duplication` will see)

Config: `rootDir` = repo root (schema default `.`), `entryPoints` = this repo's 62 configured entry
points, `exclude` = this repo's 12 configured `entropy.excludePatterns`, `analyze.duplication = true`,
`DEFAULT_DUPLICATION_CONFIG` otherwise. Driver: `EntropyAnalyzer` from `packages/core/dist/index.js`,
mimicking `cleanup.ts`'s `entropyConfig` construction line for line.

| Counter                    | Scope C (product, defaults) | Scope B (Phase 2, detector's own scope) | Scope A (spec Evidence, `packages/` only) |
| -------------------------- | --------------------------- | --------------------------------------- | ----------------------------------------- |
| `filesScanned`             | **2,143**                   | 2,153                                   | 2,065                                     |
| `filesIgnored`             | **73**                      | —                                       | —                                         |
| `unitsFingerprinted`       | **8,444**                   | 9,710                                   | 8,170                                     |
| `classesReported`          | **96**                      | 98                                      | 58                                        |
| members (`byMember.size`)  | **382**                     | 388                                     | 230                                       |
| `classesSuppressed`        | **162**                     | 174                                     | 161                                       |
| `filesSkipped`             | **0**                       | 0                                       | 0                                         |
| `collisionsObserved`       | **0**                       | 0                                       | 0                                         |
| `classesTruncated`         | **0**                       | 0                                       | 0                                         |
| vitepress-composed classes | **0**                       | 2                                       | 0                                         |

`summary.totalIssues` = 96, `summary.errors` = 0, `summary.warnings` = 0 — Phase 2's D4 layer holds
at the product scope, first-hand.

96 vs 98 vs 58 are **three scopes, not a regression**. Scope C = Scope B minus this repo's
`excludePatterns` (chiefly `**/.vitepress/cache/**`, which also explains the 1,266-unit drop).

### Criterion 1's two named classes are present at Scope C

```
sumCosts        → 10 members, 98 tokens, rank 980  (#6 by rank)
JSON-response   → 16 members, 44 tokens, rank 704  (#11 by rank)
                  names: sendJSON, sendJson, jsonResponse
```

### The finding that decides criterion 2: platform-mirror classes

**38 of the 96 classes (39.6%), and 10 of the top 20 by rank**, are composed exclusively of files
under `agents/skills/`: `agents/skills/{claude-code,codex,cursor,gemini-cli}/harness-branch-buster/scripts/*.mjs`
— the same script present once per agent platform.

Verified, not assumed:

- The four copies are **byte-identical**: `md5 -q` over the four `run-gates.mjs` paths yields
  `aa091f0eb1e00147120d0fe0b9aa2f7f` four times.
- They are **separate real files**, not symlinks: four distinct inodes (196267289 / 196269687 /
  196272077 / 196274326), `readlink` reports "not a symlink" for each.
- The mirror convention is **partly** symlinked and mostly copied: of 793 entries under
  `agents/skills/codex/`, **101 are symlinks and 692 are real directories**
  (`harness-refactoring` IS a symlink; `harness-branch-buster` is not).

Measured exclusion arms (same driver, same scope, only `duplication.ignorePatterns` varied):

| Arm                                                               | classes | members | scanned | ignored | fingerprinted | suppressed | agents/skills-only classes (of top 20) |
| ----------------------------------------------------------------- | ------- | ------- | ------- | ------- | ------------- | ---------- | -------------------------------------- |
| A — `DEFAULT_DUPLICATION_CONFIG`                                  | 96      | 382     | 2,143   | 73      | 8,444         | 162        | 38 (10)                                |
| B — defaults **+** `codex/`, `cursor/`, `gemini-cli/` mirror dirs | **58**  | **230** | 2,128   | 88      | 8,330         | 162        | 0 (0)                                  |
| C — defaults **+** `**/agents/skills/**`                          | 58      | 230     | 2,123   | 93      | 8,292         | 162        | 0 (0)                                  |

Arm B and arm C agree exactly, and both land on **58 classes / 230 members — the same pair as
Scope A** (`packages/` only). Task 12 records whether the two class SETS are identical or merely
equinumerous; it must not assert identity without the digest.

### Wall clock — the product command is NOT criterion 6's 2-3 s

`analyzer.analyze()` at Scope C with only duplication enabled: **23.8 s / 23.9 s / 24.1 s**, and
**58.7 s** on the first (cold) run. Criterion 6's bar is `detectDuplication` alone (Phase 2
measured 2.4-3.0 s at Scope B). The difference is `buildSnapshot`, which `harness cleanup` builds
before any detector runs. **Nothing in this plan may quote 2-3 s as the command's runtime.**

### Suite and gate baselines (captured at HEAD, before any Phase 3 edit)

| Baseline                                      | Value                                                                                                       |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `packages/cli` suite                          | **745 files / 8,804 passed + 2 skipped (8,806), exit 0, 107 s** (`npx vitest run`)                          |
| `packages/core` duplication                   | 176 (Phase 2 handoff)                                                                                       |
| `packages/core` entropy                       | 290 / 29 files (Phase 2 handoff)                                                                            |
| `packages/core` full                          | 505 files + 1 skipped / 5,935 + 1 skipped (Phase 2 handoff)                                                 |
| `harness check-deps`                          | exit 0 — 2,663 modules / 10 layers                                                                          |
| `harness check-arch`                          | exit **1** on 12 pre-existing findings; gate on the ISSUE-LIST DIFF under `HARNESS_ARCH_BASE_REF=c83ec3620` |
| `harness validate`                            | exit **1** / 462 issues — baseline comparison only, never a gate                                            |
| `git ls-files docs/.vitepress/cache \| wc -l` | **9** (tracked; `git check-ignore` exits 1)                                                                 |
| coverage baselines                            | `packages/cli` lines 90.89 / branches 81.12 / functions 92.43 / statements 89.55                            |

---

## Observable Truths (acceptance criteria)

EARS-phrased; each traces to tasks.

1. **When** an operator runs `harness cleanup -t duplication` on this repository, the system shall
   report clone classes of ≥3 members and ≥40 tokens including `sumCosts` (10 members) and the
   orchestrator JSON-response class (16 members, names `sendJSON` / `sendJson` / `jsonResponse`).
   _(spec criterion 1 — Tasks 4, 5, 14)_
2. **While** duplication findings exist, `harness cleanup -t duplication` shall exit `0` and
   `--findings-json` shall report `{ findings: 0 }` for a run whose only findings are clone classes.
   _(D4 / forward note 1 — Tasks 5, 7)_
3. **If** `harness.config.json` carries `entropy.duplication.minTokens: "40"`, `maxClasses: 0`,
   `minInstances: 1`, or a non-string `ignorePatterns` entry, **then** config load shall fail with a
   path-qualified message and the detector shall not run on the bad value.
   _(forward note 3 — Task 2)_
4. **When** `entropy.duplication` is present in `harness.config.json`, the loader shall no longer
   report it as an ignored unknown key, and its values shall reach `EntropyConfig.analyze.duplication`.
   _(forward note 3 / WIRED — Tasks 2, 4, 8)_
5. **Where** `entropy.duplication` is absent, `harness cleanup -t all` and `detect_entropy type:"all"`
   shall not run the duplication detector; **where** it is `false`, an explicit `-t duplication` /
   `type:"duplication"` shall refuse with an explicit message rather than report a clean scan.
   _(#1760 lesson — Tasks 3, 4, 8)_
6. **If** the duplication detector did not run while it was requested, **then** the CLI shall say so
   naming the analyzer's own reason (e.g. `snapshot-bypassed`), and shall not render it as
   "no duplication found". _(forward note 3 — Tasks 3, 5, 8)_
7. The `detect_entropy` response shall not contain a `byMember` key, and every key it does contain
   shall survive `JSON.parse(JSON.stringify(...))` with its information intact.
   _(forward note 4 — Task 9)_
8. `detect_entropy`'s summary mode shall report duplication under a key that is **not** summed into
   `totalIssues`. _(D4 parity — Task 9)_
9. `pnpm run generate-docs` shall leave `docs/reference/cli-commands.md` showing
   `drift, dead-code, patterns, duplication, all` and `docs/reference/mcp-tools.md` showing
   `duplication` in the `detect_entropy` type enum; `pnpm run generate-docs --check` shall then exit 0.
   _(criterion 8's `generate-docs` half — Task 10)_
10. A manual audit of the top 20 classes by rank shall be performed against the spec's fixed
    rejection criteria and recorded in the spec's "## Verification notes", with
    `git ls-files docs/.vitepress/cache | wc -l` beside the verdict; **if** precision is below 90%,
    exclusions shall be tightened and the top 20 re-audited at the tightened scope.
    _(spec criterion 2 — Tasks 11, 12, 13, 15)_
11. `harness check-deps` shall still exit 0, and `harness check-arch`'s issue list under
    `HARNESS_ARCH_BASE_REF=c83ec3620` shall be byte-identical to the captured baseline (12 issues)
    or its delta shall be recorded and justified. _(gating truths — Tasks 3, 18)_
12. No existing entropy detector's output, and no other `EntropyAnalyzer` call site, shall begin
    running duplication. _(criterion 9 — Task 18)_

---

## Uncertainties

- **[ASSUMPTION]** Arm B's 58 classes are the same SET as Scope A's 58. Equinumerous is measured;
  identity is not. Task 12 computes the digest; if they differ, that is a datum, not a defect.
- **[ASSUMPTION]** Top-20 precision at the tightened scope reaches ≥90%. From the plan-time dump the
  remaining candidates look genuine, but at least three (`critiqueSurface/critiqueCommand/critiqueDoc`,
  `detectTsIgnore/detectUnsafeAsUnknown/detectVagueNames`, `printAnatomyFindings/printDriftFindings/printBrandFindings`)
  are same-file sibling functions that may fall under rejection clause 1 ("one distinct parameter per
  member"). If precision still misses 90%, Task 13's checkpoint decides: tighten further, or record
  the detector as staying experimental. **The plan does not presuppose a passing verdict.**
- **[ASSUMPTION]** `agents/skills/` platform mirrors count as FALSE POSITIVES under rejection
  clause 2 ("structurally forced … could not differ"): each platform directory must be a
  self-contained copy, so the members cannot differ and no extraction exists. Task 11 states this
  reading explicitly so the human can overrule it at Task 13.
- **[DEFERRABLE]** Whether `DEFAULT_DUPLICATION_CONFIG.ignorePatterns` should gain a vendored-cache
  glob for adopters (forward note 2). Task 12 measures both arms and records a decision; the audit
  itself is unaffected because the product scope already excludes it here.
- **[DEFERRABLE]** Exact wording of the advisory output lines.
- **[RESOLVED at plan time]** Whether any other surface gates on duplication. Grepped: nothing reads
  `report.summary.totalIssues`; every other `EntropyAnalyzer` call site
  (`ci/check-orchestrator.ts:278,359`, `insights/aggregator.ts:56`, `commands/check-perf.ts:88`,
  `commands/perf.ts:155`, `mcp/tools/performance.ts:41`) builds an explicit `analyze` block with no
  `duplication` key. `cleanup.ts`'s `totalIssues` and `--findings-json` are the only two channels.

---

## Decisions this plan records (made consciously, not inherited)

| #   | Decision                                                                                                                                                           | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | **Clone classes never enter `CleanupResult.totalIssues`.** They land on a separate optional `duplication` block.                                                   | Forward note 1. `:230` gates `process.exit` on `totalIssues` and `:226` publishes it as the `--findings-json` contract. Keeping duplication out of that field is the only way `-t duplication` can honor D4 ("advisory first; never fail-closed") — the #855 fail-closed arch gate is the standing precedent. Recorded here, tested in Task 7, and resolved into ADR 0134 in Task 15.                                                                             |
| P2  | **`--findings-json` is the second channel and is excluded too.**                                                                                                   | A consumer gating on `findings > 0` would fail a build on advisory duplication — the exit-code hazard by another route. Forward note 1 named only `:230`; this plan names both.                                                                                                                                                                                                                                                                                   |
| P3  | **`-t duplication` always runs; `-t all` runs duplication only when `entropy.duplication` is configured.**                                                         | Exactly the `patterns` precedent (`cleanup.ts:88`, `:103`): `all` runs a detector only when the project gave it something to do. Duplication differs in having working defaults, so an explicit request needs no config — but `-t all` must not silently add a ~3 s clone scan (on top of a snapshot-dominated ~24 s run) to every unconfigured project's cleanup.                                                                                                |
| P4  | **`entropy.duplication: false` + an explicit `-t duplication` ⇒ REFUSE, not a clean report.**                                                                      | #1760's lesson verbatim: a check that did not run must not print a pass. Returning `Err` on a disabled detector is not a D4 violation — D4 forbids failing on FINDINGS.                                                                                                                                                                                                                                                                                           |
| P5  | **`CleanupResult` gains `ran: {drift, deadCode, patterns, duplication}`, and the "Entropy issues" summary line is suppressed when no gating analyzer ran.**        | `-t duplication` runs no drift / dead-code / pattern analyzer, so `totalIssues` is 0 **by omission**. Printing the green-ticked `Entropy issues: 0` there would green-tick three checks that never happened — #1760 one layer out. `ran` is derived from report presence, so it cannot drift from what executed.                                                                                                                                                  |
| P6  | **Validation lives in the CLI zod schema (`z.number().int().positive()` etc.), not in a new core validator.**                                                      | Forward note 3 asks Phase 3 to validate what it threads from untyped JSON. The schema IS that boundary, it is the house precedent (`z.number().int().positive()` appears 20+ times in `config/schema.ts`), and it serves both surfaces at once because `cleanup.ts` and `mcp/tools/entropy.ts` both load config through `loadConfig`. Rejecting a malformed config value is not failing on a finding.                                                             |
| P7  | **`minInstances` floor is 2, not 1.** `maxClasses` and `minTokens` floors are 1.                                                                                   | `buildCloneIndex` hard-skips groups below 2 members (`index.ts:963`), so 1 / 0 / negative are values that silently do nothing. `maxClasses: 0` is the sharp one: it reports zero classes while counting all of them in `classesTruncated`.                                                                                                                                                                                                                        |
| P8  | **`byMember` is OMITTED from the MCP payload, not converted to entries.**                                                                                          | Forward note 4's own first option. It is an in-process O(1) seam for Phase 5; `classes[].members` already carries every member it indexes, so entries would be a 230-entry duplicate of data already in the payload. The key's ABSENCE is honest; `{}` is not. `skipErrors[].details.originalError` (an `Error`, also `{}` under `JSON.stringify`) is dropped by the same projection. `snapshot.exportMap.byFile` stays as-is: pre-existing, out of scope, named. |
| P9  | **MCP summary mode reports duplication under `advisory.duplication`, outside `totalIssues`.**                                                                      | Parity with P1. `totalIssues` is the one number an agent reads as "is this clean"; D4 must hold on both surfaces or it holds on neither.                                                                                                                                                                                                                                                                                                                          |
| P10 | **The mirror exclusion goes in THIS repo's `harness.config.json` under `entropy.duplication.ignorePatterns`, not in `DEFAULT_DUPLICATION_CONFIG`.**                | `agents/skills/codex/**` is this repository's layout. Criterion 15 and the standing portability rule forbid baking it into the product. Routing it through the new config surface is also the strongest available WIRED proof: the tightening only works if Task 2's schema entry really threads. Scoping it to `entropy.duplication` (not `entropy.excludePatterns`) keeps drift / dead-code / `harness ci check` untouched.                                     |
| P11 | **Core's replace-semantics for `ignorePatterns` is kept; the repo's config restates the defaults it wants.**                                                       | `resolveDuplicationConfig` merges by key, so a project pattern replaces all 21 defaults. Inventing an additive CLI-only field would add a fifth config field the spec does not have and would diverge the two surfaces' semantics. Instead: document it in the schema JSDoc, and assert the replace behavior in a test so nobody "fixes" it silently.                                                                                                             |
| P12 | **Knowledge-graph concept nodes are deferred, with a note.**                                                                                                       | The spec's Knowledge Impact section names two concepts but no phase claims them, and `manage_adr`/graph enrichment is not worktree-aware (#1507). Recorded as a follow-up in Task 15 rather than half-done here.                                                                                                                                                                                                                                                  |
| P13 | **No new command, no barrel work.** `scripts/generate-barrel-exports.mjs` only scans `src/commands` for `createXCommand`; `generate-core-barrel.mjs` is untouched. | Verified by reading both generators. Phase 1 already owns the core barrel entry.                                                                                                                                                                                                                                                                                                                                                                                  |
| P14 | **`resolveDuplicationRequest` / `describeDuplicationNotRun` live in ONE shared module consumed by both surfaces.**                                                 | The two surfaces need identical resolution and identical "did not run" wording. Duplicating ~25 lines across `cleanup.ts` and `mcp/tools/entropy.ts` in the DRY-floor feature would be self-refuting (and, at 2 members, would sit below `minInstances` where the detector could never report it).                                                                                                                                                                |

---

## File Map

Complete. Nothing outside this list is created or modified.

```
CREATE packages/cli/src/shared/duplication-request.ts
MODIFY packages/cli/src/config/schema.ts                      (DuplicationConfigSchema + EntropyConfigSchema.duplication)
MODIFY packages/cli/src/commands/cleanup.ts                   (CleanupType, help, description, threading, result block, exit-code comment, print)
MODIFY packages/cli/src/mcp/tools/entropy.ts                  (type enum, descriptions, threading, JSON projection, summary advisory)

CREATE packages/cli/tests/shared/duplication-request.test.ts
CREATE packages/cli/tests/config/duplication-schema.test.ts
CREATE packages/cli/tests/commands/cleanup-duplication.test.ts
CREATE packages/cli/tests/integration/cleanup-duplication-exit-code.e2e.test.ts
CREATE packages/cli/tests/mcp/tools/entropy-duplication.test.ts
CREATE packages/cli/tests/fixtures/duplication-cli-project/harness.config.json
CREATE packages/cli/tests/fixtures/duplication-cli-project/README.md
CREATE packages/cli/tests/fixtures/duplication-cli-project/src/index.ts
CREATE packages/cli/tests/fixtures/duplication-cli-project/src/alpha.ts
CREATE packages/cli/tests/fixtures/duplication-cli-project/src/beta.ts
CREATE packages/cli/tests/fixtures/duplication-cli-project/src/gamma.ts
CREATE packages/cli/tests/fixtures/duplication-cli-project/src/solo.ts

MODIFY docs/reference/cli-commands.md                         (GENERATED — pnpm run generate-docs)
MODIFY docs/reference/mcp-tools.md                            (GENERATED — pnpm run generate-docs)
MODIFY harness.config.json                                    (entropy.duplication block — Task 12)
MODIFY docs/changes/duplication-detection/proposal.md         (Verification notes: audit verdicts + Scope C + forward-note answers)
MODIFY docs/knowledge/decisions/0134-whole-unit-type-2-clone-detection-at-rule-of-three.md  (exit-code consequence RESOLVED)
MODIFY AGENTS.md                                              (entropy section: the user-facing surface)
MODIFY agents/skills/claude-code/harness-refactoring/SKILL.md (DRY use case points at the detector)
CREATE .changeset/duplication-cli-mcp-surface.md
```

---

## Skeleton (standard rigor, 18 tasks ≥ 8 ⇒ skeleton produced)

1. Baselines and gate captures (1 task, ~4 min)
2. Config surface + request resolution (2 tasks, ~10 min)
3. CLI cleanup wiring and advisory result (2 tasks, ~12 min)
4. Fixture project + product-level CLI exit-code proof (2 tasks, ~10 min)
5. MCP wiring + serialization (2 tasks, ~12 min)
6. Generated reference docs (1 task, ~4 min)
7. Precision audit rounds 1 and 2 + tightening (2 tasks, ~25 min)
8. Human-verify checkpoint (1 task)
9. Criterion 1 evidence + records (ADR, spec, AGENTS, SKILL, changeset) (4 tasks, ~16 min)
10. Final gate sweep (1 task, ~10 min)

_Skeleton approved: implicitly, by the caller's phase brief enumerating these deliverables. Revisit at Task 13 if the audit's verdict changes the shape._

---

## Tasks

Every task's final step is a real verification command. `harness validate` is **never** a gate here
(exit 1 / 462 pre-existing issues); where it appears it is a baseline comparison only.

Commit messages are exact. Build before any commit touching `packages/cli`:
`npx turbo build --filter=@harness-engineering/cli...` (the pre-commit arch hook reads `dist`; a
missing dist yields a "No checks ran" failure). **Never bypass a hook** — not `--no-verify`, not
`core.hooksPath`, not `HUSKY=0`. If a hook blocks, stop and report.

---

### Task 1: Capture the gate baselines this phase will be judged against

**Depends on:** none | **Files:** none (writes only to `/tmp`) | **Owns:** — | **Category:** verification

1. Create the capture dir: `mkdir -p /tmp/dup-phase3`.
2. Arch issue list, PINNED (never read `$?` through a pipe):

   ```bash
   cd /Users/cwarner/Projects/iv/hd-dry-concept
   HARNESS_ARCH_BASE_REF=c83ec3620 node packages/cli/dist/bin/harness.js check-arch > /tmp/dup-phase3/arch-before.txt 2>&1
   echo "arch exit=$?"   # EXPECT 1 on 12 pre-existing findings — not a gate
   grep -c . /tmp/dup-phase3/arch-before.txt
   ```

3. `node packages/cli/dist/bin/harness.js check-deps > /tmp/dup-phase3/deps-before.txt 2>&1; echo "deps exit=$?"`
   — EXPECT exit 0, 2,663 modules / 10 layers. This one IS a gate.
4. `pnpm run generate-docs --check > /tmp/dup-phase3/docs-check-before.txt 2>&1; echo "docs exit=$?"` — EXPECT 0.
5. `git ls-files docs/.vitepress/cache | wc -l` — EXPECT 9. Record it; the audit must cite it.
6. `git status --short` — EXPECT clean (the capture files are outside the repo).
7. Record every value in the session handoff's `baselines` block. The `packages/cli` suite baseline
   is **745 files / 8,804 passed + 2 skipped, exit 0** (measured at plan time); do not re-run it
   here — Task 18 re-runs it once, at the end.

No commit (nothing changed).

---

### Task 2: Make `entropy.duplication` a real, validated config key

**Depends on:** Task 1 | **Files:** `packages/cli/src/config/schema.ts`, `packages/cli/tests/config/duplication-schema.test.ts` | **Owns:** `packages/cli/src/config/**`

1. Create `packages/cli/tests/config/duplication-schema.test.ts`:

   ```ts
   // packages/cli/tests/config/duplication-schema.test.ts
   import { describe, it, expect } from 'vitest';
   import { HarnessConfigSchema } from '../../src/config/schema';
   import { collectStrippedKeys } from '../../src/config/stripped-keys';

   const withDuplication = (duplication: unknown) => ({
     version: 1,
     entropy: { duplication },
   });

   describe('entropy.duplication config surface', () => {
     // THE WIRING TEST. Measured at 91df7e311 (before this change):
     // collectStrippedKeys(...) === [{ path: 'entropy.duplication' }] and the
     // parsed entropy block held only ['excludePatterns','autoFix'] — the key
     // was silently dropped and `harness cleanup -t duplication` could never
     // see an operator's tuning. MUTATION: delete the `duplication:` member
     // from EntropyConfigSchema and this test fails on the stripped-key list.
     it('is no longer reported as an ignored unknown key', () => {
       expect(collectStrippedKeys(HarnessConfigSchema, withDuplication({ minTokens: 50 }))).toEqual(
         []
       );
     });

     it('survives parsing with its values intact', () => {
       const parsed = HarnessConfigSchema.safeParse(
         withDuplication({
           minTokens: 50,
           minInstances: 4,
           maxClasses: 25,
           ignorePatterns: ['**/x/**'],
         })
       );
       expect(parsed.success).toBe(true);
       expect(parsed.success && parsed.data.entropy?.duplication).toEqual({
         minTokens: 50,
         minInstances: 4,
         maxClasses: 25,
         ignorePatterns: ['**/x/**'],
       });
     });

     it.each([true, false])('accepts the bare boolean form (%s)', (value) => {
       const parsed = HarnessConfigSchema.safeParse(withDuplication(value));
       expect(parsed.success).toBe(true);
       expect(parsed.success && parsed.data.entropy?.duplication).toBe(value);
     });

     // Each row is a value a hand-edited harness.config.json really produces,
     // and each one changes the detector's behavior silently without these
     // bounds. maxClasses: 0 is the sharp one — buildCloneIndex slices the
     // ranked classes to the cap, so zero reports NO classes while counting
     // every one of them in classesTruncated: a pass over findings that were
     // found. MUTATION: drop `.int()`, `.positive()` or `.min(2)` and the
     // matching row fails.
     it.each([
       ['minTokens as a string', { minTokens: '40' }],
       ['minTokens zero', { minTokens: 0 }],
       ['minTokens negative', { minTokens: -1 }],
       ['minTokens fractional', { minTokens: 1.5 }],
       ['minInstances 1 (buildCloneIndex hard-skips groups below 2 anyway)', { minInstances: 1 }],
       ['minInstances negative', { minInstances: -3 }],
       ['maxClasses zero', { maxClasses: 0 }],
       ['maxClasses negative', { maxClasses: -5 }],
       ['maxClasses as a string', { maxClasses: '100' }],
       ['a non-string ignorePattern', { ignorePatterns: [42] }],
     ])('rejects %s', (_label, duplication) => {
       const parsed = HarnessConfigSchema.safeParse(withDuplication(duplication));
       expect(parsed.success).toBe(false);
       expect(parsed.success === false && parsed.error.issues[0]?.path.join('.')).toMatch(
         /^entropy\.duplication\./
       );
     });
   });
   ```

2. Run it — observe failures (the stripped-key test and the parse test fail; the rejection rows
   currently "pass" vacuously because the whole key is stripped, so **check the failure list names
   the first two tests**):
   `cd packages/cli && npx vitest run tests/config/duplication-schema.test.ts`
3. In `packages/cli/src/config/schema.ts`, immediately **before** `EntropyConfigSchema` (line ~97),
   insert:

   ```ts
   /**
    * Schema for duplication (clone) detection tuning — `entropy.duplication`.
    *
    * This is the validating boundary for values that arrive from a hand-edited
    * `harness.config.json`, where `DuplicationConfig`'s TypeScript types are
    * enforced by nothing. `buildCloneIndex` validates only `ignorePatterns`
    * (minimatch throws on a non-string); `minTokens`, `minInstances` and
    * `maxClasses` are validated nowhere else in the system. Each bad value
    * fails SILENTLY rather than loudly:
    *   - `maxClasses: 0` reports ZERO classes while counting every qualifying
    *     one in `classesTruncated` — a pass over findings that were found.
    *   - `minInstances: 1` (or 0, or negative) cannot lower the bar below the
    *     hard 2-member skip in `buildCloneIndex`, so it silently means "report
    *     every pair".
    *   - `minTokens: "40"` compares a number against a string and happens to
    *     coerce; `minTokens: "x"` makes every comparison false and
    *     fingerprints every unit in the repository.
    *
    * `ignorePatterns` REPLACES `DEFAULT_DUPLICATION_CONFIG.ignorePatterns` —
    * `resolveDuplicationConfig` merges by key, so it is not appended to the
    * shipped 21 globs. A project that sets one pattern therefore stops
    * ignoring tests, fixtures, generated output, `dist` and `node_modules`:
    * list the defaults it wants to keep alongside its own.
    */
   export const DuplicationConfigSchema = z.object({
     /** Minimum normalized tokens before a unit is fingerprinted. Default 40. */
     minTokens: z.number().int().positive().optional(),
     /** Minimum members before a class is reported. Default 3 (Rule of Three); floor 2. */
     minInstances: z.number().int().min(2).optional(),
     /** minimatch globs (NOT the regex language `entropy.drift.ignorePatterns` uses). Replaces the defaults. */
     ignorePatterns: z.array(z.string()).optional(),
     /** Report cap; the top `maxClasses` by rank survive. Default 100. */
     maxClasses: z.number().int().positive().optional(),
   });
   ```

4. Add to `EntropyConfigSchema`'s object body, after `patterns`:

   ```ts
     /**
      * Duplication (clone) detection tuning. PRESENCE IS THE OPT-IN for
      * `harness cleanup -t all` and `detect_entropy type: "all"`; an explicit
      * `-t duplication` runs on the shipped defaults whether or not this block
      * exists. `false` disables the detector outright, and an explicit request
      * then REFUSES rather than reporting a clean scan it never ran (#1760).
      */
     duplication: z.union([z.boolean(), DuplicationConfigSchema]).optional(),
   ```

5. Run the test — observe all rows pass:
   `cd packages/cli && npx vitest run tests/config/duplication-schema.test.ts`
6. Guard the neighbours: `cd packages/cli && npx vitest run tests/config/ src/config/`
7. `cd packages/cli && npx eslint src/config/schema.ts && npx tsc --noEmit`
8. `npx turbo build --filter=@harness-engineering/cli...`
9. Commit: `feat(cli): validate and honor entropy.duplication in harness.config.json`

---

### Task 3: One shared resolver for both surfaces

**Depends on:** Task 1 | **Files:** `packages/cli/src/shared/duplication-request.ts`, `packages/cli/tests/shared/duplication-request.test.ts` | **Owns:** `packages/cli/src/shared/duplication-request.ts`

1. Create `packages/cli/tests/shared/duplication-request.test.ts`:

   ```ts
   // packages/cli/tests/shared/duplication-request.test.ts
   import { describe, it, expect } from 'vitest';
   import {
     resolveDuplicationRequest,
     describeDuplicationNotRun,
   } from '../../src/shared/duplication-request';

   describe('resolveDuplicationRequest', () => {
     // The table IS the decision (plan decisions P3/P4). MUTATION: make `all`
     // run on an unconfigured project and row 3 fails; make an explicit
     // request honor `false` as "skip" and row 7 fails.
     it.each([
       ['drift / unconfigured', 'drift', undefined, 'skip'],
       ['dead-code / configured', 'dead-code', { minTokens: 50 }, 'skip'],
       ['all / unconfigured', 'all', undefined, 'skip'],
       ['all / false', 'all', false, 'skip'],
       ['all / true', 'all', true, 'run'],
       ['all / object', 'all', { minTokens: 50 }, 'run'],
       ['duplication / false', 'duplication', false, 'refuse'],
       ['duplication / unconfigured', 'duplication', undefined, 'run'],
       ['duplication / true', 'duplication', true, 'run'],
       ['duplication / object', 'duplication', { maxClasses: 5 }, 'run'],
     ])('%s -> %s', (_label, type, configured, kind) => {
       expect(resolveDuplicationRequest(type, configured as never).kind).toBe(kind);
     });

     it('passes an object config through verbatim', () => {
       const request = resolveDuplicationRequest('duplication', { maxClasses: 5 });
       expect(request).toEqual({ kind: 'run', analyze: { maxClasses: 5 } });
     });

     it('names the config key and the remedy when it refuses', () => {
       const request = resolveDuplicationRequest('duplication', false);
       expect(request.kind === 'refuse' && request.message).toContain('entropy.duplication');
       expect(request.kind === 'refuse' && request.message).toMatch(/Refusing to report/);
     });
   });

   describe('describeDuplicationNotRun', () => {
     it("quotes the analyzer's own reason and suggestions", () => {
       const message = describeDuplicationNotRun([
         {
           analyzer: 'duplication',
           error: {
             code: 'INVALID_CONFIG',
             message: 'Duplication analysis did not run: the snapshot was bypassed.',
             details: { reason: 'snapshot-bypassed' },
             suggestions: ['Supply graph data for at most one of drift / deadCode'],
           },
         },
       ]);
       expect(message).toContain('snapshot was bypassed');
       expect(message).toContain('Supply graph data for at most one');
       // The honest signal: never the words "no duplication found".
       expect(message).not.toMatch(/no duplication/i);
     });

     it('says so when there is no error to quote', () => {
       expect(describeDuplicationNotRun([])).toMatch(/recorded no error/);
     });

     it('ignores another analyzer’s error', () => {
       const message = describeDuplicationNotRun([
         {
           analyzer: 'drift',
           error: { code: 'PARSE_ERROR', message: 'drift blew up', details: {}, suggestions: [] },
         },
       ]);
       expect(message).toMatch(/recorded no error/);
       expect(message).not.toContain('drift blew up');
     });
   });
   ```

2. Run — observe module-not-found:
   `cd packages/cli && npx vitest run tests/shared/duplication-request.test.ts`
3. Create `packages/cli/src/shared/duplication-request.ts`:

   ```ts
   // packages/cli/src/shared/duplication-request.ts
   import type { AnalysisError, DuplicationConfig } from '@harness-engineering/core';

   /**
    * Whether a run should execute the duplication detector, and with what.
    *
    * Shared by BOTH surfaces (`harness cleanup -t duplication` and the
    * `detect_entropy` MCP tool) deliberately: they must agree on the opt-in
    * rule and on the refusal wording, and a copy in each would be two members
    * — below `minInstances`, where this project's own clone detector could
    * never report the drift.
    */
   export type DuplicationRequest =
     | { kind: 'run'; analyze: true | Partial<DuplicationConfig> }
     | { kind: 'skip' }
     | { kind: 'refuse'; message: string };

   /**
    * Resolve the request from the requested issue type and the project's
    * `entropy.duplication` config.
    *
    * - An explicit request (`duplication`) runs on the shipped defaults even
    *   with no config — `DEFAULT_DUPLICATION_CONFIG` is complete.
    * - `all` runs the detector ONLY when the project configured it. This is the
    *   `patterns` rule (`commands/cleanup.ts:88`): `all` runs a detector when
    *   the project gave it something to do. Duplication adds a clone scan to
    *   every cleanup run otherwise, and D4 makes it advisory, so opting in is
    *   the project's call.
    * - `false` disables it. An explicit request then REFUSES: a check that did
    *   not run must not print a pass (#1760).
    */
   export function resolveDuplicationRequest(
     type: string,
     configured: boolean | Partial<DuplicationConfig> | undefined
   ): DuplicationRequest {
     const explicit = type === 'duplication';
     if (!explicit && type !== 'all') return { kind: 'skip' };

     if (configured === false) {
       if (!explicit) return { kind: 'skip' };
       return {
         kind: 'refuse',
         message:
           'Duplication detection is disabled (`entropy.duplication: false` in harness.config.json), ' +
           'so there is nothing to report. Remove that setting or set it to `true` (or to an object of ' +
           'tuning overrides) to run the detector. Refusing to report a clean scan that never ran.',
       };
     }

     if (configured === undefined) {
       // `all` on an unconfigured project: skip. Explicit: run on defaults.
       return explicit ? { kind: 'run', analyze: true } : { kind: 'skip' };
     }

     return { kind: 'run', analyze: configured === true ? true : configured };
   }

   /**
    * Render "the detector did not run" using the analyzer's OWN reason.
    *
    * `EntropyAnalyzer` leaves `EntropyReport.duplication` undefined and pushes
    * an `AnalysisError` when duplication cannot execute — `reason:
    * 'snapshot-bypassed'` on a graph-fed run, `'zero-files-discovered'` or
    * `'invalid-ignore-pattern'` on a config problem. A caller that reads only
    * `report.duplication` sees `undefined` and renders "no duplication found",
    * which is the opposite of the truth (spec Phase 3 forward note 3).
    */
   export function describeDuplicationNotRun(analysisErrors: readonly AnalysisError[]): string {
     const failure = analysisErrors.find((entry) => entry.analyzer === 'duplication');
     if (!failure) {
       return 'Duplication analysis produced no report and recorded no error. This is a defect: the detector was requested and neither ran nor explained itself.';
     }
     return [failure.error.message, ...failure.error.suggestions.map((s) => `  - ${s}`)].join('\n');
   }
   ```

4. Run the test — observe all pass.
5. `cd packages/cli && npx eslint src/shared/duplication-request.ts && npx tsc --noEmit`
6. **Measure the dependency-graph effect of the new module** (this is what blocked Phase 2's Task 5):

   ```bash
   npx turbo build --filter=@harness-engineering/cli...
   node packages/cli/dist/bin/harness.js check-deps > /tmp/dup-phase3/deps-after-t3.txt 2>&1; echo "deps exit=$?"
   diff /tmp/dup-phase3/deps-before.txt /tmp/dup-phase3/deps-after-t3.txt
   HARNESS_ARCH_BASE_REF=c83ec3620 node packages/cli/dist/bin/harness.js check-arch > /tmp/dup-phase3/arch-after-t3.txt 2>&1
   diff /tmp/dup-phase3/arch-before.txt /tmp/dup-phase3/arch-after-t3.txt
   ```

   EXPECT: `check-deps` exit 0 with the module count up by 1 (2,663 → 2,664) and the layer count
   unchanged at 10; the arch issue LIST unchanged (exit 1 either way, never gated on). **If the
   `dependency-depth` aggregate moves, record the before/after numbers and stop — do not run
   `--update-baseline` and do not extend
   `.harness/arch/allowances/brainstorm-dry-refactoring-concept.json`.** Report instead.

7. Commit: `feat(cli): add the shared duplication request resolver for cleanup and MCP`

---

### Task 4: `harness cleanup -t duplication` exists and threads the config

**Depends on:** Task 2, Task 3 | **Files:** `packages/cli/src/commands/cleanup.ts`, `packages/cli/tests/commands/cleanup-duplication.test.ts` | **Owns:** `packages/cli/src/commands/cleanup.ts`

1. Create `packages/cli/tests/commands/cleanup-duplication.test.ts`, following the
   `capturedConfigs` mock precedent in `tests/commands/cleanup.test.ts:30-60` (mock
   `@harness-engineering/core`'s `EntropyAnalyzer` to capture the config it is constructed with, and
   `../../src/config/loader`'s `resolveConfig` so each test supplies its own `entropy` block). Assert:
   - `-t duplication` with no config ⇒ `capturedConfigs[0].analyze.duplication === true`, and
     `analyze.drift === false`, `analyze.deadCode === false`, `analyze.patterns === false`.
   - `-t duplication` with `entropy: { duplication: { minTokens: 60 } }` ⇒
     `analyze.duplication` deep-equals `{ minTokens: 60 }`.
   - `-t all` with no `entropy.duplication` ⇒ `'duplication' in capturedConfigs[0].analyze === false`
     (**not** `=== undefined`: the key must be absent, which is what `analyzer.ts:194` tests).
   - `-t all` with `entropy: { duplication: true }` ⇒ `analyze.duplication === true`.
   - `-t drift` with `entropy: { duplication: true }` ⇒ key absent.
   - `-t duplication` with `entropy: { duplication: false }` ⇒ `runCleanup` returns `!ok`, the
     message contains `entropy.duplication`, and **the analyzer was never constructed**
     (`capturedConfigs` stays empty — the refusal happens before analysis).

   Head the file with a comment naming the mutations: _removing `'duplication'` from `CleanupType`
   fails to compile; letting `all` enable duplication unconditionally fails row 3; dropping the
   refusal branch fails the last row and leaves a run that reports a clean scan it never did._

2. Run — observe failures: `cd packages/cli && npx vitest run tests/commands/cleanup-duplication.test.ts`
3. Edit `packages/cli/src/commands/cleanup.ts`:
   - line 13: `type CleanupType = 'drift' | 'dead-code' | 'patterns' | 'duplication' | 'all';`
   - line 4 import: add `DuplicationConfig` to the `import type { ... } from '@harness-engineering/core'` list.
   - after the `CLIError` import: `import { resolveDuplicationRequest, describeDuplicationNotRun } from '../shared/duplication-request';`
   - after the patterns refusal block (`cleanup.ts:~90`), insert:

     ```ts
     // Duplication is OPT-IN under `-t all` and always on for an explicit
     // `-t duplication` (plan decision P3). The patterns rule above is the
     // precedent: `all` runs a detector when the project gave it something to
     // do. The difference is that duplication ships working defaults, so an
     // explicit request needs no config — while `-t all` on an unconfigured
     // project must not silently add a clone scan to every cleanup run.
     // `false` disables it outright, and an explicit request then REFUSES
     // rather than reporting a clean scan that never ran (#1760).
     const duplicationRequest = resolveDuplicationRequest(
       type,
       config.entropy?.duplication as boolean | Partial<DuplicationConfig> | undefined
     );
     if (duplicationRequest.kind === 'refuse') {
       return Err(new CLIError(duplicationRequest.message, ExitCode.VALIDATION_FAILED));
     }
     ```

   - in the `analyze` object (`cleanup.ts:~103`), after `patterns:`:

     ```ts
         // Spread, not `duplication: ... | false`: `analyzer.ts:194` branches on
         // the key's truthiness and an absent key is the "never requested"
         // signal the detector's own tests assert.
         ...(duplicationRequest.kind === 'run' && { duplication: duplicationRequest.analyze }),
     ```

   - the command definition (`cleanup.ts:~191`):

     ```ts
         .description(
           'Detect entropy issues (doc drift, dead code, patterns, duplication). Duplication is ' +
             'advisory — it never affects the exit code — and under --type all it runs only when ' +
             'entropy.duplication is configured in harness.config.json.'
         )
         .option(
           '-t, --type <type>',
           'Issue type: drift, dead-code, patterns, duplication, all',
           'all'
         )
     ```

4. Run the new test and the existing one (the existing suite asserts `description()` contains
   `'entropy'` and the `--type` default — both still hold):
   `cd packages/cli && npx vitest run tests/commands/cleanup.test.ts tests/commands/cleanup-duplication.test.ts`
5. `cd packages/cli && npx eslint src/commands/cleanup.ts && npx tsc --noEmit`
6. `npx turbo build --filter=@harness-engineering/cli...`
7. Commit: `feat(cli): add duplication to cleanup's issue types and thread its config`

---

### Task 5: Report clone classes advisorially — and keep them out of the exit code

**Depends on:** Task 4 | **Files:** `packages/cli/src/commands/cleanup.ts`, `packages/cli/tests/commands/cleanup-duplication.test.ts` | **Owns:** `packages/cli/src/commands/cleanup.ts`

1. Extend `tests/commands/cleanup-duplication.test.ts` with an analyzer mock that returns a report
   carrying `duplication` (2 classes: one with 3 members / 120 tokens, one with 4 members / 48
   tokens; `stats` with `filesScanned: 11`, `classesReported: 2`, `classesSuppressed: 5`,
   `classesTruncated: 3`) **plus** one drift finding, and assert:
   - `result.value.duplication.classes` has 2 entries, rank-ordered as handed in, each with
     `memberCount`, `tokenCount`, `fingerprint`, `rank` and its members' `file` / `unit` / `kind` /
     `startLine` / `endLine`.
   - `result.value.duplication.classesTruncated === 3` (the cap's dropped count is not lost).
   - **`result.value.totalIssues === 1`** — the drift finding only. _This is the exit-code test's
     unit-level twin. MUTATION: add `duplication.classes.length` to the `totalIssues` sum and this
     assertion fails at 3._
   - `result.value.ran` deep-equals `{ drift: true, deadCode: false, patterns: false, duplication: true }`.
   - With a report whose `duplication` is `undefined` while `-t duplication` was requested and an
     `analysisErrors` entry `{ analyzer: 'duplication', error: { ..., details: { reason: 'snapshot-bypassed' }, suggestions: [...] } }`:
     `runCleanup` returns `!ok` and the message carries the analyzer's reason text. _MUTATION:
     delete the did-not-run branch and the command reports `duplication: undefined` as if the scan
     were clean._
   - With the same undefined report under `-t all`: `result.ok === true` and
     `result.value.duplication === undefined` (the warning goes to the logger, the run continues).
   - Print path: capture `console.log` while calling `printCleanupResult` with
     `ran.drift/deadCode/patterns` all `false` and assert the output does **not** contain a
     green-ticked `Entropy issues: 0` but does contain `not checked`. _MUTATION: keep the
     unconditional `formatSummary` call and this fails._

2. Run — observe failures.
3. Edit `cleanup.ts`:
   - After the `CleanupResult` interface's `patternViolations`, add:

     ```ts
       /**
        * Which analyzers actually produced a report.
        *
        * Without it a zero cannot be told apart from a check that never ran:
        * `-t duplication` runs NO drift, dead-code or pattern analyzer, so
        * `totalIssues` is 0 by omission and the usual green-ticked
        * "Entropy issues: 0" would green-tick three checks that never happened
        * — the #1760 failure class one layer out. Derived from report presence,
        * so it cannot drift from what executed.
        */
       ran: { drift: boolean; deadCode: boolean; patterns: boolean; duplication: boolean };
       /**
        * ADVISORY clone classes, rank-descending, as reported by
        * `EntropyReport.duplication`.
        *
        * `undefined` means the detector did not run; an empty `classes` array
        * means it ran and found nothing. The two must not render alike.
        *
        * NEVER counted in `totalIssues` — see that field.
        */
       duplication?: {
         classes: Array<{
           fingerprint: string;
           tokenCount: number;
           memberCount: number;
           rank: number;
           members: Array<{
             file: string;
             unit: string;
             kind: string;
             startLine: number;
             endLine: number;
           }>;
         }>;
         filesScanned: number;
         classesReported: number;
         classesSuppressed: number;
         classesTruncated: number;
       };
     ```

   - Document `totalIssues` in place:

     ```ts
     /**
      * The GATING count: drift + dead code + pattern violations.
      *
      * `createCleanupCommand` gates `process.exit` on this field and
      * `--findings-json` publishes it, so anything summed here becomes a
      * build failure somewhere. Clone classes are deliberately absent: spec
      * decision D4 / ADR 0134 (advisory first, never fail-closed). Adding
      * `duplication.classes.length` here would make
      * `harness cleanup -t duplication` exit non-zero on advisory findings —
      * the #855 fail-closed accident in a new place, decided by nobody.
      */
     totalIssues: number;
     ```

   - Initialize `ran: { drift: false, deadCode: false, patterns: false, duplication: false }` in the
     `result` literal (`cleanup.ts:~45`).
   - After the pattern-violation extraction block, add:

     ```ts
     if (report.duplication) {
       const duplication = report.duplication;
       result.duplication = {
         classes: duplication.classes.map((cls) => ({
           fingerprint: cls.fingerprint,
           tokenCount: cls.tokenCount,
           memberCount: cls.members.length,
           rank: cls.rank,
           members: cls.members.map((member) => ({
             file: member.file,
             unit: member.unit,
             kind: member.kind,
             startLine: member.startLine,
             endLine: member.endLine,
           })),
         })),
         filesScanned: duplication.stats.filesScanned,
         classesReported: duplication.stats.classesReported,
         classesSuppressed: duplication.stats.classesSuppressed,
         classesTruncated: duplication.stats.classesTruncated,
       };
     } else if (duplicationRequest.kind === 'run') {
       // "Did not run" must not render as "found nothing" (spec Phase 3
       // forward note 3). The analyzer leaves the report undefined and records
       // WHY — `snapshot-bypassed` on a graph-fed run, `zero-files-discovered`
       // or `invalid-ignore-pattern` on a config problem. Erroring here is not
       // a D4 violation: D4 forbids failing on FINDINGS, not on a detector
       // that could not execute.
       const explanation = describeDuplicationNotRun(report.analysisErrors);
       if (type === 'duplication') {
         return Err(new CLIError(explanation, ExitCode.ERROR));
       }
       logger.warn(explanation);
     }

     result.ran = {
       drift: Boolean(report.drift),
       deadCode: Boolean(report.deadCode),
       patterns: Boolean(report.patterns),
       duplication: Boolean(report.duplication),
     };
     ```

   - `printCleanupResult`: replace the opening `console.log(formatter.formatSummary(...))` with

     ```ts
     const gatingRan = value.ran.drift || value.ran.deadCode || value.ran.patterns;
     if (gatingRan) {
       console.log(
         formatter.formatSummary(
           'Entropy issues',
           value.totalIssues.toString(),
           value.totalIssues === 0
         )
       );
     } else {
       // No drift / dead-code / pattern analyzer ran, so `totalIssues` is 0
       // by omission. A green-ticked "Entropy issues: 0" here would report a
       // pass over three checks that never executed.
       console.log('Entropy issues: not checked (no doc-drift, dead-code or pattern analyzer ran)');
     }
     ```

     and append, after the pattern-violations section:

     ```ts
     if (value.duplication) {
       const duplication = value.duplication;
       console.log(
         '\nDuplication (advisory — excluded from "Entropy issues", from the exit code and from --findings-json):'
       );
       console.log(
         `  ${duplication.classesReported} clone class(es) over ${duplication.filesScanned} scanned file(s); ` +
           `${duplication.classesSuppressed} below the minInstances bar` +
           (duplication.classesTruncated > 0
             ? `; ${duplication.classesTruncated} dropped by the maxClasses cap`
             : '')
       );
       for (const cls of duplication.classes.slice(0, 10)) {
         const first = cls.members[0];
         console.log(
           `  - ${cls.memberCount}x ${cls.tokenCount} tokens: ` +
             (first ? `${first.unit} (${first.file}:${first.startLine})` : '(no members)')
         );
       }
       if (duplication.classes.length > 10) {
         console.log(`  ... and ${duplication.classes.length - 10} more`);
       }
     }
     ```

   - Update the `--findings-json` comment at `cleanup.ts:~225`:

     ```ts
     // #691: findings = total GATING entropy issues (drift + dead code +
     // patterns). Clone classes are advisory (D4 / ADR 0134) and excluded:
     // a consumer gating on `findings > 0` would otherwise fail a build on
     // duplication, which is the exit-code hazard by another route.
     ```

4. Run: `cd packages/cli && npx vitest run tests/commands/cleanup.test.ts tests/commands/cleanup-duplication.test.ts tests/commands/cleanup-cov544b.test.ts`
5. `cd packages/cli && npx eslint src/commands/cleanup.ts && npx tsc --noEmit`
6. `npx turbo build --filter=@harness-engineering/cli...`
7. Commit: `feat(cli): report clone classes as advisory findings, outside the exit-code arithmetic`

---

### Task 6: A fixture project the CLI and MCP can both scan

**Depends on:** Task 1 | **Files:** `packages/cli/tests/fixtures/duplication-cli-project/**` | **Owns:** `packages/cli/tests/fixtures/duplication-cli-project/**`

1. Create the fixture. `harness.config.json`:

   ```json
   {
     "version": 1,
     "rootDir": ".",
     "docsDir": "./docs",
     "entropy": {
       "entryPoints": ["src/index.ts"],
       "excludePatterns": ["**/node_modules/**"]
     }
   }
   ```

   `src/index.ts` re-exports `alpha`, `beta`, `gamma`, `solo`. `src/{alpha,beta,gamma}.ts` each
   export one ≥40-token function with an identical body under a DIFFERENT name and different
   parameter names (so the class exists only because identifiers normalize — D1, and it proves the
   fixture is a Type-2 test, not a copy-paste test). `src/solo.ts` exports one short function
   (< 40 tokens) so `unitsBelowMinTokens` is non-zero. `README.md` states the planted set, the
   expected class, and that **`entryPoints` is required** — without it `buildSnapshot` returns
   `Err ENTRY_POINT_NOT_FOUND` (Phase 2's Decision P9, measured).

   Note for the implementer: the fixture must live outside `**/fixtures/**`-matching duplication
   ignores at scan time. `DEFAULT_DUPLICATION_CONFIG.ignorePatterns` contains `**/fixtures/**`, and
   the patterns are matched against the path **relative to the scanned rootDir**. The CLI and MCP
   tests copy the fixture to a temp dir and scan THAT as root (the
   `tests/mcp/tools/entropy-config-threading.test.ts:31-37` precedent), so the relative paths are
   `src/alpha.ts` and the default ignores do not fire. **Verify this in step 2 before writing any
   test against it** — if it does fire, the fixture's own config must set
   `entropy.duplication.ignorePatterns` to a list without `**/fixtures/**`.

2. Verify the fixture reports what the README claims, from a temp copy:

   ```bash
   cd /Users/cwarner/Projects/iv/hd-dry-concept
   tmp=$(mktemp -d) && cp -R packages/cli/tests/fixtures/duplication-cli-project/. "$tmp"/
   node -e "
   const { EntropyAnalyzer } = require('./packages/core/dist/index.js');
   (async () => {
     const r = await new EntropyAnalyzer({ rootDir: '$tmp', entryPoints: ['src/index.ts'], exclude: ['**/node_modules/**'], analyze: { drift: false, deadCode: false, patterns: false, duplication: true } }).analyze();
     if (!r.ok) return console.log('ERR', r.error.code, r.error.details.reason, r.error.message);
     const d = r.value.duplication;
     console.log(JSON.stringify({ stats: d.stats, classes: d.classes.map(c => ({ n: c.members.length, tokens: c.tokenCount, units: c.members.map(m => m.unit) })) }, null, 1));
   })();
   "
   ```

   EXPECT exactly one class of 3 members with the three distinct unit names, `classesReported: 1`,
   and `unitsBelowMinTokens >= 1`. Record the figures in the README.

3. Commit: `test(cli): add a planted-clone fixture project for the CLI and MCP surfaces`

---

### Task 7: Prove the exit code through the real built CLI

**Depends on:** Task 5, Task 6 | **Files:** `packages/cli/tests/integration/cleanup-duplication-exit-code.e2e.test.ts` | **Owns:** `packages/cli/tests/integration/cleanup-duplication-exit-code.e2e.test.ts`

This is the WIRED-at-the-product-level test for the CLI: a real process, the real config loader, the
real analyzer, the real detector, and the real `process.exit`.

1. Create the test, following `tests/integration/cli.test.ts:1-20` (`spawnSync('node', [CLI_PATH, ...], { cwd, encoding: 'utf-8' })`,
   `CLI_PATH = path.join(__dirname, '../../dist/bin/harness.js')`). Copy the Task 6 fixture to a
   `mkdtempSync` dir per test. Assert:
   - `cleanup -t duplication --json` ⇒ **`status === 0`**, and `JSON.parse(stdout)` has
     `duplication.classes.length === 1`, `duplication.classes[0].memberCount === 3`,
     `totalIssues === 0`, `ran.duplication === true`, `ran.drift === false`.
     _MUTATION: add duplication to `totalIssues` ⇒ `status` becomes 1 (`ExitCode.VALIDATION_FAILED`)
     and this fails. This is forward note 1's regression test._
   - `cleanup -t duplication --findings-json` ⇒ stdout's trailing contract line parses to
     `{ findings: 0 }`. _MUTATION: route duplication into the contract ⇒ `{ findings: 1 }`._
   - Default (non-JSON) output contains `Duplication (advisory` and does **not** contain a
     `Entropy issues: 0` success line (assert on the `not checked` wording instead).
   - With `entropy.duplication: false` written into the fixture's config:
     `cleanup -t duplication` ⇒ `status !== 0`, stderr or stdout names `entropy.duplication`, and
     the output does **not** contain `Duplication (advisory`.
   - `cleanup -t all` on the fixture (which configures no `entropy.duplication`) ⇒ output contains
     no `Duplication (advisory` section. _MUTATION: make `all` unconditional ⇒ this fails._

   Guard the spawn on the build: `const CLI_BUILT = fs.existsSync(CLI_PATH);` and
   `it.skipIf(!CLI_BUILT)` — mirroring how the package's other e2e specs tolerate a missing dist —
   but **the task is only complete with the dist present and the tests actually running**, so print
   the skip state and fail the task if they skipped.

2. `npx turbo build --filter=@harness-engineering/cli...`
3. Run: `cd packages/cli && npx vitest run tests/integration/cleanup-duplication-exit-code.e2e.test.ts`
   — confirm the reporter shows them as **passed, not skipped**.
4. Commit: `test(cli): prove cleanup -t duplication exits zero on advisory findings`

---

### Task 8: `detect_entropy type: "duplication"`

**Depends on:** Task 2, Task 3, Task 6 | **Files:** `packages/cli/src/mcp/tools/entropy.ts`, `packages/cli/tests/mcp/tools/entropy-duplication.test.ts` | **Owns:** `packages/cli/src/mcp/tools/entropy.ts`

1. Create `packages/cli/tests/mcp/tools/entropy-duplication.test.ts` on the
   `entropy-config-threading.test.ts` pattern (REAL loader + analyzer + detector, fixture copied to
   a temp dir, no mocks). Assert:
   - `detectEntropyDefinition.inputSchema.properties.type.enum` contains `'duplication'`.
     _MUTATION: remove the enum value ⇒ fails. Kept deliberately shallow; the rows below are the
     behavioral tests._
   - `handleDetectEntropy({ path: fixture, type: 'duplication' })` ⇒ `isError` undefined, and the
     parsed payload's `duplication.classes` has the fixture's 1 class of 3 members.
     **This is the MCP WIRED proof.**
   - `type: 'duplication'` with `entropy: { duplication: { minInstances: 4 } }` written to the
     fixture config ⇒ the class is suppressed: `duplication.classes` is empty and
     `duplication.stats.classesSuppressed >= 1`. _This is the config-threading test: MUTATION —
     drop the `duplication` spread from the analyzer config and the override stops biting._
   - `type: 'all'` on the fixture (no `entropy.duplication`) ⇒ payload has no `duplication` key.
   - `type: 'duplication'` with `entropy: { duplication: false }` ⇒ `isError: true` and the text
     names `entropy.duplication`.
   - `type: 'patterns'` still refuses with the existing message (no regression).

2. Run — observe failures.
3. Edit `packages/cli/src/mcp/tools/entropy.ts`:
   - line 2 import: add `DuplicationConfig` to the `import type` list; add
     `import { resolveDuplicationRequest, describeDuplicationNotRun } from '../../shared/duplication-request.js';`
     (note the `.js` specifier convention used throughout this file).
   - `detectEntropyDefinition.description`: `'Detect documentation drift, dead code, pattern violations, and duplicated code units (clone classes, advisory). Optionally auto-fix detected issues.'`
   - `type.enum`: `['drift', 'dead-code', 'patterns', 'duplication', 'all']`
   - `type.description`: `'Type of entropy to detect (default: all). "duplication" reports clone classes and is advisory — it is never summed into totalIssues; under "all" it runs only when entropy.duplication is configured.'`
   - after the patterns refusal block (`entropy.ts:~204`):

     ```ts
     // Same opt-in rule as `harness cleanup` — one resolver, two surfaces, so
     // they cannot drift (plan decisions P3/P4/P14).
     const duplicationRequest = resolveDuplicationRequest(
       typeFilter,
       entropy?.duplication as boolean | Partial<DuplicationConfig> | undefined
     );
     if (duplicationRequest.kind === 'refuse') {
       return {
         content: [{ type: 'text' as const, text: duplicationRequest.message }],
         isError: true,
       };
     }
     ```

   - in the `analyze` block passed to `new EntropyAnalyzer({...})`:
     `...(duplicationRequest.kind === 'run' && { duplication: duplicationRequest.analyze }),`
   - after `const result = await analyzer.analyze(graphOptions);`:

     ```ts
     // `loadEntropyGraphOptions` returns BOTH graph keys whenever a graph
     // exists, which makes `analyze()` bypass the snapshot — and duplication,
     // which discovers through `snapshot.files`, then refuses with
     // `details.reason: 'snapshot-bypassed'` and leaves the report undefined.
     // For an explicit request that silence would render as "no duplication
     // found", so name it (spec Phase 3 forward note 3). Under `all` the
     // reason is already in the payload's `analysisErrors`, and the other
     // categories still have results worth returning.
     if (
       result.ok &&
       duplicationRequest.kind === 'run' &&
       !result.value.duplication &&
       input.type === 'duplication'
     ) {
       return {
         content: [
           { type: 'text' as const, text: describeDuplicationNotRun(result.value.analysisErrors) },
         ],
         isError: true,
       };
     }
     ```

4. Run: `cd packages/cli && npx vitest run tests/mcp/tools/`
5. `cd packages/cli && npx eslint src/mcp/tools/entropy.ts && npx tsc --noEmit`
6. `npx turbo build --filter=@harness-engineering/cli...`
7. Commit: `feat(cli): add duplication to the detect_entropy MCP tool`

---

### Task 9: Ship a payload a reader can actually read

**Depends on:** Task 8 | **Files:** `packages/cli/src/mcp/tools/entropy.ts`, `packages/cli/tests/mcp/tools/entropy-duplication.test.ts` | **Owns:** `packages/cli/src/mcp/tools/entropy.ts`

1. Extend the Task 8 test:
   - Detailed mode over the fixture: the parsed payload's `duplication` object has **no `byMember`
     key** (`expect('byMember' in payload.duplication).toBe(false)`), while
     `duplication.classes[0].members` has 3 entries. _MUTATION: return the raw report and
     `byMember` reappears as `{}` — a key that looks like an empty index rather than an
     unserializable one. This is forward note 4's test._
   - `JSON.parse(text)` succeeds and `payload.duplication.stats.classesReported === 1` (nothing else
     was lost by the projection).
   - Summary mode (`mode: 'summary'`) over the fixture with duplication requested:
     `payload.advisory.duplication.classesReported === 1`, and **`payload.totalIssues === 0`**.
     _MUTATION: fold duplication into `totalIssues` and this fails — the D4 parity test for the MCP
     surface._
   - Summary mode without duplication requested: `payload.advisory` is undefined.

2. Run — observe failures.
3. Add to `entropy.ts`, above `handleDetectEntropy`:

   ```ts
   /**
    * Project an `EntropyReport` into something `JSON.stringify` renders
    * faithfully.
    *
    * `DuplicationReport.byMember` is a `Map`, and `JSON.stringify` renders a
    * Map as `{}` — so the detailed response would carry `byMember: {}`, which
    * reads as an empty index rather than an unserializable one (spec Phase 3
    * forward note 4). It is OMITTED instead: it is an in-process O(1) seam for
    * `code-craft`, and `classes[].members` already carries every member it
    * indexes, so an entries array would duplicate data already in the payload.
    * The key's ABSENCE is the honest signal; `{}` is not.
    *
    * `skipErrors[].details.originalError` is an `Error`, which stringifies to
    * `{}` for the same reason; it is dropped here too, since `message`,
    * `errorName` and `details.reason` carry everything a reader can act on.
    *
    * NOT fixed here: `report.snapshot.exportMap.byFile` is also a `Map` and
    * also serializes away. It predates this change on a report this tool has
    * always returned — named, not silently inherited.
    */
   function toJsonSafeReport(report: EntropyReport): unknown {
     if (!report.duplication) return report;
     const { byMember: _byMember, skipErrors, ...duplication } = report.duplication;
     return {
       ...report,
       duplication: {
         ...duplication,
         skipErrors: skipErrors.map((error) => {
           const { originalError: _originalError, ...details } = error.details;
           return { ...error, details };
         }),
       },
     };
   }
   ```

   Add `EntropyReport` to the file's `import type` list from `@harness-engineering/core`.

4. Replace `return resultToMcpResponse(result);` (the `!input.autoFix` branch) with:

   ```ts
   if (!input.autoFix) {
     return result.ok
       ? resultToMcpResponse(Ok(toJsonSafeReport(result.value)))
       : resultToMcpResponse(result);
   }
   ```

   `Ok` is already imported at line 1. Apply the same projection to the two `autoFix` payloads that
   embed `analysis: report` (`dryRun` and the applied-fixes branch) — a `byMember: {}` is just as
   wrong there.

5. In `buildSummaryResponse`, after `totalIssues`:

   ```ts
   // Duplication is reported ALONGSIDE `totalIssues`, never inside it. The
   // CLI keeps clone classes out of its exit-code arithmetic (D4 / ADR 0134)
   // and `totalIssues` is the one number an agent reads as "is this clean",
   // so D4 has to hold on both surfaces or it holds on neither.
   const duplication = report.duplication
     ? {
         classesReported: report.duplication.stats.classesReported,
         classesSuppressed: report.duplication.stats.classesSuppressed,
         classesTruncated: report.duplication.stats.classesTruncated,
         membersReported: report.duplication.classes.reduce(
           (sum: number, cls: { members: unknown[] }) => sum + cls.members.length,
           0
         ),
         topClasses: report.duplication.classes
           .slice(0, 3)
           .map(
             (cls: { members: Array<{ unit: string; file: string }>; tokenCount: number }) =>
               `${cls.members.length}x ${cls.tokenCount} tokens: ${cls.members[0]?.unit ?? '<anon>'} (${cls.members[0]?.file ?? '?'})`
           ),
       }
     : undefined;
   ```

   and emit `...(duplication && { advisory: { duplication } })` in the stringified object.

6. Run: `cd packages/cli && npx vitest run tests/mcp/`
7. `cd packages/cli && npx eslint src/mcp/tools/entropy.ts && npx tsc --noEmit`
8. `npx turbo build --filter=@harness-engineering/cli...`
9. Commit: `fix(cli): stop shipping an unreadable byMember in the detect_entropy payload`

---

### Task 10: Regenerate the reference docs

**Depends on:** Task 5, Task 9 | **Files:** `docs/reference/cli-commands.md`, `docs/reference/mcp-tools.md` | **Owns:** `docs/reference/**` | **Category:** integration

`scripts/generate-docs.mjs` imports the BUILT CLI (`packages/cli/dist/index.js`, line 66), so the
build must be current or the docs regenerate against the old surface.

1. `npx turbo build --filter=@harness-engineering/cli...`
2. `pnpm run generate-docs`
3. `git diff --stat` — EXPECT exactly `docs/reference/cli-commands.md` and
   `docs/reference/mcp-tools.md`. If any other generated file moved, inspect before committing.
4. Verify the content, not just the diff:

   ```bash
   grep -n 'Issue type: drift, dead-code, patterns, duplication, all' docs/reference/cli-commands.md
   grep -n 'duplication' docs/reference/mcp-tools.md | head
   ```

5. `pnpm run generate-docs --check; echo "docs check exit=$?"` — EXPECT 0 (this is the pre-push gate).
6. Commit: `docs(reference): regenerate CLI and MCP references for duplication`

---

### Task 11: Precision audit, round 1 — the product scope as it ships

**Depends on:** Task 10 | **Files:** none (writes only to `/tmp`) | **Owns:** — | **Category:** verification

1. Record the reproducibility state the spec demands **before** any verdict:

   ```bash
   cd /Users/cwarner/Projects/iv/hd-dry-concept
   git ls-files docs/.vitepress/cache | wc -l     # EXPECT 9
   git check-ignore docs/.vitepress/cache; echo "check-ignore exit=$?"   # EXPECT 1 (tracked)
   git rev-parse HEAD
   ```

2. Produce the evidence through the REAL command (not a script, not the analyzer directly):

   ```bash
   time node packages/cli/dist/bin/harness.js cleanup -t duplication --json > /tmp/dup-phase3/audit-round1.json
   echo "exit=$?"    # EXPECT 0 — the D4 claim, observed on this repository
   python3 - <<'PY'
   import json
   d = json.load(open('/tmp/dup-phase3/audit-round1.json'))['duplication']
   print({k: v for k, v in d.items() if k != 'classes'})
   for i, c in enumerate(d['classes'][:20], 1):
       names = sorted({m['unit'] for m in c['members']})
       files = sorted({m['file'] for m in c['members']})
       print(i, 'rank', c['rank'], 'tok', c['tokenCount'], 'n', c['memberCount'], names[:4], files[0])
   PY
   ```

   EXPECT (plan-time measurement, re-verify and record any difference as a measurement, not a
   defect): `classesReported` 96, members 382, `filesScanned` 2,143, `classesSuppressed` 162,
   `classesTruncated` 0. Record the wall clock from `time` — and record that it is a
   snapshot-dominated figure (~24 s at plan time), NOT criterion 6's detector-only 2-3 s.

3. Audit the top 20 against the spec's **fixed** rejection criteria, one verdict per class with its
   reason. A class is a FALSE POSITIVE when any of: (a) extraction would need one distinct parameter
   per member; (b) the members are structurally forced by a framework or interface contract and
   could not differ; (c) the shared body is type-only or a re-export. Everything else is genuine.
   For each class, open at least two members and judge the actual code — not the name.
4. Expect, and verify, the mirror finding: at plan time **10 of the top 20** classes are
   `agents/skills/{claude-code,codex,cursor,gemini-cli}/harness-branch-buster/scripts/*.mjs`, with
   the four copies byte-identical (`md5 -q` × 4 ⇒ `aa091f0eb1e00147120d0fe0b9aa2f7f`) and 692 of 793
   `agents/skills/codex/` entries being real directories rather than symlinks. Re-verify both facts.
   The plan's reading is clause (b): a platform mirror tree must be a self-contained copy, so its
   members cannot differ and no extraction exists. **State the reading explicitly in the verdict so
   the human can overrule it at Task 13.**
5. Compute and record round-1 precision as `genuine / 20`, with the verdict table, into
   `/tmp/dup-phase3/audit-round1.md` (committed to the spec in Task 15, not here).
6. No commit (nothing in the repo changed).

---

### Task 12: Tighten the exclusions and re-audit

**Depends on:** Task 11 | **Files:** `harness.config.json` | **Owns:** `harness.config.json` | **Category:** verification

Criterion 2's own remedy: "If precision falls below 90%, exclusions shall be tightened."

1. Measure both arms before editing anything, through the analyzer at the product scope (the
   plan-time script at `/tmp/dup-phase3/` can be re-created from the figures table above):
   arm A = defaults; arm B = defaults + `**/agents/skills/codex/**`,
   `**/agents/skills/cursor/**`, `**/agents/skills/gemini-cli/**`. Plan-time result: 96/382 → 58/230,
   `filesIgnored` 73 → 88, `unitsFingerprinted` 8,444 → 8,330, `classesSuppressed` unchanged at 162.
2. Check the open question: is arm B's 58-class set the SAME SET as Scope A's 58 (`packages/` only),
   or merely the same size? Compute a digest over `(fingerprint, memberCount)` of every class in each
   and compare — the Phase 2 handoff records Scope A's whole-index digest as `7e0f1622fb75abbc`.
   Record identical / different. **Do not assert identity without the digest.**
3. Apply the tightening to this repository's config. In `harness.config.json`, inside `entropy`, add:

   ```json
   "duplication": {
     "ignorePatterns": [
       "**/*.test.ts", "**/*.test.tsx", "**/*.test.js", "**/*.test.jsx",
       "**/*.spec.ts", "**/*.spec.tsx", "**/*.spec.js", "**/*.spec.jsx",
       "**/*.bench.ts",
       "**/tests/**", "**/test/**", "**/__tests__/**",
       "**/fixtures/**", "**/__fixtures__/**",
       "**/generated/**", "**/*.generated.ts",
       "**/node_modules/**", "**/dist/**", "**/build/**", "**/coverage/**",
       "**/agents/skills/codex/**",
       "**/agents/skills/cursor/**",
       "**/agents/skills/gemini-cli/**"
     ]
   }
   ```

   The first 21 entries restate `DEFAULT_DUPLICATION_CONFIG.ignorePatterns` **because
   `resolveDuplicationConfig` merges by key and a supplied array REPLACES the defaults** (plan
   decision P11). The last three are this repository's platform mirror trees: byte-identical copies
   of `agents/skills/claude-code/`, maintained by the mirror convention and the plugin generator, so
   their duplication is the distribution mechanism, not extractable code. `claude-code` stays in
   scope as the canonical tree.

   **Do not put this in `entropy.excludePatterns`** — that would also change drift, dead-code and
   `harness ci check` results. It is scoped to duplication on purpose.

4. Re-run the real command and re-audit the top 20 at the tightened scope:

   ```bash
   npx turbo build --filter=@harness-engineering/cli...   # not strictly needed; keeps dist current
   time node packages/cli/dist/bin/harness.js cleanup -t duplication --json > /tmp/dup-phase3/audit-round2.json
   echo "exit=$?"
   ```

   Record the new counters, verify `classesReported` 58 / members 230 (or record the difference), and
   write 20 fresh verdicts with reasons into `/tmp/dup-phase3/audit-round2.md`. Compute round-2
   precision. **If it is still below 90%, do not tighten further unilaterally — record the shortfall
   and the candidate next exclusion, and let Task 13's checkpoint decide.**

5. Decide forward note 2's remaining question — whether `DEFAULT_DUPLICATION_CONFIG.ignorePatterns`
   should gain a vendored-build-cache glob (`**/.vitepress/cache/**`) **for adopters** — and record
   it with measured impact at BOTH scopes: at this repo's product scope it changes nothing (the
   project config already excludes that directory: 0 vitepress classes in 96), and at the detector's
   own default scope it removes the 2 known false-positive classes (6 members) Phase 2 measured.
   The plan's recommendation is to **record the decision and NOT change the core default in Phase 3**:
   the product scope is already clean, changing the default would move Phase 1's and Phase 2's
   recorded evidence figures for a case this repository cannot observe, and the honest generalization
   (vendored dependency pre-bundles of any bundler, not just vitepress) is a defaults question worth
   its own follow-up. Task 13 may overrule.
6. Verify nothing else moved: `git diff --stat` ⇒ `harness.config.json` only. Then confirm the key
   is honored rather than stripped: `node packages/cli/dist/bin/harness.js cleanup -t drift 2>&1 | grep -c "ignored unknown key"` ⇒ **0**.
   _(Before Task 2 this printed `⚠ harness.config.json: ignored unknown key 'entropy.duplication'` —
   measured at plan time. This grep is the end-to-end WIRED proof of the config surface.)_
7. Commit: `chore(config): exclude the platform mirror trees from duplication detection`

---

### Task 13: `[checkpoint:human-verify]` — the precision audit and its consequences

**Depends on:** Task 12 | **Files:** none | **Owns:** — | **Category:** checkpoint

Spec criterion 2 is the one gate in this phase a human must close. Present, in plain text, as one
batch:

1. Round-1 verdicts (default product scope): 20 classes, each genuine/false-positive with its
   rejection clause, the precision figure, the scope counters, and
   `git ls-files docs/.vitepress/cache | wc -l`.
2. The mirror finding and its evidence (identical md5 × 4, distinct inodes, 692/793 real dirs), and
   the clause-(b) reading applied to it.
3. The tightening: what was excluded, where, why not in `excludePatterns`, and the measured arms
   (96/382 → 58/230; the set-identity digest result).
4. Round-2 verdicts and precision at the tightened scope, against the ≥90% target — including, if
   it falls short, the candidate next exclusion and the alternative of recording the detector as
   staying experimental.
5. The two decisions to confirm: **P1** (clone classes never enter `totalIssues`, `--findings-json`
   or the exit code — observed: `cleanup -t duplication` exits 0 on 96 classes) and forward note 2's
   verdict on the core default.

Then STOP and wait. If the human rejects the tightening, revert Task 12's commit and re-run Task 11's
figures at the default scope before continuing; if they reject the precision verdict, the detector is
recorded as experimental in Task 15 and the exclusion work is re-scoped.

---

### Task 14: Criterion 1's acceptance evidence, at the shipped configuration

**Depends on:** Task 13 | **Files:** none (writes only to `/tmp`) | **Owns:** — | **Category:** verification

1. Run the real command at the final config and verify the two named classes:

   ```bash
   cd /Users/cwarner/Projects/iv/hd-dry-concept
   node packages/cli/dist/bin/harness.js cleanup -t duplication --json > /tmp/dup-phase3/criterion1.json; echo "exit=$?"
   python3 - <<'PY'
   import json
   d = json.load(open('/tmp/dup-phase3/criterion1.json'))['duplication']
   classes = d['classes']
   sums = [c for c in classes if {m['unit'] for m in c['members']} == {'sumCosts'}]
   js = [c for c in classes if {'sendJSON', 'sendJson', 'jsonResponse'} & {m['unit'] for m in c['members']}]
   print('counters', {k: v for k, v in d.items() if k != 'classes'})
   print('sumCosts', [(c['memberCount'], c['tokenCount'], c['rank']) for c in sums])
   print('json-response', [(c['memberCount'], c['tokenCount'], sorted({m['unit'] for m in c['members']})) for c in js])
   print('min members', min(c['memberCount'] for c in classes), 'min tokens', min(c['tokenCount'] for c in classes))
   PY
   ```

   EXPECT: exit 0; `sumCosts` one class with 10 members (98 tokens, rank 980 at plan time); the
   JSON-response class with 16 members spanning `sendJSON` / `sendJson` / `jsonResponse` (44 tokens);
   min members ≥ 3 and min tokens ≥ 40 across every reported class.

2. Also exercise the MCP surface on this repository, and record which branch it took:

   ```bash
   node -e "
   const { resolveGraphDir } = require('./packages/graph/dist/index.js');
   console.log('graphDir', resolveGraphDir(process.cwd()));
   " 2>/dev/null || echo 'resolveGraphDir unavailable from dist — record how it was checked'
   ls -d .harness/graph 2>/dev/null || echo 'no .harness/graph — loadGraphStore returns null, snapshot IS built'
   ```

   Then call `handleDetectEntropy({ path: <repo>, type: 'duplication' })` via a one-off
   `npx tsx` script and record: duplication classes present (snapshot built) **or** the
   `snapshot-bypassed` refusal text (graph present). Both are correct outcomes; which one occurred
   is the datum. _At plan time there is no `.harness/graph/` in this worktree, so the happy path is
   expected._

3. Record both runs' figures (scope + denominator) for Task 15. No commit.

---

### Task 15: Record the verdicts and resolve the inherited decisions

**Depends on:** Task 14 | **Files:** `docs/changes/duplication-detection/proposal.md`, `docs/knowledge/decisions/0134-whole-unit-type-2-clone-detection-at-rule-of-three.md` | **Owns:** `docs/changes/duplication-detection/proposal.md`, `docs/knowledge/decisions/0134-*.md` | **Category:** integration

1. Append to the spec's **## Verification notes**:
   - `### Phase 3 — criterion 2: the top-20 precision audit`: both rounds' verdict tables with the
     rejection clause cited per false positive, both precision figures, the counters at both scopes,
     the HEAD SHA, and `git ls-files docs/.vitepress/cache | wc -l = 9` with
     `git check-ignore` exit 1 beside them.
   - `### Phase 3 — Scope C: the product scope is a THIRD scope`: the table from this plan
     (2,143 / 8,444 / 96 / 382 / 162 before tightening; 2,128 / 8,330 / 58 / 230 / 162 after), the
     config provenance, and the explicit statement that 96 vs 98 vs 58 is scope, not regression.
   - `### Phase 3 — criterion 1 evidence`: the real command, its exit code, the two named classes'
     member counts.
   - `### Phase 3 — the command's wall clock is snapshot-dominated`: ~24 s (58.7 s cold) for
     `analyze()` at Scope C with only duplication enabled, against criterion 6's detector-only
     2.4-3.0 s bar. Record that criterion 6 is unchanged and unguarded (Phase 2's accepted gap) and
     that the command's cost is NOT that figure.
   - `### Phase 3 — answers to Phase 2's four forward notes`: (1) exit code — excluded from
     `totalIssues` AND from `--findings-json`, observed exit 0 on 96 classes; (2) vitepress — product
     scope already clean, core default unchanged, decision recorded with both arms measured;
     (3) config surface — schema entry + bounds, with the measured before/after of the stripped-key
     warning; (4) `byMember` — omitted from the MCP payload, with `skipErrors[].details.originalError`
     dropped by the same projection and `snapshot.exportMap.byFile` named as out of scope.
   - A one-line follow-up note for P12 (knowledge-graph concept nodes deferred; #1507 named).
2. Edit ADR 0134: in Consequences, replace the open question at lines ~144-147 with the resolution —
   duplication is excluded from `CleanupResult.totalIssues` and from the `--findings-json` contract;
   `harness cleanup -t duplication` exits 0 on findings, verified on this repository; D4 is
   unchanged, not amended. Add `packages/cli/src/commands/cleanup.ts` and the exit-code e2e test to
   the ADR's references list.
3. Verify the spec's own claims still parse and the docs gate is clean:
   `pnpm run format:check` (or `npx prettier --check` on the two files) and
   `pnpm run generate-docs --check`.
4. Commit: `docs(duplication): record the Phase 3 precision audit and resolve the exit-code decision`

---

### Task 16: Point the prose at the detector that now exists

**Depends on:** Task 10 | **Files:** `AGENTS.md`, `agents/skills/claude-code/harness-refactoring/SKILL.md` | **Owns:** `AGENTS.md`, `agents/skills/claude-code/harness-refactoring/SKILL.md` | **Category:** integration

1. `AGENTS.md`: the entropy module line (`:278`) already names clone classes. Add the **user-facing
   surface** where the maintenance commands are listed (`:559`) or alongside the entropy section:
   `harness cleanup -t duplication` and `detect_entropy type: "duplication"` are advisory, never
   affect an exit code, and under `-t all` run only when `entropy.duplication` is configured.
2. `agents/skills/claude-code/harness-refactoring/SKILL.md`: at line 8 ("When reducing duplication
   (DRY refactoring)") and the step at line 66 ("Remove one instance of duplication"), name the
   detector that now sits upstream — `harness cleanup -t duplication` (advisory; classes are ranked
   `tokenCount × members`, so work top-down). This closes the loop the spec's Problem section opens:
   a procedure with no detector upstream.
   **The skill mirrors are symlinks for this skill** (`agents/skills/codex/harness-refactoring ->
../claude-code/harness-refactoring`, verified), so editing the claude-code copy updates all four
   platforms. The pre-commit hook auto-regenerates and stages the plugin artifacts when anything
   under `agents/skills/` is staged (`.husky/pre-commit:82-87`) — let it; do not pre-empt it, and do
   not bypass it if it fails.
3. Verify: `git diff --stat` (expect the two files, plus whatever the hook adds under
   `.claude-plugin` / `.cursor-plugin` / `.gemini-extension` / `.codex-plugin` at commit time) and
   `pnpm run format:check`.
4. Commit: `docs: point the DRY prose at harness cleanup -t duplication`

---

### Task 17: Changeset

**Depends on:** Task 10 | **Files:** `.changeset/duplication-cli-mcp-surface.md` | **Owns:** `.changeset/**` | **Category:** integration

1. Create `.changeset/duplication-cli-mcp-surface.md` with `'@harness-engineering/cli': minor`
   (core is untouched in this phase), describing: the new `-t duplication` issue type and
   `detect_entropy type: "duplication"`; that both are **advisory** and never affect an exit code or
   the `--findings-json` contract; the new validated `entropy.duplication` config block with its
   **replace** semantics for `ignorePatterns`; the `all`-is-opt-in rule; the refusal on a disabled
   detector; and the omission of `byMember` from the MCP payload.
2. `pnpm run check:changesets; echo "exit=$?"` — EXPECT 0.
3. `pnpm run format:check` (prettier mangles nothing here, but the gate runs on the file).
4. Commit: `chore(changeset): duplication CLI and MCP surface`

---

### Task 18: Final gate sweep

**Depends on:** Task 7, Task 15, Task 16, Task 17 | **Files:** none | **Owns:** — | **Category:** verification

Run in this order, recording every number against Task 1's baselines. Nothing here may be
reported as passing unless it was observed.

1. `npx turbo build --filter=@harness-engineering/cli...` (and `--filter=@harness-engineering/core...`
   if core was touched — it should NOT have been).
2. `cd packages/cli && npx vitest run` — EXPECT ≥ 745 files and ≥ 8,804 passed + 2 skipped, exit 0,
   with the delta equal to exactly the tests this phase added. Record the file/test counts.
3. `cd packages/core && npx vitest run tests/duplication tests/entropy` — EXPECT 176 and 290/29
   unchanged (this phase changes no core source).
4. `cd packages/cli && npx tsc --noEmit` — exit 0.
5. Scoped eslint on the touched **source** files only:
   `cd packages/cli && npx eslint src/commands/cleanup.ts src/mcp/tools/entropy.ts src/config/schema.ts src/shared/duplication-request.ts`
   — exit 0. Do **not** lint `tests/**` (no tsconfig project includes it; pre-existing failure).
6. `node packages/cli/dist/bin/harness.js check-deps > /tmp/dup-phase3/deps-after.txt 2>&1; echo "exit=$?"`
   — EXPECT 0; diff against `deps-before.txt` and record the module/layer delta (expected: +1 module
   for the new shared file, 10 layers unchanged).
7. `HARNESS_ARCH_BASE_REF=c83ec3620 node packages/cli/dist/bin/harness.js check-arch > /tmp/dup-phase3/arch-after.txt 2>&1`
   then `diff /tmp/dup-phase3/arch-before.txt /tmp/dup-phase3/arch-after.txt` — EXPECT no diff.
   Exit 1 either way; **never gate on the exit code and never read it through a pipe.** No
   `--update-baseline`, no change to
   `.harness/arch/allowances/brainstorm-dry-refactoring-concept.json`.
8. `pnpm run generate-docs --check; echo "exit=$?"` — EXPECT 0.
9. `pnpm run format:check; echo "exit=$?"` — EXPECT 0 (prettier --write only the files this phase
   touched if it fails, then re-run).
10. `node packages/cli/dist/bin/harness.js validate > /tmp/dup-phase3/validate-after.txt 2>&1; echo "exit=$?"`
    — EXPECT exit 1 / 462 issues, **identical to baseline**. This is a baseline comparison. Never
    report "validate passed".
11. Coverage, the pre-push equivalent (slow; record, do not skip):
    `HARNESS_PREPUSH=1 pnpm exec turbo run test:coverage --filter=@harness-engineering/cli --concurrency=2`
    then `node scripts/coverage-ratchet.mjs --allow-missing` — EXPECT no regression against
    lines 90.89 / branches 81.12 / functions 92.43 / statements 89.55.
12. `git status --short` — EXPECT clean. `git log --oneline 91df7e311..HEAD` — one commit per task,
    no `--no-verify` anywhere.
13. Re-verify criterion 12 with a grep, not a memory: every `EntropyAnalyzer` construction outside
    `cleanup.ts` and `mcp/tools/entropy.ts` still has no `duplication` key:
    `grep -rn 'new EntropyAnalyzer' packages/*/src | grep -v node_modules` then read each
    `analyze:` block.

No commit (verification only). Record every figure in the session handoff.

---

## Verification Matrix

| Observable truth                   | Delivered by  | Verified by                                                    |
| ---------------------------------- | ------------- | -------------------------------------------------------------- |
| 1 (criterion 1)                    | T4, T5        | T14 real `cleanup -t duplication --json` on this repo          |
| 2 (exit 0 / findings 0)            | T5            | T7 spawned-CLI e2e (status 0, `{findings: 0}`)                 |
| 3 (bad config rejected)            | T2            | T2 10-row rejection table                                      |
| 4 (key no longer stripped)         | T2            | T2 `collectStrippedKeys` test + T12 step 6 grep                |
| 5 (opt-in / refusal)               | T3, T4, T8    | T3 table, T4 config-capture rows, T7 + T8 product rows         |
| 6 (did-not-run is loud)            | T3, T5, T8    | T3 `describeDuplicationNotRun` tests, T5 undefined-report rows |
| 7 (no `byMember`, JSON-safe)       | T9            | T9 `'byMember' in payload.duplication === false`               |
| 8 (advisory outside `totalIssues`) | T9            | T9 summary-mode assertions                                     |
| 9 (generated docs)                 | T10           | `generate-docs --check` exit 0 + content greps                 |
| 10 (audit performed + recorded)    | T11, T12, T15 | T13 checkpoint; the spec's Verification notes                  |
| 11 (deps/arch unmoved)             | T3            | T3 and T18 diffs under the pinned base ref                     |
| 12 (no other detector changed)     | —             | T18 step 13 grep + T3/T18 core suite re-runs                   |

---

## Risks

| Risk                                                                | Mitigation                                                                                                                                                                                                             |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Round-2 precision still below 90%                                   | Task 12 stops rather than tightening unilaterally; Task 13 decides between a further exclusion and recording the detector as experimental. The plan does not presuppose a pass.                                        |
| `**/fixtures/**` in the default ignores hides the Task 6 fixture    | Task 6 step 2 verifies the fixture reports its planted class **before** any test is written against it, and names the fallback (fixture-local `ignorePatterns`).                                                       |
| The new shared module moves the `dependency-depth` aggregate        | Task 3 step 6 measures it immediately and stops on a move. No `--update-baseline`, no allowance edit.                                                                                                                  |
| `-t all` behavior change surprises an existing caller               | `-t all` is unchanged for every project without `entropy.duplication` — including CI, which calls `cleanup --type drift` (`.github/workflows/pr-advisory-checks.yml:150`). This repo opts in at Task 12, deliberately. |
| Spawned-CLI e2e silently SKIPS on a missing dist and reads as green | Task 7 builds first and requires the reporter to show the tests as passed, not skipped.                                                                                                                                |
| `harness.config.json` edit blocked by a hook                        | `protect-config.js` covers linter/formatter configs only (`PROTECTED_PATTERNS` read at HEAD); `harness.config.json` is not in the list. If something blocks anyway: stop and report, never bypass.                     |
| The audit's figures move because the vitepress cache regenerated    | Every audit verdict records `git ls-files docs/.vitepress/cache                                                                                                                                                        | wc -l` and the HEAD SHA, per the spec's audit instruction. |

---

## Rollback

Every task is one commit. Task 12's config change is the only behavioral change to this repository
outside the CLI package and reverts cleanly (`git revert`) without touching code. Tasks 2-9 are
additive: with `entropy.duplication` absent and `-t duplication` unused, every surface behaves
exactly as it does at `91df7e311`.

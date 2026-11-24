# Plan: Re-cut shift-left pipeline fidelity Phase 1 into five stacked units

**Date:** 2026-11-24 | **Spec:** `docs/changes/shift-left-pipeline-fidelity/proposal.md` | **Behaviour statement:** `.harness/sessions/changes--shift-left-pipeline-fidelity--proposal/fix-round-2-contract.md` | **Tasks:** 31 | **Time:** about 6 to 8 hours of execution, one unit at a time | **Integration Tier:** large

## Goal

Re-cut branch `feat/shift-left-pipeline-fidelity` at `43361c4e1` into five stacked branches, one per review unit, each of which builds, typechecks, lints and passes its tests on its own, without losing any work. The tip of unit 5 must equal `43361c4e1` rebased onto current `origin/main`, apart from the differences listed in Part F.

The owner has decided the unit split. This plan does not reopen it. Where the code makes one of the owner's stated facts untrue, the plan says so (Part G) and places the code with the smallest change.

## Observable truths (acceptance criteria)

1. Branches `feat/review-fidelity-u1-gate-core`, `feat/review-fidelity-u2-fix-rounds`, `feat/review-fidelity-u3-provenance-stamp`, `feat/review-fidelity-u4-pr-stamp-reader` and `feat/review-fidelity-u5-attribution` exist. Unit 1 starts at `origin/main` (`717098b56`) and each later unit starts at the tip of the unit before it.
2. On each unit branch, every command in the unit's gate (Part C) exits 0: build, `generate:barrels:check`, typecheck, lint, the four test suites, `test:root`, `generate-docs --check`, `generate:tool-catalog:check`, `generate:plugin:check` and `check:changesets`. `harness validate`, `harness ci check --skip arch,traceability` and `check-arch` report nothing that `origin/main` does not already report, apart from a module-size regression covered by the unit's own allowance file.
3. When unit N is built, no text it adds (`git diff origin/main...HEAD`, added lines only, outside `docs/changes/` and the generated directories) contains a term that belongs to a later unit (Part B.0, forbidden terms).
4. On unit 5's cut tip, `git diff $(git merge-tree --write-tree origin/main 43361c4e1) HEAD --stat` lists exactly the intended differences in Part F, and nothing else.
5. `feat/shift-left-pipeline-fidelity` keeps every commit it had at `43361c4e1`. The only commit added on top of it is this plan.
6. Every critical or important open finding from review round 4, and every suggestion that is a correctness defect, is assigned to exactly one unit (Part E). Each unit fixes its findings after the cut, in fix commits on its own branch.

## Decisions

| #   | Decision                                                                                                                                                                                                                                                                                                                                    | Why                                                                                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | REF is the sha `43361c4e19faeebd74d8dfcb06d44237d1bcd965`, never the branch name.                                                                                                                                                                                                                                                           | The branch gets this plan's commit, and later work must not move the reference.                                                                                                                                                                         |
| R2  | **Subtractive cut.** Unit N's version of a shared file is REF's version with every excision entry of units N+1 to 5 applied (Part B). Entries are applied in increasing unit order, and an entry whose `find` text is no longer present is skipped. A file is always rebuilt from REF; it is never edited from the previous unit's version. | Unit 5 applies no entries, so its files are REF byte for byte and the invariant holds by construction. Each entry's `find` is REF text, so applying lower units first never breaks an anchor.                                                           |
| R3  | The work happens in a new worktree, `_wt/review-fidelity-recut`, on new branches. Nothing checks out, resets or rebases `feat/shift-left-pipeline-fidelity`.                                                                                                                                                                                | This keeps the reference untouched, and `_wt/**` is already excluded from arch scans.                                                                                                                                                                   |
| R4  | The cut comes first. Fixes for review findings come after unit 5's invariant check, as fix commits on each unit branch, restacked upward.                                                                                                                                                                                                   | The invariant compares the cut alone. Fixes are intended changes, and adding them earlier would hide lost work.                                                                                                                                         |
| R5  | The PR-body stamp parser (`parseProvenanceStamp`, `stampText`, the row and note readers) goes to **unit 3**. `stampHeadNotice` and `renderParsedStamp` go to unit 4, and `stampCoverage` to unit 5.                                                                                                                                         | Nine unit-3 test files round-trip the renderer through the parser ("whatever the renderer writes, the parser accepts"). Their contract is the stamp grammar, which the owner put in unit 3. With the parser there, unit 5 does not need it from unit 4. |
| R6  | The PR reader (`PrRead`, `PrReader`, `defaultPrReader`, `resolvePrNumber`) goes to **unit 4**, so unit 5 uses one function from unit 4.                                                                                                                                                                                                     | It is `--pr`'s reader, and placing it with its first consumer avoids dead code in unit 3. The stack is linear and merges in order, so a 5-on-4 dependency costs nothing. See Part G, concern 1.                                                         |
| R7  | `reviewedHeadInHistory`, `headRule: 'ancestor'` and gate `coverage` go to unit 3.                                                                                                                                                                                                                                                           | Only the stamp consumes them. Leaving them in unit 1 would ship code that unit 1's PR does not use.                                                                                                                                                     |
| R8  | The `main` worktree resolution in `resolveRepoRoots` (`mainWorktree` and its helpers) goes to unit 5.                                                                                                                                                                                                                                       | Its only purpose is where the attribution log lives. `review-tier` uses `.top` alone.                                                                                                                                                                   |
| R9  | `RECEIPT_UNREAD_REASONS`, `ERRNO_REASON` and `ReceiptUnreadReason` stay in unit 1.                                                                                                                                                                                                                                                          | The unit-1 reader writes these reasons, and finding `typescript-strict-unread-reason-widened` (unit 1) types them.                                                                                                                                      |
| R10 | The session-state reader goes to unit 3. Unit 1's `sessionStartingCommit` parses `startingCommit` itself, and unit 3 replaces it with `readSessionReviewState`.                                                                                                                                                                             | The owner put the session-state contract in unit 3. The gate (unit 1) needs only the starting commit.                                                                                                                                                   |
| R11 | Changesets: one per unit. Unit 1 keeps REF's file name with unit-1 content. Units 2 to 5 add their own files.                                                                                                                                                                                                                               | Units may merge across a release, and a release consumes a changeset. Growing one file would announce unit 1 twice.                                                                                                                                     |
| R12 | Unit PR bodies say `Part of #2686`. None says `Closes #2686`.                                                                                                                                                                                                                                                                               | Merge-triggered auto-done would mark the roadmap row done when unit 1 merges, and the spec still has Phases 2 to 4 (units 7 to 9) to go.                                                                                                                |
| R13 | Tests that pin prose (the three files in `agents/skills/tests/`) are cut **per assertion**: an `expect` that names a later unit's term is removed, and an `it` is removed only when no assertion is left.                                                                                                                                   | Many `it` blocks mix unit-1 assertions with later ones. Removing whole blocks would drop unit-1 coverage.                                                                                                                                               |

## Uncertainties

- [ASSUMPTION] Stacked PRs (base other than `main`) get no CI: `ci.yml` triggers on `pull_request: branches: [main]`. Each unit's local gate (Part C) is authoritative until its base merges and GitHub retargets it to `main`. If this is wrong, nothing in the plan changes; CI simply adds a check.
- [ASSUMPTION] Coupling (+4, tolerance 4), dependency depth (+6, tolerance 6) and complexity (+1, tolerance 2) are at or under their limits at REF, and every unit's cumulative value is at or below REF's, because the cut only removes files and imports. Task U\*.gate measures this; if a unit exceeds, it writes an allowance (Part D).
- [ASSUMPTION] The prose cut points for the two SKILL.md files are exact in Part B.6. For AGENTS.md, the ADRs, the knowledge doc and the guide, Part B.7 assigns sections and paragraphs to units. The forbidden-term grep (B.0) and the skills tests decide the remaining sentence-level cuts. Expect up to one round of adjustment per unit.
- [DEFERRABLE] Whether units 3 to 5 still need an allowance at review time depends on whether units 1 and 2 have merged by then (Part D).
- [DEFERRABLE] Review volume: unit 1 is the largest unit (Part D table). If the owner wants it smaller, split 1a (core and CLI) from 1b (skills prose and skills tests). Nothing else in this plan changes.

## File map

The 190 paths in `git diff --name-only origin/main...43361c4e1`:

| Group                        | Paths                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Where they are listed |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Unit 1 only (taken verbatim) | 43: the 23 REF paths in U1.2 (U1.2 also adds this plan, which is new) and the 20 test paths in U1.6                                                                                                                                                                                                                                                                                                                                                                                     | U1.2, U1.6            |
| Unit 2 only                  | 2: `packages/core/tests/receipts/round4-rounds.test.ts`, `packages/cli/tests/commands/round4-archive-round.test.ts`                                                                                                                                                                                                                                                                                                                                                                     | U2.2                  |
| Unit 3 only                  | 19: `decisions.ts`, `stamp-grammar.ts`, `text.ts`, `state/autopilot-session-state.ts`, `roadmap/sync.ts`, cli `migrate.ts`, `review-provenance.ts`, 7 core tests, 2 cli tests, `docs/.vitepress/config.mts`, `docs/guides/index.md`, `docs/guides/review-provenance.md`                                                                                                                                                                                                                 | U3.2, U3.5            |
| Unit 4 only                  | 15: `pre-merge-brief.ts`, 4 platform copies of the pre-merge-brief skill (8 files), 2 tests, `required-review.yml`, 2 template files, `docs/reference/packages-cli-13.md`                                                                                                                                                                                                                                                                                                               | U4.1                  |
| Unit 5 only                  | 15: `attribution.ts`, `attribution-report.ts`, `review-attribution.ts`, `skill/run.ts`, 5 core tests, 6 cli test files                                                                                                                                                                                                                                                                                                                                                                  | U5.1                  |
| Shared (cut by Part B)       | 36: types `pipeline-receipts.ts`, types `index.ts`, types test; core receipts `schema`, `layout`, `load`, `review-gate`, `index`, `provenance`; cli `review-receipts/io`, `review-receipts/gate`, `check-review-receipt`; `scripts/generate-core-barrel.mjs`; 6 core and 4 cli shared tests; both review SKILL.md and skill.yaml files; the 3 skills tests; `AGENTS.md`; ADRs 0139 and 0140; `docs/knowledge/core/review-receipts.md`; `docs/reference/configuration.md`; the changeset | Part B                |
| Generated                    | 59: plugin copies (26), comprehension shards (25), `docs/reference/{cli-commands,mcp-tools,skills-catalog,tool-catalog}.md`, core `index.ts`, cli `_registry.ts`, `public-symbols.txt`, `docs/roadmap.md`                                                                                                                                                                                                                                                                               | A.4                   |
| Dropped                      | 1: `.harness/arch/allowances/feat-shift-left-pipeline-fidelity.json`                                                                                                                                                                                                                                                                                                                                                                                                                    | Part F                |

Added outside REF's file list: this plan; `.changeset/review-fidelity-{rounds,provenance,pr-stamp,attribution}.md`; and the per-unit allowance files Part D calls for.

---

## Part A: Environment and method (read before any unit)

### A.1 Constants

```bash
REPO=/Users/cwarner/Projects/iv/harness-engineering
WT=$REPO/_wt/review-fidelity-recut
REF=43361c4e19faeebd74d8dfcb06d44237d1bcd965
SLUG=changes--shift-left-pipeline-fidelity--proposal
U1=feat/review-fidelity-u1-gate-core
U2=feat/review-fidelity-u2-fix-rounds
U3=feat/review-fidelity-u3-provenance-stamp
U4=feat/review-fidelity-u4-pr-stamp-reader
U5=feat/review-fidelity-u5-attribution
```

### A.2 Shell rules

- Run `source ~/.nvm/nvm.sh && nvm use 22` in every shell. The default Node 24 builds better-sqlite3 for the wrong ABI.
- Use `node packages/cli/dist/bin/harness.js` (written below as `H`), never the global `harness`. Rebuild before using the CLI as evidence: `pnpm turbo run build --filter=@harness-engineering/cli... --force`.
- Never run `git stash` in any form, `git reset --hard` on a branch you did not create, or a broad `pkill`.
- Use `git show $REF:<path> > <path>` to take REF's version of a file. Use `git checkout $REF -- <path>` only for files a unit takes verbatim.
- Every commit runs the pre-commit hook: `ci check` (arch included), lint-staged, the comprehension recompile, plugin regeneration and roadmap regen. The hook needs `packages/cli/dist` to be built **from the current unit's sources**, so build before every commit.
- Commit messages are Conventional Commits and end with the attribution line your session's system prompt gives.

### A.3 How to apply an excision entry

An entry looks like this:

```text
E-<file>-<n> [Uk]   find:    <REF text, exact>
                    replace: <text for every unit below k>   (empty: delete)
```

To build unit N's version of a shared file:

1. `git show $REF:<path> > <path>`.
2. For k = N+1, N+2, … 5: apply every entry tagged `[Uk]` for that file, in the order listed. An entry marked "every occurrence" replaces all occurrences. If `find` occurs zero times, skip the entry: an entry of a lower unit already removed it. If it occurs more often than the entry allows, stop and report.
3. Run `pnpm exec prettier --write <path>` for `.md` and `.ts` files. This re-pads Markdown tables.
4. Remove any import the cut left unused. Lint lists them; every such import is also named in the entries below.

Test files are cut by REF line range, given in Part B.5. A range starts at a `describe`, `it` or comment line and ends at the matching `});`. Delete from the bottom of the file upward so the earlier REF line numbers stay valid, then fix the imports the entry names.

### A.4 Generated files: never cut by hand

| Generated path                                                                                                                                                                                                     | Generator                                                                                                  | When                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `.claude-plugin/**`, `.cursor-plugin/**`, `.gemini-extension/**`, `.antigravity-extension/**`, `.codex-plugin/**` (persona agents `harness-*-reviewer.md`, commands `autopilot`, `code-review`, `pre-merge-brief`) | `pnpm generate:plugin:all` (also run by the pre-commit hook when `agents/skills/**` is staged)             | After any SKILL.md or skill.yaml change                   |
| `.harness/comprehension/**/_module.md` (25 shards at REF, all `semantic: absent`)                                                                                                                                  | `H comprehend --changed --static --stage --hook` (pre-commit hook; `comprehension.hook: true`)             | Every commit that changes TypeScript sources              |
| `docs/reference/cli-commands.md`, `docs/reference/mcp-tools.md`, `docs/reference/skills-catalog.md`                                                                                                                | `pnpm run generate-docs` (reads `packages/cli/dist`, so build first)                                       | After a CLI command, MCP tool or skill description change |
| `docs/reference/tool-catalog.md`                                                                                                                                                                                   | `pnpm run generate:tool-catalog`                                                                           | After an MCP tool change                                  |
| `packages/core/src/index.ts`, `packages/cli/src/commands/_registry.ts`, `packages/core/public-symbols.txt`                                                                                                         | `pnpm run generate:barrels` (`scripts/generate-barrel-exports.mjs` and `scripts/generate-core-barrel.mjs`) | After adding or removing a core export or a CLI command   |
| `docs/roadmap.md`                                                                                                                                                                                                  | `H roadmap regen` (pre-commit hook, when `docs/roadmap.d/` is staged)                                      | Unit 1                                                    |

At REF every comprehension shard is static (`semantic: absent`, no `compiledAt`). A static recompile of the same sources gives the same bytes, so the shards regenerate identically at unit 5. The `packages/cli/src/commands/skill/_module.md` shard drops from `semantic: present` to `absent` in unit 5, as it does at REF. That is the hook's known behaviour and is in REF as well.

### A.5 Per-unit commit shape

Each unit's cut is two commits:

1. `feat(receipts): unit N cut — <name>`: code, tests, skills and docs.
2. `chore: regenerate artifacts for unit N`: plugins, reference docs, barrels and shards. The hook may fold these into commit 1, which is also fine.

A third commit holds the unit's allowance file when one is needed (Part D).

---

## Part B: Excision catalog

### B.0 Forbidden terms (the cut-completeness check)

A unit's added text must not contain a term of a later unit. Each check runs on added lines only, so text that exists on `main` does not count. Excluded from the check: `docs/changes/**` (the spec and plans describe the whole design), generated directories, and `.harness/**`.

```bash
T2='--archive-round|round-R|priorRounds|ROUND_MISMATCH|PRIOR_ROUNDS_MISMATCH|fix round|archivedRounds|ArchivedRound'
T3='review-provenance|provenance stamp|\bstamp\b|decidedBy|dismiss|passed-with-dismissals|orphan|"kind": "gate"|kind: "gate"|ReviewDecisionRecord|AutopilotSessionState|AutopilotPhaseEntry|phases\[\]|reviewedHeadInHistory|headRule'
T4='pre-merge-brief|--pr\b|stampHeadNotice|renderParsedStamp|defaultPrReader|resolvePrNumber'
T5='review-attribution|attribution log|records attribution|record attribution|\bstamped\b|stamp-stale|stamp-incomplete|unstamped|not-measured|stampCoverage|main worktree|reviewLabelOfDir|STANDALONE_REVIEW_LABEL'
forbidden() { # $1 = the unit being checked; prints offending added lines (expect none)
  case $1 in 1) R="$T2|$T3|$T4|$T5";; 2) R="$T3|$T4|$T5";; 3) R="$T4|$T5";; 4) R="$T5";; 5) return 0;; esac
  git diff origin/main...HEAD -- . ':!docs/changes' ':!.harness' ':!.claude-plugin' ':!.cursor-plugin' \
    ':!.gemini-extension' ':!.antigravity-extension' ':!.codex-plugin' ':!docs/reference/cli-commands.md' \
    ':!docs/reference/mcp-tools.md' ':!docs/reference/skills-catalog.md' ':!docs/reference/tool-catalog.md' \
    | grep -E '^\+[^+]' | grep -nE -- "$R"
}
```

There are known allowed hits. Report each one in the gate output rather than removing it:

- the runtime message `the file is from another round` (review-gate.ts, a phrase about a findings file, not about the fix-round feature);
- the phrase `review rounds` in autopilot's "One fix budget" paragraph;
- for unit 4, `pre-merge-brief` and `--pr` in the four unit-4 skill copies and the template, which are that unit's own text (unit 4 is checked against T5 only).

### B.1 `packages/types/src/pipeline-receipts.ts`

```text
E-types-1 [U5]  find: review receipt, provenance and attribution contract
                replace: review receipt and provenance contract
E-types-2 [U3]  find: review receipt, provenance and attribution contract
                replace: review receipt contract
E-types-3 [U5]  find: the only form of a sha a receipt, a record or a stamp check carries.
                replace: the only form of a sha a receipt or a stamp check carries.
E-types-4 [U3]  find: the only form of a sha a receipt, a record or a stamp check carries.
                replace: the only form of a sha a receipt carries.
E-types-5 [U3]  find: " * reader writes and the stamp prints. Never a path."   replace: " * reader writes. Never a path."
E-types-6 [U2]  delete REF lines 47-54 (the ReviewPriorRound doc comment, interface, and blank line)
E-types-7 [U2]  delete REF lines 67-69 (round doc comment, `round?: number;`, `priorRounds?: ReviewPriorRound[];`)
E-types-8 [U2]  delete REF lines 85-89 (the ArchivedRound doc comment, type, and blank line)
E-types-9 [U2]  delete the two lines `  'ROUND_MISMATCH',` and `  'PRIOR_ROUNDS_MISMATCH',`
E-types-10 [U5] delete REF lines 140-221 (REVIEW_STAMP_STATES through `  | UnmeasuredReviewAttribution;` and the blank line after it)
E-types-11 [U3] delete REF lines 222-281 (REVIEW_DECISION_KINDS through the end of AutopilotSessionState; the file then ends after FINDING_CLASSES)
```

E-types-1/2 and 3/4 have the same `find`. Applying them in increasing unit order gives the right text at every unit (rule R2).

### B.2 `packages/types/src/index.ts` (only the block after `// --- Shift-left pipeline fidelity`)

Delete these single lines, each of which occurs once in that block:

- **[U5]** `  REVIEW_STAMP_STATES,` · `  ReviewStampState,` · `  ReviewRunAttribution,` · `  FindingAttribution,` · `  ReviewAttributionRecord,` · `  UnmeasuredReviewAttribution,` · `  ReviewAttributionContext,`
- **[U3]** `  REVIEW_DECISION_KINDS,` · `  REVIEW_DECIDERS,` · `  ReviewDecisionKind,` · `  ReviewDecisionRecord,` · `  AutopilotPhaseEntry,` · `  AutopilotSessionState,` · `  ReviewDecider,`
- **[U2]** `  ArchivedRound,` · `  ReviewPriorRound,`

### B.3 Core receipts (`packages/core/src/receipts/`)

**`schema.ts`**

```text
E-schema-1 [U2] delete line: const round = z.number().int().positive();
E-schema-2 [U2] delete line:   round: round.exactOptional(),
E-schema-3 [U2] delete line:   priorRounds: z.array(z.object({ round, head: sha, blocking: count })).exactOptional(),
E-schema-4 [U5] find: " * The one counting rule the receipt, the gate, the stamp and the attribution log share: every"
                replace: " * The one counting rule the receipt, the gate and the stamp share: every"
E-schema-5 [U3] same find   replace: " * The one counting rule the receipt and the gate share: every"
```

**`layout.ts`**

```text
E-layout-1 [U5] delete REF lines 19-26 (STANDALONE_REVIEW_LABEL doc comment, const, and blank line)
E-layout-2 [U5] delete REF lines 54-70 (reviewLabelOfDir doc comment, function, and blank line)
E-layout-3 [U3] delete REF lines 92-117 (blank line, reviewLabel, rank, compareReviewLabels)
```

**`load.ts`**

```text
E-load-1 [U2] find (2 lines):
  import type { ArchivedRound } from '@harness-engineering/types';
  import { parseReviewReceipt, pathEscapes } from './schema';
replace:
  import { pathEscapes } from './schema';
E-load-2 [U2] delete REF lines 108-166 (the blank line after reviewFindingsReaderFor through the end of archiveReviewRound)
```

**`review-gate.ts`**

```text
E-gate-1 [U2] delete line:   type ArchivedRound,
E-gate-2 [U5] find (2 lines):
   * writes four files passes. The stamp makes the claim visible; the standalone review measures
   * whether it held.
  replace:
   * writes four files passes. The stamp makes the claim visible.
E-gate-3 [U3] same find   replace:  " * writes four files passes."
E-gate-4 [U3] delete REF lines 75-79 (reviewedHeadInHistory doc comment and field)
E-gate-5 [U2] delete REF lines 91-95 (archivedRounds doc comment and field)
E-gate-6 [U2] delete REF lines 97-98 (blank line and `export type { ArchivedRound };`)
E-gate-7 [U3] delete REF lines 144-145 (the coverage doc comment and `coverage?:` field of CheckedReceiptResult)
E-gate-8 [U3] find:    if (context.head !== '' && (reviewed === context.head || context.reviewedHeadInHistory)) {
             replace: if (context.head !== '' && reviewed === context.head) {
E-gate-9 [U2] delete REF lines 249-288 (roundFailures, roundText, archivedText, priorRoundsFailure, trailing blank line)
E-gate-10 [U3] delete REF lines 548-564 (coverageOf and trailing blank line)
E-gate-11 [U2] delete line:     ...roundFailures(r, context),
E-gate-12 [U3] delete lines:   const coverage = coverageOf(r, check);   and   ...(coverage !== undefined && { coverage }),
```

**`index.ts`**

```text
E-index-1 [U5] find: export { reviewLabelOfDir, sessionDirOfReviewDir } from './layout';
               replace: export { sessionDirOfReviewDir } from './layout';
E-index-2 [U2] delete: export { archiveReviewRound, readArchivedRounds } from './load';
E-index-3 [U3] delete: export { AutopilotSessionStateSchema, ReviewDecisionRecordSchema } from './decisions';
E-index-4 [U3] delete: export { readSessionReviewState } from './decisions';
E-index-5 [U3] delete: export { NO_PIPELINE_REVIEW, PROVENANCE_MARKER } from './provenance';
E-index-6 [U3] delete: export { buildProvenanceRow, parseProvenanceStamp, renderParsedStamp } from './provenance';
E-index-7 [U4] find:   export { buildProvenanceRow, parseProvenanceStamp, renderParsedStamp } from './provenance';
               replace: export { buildProvenanceRow, parseProvenanceStamp } from './provenance';
E-index-8 [U3] delete: export { assembleStamp, renderProvenanceBlock, stampCoverage } from './provenance';
E-index-9 [U5] find:   export { assembleStamp, renderProvenanceBlock, stampCoverage } from './provenance';
               replace: export { assembleStamp, renderProvenanceBlock } from './provenance';
E-index-10 [U4] delete: export { stampHeadNotice } from './provenance';
E-index-11 [U3] delete: export type { ParsedProvenanceStamp, ReviewDirRead, StampRow } from './provenance';
E-index-12 [U3] delete: export { noteText } from './stamp-grammar';
E-index-13 [U5] delete REF lines 27-31 (the five attribution export lines)
```

**`provenance.ts`** (first appears in unit 3)

```text
E-prov-1 [U4] find:   import { FULL_SHA_PATTERN, type BlockingReceiptFinding } from './schema';
              replace: import type { BlockingReceiptFinding } from './schema';
E-prov-2 [U4] delete REF lines 484-505 (stampHeadNotice doc comment, StampHeadNotice type, function, blank line)
E-prov-3 [U5] delete REF lines 506-525 (StampCoverage type, stampCoverage doc comment and function, blank line)
E-prov-4 [U4] delete REF lines 599-604 (blank line, renderParsedStamp doc comment and function)
```

Unit 4 applies only E-prov-3. `FULL_SHA_PATTERN` stays imported there, because `stampHeadNotice` uses it.

`decisions.ts`, `stamp-grammar.ts` and `text.ts` are unit 3 in full. `attribution.ts` and `attribution-report.ts` are unit 5 in full. `backend.ts` is unit 1 in full.

### B.4 CLI (`packages/cli/src/`)

**`review-receipts/io.ts`**

```text
E-io-1 [U5] delete line: import * as fs from 'node:fs';
E-io-2 [U3] find (import block, 8 lines):
  import {
    finalReviewBase,
    readRegularFile,
    readSessionReviewState,
    resolveSessionDir,
    type FinalReviewBase,
    type Result,
  } from '@harness-engineering/core';
replace:
  import {
    FULL_SHA_PATTERN,
    finalReviewBase,
    readRegularFile,
    resolveSessionDir,
    type FinalReviewBase,
    type Result,
  } from '@harness-engineering/core';
E-io-3 [U5] delete REF lines 54-97 (sameDir, commonDir, mainWorktree, firstListedWorktree, and blank line)
E-io-4 [U5] delete the two lines of RepoRoots:
    /** The repository's main worktree, where the attribution log lives. undefined: there is none. */
    main: string | undefined;
E-io-5 [U5] find:   return { top, main: mainWorktree(git, cwd, top) };
            replace: return { top };
E-io-6 [U3] find (sessionStartingCommit body):
    if (sessionDir === undefined) return undefined;
    return readSessionReviewState(readSessionStateText(sessionDir)).startingCommit;
  replace:
    if (sessionDir === undefined) return undefined;
    let state: unknown;
    try {
      state = JSON.parse(readSessionStateText(sessionDir) ?? '');
    } catch {
      return undefined;
    }
    const start =
      state !== null && typeof state === 'object' && !Array.isArray(state)
        ? (state as { startingCommit?: unknown }).startingCommit
        : undefined;
    return typeof start === 'string' && FULL_SHA_PATTERN.test(start) ? start : undefined;
E-io-7 [U4] delete REF lines 166-225 (the blank line before `const PR_NUMBER` through the end of defaultPrReader)
```

The `resolveRepoRoots` doc comment says "the same answer from the root, a subdirectory and a linked worktree". It stays true for `top`.

**`review-receipts/gate.ts`**

```text
E-cgate-1 [U2] delete lines:   archiveReviewRound,   and   readArchivedRounds,   (in the core import)
E-cgate-2 [U2] find:   export { REVIEW_MOMENTS, archiveReviewRound };   replace: export { REVIEW_MOMENTS };
E-cgate-3 [U3] delete REF lines 36-41 (headRule doc comment and field)
E-cgate-4 [U3] replace REF lines 78-89 (currentHead doc comment and function) with:
  /** HEAD, resolved by git; empty when it cannot be resolved. */
  function currentHead(git: CwdGit, cwd: string): Pick<ReviewGateContext, 'head'> {
    return { head: tryGit(git, ['rev-parse', 'HEAD'], cwd) ?? '' };
  }
E-cgate-5 [U3] find: function recompute(git: CwdGit, raw: unknown, cwd: string, rule: 'equal' | 'ancestor'): Recomputed {
               replace: function recompute(git: CwdGit, raw: unknown, cwd: string): Recomputed {
E-cgate-6 [U3] find:     ...currentHead(git, head, cwd, rule),        replace:     ...currentHead(git, cwd),
E-cgate-7 [U3] find:   const { cwd = process.cwd(), git = runGitIn, headRule = 'equal' } = opts;
               replace: const { cwd = process.cwd(), git = runGitIn } = opts;
E-cgate-8 [U3] find:     ...recompute(git, read.raw, cwd, headRule),  replace:     ...recompute(git, read.raw, cwd),
E-cgate-9 [U2] delete line:     archivedRounds: readArchivedRounds(read.dir),
```

**`commands/check-review-receipt.ts`**

```text
E-crr-1 [U2] delete line: import * as path from 'node:path';
E-crr-2 [U2] delete line:   archiveReviewRound,
E-crr-3 [U2] delete line:   archiveRound?: string;
E-crr-4 [U2] delete REF lines 66-86 (runArchiveRound doc comment, function, and blank line)
E-crr-5 [U2] delete REF lines 95-99 (the `.option('--archive-round <review-dir>', …)` call)
E-crr-6 [U2] delete line:       const cwd = deps.cwd?.() ?? process.cwd();
E-crr-7 [U2] find:       const modes = [receiptPath, opts.archiveRound, opts.findings].filter((m) => m !== undefined);
             replace:       const modes = [receiptPath, opts.findings].filter((m) => m !== undefined);
E-crr-8 [U2] find:         logger.error('give exactly one of: a receipt path, --archive-round, or --findings');
             replace:         logger.error('give exactly one of: a receipt path or --findings');
E-crr-9 [U2] delete line:       if (opts.archiveRound !== undefined) return runArchiveRound(opts.archiveRound, cwd, json);
```

**`scripts/generate-core-barrel.mjs`** (`DIR_COMMENTS.receipts`; the generated core `index.ts` comment follows it)

```text
E-barrel-1 [U5] find: 'Pipeline receipts — typed review receipts, the credential-free gate that recomputes them, the provenance stamp, and the stage-attribution log (shift-left pipeline fidelity).',
                replace: 'Pipeline receipts — typed review receipts, the credential-free gate that recomputes them, and the provenance stamp (shift-left pipeline fidelity).',
E-barrel-2 [U3] same find   replace: 'Pipeline receipts — typed review receipts and the credential-free gate that recomputes them (shift-left pipeline fidelity).',
```

### B.5 Shared test files (REF line ranges; delete bottom-up)

| File                                                              | Entry                                                           | Unit | REF lines / edit                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------- | --------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/tests/receipts/review-gate-round2.test.ts`         | coverage describe `fix 12: …`                                   | U3   | delete 213-230 (the blank line above it, the describe)                                                                                                                                                                                                                                                  |
| same                                                              | rounds describe `fix 13: …`                                     | U2   | delete 231-247 (the blank line above it, the describe, to end of file)                                                                                                                                                                                                                                  |
| `packages/core/tests/receipts/review-gate-round3.test.ts`         | `the reviewed head against HEAD`                                | U3   | replace 175-201 (the doc comment and describe) with the block below                                                                                                                                                                                                                                     |
| `packages/core/tests/receipts/schema-types.test.ts`               | `ReviewAttributionRecordSchema is …`                            | U5   | delete 43-62; delete import lines `  ReviewAttributionRecord,` and `import type { ReviewAttributionRecordSchema } from '../../src/receipts/attribution';`                                                                                                                                               |
| same                                                              | `AutopilotSessionStateSchema …`, `ReviewDecisionRecordSchema …` | U3   | delete 63-79; delete imports `AutopilotPhaseEntry`, `AutopilotSessionState`, `ReviewDecider`, `ReviewDecisionRecord` and the `../../src/receipts/decisions` import (lines 14-17)                                                                                                                        |
| `packages/core/tests/receipts/layout.test.ts`                     | the four `its` using `reviewLabel` and `compareReviewLabels`    | U3   | delete 13-36 (keep 10-12 `names the receipt file` and the describe's closing `});` at 37); delete imports `  compareReviewLabels,` and `  reviewLabel,`                                                                                                                                                 |
| `packages/core/tests/receipts/round4-stamp-inert.test.ts`         | STANDALONE describe                                             | U5   | delete 41-63 (through the line before `const TAGGED`); delete import `  STANDALONE_REVIEW_LABEL,`                                                                                                                                                                                                       |
| same                                                              | `TAGGED`, `inert / isInert` and `renderer and parser agree`     | U3   | delete 64-146 (from `const TAGGED` to end of file); delete import lines 7-8                                                                                                                                                                                                                             |
| `packages/core/tests/receipts/public-surface.test.ts`             | `it.each` names                                                 | U5   | delete lines 20-25 (`buildUnmeasuredRecord` … `renderReviewAttributionReport`)                                                                                                                                                                                                                          |
| same                                                              | `it.each` name                                                  | U4   | delete line 19 `'renderParsedStamp',`                                                                                                                                                                                                                                                                   |
| same                                                              | `it.each` names and the marker `it`                             | U3   | delete lines 8, 13, 16, 17, 18 (`noteText`, `readSessionReviewState`, `buildProvenanceRow`, `renderProvenanceBlock`, `parseProvenanceStamp`) and 29-32 (`exports the marker`). Keep the internal-helper list whole: names the module lacks pass `not.toHaveProperty`                                    |
| `packages/types/tests/pipeline-receipts.test.ts`                  | stamp states                                                    | U5   | delete import `  REVIEW_STAMP_STATES,`, the expect of 23-30, and replace 53-88 with the `types a receipt` block below; import becomes `import type { ReviewReceipt } from '../src/index';`                                                                                                              |
| same                                                              | decision kinds                                                  | U3   | delete import `  REVIEW_DECISION_KINDS,` and line 31 (its expect)                                                                                                                                                                                                                                       |
| `packages/cli/tests/review-receipts/io.test.ts`                   | `resolveRepoRoots` describe                                     | U5   | delete from line 75 (the doc comment above `describe('resolveRepoRoots'`) through the `});` that closes that describe, which is the line before the doc comment of `describe('sessionDirFrom'`; delete import `  resolveRepoRoots,`                                                                     |
| same                                                              | `defaultPrReader` describe                                      | U4   | delete 23-74 (the describe and the blank line after it); delete import `  defaultPrReader,`. Keep the `gh` mock and `argsOf`: harmless, and tests are not linted                                                                                                                                        |
| `packages/cli/tests/commands/review-receipt-registration.test.ts` | command list                                                    | U5   | find `it.each(['check-review-receipt', 'review-provenance', 'review-attribution'])(` → `it.each(['check-review-receipt', 'review-provenance'])(`                                                                                                                                                        |
| same                                                              | command list                                                    | U3   | same find → `it.each(['check-review-receipt'])(`                                                                                                                                                                                                                                                        |
| `packages/cli/tests/commands/round4-final-base.test.ts`           | stamp `it`                                                      | U3   | delete 119-126; delete import line 8 (`runReviewProvenanceRender`)                                                                                                                                                                                                                                      |
| `packages/cli/tests/commands/round4-robustness.test.ts`           | bounded state read describe (uses the stamp)                    | U3   | delete 39-63; delete import line 7 (`runReviewProvenanceRender`)                                                                                                                                                                                                                                        |
| `agents/skills/tests/review-json-examples.test.ts`                | decision and session-state tests                                | U3   | delete the two `it` blocks at 91-113, and from `describe('the session-state example in INIT …')` (line 116) to the end of the file; trim the core import to `parseReviewReceipt, parseReviewerFindingsFile`. Keep `isDecision`: no decision example exists before unit 3, and the predicate is harmless |

Replacement block for `review-gate-round3.test.ts` (units 1 and 2):

```ts
/** The head rule, decided in core: HEAD {the reviewed head, another commit, unresolved}. */
describe('the reviewed head against HEAD', () => {
  it.each([
    [HEAD, []],
    [OTHER, ['HEAD_MISMATCH']],
    ['', ['HEAD_MISMATCH']],
  ])('HEAD %s -> %j', (head, expected) => {
    expect(codes(validateReviewReceipt(receipt(), ctx({ head })))).toEqual(expected);
  });
});
```

Replacement `it` for `pipeline-receipts.test.ts` (units 1 to 4):

```ts
it('types a receipt', () => {
  const receipt: ReviewReceipt = {
    schemaVersion: 1,
    moment: 'final',
    tier: 'full',
    backend: 'agent',
    diff: { base: 'a'.repeat(40), head: 'b'.repeat(40) },
    coldContext: true,
    priorFindingsSupplied: false,
    reviewers: [{ id: 'bug', required: true, ran: true, findingsPath: 'bug.json' }],
    blocking: 0,
    advisory: 0,
  };
  expect(receipt.reviewers.map((r) => r.id)).toEqual(['bug']);
});
```

**The skills tests** (`agents/skills/tests/autopilot-review-fidelity.test.ts`, `code-review-receipts.test.ts`) follow rule R13. In unit N, remove every `expect` whose argument or matcher text matches a later unit's term (B.0 regex). Remove an `it` only when no `expect` is left, and remove a `describe` only when no `it` is left. The table below lists the `it` blocks at REF that hold such assertions, by start line and the highest unit they touch. A `+1` marks a block that also holds unit-1 assertions, which must stay.

| File                      | Blocks touching U2                  | U3                                                                                                                                                    | U4                 | U5                                                                                         |
| ------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------ |
| autopilot-review-fidelity | 500, 529, 756, 1110                 | 159, 173, 312(+1), 379, 398, 409(+1), 542, 558, 625(+1), 645(+1), 674, 697(+1), 709, 723, 733, 745, 785, 820, 833(+1), 860(+1), 948, 1004, 1082, 1095 | —                  | 115(+1), 126, 212(+1), 350, 365(+1), 575(+1), 808, 846(+1), 1124                           |
| code-review-receipts      | 354(+1), 366(+1), 649(+1), 974, 986 | 509(+1), 529(+1), 750, 786                                                                                                                            | 515, 857, 870, 877 | 244, 256, 271, 276(+1), 386(+1), 448, 458, 480, 496(+1), 710, 719, 765, 781, 820(+1), 1000 |

The table is a term-based starting list. The test run decides: a unit is cut correctly when its skills tests pass against its own SKILL.md, and B.0 reports nothing.

### B.6 Skill prose: exact entries

**`agents/skills/claude-code/harness-autopilot/SKILL.md`** (all `find` text is REF; "every occurrence" where marked)

```text
A-1 [U3] find: Write `autopilot-state.json` (schemaVersion: 5, currentState: "ASSESS", currentPhase: 0) with one `phases[]` entry per phase, in spec order, in the shape "Session state" below gives.
         replace: Write `autopilot-state.json` (schemaVersion: 5, currentState: "ASSESS", currentPhase: 0).
A-2 [U3] delete the span from the line starting `**Session state.** This is the part of` through the bullet ending `An entry with no `index` is read by its position.`, and the blank line after it.
A-3 [U5] find: writes `receipt.json`, runs the gate and records attribution;   replace: writes `receipt.json` and runs the gate;
A-4 [U5] delete: " The attribution log leaves such a finding out when it is recorded after the dismissal (REVIEW step 7) and logs only how many were left out."
A-5 [U3] find: , so the receipt and the stamp can show a blocking finding that the validated list no longer holds; a `dismissed` decision (below) is what explains the difference.
         replace: , so the receipt can show a blocking finding that the validated list no longer holds.
A-6 [U5] find: and the gate, the stamp's Blocking column and the attribution log never read it.
         replace: and the gate and the stamp's Blocking column never read it.
A-7 [U3] same find   replace: and the gate never reads it.
A-8 [U3] find: ; on the PR it appears only if it was overridden, as the `findings` decision in the stamp's Override column, so name the hook and its findings in that decision's `rationale`.
         replace: .
A-9 [U3] delete: " The stamp keeps the earlier totals in its Blocking column (`0; round 2; round 1: 3 blocking`)."
A-10 [U3] delete: " A decision of an earlier round therefore never applies to the new receipt: it carries the earlier round's number."
A-11 [U3] delete: " A review decision taken in round `R` carries `"round": R` (Decision records, below)."
A-12 [U2] replace the whole "Fix rounds" span, from the line starting `**Fix rounds.** A review that runs again` through the paragraph starting `` `{base}` stays the same between the rounds of a phase review.`` (inclusive), with:
  **After a fix.** A review that runs again for the same phase, or again as the final review, after a fix commit runs at the new head. Dispatch **every** required reviewer again with the same briefs, carrying no finding from the review before; a reviewer whose findings were all fixed still runs. Each reviewer rewrites its findings file and this session rewrites `receipt.json`. No file of the review before is reused: its `head` is the old commit, and the gate fails it (`FINDINGS_HEAD_MISMATCH`). `{base}` stays the same for a phase review. For the final review, resolve it again (FINAL_REVIEW step 2): it is the merge base every time, so a review after a fix reads the whole change again and never the fix alone.
A-13 [U4] find: A stamp is read back out of a PR body (by `harness pre-merge-brief` and by `harness review-attribution record`) only when the marker pair opens with the heading `### Review provenance` and sits outside HTML comments. A marker pair without the heading is not a stamp, and rows inside a comment are not read. Place the command's output in the body as printed.
         replace: Place the command's output in the body as printed.
A-14 [U5] find: (by `harness pre-merge-brief` and by `harness review-attribution record`)   replace: (by `harness pre-merge-brief`)
A-15 [U3] replace the span from the line starting `**Decision records.**` through the line ending `Place the command's output in the body as printed.` (the end of the stamp read-back paragraph), with:
  **Overrides.** A review state left over a failed receipt gate, or over blocking findings, records the human's decision in `decisions[]`: the state (`REVIEW` or `FINAL_REVIEW`), for `REVIEW` the phase (its 0-based position, the `N` of `phase-N`), what was overridden (every failure code the gate raised, or the blocking findings), and the human's rationale. A gate or findings override is always the human's: both are `gate` pauses and never auto-resolve.
A-16 [U3] find: , is therefore inside the next phase's diff, and the stamp compares the base in the same way and shows any other base as a gap.
          replace: , is therefore inside the next phase's diff.
A-17 [U2] find: In a fix round the base stays and `{head}` is the new HEAD.   replace: After a fix the base stays and `{head}` is the new HEAD.
A-18 [U2] find: If it already holds a `receipt.json`, the round that receipt records has ended and this review is a fix round: archive it as Review records, Fix rounds, says before dispatching. The round of this review is 1 + the `round-R/` archives in the directory.
          replace: If it already holds a `receipt.json`, this review runs after a fix and rewrites it (Review records, After a fix).
A-19 [U5] find: Write no receipt.json, run no receipt gate and record no attribution: the dispatching session does.
          replace: Write no receipt.json and run no receipt gate: the dispatching session does.
A-20 [U5] find: , do not run `review-attribution record`, and record no   replace: , and record no
A-21 [U3] find: In every case write no `receipt.json`, do not run `harness check-review-receipt`, do not run `review-attribution record`, and record no `kind: "gate"` decision: there is no gate failure to override
          replace: In every case write no `receipt.json` and do not run `harness check-review-receipt`: there is no gate failure to override
A-22 [U2] delete: " No receipt was written for this attempt, so it is not a round: the review that follows keeps this attempt's round number (1 + the `round-R/` archives; Review records, Fix rounds) and archives nothing first."
A-23 [U3] find: `stop`: save state and exit; the stamp then shows this review as a row whose Gate cell reads `receipt missing`.
          replace: `stop`: save state and exit.
A-24 [U3] delete: " Note the id of every `critical` or `important` finding they discard, downgrade or drop: each is a proposed dismissal, settled in step 7 before REVIEW is left (Review records)."
A-25 [U2] delete: " When the directory holds any `round-R/` archive, the receipt also carries `round` and `priorRounds`, which the gate checks against the archives (Review records, Fix rounds)."
A-26 [U2] delete: " a `round` or `priorRounds` that does not match the `round-R/` archives (`ROUND_MISMATCH`, `PRIOR_ROUNDS_MISMATCH`),"
A-27 [U5] delete: " When the gate passes, attribution is recorded in step 7, after the dismissals are settled, and only then."
A-28 [U5] delete: " When the gate passes, attribution is recorded in step 4, after the dismissals are settled, and only then."
A-29 [U2] every occurrence (2): find: runs again as a fix round (Review records).   replace: runs again at the new head (Review records, After a fix).
A-30 [U5] every occurrence (2): delete: " An overridden gate records nothing in the attribution log: do not run `review-attribution record` for it."
A-31 [U3] find: `override`: record a `kind: "gate"` decision for this phase in `decisions[]`, in the shape Review records gives, with the receipt's `round`, `decidedBy: "human"` (a gate pause never auto-resolves) and `codes` listing every failure code the gate raised; the provenance stamp shows the failed gate as overridden only while every code it fails with is listed.
          replace: `override`: record the override in `decisions[]` (Review records, Overrides) with every failure code the gate raised.
A-32 [U3] find: `override`: record a `kind: "gate"` decision with `state: "FINAL_REVIEW"`, the receipt's `round` and `decidedBy: "human"` in `decisions[]`, in the shape Review records gives, with `codes` listing every failure code the gate raised; the provenance stamp shows the failed gate as overridden only while every code it fails with is listed.
          replace: `override`: record the override in `decisions[]` (Review records, Overrides) with every failure code the gate raised.
A-33 [U5] find: **7. Settle dismissals, then record attribution.**   replace: **7. Settle dismissals.**
A-34 [U5] delete, in REVIEW step 7, the text from " Then, when the gate of step 6 passed" through "A failed append (an I/O error) is logged and never fails the review." (inclusive).
A-35 [U3] delete REVIEW step 7 whole: the `_Pause point (judgment): …_ <!-- pause: judgment -->` line directly above it, the paragraph starting `**7. Settle dismissals`, and the blank line after it.
A-36 [U3] find: **8. Decide on the blocking findings** that remain: the validated reviewer findings that were not dismissed, plus the blocking hook findings of step 5.
          replace: **7. Decide on the blocking findings** that remain: the validated reviewer findings, plus the blocking hook findings of step 5.
A-37 [U2] find: `fix`: re-enter EXECUTE; the review that follows is a fix round (Review records).
          replace: `fix`: re-enter EXECUTE; the review that follows runs at the new head (Review records, After a fix).
A-38 [U3] find: `override`: record a `kind: "findings"` decision for this phase in `decisions[]`, in the shape Review records gives, with the receipt's `round` and `decidedBy: "human"` → PHASE_COMPLETE. REVIEW is never left with a blocking finding of a reviewer file that was neither sent to fix, nor covered by that override, nor dismissed in step 7.
          replace: `override`: record the override in `decisions[]` (Review records, Overrides) → PHASE_COMPLETE. REVIEW is never left with a blocking finding of a reviewer file that was neither sent to fix nor covered by that override.
A-39 [U2] find: In a fix round run the command again at the new head; the base is the merge base again.
          replace: After a fix run the command again at the new head; the base is the merge base again.
A-40 [U3] find: and the gate, the hooks and the dismissals of the final review are written out below.
          replace: and the gate and the hooks of the final review are written out below.
A-41 [U2] find: the review directory is `{sessionDir}/reviews/final-all/`, and when it already holds a `receipt.json` this is a fix round: archive it first (Review records, Fix rounds);
          replace: the review directory is `{sessionDir}/reviews/final-all/`; when it already holds a `receipt.json`, this review runs after a fix and rewrites it (Review records, After a fix);
A-42 [U5] find: 4. Settle dismissals, record attribution, then set the status.   replace: 4. Settle dismissals, then set the status.
A-43 [U5] delete: " When the gate of step 3 passed (never for a failed or overridden gate), record attribution now: `harness review-attribution record --receipt {sessionDir}/reviews/final-all`, which leaves out the findings those dismissals name, as REVIEW step 7 describes."
A-44 [U3] replace FINAL_REVIEW step 4 whole (the `_Pause point (judgment): …_` line above it, and from `4. Settle dismissals, record attribution, then set the status.` through `   Either way → OUTCOME_EVAL.`) with:
  4. No blocking (across baseline + additional reviewers): store the findings in `finalReview.findings`, set `finalReview.status: "passed"` → OUTCOME_EVAL.
A-45 [U2] find: Re-run FINAL_REVIEW from step 1, as a new round at the new head (Review records, Fix rounds): every reviewer runs again and the receipt records `round` and `priorRounds`.
          replace: Re-run FINAL_REVIEW from step 1 at the new head (Review records, After a fix): every reviewer runs again.
A-46 [U3] find: `override`: record a `kind: "findings"` decision with `state: "FINAL_REVIEW"`, the receipt's `round` and `decidedBy: "human"` in `decisions[]`, in the shape Review records gives. Set `"overridden"` → OUTCOME_EVAL. The findings dismissed in step 4 keep their own `dismissed` records.
          replace: `override`: record the override in `decisions[]` (Review records, Overrides). Set `"overridden"` → OUTCOME_EVAL.
A-47 [U3] find: , and it is never a reason to dismiss a finding: a dismissal goes through step 4 on the finding's merits.   replace: .
A-48 [U3] find: , and the stamp's `final-all` row then ends `, +N commits not reviewed` whatever its gate result (`pass at <sha>, +N commits not reviewed`, `FAIL: <codes>, +N commits not reviewed`, `FAIL: <codes> (overridden), +N commits not reviewed`), never a bare result.
          replace: .
A-49 [U2] find: run the final review again as a new round before   replace: run the final review again at the new head before
A-50 [U2] find: return to FINAL_REVIEW step 1 (a new round at the new head)   replace: return to FINAL_REVIEW step 1 (a review at the new head)
A-51 [U3] find: `finalReview.status` (`passed`, `passed-with-dismissals` or `overridden`) + findings count, every override and, beside the overrides, every dismissal (the `gate`, `findings` and `dismissed` decisions of each phase review and of the final review, with finding ids, reasons and rounds),
          replace: `finalReview.status` (`passed` or `overridden`) + findings count, every override (the override decisions of each phase review and of the final review, with their reasons),
A-52 [U3] find: `ship unreviewed`: record the choice in `decisions[]` (state `DONE`, with no review `kind`: a `kind` under that state would be an orphan decision on the stamp) and go on; the stamp's final row will end `, +N commits not reviewed` after its gate result, whether that result is a pass, a failure or an overridden failure, and that text stays in the PR body.
          replace: `ship unreviewed`: record the choice in `decisions[]` (state `DONE`) and go on, and name the unreviewed commits in the PR body.
A-53 [U3] find: If any of that is committed to the PR branch after the body was written, the stamp in the body no longer describes the head: render it again and report its new final row to the human.
          replace: If any of that is committed to the PR branch, it is a commit no final review read: report it to the human.
A-54 [U3] delete the DONE step 4 bullet starting `   - **Provenance stamp.** Before writing the PR body,` (one line).
A-55 [U5] delete: " record attribution after a passing gate,"
A-56 [U3] find: gate the receipt, settle proposed dismissals (a `judgment` decision, never this session's alone: the human's, or taken after a self-audit that ran and agreed), record attribution after a passing gate, fix blocking findings (a fix is followed by a new review round), record every override and dismissal as a typed decision with its round.
          replace: gate the receipt, fix blocking findings (a fix is followed by a review at the new head), record every override in `decisions[]`.
A-57 [U3] find: offer PR creation with the provenance stamp in the body,   replace: offer PR creation,
A-58 [U3] find: (a phase's position is its number in review directories and decision records)   replace: (a phase's position is its number in review directories)
A-59 [U3] find: , or the stamp says `+N commits not reviewed`   replace: (empty)
A-60 [U3] delete the Success Criteria bullet starting `- Every review override and every dismissed blocking finding is a typed decision record`.
A-61 [U3] find: - A phase is named by its 0-based position in `phases[]` everywhere: `index`, `currentPhase`, `reviews/phase-N/` and a decision's `phase`
          replace: - A phase is named by its 0-based position everywhere: `currentPhase` and `reviews/phase-N/`
A-62 [U3] delete: " VALIDATE proposed one blocking finding for dismissal, the human agreed, and it is recorded as a `dismissed` decision with `"phase": 1` and `"round": 1`."
```

**`agents/skills/claude-code/harness-code-review/SKILL.md`**

```text
C-1 [U5] find: Write no `receipt.json`, do not run the receipt gate and do not run `harness review-attribution record`; the dispatching session does all three. Otherwise this run owns the review: it writes its own receipt, gates it and records attribution (see Review Receipt).
         replace: Write no `receipt.json` and do not run the receipt gate; the dispatching session does both. Otherwise this run owns the review: it writes its own receipt and gates it (see Review Receipt).
C-2 [U5] find: writes the receipt, gates it and records attribution; a run given none   replace: writes the receipt and gates it; a run given none
C-3 [U3] find: in the session's `phases[]` list, the same number a review decision record carries as `phase`:   replace: :
C-4 [U3] delete: " The provenance stamp prints the earlier totals."
C-5 [U2] delete the Review Receipt bullet starting `` - `round` and `priorRounds` are set only when the review ran again after a fix:`` (one line)
C-6 [U2] delete the two gate-table rows `` | `ROUND_MISMATCH` `` and `` | `PRIOR_ROUNDS_MISMATCH` `` (prettier re-pads the table)
C-7 [U2] delete: " It checks `round` and `priorRounds` only against the `round-R/` archives, which this session wrote."
C-8 [U5] delete the span from the line starting `**Record attribution.** One rule:` through the paragraph starting `**Known over-counts.**` (inclusive), and the blank line after it
C-9 [U2] delete: " a `round` or `priorRounds` that does not match the `round-R/` archives,"
C-10 [U2] find: Two more modes: `--archive-round <review directory>` archives an ended round before a fix round, and `--findings <file> --base <sha> --head <sha>` is a reviewer's self-check of its own findings file.
          replace: One more mode: `--findings <file> --base <sha> --head <sha>` is a reviewer's self-check of its own findings file.
C-11 [U5] delete the Harness Integration bullet starting `` - **`harness review-attribution record`** `` (one line)
```

**`skill.yaml` files**

```text
Y-1 [U5] harness-code-review/skill.yaml  find:   # a receipt and one findings file per reviewer, and the attribution log.
                                         replace:   # a receipt and one findings file per reviewer.
Y-2 [U5] harness-code-review/skill.yaml  delete line:     - .harness/metrics/review-attribution.jsonl
Y-3 [U5] harness-code-review/skill.yaml  find (review-dir description, line 56): the dispatching session writes the receipt, gates it and records attribution
         replace: the dispatching session writes the receipt and gates it
Y-4 [U5] harness-autopilot/skill.yaml    replace the 4-line comment above `files:` with:
  # What the skill writes. `harness skill run` also reads this list: it loads the first entry that
  # exists as a literal path as prior state. A pattern with `*` never loads.
Y-5 [U5] harness-autopilot/skill.yaml    delete line:     - .harness/metrics/review-attribution.jsonl
```

### B.7 Other shared prose (section-level assignment; B.0 settles sentences)

| File                                                 | Unit 1 version holds                                                                                                                                                                                                                                                                                                                                        | Later units add                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md` ("Review receipts and tiers")            | intro paragraph; **Tiers**; **The final review is cold and full** without its dismissal sentences; **The gate** without the round clause; **What the gate does not prove** without the stamp, phase-list, decidedBy and round-archive clauses; **Artifacts** without the `phases[]` sentence; **Backend**; the Concepts and Spec links (not the Guide link) | U2: **Fix rounds** bullet and the round clauses. U3: the dismissal sentences, **Provenance stamp** bullet (without its `pre-merge-brief` sentence), the `phases[]`, decidedBy and stamp clauses, the Guide link. U4: the `pre-merge-brief` sentence of the stamp bullet. U5: **Attribution** bullet, and "records attribution" in **Tiers** |
| `docs/knowledge/decisions/0139-…md`                  | Context; D3; D4 without the round and stamp paragraphs; D7; Consequences and Alternatives without stamp or attribution items                                                                                                                                                                                                                                | U2: round checks. U3: stamp consequences. U5: attribution consequences                                                                                                                                                                                                                                                                      |
| `docs/knowledge/decisions/0140-…md`                  | Context; Cold; Full; Enforced; "One commit, one final review" without its stamp sentence; Consequences and Alternatives for those                                                                                                                                                                                                                           | U2: round sentences. U3: "Passed means nothing was set aside" and the stamp sentence                                                                                                                                                                                                                                                        |
| `docs/knowledge/core/review-receipts.md`             | Concepts for receipt, findings file, gate, tier, backend, moment, base; Relationships and Layout without decisions, stamp and log; Limits for the gate; Source lists unit-1 files only                                                                                                                                                                      | U2: round concepts and archive layout. U3: stamp, decisions, session-state concepts and sources. U4: PR-body reading. U5: attribution log, runs and stamp states, and their sources                                                                                                                                                         |
| `docs/guides/review-provenance.md`                   | (absent)                                                                                                                                                                                                                                                                                                                                                    | U3: the whole guide except "Measuring the leak" and `pre-merge-brief` mentions. U4: `pre-merge-brief` mentions. U5: "Measuring the leak"                                                                                                                                                                                                    |
| `docs/guides/index.md`, `docs/.vitepress/config.mts` | (absent)                                                                                                                                                                                                                                                                                                                                                    | U3: the guide entry, without its `review-attribution report` bullet. U5: that bullet                                                                                                                                                                                                                                                        |
| `docs/reference/configuration.md`                    | the `backend` row and example without ` See [Review Provenance](../guides/review-provenance.md).`; the craft paragraph                                                                                                                                                                                                                                      | U3: that link sentence                                                                                                                                                                                                                                                                                                                      |
| `.changeset/*`                                       | Part C, task U1.10                                                                                                                                                                                                                                                                                                                                          | one new file per unit (tasks U2.4, U3.6, U4.4, U5.5)                                                                                                                                                                                                                                                                                        |

A unit's version must not link to a file the unit lacks. `H validate` and `H check-docs` catch this.

---

## Part C: Units

Every unit's gate is the same command list. Paste it into a script `$WT/../recut-gate.sh` once; it is outside the repository and is never committed.

```bash
#!/bin/sh
# usage: recut-gate.sh <unit number>; run from $WT
set -e
. ~/.nvm/nvm.sh >/dev/null; nvm use 22 >/dev/null
# Paste the B.0 block (T2..T5 and forbidden()) here, verbatim.
pnpm turbo run build --filter=@harness-engineering/cli... --force
pnpm run generate:barrels:check
pnpm turbo run typecheck lint --filter=@harness-engineering/types --filter=@harness-engineering/core --filter=@harness-engineering/cli
pnpm --filter @harness-engineering/types test
pnpm --filter @harness-engineering/core test
pnpm --filter @harness-engineering/cli test
pnpm --filter @harness-engineering/skills exec vitest run
pnpm run test:root
pnpm run generate-docs --check
pnpm run generate:tool-catalog:check
pnpm run generate:plugin:check
pnpm run check:changesets
git diff --name-only --diff-filter=ACMR origin/main...HEAD | grep -E '\.(ts|tsx|md|json)$' | xargs pnpm exec prettier --check
H="node packages/cli/dist/bin/harness.js"
$H validate --json > /tmp/recut-validate-u$1.json || true
$H ci check --json --skip arch,traceability > /tmp/recut-ci-u$1.json || true
$H check-arch --json > /tmp/recut-arch-u$1.json || true
echo "forbidden-term hits (expect only the B.0 allow-list):"; forbidden $1 || true
```

`validate`, `ci check` and `check-arch` exit 1 on a clean `main` (about 497 validate issues and 9 complexity threshold violations), so the gate compares their output with `origin/main`'s. Task U1.1 records that baseline once. A unit passes when its output has no issue that the baseline lacks, apart from a module-size regression covered by the unit's allowance (Part D).

### Unit 1: Gate core

**Branch:** `feat/review-fidelity-u1-gate-core` from `origin/main` | **PR base:** `main` | **Owns:** `packages/core/src/receipts/**`, `packages/core/src/review/**`, `packages/cli/src/review-receipts/**`, `packages/cli/src/mcp/**`, `packages/types/src/pipeline-receipts.ts`

#### Task U1.1: Worktree, branch and baselines

**Depends on:** none | **Files:** none in the repository

1. `cd $REPO && git fetch origin && git worktree add -b $U1 $WT origin/main`
2. `cd $WT && source ~/.nvm/nvm.sh && nvm use 22 && pnpm install --frozen-lockfile`. If `@tailwindcss/oxide` bindings are missing, run `pnpm install --force` **under Node 22**.
3. `pnpm turbo run build --force`
4. Baselines: `node packages/cli/dist/bin/harness.js validate --json > /tmp/recut-validate-main.json || true`, the same for `ci check --json --skip arch,traceability` (into `/tmp/recut-ci-main.json`) and `check-arch --json` (into `/tmp/recut-arch-main.json`). Expected: check-arch module-size 294,695, coupling 469, dependency depth 693, complexity 283, 9 threshold violations.
5. Write `$WT/../recut-gate.sh` (Part C, with the B.0 block pasted in). To run `forbidden N` on its own, source the B.0 block in the shell you are using.

#### Task U1.2: Unit-1-only files, verbatim from REF

**Depends on:** U1.1 | **Files:** the 24 paths below

```bash
git checkout $REF -- .gitignore .harness/.gitignore \
  agents/skills/claude-code/harness-code-review/references/attribution-rubric.md \
  docs/changes/shift-left-pipeline-fidelity/SKILLS.md \
  docs/changes/shift-left-pipeline-fidelity/plans/2026-11-20-review-fidelity-and-attribution-plan.md \
  docs/changes/shift-left-pipeline-fidelity/proposal.md \
  docs/guides/developer-quickstart.md docs/guides/qa-quickstart.md docs/guides/security-quickstart.md \
  docs/roadmap.d/shift-left-pipeline-fidelity.md \
  packages/cli/src/commands/review-tier.ts packages/cli/src/commands/setup-mcp.ts \
  packages/cli/src/config/schema.ts packages/cli/src/mcp/server.ts \
  packages/cli/src/mcp/tool-capability-declarations.ts packages/cli/src/mcp/tool-tiers.ts \
  packages/cli/src/mcp/tools/review-receipt.ts \
  packages/core/src/receipts/backend.ts \
  packages/core/src/review/depth-calibrator.ts packages/core/src/review/index.ts \
  packages/core/src/review/tier-selector.ts packages/core/src/review/types/fan-out.ts \
  packages/core/tsconfig.type-tests.json
git checkout feat/shift-left-pipeline-fidelity -- \
  docs/changes/shift-left-pipeline-fidelity/plans/2026-11-24-stacked-units-recut-plan.md
```

#### Task U1.3: Types

**Depends on:** U1.2 | **Files:** `packages/types/src/pipeline-receipts.ts`, `packages/types/src/index.ts`

1. Build unit 1's version of both files (A.3): apply B.1 entries U2, U3, U5 and B.2 entries U2, U3, U5.
2. `pnpm --filter @harness-engineering/types exec tsc --noEmit`. Expect a pass.

#### Task U1.4: Core receipts

**Depends on:** U1.3 | **Files:** `packages/core/src/receipts/{schema,layout,load,review-gate,index}.ts`, `scripts/generate-core-barrel.mjs`

1. Build unit 1's version of `schema.ts`, `layout.ts`, `load.ts`, `review-gate.ts` and `index.ts` (B.3, entries U2 to U5) and of `scripts/generate-core-barrel.mjs` (E-barrel-1, E-barrel-2).
2. `pnpm run generate:barrels`. This writes `export * from './receipts'` into `packages/core/src/index.ts` with the unit-1 comment, and updates `packages/core/public-symbols.txt`.
3. `pnpm --filter @harness-engineering/core exec tsc --noEmit`. Expect a pass.
4. `pnpm --filter @harness-engineering/core exec eslint src/receipts src/review`. Fix only imports the cut left unused.

#### Task U1.5: CLI

**Depends on:** U1.4 | **Files:** `packages/cli/src/review-receipts/io.ts`, `packages/cli/src/review-receipts/gate.ts`, `packages/cli/src/commands/check-review-receipt.ts`

1. Build unit 1's version of each file (B.4, entries U2 to U5).
2. `pnpm run generate:barrels`. This adds `check-review-receipt` and `review-tier` to `_registry.ts`.
3. `pnpm turbo run build --filter=@harness-engineering/cli... --force && pnpm --filter @harness-engineering/cli exec tsc --noEmit`.

#### Task U1.6: Tests

**Depends on:** U1.5 | **Files:** the test paths below

```bash
git checkout $REF -- packages/cli/tests/ci/harness-reviews-ignore.test.ts \
  packages/cli/tests/commands/check-review-receipt.test.ts packages/cli/tests/commands/review-tier.test.ts \
  packages/cli/tests/commands/mcp-list-capabilities.test.ts packages/cli/tests/config/review-schema.test.ts \
  packages/cli/tests/integration/round4-findings-self-check.test.ts \
  packages/cli/tests/mcp/server-integration.test.ts packages/cli/tests/mcp/server.test.ts \
  packages/cli/tests/mcp/tool-tiers.test.ts packages/cli/tests/mcp/tools/review-receipt.test.ts \
  packages/core/tests/receipts/backend.test.ts packages/core/tests/receipts/finding-compat.test.ts \
  packages/core/tests/receipts/load.test.ts packages/core/tests/receipts/review-gate.test.ts \
  packages/core/tests/receipts/round4-final-base.test.ts packages/core/tests/receipts/round4-findings-check.test.ts \
  packages/core/tests/receipts/round4-helpers.ts packages/core/tests/receipts/round4-reviewer-ids.test.ts \
  packages/core/tests/receipts/schema.test.ts packages/core/tests/review/tier-selector.test.ts
```

Then build unit 1's version of each B.5 shared test file (all entries U2 to U5): `review-gate-round2`, `review-gate-round3`, `schema-types`, `layout`, `round4-stamp-inert`, `public-surface`, `types/tests/pipeline-receipts`, `cli/tests/review-receipts/io`, `review-receipt-registration`, `round4-final-base` (cli), `round4-robustness`.

Run `pnpm --filter @harness-engineering/types test && pnpm --filter @harness-engineering/core exec vitest run tests/receipts tests/review && pnpm --filter @harness-engineering/cli exec vitest run tests/commands/check-review-receipt.test.ts tests/commands/review-tier.test.ts tests/commands/round4-final-base.test.ts tests/commands/round4-robustness.test.ts tests/commands/review-receipt-registration.test.ts tests/review-receipts tests/mcp tests/config/review-schema.test.ts tests/ci/harness-reviews-ignore.test.ts`. Expect a pass.

`round4-findings-self-check` runs the built CLI. Run it after the build in U1.5: `pnpm --filter @harness-engineering/cli exec vitest run tests/integration/round4-findings-self-check.test.ts`.

#### Task U1.7: Skills prose

**Depends on:** U1.6 | **Files:** `agents/skills/claude-code/harness-autopilot/SKILL.md`, `agents/skills/claude-code/harness-code-review/SKILL.md`, both `skill.yaml`

1. Build unit 1's version of each (B.6: A-1 to A-62, C-1 to C-11 and Y-1 to Y-5, all units 2 to 5).
2. Read the result of REVIEW and FINAL_REVIEW once end to end. The step numbers must run 1 to 7 in REVIEW, and every cross-reference ("REVIEW step N", "Review records, After a fix", "Review records, Overrides") must name something that exists. Fix a dangling reference by editing this unit's text only, and list each such edit in the unit's gate report.

#### Task U1.8: Skills tests

**Depends on:** U1.7 | **Files:** `agents/skills/tests/autopilot-review-fidelity.test.ts`, `agents/skills/tests/code-review-receipts.test.ts`, `agents/skills/tests/review-json-examples.test.ts`

1. `git show $REF:<file> > <file>` for each. Cut `review-json-examples` per B.5, and the other two per R13 and the B.5 table, for units 2 to 5.
2. `pnpm --filter @harness-engineering/skills exec vitest run tests/autopilot-review-fidelity.test.ts tests/code-review-receipts.test.ts tests/review-json-examples.test.ts`. A failure means one of two things: the prose cut removed text a unit-1 assertion pins (restore that text), or an assertion pins a later unit (remove it under R13).

#### Task U1.9: Shared docs

**Depends on:** U1.7 | **Files:** `AGENTS.md`, `docs/knowledge/decisions/0139-*.md`, `docs/knowledge/decisions/0140-*.md`, `docs/knowledge/core/review-receipts.md`, `docs/reference/configuration.md`

Build unit 1's version of each per B.7. Then run `forbidden 1` and `pnpm exec prettier --write` on the five files.

#### Task U1.10: Changeset and spec amendment

**Depends on:** U1.2 | **Files:** `.changeset/review-fidelity-receipts.md`, `docs/changes/shift-left-pipeline-fidelity/proposal.md`

1. Write `.changeset/review-fidelity-receipts.md`. Keep REF's frontmatter (types, core and cli, all `minor`). The body:

```markdown
feat: review receipts, a credential-free receipt gate and risk-tiered reviews (shift-left pipeline fidelity, unit 1 of 5).

- **Receipts.** Every review writes a typed `receipt.json` and one findings file per reviewer under `.harness/sessions/<slug>/reviews/<moment>-<phase>/` (standalone: `.harness/reviews/<branch>-<head sha>/`). A phase review's directory is `phase-N`, where `N` is the phase's 0-based position. A findings file carries the commit its reviewer read (`head`), and every blocking finding in it carries `findingClass` and `escapedFrom` (`ReviewFinding` gains both as optional fields). Contract types, including the gate's failure codes as a literal union, are exported from `@harness-engineering/types`; validators and the gate from `@harness-engineering/core`.
- **Gate.** (REF's Gate bullet, without "a `round` or `priorRounds` that does not match the `round-R/` archives beside the receipt," and with "Two more modes: … `--archive-round` …, and" replaced by "One more mode:")
- **Tiers.** (REF's Tiers bullet, verbatim)
- **Cold final review.** Autopilot's final review covers the diff from the merge base and gives reviewers no prior findings. A commit after it returns to the final review. A failed mechanical phase is a red check (fix or stop), never a gate override.
- **Config.** (REF's Config bullet, verbatim)
```

2. In `proposal.md`, replace everything from `## Implementation Order` up to (not including) `### Follow-up (D9)` with:

```markdown
## Implementation Order

Amended 2026-11-24. Phase 1 went through four six-reviewer review rounds without converging (blocking counts 23, 23, 12, 16), largely because every round reviewed one ~190-file, ~30,000-line diff. By owner decision the same design ships as a stack of pull requests, one per unit, each reviewed on its own diff. Each unit's PR targets the previous unit's branch (unit 1 targets `main`), and the units merge in order. The design above does not change. The cut is planned in `plans/2026-11-24-stacked-units-recut-plan.md`. In this section a phase number is a unit number. The Technical Design's Phases 2, 3 and 4 are units 7, 8 and 9.

### Phase 1: Unit 1, gate core

<!-- complexity: high -->

Receipt and findings-file schemas and contract types; the gate (`validateReviewReceipt`, `harness check-review-receipt` with `--findings`, `check_review_receipt`); `harness review-tier` with tier, backend and base resolution; the skills' tier selection, dispatch, receipt writing and cold, full final review; ADRs 0139 and 0140; `review.backend`.

### Phase 2: Unit 2, fix rounds

<!-- complexity: medium -->

`check-review-receipt --archive-round`; the receipt's `round` and `priorRounds` and the gate's `ROUND_MISMATCH` and `PRIOR_ROUNDS_MISMATCH`; the skills' fix-round text.

### Phase 3: Unit 3, provenance stamp

<!-- complexity: high -->

`harness review-provenance render`; the session-state contract (`autopilot-state.json` phases); typed review decisions with rounds and `decidedBy`; the stamp grammar, its parser and inert text; the dismissal and override skill text.

### Phase 4: Unit 4, reading the stamp back from a PR

<!-- complexity: low -->

The `pre-merge-brief` Review provenance section, `--pr`, and the workflow and template changes. Depends on unit 3.

### Phase 5: Unit 5, attribution

<!-- complexity: medium -->

`harness review-attribution record` and `report`, the log, runs, stamp states and the per-PR measure. Depends on unit 3, and uses unit 4's PR reader.

### Phase 6: Unit 6, receipts refactor before claim consistency

<!-- complexity: medium -->

Planned separately.

### Phase 7: Unit 7, claim consistency (Technical Design, Phase 2)

<!-- complexity: medium -->

Plan schema and planning step, executor sweep, CONSISTENT level, `check-claims`.

### Phase 8: Unit 8, edge-case contract (Technical Design, Phase 3)

<!-- complexity: medium -->

Planning list, executor tests, verifier check. Provisional under D9.

### Phase 9: Unit 9, learnings write-back (Technical Design, Phase 4)

<!-- complexity: low -->

Writer, and the planning and execution readers. Provisional under D9. This is the last unit to ship, so it also creates the evidence-review roadmap row of criterion 17.
```

3. In `### Follow-up (D9)`, replace `Phase 4 creates the row when it ships; Phases 1 to 3 do not.` with `Unit 9 creates the row when it ships; units 1 to 8 do not.`

#### Task U1.11: Regenerate, gate, commit

**Depends on:** U1.3 to U1.10 | **Files:** generated paths (A.4), `docs/roadmap.md`

1. `pnpm turbo run build --filter=@harness-engineering/cli... --force && pnpm run generate:barrels && pnpm run generate-docs && pnpm run generate:tool-catalog && pnpm generate:plugin:all`
2. `sh ../recut-gate.sh 1`. Every command must pass, B.0 may report only allow-listed hits, and validate, ci check and arch must add nothing to the baseline (expected arch: module-size about +2,140, under the 2,946 tolerance; dependency depth about +4).
3. `git add -A && git commit -m "feat(receipts): unit 1 cut — gate core"`. The hook regenerates shards, plugins and `docs/roadmap.md`. If the hook blocks on arch, see Part D, and never pass `--no-verify`.
4. `git status` must be clean.

#### Task U1.12: Gate report

[checkpoint:human-verify]

**Depends on:** U1.11 | **Files:** none

Report: commit shas, the gate output summary, the B.0 hits with reasons, every dangling-reference edit from U1.7, the module-size, coupling and dependency-depth numbers, and the review findings this unit owns (Part E). Wait for confirmation before unit 2.

### Unit 2: Fix rounds

**Branch:** `feat/review-fidelity-u2-fix-rounds` from unit 1's tip | **PR base:** `feat/review-fidelity-u1-gate-core` | **Owns:** `packages/core/src/receipts/load.ts` (archives), round checks in `review-gate.ts`

#### Task U2.1: Branch

**Depends on:** U1.12 | **Files:** none

Run `cd $WT && git switch -c $U2`.

#### Task U2.2: Unit-2 files and shared code

**Depends on:** U2.1 | **Files:** `packages/core/tests/receipts/round4-rounds.test.ts`, `packages/cli/tests/commands/round4-archive-round.test.ts`, `packages/types/src/{pipeline-receipts,index}.ts`, `packages/core/src/receipts/{schema,load,review-gate,index}.ts`, `packages/cli/src/review-receipts/gate.ts`, `packages/cli/src/commands/check-review-receipt.ts`

1. `git checkout $REF -- packages/core/tests/receipts/round4-rounds.test.ts packages/cli/tests/commands/round4-archive-round.test.ts`
2. Rebuild each listed source file from REF with entries U3 to U5 (B.1 to B.4). The U2 entries are no longer applied, so the round code returns. Files with no U2 entry (`layout.ts`, `io.ts`) are unchanged from unit 1. Do not touch them.
3. `pnpm run generate:barrels && pnpm turbo run build --filter=@harness-engineering/cli... --force`

#### Task U2.3: Unit-2 tests, skills and docs

**Depends on:** U2.2 | **Files:** `packages/core/tests/receipts/review-gate-round2.test.ts`, both SKILL.md, the three skills tests, `AGENTS.md`, both ADRs, `docs/knowledge/core/review-receipts.md`

1. Rebuild `review-gate-round2.test.ts` from REF with its U3 entry only.
2. Rebuild both SKILL.md files with entries U3 to U5. Rebuild the skills tests from REF, cut for units 3 to 5.
3. Bring the B.7 files to their unit-2 form: start from REF and apply the cuts of units 3 to 5 only. Compared with unit 1, this adds the **Fix rounds** bullet and the round clauses back.
4. Run `forbidden 2`.

#### Task U2.4: Changeset, gate, commit, report

**Depends on:** U2.3 | **Files:** `.changeset/review-fidelity-rounds.md`

1. Write `.changeset/review-fidelity-rounds.md` (types, core and cli `minor`):

```markdown
feat: review fix rounds (shift-left pipeline fidelity, unit 2 of 5).

- **Fix rounds.** New `harness check-review-receipt --archive-round <review-dir>` archives an ended round into `round-R/` and prints the next round. A review that runs again after a fix is a new round recorded in the receipt (`round`, `priorRounds`); the round is 1 + the archived rounds, so a failed mechanical phase or a crash keeps it. The gate fails a `round` or `priorRounds` that does not match the `round-R/` archives beside the receipt (`ROUND_MISMATCH`, `PRIOR_ROUNDS_MISMATCH`).
```

2. Regenerate (U1.11, step 1), run `sh ../recut-gate.sh 2`, and commit `feat(receipts): unit 2 cut — fix rounds`.
3. [checkpoint:human-verify] Report as in U1.12.

### Unit 3: Provenance stamp

**Branch:** `feat/review-fidelity-u3-provenance-stamp` from unit 2's tip | **PR base:** unit 2's branch | **Owns:** `packages/core/src/receipts/{decisions,provenance,stamp-grammar,text}.ts`, `packages/core/src/state/autopilot-session-state.ts`, `packages/cli/src/commands/review-provenance.ts`

#### Task U3.1: Branch

**Depends on:** U2.4 | **Files:** none

Run `git switch -c $U3`.

#### Task U3.2: Unit-3 files

**Depends on:** U3.1 | **Files:** the paths below

```bash
git checkout $REF -- packages/core/src/receipts/decisions.ts packages/core/src/receipts/stamp-grammar.ts \
  packages/core/src/receipts/text.ts packages/core/src/state/autopilot-session-state.ts \
  packages/core/src/roadmap/sync.ts packages/cli/src/commands/migrate.ts \
  packages/cli/src/commands/review-provenance.ts \
  packages/core/tests/receipts/decisions.test.ts packages/core/tests/receipts/session-state.test.ts \
  packages/core/tests/receipts/provenance.test.ts packages/core/tests/receipts/stamp-round3.test.ts \
  packages/core/tests/receipts/round4-decided-by.test.ts packages/core/tests/receipts/round4-unread-decisions.test.ts \
  packages/core/tests/receipts/round4-stamp-assembly.test.ts \
  packages/cli/tests/commands/review-provenance.test.ts packages/cli/tests/commands/review-provenance-guide.test.ts \
  docs/.vitepress/config.mts
```

#### Task U3.3: Shared code

**Depends on:** U3.2 | **Files:** `packages/types/src/{pipeline-receipts,index}.ts`, `packages/core/src/receipts/{schema,layout,review-gate,index,provenance}.ts`, `packages/cli/src/review-receipts/{io,gate}.ts`, `scripts/generate-core-barrel.mjs`

1. Rebuild each from REF with entries U4 and U5 only. `provenance.ts` takes E-prov-1, 2, 3 and 4.
2. `pnpm run generate:barrels` (this adds `review-provenance` to `_registry.ts` and updates the core comment and the symbol manifest), then build.

#### Task U3.4: Shared tests

**Depends on:** U3.3 | **Files:** the B.5 files with a U3 entry

Rebuild each from REF with entries U4 and U5 only. Run the core and cli test suites.

#### Task U3.5: Skills, docs and guide

**Depends on:** U3.3 | **Files:** both SKILL.md, the skills tests, `AGENTS.md`, both ADRs, the knowledge doc, `docs/reference/configuration.md`, `docs/guides/review-provenance.md`, `docs/guides/index.md`

1. Rebuild both SKILL.md files and the skills tests from REF, cut for units 4 and 5.
2. `git show $REF:docs/guides/review-provenance.md > docs/guides/review-provenance.md` and `docs/guides/index.md` the same way. Then remove the `pre-merge-brief` mentions (U4) and the "Measuring the leak" section and the `review-attribution report` bullet (U5).
3. Bring the remaining B.7 files to their unit-3 form, run `forbidden 3`, and run prettier.

#### Task U3.6: Changeset, allowance, gate, commit, report

**Depends on:** U3.4, U3.5 | **Files:** `.changeset/review-fidelity-provenance.md`, possibly `.harness/arch/allowances/feat-review-fidelity-u3-provenance-stamp.json`

1. Changeset (types, core and cli `minor`). The body is REF's **Provenance** bullet without its two `pre-merge-brief` sentences (from "`harness pre-merge-brief` shows the stamp" to the end of the bullet), followed by: "Autopilot's state contract (`AutopilotSessionState`, `AutopilotPhaseEntry`) is exported from `@harness-engineering/types`. Dismissing a blocking finding is a judgment pause that never auto-resolves unless the self-audit ran and agreed, and a final review with a dismissal ends `passed-with-dismissals`."
2. Regenerate. Then run `H check-arch --json`. If module-size regresses past tolerance, as expected while units 1 and 2 are unmerged (Part D), run `H check-arch --update-baseline --reason "shift-left-pipeline-fidelity unit 3 (#2686): stacked on unmerged units 1-2, measured cumulatively against main"` and check that it wrote the branch's allowance file and did not change `baselines.json`.
3. Run `sh ../recut-gate.sh 3`, commit `feat(receipts): unit 3 cut — provenance stamp` (and the allowance in its own commit, `chore(arch): allowance for stacked unit 3`).
4. [checkpoint:human-verify] Report.

### Unit 4: Reading the stamp back from a PR

**Branch:** `feat/review-fidelity-u4-pr-stamp-reader` from unit 3's tip | **PR base:** unit 3's branch | **Owns:** `packages/cli/src/commands/pre-merge-brief.ts`, the pre-merge-brief skill copies, `templates/ci-pre-merge-brief/**`

#### Task U4.1: Branch and unit-4 files

**Depends on:** U3.6 | **Files:** the paths below

```bash
git switch -c $U4
git checkout $REF -- .github/workflows/required-review.yml \
  agents/skills/claude-code/pre-merge-brief agents/skills/codex/pre-merge-brief \
  agents/skills/cursor/pre-merge-brief agents/skills/gemini-cli/pre-merge-brief \
  docs/reference/packages-cli-13.md packages/cli/src/commands/pre-merge-brief.ts \
  packages/cli/tests/commands/pre-merge-brief-cov544.test.ts \
  packages/cli/tests/commands/pre-merge-brief-provenance.test.ts \
  templates/ci-pre-merge-brief
```

#### Task U4.2: Shared code and tests

**Depends on:** U4.1 | **Files:** `packages/core/src/receipts/{index,provenance}.ts`, `packages/cli/src/review-receipts/io.ts`, `packages/core/tests/receipts/public-surface.test.ts`, `packages/cli/tests/review-receipts/io.test.ts`

Rebuild each from REF with the U5 entries only. Then `pnpm run generate:barrels` and build.

#### Task U4.3: Skills, docs and guide

**Depends on:** U4.2 | **Files:** both SKILL.md, the skills tests, the B.7 files

Rebuild from REF with U5 cuts only. Check that the four pre-merge-brief copies are identical (`diff -r` across the four platform directories).

#### Task U4.4: Changeset, allowance, gate, commit, report

**Depends on:** U4.3 | **Files:** `.changeset/review-fidelity-pr-stamp.md`, possibly the unit-4 allowance

1. Changeset (core and cli `minor`). The body is REF's two `pre-merge-brief` sentences from the Provenance bullet.
2. Regenerate (generate-docs updates `skills-catalog.md` and `cli-commands.md`), then the allowance check as in U3.6, step 2.
3. Run `sh ../recut-gate.sh 4` and commit `feat(receipts): unit 4 cut — stamp in pre-merge-brief`.
4. [checkpoint:human-verify] Report.

### Unit 5: Attribution

**Branch:** `feat/review-fidelity-u5-attribution` from unit 4's tip | **PR base:** unit 4's branch | **Owns:** `packages/core/src/receipts/attribution*.ts`, `packages/cli/src/commands/review-attribution.ts`

#### Task U5.1: Branch and unit-5 files

**Depends on:** U4.4 | **Files:** the paths below

```bash
git switch -c $U5
git checkout $REF -- packages/core/src/receipts/attribution.ts packages/core/src/receipts/attribution-report.ts \
  packages/cli/src/commands/review-attribution.ts packages/cli/src/commands/skill/run.ts \
  packages/core/tests/receipts/attribution.test.ts packages/core/tests/receipts/attribution-report.test.ts \
  packages/core/tests/receipts/round4-attribution-identity.test.ts \
  packages/core/tests/receipts/round4-attribution-union.test.ts \
  packages/core/tests/receipts/round4-stamp-coverage.test.ts \
  packages/cli/tests/commands/review-attribution.test.ts packages/cli/tests/commands/skill-run.test.ts \
  packages/cli/tests/commands/round4-attribution-dismissed.test.ts \
  packages/cli/tests/commands/round4-attribution-helpers.ts \
  packages/cli/tests/commands/round4-attribution-identity.test.ts \
  packages/cli/tests/commands/round4-attribution-stamp.test.ts
```

#### Task U5.2: Every shared file to REF

**Depends on:** U5.1 | **Files:** every Part B file, except the changeset and `proposal.md`

Unit 5 applies no entries, so every shared file is REF:

```bash
git checkout $REF -- packages/types/src packages/types/tests/pipeline-receipts.test.ts \
  packages/core/src/receipts packages/cli/src/review-receipts packages/cli/src/commands/check-review-receipt.ts \
  scripts/generate-core-barrel.mjs packages/core/tests/receipts packages/cli/tests/review-receipts \
  packages/cli/tests/commands/review-receipt-registration.test.ts \
  packages/cli/tests/commands/round4-final-base.test.ts packages/cli/tests/commands/round4-robustness.test.ts \
  agents/skills/claude-code/harness-autopilot agents/skills/claude-code/harness-code-review agents/skills/tests \
  AGENTS.md docs/knowledge/decisions/0139-review-receipts-are-claims-recomputed-by-gates.md \
  docs/knowledge/decisions/0140-the-final-review-is-cold-and-full.md docs/knowledge/core/review-receipts.md \
  docs/reference/configuration.md docs/guides/review-provenance.md docs/guides/index.md
```

Then `pnpm run generate:barrels` and build.

#### Task U5.3: Changeset

**Depends on:** U5.2 | **Files:** `.changeset/review-fidelity-attribution.md`

The changeset covers core and cli (`minor`) and types (`minor`, for the attribution record types). The body is REF's **Attribution** bullet without its first sentence (unit 1 already says it), and REF's **Skills** bullet.

#### Task U5.4: Regenerate, allowance, gate, commit

**Depends on:** U5.3 | **Files:** generated paths, possibly the unit-5 allowance

Regenerate everything (U1.11, step 1), then the allowance check (U3.6, step 2). Run `sh ../recut-gate.sh 5` and commit `feat(receipts): unit 5 cut — attribution`.

#### Task U5.5: Invariant check (last task of the cut)

[checkpoint:human-verify]

**Depends on:** U5.4 | **Files:** none changed

```bash
cd $WT
REBASED=$(git merge-tree --write-tree origin/main $REF)   # REF rebased onto origin/main: their changes touch disjoint files
git diff --stat $REBASED HEAD
git diff --name-status $REBASED HEAD
```

The output must list exactly the Part F differences. For each generated path (A.4), check that it is **not** listed: it regenerated identically. Any other path is lost or extra work. Stop, find which unit's cut is wrong (a stray entry, or a missed `git checkout`), fix it on that unit's branch, and restack upward with `git rebase --onto` (one branch at a time, never `git stash`). Then run the check again.

Then tag the cut tips for the record: `git tag recut/u1-cut $U1` and the same for u2 to u5 (local tags; do not push them).

Report the diff output and the tag shas.

### After the cut: findings and PRs

For each unit in order: apply Part E's findings as fix commits on the unit's branch, rerun its gate, and restack the units above it (`git rebase --onto <unit N new tip> <unit N old tip> <unit N+1 branch>`). A rebase onto a stack never needs `--force` on the reference branch. Pushing and opening PRs is irreversible, and the owner decides when (base per unit as given above; body `Part of #2686`). A unit whose base is not `main` gets no CI until its base merges and GitHub retargets it. While a unit's base is the unit below it, its final review passes `--target <that unit's remote-tracking branch>` to `harness review-tier --moment final` and to `harness check-review-receipt` (ADR 0140, Stacked branches), so the review covers that unit's commits only.

---

## Part D: Architecture budgets

Tolerance is 1% of `main`'s baseline per category (`regressionTolerance: 0.01`). Measured on `origin/main` (`717098b56`): module-size 294,695 (tolerance 2,946), coupling 469 (4), dependency depth 693 (6), complexity 283 (2). At REF: module-size 299,720 (+5,025), coupling 473 (+4), dependency depth 699 (+6), complexity 284 (+1). At REF no module-size violation is new: every module over 3,500 LOC or 30 files was already over on `main`. The five violation ids in the old allowance file are stale.

Module-size counts the non-blank lines of non-test `.ts` files (helpers named `*.ts` in `tests/` count). Per-unit estimates from REF's file sizes:

| Unit | Own increment | Cumulative vs current main | Fits alone?              | Fits stacked on unmerged units?                            |
| ---- | ------------- | -------------------------- | ------------------------ | ---------------------------------------------------------- |
| 1    | about +2,140  | +2,140                     | yes (about 800 to spare) | yes                                                        |
| 2    | about +140    | +2,280                     | yes                      | yes                                                        |
| 3    | about +1,225  | +3,500                     | yes                      | **no**: over by about 550 while units 1 and 2 are unmerged |
| 4    | about +190    | +3,690                     | yes                      | **no**: over by about 750                                  |
| 5    | about +1,325  | +4,850 to +5,025           | yes                      | **no**: over by about 1,900 to 2,080                       |

- No unit exceeds module-size tolerance on its own, so unit 1 needs no split for the arch budget. Unit 1 is also the largest review (Part G, concern 4).
- The arch gate measures each branch against `origin/main` (`HARNESS_ARCH_BASE_REF` defaults to `origin/main`), both in the pre-commit hook and locally. A stacked unit is therefore measured cumulatively until the units below it merge and `chore: refresh baselines after merge` raises the baseline. Units 3, 4 and 5 each need their own allowance file (`H check-arch --update-baseline --reason "…"` writes `.harness/arch/allowances/<branch>.json`). Every allowance file in the directory is loaded, so a branch also carries the allowances of the units below it. The refresh job deletes an allowance after its PR merges. After a lower unit merges and a branch is rebased onto the new `main`, rerun `check-arch`; if it passes without the allowance, delete the allowance in a commit.
- Dependency depth: unit 1 creates the two new modules `packages/core/src/receipts` (about 2) and `packages/core/tests/receipts` (2), about +4. Unit 3 takes `receipts` to 3 (+1). Unit 5 adds `packages/cli/tests/commands` 0→1 through `round4-attribution-helpers.ts` (+1). The cumulative value is at most +6, within tolerance.
- Coupling (+4) and complexity (+1) are at or under tolerance for the whole branch, and the cut only removes files and imports. Every unit's gate measures them. If a unit exceeds, it gets an allowance as above; if a unit has a new **error**-severity violation, that cannot be allowanced and must be fixed.
- The old `.harness/arch/allowances/feat-shift-left-pipeline-fidelity.json` is not carried into any unit (Part F).
- `packages/core/src/receipts` holds 2,744 LOC at REF in 12 files, against a 3,500 LOC per-module threshold. Units 1 to 5 fit. Unit 6, the refactor before Phase 2, should create headroom before Phases 2 to 4 add code there (finding `architecture-receipts-module-headroom`).

## Part E: Review round 4 findings by unit

All six files in `.harness/sessions/changes--shift-left-pipeline-fidelity--proposal/reviews/phase-0/` were read: adversarial, architecture, bug, compliance, security and typescript-strict. Each unit fixes its findings after the cut (R4). Severity is in brackets. "Defect" marks a suggestion that is a correctness defect.

**Unit 1 (gate core)**

- [important] `bug-diff-relative-subdir`: `listDiffFiles` follows a user's `diff.relative` config, so the gate and `--findings` see a different file set from a subdirectory. Pass `--no-relative` (io.ts).
- [important] `security-dot-harness-slug-final-as-standalone`: under a session named `.harness`, `final-all` is read as a standalone review (layout.ts `reviewMomentOfDir`).
- [suggestion, defect] `security-gate-output-terminal-escapes`: gate failure messages print receipt free text raw (check-review-receipt.ts).
- [suggestion, defect] `bug-standalone-base-message` and `compliance-standalone-base-hint` (one fix): `review-tier` tells a standalone review to "pass --session", which it ignores.
- [suggestion, defect] `typescript-strict-review-tier-config-error-misattributed`: `review-tier` blames `review.backend` for any invalid `review` key.
- [suggestion, defect] `compliance-pipeline-empty-domain-file`: the pipeline backend must write a findings file for a required reviewer whose domain returned no findings (code-review SKILL.md).
- [suggestion, defect] `typescript-strict-unread-reason-widened`: the unread-receipt reason is typed `string` (load.ts; `RECEIPT_UNREAD_REASONS` is in unit 1 for this, R9).
- [suggestion, defect] `typescript-strict-findings-range-key-presence`: `FindingsFileRange` encodes "a range was given" as a key whose value may be undefined (review-gate.ts).
- [suggestion] `typescript-strict-orphaned-doc-blocks`: two doc comments in review-gate.ts attach to the wrong declarations. This is cheap, and worth fixing while the file is under review.
- Informational, no fix required: `typescript-strict-tier-result-flat-optionals`, `architecture-findings-parse-twice`, `architecture-phase-base-prose-only`, `architecture-budget-reductions`.

**Unit 2 (fix rounds)**

- [important] `adversarial-archive-without-receipt-poisons-review`, `bug-archive-receiptless-round-poisons-gate` and `compliance-archive-round-without-receipt` (one defect): `--archive-round` archives a directory with no `receipt.json`, after which no receipt there can pass. The two skills also state the archive condition differently.
- [important] `adversarial-archive-round-any-directory`: `--archive-round` with an empty or wrong path moves every top-level file of the repository into `round-1/`.
- [important] `typescript-strict-archive-round-partial-move` and `bug-archive-partial-move` (one defect): `archiveReviewRound` can throw mid-move and leave a half-archived round.
- [important] `adversarial-same-head-round-reroll`: a new round at the **same** head passes the gate, so blocking findings can be re-rolled away. The stamp cannot tell it from a fix round.
- [suggestion, defect] `bug-round-numbers-not-contiguous`: the round check accepts archives numbered out of sequence.

**Unit 3 (provenance stamp)**

- [important] `security-hidden-stamp-link-definition`: a stamp the PR page does not show (hidden by more than HTML comments) is parsed, reposted by CI and decides the stamp state. This is in the parser `stampText`, which is in unit 3 (R5).
- [important] `compliance-receiptless-row-override-unknown`: a `MISSING` or receipt-less row prints `-` in Override when the decisions could not be read; the skill says `unknown`.
- [important] `compliance-final-status-passed-after-gate-override`: FINAL_REVIEW records `passed` for a final review whose gate failed and was overridden.
- [important] `architecture-session-state-schema-unused`: `AutopilotSessionStateSchema` is published but no reader parses with it, and the state-file contract is defined three times.
- [suggestion, defect] `adversarial-final-status-passed-after-earlier-round-dismissal`: `passed` despite a dismissal in an earlier round of the final review.
- [suggestion, defect] `compliance-decidedby-parser-claim`: the skill says the parser refuses a record without `decidedBy`; the code reads it as `unknown`.
- [suggestion, defect] `security-override-cell-unbounded-prose`: the parser accepts up to 4,000 characters of prose in an Override cell, far beyond what the renderer writes.
- [suggestion, defect] `security-decision-passthrough-json-crash`: a deeply nested extra key in a decision record crashes `review-provenance render --json`.
- [suggestion, defect] `architecture-state-read-per-row`: one stamp is assembled from several independent reads of `autopilot-state.json`, which can disagree.
- [suggestion] `typescript-strict-provenance-widened-vocab` and `typescript-strict-fields-two-meanings` (the second `fields` helper arrives with decisions.ts).
- Informational: `architecture-stamp-three-encodings`.

**Unit 4 (PR stamp reader)**

- No round-4 finding touches unit 4's code alone. Its exposure to `security-hidden-stamp-link-definition` is fixed in unit 3, and its own tests must pin the fixed parser.

**Unit 5 (attribution)**

- [important] `bug-stamped-ignores-reviewed-head` and `adversarial-standalone-head-not-pr-head` (one defect): a standalone review counts as a leak of a stamped PR even when it reviewed another commit than the PR head.
- [important] `bug-attribution-label-rejects-valid-standalone`: `ATTRIBUTION_REVIEW_LABEL` rejects a standalone label starting with `_` that the gate accepts.
- [important] `architecture-decision-matching-in-cli`: decision-to-receipt matching and stamp-state policy are reimplemented in the CLI command instead of core.
- [suggestion, defect] `adversarial-per-pr-double-count-across-labels`: two cold reviews of one head double the per-PR leak.
- [suggestion, defect] `bug-report-stale-incomplete-sentences`: the stale and incomplete report sentences are not true for every stamp they count.
- [suggestion, defect] `adversarial-done-commits-starve-measure`: routine commits after the final review (DONE steps 5 to 7, GitHub's "Update branch") make every stamp stale and drop the PR from the per-PR measure. The fix touches autopilot's DONE text and the measure.
- [suggestion, defect] `compliance-standalone-label-length`: the code-review standalone naming rule omits the 200-character cap that `STANDALONE_REVIEW_LABEL` (unit 5) enforces.

**Unit 6 (refactor before Phase 2, planned separately)**: `architecture-receipts-module-headroom`, `architecture-gate-shape-not-generic`, `architecture-io-module-mixed`, `architecture-barrel-surface`, `typescript-strict-receipt-module-size`.

## Part F: Intended differences at unit 5's cut tip

`git diff $(git merge-tree --write-tree origin/main $REF) <unit 5 cut tip>` must show exactly these paths:

1. `docs/changes/shift-left-pipeline-fidelity/proposal.md`: the Implementation Order amendment (U1.10).
2. `docs/changes/shift-left-pipeline-fidelity/plans/2026-11-24-stacked-units-recut-plan.md`: added (this plan).
3. `.changeset/review-fidelity-receipts.md`: unit-1 content instead of REF's whole-feature text. Added: `.changeset/review-fidelity-{rounds,provenance,pr-stamp,attribution}.md` (R11).
4. `.harness/arch/allowances/feat-shift-left-pipeline-fidelity.json`: absent (it acknowledged stale ids and was named for the old branch). Added: any of `.harness/arch/allowances/feat-review-fidelity-u{3,4,5}-*.json` that Part D required.

Nothing else may differ. In particular every generated file in A.4 must regenerate identically.

## Part G: Concerns

1. **Units 4 and 5 are not independent in code.** The owner's statement is that units 4 and 5 depend on 3 and not on each other. In the code, `review-attribution record` reads the PR with `defaultPrReader`, which is `--pr`'s reader (unit 4). This plan keeps the reader in unit 4 (R6), so unit 5 depends on one function of unit 4. The stack is linear and merges in order, so nothing is blocked. If the owner wants 4 and 5 to be reviewable in either order, move `PrRead`, `PrReader` and `defaultPrReader` (and its `io.test.ts` describe) to unit 3 by retagging E-io-7's first part and the B.5 io.test row from U4 to U3. That is about 60 lines, and they would have no consumer in unit 3.
2. **The PR-body parser moved from unit 4 to unit 3 (R5).** The owner listed "PR-body parser" under unit 4. Nine unit-3 test files round-trip the renderer through it, and the stamp grammar it enforces is unit 3's. Keeping it in unit 4 would mean splitting `stamp-round3.test.ts`, `round4-stamp-inert.test.ts`, `round4-decided-by.test.ts`, `round4-unread-decisions.test.ts` and `provenance.test.ts`, and the round-trip property would go unreviewed in unit 3. The security finding on the parser therefore lands in unit 3.
3. **Prose cuts carry judgment.** B.6 gives exact entries for the two SKILL.md files, and four of them introduce new unit-1 text (A-12 "After a fix", A-15 "Overrides", A-44, A-52 and A-53). Those sentences are not in REF and need review in unit 1; they disappear again when units 2 and 3 apply. AGENTS.md, the ADRs, the knowledge doc and the guide are cut by section, with B.0 as the check. The executor may need one adjustment round per unit.
4. **Unit 1 is still the largest review.** Unit 1 has about 14,300 added lines. Of those, about 6,350 are the spec and the original 5,904-line plan (docs that were already reviewed), and about 8,000 are code, tests and prose, of which about 3,900 are tests. Unit 3 has about 5,650 and unit 5 about 4,300. The other units are small: unit 2 about 560 and unit 4 about 720. If unit 1's review does not converge, split it into 1a (types, core, CLI, MCP) and 1b (skills prose and skills tests) along task U1.7. That split needs no other change to this plan.
5. **The stacked PRs get no CI until retargeted.** `ci.yml` runs on `pull_request` to `main` only. Units 2 to 5 depend on the local gate until their base merges.
6. **Auto-done.** No unit PR may say `Closes #2686` (R12).
7. **The reference branch gains one commit.** It is this plan's commit, made at planning time as the task asked. REF stays the sha `43361c4e1`, and no other change is made to `feat/shift-left-pipeline-fidelity`.
8. **The invariant holds only for the cut.** Once Part E's fixes land, unit 5's tip differs from REF by those fixes, by design (R4). The local tags `recut/u*-cut` record the proven cut.

## Units 6 to 9 (listed only; planned separately)

6. Receipts refactor before Phase 2: generalise the decision record and failure type, separate the io seams, and create headroom in `packages/core/src/receipts` (Part E, unit 6).
7. Claim consistency (spec Technical Design, Phase 2).
8. Edge-case contract (spec Phase 3; provisional under D9).
9. Learnings write-back (spec Phase 4; provisional under D9; creates the D9 evidence-review roadmap row).

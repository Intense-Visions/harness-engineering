# Plan: Shift-Left Pipeline Fidelity, Phase 1: Review Fidelity and Attribution

**Date:** 2026-11-20 | **Spec:** `docs/changes/shift-left-pipeline-fidelity/proposal.md` (Phase 1 only) | **Tasks:** 38 | **Time:** about 150 min | **Integration Tier:** large

**Session:** `changes--shift-left-pipeline-fidelity--proposal` | **Branch:** `feat/shift-left-pipeline-fidelity` | **Rigor:** standard

## Goal

Every review the pipeline runs writes a typed receipt that a credential-free gate recomputes and passes or fails, the final review is cold and full, every blocking finding is tagged with the stage it escaped from, and each PR carries a provenance stamp of the reviews that ran.

## Scope

In scope: the spec's "Shared: receipts and attribution" and "Phase 1: Review fidelity and attribution" sections, and success criteria 1 to 8, 13, 15 and 16.

Out of scope (later phases): `claims` on plan tasks, `check-claims`, the CONSISTENT level, edge-case ids, `recordReviewLearnings`, the roadmap evidence-review row (criteria 9 to 12, 14, 17). Criterion 18 (`harness validate` passes) cannot be met on this branch: `origin/main` already fails with pre-existing issues, so tasks compare against a recorded baseline instead.

## Observable Truths (Acceptance Criteria)

1. **(SC1)** When autopilot runs a `full` review, the system shall produce one findings file per required reviewer and a `receipt.json` listing each. Delivered by skill text (Tasks 28, 29) and enforced by the gate: a `full` receipt that lacks `compliance`, `bug`, `security` or `architecture` as a required reviewer fails with `CORE_REVIEWER_MISSING` (Task 3).
2. **(SC2)** If a required reviewer did not run, then `harness check-review-receipt <path>` shall exit 1 and print the reviewer's id (Tasks 3, 15).
3. **(SC3)** If a receipt marks a reviewer `ran: true` and that reviewer's findings file is absent, invalid, shared with another reviewer, or lists an examined file outside the recomputed diff, then the gate shall fail (Tasks 4, 15).
4. **(SC4)** When `moment` is `final`, the gate shall fail unless `tier` is `full`, `coldContext` is true and `priorFindingsSupplied` is false (Task 3).
5. **(SC5)** When `harness-code-review` runs with no subagent-spawning tool, its receipt shall state `tier: "light"` and exactly one required reviewer; the gate fails a `light` receipt with any other count (Tasks 3, 26).
6. **(SC6)** When autopilot creates a PR, the PR body shall contain the block printed by `harness review-provenance render --session <slug>`, delimited by `<!-- harness:review-provenance -->` markers, with one row per review (Tasks 9, 16, 30).
7. **(SC7)** Every blocking (`critical` or `important`) finding in a reviewer findings file shall carry `findingClass` and `escapedFrom`, or the file is invalid and the gate fails; `harness review-attribution record` appends each one to `.harness/metrics/review-attribution.jsonl` (Tasks 2, 10, 18, 25).
8. **(SC8)** `harness review-attribution report` shall print blocking findings per PR for `standalone` reviews of stamped PRs, counts by stage and by class, and shall say so explicitly when it has no such reviews (Tasks 11, 17).
9. **(SC13)** `harness check-review-receipt` shall return the same result with and without `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` and `GITHUB_TOKEN` set, and the gate sources shall not read `process.env` (Task 15).
10. **(SC15)** When `review.backend` is `"pipeline"` and no runner resolves, `resolveReviewBackend` shall return `backend: "agent"`, the receipt records it, and the gate evaluates that receipt with the same rules as any agent review (Tasks 6, 14, 15, 26).
11. **(SC16)** If no receipt exists at the given path, then `harness check-review-receipt` shall exit 1 with `RECEIPT_MISSING` (Tasks 8, 15).
12. `selectReviewTier` returns `full` for `moment: "final"` at every rigor level, and `light` for a phase diff with no risk keyword, no entry point, non-high complexity and non-thorough rigor (Task 5).
13. `harness pre-merge-brief` renders a "Review provenance" section from the PR body's block, or "no pipeline review recorded" when there is none (Task 23).
14. `agents/skills/tests/pause-markers.test.ts` passes: every new stop in `harness-autopilot` and `harness-code-review` carries a `gate` marker (Tasks 26 to 30).
15. `pnpm run generate:barrels:check`, `pnpm run generate-docs --check`, `pnpm run generate:tool-catalog:check` and `pnpm run generate:plugin:check` pass (Tasks 13, 19, 31).

## Uncertainties

No uncertainty blocks decomposition. Each assumption below fills a point the spec leaves open; the tasks that would change are named. They need a human look at plan sign-off.

- **[ASSUMPTION] A1: "blocking" means severity `critical` or `important`.** Neither skill defines it. One constant, `BLOCKING_SEVERITIES` (Task 2). If wrong: Task 2.
- **[ASSUMPTION] A2: the `light` reviewer's id is `compliance-bug`.** The spec's id list has no id for the combined reviewer. The gate checks the count (exactly one required reviewer), not the id. If wrong: Tasks 1, 26, 28.
- **[ASSUMPTION] A3: a pipeline "runner resolves" when the `run_code_review` tool is callable in the reviewing session.** The spec does not say what a runner is for the pipeline backend, and no config key names one. Core gets a pure `resolveReviewBackend({ configured, pipelineRunnerAvailable })`; the skill supplies the boolean. If wrong: Tasks 6, 26, 28.
- **[ASSUMPTION] A4: the attribution log is written by a new `harness review-attribution record --receipt <path>` subcommand.** The spec names only `report`, and says the append may fail without failing the review, which implies code does the append. A subcommand keeps the side effect out of the gate. If wrong: Tasks 18, 27, 28, 29.
- **[ASSUMPTION] A5: the log holds two record kinds, `review` and `finding`.** With finding records alone, a standalone review that finds nothing leaves no trace, so the success state would be invisible in the per-PR report. If wrong: Tasks 1, 10, 11.
- **[ASSUMPTION] A6: `selectReviewTier` returns `full` for `moment: "standalone"`.** D7 then lowers it to `light` in the skill when the session cannot spawn. If wrong: Tasks 5, 26.
- **[ASSUMPTION] A7: the receipt gains one optional field, `diff.baseSource` (`merge-base` or `starting-commit`).** The spec says the stamp states when the base fell back to `startingCommit`, and the receipt is the only data the stamp reads. If wrong: Tasks 1, 2, 9, 29.
- **[ASSUMPTION] A8: the final review's directory is `reviews/final-all/`; a phase's is `reviews/phase-{N}/` with autopilot's existing `{N}`.** The spec gives `<moment>-<phase>` and no phase label for the final review. If wrong: Tasks 7, 16, 29.
- **[ASSUMPTION] A9: a review override is read from `autopilot-state.json` `decisions[]`** as an entry with `state` `REVIEW` or `FINAL_REVIEW` and `chosen: "override"`. If wrong: Tasks 16, 28, 29.
- **[ASSUMPTION] A10: the gate also fails on four conditions the spec does not list**, each needed for the spec's own claim that the gate proves "each required reviewer produced its own findings file over the right files": an empty `examinedFiles`, a findings file whose `reviewerId` differs from the record, two reviewers naming one file, and a diff range that changes no files or cannot be recomputed. If wrong: Task 4.
- **[ASSUMPTION] A11: `previously-raised` is a label the orchestrating session writes on `finalReview.findings` entries**, not a core function. No success criterion tests it. If wrong: Task 29.
- **[DEFERRABLE] D1: the gate does not recompute `diff.base`, the conditional-reviewer activation set, or whether a `light` phase receipt was entitled to be light.** These stay claims shown on the stamp. See Concerns.
- **[DEFERRABLE] D2: exact wording of CLI output lines and the stamp's column order.**

## NFR Targets

Not elicited. This plan was written by a dispatched planner that cannot ask the human, so the four NFR questions (performance, security, scalability, resilience) were not put to anyone and the defaults apply: no new benchmark, `check-security` at its configured floor, no load benchmark. Two targets come from the spec itself rather than from elicitation and are covered by ordinary tasks: no gate requires a credential (Truth 9), and a failed attribution append never fails a review (Task 10).

## Conventions for every task

- **Repo root:** `/Users/cwarner/Projects/iv/harness-engineering`. Run every command from it.
- **Build before you trust `dist`.** `packages/*/dist` was built from another branch. Before the first commit, and again whenever a task changes `packages/types` or `packages/core` and a later step reads them through a package import, run `pnpm turbo run build --filter=@harness-engineering/cli...`. The pre-commit hook reads `packages/cli/dist`; a stale `dist` shows up as an architecture REGRESSION in files you did not touch. Rebuild; never edit a baseline and never use `--no-verify`.
- **The local CLI is `node packages/cli/dist/bin/harness.js`.** `harness` on the PATH is the published install and does not contain this branch's commands.
- **VALIDATE step.** `harness validate` fails on this branch before any change (762 issues at planning time with the global v14.1.0 binary). Task 1 records the count. In every later task, "VALIDATE" means: run `harness validate 2>&1 | head -1` and check the count is not above the recorded baseline. Do not fix pre-existing issues.
- **Tests are not typechecked.** `packages/core` and `packages/cli` exclude `tests/` from `tsc`. A source file's types are checked by `pnpm --filter <pkg> typecheck`.
- **`exactOptionalPropertyTypes` is on.** Build objects with conditional spreads (`...(x !== undefined && { x })`), never `x: undefined`.
- **Paths in tests are separator-insensitive.** CI runs on win32. Build expected paths with `path.join`, or compare `p.split(path.sep)`.
- **The pre-commit hook may stage `.harness/comprehension/**/\_module.md` files.\*\* Leave them in the commit.
- **Skill prose and the pause scanner.** `agents/skills/tests/pause-markers.test.ts` treats `wait`, `Stop`, `STOP`, `confirm`, `pause`, `Approve`, `escalate`, `Proceed?` and `Continue?` as pause phrases. Use the skill text in this plan verbatim; if you must reword, avoid those words outside a marker window.

## File Map

```
CREATE packages/types/src/pipeline-receipts.ts
CREATE packages/types/tests/pipeline-receipts.test.ts
MODIFY packages/types/src/index.ts                         (export block)
MODIFY packages/core/src/review/types/fan-out.ts           (escapedFrom, findingClass on ReviewFinding)
CREATE packages/core/src/receipts/schema.ts
CREATE packages/core/src/receipts/review-gate.ts
CREATE packages/core/src/receipts/backend.ts
CREATE packages/core/src/receipts/layout.ts
CREATE packages/core/src/receipts/load.ts
CREATE packages/core/src/receipts/provenance.ts
CREATE packages/core/src/receipts/attribution.ts
CREATE packages/core/src/receipts/attribution-report.ts
CREATE packages/core/src/receipts/index.ts
CREATE packages/core/src/review/tier-selector.ts
MODIFY packages/core/src/review/index.ts                   (export selectReviewTier)
CREATE packages/core/tests/receipts/schema.test.ts
CREATE packages/core/tests/receipts/review-gate.test.ts
CREATE packages/core/tests/receipts/backend.test.ts
CREATE packages/core/tests/receipts/layout.test.ts
CREATE packages/core/tests/receipts/load.test.ts
CREATE packages/core/tests/receipts/provenance.test.ts
CREATE packages/core/tests/receipts/attribution.test.ts
CREATE packages/core/tests/receipts/attribution-report.test.ts
CREATE packages/core/tests/receipts/public-surface.test.ts
CREATE packages/core/tests/review/tier-selector.test.ts
MODIFY scripts/generate-core-barrel.mjs                    (DIR_COMMENTS entry: receipts)
MODIFY packages/core/src/index.ts                          (generated)
MODIFY packages/core/public-symbols.txt                    (generated)
MODIFY packages/cli/src/config/schema.ts                   (review.backend)
MODIFY packages/cli/tests/config/review-schema.test.ts
CREATE packages/cli/src/commands/check-review-receipt.ts
CREATE packages/cli/src/commands/review-provenance.ts
CREATE packages/cli/src/commands/review-attribution.ts
MODIFY packages/cli/src/commands/_registry.ts              (generated)
CREATE packages/cli/tests/commands/check-review-receipt.test.ts
CREATE packages/cli/tests/commands/review-provenance.test.ts
CREATE packages/cli/tests/commands/review-attribution.test.ts
CREATE packages/cli/tests/commands/review-receipt-registration.test.ts
CREATE packages/cli/src/mcp/tools/review-receipt.ts
CREATE packages/cli/tests/mcp/tools/review-receipt.test.ts
MODIFY packages/cli/src/mcp/server.ts                      (register check_review_receipt)
MODIFY packages/cli/tests/mcp/server.test.ts               (116 -> 117)
MODIFY packages/cli/tests/mcp/server-integration.test.ts   (116 -> 117)
MODIFY packages/cli/src/mcp/tool-tiers.ts
MODIFY packages/cli/src/mcp/tool-capability-declarations.ts
MODIFY packages/cli/tests/mcp/tool-tiers.test.ts
MODIFY packages/cli/src/commands/pre-merge-brief.ts        (Review provenance section)
CREATE packages/cli/tests/commands/pre-merge-brief-provenance.test.ts
MODIFY .gitignore                                          (**/.harness/reviews/)
MODIFY .harness/.gitignore                                 (reviews/)
CREATE packages/cli/tests/ci/harness-reviews-ignore.test.ts
CREATE agents/skills/claude-code/harness-code-review/references/attribution-rubric.md
MODIFY agents/skills/claude-code/harness-code-review/SKILL.md
MODIFY agents/skills/claude-code/harness-autopilot/SKILL.md
CREATE agents/skills/tests/code-review-receipts.test.ts
CREATE agents/skills/tests/autopilot-review-fidelity.test.ts
MODIFY .claude-plugin/**, .cursor-plugin/**, .gemini-extension/**, .antigravity-extension/**, codex plugin dir (generated by generate:plugin:all)
MODIFY docs/reference/cli-commands.md, docs/reference/mcp-tools.md, docs/reference/skills-catalog.md, docs/reference/tool-catalog.md (generated)
CREATE docs/knowledge/decisions/0139-review-receipts-are-claims-recomputed-by-gates.md
CREATE docs/knowledge/decisions/0140-the-final-review-is-cold-and-full.md
CREATE docs/knowledge/core/review-receipts.md
CREATE docs/guides/review-provenance.md
MODIFY docs/.vitepress/config.mts                          (guide nav entry)
MODIFY docs/reference/configuration.md                     (review.backend)
MODIFY AGENTS.md                                           (review tiers and receipt gate)
CREATE .changeset/review-fidelity-receipts.md
```

The cursor, codex and gemini-cli mirrors of `harness-autopilot` and `harness-code-review` are symlinks to `claude-code/` (checked with `[ -L ]` on 2026-11-20), so they need no edit.

## Skeleton

1. Contract types and Zod schemas (~2 tasks, ~8 min)
2. Receipt gate, tier selector, backend resolver (~4 tasks, ~17 min)
3. Layout, loader, provenance stamp, attribution log and summary (~5 tasks, ~21 min)
4. Core module index, barrel and public-symbol manifest (~2 tasks, ~7 min)
5. CLI: config key and three commands, registry (~6 tasks, ~25 min)
6. MCP tool, registration, tier and capability (~3 tasks, ~11 min)
7. `pre-merge-brief` section and ignore rules (~2 tasks, ~8 min)
8. `harness-code-review`: rubric, tiers, dispatched mode, receipt (~3 tasks, ~13 min)
9. `harness-autopilot`: REVIEW, FINAL_REVIEW, DONE (~3 tasks, ~14 min)
10. Generated artifacts (~1 task, ~5 min)
11. ADRs, knowledge doc, guide, reference docs, changeset (~6 tasks, ~18 min)
12. Phase verification and smoke run (~1 task, ~5 min)

**Estimated total:** 38 tasks, about 150 minutes.

_Skeleton approved: no. It was produced but not shown to a human before expansion: the planner was dispatched and cannot ask. It is presented here for approval together with the plan._

**Milestone boundaries.** The plan has more than 20 tasks. It stays one plan because the parent asked for Phase 1 as a unit, but it can be paused after any milestone with a usable increment: **A** (Tasks 1 to 13: core contracts, tested, exported), **B** (Tasks 14 to 24: CLI and MCP surfaces), **C** (Tasks 25 to 31: skills and generated artifacts), **D** (Tasks 32 to 38: documents and verification).

## Tasks

---

## Milestone A: core contracts

### Task 1: Define the receipt, attribution and stamp contract types

**Depends on:** none | **Files:** `packages/types/src/pipeline-receipts.ts`, `packages/types/src/index.ts`, `packages/types/tests/pipeline-receipts.test.ts`

1. Record the validate baseline: run `harness validate 2>&1 | head -1` and note the issue count in the task report. Run `pnpm turbo run build --filter=@harness-engineering/cli...` once so the hooks have a current `dist`.
2. Create `packages/types/tests/pipeline-receipts.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import {
     REVIEW_MOMENTS,
     REVIEW_TIERS,
     REVIEW_BACKENDS,
     REVIEW_BASE_SOURCES,
     REVIEW_STAMP_STATES,
     FULL_TIER_REVIEWER_IDS,
     CONDITIONAL_REVIEWER_IDS,
     LIGHT_TIER_REVIEWER_ID,
     ESCAPED_FROM_STAGES,
     FINDING_CLASSES,
   } from '../src/index';
   import type { ReviewReceipt, ReviewAttributionRecord } from '../src/index';

   describe('pipeline receipt contract', () => {
     it('pins the review vocabularies', () => {
       expect(REVIEW_MOMENTS).toEqual(['phase', 'final', 'standalone']);
       expect(REVIEW_TIERS).toEqual(['light', 'full']);
       expect(REVIEW_BACKENDS).toEqual(['agent', 'pipeline']);
       expect(REVIEW_BASE_SOURCES).toEqual(['merge-base', 'starting-commit']);
       expect(REVIEW_STAMP_STATES).toEqual(['stamped', 'unstamped', 'not-applicable']);
     });
     it('names the four full-tier reviewers, the three conditional ones and the light one', () => {
       expect(FULL_TIER_REVIEWER_IDS).toEqual(['compliance', 'bug', 'security', 'architecture']);
       expect(CONDITIONAL_REVIEWER_IDS).toEqual([
         'adversarial',
         'typescript-strict',
         'frontend-races',
       ]);
       expect(LIGHT_TIER_REVIEWER_ID).toBe('compliance-bug');
     });
     it('pins the attribution taxonomy shared by all four phases of the spec', () => {
       expect(ESCAPED_FROM_STAGES).toEqual(['spec', 'plan', 'execution', 'verification', 'none']);
       expect(FINDING_CLASSES).toEqual([
         'stale-claim',
         'edge-case',
         'weak-test',
         'collateral',
         'design',
         'other',
       ]);
     });
     it('types a receipt and both attribution record kinds', () => {
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
       const base = {
         schemaVersion: 1 as const,
         ts: '2026-11-20T00:00:00.000Z',
         ref: 'pr:1',
         branch: 'feat/x',
         head: receipt.diff.head,
         moment: 'standalone' as const,
         review: 'feat-x-bbbb',
         stamp: 'stamped' as const,
       };
       const records: ReviewAttributionRecord[] = [
         { ...base, kind: 'review', tier: 'full', blocking: 1 },
         {
           ...base,
           kind: 'finding',
           findingId: 'bug-a.ts-1',
           file: 'a.ts',
           findingClass: 'edge-case',
           escapedFrom: 'plan',
         },
       ];
       expect(records.map((r) => r.kind)).toEqual(['review', 'finding']);
     });
   });
   ```

3. Run `pnpm --filter @harness-engineering/types exec vitest run tests/pipeline-receipts.test.ts`. Observe failure (the exports do not exist).
4. Create `packages/types/src/pipeline-receipts.ts`:

   ```ts
   /**
    * Shift-left pipeline fidelity: review receipt, provenance and attribution contract
    * (docs/changes/shift-left-pipeline-fidelity/proposal.md, "Shared: receipts and attribution").
    * Zod validators and the gate live in packages/core/src/receipts/.
    */

   export const REVIEW_MOMENTS = ['phase', 'final', 'standalone'] as const;
   export type ReviewMoment = (typeof REVIEW_MOMENTS)[number];

   export const REVIEW_TIERS = ['light', 'full'] as const;
   export type ReviewTier = (typeof REVIEW_TIERS)[number];

   export const REVIEW_BACKENDS = ['agent', 'pipeline'] as const;
   export type ReviewBackend = (typeof REVIEW_BACKENDS)[number];

   /** How `diff.base` was resolved. `starting-commit` is the fallback when no default branch resolves. */
   export const REVIEW_BASE_SOURCES = ['merge-base', 'starting-commit'] as const;
   export type ReviewBaseSource = (typeof REVIEW_BASE_SOURCES)[number];

   /** Reviewers a `full` review always requires. */
   export const FULL_TIER_REVIEWER_IDS = ['compliance', 'bug', 'security', 'architecture'] as const;
   /** Reviewers a `full` review requires only when depth calibration activates them. */
   export const CONDITIONAL_REVIEWER_IDS = [
     'adversarial',
     'typescript-strict',
     'frontend-races',
   ] as const;
   /** The single reviewer of a `light` review: compliance and bug detection in one pass. */
   export const LIGHT_TIER_REVIEWER_ID = 'compliance-bug';

   export interface ReviewerRecord {
     /** compliance | bug | security | architecture | adversarial | typescript-strict | frontend-races | compliance-bug */
     id: string;
     /** Required by the tier and the activation set. */
     required: boolean;
     ran: boolean;
     /** Resolved model tier, recorded for visibility. */
     modelTier?: string;
     /** The reviewer's own findings file, relative to the receipt's directory. */
     findingsPath?: string;
     skippedReason?: string;
   }

   export interface ReviewReceipt {
     schemaVersion: 1;
     moment: ReviewMoment;
     tier: ReviewTier;
     backend: ReviewBackend;
     /** Resolved 40-character SHAs. */
     diff: { base: string; head: string; baseSource?: ReviewBaseSource };
     coldContext: boolean;
     priorFindingsSupplied: boolean;
     reviewers: ReviewerRecord[];
     blocking: number;
     advisory: number;
   }

   /** The earliest stage that should have caught a finding. `none`: only a review could have. */
   export const ESCAPED_FROM_STAGES = [
     'spec',
     'plan',
     'execution',
     'verification',
     'none',
   ] as const;
   export type EscapedFrom = (typeof ESCAPED_FROM_STAGES)[number];

   export const FINDING_CLASSES = [
     'stale-claim',
     'edge-case',
     'weak-test',
     'collateral',
     'design',
     'other',
   ] as const;
   export type FindingClass = (typeof FINDING_CLASSES)[number];

   /** Whether the reviewed PR carried a provenance stamp. `not-applicable`: not a standalone review. */
   export const REVIEW_STAMP_STATES = ['stamped', 'unstamped', 'not-applicable'] as const;
   export type ReviewStampState = (typeof REVIEW_STAMP_STATES)[number];

   interface ReviewAttributionBase {
     schemaVersion: 1;
     /** ISO timestamp of the append. */
     ts: string;
     /** `pr:<number>` when the PR is known, else `branch:<name>`. */
     ref: string;
     branch: string;
     head: string;
     moment: ReviewMoment;
     /** The review's label: `phase-0`, `final-all`, or a standalone directory name. */
     review: string;
     stamp: ReviewStampState;
   }

   /** One per review run, written even when the review found nothing blocking. */
   export interface ReviewRunAttribution extends ReviewAttributionBase {
     kind: 'review';
     tier: ReviewTier;
     blocking: number;
   }

   /** One per blocking finding. */
   export interface FindingAttribution extends ReviewAttributionBase {
     kind: 'finding';
     findingId: string;
     file: string;
     findingClass: FindingClass;
     escapedFrom: EscapedFrom;
   }

   export type ReviewAttributionRecord = ReviewRunAttribution | FindingAttribution;
   ```

5. Append to `packages/types/src/index.ts` (end of file):

   ```ts
   // --- Shift-left pipeline fidelity: review receipts, provenance, attribution ---
   export {
     REVIEW_MOMENTS,
     REVIEW_TIERS,
     REVIEW_BACKENDS,
     REVIEW_BASE_SOURCES,
     REVIEW_STAMP_STATES,
     FULL_TIER_REVIEWER_IDS,
     CONDITIONAL_REVIEWER_IDS,
     LIGHT_TIER_REVIEWER_ID,
     ESCAPED_FROM_STAGES,
     FINDING_CLASSES,
   } from './pipeline-receipts';
   export type {
     ReviewMoment,
     ReviewTier,
     ReviewBackend,
     ReviewBaseSource,
     ReviewStampState,
     ReviewerRecord,
     ReviewReceipt,
     EscapedFrom,
     FindingClass,
     ReviewRunAttribution,
     FindingAttribution,
     ReviewAttributionRecord,
   } from './pipeline-receipts';
   ```

6. Run the test again. Observe pass. Run `pnpm --filter @harness-engineering/types typecheck` and `pnpm --filter @harness-engineering/types build` (core resolves `@harness-engineering/types` through its build).
7. VALIDATE.
8. Commit: `feat(types): add review receipt, provenance and attribution contract`

### Task 2: Add receipt and findings-file schemas; give ReviewFinding its attribution fields

**Depends on:** Task 1 | **Files:** `packages/core/src/review/types/fan-out.ts`, `packages/core/src/receipts/schema.ts`, `packages/core/tests/receipts/schema.test.ts`

1. Create `packages/core/tests/receipts/schema.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import {
     BLOCKING_SEVERITIES,
     isBlockingSeverity,
     normalizeReviewPath,
     parseReviewReceipt,
     parseReviewerFindingsFile,
   } from '../../src/receipts/schema';

   const BASE = 'a'.repeat(40);
   const HEAD = 'b'.repeat(40);
   const receipt = (over: Record<string, unknown> = {}) => ({
     schemaVersion: 1,
     moment: 'phase',
     tier: 'light',
     backend: 'agent',
     diff: { base: BASE, head: HEAD },
     coldContext: true,
     priorFindingsSupplied: false,
     reviewers: [
       { id: 'compliance-bug', required: true, ran: true, findingsPath: 'compliance-bug.json' },
     ],
     blocking: 0,
     advisory: 0,
     ...over,
   });
   const finding = (over: Record<string, unknown> = {}) => ({
     id: 'bug-src/a.ts-3',
     file: 'src/a.ts',
     lineRange: [3, 4],
     severity: 'suggestion',
     title: 't',
     rationale: 'kept: extra finding fields pass through',
     ...over,
   });
   const file = (findings: unknown[]) => ({
     schemaVersion: 1,
     reviewerId: 'bug',
     examinedFiles: ['src/a.ts'],
     findings,
   });

   describe('review receipt schema', () => {
     it('accepts a well-formed receipt and keeps diff.baseSource', () => {
       const r = parseReviewReceipt(
         receipt({ diff: { base: BASE, head: HEAD, baseSource: 'starting-commit' } })
       );
       expect(r.ok && r.value.diff.baseSource).toBe('starting-commit');
     });
     it.each([
       ['an abbreviated sha', { diff: { base: 'abc1234', head: HEAD } }],
       ['an unknown tier', { tier: 'deep' }],
       ['an unknown moment', { moment: 'nightly' }],
       ['no reviewers', { reviewers: [] }],
       ['a negative count', { blocking: -1 }],
       ['schemaVersion 2', { schemaVersion: 2 }],
     ])('rejects %s and names the field', (_name, over) => {
       const r = parseReviewReceipt(receipt(over));
       expect(r.ok).toBe(false);
       if (!r.ok) expect(r.error.message).toMatch(/^invalid review receipt: \S+: /);
     });
     it('rejects a non-object', () => {
       expect(parseReviewReceipt('nope').ok).toBe(false);
     });
   });

   describe('reviewer findings file schema', () => {
     it('accepts suggestions without attribution and keeps unknown finding fields', () => {
       const r = parseReviewerFindingsFile(file([finding()]));
       expect(r.ok).toBe(true);
       if (r.ok)
         expect((r.value.findings[0] as unknown as { rationale: string }).rationale).toMatch(
           /^kept/
         );
     });
     it.each(BLOCKING_SEVERITIES)('requires findingClass and escapedFrom on a %s finding', (s) => {
       const bare = parseReviewerFindingsFile(file([finding({ severity: s })]));
       expect(bare.ok).toBe(false);
       if (!bare.ok) expect(bare.error.message).toMatch(/findingClass.*escapedFrom/s);
       const tagged = parseReviewerFindingsFile(
         file([finding({ severity: s, findingClass: 'edge-case', escapedFrom: 'plan' })])
       );
       expect(tagged.ok).toBe(true);
     });
     it('rejects an unknown class or stage', () => {
       const f = finding({ severity: 'critical', findingClass: 'typo', escapedFrom: 'review' });
       expect(parseReviewerFindingsFile(file([f])).ok).toBe(false);
     });
     it('rejects a reviewer id that is not a safe file stem', () => {
       expect(parseReviewerFindingsFile({ ...file([]), reviewerId: '../bug' }).ok).toBe(false);
     });
   });

   describe('helpers', () => {
     it('treats critical and important as blocking, suggestion as advisory', () => {
       expect(BLOCKING_SEVERITIES).toEqual(['critical', 'important']);
       expect(isBlockingSeverity('suggestion')).toBe(false);
     });
     it('normalizes separators and a leading ./ so win32 paths compare equal', () => {
       expect(normalizeReviewPath('.\\src\\a.ts')).toBe('src/a.ts');
       expect(normalizeReviewPath('./src/a.ts')).toBe('src/a.ts');
     });
   });
   ```

2. Run `pnpm --filter @harness-engineering/core exec vitest run tests/receipts/schema.test.ts`. Observe failure (module not found).
3. In `packages/core/src/review/types/fan-out.ts`, add an import below the existing `import type { ContextBundle, ReviewDomain } from './context';`:

   ```ts
   import type { EscapedFrom, FindingClass } from '@harness-engineering/types';
   ```

   and add these two members to `interface ReviewFinding`, directly above `integrityViolations?:`:

   ```ts
     /**
      * What kind of miss this finding is (shift-left pipeline fidelity). Optional so existing
      * producers and stored findings stay valid; a review that emits a receipt sets it on every
      * critical or important finding.
      */
     findingClass?: FindingClass;
     /**
      * The earliest pipeline stage that should have caught this finding. A reviewer's estimate
      * against references/attribution-rubric.md; read as a ranking of stages, not exact counts.
      */
     escapedFrom?: EscapedFrom;
   ```

4. Create `packages/core/src/receipts/schema.ts`:

   ```ts
   import { z } from 'zod';
   import {
     ESCAPED_FROM_STAGES,
     FINDING_CLASSES,
     REVIEW_BACKENDS,
     REVIEW_BASE_SOURCES,
     REVIEW_MOMENTS,
     REVIEW_TIERS,
     type ReviewReceipt,
   } from '@harness-engineering/types';
   import type { ReviewFinding } from '../review/types';
   import type { Result } from '../shared/result';
   import { Ok, Err } from '../shared/result';

   /** Severities that block a review. `suggestion` is advisory. */
   export const BLOCKING_SEVERITIES = ['critical', 'important'] as const;

   export function isBlockingSeverity(severity: string): boolean {
     return (BLOCKING_SEVERITIES as readonly string[]).includes(severity);
   }

   /** Project-relative POSIX form, so a path written on win32 compares equal to git's output. */
   export function normalizeReviewPath(p: string): string {
     return p.replace(/\\/g, '/').replace(/^\.\//, '');
   }

   /** The part of a ReviewFinding that receipt consumers read. Other finding fields pass through. */
   export type ReceiptFinding = Pick<
     ReviewFinding,
     'id' | 'file' | 'lineRange' | 'severity' | 'title' | 'findingClass' | 'escapedFrom'
   >;

   /** What each reviewer writes: its findings and the diff files it read. */
   export interface ReviewerFindingsFile {
     schemaVersion: 1;
     reviewerId: string;
     examinedFiles: string[];
     findings: ReceiptFinding[];
   }

   const FULL_SHA = /^[0-9a-f]{40}$/;
   /** A reviewer id is also a file stem (`<id>.json`), so it must be path-safe. */
   export const REVIEWER_ID_PATTERN = /^[a-z][a-z0-9-]*$/;
   const reviewerId = z.string().regex(REVIEWER_ID_PATTERN, 'must match ^[a-z][a-z0-9-]*$');
   const sha = z.string().regex(FULL_SHA, 'must be a resolved 40-character sha');
   const count = z.number().int().nonnegative();

   export const ReviewerRecordSchema = z.object({
     id: reviewerId,
     required: z.boolean(),
     ran: z.boolean(),
     modelTier: z.string().min(1).optional(),
     findingsPath: z.string().min(1).optional(),
     skippedReason: z.string().min(1).optional(),
   });

   export const ReviewReceiptSchema = z.object({
     schemaVersion: z.literal(1),
     moment: z.enum(REVIEW_MOMENTS),
     tier: z.enum(REVIEW_TIERS),
     backend: z.enum(REVIEW_BACKENDS),
     diff: z.object({
       base: sha,
       head: sha,
       baseSource: z.enum(REVIEW_BASE_SOURCES).optional(),
     }),
     coldContext: z.boolean(),
     priorFindingsSupplied: z.boolean(),
     reviewers: z.array(ReviewerRecordSchema).min(1),
     blocking: count,
     advisory: count,
   });

   export const ReceiptFindingSchema = z
     .looseObject({
       id: z.string().min(1),
       file: z.string().min(1),
       lineRange: z.tuple([count, count]),
       severity: z.enum(['critical', 'important', 'suggestion']),
       title: z.string().min(1),
       findingClass: z.enum(FINDING_CLASSES).optional(),
       escapedFrom: z.enum(ESCAPED_FROM_STAGES).optional(),
     })
     .superRefine((f, ctx) => {
       if (!isBlockingSeverity(f.severity)) return;
       for (const key of ['findingClass', 'escapedFrom'] as const) {
         if (f[key] === undefined) {
           ctx.addIssue({
             code: 'custom',
             path: [key],
             message: `a ${f.severity} finding must carry ${key}`,
           });
         }
       }
     });

   export const ReviewerFindingsFileSchema = z.object({
     schemaVersion: z.literal(1),
     reviewerId,
     examinedFiles: z.array(z.string().min(1)),
     findings: z.array(ReceiptFindingSchema),
   });

   function issueText(error: z.ZodError): string {
     return error.issues
       .map((i) => `${i.path.map(String).join('.') || '(root)'}: ${i.message}`)
       .join('; ');
   }

   export function parseReviewReceipt(raw: unknown): Result<ReviewReceipt, Error> {
     const r = ReviewReceiptSchema.safeParse(raw);
     if (r.success) return Ok(r.data as unknown as ReviewReceipt);
     return Err(new Error(`invalid review receipt: ${issueText(r.error)}`));
   }

   export function parseReviewerFindingsFile(raw: unknown): Result<ReviewerFindingsFile, Error> {
     const r = ReviewerFindingsFileSchema.safeParse(raw);
     if (r.success) return Ok(r.data as unknown as ReviewerFindingsFile);
     return Err(new Error(`invalid reviewer findings file: ${issueText(r.error)}`));
   }
   ```

5. Run the test. Observe pass. Run `pnpm --filter @harness-engineering/core typecheck`.
6. VALIDATE. Run `harness check-deps`.
7. Commit: `feat(core): add review receipt and reviewer findings-file schemas`

### Task 3: Gate a receipt on HEAD, the reviewer roster and the final-moment rules

**Depends on:** Task 2 | **Files:** `packages/core/src/receipts/review-gate.ts`, `packages/core/tests/receipts/review-gate.test.ts`

1. Create `packages/core/tests/receipts/review-gate.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { validateReviewReceipt, type ReviewGateContext } from '../../src/receipts/review-gate';

   export const BASE = 'a'.repeat(40);
   export const HEAD = 'b'.repeat(40);
   const FULL = ['compliance', 'bug', 'security', 'architecture'];

   const record = (id: string, over: Record<string, unknown> = {}) => ({
     id,
     required: true,
     ran: true,
     findingsPath: `${id}.json`,
     ...over,
   });
   const receipt = (over: Record<string, unknown> = {}) => ({
     schemaVersion: 1,
     moment: 'phase',
     tier: 'full',
     backend: 'agent',
     diff: { base: BASE, head: HEAD },
     coldContext: true,
     priorFindingsSupplied: false,
     reviewers: FULL.map((id) => record(id)),
     blocking: 0,
     advisory: 0,
     ...over,
   });
   const findingsFile = (id: string, over: Record<string, unknown> = {}) =>
     JSON.stringify({
       schemaVersion: 1,
       reviewerId: id,
       examinedFiles: ['src/a.ts'],
       findings: [],
       ...over,
     });
   /** A context in which every reviewer wrote a valid file over the one diff file. */
   const ctx = (over: Partial<ReviewGateContext> = {}): ReviewGateContext => ({
     head: HEAD,
     diffFiles: ['src/a.ts', 'src/b.ts'],
     readFindings: (p) => findingsFile(p.replace(/\.json$/, '')),
     ...over,
   });
   const codes = (r: ReturnType<typeof validateReviewReceipt>) => r.failures.map((f) => f.code);

   describe('validateReviewReceipt: receipt, HEAD, roster, final moment', () => {
     it('passes a full receipt whose four core reviewers ran, and reports the denominator', () => {
       const r = validateReviewReceipt(receipt(), ctx());
       expect(r.failures).toEqual([]);
       expect(r).toMatchObject({ pass: true, reviewersRun: 4, reviewersRequired: 4 });
     });
     it('fails an invalid receipt with RECEIPT_INVALID and a zero denominator', () => {
       const r = validateReviewReceipt({ schemaVersion: 1 }, ctx());
       expect(codes(r)).toEqual(['RECEIPT_INVALID']);
       expect(r).toMatchObject({ pass: false, reviewersRun: 0, reviewersRequired: 0 });
     });
     it('fails when diff.head is not the current HEAD (SC: stale receipt)', () => {
       const r = validateReviewReceipt(receipt(), ctx({ head: 'c'.repeat(40) }));
       expect(codes(r)).toEqual(['HEAD_MISMATCH']);
     });
     it('SC2: a required reviewer that did not run fails and is named', () => {
       const reviewers = FULL.map((id) =>
         id === 'security'
           ? { id, required: true, ran: false, skippedReason: 'dispatch failed' }
           : record(id)
       );
       const r = validateReviewReceipt(receipt({ reviewers }), ctx());
       expect(r.failures).toEqual([
         expect.objectContaining({ code: 'REQUIRED_REVIEWER_NOT_RUN', reviewerId: 'security' }),
       ]);
       expect(r.failures[0]?.message).toContain('dispatch failed');
       expect(r).toMatchObject({ reviewersRun: 3, reviewersRequired: 4 });
     });
     it('SC1: a full receipt that omits a core reviewer, or lists it as not required, fails', () => {
       const missing = receipt({ reviewers: FULL.slice(0, 3).map((id) => record(id)) });
       expect(validateReviewReceipt(missing, ctx()).failures).toEqual([
         expect.objectContaining({ code: 'CORE_REVIEWER_MISSING', reviewerId: 'architecture' }),
       ]);
       const optional = receipt({
         reviewers: FULL.map((id) =>
           id === 'bug'
             ? { id, required: false, ran: false, skippedReason: 'not needed' }
             : record(id)
         ),
       });
       expect(codes(validateReviewReceipt(optional, ctx()))).toEqual(['CORE_REVIEWER_MISSING']);
     });
     it('accepts an inactive conditional reviewer listed as not required', () => {
       const reviewers = [
         ...FULL.map((id) => record(id)),
         { id: 'frontend-races', required: false, ran: false, skippedReason: 'no async-UI signal' },
       ];
       expect(validateReviewReceipt(receipt({ reviewers }), ctx()).pass).toBe(true);
     });
     it('SC5: a light receipt needs exactly one required reviewer', () => {
       const one = receipt({ tier: 'light', reviewers: [record('compliance-bug')] });
       expect(validateReviewReceipt(one, ctx()).pass).toBe(true);
       const two = receipt({ tier: 'light', reviewers: [record('compliance'), record('bug')] });
       expect(codes(validateReviewReceipt(two, ctx()))).toEqual(['LIGHT_TIER_ROSTER']);
     });
     it('fails a receipt that lists one reviewer id twice', () => {
       const reviewers = [
         ...FULL.map((id) => record(id)),
         record('bug', { findingsPath: 'x.json' }),
       ];
       expect(codes(validateReviewReceipt(receipt({ reviewers }), ctx()))).toContain(
         'DUPLICATE_REVIEWER'
       );
     });
     it.each([
       ['a light tier', { tier: 'light', reviewers: [record('compliance-bug')] }, 'FINAL_NOT_FULL'],
       ['a warm context', { coldContext: false }, 'FINAL_NOT_COLD'],
       ['prior findings supplied', { priorFindingsSupplied: true }, 'FINAL_PRIOR_FINDINGS'],
     ])('SC4: a final receipt with %s fails', (_name, over, code) => {
       const r = validateReviewReceipt(receipt({ moment: 'final', ...over }), ctx());
       expect(codes(r)).toEqual([code]);
     });
     it('SC4: a cold, full final receipt passes; the same flags on a phase receipt are not checked', () => {
       expect(validateReviewReceipt(receipt({ moment: 'final' }), ctx()).pass).toBe(true);
       const warmPhase = receipt({ coldContext: false, priorFindingsSupplied: true });
       expect(validateReviewReceipt(warmPhase, ctx()).pass).toBe(true);
     });
     it('SC15: a receipt recording backend agent is judged by the same rules', () => {
       const agent = validateReviewReceipt(receipt({ backend: 'agent' }), ctx());
       const pipeline = validateReviewReceipt(receipt({ backend: 'pipeline' }), ctx());
       expect(agent.pass).toBe(true);
       expect(pipeline.failures).toEqual(agent.failures);
     });
   });
   ```

2. Run `pnpm --filter @harness-engineering/core exec vitest run tests/receipts/review-gate.test.ts`. Observe failure.
3. Create `packages/core/src/receipts/review-gate.ts`:

   ```ts
   import { FULL_TIER_REVIEWER_IDS, type ReviewReceipt } from '@harness-engineering/types';
   import { parseReviewReceipt } from './schema';

   /**
    * The review receipt gate (spec D3, D4). The receipt is a set of claims. The caller recomputes
    * what it can (current HEAD, the diff's file set, each reviewer's findings file) and passes it
    * in as `context`; this function compares. It is pure and reads no environment, so it passes
    * or fails identically with no model credential.
    *
    * What it cannot prove: that reviewers ran in separate contexts. One context that deliberately
    * writes four files passes. The stamp makes the claim visible; the standalone review measures
    * whether it held.
    */
   export const REVIEW_GATE_FAILURE_CODES = [
     'RECEIPT_MISSING',
     'RECEIPT_INVALID',
     'HEAD_MISMATCH',
     'REQUIRED_REVIEWER_NOT_RUN',
     'CORE_REVIEWER_MISSING',
     'LIGHT_TIER_ROSTER',
     'DUPLICATE_REVIEWER',
     'FINAL_NOT_FULL',
     'FINAL_NOT_COLD',
     'FINAL_PRIOR_FINDINGS',
     'DIFF_UNRESOLVED',
     'EMPTY_DIFF',
     'FINDINGS_FILE_MISSING',
     'FINDINGS_PATH_INVALID',
     'FINDINGS_FILE_SHARED',
     'FINDINGS_FILE_INVALID',
     'FINDINGS_REVIEWER_MISMATCH',
     'EXAMINED_FILES_EMPTY',
     'EXAMINED_OUTSIDE_DIFF',
   ] as const;
   export type ReviewGateFailureCode = (typeof REVIEW_GATE_FAILURE_CODES)[number];

   export interface ReviewGateFailure {
     code: ReviewGateFailureCode;
     /** The reviewer the failure is about, when it is about one. */
     reviewerId?: string;
     message: string;
   }

   export interface ReviewGateContext {
     /** `git rev-parse HEAD`, resolved by the caller. Empty when git could not resolve it. */
     head: string;
     /** `git diff --name-only <base>..<head>`, recomputed by the caller. undefined: could not compute. */
     diffFiles: readonly string[] | undefined;
     /** Read a findings file named by the receipt (relative to its directory). undefined: absent. */
     readFindings: (findingsPath: string) => string | undefined;
   }

   export interface ReviewGateResult {
     pass: boolean;
     failures: ReviewGateFailure[];
     /** Required reviewers that ran. */
     reviewersRun: number;
     /** Reviewers the receipt marks required. */
     reviewersRequired: number;
     receipt?: ReviewReceipt;
   }

   export function gateFailure(
     code: ReviewGateFailureCode,
     message: string,
     reviewerId?: string
   ): ReviewGateFailure {
     return reviewerId === undefined ? { code, message } : { code, reviewerId, message };
   }

   function headFailures(receipt: ReviewReceipt, context: ReviewGateContext): ReviewGateFailure[] {
     if (receipt.diff.head === context.head) return [];
     const now = context.head === '' ? 'could not be resolved' : `is ${context.head}`;
     return [
       gateFailure(
         'HEAD_MISMATCH',
         `the receipt reviewed ${receipt.diff.head} but HEAD ${now}; the review is stale`
       ),
     ];
   }

   function rosterFailures(receipt: ReviewReceipt): ReviewGateFailure[] {
     const out: ReviewGateFailure[] = [];
     const required = receipt.reviewers.filter((r) => r.required);
     if (receipt.tier === 'full') {
       for (const id of FULL_TIER_REVIEWER_IDS) {
         if (!required.some((r) => r.id === id)) {
           out.push(
             gateFailure(
               'CORE_REVIEWER_MISSING',
               `tier full requires reviewer "${id}" with required: true`,
               id
             )
           );
         }
       }
     } else if (required.length !== 1) {
       out.push(
         gateFailure(
           'LIGHT_TIER_ROSTER',
           `tier light requires exactly one required reviewer; the receipt lists ${required.length}`
         )
       );
     }
     const seen = new Set<string>();
     for (const r of receipt.reviewers) {
       if (seen.has(r.id)) {
         out.push(gateFailure('DUPLICATE_REVIEWER', `reviewer "${r.id}" is listed twice`, r.id));
       }
       seen.add(r.id);
     }
     for (const r of required) {
       if (r.ran) continue;
       const why = r.skippedReason === undefined ? '' : ` (${r.skippedReason})`;
       out.push(
         gateFailure(
           'REQUIRED_REVIEWER_NOT_RUN',
           `required reviewer "${r.id}" did not run${why}`,
           r.id
         )
       );
     }
     return out;
   }

   function finalFailures(receipt: ReviewReceipt): ReviewGateFailure[] {
     if (receipt.moment !== 'final') return [];
     const out: ReviewGateFailure[] = [];
     if (receipt.tier !== 'full') {
       out.push(
         gateFailure('FINAL_NOT_FULL', `the final review must be tier full, not ${receipt.tier}`)
       );
     }
     if (!receipt.coldContext) {
       out.push(gateFailure('FINAL_NOT_COLD', 'the final review must run with coldContext: true'));
     }
     if (receipt.priorFindingsSupplied) {
       out.push(
         gateFailure(
           'FINAL_PRIOR_FINDINGS',
           'the final review must not supply prior findings to any reviewer'
         )
       );
     }
     return out;
   }

   export function validateReviewReceipt(
     receipt: unknown,
     context: ReviewGateContext
   ): ReviewGateResult {
     const parsed = parseReviewReceipt(receipt);
     if (!parsed.ok) {
       return {
         pass: false,
         failures: [gateFailure('RECEIPT_INVALID', parsed.error.message)],
         reviewersRun: 0,
         reviewersRequired: 0,
       };
     }
     const r = parsed.value;
     const failures = [...headFailures(r, context), ...rosterFailures(r), ...finalFailures(r)];
     const required = r.reviewers.filter((x) => x.required);
     return {
       pass: failures.length === 0,
       failures,
       reviewersRun: required.filter((x) => x.ran).length,
       reviewersRequired: required.length,
       receipt: r,
     };
   }
   ```

4. Run the test. Observe pass. Run `pnpm --filter @harness-engineering/core typecheck`.
5. VALIDATE.
6. Commit: `feat(core): gate review receipts on HEAD, reviewer roster and final-review rules`

### Task 4: Gate each reviewer's findings file against the recomputed diff

**Depends on:** Task 3 | **Files:** `packages/core/src/receipts/review-gate.ts`, `packages/core/tests/receipts/review-gate.test.ts`

1. Append to `packages/core/tests/receipts/review-gate.test.ts` (it reuses `receipt`, `record`, `ctx`, `codes`, `findingsFile`, `FULL` from the top of the file):

   ```ts
   describe('validateReviewReceipt: reviewer findings files', () => {
     const only = (id: string, text: string | undefined): ReviewGateContext['readFindings'] => {
       return (p) => (p === `${id}.json` ? text : findingsFile(p.replace(/\.json$/, '')));
     };
     it('SC3: a reviewer marked ran with no findings file fails and is named', () => {
       const r = validateReviewReceipt(receipt(), ctx({ readFindings: only('bug', undefined) }));
       expect(r.failures).toEqual([
         expect.objectContaining({ code: 'FINDINGS_FILE_MISSING', reviewerId: 'bug' }),
       ]);
     });
     it('SC3: a reviewer marked ran that names no findingsPath fails', () => {
       const reviewers = FULL.map((id) =>
         id === 'bug' ? { id, required: true, ran: true } : record(id)
       );
       expect(codes(validateReviewReceipt(receipt({ reviewers }), ctx()))).toEqual([
         'FINDINGS_FILE_MISSING',
       ]);
     });
     it.each([
       ['not JSON', '{nope'],
       ['the wrong shape', JSON.stringify({ findings: [] })],
       [
         'a blocking finding with no attribution (SC7)',
         findingsFile('bug', {
           findings: [
             { id: 'x', file: 'src/a.ts', lineRange: [1, 1], severity: 'critical', title: 't' },
           ],
         }),
       ],
     ])('SC3: a findings file that is %s is invalid', (_name, text) => {
       const r = validateReviewReceipt(receipt(), ctx({ readFindings: only('bug', text) }));
       expect(codes(r)).toEqual(['FINDINGS_FILE_INVALID']);
     });
     it("fails a findings file written under another reviewer's id", () => {
       const r = validateReviewReceipt(
         receipt(),
         ctx({ readFindings: only('bug', findingsFile('security')) })
       );
       expect(codes(r)).toEqual(['FINDINGS_REVIEWER_MISMATCH']);
     });
     it('fails two reviewers that name the same findings file', () => {
       const reviewers = FULL.map((id) => record(id, { findingsPath: 'all.json' }));
       const r = validateReviewReceipt(
         receipt({ reviewers }),
         ctx({ readFindings: () => findingsFile('compliance') })
       );
       expect(codes(r).filter((c) => c === 'FINDINGS_FILE_SHARED')).toHaveLength(3);
     });
     it.each(['/etc/passwd', 'C:\\x\\bug.json', '../other/bug.json', 'a/../../bug.json'])(
       'refuses findings path %s without reading it',
       (findingsPath) => {
         const reviewers = FULL.map((id) =>
           id === 'bug' ? record(id, { findingsPath }) : record(id)
         );
         let read = 0;
         const r = validateReviewReceipt(
           receipt({ reviewers }),
           ctx({
             readFindings: (p) => {
               if (p === findingsPath) read++;
               return findingsFile(p.replace(/\.json$/, ''));
             },
           })
         );
         expect(codes(r)).toEqual(['FINDINGS_PATH_INVALID']);
         expect(read).toBe(0);
       }
     );
     it('SC3: an examined file outside the recomputed diff fails; win32 separators still match', () => {
       const outside = findingsFile('bug', { examinedFiles: ['src/a.ts', 'src/zzz.ts'] });
       const r = validateReviewReceipt(receipt(), ctx({ readFindings: only('bug', outside) }));
       expect(r.failures).toEqual([
         expect.objectContaining({ code: 'EXAMINED_OUTSIDE_DIFF', reviewerId: 'bug' }),
       ]);
       expect(r.failures[0]?.message).toContain('src/zzz.ts');
       const win = findingsFile('bug', { examinedFiles: ['.\\src\\b.ts'] });
       expect(validateReviewReceipt(receipt(), ctx({ readFindings: only('bug', win) })).pass).toBe(
         true
       );
     });
     it('fails a reviewer that examined nothing (an empty list is not evidence of a review)', () => {
       const empty = findingsFile('bug', { examinedFiles: [] });
       const r = validateReviewReceipt(receipt(), ctx({ readFindings: only('bug', empty) }));
       expect(codes(r)).toEqual(['EXAMINED_FILES_EMPTY']);
     });
     it('fails closed when the diff could not be recomputed or changes no files', () => {
       expect(codes(validateReviewReceipt(receipt(), ctx({ diffFiles: undefined })))).toEqual([
         'DIFF_UNRESOLVED',
       ]);
       expect(codes(validateReviewReceipt(receipt(), ctx({ diffFiles: [] })))).toContain(
         'EMPTY_DIFF'
       );
     });
     it('does not read a file for a reviewer that did not run', () => {
       const reviewers = [
         ...FULL.map((id) => record(id)),
         { id: 'adversarial', required: false, ran: false, skippedReason: 'quick depth' },
       ];
       const read: string[] = [];
       validateReviewReceipt(
         receipt({ reviewers }),
         ctx({
           readFindings: (p) => {
             read.push(p);
             return findingsFile(p.replace(/\.json$/, ''));
           },
         })
       );
       expect(read).not.toContain('adversarial.json');
       expect(read).toHaveLength(4);
     });
   });
   ```

2. Run the test file. Observe the new block fail (the Task 3 block still passes).
3. In `packages/core/src/receipts/review-gate.ts`:
   - Change the schema import to:

     ```ts
     import { normalizeReviewPath, parseReviewReceipt, parseReviewerFindingsFile } from './schema';
     ```

   - Change the types import to `import { FULL_TIER_REVIEWER_IDS, type ReviewReceipt, type ReviewerRecord } from '@harness-engineering/types';`
   - Add above `validateReviewReceipt`:

     ```ts
     /** Why a findings path may not be read, or undefined when it stays inside the receipt directory. */
     function findingsPathProblem(findingsPath: string): string | undefined {
       const p = findingsPath.replace(/\\/g, '/');
       if (p.startsWith('/') || /^[A-Za-z]:/.test(p)) {
         return 'must be relative to the receipt directory';
       }
       if (p.split('/').includes('..')) return 'must not leave the receipt directory';
       return undefined;
     }

     function reviewerFileFailures(
       r: ReviewerRecord,
       context: ReviewGateContext,
       diffSet: ReadonlySet<string> | undefined,
       usedPaths: Set<string>
     ): ReviewGateFailure[] {
       if (r.findingsPath === undefined) {
         return [
           gateFailure(
             'FINDINGS_FILE_MISSING',
             `reviewer "${r.id}" is marked ran but names no findings file`,
             r.id
           ),
         ];
       }
       const problem = findingsPathProblem(r.findingsPath);
       if (problem !== undefined) {
         return [
           gateFailure(
             'FINDINGS_PATH_INVALID',
             `findings path "${r.findingsPath}" of reviewer "${r.id}" ${problem}`,
             r.id
           ),
         ];
       }
       const key = normalizeReviewPath(r.findingsPath);
       if (usedPaths.has(key)) {
         return [
           gateFailure(
             'FINDINGS_FILE_SHARED',
             `reviewer "${r.id}" names findings file "${r.findingsPath}", which another reviewer already names; each reviewer writes its own`,
             r.id
           ),
         ];
       }
       usedPaths.add(key);
       const text = context.readFindings(r.findingsPath);
       if (text === undefined) {
         return [
           gateFailure(
             'FINDINGS_FILE_MISSING',
             `findings file "${r.findingsPath}" of reviewer "${r.id}" does not exist`,
             r.id
           ),
         ];
       }
       let json: unknown;
       try {
         json = JSON.parse(text);
       } catch {
         return [
           gateFailure(
             'FINDINGS_FILE_INVALID',
             `findings file "${r.findingsPath}" of reviewer "${r.id}" is not JSON`,
             r.id
           ),
         ];
       }
       const parsed = parseReviewerFindingsFile(json);
       if (!parsed.ok) {
         return [
           gateFailure(
             'FINDINGS_FILE_INVALID',
             `findings file of reviewer "${r.id}": ${parsed.error.message}`,
             r.id
           ),
         ];
       }
       const out: ReviewGateFailure[] = [];
       if (parsed.value.reviewerId !== r.id) {
         out.push(
           gateFailure(
             'FINDINGS_REVIEWER_MISMATCH',
             `findings file "${r.findingsPath}" was written by "${parsed.value.reviewerId}", not "${r.id}"`,
             r.id
           )
         );
       }
       if (parsed.value.examinedFiles.length === 0) {
         out.push(
           gateFailure('EXAMINED_FILES_EMPTY', `reviewer "${r.id}" lists no examined files`, r.id)
         );
       }
       if (diffSet !== undefined) {
         const outside = parsed.value.examinedFiles
           .map(normalizeReviewPath)
           .filter((f) => !diffSet.has(f));
         if (outside.length > 0) {
           const shown = outside.slice(0, 5).join(', ');
           const more = outside.length > 5 ? ` (+${outside.length - 5} more)` : '';
           out.push(
             gateFailure(
               'EXAMINED_OUTSIDE_DIFF',
               `reviewer "${r.id}" lists files that are not in the diff: ${shown}${more}`,
               r.id
             )
           );
         }
       }
       return out;
     }

     function findingsFailures(
       receipt: ReviewReceipt,
       context: ReviewGateContext
     ): ReviewGateFailure[] {
       const out: ReviewGateFailure[] = [];
       let diffSet: Set<string> | undefined;
       if (context.diffFiles === undefined) {
         out.push(
           gateFailure(
             'DIFF_UNRESOLVED',
             `could not recompute the file set of ${receipt.diff.base}..${receipt.diff.head}`
           )
         );
       } else {
         diffSet = new Set(context.diffFiles.map(normalizeReviewPath));
         if (diffSet.size === 0) {
           out.push(
             gateFailure(
               'EMPTY_DIFF',
               `${receipt.diff.base}..${receipt.diff.head} changes no files; nothing was reviewed`
             )
           );
         }
       }
       const usedPaths = new Set<string>();
       for (const r of receipt.reviewers) {
         if (r.ran) out.push(...reviewerFileFailures(r, context, diffSet, usedPaths));
       }
       return out;
     }
     ```

   - In `validateReviewReceipt`, change the `failures` line to:

     ```ts
     const failures = [
       ...headFailures(r, context),
       ...rosterFailures(r),
       ...finalFailures(r),
       ...findingsFailures(r, context),
     ];
     ```

4. Run the test file. Observe every block pass. Run `pnpm --filter @harness-engineering/core typecheck`.
5. VALIDATE.
6. Commit: `feat(core): gate reviewer findings files against the recomputed diff`

### Task 5: Select the review tier per phase

**Depends on:** Task 1 | **Files:** `packages/core/src/review/tier-selector.ts`, `packages/core/src/review/index.ts`, `packages/core/tests/review/tier-selector.test.ts`

1. Create `packages/core/tests/review/tier-selector.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import {
     collectPackageEntryPoints,
     selectReviewTier,
     type SelectReviewTierInput,
   } from '../../src/review/tier-selector';
   import type { DiffInfo } from '../../src/review/types';

   function diff(perFile: Record<string, string>): DiffInfo {
     return {
       changedFiles: Object.keys(perFile),
       newFiles: [],
       deletedFiles: [],
       totalDiffLines: Object.values(perFile).reduce((n, s) => n + s.split('\n').length, 0),
       fileDiffs: new Map(Object.entries(perFile)),
     };
   }
   const quiet = diff({ 'packages/core/src/util/format.ts': '+const width = 2;' });
   const input = (over: Partial<SelectReviewTierInput> = {}): SelectReviewTierInput => ({
     moment: 'phase',
     diff: quiet,
     commitMessage: 'refactor: tidy formatting helper',
     ...over,
   });

   describe('selectReviewTier', () => {
     it('is light when no rule holds, and says why not with an empty reason list', () => {
       expect(selectReviewTier(input({ complexity: 'medium', rigor: 'standard' }))).toEqual({
         tier: 'light',
         reasons: [],
       });
     });
     it('is full when the diff matches a risk keyword', () => {
       const d = diff({ 'src/login.ts': '+const token = read();' });
       expect(selectReviewTier(input({ diff: d }))).toEqual({
         tier: 'full',
         reasons: ['risk-keyword:token'],
       });
     });
     it('is full when the commit message alone matches a risk keyword', () => {
       expect(selectReviewTier(input({ commitMessage: 'feat: add webhook' })).tier).toBe('full');
     });
     it('is full when the diff touches src/index.ts at any package root', () => {
       const d = diff({ 'packages/core/src/index.ts': '+export * from "./x";' });
       expect(selectReviewTier(input({ diff: d })).reasons).toEqual([
         'entry-point:packages/core/src/index.ts',
       ]);
       const nested = diff({ 'packages/core/src/review/index.ts': '+export {};' });
       expect(selectReviewTier(input({ diff: nested })).tier).toBe('light');
     });
     it('is full when the diff touches a file named by a package.json entry field', () => {
       const d = diff({ 'packages\\cli\\bin\\run.js': '+x' });
       const r = selectReviewTier(input({ diff: d, entryPoints: ['packages/cli/bin/run.js'] }));
       expect(r).toEqual({ tier: 'full', reasons: ['entry-point:packages/cli/bin/run.js'] });
     });
     it('is full for high complexity and for thorough rigor, and lists every reason', () => {
       expect(selectReviewTier(input({ complexity: 'high' })).reasons).toEqual(['complexity:high']);
       expect(selectReviewTier(input({ rigor: 'thorough' })).reasons).toEqual(['rigor:thorough']);
       expect(selectReviewTier(input({ complexity: 'high', rigor: 'thorough' })).reasons).toEqual([
         'complexity:high',
         'rigor:thorough',
       ]);
     });
     it('fast rigor does not lower a phase that a rule makes full', () => {
       expect(selectReviewTier(input({ complexity: 'high', rigor: 'fast' })).tier).toBe('full');
     });
     it.each(['fast', 'standard', 'thorough'] as const)(
       'the final review is full at rigor %s, whatever the diff',
       (rigor) => {
         expect(selectReviewTier(input({ moment: 'final', rigor }))).toEqual({
           tier: 'full',
           reasons: ['moment:final'],
         });
       }
     );
     it('a standalone review is full (the skill lowers it only when it cannot dispatch)', () => {
       expect(selectReviewTier(input({ moment: 'standalone' })).tier).toBe('full');
     });
   });

   describe('collectPackageEntryPoints', () => {
     it('collects main, bin and every exports leaf, relative to the package directory', () => {
       const pkg = {
         main: './dist/index.js',
         bin: { harness: 'dist/bin/harness.js' },
         exports: {
           '.': { import: './dist/index.mjs', require: './dist/index.js' },
           './x': './x.js',
         },
       };
       expect(collectPackageEntryPoints(pkg, 'packages/cli')).toEqual([
         'packages/cli/dist/bin/harness.js',
         'packages/cli/dist/index.js',
         'packages/cli/dist/index.mjs',
         'packages/cli/x.js',
       ]);
     });
     it('accepts a string bin, a root package and junk without throwing', () => {
       expect(collectPackageEntryPoints({ bin: './cli.js' })).toEqual(['cli.js']);
       expect(collectPackageEntryPoints(null)).toEqual([]);
       expect(collectPackageEntryPoints({ exports: 7 })).toEqual([]);
     });
   });
   ```

2. Run `pnpm --filter @harness-engineering/core exec vitest run tests/review/tier-selector.test.ts`. Observe failure.
3. Create `packages/core/src/review/tier-selector.ts`:

   ```ts
   import type { ReviewMoment, ReviewTier } from '@harness-engineering/types';
   import type { DiffInfo } from './types';
   import { detectRiskKeywords } from './depth-calibrator';

   export type PhaseComplexity = 'low' | 'medium' | 'high';
   export type ReviewRigor = 'fast' | 'standard' | 'thorough';

   export interface SelectReviewTierInput {
     moment: ReviewMoment;
     /** The diff under review. Risk keywords are matched against its paths and content. */
     diff: DiffInfo;
     /** The latest commit message, matched for risk keywords with the diff. */
     commitMessage: string;
     /** Project-relative files named by any package.json `exports`, `main` or `bin` field. */
     entryPoints?: readonly string[];
     /** Autopilot's assessed complexity for the phase, after its ASSESS refinements. */
     complexity?: PhaseComplexity;
     rigor?: ReviewRigor;
   }

   export interface ReviewTierSelection {
     tier: ReviewTier;
     /** Why the tier is `full`. Empty for `light`. */
     reasons: string[];
   }

   /** `src/index.ts` directly under a package root (or the repo root); not a nested `src/x/index.ts`. */
   const PACKAGE_INDEX = /^(?:.*\/)?src\/index\.ts$/;

   function posix(p: string): string {
     return p.replace(/\\/g, '/').replace(/^\.\//, '');
   }

   function leaves(value: unknown, out: string[]): void {
     if (typeof value === 'string') out.push(value);
     else if (Array.isArray(value)) for (const v of value) leaves(v, out);
     else if (value !== null && typeof value === 'object') {
       for (const v of Object.values(value)) leaves(v, out);
     }
   }

   /**
    * Files a parsed package.json names in `main`, `bin` and `exports`, as project-relative POSIX
    * paths. Pure: the caller reads the file. Patterns with `*` are returned verbatim and match
    * nothing.
    */
   export function collectPackageEntryPoints(pkg: unknown, packageDir = ''): string[] {
     if (pkg === null || typeof pkg !== 'object') return [];
     const p = pkg as Record<string, unknown>;
     const raw: string[] = [];
     leaves(p.main, raw);
     leaves(p.bin, raw);
     leaves(p.exports, raw);
     const dir = posix(packageDir).replace(/\/+$/, '');
     const paths = raw.map((v) => (dir === '' ? posix(v) : `${dir}/${posix(v)}`));
     return [...new Set(paths)].sort();
   }

   /**
    * Per-phase review tier (spec D5). A phase is `full` when any rule holds and `light` otherwise.
    * The final review is always `full`: no rigor level lowers it.
    */
   export function selectReviewTier(input: SelectReviewTierInput): ReviewTierSelection {
     if (input.moment !== 'phase') return { tier: 'full', reasons: [`moment:${input.moment}`] };
     const reasons: string[] = [];
     for (const k of detectRiskKeywords(input.diff, input.commitMessage)) {
       reasons.push(`risk-keyword:${k}`);
     }
     const entry = new Set((input.entryPoints ?? []).map(posix));
     for (const f of input.diff.changedFiles.map(posix)) {
       if (PACKAGE_INDEX.test(f) || entry.has(f)) reasons.push(`entry-point:${f}`);
     }
     if (input.complexity === 'high') reasons.push('complexity:high');
     if (input.rigor === 'thorough') reasons.push('rigor:thorough');
     return { tier: reasons.length > 0 ? 'full' : 'light', reasons };
   }
   ```

4. Append to `packages/core/src/review/index.ts`:

   ```ts
   // Shift-left pipeline fidelity: per-phase review tier selection (spec D5)
   export { selectReviewTier, collectPackageEntryPoints } from './tier-selector';
   export type {
     SelectReviewTierInput,
     ReviewTierSelection,
     PhaseComplexity,
     ReviewRigor,
   } from './tier-selector';
   ```

5. Run the test. Observe pass. Run `pnpm --filter @harness-engineering/core typecheck`. (`pnpm run generate:barrels:check` now reports a stale symbol manifest; Task 13 regenerates it.)
6. VALIDATE.
7. Commit: `feat(core): add selectReviewTier for risk-tiered phase reviews`

### Task 6: Resolve the review backend with an honest fallback

**Depends on:** Task 1 | **Files:** `packages/core/src/receipts/backend.ts`, `packages/core/tests/receipts/backend.test.ts`

1. Create `packages/core/tests/receipts/backend.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { resolveReviewBackend } from '../../src/receipts/backend';

   describe('resolveReviewBackend (SC15)', () => {
     it('defaults to agent when the key is unset', () => {
       expect(
         resolveReviewBackend({ configured: undefined, pipelineRunnerAvailable: true })
       ).toEqual({
         backend: 'agent',
         degraded: false,
       });
     });
     it('uses the pipeline when it is configured and a runner resolves', () => {
       expect(
         resolveReviewBackend({ configured: 'pipeline', pipelineRunnerAvailable: true })
       ).toEqual({ backend: 'pipeline', degraded: false });
     });
     it('records agent, flagged degraded, when pipeline is configured and no runner resolves', () => {
       const r = resolveReviewBackend({ configured: 'pipeline', pipelineRunnerAvailable: false });
       expect(r.backend).toBe('agent');
       expect(r.degraded).toBe(true);
       expect(r.reason).toMatch(/no pipeline runner/);
     });
     it('never reports degraded for a configured agent backend', () => {
       expect(
         resolveReviewBackend({ configured: 'agent', pipelineRunnerAvailable: false })
       ).toEqual({
         backend: 'agent',
         degraded: false,
       });
     });
   });
   ```

2. Run `pnpm --filter @harness-engineering/core exec vitest run tests/receipts/backend.test.ts`. Observe failure.
3. Create `packages/core/src/receipts/backend.ts`:

   ```ts
   import type { ReviewBackend } from '@harness-engineering/types';

   export interface ResolveReviewBackendInput {
     /** `review.backend` from harness.config.json; undefined when unset. */
     configured: ReviewBackend | undefined;
     /** Whether a coded-pipeline runner is callable in the reviewing session. */
     pipelineRunnerAvailable: boolean;
   }

   export interface ResolvedReviewBackend {
     /** The backend the review actually runs on. This is what the receipt records. */
     backend: ReviewBackend;
     /** True when `pipeline` was configured and the review fell back to `agent`. */
     degraded: boolean;
     reason?: string;
   }

   /**
    * Spec D8: the coded pipeline is opt-in for the full tier. When it is configured and no runner
    * resolves, the review runs on the agent backend and says so; it never claims `pipeline`.
    */
   export function resolveReviewBackend(input: ResolveReviewBackendInput): ResolvedReviewBackend {
     if (input.configured !== 'pipeline') return { backend: 'agent', degraded: false };
     if (input.pipelineRunnerAvailable) return { backend: 'pipeline', degraded: false };
     return {
       backend: 'agent',
       degraded: true,
       reason:
         'review.backend is "pipeline" but no pipeline runner resolved; ran on the agent backend',
     };
   }
   ```

4. Run the test. Observe pass.
5. VALIDATE.
6. Commit: `feat(core): resolve the review backend with an agent fallback`

### Task 7: Define the review artifact layout

**Depends on:** Task 2 | **Files:** `packages/core/src/receipts/layout.ts`, `packages/core/tests/receipts/layout.test.ts`

1. Create `packages/core/tests/receipts/layout.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import * as path from 'node:path';
   import {
     REVIEW_RECEIPT_FILENAME,
     compareReviewLabels,
     reviewLabel,
     reviewerFindingsFilename,
     sanitizeBranchForPath,
     sessionReviewDir,
     standaloneReviewDir,
   } from '../../src/receipts/layout';

   const parts = (p: string) => p.split(path.sep).filter(Boolean);

   describe('review artifact layout', () => {
     it('names the receipt file', () => {
       expect(REVIEW_RECEIPT_FILENAME).toBe('receipt.json');
     });
     it('labels a phase review by its index and the final review as final-all', () => {
       expect(reviewLabel('phase', 0)).toBe('phase-0');
       expect(reviewLabel('phase', '2a')).toBe('phase-2a');
       expect(reviewLabel('final')).toBe('final-all');
     });
     it('refuses a phase label that would leave the reviews directory', () => {
       expect(() => reviewLabel('phase', '../x')).toThrow(/phase label/);
       expect(() => reviewLabel('phase', 'a/b')).toThrow(/phase label/);
     });
     it('puts session reviews under <sessionDir>/reviews/<label>', () => {
       const dir = sessionReviewDir(path.join('.harness', 'sessions', 's1'), 'phase', 1);
       expect(parts(dir)).toEqual(['.harness', 'sessions', 's1', 'reviews', 'phase-1']);
     });
     it('puts a standalone review under .harness/reviews/<branch>-<head sha>', () => {
       const sha = 'b'.repeat(40);
       const dir = standaloneReviewDir('repo', 'feat/shift-left', sha);
       expect(parts(dir)).toEqual(['repo', '.harness', 'reviews', `feat-shift-left-${sha}`]);
     });
     it.each([
       ['feat/a b', 'feat-a-b'],
       ['user/x@{1}', 'user-x-1'],
       ['../../etc', 'etc'],
       ['', 'detached'],
       ['HEAD', 'HEAD'],
     ])('sanitizes branch %j to %j', (branch, expected) => {
       expect(sanitizeBranchForPath(branch)).toBe(expected);
     });
     it('names a reviewer findings file and refuses an unsafe id', () => {
       expect(reviewerFindingsFilename('typescript-strict')).toBe('typescript-strict.json');
       expect(() => reviewerFindingsFilename('../bug')).toThrow(/reviewer id/);
     });
     it('orders labels: phases numerically, then the final review, then anything else', () => {
       const labels = ['final-all', 'phase-10', 'zzz', 'phase-2', 'phase-0'];
       expect([...labels].sort(compareReviewLabels)).toEqual([
         'phase-0',
         'phase-2',
         'phase-10',
         'final-all',
         'zzz',
       ]);
     });
   });
   ```

2. Run `pnpm --filter @harness-engineering/core exec vitest run tests/receipts/layout.test.ts`. Observe failure.
3. Create `packages/core/src/receipts/layout.ts`:

   ```ts
   import * as path from 'node:path';
   import { REVIEWER_ID_PATTERN } from './schema';

   /**
    * Where review output lives (spec "Artifact layout"). Every review writes one directory holding
    * `receipt.json` and one findings file per reviewer:
    *   session:    <sessionDir>/reviews/<moment>-<phase>/     (phase-0, phase-1, final-all)
    *   standalone: <projectRoot>/.harness/reviews/<branch>-<head sha>/
    */
   export const REVIEWS_DIRNAME = 'reviews';
   export const REVIEW_RECEIPT_FILENAME = 'receipt.json';
   export const FINAL_REVIEW_LABEL = 'final-all';

   const PHASE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

   export function reviewLabel(moment: 'phase' | 'final', phase?: string | number): string {
     if (moment === 'final') return FINAL_REVIEW_LABEL;
     const segment = String(phase ?? '');
     if (!PHASE_SEGMENT.test(segment)) {
       throw new Error(`invalid phase label "${segment}": use letters, digits, ".", "_" or "-"`);
     }
     return `phase-${segment}`;
   }

   export function sessionReviewDir(
     sessionDir: string,
     moment: 'phase' | 'final',
     phase?: string | number
   ): string {
     return path.join(sessionDir, REVIEWS_DIRNAME, reviewLabel(moment, phase));
   }

   /** A branch name as one safe path segment. */
   export function sanitizeBranchForPath(branch: string): string {
     const s = branch.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '');
     return s === '' ? 'detached' : s;
   }

   export function standaloneReviewDir(
     projectRoot: string,
     branch: string,
     headSha: string
   ): string {
     return path.join(
       projectRoot,
       '.harness',
       REVIEWS_DIRNAME,
       `${sanitizeBranchForPath(branch)}-${headSha}`
     );
   }

   export function reviewerFindingsFilename(reviewerId: string): string {
     if (!REVIEWER_ID_PATTERN.test(reviewerId)) {
       throw new Error(`invalid reviewer id "${reviewerId}": must match ^[a-z][a-z0-9-]*$`);
     }
     return `${reviewerId}.json`;
   }

   function rank(label: string): [number, number] {
     const m = /^phase-(\d+)/.exec(label);
     if (m) return [0, Number(m[1])];
     if (label.startsWith('phase-')) return [1, 0];
     if (label === FINAL_REVIEW_LABEL) return [2, 0];
     return [3, 0];
   }

   /** Sort order for stamp rows: phases in numeric order, then the final review, then the rest. */
   export function compareReviewLabels(a: string, b: string): number {
     const [ga, na] = rank(a);
     const [gb, nb] = rank(b);
     if (ga !== gb) return ga - gb;
     if (na !== nb) return na - nb;
     return a < b ? -1 : a > b ? 1 : 0;
   }
   ```

4. Run the test. Observe pass.
5. VALIDATE.
6. Commit: `feat(core): define the review artifact layout`

### Task 8: Load a receipt and its findings files from disk

**Depends on:** Task 2, Task 7 | **Files:** `packages/core/src/receipts/load.ts`, `packages/core/tests/receipts/load.test.ts`

1. Create `packages/core/tests/receipts/load.test.ts`:

   ```ts
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import * as fs from 'node:fs';
   import * as os from 'node:os';
   import * as path from 'node:path';
   import {
     collectBlockingFindings,
     findingLocationKey,
     findingsReaderFor,
     readReceiptFile,
   } from '../../src/receipts/load';
   import type { ReviewReceipt } from '@harness-engineering/types';

   let tmp: string;
   let dir: string;
   beforeEach(() => {
     tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'core-receipt-load-'));
     dir = path.join(tmp, 'reviews', 'phase-0');
     fs.mkdirSync(dir, { recursive: true });
   });
   afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

   const write = (name: string, value: unknown) =>
     fs.writeFileSync(
       path.join(dir, name),
       typeof value === 'string' ? value : JSON.stringify(value)
     );
   const blocking = (id: string, file: string, line: number, cls = 'edge-case') => ({
     id,
     file,
     lineRange: [line, line],
     severity: 'important',
     title: id,
     findingClass: cls,
     escapedFrom: 'plan',
   });
   const findings = (reviewerId: string, list: unknown[]) => ({
     schemaVersion: 1,
     reviewerId,
     examinedFiles: ['src/a.ts'],
     findings: list,
   });
   const receipt = (ids: string[]): ReviewReceipt => ({
     schemaVersion: 1,
     moment: 'phase',
     tier: 'full',
     backend: 'agent',
     diff: { base: 'a'.repeat(40), head: 'b'.repeat(40) },
     coldContext: true,
     priorFindingsSupplied: false,
     reviewers: ids.map((id) => ({ id, required: true, ran: true, findingsPath: `${id}.json` })),
     blocking: 0,
     advisory: 0,
   });

   describe('readReceiptFile', () => {
     it('reads receipt.json when given the review directory', () => {
       write('receipt.json', { schemaVersion: 1 });
       const r = readReceiptFile(dir);
       expect(r.status).toBe('ok');
       expect(path.basename(r.path)).toBe('receipt.json');
       expect(r.dir).toBe(dir);
     });
     it('SC16: reports a missing receipt as missing, for a directory and for a file path', () => {
       expect(readReceiptFile(dir).status).toBe('missing');
       expect(readReceiptFile(path.join(tmp, 'nowhere', 'receipt.json')).status).toBe('missing');
     });
     it('reports a receipt that is not JSON as unreadable, not missing', () => {
       write('receipt.json', '{nope');
       expect(readReceiptFile(path.join(dir, 'receipt.json'))).toMatchObject({
         status: 'unreadable',
         reason: 'not valid JSON',
       });
     });
   });

   describe('findingsReaderFor', () => {
     it('reads a file inside the receipt directory and returns undefined for an absent one', () => {
       write('bug.json', 'x');
       const read = findingsReaderFor(dir);
       expect(read('bug.json')).toBe('x');
       expect(read('nope.json')).toBeUndefined();
     });
     it('never reads outside the receipt directory', () => {
       fs.writeFileSync(path.join(tmp, 'secret.json'), 's');
       const read = findingsReaderFor(dir);
       expect(read(path.join('..', '..', 'secret.json'))).toBeUndefined();
       expect(read(path.join(tmp, 'secret.json'))).toBeUndefined();
     });
   });

   describe('collectBlockingFindings', () => {
     it('returns blocking findings across reviewers, one per location, and skips suggestions', () => {
       write(
         'bug.json',
         findings('bug', [
           blocking('bug-1', 'src/a.ts', 3),
           { id: 's', file: 'src/a.ts', lineRange: [9, 9], severity: 'suggestion', title: 's' },
         ])
       );
       write(
         'security.json',
         findings('security', [
           blocking('sec-1', 'src\\a.ts', 3, 'design'),
           blocking('sec-2', 'src/a.ts', 7),
         ])
       );
       const r = collectBlockingFindings(receipt(['bug', 'security']), findingsReaderFor(dir));
       expect(r.findings.map((f) => f.id)).toEqual(['bug-1', 'sec-2']);
       expect(r.unreadable).toEqual([]);
     });
     it('counts a missing or invalid reviewer file instead of reporting zero findings for it', () => {
       write('bug.json', '{nope');
       const r = collectBlockingFindings(receipt(['bug', 'security']), findingsReaderFor(dir));
       expect(r.findings).toEqual([]);
       expect(r.unreadable).toEqual(['bug', 'security']);
     });
     it('keys a location by normalized file and start line', () => {
       expect(findingLocationKey(blocking('x', '.\\src\\a.ts', 3) as never)).toBe('src/a.ts:3');
     });
   });
   ```

2. Run `pnpm --filter @harness-engineering/core exec vitest run tests/receipts/load.test.ts`. Observe failure.
3. Create `packages/core/src/receipts/load.ts`:

   ```ts
   import * as fs from 'node:fs';
   import * as path from 'node:path';
   import type { ReviewReceipt } from '@harness-engineering/types';
   import { REVIEW_RECEIPT_FILENAME } from './layout';
   import {
     isBlockingSeverity,
     normalizeReviewPath,
     parseReviewerFindingsFile,
     type ReceiptFinding,
   } from './schema';

   export type ReceiptFileRead =
     | { status: 'ok'; path: string; dir: string; raw: unknown }
     | { status: 'missing'; path: string; dir: string }
     | { status: 'unreadable'; path: string; dir: string; reason: string };

   /** A review directory resolves to its receipt.json; a file path is used as given. */
   export function resolveReceiptPath(p: string): string {
     try {
       if (fs.statSync(p).isDirectory()) return path.join(p, REVIEW_RECEIPT_FILENAME);
     } catch {
       // Absent: the reader reports it.
     }
     return p;
   }

   /** Read and JSON-parse a receipt. A missing receipt is its own status: the gate fails on it. */
   export function readReceiptFile(p: string): ReceiptFileRead {
     const file = resolveReceiptPath(p);
     const dir = path.dirname(file);
     let text: string;
     try {
       text = fs.readFileSync(file, 'utf-8');
     } catch (err) {
       const code = (err as NodeJS.ErrnoException).code;
       if (code === 'ENOENT' || code === 'ENOTDIR') return { status: 'missing', path: file, dir };
       const reason = err instanceof Error ? err.message : String(err);
       return { status: 'unreadable', path: file, dir, reason };
     }
     try {
       return { status: 'ok', path: file, dir, raw: JSON.parse(text) };
     } catch {
       return { status: 'unreadable', path: file, dir, reason: 'not valid JSON' };
     }
   }

   /** A reader for the findings files a receipt names. It never reads outside `receiptDir`. */
   export function findingsReaderFor(
     receiptDir: string
   ): (findingsPath: string) => string | undefined {
     const root = path.resolve(receiptDir);
     return (findingsPath) => {
       const full = path.resolve(root, findingsPath);
       const rel = path.relative(root, full);
       if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return undefined;
       try {
         return fs.readFileSync(full, 'utf-8');
       } catch {
         return undefined;
       }
     };
   }

   /** Two findings at the same file and start line are one location. */
   export function findingLocationKey(f: ReceiptFinding): string {
     return `${normalizeReviewPath(f.file)}:${f.lineRange[0]}`;
   }

   export interface CollectedBlockingFindings {
     /** Blocking findings across every reviewer that ran, one per location, in reviewer order. */
     findings: ReceiptFinding[];
     /** Reviewers marked ran whose findings file was absent or invalid. */
     unreadable: string[];
   }

   export function collectBlockingFindings(
     receipt: ReviewReceipt,
     readFindings: (findingsPath: string) => string | undefined
   ): CollectedBlockingFindings {
     const findings: ReceiptFinding[] = [];
     const unreadable: string[] = [];
     const seen = new Set<string>();
     for (const r of receipt.reviewers) {
       if (!r.ran) continue;
       const text = r.findingsPath === undefined ? undefined : readFindings(r.findingsPath);
       let parsed: ReturnType<typeof parseReviewerFindingsFile> | undefined;
       if (text !== undefined) {
         try {
           parsed = parseReviewerFindingsFile(JSON.parse(text));
         } catch {
           parsed = undefined;
         }
       }
       if (parsed === undefined || !parsed.ok) {
         unreadable.push(r.id);
         continue;
       }
       for (const f of parsed.value.findings) {
         if (!isBlockingSeverity(f.severity)) continue;
         const key = findingLocationKey(f);
         if (seen.has(key)) continue;
         seen.add(key);
         findings.push(f);
       }
     }
     return { findings, unreadable };
   }
   ```

4. Run the test. Observe pass. Run `pnpm --filter @harness-engineering/core typecheck`.
5. VALIDATE.
6. Commit: `feat(core): load review receipts and their findings files`

### Task 9: Render and read the provenance stamp

**Depends on:** Task 2 | **Files:** `packages/core/src/receipts/provenance.ts`, `packages/core/tests/receipts/provenance.test.ts`

1. Create `packages/core/tests/receipts/provenance.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import {
     NO_PIPELINE_REVIEW,
     PROVENANCE_MARKER,
     buildProvenanceRow,
     countProvenanceRows,
     extractProvenanceBlock,
     renderProvenanceBlock,
   } from '../../src/receipts/provenance';
   import type { ReviewReceipt } from '@harness-engineering/types';
   import type { ReceiptFinding } from '../../src/receipts/schema';

   const BASE = 'a1b2c3d' + '0'.repeat(33);
   const HEAD = 'e4f5a6b' + '1'.repeat(33);
   const receipt = (over: Partial<ReviewReceipt> = {}): ReviewReceipt => ({
     schemaVersion: 1,
     moment: 'phase',
     tier: 'full',
     backend: 'agent',
     diff: { base: BASE, head: HEAD },
     coldContext: true,
     priorFindingsSupplied: false,
     reviewers: [
       { id: 'compliance', required: true, ran: true, findingsPath: 'compliance.json' },
       { id: 'bug', required: true, ran: true, findingsPath: 'bug.json' },
       { id: 'security', required: true, ran: false, skippedReason: 'x' },
       { id: 'architecture', required: true, ran: true, findingsPath: 'architecture.json' },
       { id: 'frontend-races', required: false, ran: false, skippedReason: 'inactive' },
     ],
     blocking: 3,
     advisory: 1,
     ...over,
   });
   const f = (cls: ReceiptFinding['findingClass'], stage: ReceiptFinding['escapedFrom']) =>
     ({
       id: 'x',
       file: 'a.ts',
       lineRange: [1, 1],
       severity: 'important',
       title: 't',
       findingClass: cls,
       escapedFrom: stage,
     }) as ReceiptFinding;
   const three = [f('stale-claim', 'plan'), f('stale-claim', 'execution'), f('edge-case', 'plan')];

   describe('buildProvenanceRow', () => {
     it('counts required reviewers only, and tallies blocking findings by class and stage', () => {
       expect(buildProvenanceRow('phase-0', receipt(), three)).toEqual({
         review: 'phase-0',
         moment: 'phase',
         tier: 'full',
         backend: 'agent',
         reviewersRun: 3,
         reviewersRequired: 4,
         base: BASE,
         head: HEAD,
         blocking: 3,
         byClass: { 'stale-claim': 2, 'edge-case': 1 },
         byStage: { plan: 2, execution: 1 },
       });
     });
     it('recomputes the blocking count from the findings, not from the receipt field', () => {
       expect(buildProvenanceRow('phase-0', receipt({ blocking: 0 }), three).blocking).toBe(3);
     });
     it('carries an override and a starting-commit base source', () => {
       const r = receipt({ diff: { base: BASE, head: HEAD, baseSource: 'starting-commit' } });
       const row = buildProvenanceRow('final-all', r, [], 'reviewer bug failed twice');
       expect(row.baseSource).toBe('starting-commit');
       expect(row.override).toBe('reviewer bug failed twice');
     });
   });

   describe('renderProvenanceBlock', () => {
     const row = buildProvenanceRow('phase-0', receipt(), three);
     it('delimits the block with the marker on its first and last lines', () => {
       const lines = renderProvenanceBlock([row]).split('\n');
       expect(lines[0]).toBe(PROVENANCE_MARKER);
       expect(lines[lines.length - 1]).toBe(PROVENANCE_MARKER);
       expect(PROVENANCE_MARKER).toBe('<!-- harness:review-provenance -->');
     });
     it('SC6: renders one row per review with tier, reviewers run of required, diff range and counts', () => {
       const final = buildProvenanceRow(
         'final-all',
         receipt({
           moment: 'final',
           diff: { base: BASE, head: HEAD, baseSource: 'starting-commit' },
         }),
         [],
         'a | b'
       );
       const block = renderProvenanceBlock([row, final]);
       expect(block).toContain(
         '| phase-0 | phase | full | agent | 3/4 | `a1b2c3d..e4f5a6b` | 3 | stale-claim 2, edge-case 1 | plan 2, execution 1 | none |'
       );
       expect(block).toContain(
         '| final-all | final | full | agent | 3/4 | `a1b2c3d..e4f5a6b` (base: starting-commit) | 0 | none | none | a / b |'
       );
       expect(countProvenanceRows(block)).toBe(2);
     });
     it('counts rows of a table a formatter re-aligned', () => {
       const aligned = [
         PROVENANCE_MARKER,
         '| Review    | Moment | Tier |',
         '| :-------- | ------ | ---- |',
         '| final-all | final  | full |',
         PROVENANCE_MARKER,
       ].join('\n');
       expect(countProvenanceRows(aligned)).toBe(1);
     });
     it('lists an invalid receipt below the table instead of dropping it', () => {
       const block = renderProvenanceBlock(
         [row],
         [{ review: 'phase-1', reason: 'not valid JSON' }]
       );
       expect(block).toContain('- phase-1: receipt invalid (not valid JSON)');
       expect(countProvenanceRows(block)).toBe(1);
     });
     it('says so when there is nothing to show', () => {
       const block = renderProvenanceBlock([]);
       expect(block).toContain(NO_PIPELINE_REVIEW);
       expect(countProvenanceRows(block)).toBe(0);
     });
   });

   describe('extractProvenanceBlock', () => {
     const block = renderProvenanceBlock([buildProvenanceRow('phase-0', receipt(), [])]);
     it('finds the block inside a PR body, with CRLF line endings too', () => {
       const body = `Summary\n\n${block}\n\nCloses #12`;
       expect(extractProvenanceBlock(body)).toBe(block);
       expect(countProvenanceRows(extractProvenanceBlock(body.replace(/\n/g, '\r\n')) ?? '')).toBe(
         1
       );
     });
     it('returns undefined when the body has no block or only one marker', () => {
       expect(extractProvenanceBlock('no stamp here')).toBeUndefined();
       expect(extractProvenanceBlock(`${PROVENANCE_MARKER}\nunterminated`)).toBeUndefined();
     });
   });
   ```

2. Run `pnpm --filter @harness-engineering/core exec vitest run tests/receipts/provenance.test.ts`. Observe failure.
3. Create `packages/core/src/receipts/provenance.ts`:

   ```ts
   import type { ReviewReceipt } from '@harness-engineering/types';
   import type { ReceiptFinding } from './schema';

   /** The stamp's opening and closing line. The same marker delimits both ends. */
   export const PROVENANCE_MARKER = '<!-- harness:review-provenance -->';
   /** What a reader prints for a PR whose body has no stamp. */
   export const NO_PIPELINE_REVIEW = 'no pipeline review recorded';

   const HEADER =
     '| Review | Moment | Tier | Backend | Reviewers | Diff | Blocking | By class | Escaped from | Override |';
   const RULE = '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |';

   export interface ProvenanceRow {
     /** The review's label: `phase-0`, `final-all`. */
     review: string;
     moment: string;
     tier: string;
     backend: string;
     /** Required reviewers that ran. */
     reviewersRun: number;
     reviewersRequired: number;
     base: string;
     head: string;
     baseSource?: string;
     /** Blocking findings, recomputed from the reviewer findings files. */
     blocking: number;
     byClass: Record<string, number>;
     byStage: Record<string, number>;
     /** Why the gate or blocking findings were overridden, when they were. */
     override?: string;
   }

   function tally(
     findings: readonly ReceiptFinding[],
     key: 'findingClass' | 'escapedFrom'
   ): Record<string, number> {
     const out: Record<string, number> = {};
     for (const f of findings) {
       const k = f[key] ?? 'unattributed';
       out[k] = (out[k] ?? 0) + 1;
     }
     return out;
   }

   export function buildProvenanceRow(
     review: string,
     receipt: ReviewReceipt,
     blockingFindings: readonly ReceiptFinding[],
     override?: string
   ): ProvenanceRow {
     const required = receipt.reviewers.filter((r) => r.required);
     return {
       review,
       moment: receipt.moment,
       tier: receipt.tier,
       backend: receipt.backend,
       reviewersRun: required.filter((r) => r.ran).length,
       reviewersRequired: required.length,
       base: receipt.diff.base,
       head: receipt.diff.head,
       ...(receipt.diff.baseSource !== undefined && { baseSource: receipt.diff.baseSource }),
       blocking: blockingFindings.length,
       byClass: tally(blockingFindings, 'findingClass'),
       byStage: tally(blockingFindings, 'escapedFrom'),
       ...(override !== undefined && { override }),
     };
   }

   function cell(text: string): string {
     return text.replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
   }

   function counts(c: Record<string, number>): string {
     const parts = Object.entries(c).map(([k, n]) => `${k} ${n}`);
     return parts.length > 0 ? parts.join(', ') : 'none';
   }

   function rowLine(r: ProvenanceRow): string {
     const range = `\`${r.base.slice(0, 7)}..${r.head.slice(0, 7)}\``;
     const diff = r.baseSource === 'starting-commit' ? `${range} (base: starting-commit)` : range;
     const cells = [
       cell(r.review),
       r.moment,
       r.tier,
       r.backend,
       `${r.reviewersRun}/${r.reviewersRequired}`,
       diff,
       String(r.blocking),
       counts(r.byClass),
       counts(r.byStage),
       r.override === undefined ? 'none' : cell(r.override),
     ];
     return `| ${cells.join(' | ')} |`;
   }

   /** The Markdown stamp: one table row per review, delimited by PROVENANCE_MARKER. */
   export function renderProvenanceBlock(
     rows: readonly ProvenanceRow[],
     invalid: ReadonlyArray<{ review: string; reason: string }> = []
   ): string {
     const lines = [PROVENANCE_MARKER, '### Review provenance', ''];
     if (rows.length === 0) lines.push(`_${NO_PIPELINE_REVIEW}._`);
     else lines.push(HEADER, RULE, ...rows.map(rowLine));
     if (invalid.length > 0) {
       lines.push(
         '',
         ...invalid.map((i) => `- ${cell(i.review)}: receipt invalid (${cell(i.reason)})`)
       );
     }
     lines.push('', PROVENANCE_MARKER);
     return lines.join('\n');
   }

   /** The stamp inside a larger text (a PR body), markers included, or undefined when absent. */
   export function extractProvenanceBlock(text: string): string | undefined {
     const body = text.replace(/\r\n/g, '\n');
     const start = body.indexOf(PROVENANCE_MARKER);
     if (start < 0) return undefined;
     const end = body.indexOf(PROVENANCE_MARKER, start + PROVENANCE_MARKER.length);
     if (end < 0) return undefined;
     return body.slice(start, end + PROVENANCE_MARKER.length);
   }

   /** How many review rows a stamp holds. Zero means the PR is not stamped. */
   export function countProvenanceRows(block: string): number {
     // Match on the first cell, not the exact header text: a PR body's table may have been
     // re-aligned by a formatter.
     return block
       .split('\n')
       .map((l) => l.trim())
       .filter((l) => l.startsWith('|') && !/^\|\s*(?:Review\s*\||:?-{3})/.test(l)).length;
   }
   ```

4. Run the test. Observe pass.
5. VALIDATE.
6. Commit: `feat(core): render and read the review provenance stamp`

### Task 10: Build, append and read the attribution log

**Depends on:** Task 2 | **Files:** `packages/core/src/receipts/attribution.ts`, `packages/core/tests/receipts/attribution.test.ts`

1. Create `packages/core/tests/receipts/attribution.test.ts`:

   ```ts
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import * as fs from 'node:fs';
   import * as os from 'node:os';
   import * as path from 'node:path';
   import {
     appendReviewAttribution,
     buildAttributionRecords,
     readReviewAttribution,
     reviewAttributionPath,
   } from '../../src/receipts/attribution';
   import type { ReviewReceipt } from '@harness-engineering/types';
   import type { ReceiptFinding } from '../../src/receipts/schema';

   let project: string;
   beforeEach(() => {
     project = fs.mkdtempSync(path.join(os.tmpdir(), 'core-attribution-'));
   });
   afterEach(() => fs.rmSync(project, { recursive: true, force: true }));

   const HEAD = 'b'.repeat(40);
   const receipt: ReviewReceipt = {
     schemaVersion: 1,
     moment: 'standalone',
     tier: 'full',
     backend: 'agent',
     diff: { base: 'a'.repeat(40), head: HEAD },
     coldContext: true,
     priorFindingsSupplied: false,
     reviewers: [{ id: 'bug', required: true, ran: true, findingsPath: 'bug.json' }],
     blocking: 9,
     advisory: 0,
   };
   const finding = (id: string): ReceiptFinding =>
     ({
       id,
       file: 'src/a.ts',
       lineRange: [1, 1],
       severity: 'critical',
       title: id,
       findingClass: 'stale-claim',
       escapedFrom: 'plan',
     }) as ReceiptFinding;
   const build = (over: Partial<Parameters<typeof buildAttributionRecords>[0]> = {}) =>
     buildAttributionRecords({
       receipt,
       review: 'feat-x-bbbb',
       blockingFindings: [finding('f1'), finding('f2')],
       branch: 'feat/x',
       stamp: 'stamped',
       pr: 12,
       now: new Date('2026-11-20T10:00:00.000Z'),
       ...over,
     });

   describe('buildAttributionRecords', () => {
     it('SC7: writes one review record and one record per blocking finding', () => {
       const records = build();
       expect(records.map((r) => r.kind)).toEqual(['review', 'finding', 'finding']);
       expect(records[0]).toMatchObject({
         kind: 'review',
         ref: 'pr:12',
         branch: 'feat/x',
         head: HEAD,
         moment: 'standalone',
         stamp: 'stamped',
         tier: 'full',
         blocking: 2,
         ts: '2026-11-20T10:00:00.000Z',
       });
       expect(records[1]).toMatchObject({
         kind: 'finding',
         findingId: 'f1',
         file: 'src/a.ts',
         findingClass: 'stale-claim',
         escapedFrom: 'plan',
       });
     });
     it('writes a review record with blocking 0 for a clean review, so the run leaves a trace', () => {
       expect(build({ blockingFindings: [] })).toEqual([
         expect.objectContaining({ kind: 'review', blocking: 0 }),
       ]);
     });
     it('refers to the branch when no PR is known', () => {
       const records = buildAttributionRecords({
         receipt,
         review: 'r',
         blockingFindings: [],
         branch: 'feat/x',
         stamp: 'unstamped',
         now: new Date(0),
       });
       expect(records[0]?.ref).toBe('branch:feat/x');
     });
   });

   describe('appendReviewAttribution / readReviewAttribution', () => {
     it('creates .harness/metrics, appends one JSON line per record and reads them back', () => {
       const res = appendReviewAttribution(project, build());
       expect(res).toEqual({ appended: 3, skipped: 0 });
       const file = reviewAttributionPath(project);
       expect(file.split(path.sep).slice(-3)).toEqual([
         '.harness',
         'metrics',
         'review-attribution.jsonl',
       ]);
       expect(fs.readFileSync(file, 'utf-8').trimEnd().split('\n')).toHaveLength(3);
       const read = readReviewAttribution(project);
       expect(read).toMatchObject({ present: true, invalid: 0 });
       expect(read.records).toHaveLength(3);
     });
     it('is idempotent: recording the same review at the same head twice appends nothing new', () => {
       appendReviewAttribution(project, build());
       expect(appendReviewAttribution(project, build())).toEqual({ appended: 0, skipped: 3 });
       const laterHead = build({
         receipt: { ...receipt, diff: { ...receipt.diff, head: 'c'.repeat(40) } },
       });
       expect(appendReviewAttribution(project, laterHead).appended).toBe(3);
     });
     it('repairs a log whose last line has no newline instead of gluing a record onto it', () => {
       const file = reviewAttributionPath(project);
       fs.mkdirSync(path.dirname(file), { recursive: true });
       fs.writeFileSync(file, '{"cut":');
       appendReviewAttribution(project, build({ blockingFindings: [] }));
       const read = readReviewAttribution(project);
       expect(read.invalid).toBe(1);
       expect(read.records).toHaveLength(1);
     });
     it('never throws: a failed append is returned as an error (the review must not fail)', () => {
       fs.mkdirSync(path.join(project, '.harness'), { recursive: true });
       fs.writeFileSync(
         path.join(project, '.harness', 'metrics'),
         'a file where a directory belongs'
       );
       const res = appendReviewAttribution(project, build());
       expect(res.appended).toBe(0);
       expect(res.error).toEqual(expect.any(String));
     });
     it('distinguishes an absent log from an empty one', () => {
       expect(readReviewAttribution(project)).toEqual({ present: false, records: [], invalid: 0 });
     });
   });
   ```

2. Run `pnpm --filter @harness-engineering/core exec vitest run tests/receipts/attribution.test.ts`. Observe failure.
3. Create `packages/core/src/receipts/attribution.ts`:

   ```ts
   import * as fs from 'node:fs';
   import * as path from 'node:path';
   import { z } from 'zod';
   import {
     ESCAPED_FROM_STAGES,
     FINDING_CLASSES,
     REVIEW_MOMENTS,
     REVIEW_STAMP_STATES,
     REVIEW_TIERS,
     type FindingAttribution,
     type ReviewAttributionRecord,
     type ReviewReceipt,
     type ReviewRunAttribution,
     type ReviewStampState,
   } from '@harness-engineering/types';
   import type { ReceiptFinding } from './schema';

   /**
    * The attribution log: `.harness/metrics/review-attribution.jsonl`. It is machine-local
    * (`.harness/metrics/*` is ignored); the provenance stamp carries the same counts so they
    * travel with the PR.
    */
   export function reviewAttributionPath(projectRoot: string): string {
     return path.join(projectRoot, '.harness', 'metrics', 'review-attribution.jsonl');
   }

   const base = {
     schemaVersion: z.literal(1),
     ts: z.string().min(1),
     ref: z.string().min(1),
     branch: z.string().min(1),
     head: z.string().min(1),
     moment: z.enum(REVIEW_MOMENTS),
     review: z.string().min(1),
     stamp: z.enum(REVIEW_STAMP_STATES),
   };

   export const ReviewAttributionRecordSchema = z.discriminatedUnion('kind', [
     z.object({
       ...base,
       kind: z.literal('review'),
       tier: z.enum(REVIEW_TIERS),
       blocking: z.number().int().nonnegative(),
     }),
     z.object({
       ...base,
       kind: z.literal('finding'),
       findingId: z.string().min(1),
       file: z.string().min(1),
       findingClass: z.enum(FINDING_CLASSES),
       escapedFrom: z.enum(ESCAPED_FROM_STAGES),
     }),
   ]);

   export interface BuildAttributionInput {
     receipt: ReviewReceipt;
     /** The review's label: `phase-0`, `final-all`, or the standalone directory name. */
     review: string;
     /** Blocking findings, one per location (collectBlockingFindings). */
     blockingFindings: readonly ReceiptFinding[];
     branch: string;
     /** The PR number, when known. */
     pr?: number;
     stamp: ReviewStampState;
     now: Date;
   }

   /** One `review` record for the run, then one `finding` record per attributed blocking finding. */
   export function buildAttributionRecords(
     input: BuildAttributionInput
   ): ReviewAttributionRecord[] {
     const common = {
       schemaVersion: 1 as const,
       ts: input.now.toISOString(),
       ref: input.pr !== undefined ? `pr:${input.pr}` : `branch:${input.branch}`,
       branch: input.branch,
       head: input.receipt.diff.head,
       moment: input.receipt.moment,
       review: input.review,
       stamp: input.stamp,
     };
     const run: ReviewRunAttribution = {
       ...common,
       kind: 'review',
       tier: input.receipt.tier,
       blocking: input.blockingFindings.length,
     };
     const findings: FindingAttribution[] = [];
     for (const f of input.blockingFindings) {
       if (f.findingClass === undefined || f.escapedFrom === undefined) continue;
       findings.push({
         ...common,
         kind: 'finding',
         findingId: f.id,
         file: f.file,
         findingClass: f.findingClass,
         escapedFrom: f.escapedFrom,
       });
     }
     return [run, ...findings];
   }

   /** Identity of a record: a review run at a head, or one finding of it. */
   export function attributionKey(r: ReviewAttributionRecord): string {
     return r.kind === 'review'
       ? `review|${r.head}|${r.review}`
       : `finding|${r.head}|${r.review}|${r.findingId}`;
   }

   export interface ReviewAttributionRead {
     /** False when the log file does not exist. An absent log is not a log of zero findings. */
     present: boolean;
     records: ReviewAttributionRecord[];
     /** Lines that are not valid records. */
     invalid: number;
   }

   export function readReviewAttribution(projectRoot: string): ReviewAttributionRead {
     let text: string;
     try {
       text = fs.readFileSync(reviewAttributionPath(projectRoot), 'utf-8');
     } catch {
       return { present: false, records: [], invalid: 0 };
     }
     const records: ReviewAttributionRecord[] = [];
     let invalid = 0;
     for (const line of text.split('\n')) {
       if (line.trim() === '') continue;
       try {
         const parsed = ReviewAttributionRecordSchema.safeParse(JSON.parse(line));
         if (parsed.success) records.push(parsed.data as ReviewAttributionRecord);
         else invalid++;
       } catch {
         invalid++;
       }
     }
     return { present: true, records, invalid };
   }

   export interface AppendAttributionResult {
     appended: number;
     /** Records already in the log (same review at the same head). */
     skipped: number;
     /** Set when the append failed. The caller logs it; a review never fails on it. */
     error?: string;
   }

   /** Append records the log does not hold yet. Never throws. */
   export function appendReviewAttribution(
     projectRoot: string,
     records: readonly ReviewAttributionRecord[]
   ): AppendAttributionResult {
     try {
       const file = reviewAttributionPath(projectRoot);
       fs.mkdirSync(path.dirname(file), { recursive: true });
       const seen = new Set(readReviewAttribution(projectRoot).records.map(attributionKey));
       const fresh: ReviewAttributionRecord[] = [];
       for (const r of records) {
         const key = attributionKey(r);
         if (seen.has(key)) continue;
         seen.add(key);
         fresh.push(r);
       }
       if (fresh.length > 0) {
         let prefix = '';
         try {
           const existing = fs.readFileSync(file, 'utf-8');
           if (existing !== '' && !existing.endsWith('\n')) prefix = '\n';
         } catch {
           // No log yet.
         }
         fs.appendFileSync(file, prefix + fresh.map((r) => JSON.stringify(r)).join('\n') + '\n');
       }
       return { appended: fresh.length, skipped: records.length - fresh.length };
     } catch (err) {
       return { appended: 0, skipped: 0, error: err instanceof Error ? err.message : String(err) };
     }
   }
   ```

4. Run the test. Observe pass. Run `pnpm --filter @harness-engineering/core typecheck`.
5. VALIDATE.
6. Commit: `feat(core): add the review attribution log`

### Task 11: Summarize the attribution log into the leak report

**Depends on:** Task 1 | **Files:** `packages/core/src/receipts/attribution-report.ts`, `packages/core/tests/receipts/attribution-report.test.ts`

1. Create `packages/core/tests/receipts/attribution-report.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import {
     renderReviewAttributionReport,
     summarizeReviewAttribution,
   } from '../../src/receipts/attribution-report';
   import type { ReviewAttributionRecord } from '@harness-engineering/types';

   const common = { schemaVersion: 1 as const, ts: 't', branch: 'b' };
   const run = (
     ref: string,
     moment: 'phase' | 'final' | 'standalone',
     stamp: 'stamped' | 'unstamped' | 'not-applicable',
     blocking: number,
     head = 'h1'
   ): ReviewAttributionRecord => ({
     ...common,
     kind: 'review',
     ref,
     head,
     moment,
     review: `${moment}-${head}`,
     stamp,
     tier: 'full',
     blocking,
   });
   const finding = (
     moment: 'phase' | 'final' | 'standalone',
     findingClass: 'stale-claim' | 'edge-case',
     escapedFrom: 'plan' | 'execution'
   ): ReviewAttributionRecord => ({
     ...common,
     kind: 'finding',
     ref: 'pr:1',
     head: 'h1',
     moment,
     review: 'r',
     stamp: 'stamped',
     findingId: `${moment}-${findingClass}-${escapedFrom}`,
     file: 'a.ts',
     findingClass,
     escapedFrom,
   });
   const records = [
     run('branch:b', 'phase', 'not-applicable', 2),
     run('branch:b', 'final', 'not-applicable', 0),
     run('pr:1', 'standalone', 'stamped', 2),
     run('pr:1', 'standalone', 'stamped', 0, 'h2'),
     run('pr:2', 'standalone', 'stamped', 0),
     run('pr:3', 'standalone', 'unstamped', 4),
     run('branch:b', 'standalone', 'unstamped', 1),
     finding('phase', 'stale-claim', 'plan'),
     finding('phase', 'edge-case', 'plan'),
     finding('standalone', 'stale-claim', 'execution'),
   ];

   describe('summarizeReviewAttribution', () => {
     const s = summarizeReviewAttribution(records);
     it('counts reviews and findings, by stage and by class, largest first', () => {
       expect(s.reviews).toBe(7);
       expect(s.findings).toBe(3);
       expect(Object.entries(s.byStage)).toEqual([
         ['plan', 2],
         ['execution', 1],
       ]);
       expect(Object.entries(s.byClass)).toEqual([
         ['stale-claim', 2],
         ['edge-case', 1],
       ]);
     });
     it('SC8: reports blocking findings per PR for standalone reviews of stamped PRs only', () => {
       expect(s.standaloneStamped).toEqual([
         { ref: 'pr:1', reviews: 2, blocking: 2 },
         { ref: 'pr:2', reviews: 1, blocking: 0 },
       ]);
       expect(s.standaloneUnstamped).toBe(2);
     });
   });

   describe('renderReviewAttributionReport', () => {
     const file = '.harness/metrics/review-attribution.jsonl';
     it('prints the per-PR leak, including a PR whose standalone review found nothing', () => {
       const lines = renderReviewAttributionReport(summarizeReviewAttribution(records), {
         present: true,
         invalid: 0,
         file,
       });
       expect(lines).toEqual([
         'Review attribution: 7 reviews, 3 blocking findings',
         '  escaped from: plan 2, execution 1',
         '  by class: stale-claim 2, edge-case 1',
         '  standalone reviews of stamped PRs: 2 PRs, 2 blocking findings',
         '    pr:1: 2 blocking across 2 reviews',
         '    pr:2: 0 blocking across 1 review',
         '  standalone reviews recorded as unstamped: 2',
       ]);
     });
     it('does not present an empty measure as a zero leak', () => {
       const none = renderReviewAttributionReport(
         summarizeReviewAttribution([run('branch:b', 'phase', 'not-applicable', 0)]),
         { present: true, invalid: 2, file }
       );
       expect(none).toContain(
         '  standalone reviews of stamped PRs: none recorded (no measurement yet, not a zero leak)'
       );
       expect(none).toContain('  WARNING: 2 unreadable lines were skipped');
     });
     it('says the log is absent rather than reporting zeros', () => {
       expect(
         renderReviewAttributionReport(summarizeReviewAttribution([]), {
           present: false,
           invalid: 0,
           file,
         })
       ).toEqual([`No review attribution recorded (no log file at ${file}).`]);
     });
   });
   ```

2. Run `pnpm --filter @harness-engineering/core exec vitest run tests/receipts/attribution-report.test.ts`. Observe failure.
3. Create `packages/core/src/receipts/attribution-report.ts`:

   ```ts
   import type { ReviewAttributionRecord } from '@harness-engineering/types';

   export interface StandalonePrLeak {
     /** `pr:<number>`. */
     ref: string;
     /** Standalone reviews recorded for this PR. */
     reviews: number;
     /** Blocking findings those reviews raised. This is the success measure: lower is better. */
     blocking: number;
   }

   export interface ReviewAttributionSummary {
     reviews: number;
     findings: number;
     /** Finding counts by escaped-from stage, largest first. A ranking, not exact counts. */
     byStage: Record<string, number>;
     byClass: Record<string, number>;
     standaloneStamped: StandalonePrLeak[];
     standaloneUnstamped: number;
   }

   function ranked(counts: Map<string, number>): Record<string, number> {
     return Object.fromEntries([...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)));
   }

   function bump(counts: Map<string, number>, key: string): void {
     counts.set(key, (counts.get(key) ?? 0) + 1);
   }

   export function summarizeReviewAttribution(
     records: readonly ReviewAttributionRecord[]
   ): ReviewAttributionSummary {
     const byStage = new Map<string, number>();
     const byClass = new Map<string, number>();
     const perPr = new Map<string, StandalonePrLeak>();
     let reviews = 0;
     let findings = 0;
     let standaloneUnstamped = 0;
     for (const r of records) {
       if (r.kind === 'finding') {
         findings++;
         bump(byStage, r.escapedFrom);
         bump(byClass, r.findingClass);
         continue;
       }
       reviews++;
       if (r.moment !== 'standalone') continue;
       if (r.stamp !== 'stamped') {
         standaloneUnstamped++;
         continue;
       }
       const leak = perPr.get(r.ref) ?? { ref: r.ref, reviews: 0, blocking: 0 };
       leak.reviews++;
       leak.blocking += r.blocking;
       perPr.set(r.ref, leak);
     }
     return {
       reviews,
       findings,
       byStage: ranked(byStage),
       byClass: ranked(byClass),
       standaloneStamped: [...perPr.values()].sort((a, b) => (a.ref < b.ref ? -1 : 1)),
       standaloneUnstamped,
     };
   }

   function list(counts: Record<string, number>): string {
     const parts = Object.entries(counts).map(([k, n]) => `${k} ${n}`);
     return parts.length > 0 ? parts.join(', ') : 'none';
   }

   const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

   export function renderReviewAttributionReport(
     summary: ReviewAttributionSummary,
     log: { present: boolean; invalid: number; file: string }
   ): string[] {
     if (!log.present) return [`No review attribution recorded (no log file at ${log.file}).`];
     const lines = [
       `Review attribution: ${plural(summary.reviews, 'review')}, ${plural(summary.findings, 'blocking finding')}`,
       `  escaped from: ${list(summary.byStage)}`,
       `  by class: ${list(summary.byClass)}`,
     ];
     if (summary.standaloneStamped.length === 0) {
       lines.push(
         '  standalone reviews of stamped PRs: none recorded (no measurement yet, not a zero leak)'
       );
     } else {
       const total = summary.standaloneStamped.reduce((n, p) => n + p.blocking, 0);
       lines.push(
         `  standalone reviews of stamped PRs: ${plural(summary.standaloneStamped.length, 'PR')}, ${plural(total, 'blocking finding')}`
       );
       for (const p of summary.standaloneStamped) {
         lines.push(`    ${p.ref}: ${p.blocking} blocking across ${plural(p.reviews, 'review')}`);
       }
     }
     if (summary.standaloneUnstamped > 0) {
       lines.push(`  standalone reviews recorded as unstamped: ${summary.standaloneUnstamped}`);
     }
     if (log.invalid > 0) {
       lines.push(`  WARNING: ${plural(log.invalid, 'unreadable line')} were skipped`);
     }
     return lines;
   }
   ```

   The warning test expects `2 unreadable lines were skipped`; `plural(2, 'unreadable line')` yields that text.

4. Run the test. Observe pass.
5. VALIDATE.
6. Commit: `feat(core): summarize review attribution into the leak report`

### Task 12: Give the receipts module its index and pin its surface

**Depends on:** Task 4, Task 6, Task 7, Task 8, Task 9, Task 10, Task 11 | **Files:** `packages/core/src/receipts/index.ts`, `packages/core/tests/receipts/public-surface.test.ts`

1. Create `packages/core/tests/receipts/public-surface.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import * as receipts from '../../src/receipts';

   describe('receipts module surface', () => {
     it.each([
       'validateReviewReceipt',
       'parseReviewReceipt',
       'parseReviewerFindingsFile',
       'resolveReviewBackend',
       'sessionReviewDir',
       'standaloneReviewDir',
       'readReceiptFile',
       'findingsReaderFor',
       'collectBlockingFindings',
       'buildProvenanceRow',
       'renderProvenanceBlock',
       'extractProvenanceBlock',
       'countProvenanceRows',
       'buildAttributionRecords',
       'appendReviewAttribution',
       'readReviewAttribution',
       'summarizeReviewAttribution',
       'renderReviewAttributionReport',
     ])('exports %s as a function', (name) => {
       expect(typeof (receipts as Record<string, unknown>)[name]).toBe('function');
     });
     it('exports the marker and the gate failure codes', () => {
       expect(receipts.PROVENANCE_MARKER).toBe('<!-- harness:review-provenance -->');
       expect(receipts.REVIEW_GATE_FAILURE_CODES).toContain('RECEIPT_MISSING');
     });
   });
   ```

2. Run `pnpm --filter @harness-engineering/core exec vitest run tests/receipts/public-surface.test.ts`. Observe failure.
3. Create `packages/core/src/receipts/index.ts`:

   ```ts
   /**
    * Pipeline receipts: typed records of what a review did, and the gates that recompute them
    * (docs/changes/shift-left-pipeline-fidelity/proposal.md, D3 and D4).
    */
   export * from './schema';
   export * from './review-gate';
   export * from './backend';
   export * from './layout';
   export * from './load';
   export * from './provenance';
   export * from './attribution';
   export * from './attribution-report';
   ```

4. Run `pnpm --filter @harness-engineering/core exec vitest run tests/receipts`. Observe every receipts test pass.
5. VALIDATE.
6. Commit: `feat(core): add the receipts module index`

### Task 13: Export the receipts module from the core barrel and rebuild

**Depends on:** Task 5, Task 12 | **Files:** `scripts/generate-core-barrel.mjs`, `packages/core/src/index.ts`, `packages/core/public-symbols.txt`

This task changes generated files only; its check is the generator's own `--check`.

1. Run `pnpm run generate:barrels:check`. Observe failure (the barrel lacks `./receipts`, and the manifest lacks the `selectReviewTier` symbols from Task 5).
2. In `scripts/generate-core-barrel.mjs`, add an entry to `DIR_COMMENTS` directly after the `review:` line:

   ```js
     receipts:
       'Pipeline receipts — typed review receipts, the credential-free gate that recomputes them, the provenance stamp, and the stage-attribution log (shift-left pipeline fidelity).',
   ```

   The `receipts/` directory has an `index.ts`, so `discoverStarModules()` picks it up with no allowlist entry.

3. Run `pnpm run generate:barrels`. Check that `packages/core/src/index.ts` now contains `export * from './receipts';` and that these all print a count of 1 or more:

   ```bash
   grep -c "^validateReviewReceipt$" packages/core/public-symbols.txt
   grep -c "^selectReviewTier$" packages/core/public-symbols.txt
   grep -c "^renderProvenanceBlock$" packages/core/public-symbols.txt
   ```

4. Run `pnpm --filter @harness-engineering/core typecheck`. If it reports TS2308 (a name already exported by another module), rename the colliding symbol in `packages/core/src/receipts/`, rerun the receipts tests, and rerun `pnpm run generate:barrels`. Do not hide a symbol by removing it from `index.ts`.
5. Run `pnpm run generate:barrels:check`. Observe pass.
6. Run `pnpm turbo run build --filter=@harness-engineering/cli...` so the CLI tasks resolve the new exports.
7. Run `pnpm --filter @harness-engineering/core exec vitest run tests/receipts tests/review/tier-selector.test.ts`. Observe pass.
8. VALIDATE. Run `harness check-deps`.
9. Commit: `feat(core): export the receipts module and review tier selector`

---

## Milestone B: CLI and MCP surfaces

### Task 14: Add the `review.backend` config key

**Depends on:** none | **Files:** `packages/cli/src/config/schema.ts`, `packages/cli/tests/config/review-schema.test.ts`

1. In `packages/cli/tests/config/review-schema.test.ts`, add inside `describe('ReviewConfigSchema', ...)`:

   ```ts
   it('accepts review.backend agent and pipeline, and leaves it unset by default (D8)', () => {
     expect(ReviewConfigSchema.safeParse({ backend: 'agent' }).success).toBe(true);
     const p = ReviewConfigSchema.safeParse({ backend: 'pipeline' });
     expect(p.success && p.data.backend).toBe('pipeline');
     const unset = ReviewConfigSchema.safeParse({});
     expect(unset.success && unset.data.backend).toBeUndefined();
   });

   it('rejects an unknown review.backend', () => {
     expect(ReviewConfigSchema.safeParse({ backend: 'cloud' }).success).toBe(false);
   });
   ```

2. Run `pnpm --filter @harness-engineering/cli exec vitest run tests/config/review-schema.test.ts`. Observe the first new test fail on `p.data.backend` (unknown keys are stripped) and the second fail.
3. In `packages/cli/src/config/schema.ts`, change `ReviewConfigSchema` to:

   ```ts
   export const ReviewConfigSchema = z.object({
     /** Custom model tier mappings for reviewers */
     model_tiers: ModelTierConfigSchema.optional(),
     /**
      * Backend for a `full` review: `"agent"` (the default; the reviewing session dispatches one
      * reviewer per record) or `"pipeline"` (the coded `runReviewPipeline`). When `"pipeline"` is
      * set and no runner resolves, the review runs on the agent backend and its receipt records
      * `backend: "agent"`.
      */
     backend: z.enum(['agent', 'pipeline']).optional(),
   });
   ```

4. Run the test. Observe pass. Run `pnpm --filter @harness-engineering/cli typecheck`.
5. VALIDATE.
6. Commit: `feat(cli): add the review.backend config key`

### Task 15: Add `harness check-review-receipt`

**Depends on:** Task 13 | **Files:** `packages/cli/src/commands/check-review-receipt.ts`, `packages/cli/tests/commands/check-review-receipt.test.ts`

1. Create `packages/cli/tests/commands/check-review-receipt.test.ts`:

   ```ts
   import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
   import * as fs from 'node:fs';
   import * as os from 'node:os';
   import * as path from 'node:path';
   import { fileURLToPath } from 'node:url';
   import { Command } from 'commander';
   import {
     createCheckReviewReceiptCommand,
     formatCheckReviewReceipt,
     runCheckReviewReceipt,
     type GitRunner,
   } from '../../src/commands/check-review-receipt';

   const BASE = 'a'.repeat(40);
   const HEAD = 'b'.repeat(40);
   const FULL = ['compliance', 'bug', 'security', 'architecture'];
   let tmp: string;
   let dir: string;

   const git =
     (files: string[] = ['src/a.ts'], head = HEAD): GitRunner =>
     (args) => {
       if (args[0] === 'rev-parse') return head;
       if (args[0] === 'diff') return files.join('\n');
       throw new Error(`unexpected git ${args.join(' ')}`);
     };
   const receipt = (over: Record<string, unknown> = {}) => ({
     schemaVersion: 1,
     moment: 'phase',
     tier: 'full',
     backend: 'agent',
     diff: { base: BASE, head: HEAD },
     coldContext: true,
     priorFindingsSupplied: false,
     reviewers: FULL.map((id) => ({ id, required: true, ran: true, findingsPath: `${id}.json` })),
     blocking: 0,
     advisory: 0,
     ...over,
   });
   function write(r: unknown, ids: string[] = FULL) {
     fs.writeFileSync(path.join(dir, 'receipt.json'), JSON.stringify(r));
     for (const id of ids) {
       fs.writeFileSync(
         path.join(dir, `${id}.json`),
         JSON.stringify({
           schemaVersion: 1,
           reviewerId: id,
           examinedFiles: ['src/a.ts'],
           findings: [],
         })
       );
     }
   }
   const run = (g: GitRunner = git()) =>
     runCheckReviewReceipt({ receiptPath: dir, cwd: tmp, git: g });

   beforeEach(() => {
     tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-check-receipt-'));
     dir = path.join(tmp, '.harness', 'sessions', 's1', 'reviews', 'phase-0');
     fs.mkdirSync(dir, { recursive: true });
   });
   afterEach(() => {
     vi.restoreAllMocks();
     vi.unstubAllEnvs();
     process.exitCode = undefined;
     fs.rmSync(tmp, { recursive: true, force: true });
   });

   describe('runCheckReviewReceipt', () => {
     it('passes a full receipt whose reviewers each wrote a findings file over the diff', () => {
       write(receipt());
       const r = run();
       expect(r.failures).toEqual([]);
       expect(r).toMatchObject({ pass: true, reviewersRun: 4, reviewersRequired: 4, tier: 'full' });
     });
     it('SC16: a missing receipt fails with RECEIPT_MISSING', () => {
       const r = run();
       expect(r.pass).toBe(false);
       expect(r.failures.map((f) => f.code)).toEqual(['RECEIPT_MISSING']);
       expect(r.failures[0]?.message).toContain('receipt.json');
     });
     it('SC2: names the required reviewer that did not run', () => {
       const reviewers = FULL.map((id) =>
         id === 'security'
           ? { id, required: true, ran: false, skippedReason: 'timeout' }
           : { id, required: true, ran: true, findingsPath: `${id}.json` }
       );
       write(receipt({ reviewers }));
       const r = run();
       expect(r.pass).toBe(false);
       expect(formatCheckReviewReceipt(r).join('\n')).toMatch(
         /REQUIRED_REVIEWER_NOT_RUN.*"security"/
       );
     });
     it('SC3: fails when a reviewer marked ran has no findings file on disk', () => {
       write(receipt(), ['compliance', 'security', 'architecture']);
       const r = run();
       expect(r.failures).toEqual([
         expect.objectContaining({ code: 'FINDINGS_FILE_MISSING', reviewerId: 'bug' }),
       ]);
     });
     it('SC4: fails a final receipt that is not full, cold and free of prior findings', () => {
       write(receipt({ moment: 'final', coldContext: false, priorFindingsSupplied: true }));
       expect(run().failures.map((f) => f.code)).toEqual([
         'FINAL_NOT_COLD',
         'FINAL_PRIOR_FINDINGS',
       ]);
     });
     it('recomputes HEAD and the diff: a stale head or an out-of-diff file fails', () => {
       write(receipt());
       expect(run(git(['src/a.ts'], 'c'.repeat(40))).failures.map((f) => f.code)).toEqual([
         'HEAD_MISMATCH',
       ]);
       expect(run(git(['src/other.ts'])).failures.map((f) => f.code)).toContain(
         'EXAMINED_OUTSIDE_DIFF'
       );
     });
     it('asks git for the receipt range and nothing else, and only with full shas', () => {
       write(receipt());
       const calls: string[][] = [];
       run((args) => {
         calls.push(args);
         return git()(args, tmp);
       });
       expect(calls).toEqual([
         ['rev-parse', 'HEAD'],
         ['diff', '--name-only', `${BASE}..${HEAD}`],
       ]);
       write({ ...receipt(), diff: { base: '--output=/tmp/x', head: HEAD } });
       const unsafe: string[][] = [];
       const r = run((args) => {
         unsafe.push(args);
         return git()(args, tmp);
       });
       expect(unsafe.some((a) => a[0] === 'diff')).toBe(false);
       expect(r.failures.map((f) => f.code)).toEqual(['RECEIPT_INVALID']);
     });
     it('fails closed when git cannot run', () => {
       write(receipt());
       const r = run(() => {
         throw new Error('git: not found');
       });
       expect(r.pass).toBe(false);
       expect(r.failures.map((f) => f.code)).toEqual(
         expect.arrayContaining(['HEAD_MISMATCH', 'DIFF_UNRESOLVED'])
       );
     });
     it('SC15: a receipt that records backend agent after a pipeline fallback is judged as an agent review', () => {
       write(receipt({ backend: 'agent' }));
       expect(run()).toMatchObject({ pass: true, backend: 'agent' });
     });
     it('SC13: the result does not depend on any model or GitHub credential', () => {
       write(receipt());
       vi.stubEnv('ANTHROPIC_API_KEY', '');
       vi.stubEnv('OPENAI_API_KEY', '');
       vi.stubEnv('GITHUB_TOKEN', '');
       const without = run();
       vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-x');
       vi.stubEnv('OPENAI_API_KEY', 'sk-x');
       vi.stubEnv('GITHUB_TOKEN', 'ghp_' + 'x'.repeat(36));
       expect(run()).toEqual(without);
       expect(without.pass).toBe(true);
     });
     it('SC13: no gate source reads the environment', () => {
       const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
       const sources = [
         path.join(root, 'core', 'src', 'receipts', 'review-gate.ts'),
         path.join(root, 'core', 'src', 'receipts', 'schema.ts'),
         path.join(root, 'core', 'src', 'receipts', 'load.ts'),
         path.join(root, 'cli', 'src', 'commands', 'check-review-receipt.ts'),
       ];
       for (const file of sources) {
         expect(fs.readFileSync(file, 'utf-8'), file).not.toMatch(/process\.env|API_KEY|fetch\(/);
       }
     });
   });

   describe('harness check-review-receipt', () => {
     async function invoke(args: string[]) {
       const program = new Command().option('--json');
       program.addCommand(createCheckReviewReceiptCommand({ cwd: () => tmp, git: git() }));
       const out: string[] = [];
       vi.spyOn(console, 'log').mockImplementation((...a) => void out.push(a.join(' ')));
       vi.spyOn(console, 'error').mockImplementation((...a) => void out.push(a.join(' ')));
       await program.parseAsync(['node', 'harness', ...args]);
       return out.join('\n');
     }
     it('exits 0 on a passing receipt and prints the denominator', async () => {
       write(receipt());
       const out = await invoke(['check-review-receipt', dir]);
       expect(out).toMatch(/PASS.*4\/4 required reviewers ran/);
       expect(process.exitCode ?? 0).toBe(0);
     });
     it('SC16: exits 1 when no receipt exists', async () => {
       await invoke(['check-review-receipt', path.join(dir, 'nope')]);
       expect(process.exitCode).toBe(1);
     });
     it('emits one JSON document under --json, with the verdict agreeing with the exit code', async () => {
       write(receipt(), ['compliance']);
       const out = await invoke(['--json', 'check-review-receipt', dir]);
       const doc = JSON.parse(out);
       expect(doc.pass).toBe(false);
       expect(doc.failures.length).toBeGreaterThan(0);
       expect(process.exitCode).toBe(1);
     });
   });
   ```

2. Run `pnpm --filter @harness-engineering/cli exec vitest run tests/commands/check-review-receipt.test.ts`. Observe failure.
3. Create `packages/cli/src/commands/check-review-receipt.ts`:

   ```ts
   import { execFileSync } from 'node:child_process';
   import * as path from 'node:path';
   import { Command } from 'commander';
   import {
     findingsReaderFor,
     readReceiptFile,
     validateReviewReceipt,
     type ReviewGateFailure,
   } from '@harness-engineering/core';
   import { logger } from '../output/logger';
   import { ExitCode } from '../utils/errors';

   /** Injectable git seam: trimmed stdout of `git <args>` run in `cwd`. No shell. */
   export type GitRunner = (args: string[], cwd: string) => string;

   export const defaultGitRunner: GitRunner = (args, cwd) =>
     execFileSync('git', args, {
       cwd,
       encoding: 'utf-8',
       maxBuffer: 64 * 1024 * 1024,
       stdio: ['ignore', 'pipe', 'pipe'],
     })
       .toString()
       .trim();

   export interface CheckReviewReceiptOptions {
     /** Path to receipt.json or to the review directory holding it. */
     receiptPath: string;
     cwd?: string;
     git?: GitRunner;
   }

   export interface CheckReviewReceiptReport {
     pass: boolean;
     receiptPath: string;
     failures: ReviewGateFailure[];
     reviewersRun: number;
     reviewersRequired: number;
     moment?: string;
     tier?: string;
     backend?: string;
   }

   const FULL_SHA = /^[0-9a-f]{40}$/;

   function tryGit(git: GitRunner, args: string[], cwd: string): string | undefined {
     try {
       return git(args, cwd);
     } catch {
       return undefined;
     }
   }

   /** The receipt's claimed range, only when both ends are full shas (never pass free text to git). */
   function claimedRange(raw: unknown): { base: string; head: string } | undefined {
     const diff = (raw as { diff?: { base?: unknown; head?: unknown } } | null)?.diff;
     if (typeof diff?.base !== 'string' || typeof diff?.head !== 'string') return undefined;
     if (!FULL_SHA.test(diff.base) || !FULL_SHA.test(diff.head)) return undefined;
     return { base: diff.base, head: diff.head };
   }

   /**
    * The review receipt gate. It recomputes HEAD and the diff's file set with git and reads each
    * reviewer's findings file itself; the receipt's fields are claims. No model, no network.
    */
   export function runCheckReviewReceipt(
     opts: CheckReviewReceiptOptions
   ): CheckReviewReceiptReport {
     const cwd = opts.cwd ?? process.cwd();
     const git = opts.git ?? defaultGitRunner;
     const read = readReceiptFile(path.resolve(cwd, opts.receiptPath));
     if (read.status !== 'ok') {
       const failure: ReviewGateFailure =
         read.status === 'missing'
           ? { code: 'RECEIPT_MISSING', message: `no review receipt at ${read.path}` }
           : {
               code: 'RECEIPT_INVALID',
               message: `review receipt at ${read.path} is unreadable: ${read.reason}`,
             };
       return {
         pass: false,
         receiptPath: read.path,
         failures: [failure],
         reviewersRun: 0,
         reviewersRequired: 0,
       };
     }
     const range = claimedRange(read.raw);
     const head = range === undefined ? '' : (tryGit(git, ['rev-parse', 'HEAD'], cwd) ?? '');
     const names =
       range === undefined
         ? undefined
         : tryGit(git, ['diff', '--name-only', `${range.base}..${range.head}`], cwd);
     const diffFiles =
       names === undefined
         ? undefined
         : names
             .split('\n')
             .map((s) => s.trim())
             .filter((s) => s !== '');
     const result = validateReviewReceipt(read.raw, {
       head,
       diffFiles,
       readFindings: findingsReaderFor(read.dir),
     });
     return {
       pass: result.pass,
       receiptPath: read.path,
       failures: result.failures,
       reviewersRun: result.reviewersRun,
       reviewersRequired: result.reviewersRequired,
       ...(result.receipt !== undefined && {
         moment: result.receipt.moment,
         tier: result.receipt.tier,
         backend: result.receipt.backend,
       }),
     };
   }

   export function formatCheckReviewReceipt(report: CheckReviewReceiptReport): string[] {
     const what =
       report.tier === undefined
         ? ''
         : ` (${report.moment} review, tier ${report.tier}, backend ${report.backend})`;
     const ran = `${report.reviewersRun}/${report.reviewersRequired} required reviewers ran`;
     if (report.pass) return [`review receipt gate: PASS${what}: ${ran}`];
     return [
       `review receipt gate: FAIL${what}: ${ran}`,
       `  receipt: ${report.receiptPath}`,
       ...report.failures.map((f) => `  - [${f.code}] ${f.message}`),
     ];
   }

   /** Injected inputs for tests; production uses the process cwd and real git. */
   export interface CheckReviewReceiptDeps {
     cwd?: () => string;
     git?: GitRunner;
   }

   export function createCheckReviewReceiptCommand(deps: CheckReviewReceiptDeps = {}): Command {
     return new Command('check-review-receipt')
       .description(
         'Gate a review receipt: recompute HEAD, the diff file set and every reviewer findings file. ' +
           'Exits 1 on any failure, including a missing receipt. Needs no model credential'
       )
       .argument('<path>', 'Path to receipt.json, or to the review directory that holds it')
       .action((receiptPath: string, _opts: unknown, cmd: Command) => {
         const report = runCheckReviewReceipt({
           receiptPath,
           ...(deps.cwd !== undefined && { cwd: deps.cwd() }),
           ...(deps.git !== undefined && { git: deps.git }),
         });
         if ((cmd.optsWithGlobals() as { json?: boolean }).json) {
           console.log(JSON.stringify(report, null, 2));
         } else {
           for (const line of formatCheckReviewReceipt(report)) {
             if (report.pass) logger.info(line);
             else logger.error(line);
           }
         }
         process.exitCode = report.pass ? ExitCode.SUCCESS : ExitCode.VALIDATION_FAILED;
       });
   }
   ```

   Note on the `RECEIPT_INVALID` range case: when `claimedRange` is undefined the receipt cannot be a valid one (the schema requires full shas), so `validateReviewReceipt` returns `RECEIPT_INVALID` alone and git is never asked for a diff.

4. Run the test. Observe pass. If the `logger` helpers print to a stream the test does not capture, capture `process.stdout.write` and `process.stderr.write` in `invoke` as well; do not change what the command prints. Run `pnpm --filter @harness-engineering/cli typecheck`.
5. VALIDATE. Run `harness check-deps`.
6. Commit: `feat(cli): add harness check-review-receipt, the review receipt gate`

### Task 16: Add `harness review-provenance render`

**Depends on:** Task 13 | **Files:** `packages/cli/src/commands/review-provenance.ts`, `packages/cli/tests/commands/review-provenance.test.ts`

1. Create `packages/cli/tests/commands/review-provenance.test.ts`:

   ```ts
   import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
   import * as fs from 'node:fs';
   import * as os from 'node:os';
   import * as path from 'node:path';
   import { Command } from 'commander';
   import {
     createReviewProvenanceCommand,
     runReviewProvenanceRender,
   } from '../../src/commands/review-provenance';

   const BASE = 'a1b2c3d' + '0'.repeat(33);
   const HEAD = 'e4f5a6b' + '1'.repeat(33);
   let tmp: string;
   let session: string;

   function review(label: string, over: Record<string, unknown> = {}, findings: unknown[] = []) {
     const dir = path.join(session, 'reviews', label);
     fs.mkdirSync(dir, { recursive: true });
     fs.writeFileSync(
       path.join(dir, 'bug.json'),
       JSON.stringify({ schemaVersion: 1, reviewerId: 'bug', examinedFiles: ['a.ts'], findings })
     );
     fs.writeFileSync(
       path.join(dir, 'receipt.json'),
       JSON.stringify({
         schemaVersion: 1,
         moment: label.startsWith('final') ? 'final' : 'phase',
         tier: 'light',
         backend: 'agent',
         diff: { base: BASE, head: HEAD },
         coldContext: true,
         priorFindingsSupplied: false,
         reviewers: [{ id: 'bug', required: true, ran: true, findingsPath: 'bug.json' }],
         blocking: findings.length,
         advisory: 0,
         ...over,
       })
     );
   }
   const blocking = {
     id: 'b1',
     file: 'a.ts',
     lineRange: [1, 1],
     severity: 'critical',
     title: 't',
     findingClass: 'stale-claim',
     escapedFrom: 'plan',
   };
   const render = () => runReviewProvenanceRender({ session: 's1', cwd: tmp });

   beforeEach(() => {
     tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-provenance-'));
     session = path.join(tmp, '.harness', 'sessions', 's1');
     fs.mkdirSync(session, { recursive: true });
   });
   afterEach(() => {
     vi.restoreAllMocks();
     process.exitCode = undefined;
     fs.rmSync(tmp, { recursive: true, force: true });
   });

   describe('runReviewProvenanceRender', () => {
     it('SC6: renders one row per review, phases in order and the final review last', () => {
       review('final-all', { tier: 'full' });
       review('phase-10');
       review('phase-2', {}, [blocking]);
       const out = render();
       expect(out.ok).toBe(true);
       if (!out.ok) return;
       expect(out.report.rows.map((r) => r.review)).toEqual(['phase-2', 'phase-10', 'final-all']);
       expect(out.report.block).toContain(
         '| phase-2 | phase | light | agent | 1/1 | `a1b2c3d..e4f5a6b` | 1 | stale-claim 1 | plan 1 | none |'
       );
       expect(out.report.block.split('\n')[0]).toBe('<!-- harness:review-provenance -->');
     });
     it('shows an override recorded in autopilot decisions[] on the matching row', () => {
       review('phase-0');
       review('final-all');
       fs.writeFileSync(
         path.join(session, 'autopilot-state.json'),
         JSON.stringify({
           decisions: [
             { state: 'ASSESS', phase: 0, chosen: 'auto-plan' },
             { state: 'REVIEW', phase: 0, chosen: 'override', question: 'FINDINGS_FILE_MISSING' },
             { state: 'FINAL_REVIEW', chosen: 'override', rationale: 'accepted by owner' },
           ],
         })
       );
       const out = render();
       expect(out.ok && out.report.rows.map((r) => r.override)).toEqual([
         'FINDINGS_FILE_MISSING',
         'accepted by owner',
       ]);
     });
     it('lists an invalid receipt rather than dropping the review', () => {
       review('phase-0');
       fs.mkdirSync(path.join(session, 'reviews', 'phase-1'), { recursive: true });
       fs.writeFileSync(path.join(session, 'reviews', 'phase-1', 'receipt.json'), '{nope');
       const out = render();
       expect(out.ok && out.report.invalid).toEqual([
         { review: 'phase-1', reason: 'not valid JSON' },
       ]);
       expect(out.ok && out.report.block).toContain('- phase-1: receipt invalid (not valid JSON)');
     });
     it('renders "no pipeline review recorded" for a session with no reviews directory', () => {
       const out = render();
       expect(out.ok && out.report.rows).toEqual([]);
       expect(out.ok && out.report.block).toContain('no pipeline review recorded');
     });
     it('fails for an unknown session and for a slug that is not one path segment', () => {
       expect(runReviewProvenanceRender({ session: 'nope', cwd: tmp })).toMatchObject({
         ok: false,
       });
       expect(runReviewProvenanceRender({ session: '../s1', cwd: tmp })).toMatchObject({
         ok: false,
       });
     });
   });

   describe('harness review-provenance render', () => {
     it('prints only the block on stdout, so it can be pasted into a PR body', async () => {
       review('phase-0');
       const program = new Command().option('--json');
       program.addCommand(createReviewProvenanceCommand({ cwd: () => tmp }));
       const out: string[] = [];
       vi.spyOn(console, 'log').mockImplementation((...a) => void out.push(a.join(' ')));
       await program.parseAsync([
         'node',
         'harness',
         'review-provenance',
         'render',
         '--session',
         's1',
       ]);
       const text = out.join('\n');
       expect(text.startsWith('<!-- harness:review-provenance -->')).toBe(true);
       expect(text.endsWith('<!-- harness:review-provenance -->')).toBe(true);
       expect(process.exitCode ?? 0).toBe(0);
     });
   });
   ```

2. Run `pnpm --filter @harness-engineering/cli exec vitest run tests/commands/review-provenance.test.ts`. Observe failure.
3. Create `packages/cli/src/commands/review-provenance.ts`:

   ```ts
   import * as fs from 'node:fs';
   import * as path from 'node:path';
   import { Command } from 'commander';
   import {
     REVIEWS_DIRNAME,
     buildProvenanceRow,
     collectBlockingFindings,
     compareReviewLabels,
     findingsReaderFor,
     parseReviewReceipt,
     readReceiptFile,
     renderProvenanceBlock,
     type ProvenanceRow,
   } from '@harness-engineering/core';
   import { logger } from '../output/logger';
   import { ExitCode } from '../utils/errors';

   export interface ReviewProvenanceReport {
     session: string;
     reviewsDir: string;
     rows: ProvenanceRow[];
     /** Reviews whose receipt could not be read. They are listed on the stamp, never dropped. */
     invalid: Array<{ review: string; reason: string }>;
     /** The Markdown stamp, markers included. */
     block: string;
   }

   export type ReviewProvenanceOutcome =
     | { ok: true; report: ReviewProvenanceReport }
     | { ok: false; message: string };

   const SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

   /** Overrides autopilot recorded for a review state, keyed by review label. */
   function readOverrides(sessionDir: string): Map<string, string> {
     const out = new Map<string, string>();
     try {
       const state = JSON.parse(
         fs.readFileSync(path.join(sessionDir, 'autopilot-state.json'), 'utf-8')
       ) as { decisions?: Array<Record<string, unknown>> };
       for (const d of state.decisions ?? []) {
         if (typeof d.chosen !== 'string' || !/override/i.test(d.chosen)) continue;
         const label =
           d.state === 'FINAL_REVIEW'
             ? 'final-all'
             : d.state === 'REVIEW' && (typeof d.phase === 'number' || typeof d.phase === 'string')
               ? `phase-${d.phase}`
               : undefined;
         if (label === undefined) continue;
         const why = [d.rationale, d.question].find((v) => typeof v === 'string' && v !== '');
         out.set(label, typeof why === 'string' ? why : 'override');
       }
     } catch {
       // No autopilot state, or unreadable: no overrides to show.
     }
     return out;
   }

   export function runReviewProvenanceRender(opts: {
     session: string;
     cwd?: string;
   }): ReviewProvenanceOutcome {
     if (!SLUG.test(opts.session)) {
       return { ok: false, message: `invalid session slug "${opts.session}"` };
     }
     const cwd = opts.cwd ?? process.cwd();
     const sessionDir = path.join(cwd, '.harness', 'sessions', opts.session);
     if (!fs.existsSync(sessionDir)) {
       return { ok: false, message: `session not found: ${sessionDir}` };
     }
     const reviewsDir = path.join(sessionDir, REVIEWS_DIRNAME);
     let labels: string[] = [];
     try {
       labels = fs
         .readdirSync(reviewsDir, { withFileTypes: true })
         .filter((e) => e.isDirectory())
         .map((e) => e.name)
         .sort(compareReviewLabels);
     } catch {
       labels = [];
     }
     const overrides = readOverrides(sessionDir);
     const rows: ProvenanceRow[] = [];
     const invalid: Array<{ review: string; reason: string }> = [];
     for (const label of labels) {
       const read = readReceiptFile(path.join(reviewsDir, label));
       if (read.status !== 'ok') {
         invalid.push({
           review: label,
           reason: read.status === 'missing' ? 'no receipt.json' : read.reason,
         });
         continue;
       }
       const parsed = parseReviewReceipt(read.raw);
       if (!parsed.ok) {
         invalid.push({ review: label, reason: parsed.error.message });
         continue;
       }
       const { findings } = collectBlockingFindings(parsed.value, findingsReaderFor(read.dir));
       rows.push(buildProvenanceRow(label, parsed.value, findings, overrides.get(label)));
     }
     return {
       ok: true,
       report: {
         session: opts.session,
         reviewsDir,
         rows,
         invalid,
         block: renderProvenanceBlock(rows, invalid),
       },
     };
   }

   /** Injected inputs for tests. */
   export interface ReviewProvenanceDeps {
     cwd?: () => string;
   }

   export function createReviewProvenanceCommand(deps: ReviewProvenanceDeps = {}): Command {
     const command = new Command('review-provenance').description(
       'Show which reviews ran for a pipeline session: tier, reviewers run of required, diff range'
     );
     command.addCommand(
       new Command('render')
         .description(
           'Print the Markdown provenance stamp for a session, one row per review, for the PR body'
         )
         .requiredOption('--session <slug>', 'Session whose review receipts to read')
         .action((opts: { session: string }, cmd: Command) => {
           const out = runReviewProvenanceRender({
             session: opts.session,
             ...(deps.cwd !== undefined && { cwd: deps.cwd() }),
           });
           if (!out.ok) {
             logger.error(out.message);
             process.exitCode = ExitCode.VALIDATION_FAILED;
             return;
           }
           if ((cmd.optsWithGlobals() as { json?: boolean }).json) {
             console.log(JSON.stringify(out.report, null, 2));
             return;
           }
           console.log(out.report.block);
         })
     );
     return command;
   }
   ```

4. Run the test. Observe pass. Run `pnpm --filter @harness-engineering/cli typecheck`.
5. VALIDATE.
6. Commit: `feat(cli): add harness review-provenance render`

### Task 17: Add `harness review-attribution report`

**Depends on:** Task 13 | **Files:** `packages/cli/src/commands/review-attribution.ts`, `packages/cli/tests/commands/review-attribution.test.ts`

1. Create `packages/cli/tests/commands/review-attribution.test.ts`:

   ```ts
   import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
   import * as fs from 'node:fs';
   import * as os from 'node:os';
   import * as path from 'node:path';
   import { Command } from 'commander';
   import {
     createReviewAttributionCommand,
     runReviewAttributionReport,
   } from '../../src/commands/review-attribution';

   let tmp: string;
   const logFile = () => path.join(tmp, '.harness', 'metrics', 'review-attribution.jsonl');
   const common = { schemaVersion: 1, ts: 't', branch: 'b', head: 'h', review: 'r' };
   const lines = [
     {
       ...common,
       kind: 'review',
       ref: 'pr:7',
       moment: 'standalone',
       stamp: 'stamped',
       tier: 'full',
       blocking: 1,
     },
     {
       ...common,
       kind: 'finding',
       ref: 'pr:7',
       moment: 'standalone',
       stamp: 'stamped',
       findingId: 'f1',
       file: 'a.ts',
       findingClass: 'edge-case',
       escapedFrom: 'plan',
     },
   ];

   beforeEach(() => {
     tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-attribution-'));
   });
   afterEach(() => {
     vi.restoreAllMocks();
     process.exitCode = undefined;
     fs.rmSync(tmp, { recursive: true, force: true });
   });

   describe('harness review-attribution report', () => {
     const seed = (extra = '') => {
       fs.mkdirSync(path.dirname(logFile()), { recursive: true });
       fs.writeFileSync(logFile(), lines.map((l) => JSON.stringify(l)).join('\n') + '\n' + extra);
     };
     it('SC8: prints blocking findings per PR for standalone reviews of stamped PRs', () => {
       seed();
       const r = runReviewAttributionReport({ cwd: tmp });
       expect(r.lines).toEqual([
         'Review attribution: 1 review, 1 blocking finding',
         '  escaped from: plan 1',
         '  by class: edge-case 1',
         '  standalone reviews of stamped PRs: 1 PR, 1 blocking finding',
         '    pr:7: 1 blocking across 1 review',
       ]);
       expect(r.summary.standaloneStamped).toEqual([{ ref: 'pr:7', reviews: 1, blocking: 1 }]);
     });
     it('reports unreadable lines and an absent log honestly', () => {
       seed('{tampered\n');
       expect(runReviewAttributionReport({ cwd: tmp }).lines.at(-1)).toMatch(
         /WARNING: 1 unreadable line/
       );
       fs.rmSync(logFile());
       expect(runReviewAttributionReport({ cwd: tmp }).lines[0]).toMatch(/no log file at/);
     });
     it('prints the report through the command and one JSON document under --json', async () => {
       seed();
       const program = new Command().option('--json');
       program.addCommand(createReviewAttributionCommand({ cwd: () => tmp }));
       const out: string[] = [];
       vi.spyOn(console, 'log').mockImplementation((...a) => void out.push(a.join(' ')));
       await program.parseAsync(['node', 'harness', '--json', 'review-attribution', 'report']);
       const doc = JSON.parse(out.join('\n'));
       expect(doc.summary.findings).toBe(1);
       expect(doc.present).toBe(true);
     });
   });
   ```

2. Run `pnpm --filter @harness-engineering/cli exec vitest run tests/commands/review-attribution.test.ts`. Observe failure.
3. Create `packages/cli/src/commands/review-attribution.ts`:

   ```ts
   import { Command } from 'commander';
   import {
     readReviewAttribution,
     renderReviewAttributionReport,
     reviewAttributionPath,
     summarizeReviewAttribution,
     type ReviewAttributionSummary,
   } from '@harness-engineering/core';
   import { logger } from '../output/logger';

   export interface ReviewAttributionReport {
     file: string;
     present: boolean;
     invalid: number;
     summary: ReviewAttributionSummary;
     lines: string[];
   }

   export function runReviewAttributionReport(
     opts: { cwd?: string } = {}
   ): ReviewAttributionReport {
     const cwd = opts.cwd ?? process.cwd();
     const file = reviewAttributionPath(cwd);
     const read = readReviewAttribution(cwd);
     const summary = summarizeReviewAttribution(read.records);
     return {
       file,
       present: read.present,
       invalid: read.invalid,
       summary,
       lines: renderReviewAttributionReport(summary, {
         present: read.present,
         invalid: read.invalid,
         file,
       }),
     };
   }

   /** Injected inputs for tests. */
   export interface ReviewAttributionDeps {
     cwd?: () => string;
   }

   function createReportCommand(deps: ReviewAttributionDeps): Command {
     return new Command('report')
       .description(
         'Print blocking findings by escaped-from stage and class, and per PR for standalone reviews of stamped PRs'
       )
       .action((_opts: unknown, cmd: Command) => {
         const report = runReviewAttributionReport({
           ...(deps.cwd !== undefined && { cwd: deps.cwd() }),
         });
         if ((cmd.optsWithGlobals() as { json?: boolean }).json) {
           console.log(JSON.stringify(report, null, 2));
           return;
         }
         for (const line of report.lines) logger.info(line);
       });
   }

   export function createReviewAttributionCommand(deps: ReviewAttributionDeps = {}): Command {
     const command = new Command('review-attribution').description(
       'Record and report which pipeline stage each blocking review finding escaped from'
     );
     command.addCommand(createReportCommand(deps));
     return command;
   }
   ```

   `createReportCommand` is not exported on purpose: `scripts/generate-barrel-exports.mjs` registers every exported `create*Command` in a top-level file as a top-level command.

4. Run the test. Observe pass. If `logger.info` output is not captured by the `console.log` spy in the first two tests, that is expected: they assert on `runReviewAttributionReport` directly.
5. VALIDATE.
6. Commit: `feat(cli): add harness review-attribution report`

### Task 18: Add `harness review-attribution record`

**Depends on:** Task 17 | **Files:** `packages/cli/src/commands/review-attribution.ts`, `packages/cli/tests/commands/review-attribution.test.ts`

1. Append to `packages/cli/tests/commands/review-attribution.test.ts`. Add `runReviewAttributionRecord` and `type PrReader` to the import from `../../src/commands/review-attribution`, then:

   ```ts
   describe('harness review-attribution record', () => {
     const HEAD = 'b'.repeat(40);
     const STAMP = [
       '<!-- harness:review-provenance -->',
       '### Review provenance',
       '',
       '| Review | Moment | Tier | Backend | Reviewers | Diff | Blocking | By class | Escaped from | Override |',
       '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
       '| final-all | final | full | agent | 4/4 | `a..b` | 0 | none | none | none |',
       '',
       '<!-- harness:review-provenance -->',
     ].join('\n');
     let dir: string;
     function review(moment: string, findings: unknown[]) {
       dir = path.join(tmp, '.harness', 'reviews', `feat-x-${HEAD}`);
       fs.mkdirSync(dir, { recursive: true });
       fs.writeFileSync(
         path.join(dir, 'bug.json'),
         JSON.stringify({ schemaVersion: 1, reviewerId: 'bug', examinedFiles: ['a.ts'], findings })
       );
       fs.writeFileSync(
         path.join(dir, 'receipt.json'),
         JSON.stringify({
           schemaVersion: 1,
           moment,
           tier: 'light',
           backend: 'agent',
           diff: { base: 'a'.repeat(40), head: HEAD },
           coldContext: true,
           priorFindingsSupplied: false,
           reviewers: [{ id: 'bug', required: true, ran: true, findingsPath: 'bug.json' }],
           blocking: findings.length,
           advisory: 0,
         })
       );
     }
     const blocking = {
       id: 'b1',
       file: 'a.ts',
       lineRange: [1, 1],
       severity: 'critical',
       title: 't',
       findingClass: 'stale-claim',
       escapedFrom: 'plan',
     };
     const record = (readPr: PrReader) =>
       runReviewAttributionRecord({
         receiptPath: dir,
         cwd: tmp,
         git: () => 'feat/x',
         readPr,
         now: () => new Date('2026-11-20T00:00:00.000Z'),
       });
     const logged = () =>
       fs
         .readFileSync(logFile(), 'utf-8')
         .trimEnd()
         .split('\n')
         .map((l) => JSON.parse(l));

     it('SC7 + SC8: a standalone review of a stamped PR is recorded against the PR as stamped', () => {
       review('standalone', [blocking]);
       const out = record(() => ({ number: 12, body: `Summary\n\n${STAMP}` }));
       expect(out).toMatchObject({
         ok: true,
         ref: 'pr:12',
         stamp: 'stamped',
         appended: 2,
         blocking: 1,
       });
       expect(logged()).toEqual([
         expect.objectContaining({ kind: 'review', ref: 'pr:12', stamp: 'stamped', blocking: 1 }),
         expect.objectContaining({
           kind: 'finding',
           findingId: 'b1',
           findingClass: 'stale-claim',
           escapedFrom: 'plan',
         }),
       ]);
     });
     it('records a PR with no stamp, and a branch with no PR or no gh, as unstamped', () => {
       review('standalone', []);
       expect(record(() => ({ number: 12, body: 'no stamp' }))).toMatchObject({
         ref: 'pr:12',
         stamp: 'unstamped',
       });
       fs.rmSync(logFile());
       expect(record(() => undefined)).toMatchObject({ ref: 'branch:feat/x', stamp: 'unstamped' });
       fs.rmSync(logFile());
       expect(
         record(() => {
           throw new Error('gh: not found');
         })
       ).toMatchObject({ ref: 'branch:feat/x', stamp: 'unstamped' });
     });
     it('does not ask for the PR on a pipeline review, and marks the stamp not-applicable', () => {
       review('final', [blocking]);
       let asked = 0;
       const out = record(() => {
         asked++;
         return undefined;
       });
       expect(asked).toBe(0);
       expect(out).toMatchObject({ ok: true, ref: 'branch:feat/x', stamp: 'not-applicable' });
     });
     it('recording the same review twice appends nothing the second time', () => {
       review('standalone', [blocking]);
       record(() => undefined);
       expect(record(() => undefined)).toMatchObject({ appended: 0, skipped: 2 });
     });
     it('a failed append is reported as a warning and the outcome is still ok', () => {
       review('standalone', [blocking]);
       fs.writeFileSync(path.join(tmp, '.harness', 'metrics'), 'a file where a directory belongs');
       const out = record(() => undefined);
       expect(out.ok).toBe(true);
       expect(out.ok && out.warning).toMatch(/was not recorded/);
     });
     it('fails for a missing or invalid receipt', () => {
       dir = path.join(tmp, 'nowhere');
       expect(record(() => undefined)).toMatchObject({ ok: false });
     });
   });
   ```

2. Run the test file. Observe the new block fail.
3. In `packages/cli/src/commands/review-attribution.ts`:
   - Replace the imports with:

     ```ts
     import { execFileSync } from 'node:child_process';
     import * as path from 'node:path';
     import { Command } from 'commander';
     import {
       appendReviewAttribution,
       buildAttributionRecords,
       collectBlockingFindings,
       countProvenanceRows,
       extractProvenanceBlock,
       findingsReaderFor,
       parseReviewReceipt,
       readReceiptFile,
       readReviewAttribution,
       renderReviewAttributionReport,
       reviewAttributionPath,
       summarizeReviewAttribution,
       type ReviewAttributionSummary,
     } from '@harness-engineering/core';
     import type { ReviewStampState } from '@harness-engineering/types';
     import { logger } from '../output/logger';
     import { ExitCode } from '../utils/errors';
     import { defaultGitRunner, type GitRunner } from './check-review-receipt';
     ```

     If `packages/cli` does not depend on `@harness-engineering/types` directly, import `ReviewStampState` from `@harness-engineering/core` instead (core re-exports the types package).

   - Extend `ReviewAttributionDeps`:

     ```ts
     export interface ReviewAttributionDeps {
       cwd?: () => string;
       git?: GitRunner;
       readPr?: PrReader;
       now?: () => Date;
     }
     ```

   - Add above `createReportCommand`:

     ```ts
     /** The current branch's PR, or undefined when there is none. May throw when `gh` is absent. */
     export type PrReader = (cwd: string) => { number: number; body: string } | undefined;

     export const defaultPrReader: PrReader = (cwd) => {
       const raw = execFileSync('gh', ['pr', 'view', '--json', 'number,body'], {
         cwd,
         encoding: 'utf-8',
         stdio: ['ignore', 'pipe', 'pipe'],
       }).toString();
       const parsed = JSON.parse(raw) as { number?: unknown; body?: unknown };
       if (typeof parsed.number !== 'number') return undefined;
       return { number: parsed.number, body: typeof parsed.body === 'string' ? parsed.body : '' };
     };

     export interface ReviewAttributionRecordOptions {
       receiptPath: string;
       /** The review's label. Defaults to the receipt directory's name. */
       review?: string;
       cwd?: string;
       git?: GitRunner;
       readPr?: PrReader;
       now?: () => Date;
     }

     export type ReviewAttributionRecordOutcome =
       | {
           ok: true;
           ref: string;
           stamp: ReviewStampState;
           blocking: number;
           appended: number;
           skipped: number;
           /** Set when the append failed. The review does not fail on it. */
           warning?: string;
         }
       | { ok: false; message: string };

     /**
      * Append a review's run and its blocking findings to the attribution log. For a standalone
      * review it reads the PR's provenance stamp through `gh`; with no `gh` or no PR the run is
      * recorded as unstamped.
      */
     export function runReviewAttributionRecord(
       opts: ReviewAttributionRecordOptions
     ): ReviewAttributionRecordOutcome {
       const cwd = opts.cwd ?? process.cwd();
       const read = readReceiptFile(path.resolve(cwd, opts.receiptPath));
       if (read.status !== 'ok') {
         const why = read.status === 'missing' ? 'not found' : read.reason;
         return { ok: false, message: `review receipt at ${read.path}: ${why}` };
       }
       const parsed = parseReviewReceipt(read.raw);
       if (!parsed.ok) return { ok: false, message: parsed.error.message };
       const receipt = parsed.value;

       let branch = 'unknown';
       try {
         branch =
           (opts.git ?? defaultGitRunner)(['rev-parse', '--abbrev-ref', 'HEAD'], cwd) || branch;
       } catch {
         // Not a git checkout, or git absent: keep "unknown".
       }

       let stamp: ReviewStampState = 'not-applicable';
       let pr: number | undefined;
       if (receipt.moment === 'standalone') {
         stamp = 'unstamped';
         try {
           const found = (opts.readPr ?? defaultPrReader)(cwd);
           if (found !== undefined) {
             pr = found.number;
             const block = extractProvenanceBlock(found.body);
             if (block !== undefined && countProvenanceRows(block) > 0) stamp = 'stamped';
           }
         } catch {
           // gh absent, unauthenticated, or no PR for the branch: unstamped.
         }
       }

       const { findings } = collectBlockingFindings(receipt, findingsReaderFor(read.dir));
       const records = buildAttributionRecords({
         receipt,
         review: opts.review ?? path.basename(read.dir),
         blockingFindings: findings,
         branch,
         ...(pr !== undefined && { pr }),
         stamp,
         now: (opts.now ?? (() => new Date()))(),
       });
       const res = appendReviewAttribution(cwd, records);
       return {
         ok: true,
         ref: records[0]?.ref ?? `branch:${branch}`,
         stamp,
         blocking: findings.length,
         appended: res.appended,
         skipped: res.skipped,
         ...(res.error !== undefined && {
           warning: `review attribution was not recorded: ${res.error}`,
         }),
       };
     }

     function createRecordCommand(deps: ReviewAttributionDeps): Command {
       return new Command('record')
         .description(
           "Append a review's run and its blocking findings to .harness/metrics/review-attribution.jsonl"
         )
         .requiredOption('--receipt <path>', 'Path to receipt.json or to its review directory')
         .option('--review <label>', "Review label (default: the receipt directory's name)")
         .action((opts: { receipt: string; review?: string }, cmd: Command) => {
           const out = runReviewAttributionRecord({
             receiptPath: opts.receipt,
             ...(opts.review !== undefined && { review: opts.review }),
             ...(deps.cwd !== undefined && { cwd: deps.cwd() }),
             ...(deps.git !== undefined && { git: deps.git }),
             ...(deps.readPr !== undefined && { readPr: deps.readPr }),
             ...(deps.now !== undefined && { now: deps.now }),
           });
           if ((cmd.optsWithGlobals() as { json?: boolean }).json) {
             console.log(JSON.stringify(out, null, 2));
           } else if (!out.ok) {
             logger.error(out.message);
           } else {
             if (out.warning !== undefined) logger.warn(out.warning);
             logger.info(
               `Recorded review for ${out.ref} (${out.stamp}): ${out.blocking} blocking, ` +
                 `${out.appended} new record(s), ${out.skipped} already present.`
             );
           }
           if (!out.ok) process.exitCode = ExitCode.VALIDATION_FAILED;
         });
     }
     ```

   - In `createReviewAttributionCommand`, add `command.addCommand(createRecordCommand(deps));` after the report line.

4. Run the test file. Observe every block pass. Run `pnpm --filter @harness-engineering/cli typecheck`.
5. VALIDATE.
6. Commit: `feat(cli): add harness review-attribution record`

### Task 19: Register the three commands

**Depends on:** Task 15, Task 16, Task 18 | **Files:** `packages/cli/src/commands/_registry.ts`, `packages/cli/tests/commands/review-receipt-registration.test.ts`

1. Create `packages/cli/tests/commands/review-receipt-registration.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { commandCreators } from '../../src/commands/_registry';

   describe('review receipt commands are registered', () => {
     const names = commandCreators.map((create) => create().name());
     it.each(['check-review-receipt', 'review-provenance', 'review-attribution'])(
       'registers %s as a top-level command',
       (name) => {
         expect(names).toContain(name);
       }
     );
     it('does not register a subcommand creator as a top-level command', () => {
       expect(names).not.toContain('report');
       expect(names).not.toContain('record');
       expect(names).not.toContain('render');
     });
   });
   ```

   `_registry.ts` exports `commandCreators: Array<() => Command>` (generated; line 127 at planning time).

2. Run `pnpm --filter @harness-engineering/cli exec vitest run tests/commands/review-receipt-registration.test.ts`. Observe failure (the registry does not list the new commands).
3. Run `pnpm run generate-barrel-exports`. Check `git diff packages/cli/src/commands/_registry.ts` shows exactly three new creators: `createCheckReviewReceiptCommand`, `createReviewProvenanceCommand`, `createReviewAttributionCommand`.
4. Run the test. Observe pass. Run `pnpm run generate:barrels:check`. Observe pass.
5. VALIDATE.
6. Commit: `feat(cli): register the review receipt commands`

### Task 20: Add the `check_review_receipt` MCP tool handler

**Depends on:** Task 15 | **Files:** `packages/cli/src/mcp/tools/review-receipt.ts`, `packages/cli/tests/mcp/tools/review-receipt.test.ts`

1. Create `packages/cli/tests/mcp/tools/review-receipt.test.ts`:

   ```ts
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import * as fs from 'node:fs';
   import * as os from 'node:os';
   import * as path from 'node:path';
   import {
     checkReviewReceiptDefinition,
     handleCheckReviewReceipt,
   } from '../../../src/mcp/tools/review-receipt';

   const BASE = 'a'.repeat(40);
   const HEAD = 'b'.repeat(40);
   let project: string;
   let dir: string;
   const git = (args: string[]) => (args[0] === 'rev-parse' ? HEAD : 'src/a.ts');
   const body = (r: Awaited<ReturnType<typeof handleCheckReviewReceipt>>) =>
     JSON.parse(r.content[0]?.text ?? '{}');

   beforeEach(() => {
     project = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-review-receipt-'));
     dir = path.join(project, '.harness', 'sessions', 's1', 'reviews', 'phase-0');
     fs.mkdirSync(dir, { recursive: true });
   });
   afterEach(() => fs.rmSync(project, { recursive: true, force: true }));

   function write(ran: boolean) {
     fs.writeFileSync(
       path.join(dir, 'compliance-bug.json'),
       JSON.stringify({
         schemaVersion: 1,
         reviewerId: 'compliance-bug',
         examinedFiles: ['src/a.ts'],
         findings: [],
       })
     );
     fs.writeFileSync(
       path.join(dir, 'receipt.json'),
       JSON.stringify({
         schemaVersion: 1,
         moment: 'phase',
         tier: 'light',
         backend: 'agent',
         diff: { base: BASE, head: HEAD },
         coldContext: true,
         priorFindingsSupplied: false,
         reviewers: [
           ran
             ? {
                 id: 'compliance-bug',
                 required: true,
                 ran: true,
                 findingsPath: 'compliance-bug.json',
               }
             : { id: 'compliance-bug', required: true, ran: false },
         ],
         blocking: 0,
         advisory: 0,
       })
     );
   }

   describe('check_review_receipt', () => {
     it('declares path and receipt as required', () => {
       expect(checkReviewReceiptDefinition.name).toBe('check_review_receipt');
       expect(checkReviewReceiptDefinition.inputSchema.required).toEqual(['path', 'receipt']);
     });
     it('returns pass:true for a passing receipt given relative to the project root', async () => {
       write(true);
       const r = await handleCheckReviewReceipt(
         { path: project, receipt: path.relative(project, dir) },
         { git }
       );
       expect(r.isError).toBeUndefined();
       expect(body(r)).toMatchObject({ pass: true, reviewersRun: 1, reviewersRequired: 1 });
     });
     it('returns pass:false and names the reviewer when a required reviewer did not run', async () => {
       write(false);
       const r = await handleCheckReviewReceipt({ path: project, receipt: dir }, { git });
       expect(body(r).pass).toBe(false);
       expect(body(r).failures[0]).toMatchObject({
         code: 'REQUIRED_REVIEWER_NOT_RUN',
         reviewerId: 'compliance-bug',
       });
     });
     it('returns pass:false with RECEIPT_MISSING when there is no receipt', async () => {
       const r = await handleCheckReviewReceipt({ path: project, receipt: 'nope' }, { git });
       expect(body(r)).toMatchObject({ pass: false, failures: [{ code: 'RECEIPT_MISSING' }] });
     });
     it('returns an error response, still pass:false, when an argument is missing', async () => {
       const r = await handleCheckReviewReceipt({ path: project }, { git });
       expect(r.isError).toBe(true);
       expect(body(r).pass).toBe(false);
     });
   });
   ```

2. Run `pnpm --filter @harness-engineering/cli exec vitest run tests/mcp/tools/review-receipt.test.ts`. Observe failure.
3. Create `packages/cli/src/mcp/tools/review-receipt.ts`:

   ```ts
   import { sanitizePath } from '../utils/sanitize-path.js';
   import { type McpResponse, mcpError } from '../utils.js';
   import type { ToolDefinition } from '../tool-types.js';
   import { runCheckReviewReceipt, type GitRunner } from '../../commands/check-review-receipt.js';

   /**
    * Shift-left pipeline fidelity, Phase 1: the review receipt gate as an MCP tool. Same code path
    * as `harness check-review-receipt`. It is not part of check_phase_gate, which maps
    * implementation files to spec files and has no session concept.
    */
   export const checkReviewReceiptDefinition: ToolDefinition = {
     name: 'check_review_receipt',
     description:
       'Gate a review receipt: recomputes HEAD, the diff file set and every reviewer findings file, ' +
       'and treats the receipt fields as claims. Returns { pass, failures[{code, reviewerId?, message}], ' +
       'reviewersRun, reviewersRequired }. pass:false (including RECEIPT_MISSING) means the review ' +
       'state may not be left: treat it as a gate. Needs no model credential.',
     inputSchema: {
       type: 'object' as const,
       properties: {
         path: { type: 'string', description: 'Path to project root' },
         receipt: {
           type: 'string',
           description:
             'Path to receipt.json or to the review directory holding it, absolute or relative to path',
         },
       },
       required: ['path', 'receipt'],
     },
   };

   /** Injected inputs (tests); production runs real git. */
   export interface CheckReviewReceiptToolDeps {
     git?: GitRunner;
   }

   function gateError(message: string): McpResponse {
     return mcpError(JSON.stringify({ pass: false, failures: [{ code: 'GATE_ERROR', message }] }));
   }

   export async function handleCheckReviewReceipt(
     input: Record<string, unknown>,
     deps: CheckReviewReceiptToolDeps = {}
   ): Promise<McpResponse> {
     try {
       if (typeof input.path !== 'string' || typeof input.receipt !== 'string') {
         return gateError('path and receipt are required strings');
       }
       const report = runCheckReviewReceipt({
         receiptPath: input.receipt,
         cwd: sanitizePath(input.path),
         ...(deps.git !== undefined && { git: deps.git }),
       });
       return { content: [{ type: 'text' as const, text: JSON.stringify(report) }] };
     } catch (error) {
       return gateError(error instanceof Error ? error.message : String(error));
     }
   }
   ```

4. Run the test. Observe pass. Run `pnpm --filter @harness-engineering/cli typecheck`.
5. VALIDATE.
6. Commit: `feat(cli): add the check_review_receipt MCP tool handler`

### Task 21: Register `check_review_receipt` in the MCP server

**Depends on:** Task 20 | **Files:** `packages/cli/src/mcp/server.ts`, `packages/cli/tests/mcp/server.test.ts`, `packages/cli/tests/mcp/server-integration.test.ts`

1. In `packages/cli/tests/mcp/server.test.ts` (line 16) and `packages/cli/tests/mcp/server-integration.test.ts` (line 131), change `expect(tools).toHaveLength(116);` to `expect(tools).toHaveLength(117);`. If a nearby assertion in either file lists tool names, add `'check_review_receipt'` in the position the list's ordering requires.
2. Run `pnpm --filter @harness-engineering/cli exec vitest run tests/mcp/server.test.ts tests/mcp/server-integration.test.ts`. Observe failure (116 received).
3. In `packages/cli/src/mcp/server.ts`:
   - After the line `import { recordAutoDecisionDefinition, handleRecordAutoDecision } from './tools/auto-decision.js';` add:

     ```ts
     // Shift-left pipeline fidelity Phase 1: the review receipt gate (standalone, not check_phase_gate).
     import {
       checkReviewReceiptDefinition,
       handleCheckReviewReceipt,
     } from './tools/review-receipt.js';
     ```

   - In the tool-definition array, after `recordAutoDecisionDefinition,` add `checkReviewReceiptDefinition,`.
   - In the handler map, after `record_auto_decision: handleRecordAutoDecision as unknown as ToolHandler,` add `check_review_receipt: handleCheckReviewReceipt as unknown as ToolHandler,`.

4. Run the two test files again. Observe pass. Run `pnpm --filter @harness-engineering/cli exec vitest run tests/commands/setup-mcp.test.ts`: it must pass unchanged (the Cursor curated set stays at 26; this tool is not added to it).
5. Run `pnpm --filter @harness-engineering/cli typecheck`. VALIDATE.
6. Commit: `feat(cli): register check_review_receipt in the MCP server`

### Task 22: Give `check_review_receipt` its tier and capability declaration

**Depends on:** Task 21 | **Files:** `packages/cli/src/mcp/tool-tiers.ts`, `packages/cli/src/mcp/tool-capability-declarations.ts`, `packages/cli/tests/mcp/tool-tiers.test.ts`

1. In `packages/cli/tests/mcp/tool-tiers.test.ts`, add inside `describe('STANDARD_TOOL_NAMES', ...)`:

   ```ts
   it('exposes check_review_receipt in standard but not core (autopilot gates REVIEW with it)', () => {
     expect(STANDARD_TOOL_NAMES).toContain('check_review_receipt');
     expect(CORE_TOOL_NAMES).not.toContain('check_review_receipt');
   });
   ```

2. Run `pnpm --filter @harness-engineering/cli exec vitest run tests/mcp/tool-tiers.test.ts tests/commands/mcp-list-capabilities.test.ts`. Observe the new tier test fail, and the capability coverage test fail for the undeclared tool.
3. In `packages/cli/src/mcp/tool-tiers.ts`, add to `STANDARD_EXTRA` after `'record_auto_decision',`:

   ```ts
     // Shift-left pipeline fidelity Phase 1 — autopilot and code-review gate reviews with it
     'check_review_receipt',
   ```

4. In `packages/cli/src/mcp/tool-capability-declarations.ts`, add after the `check_phase_gate: { scopes: ['read'] },` line:

   ```ts
     check_review_receipt: { scopes: ['read', 'exec'] }, // reads receipt + findings files; execFileSync git rev-parse / git diff --name-only
   ```

5. Run both test files. Observe pass. Run `pnpm --filter @harness-engineering/cli typecheck`.
6. VALIDATE.
7. Commit: `feat(cli): declare tier and capabilities for check_review_receipt`

### Task 23: Show the provenance stamp in `pre-merge-brief`

**Depends on:** Task 13 | **Files:** `packages/cli/src/commands/pre-merge-brief.ts`, `packages/cli/tests/commands/pre-merge-brief-provenance.test.ts`

1. Create `packages/cli/tests/commands/pre-merge-brief-provenance.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { buildBriefBody, runPreMergeBrief } from '../../src/commands/pre-merge-brief';

   const MARKER = '<!-- harness:review-provenance -->';
   const BLOCK = [
     MARKER,
     '### Review provenance',
     '',
     '| Review | Moment | Tier | Backend | Reviewers | Diff | Blocking | By class | Escaped from | Override |',
     '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
     '| final-all | final | full | agent | 5/5 | `a1b2c3d..e4f5a6b` | 0 | none | none | none |',
     '',
     MARKER,
   ].join('\n');
   const section = (body: string) => {
     const start = body.indexOf('## Review provenance');
     const end = body.indexOf('\n## ', start + 1);
     return body.slice(start, end < 0 ? undefined : end);
   };
   const quiet = {
     cwd: process.cwd(),
     diffRange: 'a..b',
     runGit: () => '',
     resolveRaw: () => '',
     gather: async () => ({ signals: [] }) as never,
     readGuardian: async () => [],
     log: () => {},
   };

   describe('pre-merge-brief: review provenance', () => {
     it('renders the stamp rows under its own heading, between the verdict and the signals', () => {
       const body = buildBriefBody({ provenance: BLOCK });
       expect(body.indexOf('## Review verdict')).toBeLessThan(body.indexOf('## Review provenance'));
       expect(body.indexOf('## Review provenance')).toBeLessThan(body.indexOf('## Signal status'));
       expect(section(body)).toContain('| final-all | final | full | agent | 5/5 |');
       expect(section(body)).not.toContain(MARKER);
       expect(section(body)).not.toContain('### Review provenance');
     });
     it('reads as "no pipeline review recorded" when there is no stamp', () => {
       expect(section(buildBriefBody({}))).toContain('> _no pipeline review recorded._');
     });
     it('reads the stamp from the PR body through the injected seam', async () => {
       const { body } = await runPreMergeBrief({
         ...quiet,
         readPrBody: () => `Summary\n\n${BLOCK}\n\nCloses #1`,
       });
       expect(section(body)).toContain('| final-all |');
     });
     it('degrades to "no pipeline review recorded" when gh fails or the body has no stamp', async () => {
       const failing = await runPreMergeBrief({
         ...quiet,
         readPrBody: () => {
           throw new Error('gh: not found');
         },
       });
       expect(section(failing.body)).toContain('no pipeline review recorded');
       const bare = await runPreMergeBrief({ ...quiet, readPrBody: () => 'no stamp' });
       expect(section(bare.body)).toContain('no pipeline review recorded');
     });
     it('does not shell out to gh unless a reader is injected', async () => {
       const { body } = await runPreMergeBrief(quiet);
       expect(section(body)).toContain('no pipeline review recorded');
     });
   });
   ```

2. Run `pnpm --filter @harness-engineering/cli exec vitest run tests/commands/pre-merge-brief-provenance.test.ts`. Observe failure.
3. In `packages/cli/src/commands/pre-merge-brief.ts`:
   - Add to the imports: `import { extractProvenanceBlock, PROVENANCE_MARKER, NO_PIPELINE_REVIEW } from '@harness-engineering/core';`
   - Add to `BriefInputs`:

     ```ts
       /**
        * The review provenance stamp from the PR body (markers included); undefined when the PR
        * has none, which renders as "no pipeline review recorded".
        */
       provenance?: string | undefined;
     ```

   - Add after `renderReviewVerdict`:

     ```ts
     /**
      * Render the **Review provenance** section from the stamp autopilot placed in the PR body:
      * which reviews ran, at what tier, with how many reviewers of how many required. A PR with no
      * stamp reads as "no pipeline review recorded".
      */
     function renderReviewProvenance(block?: string): string[] {
       const out: string[] = ['## Review provenance', ''];
       const rows = (block ?? '')
         .split('\n')
         .filter((l) => l.trim() !== PROVENANCE_MARKER && !/^###\s+Review provenance\s*$/.test(l))
         .join('\n')
         .trim();
       out.push(rows === '' ? `> _${NO_PIPELINE_REVIEW}._` : rows);
       return out;
     }
     ```

   - In `buildBriefBody`, add after `...renderReviewVerdict(inputs.review),` and its following `'',`:

     ```ts
         ...renderReviewProvenance(inputs.provenance),
         '',
     ```

   - Add to `PreMergeBriefOptions`:

     ```ts
       /** Read the current PR's body. Defaults to no read; the command action injects the `gh` reader. */
       readPrBody?: () => string | undefined;
     ```

   - Add above `runPreMergeBrief`:

     ```ts
     /** Read the current branch's PR body via `gh`. Throws when gh is absent or there is no PR. */
     export const defaultReadPrBody = (): string | undefined => {
       const raw = execFileSync('gh', ['pr', 'view', '--json', 'body'], {
         encoding: 'utf-8',
         stdio: ['ignore', 'pipe', 'pipe'],
       }).toString();
       const body = (JSON.parse(raw) as { body?: unknown }).body;
       return typeof body === 'string' ? body : undefined;
     };

     /** The provenance stamp from the PR body, or undefined (never throws). */
     function readProvenanceSafe(read: (() => string | undefined) | undefined): string | undefined {
       if (read === undefined) return undefined;
       try {
         const body = read();
         return body === undefined ? undefined : extractProvenanceBlock(body);
       } catch {
         return undefined;
       }
     }
     ```

   - In `runPreMergeBrief`, after the `guardian` line add `const provenance = readProvenanceSafe(opts.readPrBody);` and change the build call to `buildBriefBody({ diff, review, signals, outcome, guardian, provenance })`.
   - In the `createPreMergeBriefCommand` action, add `readPrBody: defaultReadPrBody,` to the object passed to `runPreMergeBrief`.

4. Run the new test. Observe pass. Run `pnpm --filter @harness-engineering/cli exec vitest run tests/commands/pre-merge-brief.test.ts tests/commands/pre-merge-brief-cov544.test.ts tests/commands/pre-merge-brief-guardian.test.ts tests/commands/pre-merge-brief-maxbuffer.test.ts`. If an existing test fails only because it pins the whole body or the section order and the new section is the sole difference, update that expectation to include the section and name the test in the commit body. Any other failure is a defect in this task: fix the source.
5. Run `pnpm --filter @harness-engineering/cli typecheck`. VALIDATE.
6. Commit: `feat(cli): show review provenance in pre-merge-brief`

### Task 24: Ignore standalone review artifacts

**Depends on:** none | **Files:** `.gitignore`, `.harness/.gitignore`, `packages/cli/tests/ci/harness-reviews-ignore.test.ts`

Standalone reviews write `.harness/reviews/<branch>-<head sha>/`. Unignored, those files would be untracked state that trips `format:check` at pre-push.

1. Create `packages/cli/tests/ci/harness-reviews-ignore.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { spawnSync } from 'node:child_process';
   import * as path from 'node:path';
   import { fileURLToPath } from 'node:url';

   const repoRoot = path.resolve(
     path.dirname(fileURLToPath(import.meta.url)),
     '..',
     '..',
     '..',
     '..'
   );
   /** git's own resolution: exit 0 = ignored, 1 = not ignored. */
   const ignored = (p: string) =>
     spawnSync('git', ['check-ignore', '-q', '--no-index', p], { cwd: repoRoot }).status;

   describe('.harness/reviews ignore contract', () => {
     it('ignores standalone review artifacts', () => {
       expect(ignored('.harness/reviews/feat-x-abc/receipt.json')).toBe(0);
       expect(ignored('.harness/reviews/feat-x-abc/bug.json')).toBe(0);
       expect(ignored('packages/cli/.harness/reviews/x/receipt.json')).toBe(0);
     });
     it('ignores the attribution log (it is machine-local)', () => {
       expect(ignored('.harness/metrics/review-attribution.jsonl')).toBe(0);
     });
     it('leaves the holiday-confidence ledger stageable: no bare metrics/ rule was added', () => {
       expect(ignored('.harness/metrics/holiday-confidence.jsonl')).toBe(1);
     });
   });
   ```

2. Run `pnpm --filter @harness-engineering/cli exec vitest run tests/ci/harness-reviews-ignore.test.ts`. Observe the first test fail; the other two pass already and guard the edit.
3. In `.harness/.gitignore`, add on its own line directly below the `sessions/` line:

   ```
   reviews/
   ```

   Do not add, move or reorder any `metrics` rule in that file.

4. In `.gitignore`, add directly below the line `**/.harness/sessions/`:

   ```
   **/.harness/reviews/
   ```

5. Run the test. Observe all three pass. Run `pnpm --filter @harness-engineering/cli exec vitest run tests/ci/harness-metrics-ignore.test.ts`. Observe pass.
6. VALIDATE.
7. Commit: `chore: ignore standalone review artifacts under .harness/reviews`

---

## Milestone C: skills

### Task 25: Add the attribution rubric and the two finding fields to `harness-code-review`

**Depends on:** none | **Files:** `agents/skills/claude-code/harness-code-review/references/attribution-rubric.md`, `agents/skills/claude-code/harness-code-review/SKILL.md`, `agents/skills/tests/code-review-receipts.test.ts`

1. Create `agents/skills/tests/code-review-receipts.test.ts`:

   ```ts
   // agents/skills/tests/code-review-receipts.test.ts
   //
   // Shift-left pipeline fidelity, Phase 1: harness-code-review emits receipts and attribution.

   import { describe, it, expect } from 'vitest';
   import { readFileSync, existsSync } from 'fs';
   import { resolve, dirname } from 'path';
   import { fileURLToPath } from 'url';

   const SKILL_DIR = resolve(
     dirname(fileURLToPath(import.meta.url)),
     '..',
     'claude-code',
     'harness-code-review'
   );
   export const md = () => readFileSync(resolve(SKILL_DIR, 'SKILL.md'), 'utf-8');

   /** The text from a heading to the next heading of the same or higher level. */
   export function section(text: string, heading: string): string {
     const lines = text.split('\n');
     const start = lines.findIndex((l) => l.trim() === heading);
     if (start < 0) throw new Error(`heading not found: ${heading}`);
     const level = (/^#+/.exec(heading) ?? [''])[0].length;
     const end = lines.findIndex(
       (l, i) => i > start && /^#+ /.test(l) && (/^#+/.exec(l) ?? [''])[0].length <= level
     );
     return lines.slice(start, end < 0 ? undefined : end).join('\n');
   }

   const CLASSES = ['stale-claim', 'edge-case', 'weak-test', 'collateral', 'design', 'other'];
   const STAGES = ['spec', 'plan', 'execution', 'verification', 'none'];

   describe('attribution rubric (SC7)', () => {
     const rubricPath = resolve(SKILL_DIR, 'references', 'attribution-rubric.md');
     it('exists and defines every finding class and every escaped-from stage', () => {
       expect(existsSync(rubricPath)).toBe(true);
       const rubric = readFileSync(rubricPath, 'utf-8');
       for (const c of CLASSES) expect(rubric, c).toContain(`\`${c}\``);
       for (const s of STAGES) expect(rubric, s).toContain(`\`${s}\``);
       expect(rubric).toMatch(/earliest stage/);
     });
     it('the Finding Schema shows both fields with exactly the shared vocabulary', () => {
       const schema = section(md(), '### Finding Schema');
       expect(schema).toContain(`findingClass?: ${CLASSES.map((c) => `'${c}'`).join(' | ')};`);
       expect(schema).toContain(`escapedFrom?: ${STAGES.map((s) => `'${s}'`).join(' | ')};`);
       expect(schema).toContain('references/attribution-rubric.md');
       expect(schema).toMatch(/every `critical` or `important` finding/);
     });
   });
   ```

2. Run `pnpm --filter @harness-engineering/skills exec vitest run tests/code-review-receipts.test.ts`. Observe failure.
3. Create `agents/skills/claude-code/harness-code-review/references/attribution-rubric.md`:

   ```markdown
   # Attribution Rubric

   Every `critical` or `important` finding carries two labels: what kind of miss it is
   (`findingClass`) and the earliest pipeline stage that should have caught it (`escapedFrom`).
   The labels are a reviewer's estimate. They are read as a ranking of stages across many
   findings, not as exact counts, so choose quickly and consistently.

   ## `findingClass`

   | Class         | Use it when                                                                                                                                                |
   | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `stale-claim` | A spec, ADR, README, changeset, comment or skill text states something that the shipped code or another document contradicts.                              |
   | `edge-case`   | Behaviour is wrong for an input the happy path does not exercise: empty or zero input, ties, an unknown enum value, an out-of-domain value, an error path. |
   | `weak-test`   | A test exists and cannot fail for the defect it claims to cover: a vacuous assertion, a mock that mirrors the implementation, a skipped test.              |
   | `collateral`  | The change broke or degraded something outside its stated scope: a generated artifact, a sibling caller, unrelated behaviour.                              |
   | `design`      | The approach is wrong or crosses an architectural boundary, and no local fix restores it.                                                                  |
   | `other`       | None of the above. Say what it is in `rationale`.                                                                                                          |

   When two classes fit, take the first that applies in the order of the table.

   ## `escapedFrom`

   The **earliest stage** that had what it needed to catch the finding.

   | Stage          | The finding escaped from here when                                                                                                             |
   | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
   | `spec`         | The spec is wrong, contradicts itself, or is silent where it had to decide.                                                                    |
   | `plan`         | The spec was right and the plan did not carry it into a task: a missing task, a file left off the file map, an unlisted document or edge case. |
   | `execution`    | The plan asked for it and the implementation did not do it, or did it wrong.                                                                   |
   | `verification` | It was implemented as planned, and a check that exists (a test, `harness validate`, EXISTS / SUBSTANTIVE / WIRED) should have failed.          |
   | `none`         | Only a review could reasonably have found it.                                                                                                  |

   Rules:

   1. Work from the top of the table down and take the first stage that applies. A document nobody
      listed for update is `plan`, even though execution also missed it.
   2. If there is no spec or plan to read (a standalone review of a hand-built change), start at
      `execution`.
   3. If you cannot tell, use `none` and say so in `rationale`. Do not guess a stage to fill the field.

   `suggestion` findings need neither label.
   ```

4. In `agents/skills/claude-code/harness-code-review/SKILL.md`, in the `### Finding Schema` code block, add these lines directly above the closing `}` of `interface ReviewFinding`:

   ```typescript
     // Attribution: required on every critical or important finding of a review that emits a receipt:
     findingClass?: 'stale-claim' | 'edge-case' | 'weak-test' | 'collateral' | 'design' | 'other';
     escapedFrom?: 'spec' | 'plan' | 'execution' | 'verification' | 'none';
   ```

   and add this paragraph after the existing paragraph that ends "[references/confidence-rubric.md](references/confidence-rubric.md).":

   ```markdown
   `findingClass` and `escapedFrom` are set on every `critical` or `important` finding, by every
   reviewer, following [references/attribution-rubric.md](references/attribution-rubric.md).
   `escapedFrom` names the earliest pipeline stage that should have caught the finding. A findings
   file that holds a `critical` or `important` finding without both labels is invalid and fails
   the receipt gate.
   ```

5. Run the test. Observe pass. Run `pnpm --filter @harness-engineering/skills exec vitest run tests/pause-markers.test.ts tests/references.test.ts tests/internal-refs.test.ts`. Observe pass.
6. VALIDATE.
7. Commit: `docs(skills): add the review attribution rubric to harness-code-review`

### Task 26: Teach `harness-code-review` tiers, dispatched mode and the receipt

**Depends on:** Task 25 | **Files:** `agents/skills/claude-code/harness-code-review/SKILL.md`, `agents/skills/tests/code-review-receipts.test.ts`

1. Append to `agents/skills/tests/code-review-receipts.test.ts`:

   ````ts
   describe('review tiers and dispatched mode (SC5, SC15)', () => {
     const fanOut = () => section(md(), '### Phase 4: FAN-OUT');
     it('no longer promises four parallel subagents unconditionally', () => {
       expect(fanOut()).not.toMatch(/Run four parallel review subagents/);
       expect(fanOut()).toContain('#### Review tier and dispatch');
     });
     it('defines light as one reviewer and full as one dispatch per reviewer', () => {
       const tiers = section(md(), '#### Review tier and dispatch');
       expect(tiers).toMatch(/\| `light` \|.*`compliance-bug`.*\|/);
       expect(tiers).toMatch(/\| `full` +\|.*`compliance`, `bug`, `security`, `architecture`.*\|/);
     });
     it('SC5: a session that cannot dispatch runs light, says so, and never records full', () => {
       const tiers = section(md(), '#### Review tier and dispatch');
       expect(tiers).toMatch(/\*\*Dispatched mode/);
       expect(tiers).toMatch(/no subagent-spawning tool/);
       expect(tiers).toMatch(/`tier: "light"`/);
       expect(tiers).toMatch(/Never record `full`/);
       expect(tiers).toMatch(/skip Review Acceptance/);
     });
     it('SC15: the pipeline backend falls back to agent and the receipt records agent', () => {
       const tiers = section(md(), '#### Review tier and dispatch');
       expect(tiers).toContain('`review.backend`');
       expect(tiers).toMatch(/record `backend: "agent"`/);
     });
   });

   describe('review receipt (SC1, SC3)', () => {
     const receipt = () => section(md(), '### Review Receipt');
     it('sits between OUTPUT and Review Acceptance', () => {
       const text = md();
       expect(text.indexOf('### Phase 7: OUTPUT')).toBeLessThan(text.indexOf('### Review Receipt'));
       expect(text.indexOf('### Review Receipt')).toBeLessThan(
         text.indexOf('### Review Acceptance')
       );
     });
     it('names both artifact locations and stops writing the old shapes', () => {
       expect(receipt()).toContain('{sessionDir}/reviews/<moment>-<phase>/');
       expect(receipt()).toContain('.harness/reviews/<branch>-<head sha>/');
       expect(receipt()).toMatch(/phase-\{N\}-review\.json.*no longer written/s);
     });
     it('shows a findings file and a receipt that parse as JSON with the contract fields', () => {
       const blocks = [...receipt().matchAll(/```json\n([\s\S]*?)```/g)].map((m) =>
         JSON.parse(m[1]!)
       );
       const file = blocks.find((b) => 'examinedFiles' in b);
       const r = blocks.find((b) => 'reviewers' in b);
       expect(file).toMatchObject({ schemaVersion: 1, reviewerId: expect.any(String) });
       expect(Object.keys(r).sort()).toEqual(
         [
           'advisory',
           'backend',
           'blocking',
           'coldContext',
           'diff',
           'moment',
           'priorFindingsSupplied',
           'reviewers',
           'schemaVersion',
           'tier',
         ].sort()
       );
       expect(r.diff.base).toMatch(/^[0-9a-f]{40}$/);
       expect(r.diff.head).toMatch(/^[0-9a-f]{40}$/);
     });
     it('gates the receipt with the CLI or the MCP tool, under a gate marker', () => {
       expect(receipt()).toContain('harness check-review-receipt');
       expect(receipt()).toContain('check_review_receipt');
       expect(receipt()).toContain('<!-- pause: gate -->');
     });
     it('dispatched mode skips Review Acceptance', () => {
       expect(section(md(), '### Review Acceptance')).toMatch(
         /\*\*Dispatched mode skips this section\.\*\*/
       );
     });
   });
   ````

2. Run `pnpm --filter @harness-engineering/skills exec vitest run tests/code-review-receipts.test.ts`. Observe the two new blocks fail.
3. Edit `agents/skills/claude-code/harness-code-review/SKILL.md`:

   **(a)** In `## Argument Resolution`, add a third numbered item after item 2:

   ```markdown
   3. **Review directory and moment:** If the dispatching session names a `review-dir` (for example `{sessionDir}/reviews/phase-{N}/`) and a `moment`, write your findings file there. That session writes the receipt. Otherwise this run writes its own receipt (see Review Receipt).
   ```

   **(b)** In `### Phase 4: FAN-OUT`, replace the line

   ```markdown
   **Tier:** mixed | **Purpose:** Run four parallel review subagents with domain-scoped context. Each produces `ReviewFinding[]`.
   ```

   with:

   ```markdown
   **Tier:** mixed | **Purpose:** Run the reviewers the review tier calls for, each in its own dispatch with domain-scoped context. Each produces `ReviewFinding[]` and writes its own findings file.

   #### Review tier and dispatch

   | Tier    | Reviewers                                                                                           | Dispatch                                                                                                          |
   | ------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
   | `light` | One reviewer, `compliance-bug`, covering compliance and bug detection, after the mechanical checks  | One dispatch, or this session itself                                                                              |
   | `full`  | `compliance`, `bug`, `security`, `architecture`, plus each conditional reviewer Phase 3.5 activates | One dispatch per reviewer, issued by the session running this skill, or the coded pipeline under `review.backend` |

   - **A standalone run that can dispatch subagents is `full`.** Autopilot states the tier for the reviews it drives; the final review is always `full`.
   - **Dispatched mode (D7).** If your own tool list has no subagent-spawning tool (another session dispatched you, or the client cannot spawn), you cannot fan out. Run `light`: do the compliance and bug-detection passes yourself, write one findings file as `compliance-bug`, record `tier: "light"` with that single reviewer, and skip Review Acceptance. Never record `full` for a review whose reviewers did not each run in their own dispatch. Decide this once, at skill start, from your tool list alone.
   - **Backend.** `review.backend` in `harness.config.json` is `"agent"` (the default) or `"pipeline"`. With `"pipeline"`, a `full` review calls the `run_code_review` tool and writes one findings file per reviewer from its findings, grouped by `domain` (and by `subagent` for conditional reviewers). If that tool is not callable in this session, run the agent backend and record `backend: "agent"` in the receipt.
   - **Every reviewer brief** names the reviewer id, the diff range, the reviewer's context bundle, the attribution rubric ([references/attribution-rubric.md](references/attribution-rubric.md)) and the path of the findings file to write. A reviewer dispatched for one domain reviews that domain only.
   ```

   **(c)** Insert a new section directly above the `### Review Acceptance` heading:

   ````markdown
   ### Review Receipt

   Every run writes a receipt, so a later reader can see which reviewers ran, over which diff.

   **Where.** With a session: `{sessionDir}/reviews/<moment>-<phase>/` (`phase-{N}` for a phase review, `final-all` for the final review). Standalone: `.harness/reviews/<branch>-<head sha>/`, with each run of characters outside `[A-Za-z0-9._-]` in the branch name replaced by `-`. The older shapes (`{sessionDir}/phase-{N}-review.json` and `phase-{N}-review-round-{M}.json`) are read for back-compatibility and no longer written.

   **Reviewer findings files.** Each reviewer writes `<reviewerId>.json` in that directory:

   ```json
   {
     "schemaVersion": 1,
     "reviewerId": "bug",
     "examinedFiles": ["packages/core/src/receipts/review-gate.ts"],
     "findings": []
   }
   ```

   `examinedFiles` lists the files of the diff the reviewer read, project-relative. Context files outside the diff are not listed, and a reviewer that read nothing has not reviewed. `findings` holds `ReviewFinding` objects.

   **`receipt.json`.**

   ```json
   {
     "schemaVersion": 1,
     "moment": "standalone",
     "tier": "full",
     "backend": "agent",
     "diff": {
       "base": "0000000000000000000000000000000000000001",
       "head": "0000000000000000000000000000000000000002"
     },
     "coldContext": true,
     "priorFindingsSupplied": false,
     "reviewers": [
       {
         "id": "compliance",
         "required": true,
         "ran": true,
         "modelTier": "standard",
         "findingsPath": "compliance.json"
       },
       {
         "id": "bug",
         "required": true,
         "ran": true,
         "modelTier": "strong",
         "findingsPath": "bug.json"
       },
       {
         "id": "security",
         "required": true,
         "ran": true,
         "modelTier": "strong",
         "findingsPath": "security.json"
       },
       {
         "id": "architecture",
         "required": true,
         "ran": true,
         "modelTier": "standard",
         "findingsPath": "architecture.json"
       },
       {
         "id": "frontend-races",
         "required": false,
         "ran": false,
         "skippedReason": "no async-UI signal in the diff"
       }
     ],
     "blocking": 0,
     "advisory": 0
   }
   ```

   - `diff.base` and `diff.head` are resolved 40-character SHAs (`git rev-parse`). Add `"baseSource": "starting-commit"` to `diff` only when the base fell back from the merge base.
   - `moment` is `standalone` for a direct `/harness:code-review` run. Autopilot uses `phase` and `final`.
   - `required` is true for every reviewer the tier and the Phase 3.5 activation set call for. `ran` is true only when that reviewer's findings file exists. `findingsPath` is relative to the receipt's directory.
   - `coldContext` is true when no reviewer brief carried findings from an earlier review; `priorFindingsSupplied` is true when one did.
   - `blocking` counts `critical` and `important` findings after Phase 6; `advisory` counts the rest.

   **Gate.** Run `harness check-review-receipt <review directory>`, or call the `check_review_receipt` tool. The gate recomputes HEAD, the diff's file set and each findings file; it treats the receipt's own fields as claims, and it fails on a missing receipt. It needs no model credential.

   _Pause point (gate): resolve per the Pause Protocol._ <!-- pause: gate -->
   If the gate fails, the review is not complete. Report each failure and the reviewer it names. Fix what you can (dispatch that reviewer again, rewrite the receipt) and run the gate again. Never present a review as done on a failing or missing receipt.
   ````

   **(d)** In `### Review Acceptance`, insert this paragraph between the heading and the existing `_Pause point (ceremony)..._` marker line, with a blank line on each side:

   ```markdown
   **Dispatched mode skips this section.** A dispatched reviewer returns its findings and the path of its findings file to the session that dispatched it; that session owns acceptance.
   ```

4. Run the test. Observe pass. Run `pnpm --filter @harness-engineering/skills exec vitest run tests/pause-markers.test.ts tests/autonomy-wiring.test.ts tests/structure.test.ts tests/interaction-channel.test.ts`. Observe pass. If `pause-markers.test.ts` reports an unmarked pause phrase in text you added, reword that sentence to avoid the phrase (see Conventions); do not add a `not-a-pause` opt-out (the skill is at its opt-out ceiling of 7).
5. Run `pnpm exec prettier --check agents/skills/claude-code/harness-code-review/SKILL.md`; if it fails, run `pnpm exec prettier --write` on that file and rerun the tests from step 4.
6. VALIDATE.
7. Commit: `feat(skills): harness-code-review declares its tier and writes a review receipt`

### Task 27: Record attribution at the end of `harness-code-review`

**Depends on:** Task 26 | **Files:** `agents/skills/claude-code/harness-code-review/SKILL.md`, `agents/skills/tests/code-review-receipts.test.ts`

1. Append to `agents/skills/tests/code-review-receipts.test.ts`:

   ```ts
   describe('attribution recording (SC7, SC8)', () => {
     const receipt = () => section(md(), '### Review Receipt');
     it('records attribution after the gate with the record subcommand', () => {
       const text = receipt();
       expect(text).toContain('harness review-attribution record --receipt <review directory>');
       expect(text.indexOf('harness check-review-receipt')).toBeLessThan(
         text.indexOf('harness review-attribution record')
       );
     });
     it('says a failed append never fails the review', () => {
       expect(receipt()).toMatch(/failed append is logged and never fails the review/);
     });
     it('explains stamped and unstamped for a standalone review, and names the report', () => {
       expect(receipt()).toMatch(/`unstamped`/);
       expect(receipt()).toContain('<!-- harness:review-provenance -->');
       expect(receipt()).toContain('harness review-attribution report');
     });
     it('lists the new commands and tool under Harness Integration', () => {
       const integration = section(md(), '## Harness Integration');
       for (const name of [
         'harness check-review-receipt',
         'check_review_receipt',
         'harness review-attribution record',
       ]) {
         expect(integration, name).toContain(name);
       }
     });
   });
   ```

2. Run the test file. Observe the new block fail.
3. Edit `agents/skills/claude-code/harness-code-review/SKILL.md`:

   **(a)** At the end of the `### Review Receipt` section (after the paragraph that ends "on a failing or missing receipt."), add:

   ```markdown
   **Record attribution.** After the gate, run `harness review-attribution record --receipt <review directory>`. It appends one record for the run and one for each blocking finding (with its `findingClass` and `escapedFrom`) to `.harness/metrics/review-attribution.jsonl`. A failed append is logged and never fails the review. The log is machine-local.

   For a standalone review the command reads the PR body through `gh` and looks for the provenance stamp (the block between `<!-- harness:review-provenance -->` markers). A PR that carries the stamp is recorded as `stamped`: its blocking findings are what the pipeline's own reviews let through, which is the measure `harness review-attribution report` prints per PR. Where `gh` is absent, the branch has no PR, or the PR has no stamp, the run is recorded as `unstamped`.
   ```

   **(b)** In `## Harness Integration`, add these three bullets after the `- **Session directory**` bullet:

   ```markdown
   - **`harness check-review-receipt`** / **`check_review_receipt`** — after Phase 7: gate the review receipt. Fails on a missing receipt, a required reviewer that did not run, a findings file that is absent, invalid or outside the diff, and a stale head.
   - **`harness review-attribution record`** — after the gate: append the run and its blocking findings to the attribution log. `harness review-attribution report` prints the counts by stage and class.
   - **`review.backend`** — `harness.config.json`: `"agent"` (default) or `"pipeline"` for the `full` tier. See Review tier and dispatch.
   ```

4. Run the test file. Observe pass. Run `pnpm --filter @harness-engineering/skills exec vitest run tests/pause-markers.test.ts tests/structure.test.ts`. Observe pass.
5. Run `pnpm exec prettier --check agents/skills/claude-code/harness-code-review/SKILL.md`; write and retest if needed.
6. VALIDATE.
7. Commit: `feat(skills): harness-code-review records stage attribution`

### Task 28: Rewrite autopilot's REVIEW state to fan out and gate a receipt

**Depends on:** none | **Files:** `agents/skills/claude-code/harness-autopilot/SKILL.md`, `agents/skills/tests/autopilot-review-fidelity.test.ts`

1. Create `agents/skills/tests/autopilot-review-fidelity.test.ts`:

   ```ts
   // agents/skills/tests/autopilot-review-fidelity.test.ts
   //
   // Shift-left pipeline fidelity, Phase 1: autopilot's reviews fan out, are gated, and are stamped.

   import { describe, it, expect } from 'vitest';
   import { readFileSync } from 'fs';
   import { resolve, dirname } from 'path';
   import { fileURLToPath } from 'url';

   const SKILL = resolve(
     dirname(fileURLToPath(import.meta.url)),
     '..',
     'claude-code',
     'harness-autopilot',
     'SKILL.md'
   );
   export const md = () => readFileSync(SKILL, 'utf-8');

   /** The text from a heading to the next heading of the same or higher level. */
   export function section(text: string, heading: string): string {
     const lines = text.split('\n');
     const start = lines.findIndex((l) => l.trim() === heading);
     if (start < 0) throw new Error(`heading not found: ${heading}`);
     const level = (/^#+/.exec(heading) ?? [''])[0].length;
     const end = lines.findIndex(
       (l, i) => i > start && /^#+ /.test(l) && (/^#+/.exec(l) ?? [''])[0].length <= level
     );
     return lines.slice(start, end < 0 ? undefined : end).join('\n');
   }

   describe('REVIEW: tier, fan-out, receipt, gate (SC1, SC2)', () => {
     const review = () => section(md(), '### REVIEW');
     it('no longer hands the whole review skill to one subagent', () => {
       expect(review()).not.toMatch(/Follow harness-code-review\. Report findings/);
       expect(review()).toMatch(/do not hand the whole skill to one subagent/);
     });
     it('computes the tier from the four rules and states it', () => {
       const text = review();
       expect(text).toContain('selectReviewTier');
       for (const rule of [
         'risk keyword',
         'package entry point',
         'complexity is `high`',
         '`thorough`',
       ]) {
         expect(text, rule).toContain(rule);
       }
       expect(text).toMatch(/computed, not asked/);
     });
     it('SC1: a full review dispatches one reviewer per record, each writing its own findings file', () => {
       const text = review();
       expect(text).toMatch(/one dispatch per reviewer/);
       expect(text).toContain('{sessionDir}/reviews/phase-{N}/{reviewerId}.json');
       expect(text).toContain('You are the {reviewerId} reviewer ONLY');
       for (const id of ['compliance', 'bug', 'security', 'architecture']) {
         expect(text, id).toContain(`\`${id}\``);
       }
       expect(text).toContain('references/attribution-rubric.md');
     });
     it('a light review is one dispatch in dispatched mode writing compliance-bug.json', () => {
       expect(review()).toContain('{sessionDir}/reviews/phase-{N}/compliance-bug.json');
       expect(review()).toMatch(/dispatched mode \(tier light\)/);
     });
     it('writes the receipt and may not leave REVIEW without a passing gate', () => {
       const text = review();
       expect(text).toContain('{sessionDir}/reviews/phase-{N}/receipt.json');
       expect(text).toContain('harness check-review-receipt {sessionDir}/reviews/phase-{N}');
       expect(text).toContain('check_review_receipt');
       expect(text).toMatch(/REVIEW may not be left/);
       expect(text).toContain('ask "re-run / override / stop."');
       expect(text).toContain(
         'harness review-attribution record --receipt {sessionDir}/reviews/phase-{N}'
       );
     });
     it('records a gate override in decisions[] in the shape the stamp reads', () => {
       expect(review()).toContain('{ state: "REVIEW", phase: N, chosen: "override"');
     });
     it('keeps the pinned blocking-findings pause and stops writing the legacy file', () => {
       const text = review();
       expect(text).toContain('Blocking → ask "fix / override / stop."');
       expect(text).not.toContain('Persist findings to `{sessionDir}/phase-{N}-review.json`');
       expect(text).toMatch(/never written/);
     });
     it('SC15: resolves the backend and records agent when the pipeline is not callable', () => {
       expect(review()).toContain('`review.backend`');
       expect(review()).toMatch(/record `backend: "agent"`/);
     });
   });
   ```

2. Run `pnpm --filter @harness-engineering/skills exec vitest run tests/autopilot-review-fidelity.test.ts`. Observe failure.
3. Edit `agents/skills/claude-code/harness-autopilot/SKILL.md`, section `### REVIEW`:

   **(a)** Replace everything from the line `Dispatch harness-code-reviewer:` through the closing fence of the code block that follows it (the block holding `subagent_type: "harness-code-reviewer"` and the one-line prompt) with:

   ````markdown
   **1. Select the tier (computed, not asked).** The phase diff runs from `{base}` to `{head}`: `{base}` is the `diff.head` of the previous phase's receipt (`startingCommit` for the first phase) and `{head}` is `git rev-parse HEAD`. Apply `selectReviewTier` (from `@harness-engineering/core`). The phase is `full` when any of these holds, and `light` otherwise:

   - the diff or the latest commit message matches at least one risk keyword (harness-code-review `references/risk-keywords.md`);
   - the diff touches a package entry point: `src/index.ts` at a package root, or a file named in a `package.json` `exports`, `main` or `bin` field;
   - the phase's assessed complexity is `high`;
   - `rigorLevel` is `thorough`.

   Print the tier and its reasons on one line, for example `Review tier: full (risk-keyword:token, complexity:high)`.

   **2. Resolve the backend.** Read `review.backend` from `harness.config.json` (default `"agent"`). `"pipeline"` applies to a `full` review only, and only when the `run_code_review` tool is callable in this session; otherwise run the agent backend and record `backend: "agent"` in the receipt (`resolveReviewBackend`).

   **3. Run the review from this session; do not hand the whole skill to one subagent.** A dispatched reviewer has no way to dispatch reviewers of its own, so the fan-out is issued here. Create `{sessionDir}/reviews/phase-{N}/`.

   - **`light`:** one dispatch.

     ```
     subagent_type: "harness-code-reviewer"
     prompt: "Phase {N}: {name}. Session: {sessionSlug}. Follow harness-code-review in dispatched mode (tier light). Diff: git diff {base}..{head}. Classify every critical or important finding per references/attribution-rubric.md (findingClass, escapedFrom). Write your findings file to {sessionDir}/reviews/phase-{N}/compliance-bug.json as { schemaVersion: 1, reviewerId: \"compliance-bug\", examinedFiles, findings }. Report findings (critical / important / suggestion)."
     ```

   - **`full`, agent backend:** run harness-code-review Phase 2 (MECHANICAL), Phase 3 (CONTEXT) and Phase 3.5 (CALIBRATE DEPTH) in this session. Then issue one dispatch per reviewer, in parallel: `compliance`, `bug`, `security`, `architecture`, plus each conditional reviewer the calibration activates (`adversarial`, `typescript-strict`, `frontend-races`).

     ```
     subagent_type: "<reviewer persona>"
     prompt: "Phase {N}: {name}. Session: {sessionSlug}. You are the {reviewerId} reviewer ONLY (harness-code-review Phase 4, the {reviewerId} section). Diff: git diff {base}..{head}. Context: {reviewer context bundle}. Classify every critical or important finding per references/attribution-rubric.md (findingClass, escapedFrom). Write {sessionDir}/reviews/phase-{N}/{reviewerId}.json as { schemaVersion: 1, reviewerId, examinedFiles, findings }, where examinedFiles lists the diff files you read. Report findings (critical / important / suggestion)."
     ```

     Personas: `harness-code-reviewer` for `compliance`, `bug` and `architecture`; `harness-security-reviewer` for `security`; `harness-adversarial-reviewer`, `harness-typescript-strict-reviewer` and `harness-frontend-races-reviewer` for the conditional reviewers.

   - **`full`, pipeline backend:** call `run_code_review` with the phase diff, then write one findings file per reviewer from its findings, grouped by `domain` (and by `subagent` for conditional reviewers).

   Then run harness-code-review Phase 5 (VALIDATE) and Phase 6 (DEDUP + MERGE) over the union of the reviewer files.

   **4. Write the receipt** to `{sessionDir}/reviews/phase-{N}/receipt.json` (fields and an example: harness-code-review, "Review Receipt"). Set `moment: "phase"`, the tier and backend from steps 1 and 2, `diff.base` and `diff.head` as resolved 40-character SHAs, and one record per reviewer: `required: true` for every reviewer the tier and the activation set call for, `ran: true` only when its findings file exists, `findingsPath` relative to the receipt directory. List a conditional reviewer the calibration left inactive with `required: false`, `ran: false` and a `skippedReason`. A reviewer whose dispatch failed is `required: true`, `ran: false`: the gate then fails and names it.
   ````

   **(b)** In the paragraph that begins "If a **user-declared** hooked skill cannot be dispatched", replace the phrase ``Persist each hook's findings under a per-hook key in `{sessionDir}/phase-{N}-review.json` so provenance survives`` with ``Persist each hook's findings as `{sessionDir}/reviews/phase-{N}/hook-<hook name>.json` so provenance survives``.

   **(c)** Replace the final paragraph of the section, the one that begins ``Persist findings to `{sessionDir}/phase-{N}-review.json`.``, and the `_Pause point (gate)..._` marker line directly above it, with:

   ```markdown
   **5. Gate the receipt.** Run `harness check-review-receipt {sessionDir}/reviews/phase-{N}` (or the `check_review_receipt` tool). A missing receipt fails the gate. Then record attribution: `harness review-attribution record --receipt {sessionDir}/reviews/phase-{N}`. A failed append is logged and never fails the review.

   _Pause point (gate): resolve per the Pause Protocol._ <!-- pause: gate -->
   If the receipt gate fails, REVIEW may not be left. Report each failure and the reviewer it names, then ask "re-run / override / stop." `re-run`: dispatch the named reviewers again, rewrite the receipt and gate it again. `override`: record `{ state: "REVIEW", phase: N, chosen: "override", question: "<the failed gate codes>" }` in `decisions[]`; the provenance stamp shows it. `stop`: save state and exit.

   _Pause point (gate): resolve per the Pause Protocol._ <!-- pause: gate -->
   No blocking (across baseline + additional reviewers) → PHASE_COMPLETE. Blocking → ask "fix / override / stop." `fix`: re-enter EXECUTE. `override`: record `{ state: "REVIEW", phase: N, chosen: "override", question: "<the overridden findings>" }` in `decisions[]` → PHASE_COMPLETE.

   All review output for the phase lives in `{sessionDir}/reviews/phase-{N}/`. The older shapes (`{sessionDir}/phase-{N}-review.json`, `phase-{N}-review-round-{M}.json`) are read when resuming an older session and never written.
   ```

   **(d)** In the "Craft domains auto-wire" bullet list earlier in the file, in the bullet that begins "\*\*A craft hook that FAILS at runtime is recorded", replace ``Record it in\n  `{sessionDir}/phase-{N}-review.json` and in the denominator`` with ``Record it in\n  `{sessionDir}/reviews/phase-{N}/hook-<hook name>.json` and in the denominator`` (keep the line break where prettier puts it).

4. Run the test. Observe pass. Run `pnpm --filter @harness-engineering/skills exec vitest run tests/pause-markers.test.ts tests/autonomy-wiring.test.ts tests/structure.test.ts`. Observe pass: the pinned line `Blocking → ask "fix / override / stop."` must still resolve to class `gate`.
5. Run `pnpm exec prettier --check agents/skills/claude-code/harness-autopilot/SKILL.md`; write and retest if needed.
6. VALIDATE.
7. Commit: `feat(skills): autopilot REVIEW fans out per reviewer and gates a receipt`

### Task 29: Make autopilot's FINAL_REVIEW cold and full

**Depends on:** Task 28 | **Files:** `agents/skills/claude-code/harness-autopilot/SKILL.md`, `agents/skills/tests/autopilot-review-fidelity.test.ts`

1. Append to `agents/skills/tests/autopilot-review-fidelity.test.ts`:

   ```ts
   describe('FINAL_REVIEW: cold and full (SC4, D6)', () => {
     const final = () => section(md(), '### FINAL_REVIEW');
     it('hands no prior findings and no coherence-only focus to any reviewer', () => {
       const text = final();
       expect(text).not.toMatch(/Prior findings: \{collected\}/);
       expect(text).not.toMatch(/Focus on cross-phase coherence/);
       expect(text).toMatch(/nothing from earlier reviews/);
     });
     it('reviews the diff from the merge base and falls back to startingCommit, saying so', () => {
       const text = final();
       expect(text).toContain('git merge-base');
       expect(text).toContain('git symbolic-ref refs/remotes/origin/HEAD');
       expect(text).toContain('`diff.baseSource: "starting-commit"`');
     });
     it('is always full: --fast does not lower it', () => {
       expect(final()).toMatch(/always `full`: `--fast` does not lower it/);
     });
     it('SC4: the receipt records the final moment as full, cold, with no prior findings', () => {
       const text = final();
       expect(text).toContain('{sessionDir}/reviews/final-all/');
       expect(text).toMatch(
         /`moment: "final"`, `tier: "full"`, `coldContext: true`, `priorFindingsSupplied: false`/
       );
     });
     it('labels repeats only after every reviewer has returned, and never drops them', () => {
       const text = final();
       const brief = text.indexOf('You are the {reviewerId} reviewer ONLY');
       const label = text.indexOf('previously-raised');
       expect(brief).toBeGreaterThan(0);
       expect(label).toBeGreaterThan(brief);
       expect(text).toMatch(/After every reviewer has returned/);
       expect(text).toMatch(/never removes a finding or lowers its severity/);
     });
     it('gates the final receipt and may not leave FINAL_REVIEW without a passing one', () => {
       const text = final();
       expect(text).toContain('harness check-review-receipt {sessionDir}/reviews/final-all');
       expect(text).toContain(
         'harness review-attribution record --receipt {sessionDir}/reviews/final-all'
       );
       expect(text).toMatch(/FINAL_REVIEW may not be left/);
       expect(text).toContain('{ state: "FINAL_REVIEW", chosen: "override"');
       expect(text).toContain('5. Blocking: ask "fix / override / stop."');
     });
   });
   ```

2. Run the test file. Observe the new block fail.
3. Edit `agents/skills/claude-code/harness-autopilot/SKILL.md`, section `### FINAL_REVIEW`:

   **(a)** Replace step 2 (``2. Gather per-phase findings from `{sessionDir}/phase-{N}-review.json` files.``) and step 3 from its first line (`3. Dispatch harness-code-reviewer:`) through the closing fence of its first code block (the one holding the `Final cross-phase review. ...` prompt) with:

   ````markdown
   2. Resolve the cold diff. `{head}` is `git rev-parse HEAD`. `{base}` is `git merge-base origin/<default branch> HEAD`, where the default branch comes from `git symbolic-ref refs/remotes/origin/HEAD`. If the default branch cannot be resolved, `{base}` is `startingCommit` and the receipt records `diff.baseSource: "starting-commit"`, so the stamp says so.
   3. Run a **cold, `full`** review from this session. The final review is always `full`: `--fast` does not lower it, and the tier is not recomputed here. Follow REVIEW steps 2 to 4 with these differences:
      - the review directory is `{sessionDir}/reviews/final-all/`;
      - every reviewer brief carries the cold diff and that reviewer's context bundle, and nothing from earlier reviews: no prior findings, no per-phase summary, no coherence-only focus. Each reviewer does the full hunt of its domain over the whole diff;
      - the receipt records `moment: "final"`, `tier: "full"`, `coldContext: true`, `priorFindingsSupplied: false`.

      ```
      subagent_type: "<reviewer persona>"
      prompt: "Final review. You are the {reviewerId} reviewer ONLY (harness-code-review Phase 4, the {reviewerId} section). Diff: git diff {base}..{head}. Context: {reviewer context bundle}. Classify every critical or important finding per references/attribution-rubric.md (findingClass, escapedFrom). Write {sessionDir}/reviews/final-all/{reviewerId}.json as { schemaVersion: 1, reviewerId, examinedFiles, findings }, where examinedFiles lists the diff files you read. Report findings (critical / important / suggestion)."
      ```

      After every reviewer has returned, and not before, read the per-phase findings (`{sessionDir}/reviews/phase-*/`, or the older `{sessionDir}/phase-{N}-review.json` shapes in an older session) and mark each final finding whose file and start line match a per-phase finding as `previously-raised` in `finalReview.findings`. The label is bookkeeping: it never removes a finding or lowers its severity.

      Gate the receipt: `harness check-review-receipt {sessionDir}/reviews/final-all` (or the `check_review_receipt` tool), then `harness review-attribution record --receipt {sessionDir}/reviews/final-all`.

      _Pause point (gate): resolve per the Pause Protocol._ <!-- pause: gate -->

      If the receipt gate fails, FINAL_REVIEW may not be left. Report each failure and the reviewer it names, then ask "re-run / override / stop." `re-run`: dispatch the named reviewers again, rewrite the receipt and gate it again. `override`: record `{ state: "FINAL_REVIEW", chosen: "override", question: "<the failed gate codes>" }` in `decisions[]`; the provenance stamp shows it. `stop`: save state and exit.
   ````

   **(b)** In the rest of step 3 (the hook paragraphs), make these three replacements:
   - `over the same cross-phase diff` → ``over the same `{base}..{head}` diff``
   - `If the cross-phase diff differs` → `If the final diff differs` (keep the surrounding line breaks)
   - in the hook prompt, `"Final cross-phase domain review. Diff: git diff {startingCommit}..HEAD.` → `"Final domain review. Diff: git diff {base}..{head}.`

   **(c)** In step 5, change the `override` bullet to: ``- `override`: record `{ state: "FINAL_REVIEW", chosen: "override", rationale: "<why>" }` in `decisions[]`. Set `"overridden"` → OUTCOME_EVAL.`` Leave the step's first line (`5. Blocking: ask "fix / override / stop."`) exactly as it is.

4. Run the test file. Observe pass. Run `pnpm --filter @harness-engineering/skills exec vitest run tests/pause-markers.test.ts tests/autonomy-wiring.test.ts tests/structure.test.ts`. Observe pass.
5. Run `pnpm exec prettier --check agents/skills/claude-code/harness-autopilot/SKILL.md`; write and retest if needed (prettier may re-indent the nested list; the tests match on content, not indentation).
6. VALIDATE.
7. Commit: `feat(skills): autopilot FINAL_REVIEW is a cold, full review`

### Task 30: Put the provenance stamp in the PR body at DONE

[checkpoint:human-verify] After this task, show the human the full diff of both SKILL.md files (`git diff b51457196 -- agents/skills/claude-code/harness-autopilot/SKILL.md agents/skills/claude-code/harness-code-review/SKILL.md`). These edits change what every pipeline run does at review time. Wait for confirmation before Task 31 regenerates the plugin artifacts from them.

**Depends on:** Task 29 | **Files:** `agents/skills/claude-code/harness-autopilot/SKILL.md`, `agents/skills/tests/autopilot-review-fidelity.test.ts`

1. Append to `agents/skills/tests/autopilot-review-fidelity.test.ts`:

   ```ts
   describe('DONE: provenance stamp in the PR body (SC6)', () => {
     const done = () => section(md(), '### DONE');
     it('renders the stamp and places it verbatim in the PR body', () => {
       const text = done();
       expect(text).toContain('harness review-provenance render --session <session-slug>');
       expect(text).toContain('<!-- harness:review-provenance -->');
       expect(text).toMatch(/verbatim in the PR body/);
       expect(text).toMatch(/one row per review/);
     });
     it('never omits the stamp silently when the command fails', () => {
       expect(done()).toContain('Review provenance unavailable (<reason>)');
     });
     it('keeps the pinned PR question and the closing-keyword rule', () => {
       expect(done()).toContain('Ask "Create a PR? (yes / no)."');
       expect(done()).toContain('Closes #<N>');
     });
   });

   describe('summaries and examples match the new review states', () => {
     it('the Process list describes the fan-out and the cold final review', () => {
       const process = section(md(), '## Process');
       expect(process).not.toMatch(/\*\*REVIEW\*\* — Dispatch harness-code-reviewer plus/);
       expect(process).toMatch(/\*\*REVIEW\*\* — Select the review tier/);
       expect(process).toMatch(/Cold, full final review/);
     });
     it('nothing in the skill still calls the final review a coherence pass', () => {
       expect(md()).not.toMatch(/catches cross-phase coherence issues/);
     });
   });
   ```

2. Run the test file. Observe the two new blocks fail.
3. Edit `agents/skills/claude-code/harness-autopilot/SKILL.md`:

   **(a)** In `### DONE`, step 3, add this as an indented sub-bullet directly below the existing step 3 paragraph (do not insert anything between the `_Pause point (irreversible)..._` marker and the line that starts `3. Ask "Create a PR? (yes / no)."`):

   ```markdown
   - **Provenance stamp.** Before writing the PR body, run `harness review-provenance render --session <session-slug>` and place its output verbatim in the PR body. It is the block between `<!-- harness:review-provenance -->` markers: one row per review, with tier, reviewers run of required, diff range, blocking findings by class and escaped-from stage, and any override. If the command fails, write `Review provenance unavailable (<reason>)` in the body instead; never leave it out silently.
   ```

   **(b)** In `## Process`, replace the start of item 7, ``7. **REVIEW** — Dispatch harness-code-reviewer plus the effective `after:REVIEW` hooks``, with ``7. **REVIEW** — Select the review tier, dispatch one reviewer per record (`full`) or one reviewer (`light`), write and gate the receipt, then run the effective `after:REVIEW` hooks``. Keep the rest of the item.

   **(c)** In `## Process`, replace the start of item 9, `9. **FINAL_REVIEW → OUTCOME_EVAL → DONE** — Cross-phase review, then`, with `9. **FINAL_REVIEW → OUTCOME_EVAL → DONE** — Cold, full final review over the diff from the merge base with a gated receipt, then`. Change `offer PR creation` in the same item to `offer PR creation with the provenance stamp in the body`.

   **(d)** Replace the line ``- FINAL_REVIEW runs on `startingCommit..HEAD` diff and catches cross-phase coherence issues`` with ``- FINAL_REVIEW is a cold, `full`review of the diff from the merge base; its receipt passes`harness check-review-receipt```.

   **(e)** In the Examples section, replace `**REVIEW:** harness-code-reviewer. 0 blocking, 2 notes.` with ``**REVIEW:** tier `light` (no rule held), 1/1 reviewers, receipt gate passed. 0 blocking, 2 notes.`` and replace ``**FINAL_REVIEW:** harness-code-reviewer on `startingCommit..HEAD`. 0 blocking, 1 warning. Passed.`` with ``**FINAL_REVIEW:** cold, tier `full`, 5/5 reviewers over the merge-base diff, receipt gate passed. 0 blocking, 1 warning. Passed.``

   **(f)** Leave the dispatch table near the top of the file unchanged (the row that maps harness-code-review to the `harness-code-reviewer` persona for REVIEW and FINAL_REVIEW): that persona is still the one dispatched for `compliance`, `bug`, `architecture` and the light review.

4. Run the test file. Observe pass. Run `pnpm --filter @harness-engineering/skills exec vitest run`. Observe the whole skills suite pass, including `pause-markers.test.ts` (the line `Ask "Create a PR? (yes / no)."` must still resolve to class `irreversible`) and `platform-parity.test.ts`.
5. Run `pnpm exec prettier --check agents/skills/claude-code/harness-autopilot/SKILL.md`; write and retest if needed.
6. VALIDATE.
7. Commit: `feat(skills): autopilot stamps review provenance into the PR body`
8. Stop at the checkpoint above.

### Task 31: Regenerate plugin artifacts, reference docs and the tool catalog

**Depends on:** Task 19, Task 22, Task 27, Task 30 | **Files:** `.claude-plugin/**`, `.cursor-plugin/**`, `.gemini-extension/**`, `.antigravity-extension/**`, the codex plugin directory, `docs/reference/cli-commands.md`, `docs/reference/mcp-tools.md`, `docs/reference/skills-catalog.md`, `docs/reference/tool-catalog.md` | **Category:** integration

Generated files only. Three independent generators guard pre-push, and two of them read `packages/cli/dist`.

1. Run `pnpm turbo run build --filter=@harness-engineering/cli...`. Do not skip: `generate-docs` and `generate:tool-catalog` read the built CLI, so without a rebuild the new commands and tool are invisible to them.
2. Run the checks first and observe them fail: `pnpm run generate:plugin:check`, `pnpm run generate-docs --check`, `pnpm run generate:tool-catalog:check`.
3. Run `pnpm run generate:plugin:all`, then `pnpm run generate-docs`, then `pnpm run generate:tool-catalog`.
4. Check the output:

   ```bash
   grep -c "check-review-receipt" docs/reference/cli-commands.md      # >= 1
   grep -c "review-provenance" docs/reference/cli-commands.md         # >= 1
   grep -c "review-attribution" docs/reference/cli-commands.md        # >= 1
   grep -c "check_review_receipt" docs/reference/mcp-tools.md         # >= 1
   grep -c "check_review_receipt" docs/reference/tool-catalog.md      # >= 1
   grep -c "Review Receipt" .claude-plugin/agents/harness-code-reviewer.md   # >= 1
   grep -rc "Focus on cross-phase coherence" .gemini-extension/commands/autopilot.toml .antigravity-extension/commands/autopilot.toml   # 0 for each
   ```

5. Run all three checks again plus `pnpm run generate:barrels:check`. Observe pass.
6. Confirm the mirrors need no edit: `for p in cursor codex gemini-cli; do for s in harness-autopilot harness-code-review; do [ -L agents/skills/$p/$s ] && echo "$p/$s symlink" || echo "$p/$s REAL COPY"; done; done`. Every line must say `symlink`. If any says `REAL COPY`, stop and report it: that mirror needs the same edits by hand.
7. VALIDATE.
8. Commit: `chore: regenerate plugin artifacts and reference docs for review receipts`

---

## Milestone D: documents and verification

### Task 32: Write ADR 0139, receipts are claims that gates recompute

**Depends on:** none | **Files:** `docs/knowledge/decisions/0139-review-receipts-are-claims-recomputed-by-gates.md` | **Category:** integration

1. Run `git ls-tree --name-only origin/main docs/knowledge/decisions/ | grep -E "/01(39|4[0-9])-"`. It must print nothing. If it prints a file, take the next two free numbers for this task and Task 33 and adjust both filenames and `number:` fields. (`0136` and `0137` are each used twice on `origin/main`; that is pre-existing and not fixed here.)
2. Create `docs/knowledge/decisions/0139-review-receipts-are-claims-recomputed-by-gates.md`:

   ```markdown
   ---
   number: 0139
   title: 'The agent does the work and writes a typed receipt; a gate recomputes the receipt and treats its fields as claims'
   date: 2026-11-20
   status: accepted
   tier: large
   source: docs/changes/shift-left-pipeline-fidelity/proposal.md
   ---

   ## Context

   > **Record of an operative decision.** This ADR documents spec decisions **D3, D4 and D7** of
   > `docs/changes/shift-left-pipeline-fidelity/proposal.md`.

   `harness-code-review` told the reviewing agent to run four review subagents in parallel.
   Autopilot dispatched that skill to one subagent that had no agent-spawning tool, so the fan-out
   collapsed into a single context and nothing noticed. The instruction existed and silently did
   not happen. A prompt cannot enforce its own execution, and the harness cannot run the reviewers
   itself without a model credential, which most adopters and every CI job without a secret lack.

   The design question was how to make "the review ran as claimed" checkable on Claude Code,
   Cursor, Codex and Gemini CLI, with no API key.

   ## Decision

   ### The agent works; code checks a receipt (D3)

   A review writes a typed `ReviewReceipt` (`packages/types/src/pipeline-receipts.ts`): the moment,
   the tier, the backend, the diff range as resolved SHAs, and one record per reviewer. Each
   reviewer writes its own findings file listing the diff files it examined. The agent still does
   all the reviewing. A coded gate, `validateReviewReceipt` in
   `packages/core/src/receipts/review-gate.ts`, decides whether the review counts.

   ### The gate recomputes; receipt fields are claims (D4)

   The gate does not validate the receipt's shape and stop. Its caller recomputes what can be
   recomputed and the gate compares:

   - HEAD comes from `git rev-parse HEAD`, not from the receipt.
   - The diff's file set comes from `git diff --name-only <base>..<head>`.
   - Each findings file is read from disk and parsed. A reviewer marked `ran` with no file, an
     invalid file, a file written under another reviewer's id, a file shared with another
     reviewer, an empty examined-files list, or an examined file outside the diff fails.
   - A `full` receipt must list `compliance`, `bug`, `security` and `architecture` as required.
     A `light` receipt must list exactly one required reviewer.
   - A blocking finding without `findingClass` and `escapedFrom` makes its file invalid.

   A missing receipt fails. The gate reads no environment variable and calls no model, so it
   passes or fails identically everywhere. It is exposed as `harness check-review-receipt` and the
   `check_review_receipt` MCP tool. It is not part of `check_phase_gate`, which maps
   implementation files to spec files and has no session concept.

   ### A reviewer that cannot fan out says so (D7)

   A session with no subagent-spawning tool runs the `light` tier and records `tier: "light"`. It
   never records `full`. Honest capability is what makes the roster check meaningful.

   ## Consequences

   - A degraded review now fails a gate or shows on the PR as `light`; it cannot pass as `full`.
   - **What the gate cannot prove:** that reviewers ran in separate contexts. One context that
     deliberately writes four findings files passes. The provenance stamp makes the claim visible
     and the standalone review measures whether it held.
   - Three receipt fields stay claims in Phase 1 because the gate does not recompute them:
     `diff.base`, the set of conditional reviewers, and whether a phase was entitled to `light`.
     They are shown on the stamp.
   - Later stages copy the pattern: the claim-consistency sweep and the edge-case contract each
     write a receipt that a search-only gate recomputes.

   ## Alternatives rejected

   - **Stronger prompt wording.** This is what failed.
   - **The harness runs the reviewers.** Needs a credential or a runner on every client. It remains
     available as the opt-in `review.backend: "pipeline"` (D8).
   - **Validate the receipt's schema only.** That is prompt-only enforcement with extra files: an
     agent that skipped the reviewers can still write a well-formed receipt.
   ```

3. Run `pnpm exec prettier --write docs/knowledge/decisions/0139-review-receipts-are-claims-recomputed-by-gates.md`. If `docs/knowledge/decisions/README.md` holds an index of ADRs, add a row for 0139 in its existing format.
4. VALIDATE (the count must not rise: a new ADR number must not add a duplicate-number issue).
5. Commit: `docs(adr): record receipts recomputed by gates (0139)`

### Task 33: Write ADR 0140, the final review is cold and full

[checkpoint:human-verify] After this task, show the human both ADR drafts (0139 and 0140) and wait for confirmation. ADR 0140 fixes what "reviewed" means on a PR.

**Depends on:** none | **Files:** `docs/knowledge/decisions/0140-the-final-review-is-cold-and-full.md` | **Category:** integration

1. Create `docs/knowledge/decisions/0140-the-final-review-is-cold-and-full.md` (use the number chosen in Task 32, step 1, if it moved):

   ```markdown
   ---
   number: 0140
   title: 'The final pipeline review is cold and full: the whole diff from the merge base, every reviewer, no prior findings'
   date: 2026-11-20
   status: accepted
   tier: large
   source: docs/changes/shift-left-pipeline-fidelity/proposal.md
   ---

   ## Context

   > **Record of an operative decision.** This ADR documents spec decisions **D5 and D6** of
   > `docs/changes/shift-left-pipeline-fidelity/proposal.md`. It reverses the previous
   > FINAL_REVIEW brief in `agents/skills/claude-code/harness-autopilot/SKILL.md`.

   Autopilot's final review was briefed to "focus on cross-phase coherence: naming, duplicated
   utilities, architectural drift" and was handed the findings of every earlier phase review. It
   was neither a full bug hunt nor a fresh read. A human who then ran `/harness:code-review` on the
   same PR, cold, found new blocking issues. The human's review is the one the pipeline has to
   match, and it is cold.

   ## Decision

   ### Cold (D6)

   The final review covers `merge-base(<default branch>, HEAD)..HEAD`. No reviewer brief carries a
   prior finding, a per-phase summary, or a coherence-only focus. If the default branch cannot be
   resolved, the base is autopilot's `startingCommit` and the receipt records
   `diff.baseSource: "starting-commit"`, which the stamp shows.

   Prior findings are used only after every reviewer has returned: a final finding whose file and
   start line match a per-phase finding is labelled `previously-raised`. The label never removes a
   finding and never lowers its severity.

   ### Full (D5)

   The final review always runs the `full` tier: `compliance`, `bug`, `security`, `architecture`
   and each conditional reviewer the depth calibration activates, one dispatch per reviewer.
   `--fast` does not lower it. Per-phase reviews are risk-tiered (`selectReviewTier`) because full
   fan-out on every phase multiplies cost by the phase count; the final review is where parity
   with the human's review is decided.

   ### Enforced

   `validateReviewReceipt` fails a `final` receipt unless `tier` is `full`, `coldContext` is true
   and `priorFindingsSupplied` is false. Autopilot may not leave FINAL_REVIEW without a passing
   receipt; an override is recorded in `decisions[]` and shown on the stamp.

   ## Consequences

   - "Reviewed" on a pipeline-built PR means a cold, full review of the whole change. The
     provenance stamp states it per PR.
   - The final review costs more than before: every reviewer reads the whole diff.
   - Findings already raised and fixed in a phase can reappear if the fix was incomplete. That is
     intended; the `previously-raised` label lets a reader see the repeat.
   - `coldContext` and `priorFindingsSupplied` are self-reported. The gate checks that they are
     set, not that they are true.

   ## Alternatives rejected

   - **Keep the coherence-only final review and strengthen per-phase reviews.** Phase reviews see
     one phase's diff; defects that live between phases, and documents made stale by a later
     phase, are visible only in the whole diff.
   - **Give the final reviewers the prior findings "for context".** A reviewer handed conclusions
     tends to confirm them. The human's review, which finds more, starts with none.
   - **Let `--fast` lower the final tier.** The final review is the parity point; a rigor flag that
     removes it removes the guarantee.
   ```

2. Run `pnpm exec prettier --write docs/knowledge/decisions/0140-the-final-review-is-cold-and-full.md`. Add a README index row if Task 32 added one.
3. VALIDATE.
4. Commit: `docs(adr): record the cold, full final review (0140)`
5. Stop at the checkpoint above.

### Task 34: Add the review-receipts knowledge document

**Depends on:** none | **Files:** `docs/knowledge/core/review-receipts.md` | **Category:** integration

1. Create `docs/knowledge/core/review-receipts.md`:

   ```markdown
   ---
   type: business_concept
   domain: core
   tags: [review, receipts, review-tier, provenance, stage-attribution, gate, shift-left]
   ---

   # Review Receipts

   A review receipt is a typed record of what one review did. A coded gate recomputes it, so a
   review that ran fewer reviewers than it claims fails instead of passing quietly. Contract types
   live in `packages/types/src/pipeline-receipts.ts`; validators, the gate, the stamp and the
   attribution log live in `packages/core/src/receipts/`. Decisions: ADR
   [0139](../decisions/0139-review-receipts-are-claims-recomputed-by-gates.md) and ADR
   [0140](../decisions/0140-the-final-review-is-cold-and-full.md).

   ## Concepts

   **Review receipt.** `receipt.json`: `moment` (`phase`, `final`, `standalone`), `tier`,
   `backend`, the diff range as resolved SHAs, `coldContext`, `priorFindingsSupplied`, one record
   per reviewer, and blocking and advisory counts. Beside it sits one findings file per reviewer,
   `<reviewerId>.json`, holding that reviewer's findings and the diff files it examined.

   **Review tier.** `light` is one reviewer (`compliance-bug`) after the mechanical checks. `full`
   is `compliance`, `bug`, `security` and `architecture`, plus each conditional reviewer the depth
   calibration activates, one dispatch per reviewer. `selectReviewTier`
   (`packages/core/src/review/tier-selector.ts`) makes a phase `full` when its diff matches a risk
   keyword, touches a package entry point, has `high` assessed complexity, or the rigor is
   `thorough`. The final review is always `full`. A session that cannot dispatch subagents runs
   `light` and says so.

   **Receipt gate.** `validateReviewReceipt` fails on a required reviewer that did not run, a
   findings file that is absent, invalid, shared or outside the recomputed diff, a head that is
   not the current HEAD, and a `final` receipt that is not full, cold and free of prior findings.
   A missing receipt fails. Surfaces: `harness check-review-receipt <path>` and the
   `check_review_receipt` MCP tool. It needs no model credential.

   **Provenance stamp.** A Markdown block between `<!-- harness:review-provenance -->` markers,
   printed by `harness review-provenance render --session <slug>`: one row per review with tier,
   reviewers run of required, diff range, blocking findings by class and escaped-from stage, and
   any override. Autopilot places it in the PR body. A PR with no stamp reads as "no pipeline
   review recorded".

   **Escaped-from stage.** Each blocking finding names the earliest stage that should have caught
   it: `spec`, `plan`, `execution`, `verification`, or `none`. With `findingClass` (`stale-claim`,
   `edge-case`, `weak-test`, `collateral`, `design`, `other`) it is recorded in
   `.harness/metrics/review-attribution.jsonl`. The rubric is
   `agents/skills/claude-code/harness-code-review/references/attribution-rubric.md`.

   ## Relationships

   - A finding class maps to the earliest stage that could catch it. The mapping is a reviewer's
     estimate and is read as a ranking of stages, not as exact counts.
   - A standalone `/harness:code-review` on a stamped PR is the success measure: its blocking
     findings are what the pipeline's reviews let through. `harness review-attribution report`
     prints them per PR.
   - `review.backend` in `harness.config.json` selects the agent backend (default) or the coded
     pipeline for the `full` tier. When the pipeline is configured and no runner resolves, the
     receipt records `backend: "agent"`.

   ## Layout

   | Review     | Directory                                     |
   | ---------- | --------------------------------------------- |
   | Phase      | `.harness/sessions/<slug>/reviews/phase-<N>/` |
   | Final      | `.harness/sessions/<slug>/reviews/final-all/` |
   | Standalone | `.harness/reviews/<branch>-<head sha>/`       |

   All three are ignored by git. The stamp carries the counts that have to travel with the PR.

   ## Limits

   The gate proves that each required reviewer produced its own findings file over files of the
   diff at the current commit. It does not prove the reviewers ran in separate contexts, and it
   does not recompute `diff.base`, the conditional-reviewer set, or a phase's entitlement to
   `light`.
   ```

2. Run `pnpm exec prettier --write docs/knowledge/core/review-receipts.md`.
3. VALIDATE.
4. Commit: `docs(knowledge): add the review receipts concept`

### Task 35: Add the review-provenance guide and its nav entry

**Depends on:** none | **Files:** `docs/guides/review-provenance.md`, `docs/.vitepress/config.mts` | **Category:** integration

1. Create `docs/guides/review-provenance.md`:

   ````markdown
   # Reading Review Provenance

   ## Overview

   Every PR built through `harness-autopilot` carries a provenance stamp in its body. The stamp
   says which reviews ran, at what tier, with how many reviewers of how many required, over what
   diff. This guide explains how to read it and how to check it.

   ## The stamp

   ```markdown
   <!-- harness:review-provenance -->

   ### Review provenance

   | Review    | Moment | Tier  | Backend | Reviewers | Diff               | Blocking | By class                   | Escaped from        | Override |
   | --------- | ------ | ----- | ------- | --------- | ------------------ | -------- | -------------------------- | ------------------- | -------- |
   | phase-0   | phase  | full  | agent   | 5/5       | `a1b2c3d..e4f5a6b` | 2        | stale-claim 1, edge-case 1 | plan 1, execution 1 | none     |
   | phase-1   | phase  | light | agent   | 1/1       | `e4f5a6b..0c1d2e3` | 0        | none                       | none                | none     |
   | final-all | final  | full  | agent   | 5/5       | `9f8e7d6..0c1d2e3` | 0        | none                       | none                | none     |

   <!-- harness:review-provenance -->
   ```

   | Column       | Meaning                                                                                                                                                                |
   | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | Review       | `phase-<N>` for a phase review, `final-all` for the final review.                                                                                                      |
   | Tier         | `full`: one dispatch per reviewer (compliance, bug, security, architecture, plus activated conditional reviewers). `light`: one reviewer covering compliance and bugs. |
   | Backend      | `agent`, or `pipeline` when `review.backend` selected the coded pipeline and a runner resolved.                                                                        |
   | Reviewers    | Required reviewers that ran, of required reviewers. Anything short of `N/N` means the receipt gate failed and was overridden.                                          |
   | Diff         | The reviewed range. `(base: starting-commit)` means the default branch could not be resolved and the session's starting commit was used instead of the merge base.     |
   | Blocking     | `critical` and `important` findings, counted from the reviewer findings files.                                                                                         |
   | By class     | Those findings by kind: `stale-claim`, `edge-case`, `weak-test`, `collateral`, `design`, `other`.                                                                      |
   | Escaped from | The earliest stage that should have caught each: `spec`, `plan`, `execution`, `verification`, or `none`.                                                               |
   | Override     | Why a failed receipt gate or blocking findings were overridden, if they were.                                                                                          |

   A line under the table such as `- phase-1: receipt invalid (...)` means that review's receipt
   could not be read. A PR with no stamp reads as "no pipeline review recorded".

   ## What to look for

   - **The `final-all` row.** It should be `full`, `N/N`, with no override. That row is the cold,
     full review of the whole change.
   - **A `light` phase.** Expected for a low-risk phase. It is also what a session that cannot
     dispatch subagents records, so a PR whose every row is `light` had no fan-out before the final
     review.
   - **An override.** Read the reason. An override on `final-all` means the PR shipped without a
     passing final review.

   ## Checking a receipt yourself

   ```bash
   # Gate one review. Exits 1 on any failure, including a missing receipt.
   harness check-review-receipt .harness/sessions/<slug>/reviews/final-all

   # Reprint the stamp for a session.
   harness review-provenance render --session <slug>
   ```

   The gate recomputes HEAD, the diff's file set and each reviewer's findings file. It needs no
   model credential. It proves that each required reviewer produced its own findings file over
   files of the diff at the current commit; it cannot prove the reviewers ran in separate contexts.

   ## Measuring the leak

   Run `/harness:code-review` on a stamped PR. That standalone review records its blocking findings
   against the PR, and `harness review-attribution report` prints them:

   ```text
   Review attribution: 14 reviews, 9 blocking findings
     escaped from: plan 5, execution 3, verification 1
     by class: stale-claim 5, edge-case 3, weak-test 1
     standalone reviews of stamped PRs: 2 PRs, 1 blocking finding
       pr:2701: 1 blocking across 1 review
       pr:2710: 0 blocking across 1 review
   ```

   The last block is the measure that matters: blocking findings a cold review still found after
   the pipeline's own reviews. The stage ranking shows where to catch them earlier. The log is
   machine-local (`.harness/metrics/review-attribution.jsonl` is ignored by git), and attribution
   is a reviewer's estimate, so read the stages as a ranking rather than exact counts.

   ## Related

   - [Review receipts](../knowledge/core/review-receipts.md)
   - ADR [0139](../knowledge/decisions/0139-review-receipts-are-claims-recomputed-by-gates.md), ADR [0140](../knowledge/decisions/0140-the-final-review-is-cold-and-full.md)
   - [`review` configuration](../reference/configuration.md#review)
   ````

2. In `docs/.vitepress/config.mts`, add after the line `{ text: 'Trusted Autonomy', link: '/guides/trusted-autonomy' }` a comma and a new entry (keep the file's existing comma style): `{ text: 'Review Provenance', link: '/guides/review-provenance' }`.
3. Run `pnpm exec prettier --write docs/guides/review-provenance.md docs/.vitepress/config.mts`.
4. VALIDATE.
5. Commit: `docs(guides): add the review provenance guide`

### Task 36: Document `review.backend` and the receipt gate in the reference docs and AGENTS.md

**Depends on:** Task 14 | **Files:** `docs/reference/configuration.md`, `AGENTS.md` | **Category:** integration

1. In `docs/reference/configuration.md`, section `## \`review\``, add a row to the field table directly below the `model_tiers` row:

   ```markdown
   | `backend` | `"agent"` \| `"pipeline"` | No | Backend for a `full` review. Default `"agent"`: the reviewing session dispatches one reviewer per record. `"pipeline"` runs the coded review pipeline; if no runner resolves, the review runs on the agent backend and its receipt records `backend: "agent"`. See [Review Provenance](../guides/review-provenance.md). |
   ```

   and, in the JSON example of that section, add `"backend": "agent",` as the first key inside the `"review"` object. Run `pnpm exec prettier --write docs/reference/configuration.md` so the table columns realign.

2. In `AGENTS.md`, add a new subsection directly above the `### Post-Ship Rollback (circuit breaker)` heading:

   ```markdown
   ### Review receipts and tiers

   Every review the pipeline runs writes a typed **receipt** that a coded gate recomputes, so a review that ran fewer reviewers than it claims fails instead of passing quietly (ADR [0139](docs/knowledge/decisions/0139-review-receipts-are-claims-recomputed-by-gates.md)).

   - **Tiers.** `light` is one reviewer (`compliance-bug`). `full` is `compliance`, `bug`, `security`, `architecture` plus each conditional reviewer depth calibration activates, **one dispatch per reviewer, issued by the orchestrating session**. `selectReviewTier` (`packages/core/src/review/tier-selector.ts`) makes a phase `full` on a risk keyword, a package entry point, `high` complexity or `thorough` rigor. A session that cannot dispatch subagents runs `light` and records it; it never claims `full`.
   - **The final review is cold and full** (ADR [0140](docs/knowledge/decisions/0140-the-final-review-is-cold-and-full.md)): the diff from the merge base, every reviewer, no prior findings in any brief. `--fast` does not lower it.
   - **The gate.** `harness check-review-receipt <path>` and the `check_review_receipt` MCP tool (`packages/core/src/receipts/review-gate.ts`) fail on a missing receipt, a required reviewer that did not run, a findings file that is absent, invalid, shared or outside the recomputed diff, a stale head, and a `final` receipt that is not full and cold. It needs no model credential and is **not** part of `check_phase_gate`. Autopilot may not leave `REVIEW` or `FINAL_REVIEW` without a passing receipt; an override is recorded in `decisions[]`.
   - **Artifacts.** `.harness/sessions/<slug>/reviews/<moment>-<phase>/` holds `receipt.json` and one `<reviewerId>.json` per reviewer; a standalone review writes `.harness/reviews/<branch>-<head sha>/`. The older `phase-{N}-review.json` shapes are read, never written.
   - **Provenance stamp.** `harness review-provenance render --session <slug>` prints the block autopilot places in the PR body (`<!-- harness:review-provenance -->` markers, one row per review). `harness pre-merge-brief` shows it.
   - **Attribution.** Every blocking finding carries `findingClass` and `escapedFrom` (the earliest stage that should have caught it). `harness review-attribution record` appends them to the machine-local `.harness/metrics/review-attribution.jsonl`; `harness review-attribution report` prints counts by stage and class, and blocking findings per PR for standalone reviews of stamped PRs.
   - **Backend.** `review.backend` in `harness.config.json`: `"agent"` (default) or `"pipeline"`.

   Concepts: [`docs/knowledge/core/review-receipts.md`](docs/knowledge/core/review-receipts.md). Guide: [`docs/guides/review-provenance.md`](docs/guides/review-provenance.md). Spec: `docs/changes/shift-left-pipeline-fidelity/proposal.md`.
   ```

3. In the same file, in the CLI command list under "_Validation & Checks:_", add `` `check-review-receipt` `` after `` `check-phase-gate` ``; under "_Analysis & Intelligence:_", add `` `review-provenance`, `review-attribution` `` at the end of the list.
4. Run `pnpm exec prettier --write AGENTS.md` and check `git diff --stat AGENTS.md` shows only your additions (if prettier reflows unrelated lines, revert those hunks).
5. VALIDATE. The `agentsMap` check must still pass.
6. Commit: `docs: document review tiers, the receipt gate and review.backend`

### Task 37: Add the changeset

**Depends on:** none | **Files:** `.changeset/review-fidelity-receipts.md`

1. Run `pnpm run check:changesets`. Once Milestone A or B commits exist on the branch, observe it fail for the changed packages.
2. Create `.changeset/review-fidelity-receipts.md`:

   ```markdown
   ---
   '@harness-engineering/types': minor
   '@harness-engineering/core': minor
   '@harness-engineering/cli': minor
   ---

   feat: review receipts, a credential-free receipt gate, risk-tiered reviews and a provenance stamp (shift-left pipeline fidelity, Phase 1).

   - **Receipts.** Every review writes a typed `receipt.json` and one findings file per reviewer under `.harness/sessions/<slug>/reviews/<moment>-<phase>/` (standalone: `.harness/reviews/<branch>-<head sha>/`).
   - **Gate.** New `harness check-review-receipt <path>` and `check_review_receipt` MCP tool. They recompute HEAD, the diff's file set and each findings file, treat the receipt's fields as claims, and fail on a missing receipt, a required reviewer that did not run, a findings file that is absent, invalid or outside the diff, a stale head, and a final review that is not full and cold. No model credential is needed.
   - **Tiers.** New core export `selectReviewTier`: a phase review is `full` on a risk keyword, a package entry point, high complexity or thorough rigor, and `light` otherwise. The final review is always `full`. Autopilot now dispatches one reviewer per record instead of handing the whole review to one subagent, and a session that cannot dispatch records `tier: light`.
   - **Cold final review.** Autopilot's final review covers the diff from the merge base and gives reviewers no prior findings.
   - **Provenance.** New `harness review-provenance render --session <slug>` prints the stamp autopilot places in the PR body; `harness pre-merge-brief` shows it.
   - **Attribution.** `ReviewFinding` gains optional `findingClass` and `escapedFrom`. New `harness review-attribution record` and `harness review-attribution report`.
   - **Config.** New optional `review.backend`: `"agent"` (default) or `"pipeline"`.
   ```

3. Run `pnpm run check:changesets`. Observe pass. Run `pnpm exec prettier --check .changeset/review-fidelity-receipts.md`.
4. VALIDATE.
5. Commit: `chore: add changeset for review receipts`

### Task 38: Verify the phase end to end

**Depends on:** Task 23, Task 24, Task 31, Task 32, Task 33, Task 34, Task 35, Task 36, Task 37 | **Files:** none (verification only) | **Category:** integration

No source changes. If any step fails, fix it in the task that owns the file and add a fix commit there; do not patch around it here.

1. Run `pnpm turbo run build --filter=@harness-engineering/cli... --force`. The `--force` matters: the turbo cache is shared across worktrees, and a cache hit is not proof that this tree built.
2. Run the suites:

   ```bash
   pnpm --filter @harness-engineering/types exec vitest run
   pnpm --filter @harness-engineering/core exec vitest run tests/receipts tests/review
   pnpm --filter @harness-engineering/cli exec vitest run tests/commands/check-review-receipt.test.ts tests/commands/review-provenance.test.ts tests/commands/review-attribution.test.ts tests/commands/review-receipt-registration.test.ts tests/commands/pre-merge-brief-provenance.test.ts tests/commands/pre-merge-brief.test.ts tests/commands/setup-mcp.test.ts tests/commands/mcp-list-capabilities.test.ts tests/mcp tests/config/review-schema.test.ts tests/ci
   pnpm --filter @harness-engineering/skills exec vitest run
   ```

   Every suite must pass.

3. Run `pnpm exec turbo run typecheck --filter=@harness-engineering/types --filter=@harness-engineering/core --filter=@harness-engineering/cli`.
4. Run the generator checks: `pnpm run generate:barrels:check && pnpm run generate-docs --check && pnpm run generate:tool-catalog:check && pnpm run generate:plugin:check && pnpm run check:changesets`.
5. Smoke-run the built CLI against a real git repository (this is the only step that exercises real `git`):

   ```bash
   H=/Users/cwarner/Projects/iv/harness-engineering/packages/cli/dist/bin/harness.js
   S=$(mktemp -d) && cd "$S" && git init -q && git config user.email t@example.com && git config user.name t
   echo a > a.ts && git add a.ts && git commit -qm base && BASE=$(git rev-parse HEAD)
   echo b >> a.ts && git commit -qam change && HEAD_SHA=$(git rev-parse HEAD)
   D=.harness/sessions/s1/reviews/final-all && mkdir -p "$D"
   for r in compliance bug security architecture; do
     printf '{"schemaVersion":1,"reviewerId":"%s","examinedFiles":["a.ts"],"findings":[]}' "$r" > "$D/$r.json"
   done
   printf '{"schemaVersion":1,"moment":"final","tier":"full","backend":"agent","diff":{"base":"%s","head":"%s"},"coldContext":true,"priorFindingsSupplied":false,"reviewers":[{"id":"compliance","required":true,"ran":true,"findingsPath":"compliance.json"},{"id":"bug","required":true,"ran":true,"findingsPath":"bug.json"},{"id":"security","required":true,"ran":true,"findingsPath":"security.json"},{"id":"architecture","required":true,"ran":true,"findingsPath":"architecture.json"}],"blocking":0,"advisory":0}' "$BASE" "$HEAD_SHA" > "$D/receipt.json"

   node "$H" check-review-receipt "$D"; echo "exit=$?"                 # expect PASS, 4/4, exit=0
   env -u ANTHROPIC_API_KEY -u OPENAI_API_KEY -u GITHUB_TOKEN node "$H" check-review-receipt "$D"; echo "exit=$?"   # expect the same line, exit=0 (SC13)
   node "$H" review-provenance render --session s1                       # expect a block with one final-all row, 4/4
   node "$H" review-attribution record --receipt "$D"; echo "exit=$?"   # expect exit=0, 1 new record
   node "$H" review-attribution report                                   # expect 1 review, 0 blocking findings
   rm "$D/bug.json"
   node "$H" check-review-receipt "$D"; echo "exit=$?"                 # expect FAIL naming "bug" (SC3), exit=1
   node "$H" --json check-review-receipt "$D" | head -3                  # expect JSON with "pass": false
   node "$H" check-review-receipt "$S/nowhere"; echo "exit=$?"         # expect RECEIPT_MISSING (SC16), exit=1
   cd /Users/cwarner/Projects/iv/harness-engineering && rm -rf "$S"
   ```

   Record each observed exit code and first output line in the task report. Any difference from the expected comments is a defect.

6. Run `harness validate 2>&1 | head -1` and `harness check-deps`. The validate count must not exceed the Task 1 baseline; `check-deps` must pass.
7. Run `git status --short`. It must be clean: no untracked `.harness/reviews/` or `.harness/metrics/review-attribution.jsonl` (both are ignored), no stray generated diff.
8. Report the success-criteria walk in the task report, one line each for criteria 1 to 8, 13, 15 and 16, naming the test or smoke step that showed it. Criteria 1, 5 and 6 are shown by skill-text tests plus the gate; say so rather than claiming a pipeline run exercised them.

No commit unless a fix was needed.

## Traceability

| Truth     | Tasks                |
| --------- | -------------------- |
| 1 (SC1)   | 3, 28, 29, 38        |
| 2 (SC2)   | 3, 15, 20, 38        |
| 3 (SC3)   | 4, 15, 38            |
| 4 (SC4)   | 3, 15, 29            |
| 5 (SC5)   | 3, 26                |
| 6 (SC6)   | 9, 16, 30, 38        |
| 7 (SC7)   | 2, 4, 10, 18, 25, 27 |
| 8 (SC8)   | 11, 17, 18, 38       |
| 9 (SC13)  | 15, 38               |
| 10 (SC15) | 3, 6, 14, 15, 26, 28 |
| 11 (SC16) | 8, 15, 20, 38        |
| 12        | 5                    |
| 13        | 23                   |
| 14        | 26, 27, 28, 29, 30   |
| 15        | 13, 19, 31, 38       |

## Concerns

1. **Skeleton and NFR questions were not put to a human.** The planner was dispatched and cannot ask. Both are presented with the plan.
2. **Eleven assumptions fill points the spec leaves open** (A1 to A11 above). A3 (what a pipeline "runner" is), A4 (a `record` subcommand the spec does not name) and A10 (four extra gate conditions) change behaviour the spec describes; they deserve an explicit yes at sign-off.
3. **`light` will be rare in this repository.** `selectReviewTier` matches the existing risk keywords against diff content as well as paths. The list includes `token`, `session` and `compliance`, which appear in most diffs here, so most phases will select `full`. The spec's own problem statement notes that the depth tiers do not discriminate; the tier selector inherits that. This is as specified, and the evidence review (D9) is the place to tune the list.
4. **Three receipt fields remain unverified claims.** The gate does not recompute `diff.base` (for the final review it could: `git merge-base`), the conditional-reviewer set (it could run `calibrateDepth`), or a phase's entitlement to `light` (it would need complexity and rigor from the session). Each is beyond the spec's listed gate conditions. Recommendation: add the final-review base check as a follow-up, since a wrong base silently shrinks the cold review.
5. **The tier is still computed by the agent from prose.** The spec names no CLI or MCP surface for `selectReviewTier`. The skill carries the four rules and the function name, the same way Phase 3.5 depth calibration does today. An agent can mis-apply them; the result is visible on the stamp but not gated.
6. **Skill behaviour is tested as text.** SC1, SC5 and SC6 describe what an agent does. The plan tests the skill wording and the gate that would catch a deviation; it cannot run autopilot. The first real pipeline run after this phase is the true test.
7. **The plan has 38 tasks**, above the 20-task guideline. It is one plan with four milestone boundaries.
8. **`harness validate` cannot pass on this branch** (762 pre-existing issues at planning time; the brief said 761). Tasks compare against a recorded baseline. Success criterion 18 is therefore not claimed for Phase 1.
9. **Plan code was not compiled.** Typecheck and the tests are the arbiter. Likely adjustment points are named in the tasks: `logger` output streams in command tests (Tasks 15 and 17), TS2308 name collisions at the core barrel (Task 13), prettier reflow of nested skill lists (Tasks 26, 28, 29).

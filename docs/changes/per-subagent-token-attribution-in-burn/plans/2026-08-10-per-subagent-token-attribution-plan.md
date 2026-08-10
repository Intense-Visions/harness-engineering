# Plan: Per-subagent token attribution in burn

**Date:** 2026-08-10 | **Spec:** `docs/changes/per-subagent-token-attribution-in-burn/proposal.md` | **Tasks:** 14 | **Time:** ~70 min | **Integration Tier:** medium

**Revision 2 (2026-08-10)** — rewritten against the post-soundness-review spec. Six substantive changes: the `pre-migration` label replaces `unattributed` for legacy rows; the upgrade rule keys on `pre-migration`; `readRecords` accepts 7 or 9-or-more fields; `writeRecords` sanitises tab/CR/LF; there is exactly **one** real `fleet-command/SKILL.md` (the other three platform paths are symlinks — revision 1 would have clobbered them); and the `unattributed` row is exempt from the report's top-N cut and unit floor.

## Goal

`burn` records _whose_ spend each deduped assistant turn was — the main thread, a named subagent, subagent spend whose identity could not be read, or a legacy row of unknown provenance — and reports it by agent, so a fleet run can never be read as free.

## Observable Truths (Acceptance Criteria)

Each truth maps to the spec's Success Criteria (SC) and to the task(s) that deliver it.

1. **(SC1)** When a scan reads a transcript under a `subagents/` directory whose line carries `attributionAgent`, the system shall store that value as the record's `agent` and the line's `agentId` as its `agentId`. → Task 4
2. **(SC2)** When a scan reads subagent spend whose line carries no `attributionAgent`, the system shall store the record with `agent = 'unattributed'` and still count its units. → Task 4
3. **(SC3)** If a line is not subagent spend, then the system shall not label it `unattributed` — it is labelled `main`. → Task 4
4. **(SC4)** When a summary is built, the system shall emit an `agents` block in which every current-week record contributes to exactly one label; the published per-label integers sum to `wtd.units` within ±1 unit per label. → Task 6
5. **(SC5)** When subagent spend exists in the **current week** and none of it carries a readable label, the system shall set `attribution.degraded = true`; if the week's only unlabelled rows are `pre-migration` rows, the system shall **not** set it. → Task 6
6. **(SC6)** When `harness burn report` runs against a summary containing unattributed units, the system shall print those units as a visible caution line **and** render the `unattributed` row itself, even if that row falls outside the top-N cut or below the unit floor that elide other labels. → Task 8
7. **(SC7)** When a pre-migration 7-column `usage.tsv` is read, the system shall load every row (none discarded) with `agent = 'pre-migration'`, and a subsequent scan of a still-present transcript shall upgrade that row to its real label. → Tasks 2, 5
8. **(SC8)** When the fingerprint version is absent or older than 2, the system shall discard all fingerprints and re-read every transcript. → Task 3
9. **(SC9)** `harness-burn-hud`'s bin still imports nothing from `@harness-engineering/*` — `packages/burn/tests/bin-startup.test.ts` continues to pass. → Task 14 (no task adds a cross-package import to `packages/burn/src/`)
10. **(SC10)** No occurrence of the claim that subagent tokens "are not observable" remains in any shipped skill body or generated command file: `grep -rn "not observable" agents/skills .claude-plugin .cursor-plugin .codex-plugin .gemini-extension .antigravity-extension` returns nothing outside `soundness-review`. → Tasks 10, 11
11. **(SC11)** When `harness burn report` runs against a summary containing an `agents` block, the system shall print a "by agent" section listing each label with its units and percentage of the week; when the summary carries no `agents` block the system shall print no such section and shall not error. → Task 8
12. **(store reader tolerance)** When `readRecords` reads a row with more than nine fields, the system shall load it and ignore the extra fields; when it reads a row with any count other than exactly 7 or 9-or-more, the system shall discard it. → Task 2
13. **(store writer safety)** If a label or lane id contains a tab, carriage return or newline, then the system shall not write it verbatim — each such character becomes a single space before serialising. → Task 2
14. `pnpm --filter @harness-engineering/burn test`, `pnpm --filter @harness-engineering/cli exec vitest run src/commands/burn/`, `pnpm test:platform-parity`, `pnpm --filter @harness-engineering/skills exec vitest run tests/platform-parity.test.ts`, `pnpm generate:plugin:check`, `pnpm format:check`, `pnpm run generate-docs --check` and `harness validate` all pass. → Task 14

## Evidence (verified against the worktree, 2026-08-10)

| Claim                                                                       | Evidence                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `readRecords` discards any row without exactly 7 fields                     | `packages/burn/src/store.ts:183`                                                                                                                                                                                                                              |
| `writeRecords` emits 7 tab-separated fields                                 | `packages/burn/src/store.ts:196-202`                                                                                                                                                                                                                          |
| `readFingerprints` parses only a `#count` header                            | `packages/burn/src/store.ts:147-163`                                                                                                                                                                                                                          |
| `scan` already drops all fingerprints on a failed integrity gate            | `packages/burn/src/scan.ts:134-138`                                                                                                                                                                                                                           |
| `toRecord` drops every field except `requestId`/`timestamp`/`model`/`usage` | `packages/burn/src/scan.ts:59-85`                                                                                                                                                                                                                             |
| `parseTranscript` is first-write-wins with no upgrade path                  | `packages/burn/src/scan.ts:96-101`                                                                                                                                                                                                                            |
| Per-model rollup happens in the `idx === 0` branch of one pass              | `packages/burn/src/summary.ts:124-129`, emitted at `summary.ts:204-219`                                                                                                                                                                                       |
| `modelsSection` tolerates a summary written before per-model rollup         | `packages/cli/src/commands/burn/report.ts:126`, `report.ts:142`                                                                                                                                                                                               |
| There is exactly ONE real `fleet-command/SKILL.md`                          | `git ls-files -s` reports mode `100644` for `agents/skills/claude-code/fleet-command/SKILL.md` and mode `120000` (symlink) for `agents/skills/{codex,cursor,gemini-cli}/fleet-command`, all three pointing at blob `632e00a7b16bb8cdcdb277d95dff124bd21fada1` |
| The false claim lives at one line in that one file                          | `agents/skills/claude-code/fleet-command/SKILL.md:319`                                                                                                                                                                                                        |
| Only two generated command files embed the claim                            | `.gemini-extension/commands/fleet-command.toml:340`, `.antigravity-extension/commands/fleet-command.toml:340`                                                                                                                                                 |
| `.claude-plugin` / `.cursor-plugin` fleet-command files are stubs           | 40 and 34 lines respectively; frontmatter plus objective only, no rationalizations table. `.codex-plugin` has no `commands/` directory at all                                                                                                                 |
| The parity test follows symlinks, so one edit satisfies all platforms       | `agents/skills/tests/platform-parity.test.ts:103-104` compares with `readFileSync` (7881 assertions, currently green)                                                                                                                                         |
| `harness validate` is currently green in this worktree                      | Ran 2026-08-10: `v validation passed`                                                                                                                                                                                                                         |
| `packages/{types,core,cli}/dist` are absent in this worktree                | `pnpm generate:plugin:check` currently fails with `ERR_MODULE_NOT_FOUND` for `@harness-engineering/core/dist/index.mjs` until the CLI chain builds                                                                                                            |

## Uncertainties

- **[ASSUMPTION]** `isSidechain`, `agentId` and `attributionAgent` are undocumented Claude Code internals and may be renamed or removed by any release (spec, Assumptions). The two-signal shape assertion in Task 4 and the degradation flag in Task 6 are the mitigations; "attribution stopped working" is an expected failure mode, not a defect in this package.
- **[ASSUMPTION]** Main-thread lines never carry `attributionAgent` (spec, Assumptions). If this becomes false, Task 4's first classification rule would label main-thread spend as a subagent. Verified on this machine only.
- **[RESOLVED]** Tab / CR / LF inside a label or lane id. The spec now requires sanitising on write (`store.ts`, "Store" section): each such character becomes a single space. Delivered in Task 2. This closes what an earlier draft of this plan carried as an unmitigated risk.
- **[ASSUMPTION]** `agentId` is unique per dispatch inside the retained transcript window; a reused id undercounts lanes (spec, Assumptions).
- **[PLAN DECISION — needs review]** The spec does not state what a **9-or-more-column row with an empty `agent` field** should read as. It cannot stay empty: the "never empty" invariant is load-bearing for grouping. This plan reads it as `pre-migration` (the spec's "provenance unknown" bucket) rather than `unattributed`, because `unattributed` is defined as _subagent_ spend and feeds the degradation flag — defaulting a corrupt row there could raise a false "attribution is broken" alarm. Recorded in the handoff for review.
- **[DEFERRABLE]** Exact wording and colour of the degraded headline in the report (Task 9 carries a human-verify checkpoint for exactly this).
- **[DEFERRABLE]** `docs/roadmap.md`, `docs/roadmap.d/per-subagent-token-attribution-in-burn.md` and `docs/ideation/` also contain the phrase "not observable". They are internal roadmap prose quoting the defect, not shipped skill bodies or generated command files, so SC10 does not reach them and no task edits them.

## NFR Targets

None elicited. This phase was invoked non-interactively by autopilot, so the four NFR dimensions took their documented defaults: no new benchmark (`harness check-perf` budgets stand), `harness check-security` at its configured floor, no load-oriented benchmark, and failure paths covered by ordinary task tests. The degradation path (SC5, Task 6) and the migration path (SC7/SC8, Tasks 2, 3, 5) are already covered by ordinary failure-path tests in this plan.

## Change Specification (delta)

- **[ADDED]** `UsageRecord.agent` and `UsageRecord.agentId`. Label vocabulary: `main` | `<attributionAgent>` | `unattributed` | `pre-migration`.
- **[ADDED]** `AgentBlock` and `AttributionBlock` public types (including `pre_migration_units`); `Summary.agents` and `Summary.attribution`.
- **[ADDED]** A "by agent" section and a degraded-attribution headline in `harness burn report`, with `unattributed` exempt from the top-N cut and the unit floor.
- **[ADDED]** Sanitising of `agent` / `agentId` on write: tab, CR and LF each become a single space.
- **[MODIFIED]** `usage.tsv` rows are 9 tab-separated fields; `readRecords` accepts exactly 7 (legacy → `pre-migration`) or 9-or-more (extras ignored).
- **[MODIFIED]** `files.tsv` carries a `#version` header line after `#count`; a missing or older version forces a full rescan.
- **[MODIFIED]** `parseTranscript` dedup gains one exception: a `pre-migration` row is upgraded to any other label, and an upgrade is not counted as an add. Classification never produces `pre-migration` — that label can only come off disk.
- **[MODIFIED]** The `fleet-command` rationalization row's Reality column — its false premise is replaced, its design conclusion kept.
- **[REMOVED]** Nothing.

## File Map

```
MODIFY packages/burn/src/types.ts                      (UsageRecord +2 fields; AgentBlock; AttributionBlock; Summary +2 keys)
MODIFY packages/burn/src/store.ts                      (9-column sanitised write, 7-or-9+ read, STORE_VERSION, #version header)
MODIFY packages/burn/src/scan.ts                       (classification, isSubagentPath, version-triggered rescan, upgrade rule)
MODIFY packages/burn/src/summary.ts                    (agents + attribution rollup)
MODIFY packages/burn/src/index.ts                      (export AgentBlock, AttributionBlock)
MODIFY packages/burn/tests/helpers.ts                  (agentLine, Hud.writeSubagentTranscript)
MODIFY packages/burn/tests/robustness.test.ts          (record shape assertion gains agent/agentId)
MODIFY packages/burn/tests/concurrency.test.ts         (row field count 7 -> 9)
CREATE packages/burn/tests/store-attribution.test.ts   (migration + version header)
CREATE packages/burn/tests/scan-attribution.test.ts    (classification + upgrade)
CREATE packages/burn/tests/summary-attribution.test.ts (agents + attribution rollup)
MODIFY packages/cli/src/commands/burn/report.ts        (agentsSection + degraded headline)
MODIFY packages/cli/src/commands/burn/report.test.ts   (by-agent section, guards, caution, headline)
MODIFY agents/skills/claude-code/fleet-command/SKILL.md   (the ONE real file; the other three platforms are symlinks to this directory — do NOT touch them)
MODIFY .gemini-extension/commands/fleet-command.toml      (GENERATED — carries the claim at line 340)
MODIFY .antigravity-extension/commands/fleet-command.toml (GENERATED — carries the claim at line 340)
TOUCH  .claude-plugin/commands/fleet-command.md           (GENERATED stub — regenerated for consistency; does not carry the claim)
TOUCH  .cursor-plugin/commands/fleet-command.md           (GENERATED stub — regenerated for consistency; does not carry the claim)
MODIFY packages/burn/README.md                         (Attribution section)
CREATE .changeset/burn-subagent-attribution.md
```

## Skeleton

1. Types + store migration, sanitised write, version header (Tasks 1-3, ~14 min)
2. Classification + `pre-migration` upgrade (Tasks 4-5, ~10 min)
3. Rollup + public surface (Tasks 6-7, ~9 min)
4. Report surface, with `unattributed` never elided (Tasks 8-9, ~10 min)
5. Prose, manifests, docs, changeset, final gate (Tasks 10-14, ~27 min)

**Estimated total:** 14 tasks, ~70 minutes.

_Skeleton approved: auto — this phase was invoked non-interactively by autopilot, so the approval gate was taken as granted by the phase authorisation. Flagged in the handoff `concerns`._

## Repo constraints every task must respect

- **Node 22 only.** Write `PATH="/Users/cwarner/.nvm/versions/node/v22.20.0/bin:/opt/homebrew/bin:$PATH"` inline on every `pnpm` invocation, exactly as each task spells it out. The default Node breaks `better-sqlite3`'s native ABI and fails the pre-push hook intermittently.
- **Nothing under `packages/burn/src/` may import from `@harness-engineering/*`.** `packages/burn/tests/bin-startup.test.ts` asserts the bin's import graph; a stray import makes the statusline ~8x more expensive with no visible symptom.
- **There is exactly ONE real `fleet-command/SKILL.md`.** `agents/skills/{codex,cursor,gemini-cli}/fleet-command` are **symlinks** to `../claude-code/fleet-command` (git mode `120000`). Edit `agents/skills/claude-code/fleet-command/SKILL.md` and nothing else. Copying a file over a symlink would replace it with a real file and silently break the parity guarantee that `agents/skills/tests/platform-parity.test.ts` exists to hold.
- **Files under `.claude-plugin/`, `.cursor-plugin/`, `.gemini-extension/`, `.antigravity-extension/` are generated.** Never hand-edit; regenerate with `pnpm generate:plugin:all`, gated by `pnpm generate:plugin:check`.
- **A changeset is required** for every changed publishable package (`scripts/check-changesets.mjs`).
- **Shipped skill bodies must never cite internal roadmap, PR or issue numbers.**
- **CI also runs** `pnpm format:check` (prettier over `**/*.{ts,tsx,md,json}`), `pnpm run generate-docs --check`, and a coverage ratchet (burn's thresholds are 80% lines/functions/branches/statements).

## Tasks

### Task 1: Widen `UsageRecord` with `agent` and `agentId`

**Depends on:** none | **Files:** `packages/burn/src/types.ts`, `packages/burn/src/scan.ts`, `packages/burn/src/store.ts`, `packages/burn/tests/robustness.test.ts` | **Owns:** `packages/burn/src/types.ts`

_Four files, but three of the four edits are two lines each: the type change and its two call sites must land together or the package does not typecheck. The fourth is the assertion that pins the new shape._

1. In `packages/burn/tests/robustness.test.ts`, extend the expectation at the `defaults an absent model and absent token counts rather than failing` test (currently lines 112-119) so it pins the new record shape:

   ```ts
   expect(records.get('r')).toEqual({
     ts: '2026-08-06T00:00:00Z',
     model: 'unknown',
     out: 0,
     in: 0,
     cacheWrite: 0,
     cacheRead: 0,
     agent: 'main',
     agentId: '',
   });
   ```

2. Run and observe the failure:

   ```
   PATH="/Users/cwarner/.nvm/versions/node/v22.20.0/bin:/opt/homebrew/bin:$PATH" pnpm --filter @harness-engineering/burn exec vitest run tests/robustness.test.ts
   ```

3. In `packages/burn/src/types.ts`, replace the `UsageRecord` interface (lines 47-55) with:

   ```ts
   /** One deduped assistant turn, keyed by `requestId` in the store. */
   export interface UsageRecord {
     ts: string;
     model: string;
     out: number;
     in: number;
     cacheWrite: number;
     cacheRead: number;
     /**
      * `main`, a subagent's `attributionAgent`, `unattributed`, or `pre-migration`.
      * Never empty. See the label vocabulary decision in the spec.
      */
     agent: string;
     /** The dispatch this turn belonged to — one fleet lane. Empty for the main thread. */
     agentId: string;
   }
   ```

4. In `packages/burn/src/scan.ts`, inside the `toRecord` return literal (after `cacheRead:`), add the placeholder that classification replaces in Task 4:

   ```ts
       // Placeholder: every turn reads as main until classification lands.
       agent: 'main',
       agentId: '',
   ```

5. In `packages/burn/src/store.ts`, inside the `readRecords` record literal (after `cacheRead:`), add:

   ```ts
       // A 7-field row predates attribution: its provenance is unknown, which is
       // neither `main` (that would overstate the human) nor `unattributed`
       // (that is defined as SUBAGENT spend, and would fire the degradation
       // flag on history alone). It stays `pre-migration` until a rescan of the
       // still-present transcript relabels it.
       agent: 'pre-migration',
       agentId: '',
   ```

6. Run — observe pass, and observe the rest of the suite still green:

   ```
   PATH="/Users/cwarner/.nvm/versions/node/v22.20.0/bin:/opt/homebrew/bin:$PATH" pnpm --filter @harness-engineering/burn exec vitest run tests/robustness.test.ts
   PATH="/Users/cwarner/.nvm/versions/node/v22.20.0/bin:/opt/homebrew/bin:$PATH" pnpm --filter @harness-engineering/burn typecheck
   ```

7. Run: `harness validate`
8. Commit: `refactor(burn): widen UsageRecord with agent and agentId`

---

### Task 2: Store writes 9 sanitised columns and reads 7 or 9-or-more

**Depends on:** Task 1 | **Files:** `packages/burn/src/store.ts`, `packages/burn/tests/store-attribution.test.ts`, `packages/burn/tests/concurrency.test.ts` | **Owns:** `packages/burn/src/store.ts`

1. Create `packages/burn/tests/store-attribution.test.ts`:

   ```ts
   /**
    * The store migration from 7 to 9 columns.
    *
    * `readRecords` used to discard any row without exactly seven fields, so a
    * silent widening would have deleted the entire record store — the same
    * class of failure as the 2026-08-04 write race, but caused by a release
    * rather than a race. These tests pin the deal that makes the widening safe:
    * a legacy row survives, labelled honestly rather than dropped.
    */
   import { readFileSync, writeFileSync } from 'node:fs';

   import { afterEach, describe, expect, it } from 'vitest';

   import { readRecords, writeRecords } from '../src/store';
   import type { UsageRecord } from '../src/types';
   import { makeHud, type Hud } from './helpers';

   let hud: Hud | null = null;

   function newHud(): Hud {
     hud = makeHud();
     return hud;
   }

   afterEach(() => {
     hud?.cleanup();
     hud = null;
   });

   const LEGACY_ROW = 'legacy\t2026-08-06T00:00:00Z\tclaude-opus-5\t1\t2\t3\t4';

   describe('store — 7-to-9 column migration', () => {
     it('loads a legacy 7-column row as pre-migration rather than discarding it', () => {
       // Not `unattributed`: that label means SUBAGENT spend whose identity could
       // not be read, and most legacy rows are the main thread. Mislabelling
       // history would fire the degradation flag on a week that was fine.
       const h = newHud();
       writeFileSync(h.paths.usageTsv, `${LEGACY_ROW}\n`);
       const rec = readRecords(h.paths).get('legacy');
       expect(rec).toBeDefined();
       expect(rec!.agent).toBe('pre-migration');
       expect(rec!.agentId).toBe('');
       expect(rec!.out).toBe(1);
     });

     it('round-trips a 9-column row through write and read', () => {
       const h = newHud();
       const rec: UsageRecord = {
         ts: '2026-08-06T00:00:00Z',
         model: 'claude-opus-5',
         out: 1,
         in: 2,
         cacheWrite: 3,
         cacheRead: 4,
         agent: 'harness-task-executor',
         agentId: 'a6bbff57161b6ebb2',
       };
       writeRecords(h.paths, new Map([['req_1', rec]]));
       expect(readFileSync(h.paths.usageTsv, 'utf8').trim().split('\t')).toHaveLength(9);
       expect(readRecords(h.paths).get('req_1')).toEqual(rec);
     });

     it('loads a row with MORE than nine fields and ignores the extras', () => {
       // Forward tolerance: a future column addition must be survivable by a
       // reader that predates it, the same reversibility the wire contract has.
       const h = newHud();
       writeFileSync(
         h.paths.usageTsv,
         `${LEGACY_ROW}\tharness-task-executor\tlane-1\tsomething-from-the-future\n`
       );
       const rec = readRecords(h.paths).get('legacy')!;
       expect(rec.agent).toBe('harness-task-executor');
       expect(rec.agentId).toBe('lane-1');
     });

     it('still discards a row whose field count is neither 7 nor at least 9', () => {
       const h = newHud();
       writeFileSync(
         h.paths.usageTsv,
         `${[LEGACY_ROW, `${LEGACY_ROW}\teight`, 'short\trow'].join('\n')}\n`
       );
       expect([...readRecords(h.paths).keys()]).toEqual(['legacy']);
     });

     it('never loads an empty agent label', () => {
       // The `never empty` invariant is what every consumer groups on; an empty
       // label would open a nameless bucket nobody reads. A corrupt row falls to
       // `pre-migration` (provenance unknown), never to `unattributed`, which
       // would raise a false "attribution is broken" alarm.
       const h = newHud();
       writeFileSync(h.paths.usageTsv, `${LEGACY_ROW}\t\t\n`);
       expect(readRecords(h.paths).get('legacy')!.agent).toBe('pre-migration');
     });
   });

   describe('store — sanitising on write', () => {
     it('replaces a tab, CR or LF in a label or lane id with a single space', () => {
       // `usage.tsv` is positional. One stray tab in an undocumented upstream
       // field would shift every later column and make readRecords discard the
       // row — a silent, self-inflicted undercount.
       const h = newHud();
       writeRecords(
         h.paths,
         new Map([
           [
             'req_1',
             {
               ts: '2026-08-06T00:00:00Z',
               model: 'claude-opus-5',
               out: 1,
               in: 0,
               cacheWrite: 0,
               cacheRead: 0,
               agent: 'evil\tagent\nname\r',
               agentId: 'lane\t1',
             },
           ],
         ])
       );

       const row = readFileSync(h.paths.usageTsv, 'utf8').trim();
       expect(row.split('\n')).toHaveLength(1);
       expect(row.split('\t')).toHaveLength(9);

       const rec = readRecords(h.paths).get('req_1')!;
       expect(rec.agent).toBe('evil agent name ');
       expect(rec.agentId).toBe('lane 1');
     });
   });
   ```

2. Run — observe failures:

   ```
   PATH="/Users/cwarner/.nvm/versions/node/v22.20.0/bin:/opt/homebrew/bin:$PATH" pnpm --filter @harness-engineering/burn exec vitest run tests/store-attribution.test.ts
   ```

3. In `packages/burn/src/store.ts`, replace `readRecords` and `writeRecords` (lines 175-202) with:

   ```ts
   /**
    * requestId -> record.
    *
    * A 7-field row predates attribution and is loaded as `pre-migration` rather
    * than discarded: discarding would delete the entire pre-migration store.
    * Nine or more fields carry the label and the lane id, and anything past the
    * ninth is ignored — accepting `>= 9` rather than `=== 9` costs nothing today
    * and makes a future column addition survivable by a reader that predates it.
    * Any other field count is a torn write and is still discarded.
    */
   export function readRecords(paths: BurnPaths): Map<string, UsageRecord> {
     const records = new Map<string, UsageRecord>();
     if (!existsSync(paths.usageTsv)) return records;

     for (const line of readFileSync(paths.usageTsv, 'utf8').split('\n')) {
       if (!line) continue;
       const p = line.split('\t');
       if (p.length !== 7 && p.length < 9) continue;
       const agent = p.length >= 9 ? p[7]! : '';
       records.set(p[0]!, {
         ts: p[1]!,
         model: p[2]!,
         out: Number(p[3]) || 0,
         in: Number(p[4]) || 0,
         cacheWrite: Number(p[5]) || 0,
         cacheRead: Number(p[6]) || 0,
         // Never empty. A row of unknown provenance is `pre-migration`, not
         // `unattributed` — the latter is subagent spend and drives degradation.
         agent: agent || 'pre-migration',
         agentId: p.length >= 9 ? p[8]! : '',
       });
     }
     return records;
   }

   /**
    * `usage.tsv` is positional and tab-delimited, so a tab or newline inside an
    * undocumented upstream field would shift every later column and make the row
    * get discarded on the next read — a silent, self-inflicted undercount.
    * Observed values are agent slugs and hex ids, so this is expected to be a
    * no-op; it is here because the cost of being wrong is losing rows and the
    * cost of the guard is one `replace`.
    */
   function tsvSafe(value: string): string {
     return value.replace(/[\t\r\n]/g, ' ');
   }

   export function writeRecords(paths: BurnPaths, records: Map<string, UsageRecord>): void {
     const lines: string[] = [];
     for (const [id, r] of records) {
       lines.push(
         `${id}\t${r.ts}\t${r.model}\t${r.out}\t${r.in}\t${r.cacheWrite}\t${r.cacheRead}\t${tsvSafe(r.agent)}\t${tsvSafe(r.agentId)}\n`
       );
     }
     atomicWrite(paths.usageTsv, lines.join(''));
   }
   ```

4. In `packages/burn/tests/concurrency.test.ts` line 50, change the row width assertion (the store now writes nine fields):

   ```ts
   expect(row.split('\t')).toHaveLength(9); // no partial rows
   ```

5. Rebuild the standalone bin (`concurrency.test.ts` drives the built binary in real subprocesses) and run the full package suite — observe pass:

   ```
   PATH="/Users/cwarner/.nvm/versions/node/v22.20.0/bin:/opt/homebrew/bin:$PATH" pnpm --filter @harness-engineering/burn build
   PATH="/Users/cwarner/.nvm/versions/node/v22.20.0/bin:/opt/homebrew/bin:$PATH" pnpm --filter @harness-engineering/burn test
   ```

6. Run: `harness validate`
7. Commit: `feat(burn): widen usage.tsv to nine sanitised columns, reading seven as legacy`

---

### Task 3: Version the fingerprint header and force one full rescan

**Depends on:** Task 2 | **Files:** `packages/burn/src/store.ts`, `packages/burn/src/scan.ts`, `packages/burn/tests/store-attribution.test.ts` | **Owns:** `packages/burn/src/store.ts`

1. Append to `packages/burn/tests/store-attribution.test.ts` (and add `refresh` / `transcriptLine` / `hoursAgo` / `DEFAULT_WEEK` to the imports):

   ```ts
   describe('store — fingerprint version', () => {
     function seed(h: Hud): void {
       h.writeConfig({ week_reset: DEFAULT_WEEK });
       h.writeTranscript('a.jsonl', [transcriptLine('r1', hoursAgo(new Date(), 1), { out: 100 })]);
       refresh(h.paths);
     }

     it('writes the version header after the count header', () => {
       // Order matters: `scan.test.ts` asserts the FIRST line is the count.
       const h = newHud();
       seed(h);
       const lines = readFileSync(h.paths.filesTsv, 'utf8').split('\n');
       expect(lines[0]).toBe('#count\t1');
       expect(lines[1]).toBe('#version\t2');
     });

     it('re-reads every transcript when the version header is absent', () => {
       // The pre-migration store has no version line at all. Its fingerprints
       // describe rows that cannot carry the new columns, so they are dropped
       // exactly the way a failed integrity gate drops them.
       const h = newHud();
       seed(h);
       const kept = readFileSync(h.paths.filesTsv, 'utf8')
         .split('\n')
         .filter((l) => l && !l.startsWith('#version\t'));
       writeFileSync(h.paths.filesTsv, `${kept.join('\n')}\n`);

       expect(refresh(h.paths).scan.files_rescanned).toBeGreaterThan(0);
     });

     it('re-reads every transcript when the version header is older than the current format', () => {
       const h = newHud();
       seed(h);
       const patched = readFileSync(h.paths.filesTsv, 'utf8')
         .split('\n')
         .filter(Boolean)
         .map((l) => (l.startsWith('#version\t') ? '#version\t1' : l));
       writeFileSync(h.paths.filesTsv, `${patched.join('\n')}\n`);

       expect(refresh(h.paths).scan.files_rescanned).toBeGreaterThan(0);
     });

     it('does not rescan an unchanged transcript once the version is current', () => {
       const h = newHud();
       seed(h);
       expect(refresh(h.paths).scan.files_rescanned).toBe(0);
     });
   });
   ```

2. Run — observe failures:

   ```
   PATH="/Users/cwarner/.nvm/versions/node/v22.20.0/bin:/opt/homebrew/bin:$PATH" pnpm --filter @harness-engineering/burn exec vitest run tests/store-attribution.test.ts
   ```

3. In `packages/burn/src/store.ts`, above the `Fingerprints` interface (line 132), add:

   ```ts
   /**
    * On-disk record format version.
    *
    * Bump it whenever the column count changes. A fingerprint written under an
    * older version asserts "already scanned" over rows that cannot carry the
    * new columns, which would pin the whole store to its migration default
    * forever. Dropping those fingerprints makes the migration a stated event
    * — one full rescan — rather than a silent, permanent mislabelling.
    */
   export const STORE_VERSION = 2;
   ```

4. In the same file, extend the `Fingerprints` interface with:

   ```ts
   /** Format version asserted by the header, or null when absent (pre-migration). */
   version: number | null;
   ```

5. Rewrite `readFingerprints` and `writeFingerprints` (lines 147-173) to carry the version. Both early return and normal return must include it:

   ```ts
   export function readFingerprints(paths: BurnPaths): Fingerprints {
     const fingerprints = new Map<string, string>();
     let expected: number | null = null;
     let version: number | null = null;
     if (!existsSync(paths.filesTsv)) return { fingerprints, expected, version };

     for (const line of readFileSync(paths.filesTsv, 'utf8').split('\n')) {
       if (!line) continue;
       if (line.startsWith('#count\t')) {
         const n = Number(line.split('\t')[1]);
         if (Number.isFinite(n)) expected = n;
         continue;
       }
       if (line.startsWith('#version\t')) {
         const n = Number(line.split('\t')[1]);
         if (Number.isFinite(n)) version = n;
         continue;
       }
       const parts = line.split('\t');
       if (parts.length === 3) fingerprints.set(parts[0]!, `${parts[1]}\t${parts[2]}`);
     }
     return { fingerprints, expected, version };
   }

   export function writeFingerprints(
     paths: BurnPaths,
     seen: Map<string, string>,
     recordCount: number
   ): void {
     // Count first: the count/fingerprint pairing is what detects a gutted
     // store, and `scan.test.ts` pins it to the first line.
     const lines = [`#count\t${recordCount}\n`, `#version\t${STORE_VERSION}\n`];
     for (const [file, sig] of seen) lines.push(`${file}\t${sig}\n`);
     atomicWrite(paths.filesTsv, lines.join(''));
   }
   ```

6. In `packages/burn/src/scan.ts`, add `STORE_VERSION` to the existing import from `./store`, then replace the destructure at line 127 and add the version gate immediately after the integrity gate (after line 138):

   ```ts
   let { fingerprints, expected, version } = readFingerprints(paths);
   ```

   ```ts
   // A store written before the current format cannot be trusted to carry
   // the columns this code reads, so its fingerprints are dropped the same
   // way a failed integrity gate drops them: re-read every transcript.
   if (version === null || version < STORE_VERSION) fingerprints = new Map();
   ```

7. Run — observe pass:

   ```
   PATH="/Users/cwarner/.nvm/versions/node/v22.20.0/bin:/opt/homebrew/bin:$PATH" pnpm --filter @harness-engineering/burn test
   ```

8. Run: `harness validate`
9. Commit: `feat(burn): version the fingerprint header and force one migration rescan`

---

### Task 4: Classify each transcript line as main, named subagent, or unattributed

**Depends on:** Task 1 | **Files:** `packages/burn/src/scan.ts`, `packages/burn/tests/helpers.ts`, `packages/burn/tests/scan-attribution.test.ts` | **Owns:** `packages/burn/src/scan.ts`

1. In `packages/burn/tests/helpers.ts`, add a subagent-transcript writer to the `Hud` interface (after `writeTranscript`):

   ```ts
     /** Write a transcript under `<session>/subagents/`, where Claude Code puts dispatched agents. */
     writeSubagentTranscript(name: string, lines: string[]): void;
   ```

   and its implementation in the object returned by `makeHud` (after `writeTranscript`):

   ```ts
       writeSubagentTranscript(name, lines) {
         const dir = path.join(projectDir, 'session', 'subagents');
         mkdirSync(dir, { recursive: true });
         writeFileSync(path.join(dir, name), `${lines.join('\n')}\n`);
       },
   ```

   and, at the end of the file, a line builder that adds the identity fields:

   ```ts
   /**
    * A transcript line carrying Claude Code's identity fields.
    *
    * `fields` is applied verbatim so a test can omit one signal and assert the
    * other still classifies — that independence is the whole point of the
    * two-signal shape assertion.
    */
   export function agentLine(
     requestId: string,
     when: Date,
     fields: { isSidechain?: boolean; agentId?: string; attributionAgent?: string },
     opts: { model?: string; out?: number; in?: number; cw?: number; cr?: number } = {}
   ): string {
     const base = JSON.parse(transcriptLine(requestId, when, opts)) as Record<string, unknown>;
     for (const [k, v] of Object.entries(fields)) {
       if (v !== undefined) base[k] = v;
     }
     return JSON.stringify(base);
   }
   ```

2. Create `packages/burn/tests/scan-attribution.test.ts`:

   ```ts
   /**
    * Whose spend was it.
    *
    * `burn` already walked into `subagents/` and already counted these units;
    * what it threw away was the identity on the line. Each case here is one of
    * the populations that must stay separable, plus the rule that keeps a lost
    * label from ever reading as free.
    */
   import path from 'node:path';

   import { afterEach, describe, expect, it } from 'vitest';

   import { parseTranscript } from '../src/scan';
   import type { UsageRecord } from '../src/types';
   import { agentLine, hoursAgo, makeHud, transcriptLine, type Hud } from './helpers';

   let hud: Hud | null = null;

   function newHud(): Hud {
     hud = makeHud();
     return hud;
   }

   afterEach(() => {
     hud?.cleanup();
     hud = null;
   });

   const SUB = path.join('session', 'subagents');

   describe('classification', () => {
     it('labels a named subagent turn with its agent type and lane id', () => {
       const h = newHud();
       h.writeSubagentTranscript('agent-a.jsonl', [
         agentLine('req_1', hoursAgo(new Date(), 1), {
           isSidechain: true,
           agentId: 'a6bbff57161b6ebb2',
           attributionAgent: 'harness-task-executor',
         }),
       ]);

       const records = new Map<string, UsageRecord>();
       parseTranscript(path.join(h.paths.projects, '-proj', SUB, 'agent-a.jsonl'), records);
       expect(records.get('req_1')!.agent).toBe('harness-task-executor');
       expect(records.get('req_1')!.agentId).toBe('a6bbff57161b6ebb2');
     });

     it('labels subagent spend with no readable agent as unattributed and still counts it', () => {
       // The requirement in one line: a CLI update must not be able to report a
       // fleet run as free. The units land in a visible bucket, never nowhere.
       const h = newHud();
       h.writeSubagentTranscript('agent-b.jsonl', [
         agentLine(
           'req_2',
           hoursAgo(new Date(), 1),
           { isSidechain: true, agentId: 'lane-2' },
           {
             out: 1000,
           }
         ),
       ]);

       const records = new Map<string, UsageRecord>();
       expect(
         parseTranscript(path.join(h.paths.projects, '-proj', SUB, 'agent-b.jsonl'), records)
       ).toBe(1);
       expect(records.get('req_2')!.agent).toBe('unattributed');
       expect(records.get('req_2')!.agentId).toBe('lane-2');
       expect(records.get('req_2')!.out).toBe(1000);
     });

     it('labels a main-thread turn main, never unattributed', () => {
       // A missing label must not collapse into `main`, and the reverse is just
       // as wrong: the human's own spend is not a broken subagent record.
       const h = newHud();
       h.writeTranscript('main.jsonl', [transcriptLine('req_3', hoursAgo(new Date(), 1))]);

       const records = new Map<string, UsageRecord>();
       parseTranscript(path.join(h.paths.projects, '-proj', 'main.jsonl'), records);
       expect(records.get('req_3')!.agent).toBe('main');
       expect(records.get('req_3')!.agentId).toBe('');
     });

     it('classifies a subagents/ file whose lines carry no isSidechain flag', () => {
       // Signal one of two: if Claude Code drops the flag, the path still classifies.
       const h = newHud();
       h.writeSubagentTranscript('agent-c.jsonl', [
         agentLine('req_4', hoursAgo(new Date(), 1), { agentId: 'lane-4' }),
       ]);

       const records = new Map<string, UsageRecord>();
       parseTranscript(path.join(h.paths.projects, '-proj', SUB, 'agent-c.jsonl'), records);
       expect(records.get('req_4')!.agent).toBe('unattributed');
     });

     it('classifies an isSidechain line that sits outside a subagents/ directory', () => {
       // Signal two of two: if Claude Code moves the directory, the flag still
       // classifies. Both signals must fail at once before attribution degrades.
       const h = newHud();
       h.writeTranscript('stray.jsonl', [
         agentLine('req_5', hoursAgo(new Date(), 1), { isSidechain: true }),
       ]);

       const records = new Map<string, UsageRecord>();
       parseTranscript(path.join(h.paths.projects, '-proj', 'stray.jsonl'), records);
       expect(records.get('req_5')!.agent).toBe('unattributed');
     });
   });
   ```

3. Run — observe failures:

   ```
   PATH="/Users/cwarner/.nvm/versions/node/v22.20.0/bin:/opt/homebrew/bin:$PATH" pnpm --filter @harness-engineering/burn exec vitest run tests/scan-attribution.test.ts
   ```

4. In `packages/burn/src/scan.ts`, add the identity fields to the `TranscriptLine` interface (after `timestamp`):

   ```ts
     /** Claude Code marks a dispatched subagent's turn with this flag. */
     isSidechain?: boolean;
     /** The individual dispatch this turn belonged to — one fleet lane. */
     agentId?: string;
     /** The agent TYPE, e.g. `harness-task-executor`. */
     attributionAgent?: string;
   ```

5. In the same file, add the path signal above `toRecord`:

   ```ts
   /**
    * Whether a transcript path is a dispatched subagent's.
    *
    * Two independent signals classify subagent spend — this path check and the
    * line's own `isSidechain` flag — because both are undocumented Claude Code
    * internals. Either one alone keeps classification working if the other
    * moves; both must change at once before attribution degrades.
    */
   export function isSubagentPath(file: string): boolean {
     return path.normalize(file).split(path.sep).includes('subagents');
   }
   ```

6. Replace the `toRecord` signature and the placeholder added in Task 1:

   ```ts
   /** One transcript line -> a record, or null when the line is not a usage turn. */
   function toRecord(
     line: string,
     isSubagentFile: boolean
   ): { id: string; record: UsageRecord } | null {
   ```

   and, just before the return, plus the two fields inside the record literal:

   ```ts
   const named = typeof obj.attributionAgent === 'string' ? obj.attributionAgent.trim() : '';
   const isSubagent = obj.isSidechain === true || isSubagentFile;
   // A missing label must never collapse into `main` — that would understate
   // the lanes and overstate the human.
   const agent = named !== '' ? named : isSubagent ? 'unattributed' : 'main';
   ```

   ```ts
         agent,
         agentId: agent === 'main' ? '' : (obj.agentId ?? ''),
   ```

7. Replace the body of `parseTranscript` up to the loop so the path signal is computed once per file:

   ```ts
     // Once per file, not once per line: the path does not change mid-file.
     const isSubagentFile = isSubagentPath(file);

     let added = 0;
     for (const line of text.split('\n')) {
       const parsed = toRecord(line, isSubagentFile);
   ```

8. Run — observe pass (the whole package, since `robustness.test.ts` also calls `parseTranscript`):

   ```
   PATH="/Users/cwarner/.nvm/versions/node/v22.20.0/bin:/opt/homebrew/bin:$PATH" pnpm --filter @harness-engineering/burn test
   ```

9. Run: `harness validate`
10. Commit: `feat(burn): classify each transcript line by the agent that spent it`

---

### Task 5: Upgrade a pre-migration record when a later read finds the label

**Depends on:** Task 3, Task 4 | **Files:** `packages/burn/src/scan.ts`, `packages/burn/tests/scan-attribution.test.ts` | **Owns:** `packages/burn/src/scan.ts`

1. Append to `packages/burn/tests/scan-attribution.test.ts` (adding `readFileSync`/`writeFileSync` from `node:fs`, `refresh` from `../src/refresh`, `readRecords` from `../src/store`, and `DEFAULT_WEEK` to the helper imports):

   ```ts
   describe('dedup with upgrade', () => {
     it('upgrades a pre-migration record when a later read finds the label', () => {
       const h = newHud();
       h.writeSubagentTranscript('agent-d.jsonl', [
         agentLine('req_6', hoursAgo(new Date(), 1), {
           isSidechain: true,
           agentId: 'lane-6',
           attributionAgent: 'harness-task-executor',
         }),
       ]);

       const records = new Map<string, UsageRecord>([
         [
           'req_6',
           {
             ts: '2026-08-06T00:00:00Z',
             model: 'claude-opus-5',
             out: 1,
             in: 0,
             cacheWrite: 0,
             cacheRead: 0,
             agent: 'pre-migration',
             agentId: '',
           },
         ],
       ]);

       // An upgrade is not an add: counting it would make the record count
       // disagree with the store it describes.
       expect(
         parseTranscript(path.join(h.paths.projects, '-proj', SUB, 'agent-d.jsonl'), records)
       ).toBe(0);
       expect(records.get('req_6')!.agent).toBe('harness-task-executor');
       expect(records.get('req_6')!.agentId).toBe('lane-6');
     });

     it('upgrades a pre-migration record to unattributed when that is all the line offers', () => {
       // The rule is `pre-migration -> anything`, not `-> a named agent`. A
       // legacy row that turns out to be unlabelled subagent spend must reach
       // the bucket that drives the degradation flag, or a broken transcript
       // shape would hide behind history.
       const h = newHud();
       h.writeSubagentTranscript('agent-g.jsonl', [
         agentLine('req_9', hoursAgo(new Date(), 1), { isSidechain: true, agentId: 'lane-9' }),
       ]);

       const records = new Map<string, UsageRecord>([
         [
           'req_9',
           {
             ts: '2026-08-06T00:00:00Z',
             model: 'claude-opus-5',
             out: 1,
             in: 0,
             cacheWrite: 0,
             cacheRead: 0,
             agent: 'pre-migration',
             agentId: '',
           },
         ],
       ]);

       parseTranscript(path.join(h.paths.projects, '-proj', SUB, 'agent-g.jsonl'), records);
       expect(records.get('req_9')!.agent).toBe('unattributed');
     });

     it('never overwrites an unattributed record — only pre-migration is upgradable', () => {
       // First-write-wins still holds in every direction but the one that heals.
       // `unattributed` is a CURRENT observation, not a missing one, so it is
       // not up for revision by a later overlapping transcript.
       const h = newHud();
       h.writeSubagentTranscript('agent-e.jsonl', [
         agentLine('req_7', hoursAgo(new Date(), 1), {
           isSidechain: true,
           agentId: 'lane-7',
           attributionAgent: 'harness-task-executor',
         }),
       ]);

       const records = new Map<string, UsageRecord>([
         [
           'req_7',
           {
             ts: '2026-08-06T00:00:00Z',
             model: 'claude-opus-5',
             out: 1,
             in: 0,
             cacheWrite: 0,
             cacheRead: 0,
             agent: 'unattributed',
             agentId: 'lane-7',
           },
         ],
       ]);

       parseTranscript(path.join(h.paths.projects, '-proj', SUB, 'agent-e.jsonl'), records);
       expect(records.get('req_7')!.agent).toBe('unattributed');
     });

     it('heals a store migrated from the 7-column format on the first rescan', () => {
       // End to end: the migration relabels every row whose transcript is still
       // on disk, so nobody is pinned to `pre-migration` by a release.
       const h = newHud();
       h.writeConfig({ week_reset: DEFAULT_WEEK });
       h.writeSubagentTranscript('agent-f.jsonl', [
         agentLine('req_8', hoursAgo(new Date(), 1), {
           isSidechain: true,
           agentId: 'lane-8',
           attributionAgent: 'harness-task-executor',
         }),
       ]);
       refresh(h.paths);

       // Rewind the store to the pre-migration shape: 7 columns, no #version.
       const legacyRows = readFileSync(h.paths.usageTsv, 'utf8')
         .split('\n')
         .filter(Boolean)
         .map((r) => r.split('\t').slice(0, 7).join('\t'));
       writeFileSync(h.paths.usageTsv, `${legacyRows.join('\n')}\n`);
       const legacyFingerprints = readFileSync(h.paths.filesTsv, 'utf8')
         .split('\n')
         .filter((l) => l && !l.startsWith('#version\t'));
       writeFileSync(h.paths.filesTsv, `${legacyFingerprints.join('\n')}\n`);

       expect(readRecords(h.paths).get('req_8')!.agent).toBe('pre-migration');
       refresh(h.paths);
       expect(readRecords(h.paths).get('req_8')!.agent).toBe('harness-task-executor');
     });
   });
   ```

2. Run — observe failures:

   ```
   PATH="/Users/cwarner/.nvm/versions/node/v22.20.0/bin:/opt/homebrew/bin:$PATH" pnpm --filter @harness-engineering/burn exec vitest run tests/scan-attribution.test.ts
   ```

3. In `packages/burn/src/scan.ts`, replace the body of the `parseTranscript` loop:

   ```ts
   for (const line of text.split('\n')) {
     const parsed = toRecord(line, isSubagentFile);
     if (!parsed) continue;
     const existing = records.get(parsed.id);
     if (existing) {
       // First write wins, with exactly one exception: a row that NEVER carried
       // a label — a `pre-migration` row read off a 7-column store — is
       // replaced once a read produces any real label. Without it, every
       // migrated row would stay `pre-migration` forever even though its
       // transcript is still on disk. The rule is deliberately narrow:
       // classification never yields `pre-migration`, so ordinary dedup across
       // overlapping transcripts keeps first-write-wins untouched, and an
       // `unattributed` row (a current observation, not a missing one) is never
       // revised. An upgrade is not an add — counting it would make the record
       // count disagree with the store it describes.
       if (existing.agent === 'pre-migration' && parsed.record.agent !== 'pre-migration') {
         records.set(parsed.id, parsed.record);
       }
       continue;
     }
     records.set(parsed.id, parsed.record);
     added += 1;
   }
   ```

4. Update the `parseTranscript` doc comment above `toRecord` (lines 50-57) so it states the exception rather than plain first-write-wins.
5. Run — observe pass:

   ```
   PATH="/Users/cwarner/.nvm/versions/node/v22.20.0/bin:/opt/homebrew/bin:$PATH" pnpm --filter @harness-engineering/burn test
   ```

6. Run: `harness validate`
7. Commit: `feat(burn): upgrade pre-migration records once a rescan finds the label`

---

### Task 6: Roll `agents` and `attribution` into the summary

**Depends on:** Task 4 | **Files:** `packages/burn/src/types.ts`, `packages/burn/src/summary.ts`, `packages/burn/tests/summary-attribution.test.ts` | **Owns:** `packages/burn/src/summary.ts`

1. Create `packages/burn/tests/summary-attribution.test.ts`:

   ```ts
   /**
    * Where the week's units went, by agent.
    *
    * Two properties carry the weight. The labels must PARTITION the week — if
    * they do not sum to the week's total, some spend is invisible and the
    * report is a lie of omission. And a week whose subagent spend carries no
    * readable label must say so: a silent zero would read as "no fleet ran".
    */
   import { afterEach, describe, expect, it } from 'vitest';

   import { refresh } from '../src/refresh';
   import { DEFAULT_WEEK, agentLine, hoursAgo, makeHud, transcriptLine, type Hud } from './helpers';

   let hud: Hud | null = null;

   function newHud(): Hud {
     hud = makeHud();
     return hud;
   }

   afterEach(() => {
     hud?.cleanup();
     hud = null;
   });

   describe('summary — agents block', () => {
     it('partitions the week across labels, within a unit of rounding per label', () => {
       // Each block rounds independently, so the published integers are asserted
       // to +/-1 unit per label — never as an exact integer sum.
       const h = newHud();
       const now = new Date();
       h.writeConfig({ week_reset: DEFAULT_WEEK });
       h.writeTranscript('main.jsonl', [transcriptLine('m1', hoursAgo(now, 1), { out: 333 })]);
       h.writeSubagentTranscript('agent-a.jsonl', [
         agentLine(
           's1',
           hoursAgo(now, 1),
           { isSidechain: true, agentId: 'lane-1', attributionAgent: 'harness-task-executor' },
           { out: 777 }
         ),
         agentLine('s2', hoursAgo(now, 1), { isSidechain: true, agentId: 'lane-2' }, { out: 111 }),
       ]);

       const s = refresh(h.paths);
       const labels = Object.keys(s.agents);
       expect(labels.sort()).toEqual(['harness-task-executor', 'main', 'unattributed']);

       const summed = labels.reduce((acc, k) => acc + s.agents[k]!.units, 0);
       expect(Math.abs(summed - s.wtd.units)).toBeLessThanOrEqual(labels.length);
     });

     it('counts distinct dispatches as lanes and reports zero lanes for main', () => {
       const h = newHud();
       const now = new Date();
       h.writeConfig({ week_reset: DEFAULT_WEEK });
       h.writeTranscript('main.jsonl', [transcriptLine('m1', hoursAgo(now, 1))]);
       h.writeSubagentTranscript('agent-a.jsonl', [
         agentLine('s1', hoursAgo(now, 1), {
           isSidechain: true,
           agentId: 'lane-1',
           attributionAgent: 'harness-task-executor',
         }),
         agentLine('s2', hoursAgo(now, 1), {
           isSidechain: true,
           agentId: 'lane-2',
           attributionAgent: 'harness-task-executor',
         }),
         agentLine('s3', hoursAgo(now, 1), {
           isSidechain: true,
           agentId: 'lane-2',
           attributionAgent: 'harness-task-executor',
         }),
       ]);

       const s = refresh(h.paths);
       expect(s.agents['harness-task-executor']!.lanes).toBe(2);
       expect(s.agents['harness-task-executor']!.requests).toBe(3);
       expect(s.agents.main!.lanes).toBe(0);
       expect(s.attribution.lanes).toBe(2);
       expect(s.attribution.main_units).toBeGreaterThan(0);
       expect(s.attribution.attributed_units).toBeGreaterThan(0);
     });

     it('reports degraded when subagent spend carries no readable label at all', () => {
       const h = newHud();
       const now = new Date();
       h.writeConfig({ week_reset: DEFAULT_WEEK });
       h.writeTranscript('main.jsonl', [transcriptLine('m1', hoursAgo(now, 1))]);
       h.writeSubagentTranscript('agent-a.jsonl', [
         agentLine('s1', hoursAgo(now, 1), { isSidechain: true, agentId: 'lane-1' }),
       ]);

       const s = refresh(h.paths);
       expect(s.attribution.degraded).toBe(true);
       expect(s.attribution.unattributed_units).toBeGreaterThan(0);
       expect(s.attribution.attributed_units).toBe(0);
     });

     it('does not report degraded while some subagent spend is still labelled', () => {
       const h = newHud();
       const now = new Date();
       h.writeConfig({ week_reset: DEFAULT_WEEK });
       h.writeSubagentTranscript('agent-a.jsonl', [
         agentLine('s1', hoursAgo(now, 1), {
           isSidechain: true,
           agentId: 'lane-1',
           attributionAgent: 'harness-task-executor',
         }),
         agentLine('s2', hoursAgo(now, 1), { isSidechain: true, agentId: 'lane-2' }),
       ]);

       expect(refresh(h.paths).attribution.degraded).toBe(false);
     });

     it('does not report degraded when there is no subagent spend to lose', () => {
       // No fleet ran. That is not a degraded scanner, and saying so would
       // train the reader to ignore the one alert that matters.
       const h = newHud();
       h.writeConfig({ week_reset: DEFAULT_WEEK });
       h.writeTranscript('main.jsonl', [transcriptLine('m1', hoursAgo(new Date(), 1))]);

       const s = refresh(h.paths);
       expect(s.attribution.degraded).toBe(false);
       expect(s.attribution.unattributed_units).toBe(0);
       expect(s.agents.main!.pct_of_week).toBeGreaterThan(0);
     });
   });

   describe('summary — pre-migration rows', () => {
     /** Seed a 7-column store with a current-week row and roll it up without a scan. */
     function legacyOnly(h: Hud, extraRows: string[] = []): Summary {
       h.writeConfig({ week_reset: DEFAULT_WEEK });
       const ts = hoursAgo(new Date(), 1).toISOString();
       writeFileSync(
         h.paths.usageTsv,
         `${[`old1\t${ts}\tclaude-opus-5\t500\t10\t0\t0`, ...extraRows].join('\n')}\n`
       );
       return recompute(h.paths);
     }

     it('files a legacy row under pre-migration, not under main or unattributed', () => {
       const h = newHud();
       const s = legacyOnly(h);
       expect(Object.keys(s.agents)).toEqual(['pre-migration']);
       expect(s.attribution.pre_migration_units).toBeGreaterThan(0);
       expect(s.attribution.main_units).toBe(0);
       expect(s.attribution.unattributed_units).toBe(0);
     });

     it('does not raise the degradation alarm on history alone', () => {
       // The whole reason `pre-migration` exists as a separate label: a store
       // full of legacy rows is not evidence that the transcript shape changed.
       const h = newHud();
       expect(legacyOnly(h).attribution.degraded).toBe(false);
     });

     it('does not let a legacy row suppress a real degradation alarm', () => {
       // The mirror failure: if `pre-migration` counted as attributed spend,
       // one legacy row would make `attributed === 0` false and silence the
       // alarm for a week whose subagent spend really did lose its labels.
       const h = newHud();
       const ts = hoursAgo(new Date(), 1).toISOString();
       const s = legacyOnly(h, [`sub1\t${ts}\tclaude-opus-5\t500\t10\t0\t0\tunattributed\tlane-1`]);
       expect(s.attribution.attributed_units).toBe(0);
       expect(s.attribution.degraded).toBe(true);
     });

     it('counts a lane once even when it appears under two labels', () => {
       // Possible mid-migration, via the upgrade rule. `attribution.lanes` is a
       // union across labels, deliberately not the sum of per-label lanes.
       const h = newHud();
       const ts = hoursAgo(new Date(), 1).toISOString();
       const s = legacyOnly(h, [
         `a\t${ts}\tclaude-opus-5\t100\t0\t0\t0\tharness-task-executor\tlane-1`,
         `b\t${ts}\tclaude-opus-5\t100\t0\t0\t0\tunattributed\tlane-1`,
       ]);
       expect(s.agents['harness-task-executor']!.lanes).toBe(1);
       expect(s.agents.unattributed!.lanes).toBe(1);
       expect(s.attribution.lanes).toBe(1);
     });
   });
   ```

   Add `writeFileSync` from `node:fs`, `recompute` from `../src/refresh` and `type Summary` from `../src/types` to this file's imports.

2. Run — observe failures:

   ```
   PATH="/Users/cwarner/.nvm/versions/node/v22.20.0/bin:/opt/homebrew/bin:$PATH" pnpm --filter @harness-engineering/burn exec vitest run tests/summary-attribution.test.ts
   ```

3. In `packages/burn/src/types.ts`, add after the `ModelBlock` interface:

   ```ts
   export interface AgentBlock {
     requests: number;
     units: number;
     pct_of_week: number;
     /**
      * Distinct non-empty `agentId`s seen this week under this label. `main`
      * records carry an empty `agentId`, so the empty id is excluded from the
      * count and `main` honestly reports 0.
      */
     lanes: number;
   }

   export interface AttributionBlock {
     attributed_units: number;
     main_units: number;
     unattributed_units: number;
     pre_migration_units: number;
     /**
      * Distinct non-empty `agentId`s seen in the current week across ALL labels.
      * A lane that appears under two labels (possible mid-migration, via the
      * upgrade rule) counts once, so this is not necessarily the sum of the
      * per-label `AgentBlock.lanes`.
      */
     lanes: number;
     /**
      * True when subagent spend was seen in the CURRENT WEEK and none of it
      * carried a readable agent label — the transcript shape changed and
      * attribution is no longer working. Degraded tooling is a headline, not a
      * footnote. `pre-migration` rows are excluded from the test: they are
      * legacy rows of unknown provenance, not evidence about the current
      * transcript shape, and letting them fire this flag would raise an alarm
      * about history on the very first upgraded scan.
      */
     degraded: boolean;
   }
   ```

   and, in the `Summary` interface, immediately after `models_exhausted: string[];`:

   ```ts
   agents: Record<string, AgentBlock>;
   attribution: AttributionBlock;
   ```

4. In `packages/burn/src/summary.ts`, add `AgentBlock` and `AttributionBlock` to the type import from `./types`, then declare the accumulator beside `perModel` (line 105):

   ```ts
   const perAgent = new Map<string, { requests: number; units: number; lanes: Set<string> }>();
   ```

5. Inside the `if (idx === 0)` branch (after the `perModel` update at line 129), add:

   ```ts
   // Defensive: a hand-edited store could carry an empty label, which would
   // open a nameless bucket nobody reads. It falls to `pre-migration` (the
   // provenance-unknown label), never to `unattributed` — the latter drives
   // the degradation alarm, and a corrupt row is not evidence of a broken
   // transcript shape. This matches the store reader's own fallback.
   const label = rec.agent || 'pre-migration';
   const a = perAgent.get(label) ?? { requests: 0, units: 0, lanes: new Set<string>() };
   a.requests += 1;
   a.units += u;
   // `main` carries an empty agentId, so it counts zero lanes.
   if (rec.agentId) a.lanes.add(rec.agentId);
   perAgent.set(label, a);
   ```

6. After the per-model block (after line 219), add the rollup:

   ```ts
   // ---- per-agent. Same shape as `models`, so an existing consumer reads it
   // without learning a second idiom.
   const agents: Record<string, AgentBlock> = {};
   for (const [label, a] of [...perAgent.entries()].sort((x, y) => y[1].units - x[1].units)) {
     agents[label] = {
       requests: a.requests,
       units: Math.round(a.units),
       pct_of_week: cur.units ? roundTo((100 * a.units) / cur.units, 1) : 0,
       lanes: a.lanes.size,
     };
   }

   const mainUnits = perAgent.get('main')?.units ?? 0;
   const unattributedUnits = perAgent.get('unattributed')?.units ?? 0;
   const preMigrationUnits = perAgent.get('pre-migration')?.units ?? 0;
   // Summed directly rather than subtracted from the week: a float residue from
   // subtraction would make the `=== 0` degradation test unreliable. Note that
   // `pre-migration` is excluded from BOTH sides — counting it as attributed
   // would let one legacy row suppress a real degradation alarm.
   let attributedUnits = 0;
   const allLanes = new Set<string>();
   for (const [label, a] of perAgent) {
     if (label !== 'main' && label !== 'unattributed' && label !== 'pre-migration') {
       attributedUnits += a.units;
     }
     // Union across labels, so a lane seen under two labels mid-migration
     // counts once. This is deliberately not the sum of per-label lanes.
     for (const id of a.lanes) allLanes.add(id);
   }

   const attribution: AttributionBlock = {
     attributed_units: Math.round(attributedUnits),
     main_units: Math.round(mainUnits),
     unattributed_units: Math.round(unattributedUnits),
     pre_migration_units: Math.round(preMigrationUnits),
     lanes: allLanes.size,
     // Subagent spend was seen in the current week and none of it carried a
     // readable label: the transcript shape changed and attribution has stopped
     // working. Legacy rows cannot raise this alarm — they are not evidence
     // about the current shape.
     degraded: unattributedUnits > 0 && attributedUnits === 0,
   };
   ```

7. In the returned object, immediately after `models_exhausted: exhausted,`, add:

   ```ts
       agents,
       attribution,
   ```

8. Run — observe pass:

   ```
   PATH="/Users/cwarner/.nvm/versions/node/v22.20.0/bin:/opt/homebrew/bin:$PATH" pnpm --filter @harness-engineering/burn test
   ```

9. Run: `harness validate`
10. Commit: `feat(burn): roll agent attribution into the weekly summary`

---

### Task 7: Export `AgentBlock` and `AttributionBlock` from the package barrel

**Depends on:** Task 6 | **Files:** `packages/burn/src/index.ts` | **Category:** integration

1. In `packages/burn/src/index.ts`, add `AgentBlock,` and `AttributionBlock,` to the existing `export type { … } from './types';` list, keeping it alphabetical (`AgentBlock`, `AttributionBlock`, `BudgetBlock`, …).
2. Rebuild and verify both names reach the published type surface:

   ```
   PATH="/Users/cwarner/.nvm/versions/node/v22.20.0/bin:/opt/homebrew/bin:$PATH" pnpm --filter @harness-engineering/burn build
   grep -c "AttributionBlock" packages/burn/dist/index.d.ts
   grep -c "AgentBlock" packages/burn/dist/index.d.ts
   ```

   Both greps must report a non-zero count.

3. Confirm the bin's import graph is untouched:

   ```
   PATH="/Users/cwarner/.nvm/versions/node/v22.20.0/bin:/opt/homebrew/bin:$PATH" pnpm --filter @harness-engineering/burn exec vitest run tests/bin-startup.test.ts
   ```

4. Run: `harness validate`
5. Commit: `feat(burn): export AgentBlock and AttributionBlock`

---

### Task 8: Render a "by agent" section in `harness burn report`

**Depends on:** Task 7 | **Files:** `packages/cli/src/commands/burn/report.ts`, `packages/cli/src/commands/burn/report.test.ts` | **Owns:** `packages/cli/src/commands/burn/report.ts`

1. Append to `packages/cli/src/commands/burn/report.test.ts`:

   ```ts
   describe('report — by agent', () => {
     const agents = {
       main: { requests: 100, units: 41_200_000, pct_of_week: 58, lanes: 0 },
       'harness-task-executor': { requests: 60, units: 18_900_000, pct_of_week: 27, lanes: 6 },
       unattributed: { requests: 8, units: 1_400_000, pct_of_week: 2, lanes: 3 },
     };
     const attribution = {
       attributed_units: 18_900_000,
       main_units: 41_200_000,
       unattributed_units: 1_400_000,
       pre_migration_units: 0,
       lanes: 9,
       degraded: false,
     };

     it('lists the week by agent, with lane counts for dispatched work', () => {
       const out = render({ agents, attribution });
       expect(out).toContain('by agent');
       expect(out).toContain('harness-task-executor');
       expect(out).toContain('18.9M');
       expect(out).toContain('27% of week, 6 lanes');
     });

     it('does not claim lanes for the main thread', () => {
       const out = render({ agents, attribution });
       expect(out).not.toContain('58% of week, 0 lanes');
     });

     it('reads a summary written before attribution existed without a section or a throw', () => {
       // Same tolerance `modelsSection` already has for a summary written
       // before per-model rollup: an older file must still render.
       expect(() => render()).not.toThrow();
       expect(render()).not.toContain('by agent');
     });

     it('omits an ordinary agent below the noise floor', () => {
       const out = render({
         agents: { 'claude-tiny-agent': { requests: 1, units: 12, pct_of_week: 0, lanes: 1 } },
       });
       expect(out).not.toContain('tiny-agent');
     });

     it('cautions, in units, about subagent spend it could not attribute', () => {
       // A fleet run must never be readable as free.
       const out = render({ agents, attribution });
       expect(out).toContain('1.4M units of subagent spend could not be attributed');
     });
   });

   describe('report — unattributed is never elided', () => {
     // The two elisions `modelsSection` applies (top-6 slice, 1000-unit floor)
     // are exactly how a small or low-ranked unattributed bucket would vanish,
     // which is the "a fleet run reads as free" failure this section exists to
     // prevent. `pre-migration` is history, not a live signal, so it keeps them.
     function withUnattributed(units: number, extra: Record<string, unknown> = {}) {
       return {
         agents: {
           ...extra,
           unattributed: { requests: 1, units, pct_of_week: 0, lanes: 1 },
         },
         attribution: {
           attributed_units: 0,
           main_units: 0,
           unattributed_units: units,
           pre_migration_units: 0,
           lanes: 1,
           degraded: false,
         },
       };
     }

     it('renders an unattributed row below the unit floor that hides other labels', () => {
       const out = render(withUnattributed(12));
       expect(out).toContain('unattributed');
       expect(out).toContain('could not be attributed');
     });

     it('renders an unattributed row ranked below the top-N cut', () => {
       const ranked = Object.fromEntries(
         Array.from({ length: 8 }, (_, i) => [
           `agent-${i}`,
           { requests: 1, units: 9_000_000 - i, pct_of_week: 10, lanes: 1 },
         ])
       );
       const out = render(withUnattributed(1_400_000, ranked));
       expect(out).toContain('unattributed');
       // ...and the ordinary cut still applies to everything else.
       expect(out).not.toContain('agent-7');
     });

     it('still applies the cut and the floor to pre-migration', () => {
       const out = render({
         agents: { 'pre-migration': { requests: 1, units: 12, pct_of_week: 0, lanes: 0 } },
       });
       expect(out).not.toContain('pre-migration');
     });
   });
   ```

2. Run — observe failures (the burn dist must be current first, since the CLI reads the built types):

   ```
   PATH="/Users/cwarner/.nvm/versions/node/v22.20.0/bin:/opt/homebrew/bin:$PATH" pnpm --filter @harness-engineering/burn build
   PATH="/Users/cwarner/.nvm/versions/node/v22.20.0/bin:/opt/homebrew/bin:$PATH" pnpm --filter @harness-engineering/cli exec vitest run src/commands/burn/report.test.ts
   ```

3. In `packages/cli/src/commands/burn/report.ts`, add after `modelsSection` (line 146):

   ```ts
   /**
    * Per-agent. The pooled bar cannot tell you that a fleet run, not you, spent
    * the week — this is where a lane's cost becomes visible.
    *
    * Guarded exactly like `modelsSection`: a summary written before attribution
    * existed carries no `agents` key and must render without throwing. It
    * borrows that function's cosmetics but NOT its two elisions for the
    * `unattributed` row — see below.
    */
   function agentsSection(s: Summary): string[] {
     const all = Object.entries(s.agents ?? {});
     if (all.length === 0) return [];

     // `unattributed` is exempt from the top-N cut and the unit floor. Applying
     // either would let a small — or merely seventh-ranked — unattributed bucket
     // vanish, which is precisely the "a fleet run reads as free" failure this
     // section exists to prevent. `pre-migration` takes the ordinary cut and
     // floor: it is history, not a live signal.
     const kept = new Set(
       all
         .filter(([name]) => name !== 'unattributed')
         .slice(0, 6)
         .filter(([, e]) => e.units >= 1000)
         .map(([name]) => name)
     );
     if ((s.agents?.unattributed?.units ?? 0) > 0) kept.add('unattributed');

     const out = ['', `  ${chalk.bold('by agent')}`];
     // Iterate `all`, which summary.ts already sorted by units descending, so an
     // exempt row keeps its true rank rather than being appended at the bottom.
     for (const [name, e] of all) {
       if (!kept.has(name)) continue;
       const lanes = e.lanes > 0 ? `, ${e.lanes} lane${e.lanes === 1 ? '' : 's'}` : '';
       out.push(
         `  ${pad(name)}${human(e.units).padStart(8)} ${chalk.dim(
           `(${Math.round(e.pct_of_week)}% of week${lanes})`
         )}`
       );
     }

     const unattributed = s.attribution?.unattributed_units ?? 0;
     if (unattributed > 0) {
       out.push(
         '',
         chalk.yellow(
           `  ⚠ ${human(unattributed)} units of subagent spend could not be attributed to an agent.`
         )
       );
     }
     return out;
   }
   ```

4. In `renderReport`, add `...agentsSection(s),` immediately after `...modelsSection(s),`.
5. Run — observe pass:

   ```
   PATH="/Users/cwarner/.nvm/versions/node/v22.20.0/bin:/opt/homebrew/bin:$PATH" pnpm --filter @harness-engineering/cli exec vitest run src/commands/burn/report.test.ts
   ```

6. Run: `harness validate`
7. Commit: `feat(cli): show burn spend by agent in the report`

---

### Task 9: Escalate degraded attribution to a headline `[checkpoint:human-verify]`

**Depends on:** Task 8 | **Files:** `packages/cli/src/commands/burn/report.ts`, `packages/cli/src/commands/burn/report.test.ts` | **Owns:** `packages/cli/src/commands/burn/report.ts`

1. Append to `packages/cli/src/commands/burn/report.test.ts`:

   ```ts
   describe('report — degraded attribution', () => {
     const degradedAgents = {
       main: { requests: 100, units: 41_200_000, pct_of_week: 97, lanes: 0 },
       unattributed: { requests: 8, units: 1_400_000, pct_of_week: 3, lanes: 3 },
     };

     it('escalates a fully degraded attribution to a headline naming the cause', () => {
       // Degraded tooling is a headline, not a footnote: "0 subagent units"
       // and "attribution stopped working" look identical from the outside.
       const out = render({
         agents: degradedAgents,
         attribution: {
           attributed_units: 0,
           main_units: 41_200_000,
           unattributed_units: 1_400_000,
           pre_migration_units: 0,
           lanes: 3,
           degraded: true,
         },
       });
       expect(out).toContain('ATTRIBUTION IS DEGRADED');
       expect(out).toContain('transcript');
       expect(out).not.toContain('could not be attributed to an agent.');
     });

     it('keeps the softer caution when only some spend is unattributed', () => {
       const out = render({
         agents: {
           ...degradedAgents,
           'harness-task-executor': { requests: 6, units: 5_000_000, pct_of_week: 10, lanes: 2 },
         },
         attribution: {
           attributed_units: 5_000_000,
           main_units: 41_200_000,
           unattributed_units: 1_400_000,
           pre_migration_units: 0,
           lanes: 5,
           degraded: false,
         },
       });
       expect(out).not.toContain('ATTRIBUTION IS DEGRADED');
       expect(out).toContain('could not be attributed to an agent.');
     });
   });
   ```

2. Run — observe failures:

   ```
   PATH="/Users/cwarner/.nvm/versions/node/v22.20.0/bin:/opt/homebrew/bin:$PATH" pnpm --filter @harness-engineering/cli exec vitest run src/commands/burn/report.test.ts
   ```

3. In `packages/cli/src/commands/burn/report.ts`, replace the `if (unattributed > 0) { … }` block added in Task 8 with the exclusive pair:

   ```ts
   const unattributed = s.attribution?.unattributed_units ?? 0;
   if (s.attribution?.degraded) {
     // Every subagent unit this week lost its label. That is a broken scanner,
     // not a quiet week, and the two are indistinguishable from the numbers.
     out.push(
       '',
       chalk.red('  ⚠ ATTRIBUTION IS DEGRADED — subagent spend was seen this week and none of'),
       chalk.red('    it carried a readable agent label. The transcript shape has most likely'),
       chalk.red('    changed; read the breakdown above as unavailable, not as zero.')
     );
   } else if (unattributed > 0) {
     out.push(
       '',
       chalk.yellow(
         `  ⚠ ${human(unattributed)} units of subagent spend could not be attributed to an agent.`
       )
     );
   }
   ```

4. Run — observe pass:

   ```
   PATH="/Users/cwarner/.nvm/versions/node/v22.20.0/bin:/opt/homebrew/bin:$PATH" pnpm --filter @harness-engineering/cli exec vitest run src/commands/burn/report.test.ts
   ```

5. `[checkpoint:human-verify]` — Print both renderings and show them to the human before committing:

   ```
   PATH="/Users/cwarner/.nvm/versions/node/v22.20.0/bin:/opt/homebrew/bin:$PATH" pnpm --filter @harness-engineering/cli exec vitest run src/commands/burn/report.test.ts --reporter=verbose
   ```

   Ask: does the "by agent" section and the degraded headline read the way the spec's mock-up intends (labels, unit column alignment, lane parenthetical, colour severity)? Wait for confirmation.

6. Run: `harness validate`
7. Commit: `feat(cli): headline a degraded burn attribution instead of a footnote`

---

### Task 10: Correct the `fleet-command` claim in the one real skill body

**Depends on:** none | **Files:** `agents/skills/claude-code/fleet-command/SKILL.md` | **Category:** integration | **Owns:** `agents/skills/claude-code/fleet-command/**`

_**One file.** `agents/skills/{codex,cursor,gemini-cli}/fleet-command` are **symlinks** to `../claude-code/fleet-command` (git mode `120000`, all pointing at blob `632e00a7b16bb8cdcdb277d95dff124bd21fada1`). Editing the `claude-code` file is what changes all four platform paths. **Do not copy anything over the symlinks** — that would replace them with real files and silently break the parity guarantee the platform test exists to hold._

1. In `agents/skills/claude-code/fleet-command/SKILL.md` line 319, replace **only the Reality cell** of the rationalization row (the row whose first cell is `"The token budget is the real constraint, so the governor should meter tokens"`). The row becomes:

   ```
   | "The token budget is the real constraint, so the governor should meter tokens" | Per-subagent token spend _is_ observable after the fact — each dispatched agent writes its own transcript, and the burn scanner attributes spend to it. What is not available is a pre-flight reservation: attribution is retrospective and machine-local, so it cannot refuse a dispatch before it happens. The budget governs slots, passes, fleets, and wall-clock because those are the levers that bind _before_ the spend, and says so. |
   ```

   The rationalization (first cell) is unchanged, and the design conclusion — the budget meters slots, not tokens — is kept. No roadmap, PR or issue number appears in the new text; this body ships to adopter projects.

2. Normalise the reformatted table with prettier:

   ```
   PATH="/Users/cwarner/.nvm/versions/node/v22.20.0/bin:/opt/homebrew/bin:$PATH" pnpm exec prettier --write agents/skills/claude-code/fleet-command/SKILL.md
   ```

3. Confirm nothing turned a symlink into a real file. All three must still report mode `120000`:

   ```
   git ls-files -s agents/skills/codex/fleet-command agents/skills/cursor/fleet-command agents/skills/gemini-cli/fleet-command
   ```

4. Verify parity still holds (the test reads through the symlinks with `readFileSync`, so one edit satisfies every platform) and that the false claim is gone from every skill body:

   ```
   PATH="/Users/cwarner/.nvm/versions/node/v22.20.0/bin:/opt/homebrew/bin:$PATH" pnpm --filter @harness-engineering/skills exec vitest run tests/platform-parity.test.ts
   PATH="/Users/cwarner/.nvm/versions/node/v22.20.0/bin:/opt/homebrew/bin:$PATH" pnpm test:platform-parity
   grep -rn "not observable" agents/skills/claude-code/fleet-command/
   ```

   Both suites must pass and the grep must return nothing (exit 1).

5. Confirm `git status --short` lists exactly one changed path under `agents/skills/` — `agents/skills/claude-code/fleet-command/SKILL.md`. Any other entry means a symlink was clobbered; restore it with `git checkout -- <path>` before continuing.
6. Run: `harness validate`
7. Commit: `docs(fleet-command): correct the claim that subagent tokens are unobservable`

---

### Task 11: Regenerate the plugin and extension command files

**Depends on:** Task 10 | **Files:** `.gemini-extension/commands/fleet-command.toml`, `.antigravity-extension/commands/fleet-command.toml`, `.claude-plugin/commands/fleet-command.md`, `.cursor-plugin/commands/fleet-command.md` | **Category:** integration

_These are generated artifacts and must never be hand-edited. Only `.gemini-extension` and `.antigravity-extension` actually embed the corrected prose (line 340 in each); the `.claude-plugin` / `.cursor-plugin` files are 40- and 34-line stubs that carry the description and objective but no rationalizations table, and `.codex-plugin` has no `commands/` directory at all. All targets are regenerated together for consistency. The generator drives the built CLI, and this worktree has no `packages/{types,core,cli}/dist`, so the build is a prerequisite — one command with no decisions in it, but several minutes on a cold worktree._

1. Build the CLI and its dependency chain under Node 22:

   ```
   PATH="/Users/cwarner/.nvm/versions/node/v22.20.0/bin:/opt/homebrew/bin:$PATH" pnpm exec turbo run build --filter=@harness-engineering/cli...
   ```

2. Regenerate every target and verify freshness:

   ```
   PATH="/Users/cwarner/.nvm/versions/node/v22.20.0/bin:/opt/homebrew/bin:$PATH" pnpm generate:plugin:all
   PATH="/Users/cwarner/.nvm/versions/node/v22.20.0/bin:/opt/homebrew/bin:$PATH" pnpm generate:plugin:check
   ```

3. Verify the corrected prose reached the two files that carry the claim, and that the claim is gone everywhere:

   ```
   grep -rn "not observable" .claude-plugin .cursor-plugin .codex-plugin .gemini-extension .antigravity-extension
   grep -rln "pre-flight reservation" .gemini-extension/commands/fleet-command.toml .antigravity-extension/commands/fleet-command.toml
   ```

   The first grep must return nothing; the second must list both paths. Do not assert the phrase in the `.claude-plugin` / `.cursor-plugin` stubs — they never contained the claim and will not contain the correction.

4. Run: `harness validate`
5. Commit: `chore(plugin): regenerate fleet-command manifests`

---

### Task 12: Document attribution in the burn README

**Depends on:** Task 6 | **Files:** `packages/burn/README.md` | **Category:** integration

1. In `packages/burn/README.md`, insert a new `## Attribution` section between `## Units` (ends line 53) and `## Design rules` (line 55):

   ```markdown
   ## Attribution

   Every deduped turn carries the identity of whoever spent it, so the week can be read
   by agent and not only by model.

   | Label           | What it means                                                                                                |
   | --------------- | ------------------------------------------------------------------------------------------------------------ |
   | `main`          | Your own thread. Carries no lane id, so it reports zero lanes.                                               |
   | `<agent type>`  | A dispatched subagent, named by its `attributionAgent` (e.g. `harness-task-executor`).                       |
   | `unattributed`  | **Subagent** spend whose identity could not be read. Counted, never dropped, never folded into `main`.       |
   | `pre-migration` | A row written before this feature existed. Provenance unknown; upgraded to a real label on the first rescan. |

   `unattributed` is a real bucket, not an error state. A subagent's identity fields are
   undocumented Claude Code internals, so a Claude Code release can stop them being
   readable at any time — and a CLI update must not be able to report a fleet run as free.
   When subagent spend exists in the current week and _none_ of it carries a readable
   label, the summary sets `attribution.degraded` and the report says so in a headline:
   "no fleet ran" and "the scanner stopped working" are indistinguishable from the numbers
   alone. In the report the `unattributed` row is exempt from the top-N cut and the unit
   floor that elide other labels — a bucket that can vanish cannot do its job.

   `pre-migration` is deliberately its own label rather than a shade of `unattributed`.
   Most legacy rows are main-thread spend, so calling them unattributed would be a false
   claim about history _and_ would fire the degradation alarm on the first upgraded scan.
   They are excluded from the degradation test in both directions: they cannot raise it,
   and they cannot suppress it.

   A `lane` is one dispatch, counted as a distinct `agentId`. `attribution.lanes` is the
   union across labels, so a lane seen under two labels mid-migration counts once — it is
   not the sum of the per-label counts. Attribution is **retrospective**: it reads
   transcripts a subagent has already written, so it can measure spend but can never
   reserve it before a dispatch happens.

   A `burn` older than this change reading a 9-column store discards every row. That is
   accepted rather than mitigated: the integrity gate then re-reads every transcript, and
   this store is a rolling local cache reconstructible from source, not a system of record.
   ```

2. Add a row to the `## Tests` table (after `budgets & models`):

   ```markdown
   | attribution | subagent spend reading as zero, or collapsing into the main thread |
   | migration | a store widening discarding every legacy row, or pinning it to the wrong label |
   ```

3. Format and verify:

   ```
   PATH="/Users/cwarner/.nvm/versions/node/v22.20.0/bin:/opt/homebrew/bin:$PATH" pnpm exec prettier --write packages/burn/README.md
   PATH="/Users/cwarner/.nvm/versions/node/v22.20.0/bin:/opt/homebrew/bin:$PATH" pnpm exec prettier --check packages/burn/README.md
   ```

4. Run: `harness validate`
5. Commit: `docs(burn): document the attribution labels and the migration behaviour`

---

### Task 13: Add the changeset

**Depends on:** Task 9, Task 12 | **Files:** `.changeset/burn-subagent-attribution.md` | **Category:** integration

1. Create `.changeset/burn-subagent-attribution.md`:

   ```markdown
   ---
   '@harness-engineering/burn': minor
   '@harness-engineering/cli': patch
   ---

   feat(burn): attribute token spend to the subagent that spent it

   `UsageRecord` gains `agent` and `agentId`, `usage.tsv` widens from 7 to 9 columns
   (7-column rows still load, labelled `pre-migration`; the reader also tolerates any
   future extra columns), and `files.tsv` gains a `#version` header that forces one full
   rescan on upgrade — after which every row whose transcript is still on disk is
   relabelled with its real agent.

   `Summary` gains additive `agents` and `attribution` blocks, and `harness burn report`
   gains a "by agent" section in which the `unattributed` row is never elided. Subagent
   spend whose identity cannot be read is reported as `unattributed` units, never as zero;
   when none of the current week's subagent spend carries a readable label, the report
   headlines that attribution is degraded.

   Note for downgrades: a `burn` older than this change reading a 9-column store discards
   every row. The integrity gate then re-reads every transcript, so the loss is bounded to
   rows whose transcripts have already been pruned.
   ```

2. Verify the gate is satisfied:

   ```
   PATH="/Users/cwarner/.nvm/versions/node/v22.20.0/bin:/opt/homebrew/bin:$PATH" pnpm check:changesets
   ```

3. Run: `harness validate`
4. Commit: `chore: add changeset for burn subagent attribution`

---

### Task 14: Full gate run and real-data verification `[checkpoint:human-verify]`

**Depends on:** Task 11, Task 13 | **Files:** none (verification only)

1. Build everything under Node 22:

   ```
   PATH="/Users/cwarner/.nvm/versions/node/v22.20.0/bin:/opt/homebrew/bin:$PATH" pnpm exec turbo run build --filter=@harness-engineering/cli... --filter=@harness-engineering/burn
   ```

2. Run every gate CI runs, in order, and record each result:

   ```
   PATH="/Users/cwarner/.nvm/versions/node/v22.20.0/bin:/opt/homebrew/bin:$PATH" pnpm --filter @harness-engineering/burn test
   PATH="/Users/cwarner/.nvm/versions/node/v22.20.0/bin:/opt/homebrew/bin:$PATH" pnpm --filter @harness-engineering/burn exec vitest run tests/bin-startup.test.ts
   PATH="/Users/cwarner/.nvm/versions/node/v22.20.0/bin:/opt/homebrew/bin:$PATH" pnpm --filter @harness-engineering/cli exec vitest run src/commands/burn/
   PATH="/Users/cwarner/.nvm/versions/node/v22.20.0/bin:/opt/homebrew/bin:$PATH" pnpm test:platform-parity
   PATH="/Users/cwarner/.nvm/versions/node/v22.20.0/bin:/opt/homebrew/bin:$PATH" pnpm --filter @harness-engineering/skills exec vitest run tests/platform-parity.test.ts
   PATH="/Users/cwarner/.nvm/versions/node/v22.20.0/bin:/opt/homebrew/bin:$PATH" pnpm generate:plugin:check
   PATH="/Users/cwarner/.nvm/versions/node/v22.20.0/bin:/opt/homebrew/bin:$PATH" pnpm format:check
   PATH="/Users/cwarner/.nvm/versions/node/v22.20.0/bin:/opt/homebrew/bin:$PATH" pnpm run generate-docs --check
   PATH="/Users/cwarner/.nvm/versions/node/v22.20.0/bin:/opt/homebrew/bin:$PATH" pnpm --filter @harness-engineering/burn test:coverage
   harness validate
   harness check-deps
   ```

3. Confirm SC10 across every shipped surface at once, and that no symlink was clobbered:

   ```
   grep -rn "not observable" agents/skills .claude-plugin .cursor-plugin .codex-plugin .gemini-extension .antigravity-extension | grep -v soundness-review
   git ls-files -s agents/skills/codex/fleet-command agents/skills/cursor/fleet-command agents/skills/gemini-cli/fleet-command
   ```

   The grep must return nothing, and all three paths must still report mode `120000`.

4. `[checkpoint:human-verify]` — Run the real report against the developer's live HUD and show the output:

   ```
   PATH="/Users/cwarner/.nvm/versions/node/v22.20.0/bin:/opt/homebrew/bin:$PATH" node packages/cli/dist/bin/harness.js burn report
   ```

   This is the migration on real data: the first run drops every fingerprint, re-reads
   ~600 transcripts, rewrites `usage.tsv` at nine columns and relabels each row whose
   transcript survives. Show the human:
   - the "by agent" section, with at least one named agent and its lane count;
   - that `week to date` units did not move materially versus the pre-change value;
   - that the status is not `UNDERCOUNT` (which would mean rows were lost, not relabelled);
   - the `pre-migration` figure, if any. A large one means many rows' transcripts have
     already been pruned — expected and honest, not a defect;
   - that `ATTRIBUTION IS DEGRADED` did **not** fire. If it did, and named agents are
     visible in the same report, the degradation test is wrong — most likely
     `pre-migration` is leaking into the `attributed` sum.

   Ask for confirmation before finishing. If units moved or `UNDERCOUNT` appears, stop and
   report — that is the migration losing rows, which is the exact failure the `#version`
   gate exists to prevent.

5. No commit — verification only. If any gate needed a fix, commit the fix with a scoped message and re-run the whole list.

---

## Risks

| Risk                                                                                                      | Mitigation                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A `\t` or `\n` inside `attributionAgent`/`agentId` produces a wrong-width row that `readRecords` discards | Mitigated in Task 2: `writeRecords` replaces tab/CR/LF with a single space before serialising, with a test that asserts a one-line, nine-field row.      |
| The migration rescan loses rows on real data                                                              | Task 14's checkpoint compares week-to-date units before and after and rejects an `UNDERCOUNT` status.                                                    |
| `pre-migration` leaks into `attributed_units` and silences a real degradation alarm                       | Task 6 sums `attributed` directly over named labels only and carries a dedicated test; Task 14's checkpoint re-checks it against real data.              |
| A copy or write clobbers one of the three `fleet-command` symlinks, breaking platform parity              | Task 10 edits exactly one file, asserts the three symlinks still report git mode `120000`, and requires `git status` to list a single changed path.      |
| An older `burn` reads a 9-column store and discards every row                                             | Stated, not mitigated (spec Rollback decision). The integrity gate re-reads every transcript; the store is a rolling local cache, not a record of truth. |
| `pnpm generate:plugin:*` fails in a fresh worktree because `packages/{types,core,cli}/dist` are absent    | Task 11 step 1 builds the CLI dependency chain first. Verified failure mode: `ERR_MODULE_NOT_FOUND` for `@harness-engineering/core/dist/index.mjs`.      |
| Burn's coverage ratchet (80% across four metrics) trips on new uncovered branches                         | Every new branch has a test; Task 14 runs `test:coverage` explicitly rather than discovering it in CI.                                                   |
| An agent label containing markup or ANSI reaches the report                                               | `pad`/`human` render it as plain text; labels are agent slugs. Not mitigated further — out of the spec's scope.                                          |

## Parallelisation

Task 10 has no dependency on the TypeScript work and can run in parallel with Tasks 1-9. Task 12 depends only on Task 6. Everything else is a chain: 1 → 2 → 3 → 5, 1 → 4 → 5, 4 → 6 → 7 → 8 → 9, and 11 → 14 ← 13.

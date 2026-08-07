# Plan: Skill-Proposal Observability Command (`harness proposals status`)

**Date:** 2026-08-07 | **Spec:** `docs/changes/activate-skill-proposal-pipeline/proposal.md` (Phase 1 only) | **Tasks:** 5 | **Time:** ~20 min | **Integration Tier:** medium

## Goal

Add a provider-independent `harness proposals status` subcommand (default human table + `--json`) that reports, at a glance, whether each skill-proposal emission surface is live or dormant and why — reusing the runtime's own `envEnabled` flag predicate so the report cannot drift from behavior.

## Scope note

This plan covers **Phase 1 (Observability command) only** from the spec's Implementation Order. The operator guide (`docs/guides/skill-proposal-loop.md`), README correction, and changeset are **Phase 2** and are explicitly out of scope here.

## Observable Truths (Acceptance Criteria)

Traced from spec success criteria 1–4 and the Phase-1 slice of 7:

1. **OT1** — `runProposalsStatus(env, projectRoot)` exists and `harness proposals status` exits 0. In this repo (no proposals, no retrospection env) it reports `queue.total = 0` and `emitters.retrospection.enabled = false` with a `dormantReason` naming the missing `HARNESS_SESSION_RETROSPECTION` flag. _(observable: run the command)_
2. **OT2** — `harness proposals status --json` prints the exact `ProposalsStatusReport` shape and is valid JSON. _(observable: pipe through a JSON parser)_
3. **OT3** — With `HARNESS_SESSION_RETROSPECTION=1` and `ANTHROPIC_API_KEY=x` set, `status` reports `retrospection.enabled = true` and omits `dormantReason`. _(observable: run with env set)_
4. **OT4** — Unit tests cover `runProposalsStatus` across the enablement matrix (flag × provider) and queue tallying, plus the reused `envEnabled` predicate. _(observable: `vitest run`)_
5. **OT5** — `envEnabled` is a single source of truth: `packages/cli/src/mcp/tools/state.ts` and the new `status` path use the **same** predicate; no forked copy exists. _(observable: grep — exactly one `function envEnabled`/`export ... envEnabled` definition)_
6. **OT6** — `status` never imports `@harness-engineering/intelligence`; provider-resolvability is derived from env presence only. _(observable: grep the import graph of `runProposalsStatus`)_
7. **OT7 (Phase-1 slice)** — typecheck, lint, and the CLI build stay green; `docs/reference/cli-commands.md` is regenerated and contains `harness proposals status`. _(observable: gauntlet + doc diff)_

## Decision — D6 resolution (envEnabled reuse)

**Chosen: hoist `envEnabled` to a new shared module `packages/cli/src/utils/env-flag.ts`; re-import it from `state.ts`.** (Not: export from `state.ts`.)

Justification:

- Importing `envEnabled` **from** `state.ts` would drag the entire MCP-tools module graph (`resolveAnalysisProvider`, dynamic `@harness-engineering/orchestrator`/`core` imports, `event-emitter`, `roadmap-auto-sync`) into the lightweight `proposals status` path — directly contradicting the spec's "zero-dependency, safe to run anywhere" goal and risking a transitive `@harness-engineering/intelligence` pull (OT6).
- `packages/cli/src/utils/` already exists as the home for cross-cutting CLI helpers (`string.ts`, `output.ts`, `node-version.ts`) — the natural, dependency-free location.
- Single source of truth (D6, OT5): `state.ts` imports the hoisted function, so the predicate cannot fork.

The **provider-resolvability** check stays a small local helper in `proposals.ts` (env-presence only, mirroring `resolveAnalysisProvider`'s precedence: `ANTHROPIC_API_KEY` → else `HARNESS_ANALYSIS_BASE_URL`). It is intentionally **not** hoisted from `analysis-provider.ts`, because that module _constructs_ providers (and imports intelligence); a presence check cannot reuse it. D6 mandates a single source only for the flag predicate.

## Grounding (verified against the worktree)

- `envEnabled` currently lives at `packages/cli/src/mcp/tools/state.ts:22–26`; predicate = trimmed, lowercased value ∈ `{1, true, yes, on}`. Used at `state.ts:380` (flag checked **before** `resolveAnalysisProvider()`).
- `ProposalStatus` = `open | gate-running | gate-failed | approved | rejected` (`packages/types/src/proposals.ts:22–28`).
- `listProposals(projectRoot, { kind: 'skill' })` returns `[]` on `readdir` failure (`store.ts:145–149`); `getProposal` returns `null` on parse failure (`store.ts:129–131`) — so a missing/degraded store yields `total = 0` without throwing (spec edge cases).
- `resolveAnalysisProvider` precedence (`packages/cli/src/mcp/utils/analysis-provider.ts:55–62`): Anthropic (`ANTHROPIC_API_KEY`) → local (`HARNESS_ANALYSIS_BASE_URL`) → null.
- Existing action/core split to mirror: `runProposalsList` + `actListCommand` (`proposals.ts:43–50, 80–88`); subcommands registered in `createProposalsCommand()` (`proposals.ts:130–159`).
- `generate-docs.mjs` builds the CLI reference by importing `packages/cli/dist/index.js` (`createProgram`) and walking `program.commands` (`generate-docs.mjs:57–98`) — so the CLI **must be built** before regen; the new subcommand is auto-discovered.
- Existing tests: `packages/cli/tests/commands/proposals.test.ts` (pattern: `HARNESS_PROJECT_ROOT`-scoped tmpdir + `createProposal`).

## File Map

- CREATE `packages/cli/src/utils/env-flag.ts` — hoisted `envEnabled` predicate
- CREATE `packages/cli/tests/utils/env-flag.test.ts` — predicate unit tests
- MODIFY `packages/cli/src/mcp/tools/state.ts` — import `envEnabled` from shared module; remove local copy
- MODIFY `packages/cli/src/commands/proposals.ts` — `ProposalsStatusReport` type, `runProposalsStatus`, `actStatusCommand`, register `status` subcommand
- CREATE `packages/cli/tests/commands/proposals-status.test.ts` — matrix + queue-tally + action tests
- MODIFY `docs/reference/cli-commands.md` — regenerated (output of Task 5, not hand-edited)

## Skeleton

_Not produced — task count (5) is below the standard-mode threshold (8)._

## Uncertainties

- [ASSUMPTION] The human-table format is unspecified by the spec; the plan fixes a concrete compact format (below). If reviewers want a different layout, only Task 4's `actStatusCommand` printer changes — core + tests are unaffected.
- [DEFERRABLE] `harness validate` in this worktree may require a built CLI. Each task lists `pnpm --filter @harness-engineering/cli typecheck` + `vitest run <file>` as the binding gate; `harness validate` is run where available. Node 22 is required (`source ~/.nvm/nvm.sh && nvm use 22`).

---

## Tasks

> All tasks TDD. Run every node/pnpm command under Node 22: `source ~/.nvm/nvm.sh && nvm use 22` first.

### Task 1: Hoist `envEnabled` to a shared, dependency-free module (TDD)

**Depends on:** none | **Files:** `packages/cli/src/utils/env-flag.ts`, `packages/cli/tests/utils/env-flag.test.ts`

**Inputs:** existing predicate at `state.ts:22–26`.
**Outputs:** exported `envEnabled` with identical semantics; passing predicate tests.

1. CREATE `packages/cli/tests/utils/env-flag.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { envEnabled } from '../../src/utils/env-flag';

   describe('envEnabled', () => {
     it('is truthy for 1|true|yes|on, case-insensitive and trimmed', () => {
       for (const v of ['1', 'true', 'TRUE', 'Yes', 'on', 'ON', '  true  ']) {
         expect(envEnabled(v)).toBe(true);
       }
     });
     it('is falsy for undefined, empty, and non-affirmative values', () => {
       for (const v of [undefined, '', '0', 'false', 'no', 'off', 'maybe']) {
         expect(envEnabled(v)).toBe(false);
       }
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/cli exec vitest run tests/utils/env-flag.test.ts` — observe failure (module missing).
3. CREATE `packages/cli/src/utils/env-flag.ts`:

   ```ts
   /** Truthy env-flag test (`1`/`true`/`yes`/`on`, case-insensitive). */
   export function envEnabled(value: string | undefined): boolean {
     if (!value) return false;
     const v = value.trim().toLowerCase();
     return v === '1' || v === 'true' || v === 'yes' || v === 'on';
   }
   ```

4. Run the same test command — observe pass.
5. Run: `pnpm --filter @harness-engineering/cli typecheck`
6. Commit: `refactor(cli): hoist envEnabled flag predicate to shared utils`

### Task 2: Rewire `state.ts` to the shared predicate (remove the fork)

**Depends on:** Task 1 | **Files:** `packages/cli/src/mcp/tools/state.ts`

**Inputs:** `packages/cli/src/utils/env-flag.ts` (Task 1).
**Outputs:** `state.ts` has no local `envEnabled`; behavior byte-identical.

1. In `packages/cli/src/mcp/tools/state.ts`, DELETE the local block (lines ~21–26):

   ```ts
   /** Truthy env-flag test (`1`/`true`/`yes`, case-insensitive). */
   function envEnabled(value: string | undefined): boolean {
     if (!value) return false;
     const v = value.trim().toLowerCase();
     return v === '1' || v === 'true' || v === 'yes' || v === 'on';
   }
   ```

2. ADD an import near the top imports:

   ```ts
   import { envEnabled } from '../../utils/env-flag.js';
   ```

   (path: `mcp/tools/` → `../../utils/env-flag.js` = `src/utils/env-flag.ts`.)

3. Verify OT5: `grep -rn "function envEnabled\|export function envEnabled" packages/cli/src` returns exactly one definition (in `env-flag.ts`).
4. Run: `pnpm --filter @harness-engineering/cli typecheck`
5. Run existing state tests: `pnpm --filter @harness-engineering/cli exec vitest run tests/mcp` (or the state test path) — observe green (no behavior change).
6. Commit: `refactor(cli): use shared envEnabled in state.ts archive_session gate`

### Task 3: Add `ProposalsStatusReport` + `runProposalsStatus` core (TDD)

**Depends on:** Task 1 | **Files:** `packages/cli/src/commands/proposals.ts`, `packages/cli/tests/commands/proposals-status.test.ts`

**Inputs:** `listProposals`/`updateProposal` (already imported in `proposals.ts`), `envEnabled` (Task 1), `createProposal` (from `@harness-engineering/core`, test only).
**Outputs:** pure async `runProposalsStatus(env, projectRootPath)` returning the exact spec shape.

1. CREATE `packages/cli/tests/commands/proposals-status.test.ts`:

   ```ts
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import * as fs from 'node:fs';
   import * as path from 'node:path';
   import * as os from 'node:os';
   import { createProposal } from '@harness-engineering/core';
   import { runProposalsStatus } from '../../src/commands/proposals';

   const SKILL_INPUT = {
     kind: 'new-skill' as const,
     proposedBy: 'claude-code:harness-execution',
     justification: 'Recurring pattern across three sessions justifies a shared skill.',
     content: {
       name: 'auto-rename-helpers',
       description: 'Renames helper modules with import-path rewriting.',
       skillYaml: 'name: auto-rename-helpers\nversion: "0.1.0"\n',
       skillMd: '# Auto Rename Helpers\n',
     },
   };

   describe('runProposalsStatus — queue tallying', () => {
     let tmp: string;
     beforeEach(() => {
       tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-status-'));
     });
     afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

     it('reports total=0 on an empty/absent store without throwing', async () => {
       const r = await runProposalsStatus({}, tmp);
       expect(r.queue.total).toBe(0);
       expect(r.queue).toMatchObject({
         open: 0,
         gateRunning: 0,
         gateFailed: 0,
         approved: 0,
         rejected: 0,
       });
       expect(r.emitters.manualEmit).toEqual({
         surface: 'emit_skill_proposal',
         available: true,
       });
     });

     it('tallies open and rejected proposals by status', async () => {
       await createProposal(tmp, SKILL_INPUT);
       const p2 = await createProposal(tmp, {
         ...SKILL_INPUT,
         content: { ...SKILL_INPUT.content, name: 'second-skill' },
       });
       const { updateProposal } = await import('@harness-engineering/core');
       await updateProposal(tmp, p2.id, {
         status: 'rejected',
         decision: {
           decidedAt: new Date().toISOString(),
           decidedBy: 't',
           action: 'rejected',
           reason: 'dup',
         },
       });
       const r = await runProposalsStatus({}, tmp);
       expect(r.queue.total).toBe(2);
       expect(r.queue.open).toBe(1);
       expect(r.queue.rejected).toBe(1);
     });
   });

   describe('runProposalsStatus — enablement matrix (flag × provider)', () => {
     let tmp: string;
     beforeEach(() => {
       tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-status-'));
     });
     afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

     it('flag unset + no provider → dormant, reason names the flag', async () => {
       const r = await runProposalsStatus({}, tmp);
       const rp = r.emitters.retrospection;
       expect(rp).toMatchObject({ enabled: false, envFlagSet: false, providerResolvable: false });
       expect(rp.dormantReason).toContain('HARNESS_SESSION_RETROSPECTION');
     });

     it('flag set + no provider → dormant, reason names the provider', async () => {
       const r = await runProposalsStatus({ HARNESS_SESSION_RETROSPECTION: '1' }, tmp);
       const rp = r.emitters.retrospection;
       expect(rp).toMatchObject({ enabled: false, envFlagSet: true, providerResolvable: false });
       expect(rp.dormantReason).toMatch(/ANTHROPIC_API_KEY|HARNESS_ANALYSIS_BASE_URL|provider/);
     });

     it('flag unset + provider present → dormant, reason names the flag', async () => {
       const r = await runProposalsStatus({ ANTHROPIC_API_KEY: 'x' }, tmp);
       const rp = r.emitters.retrospection;
       expect(rp).toMatchObject({ enabled: false, envFlagSet: false, providerResolvable: true });
       expect(rp.dormantReason).toContain('HARNESS_SESSION_RETROSPECTION');
     });

     it('flag set + ANTHROPIC_API_KEY → enabled, no dormantReason', async () => {
       const r = await runProposalsStatus(
         { HARNESS_SESSION_RETROSPECTION: 'true', ANTHROPIC_API_KEY: 'x' },
         tmp
       );
       const rp = r.emitters.retrospection;
       expect(rp).toMatchObject({ enabled: true, envFlagSet: true, providerResolvable: true });
       expect(rp.dormantReason).toBeUndefined();
     });

     it('flag set + HARNESS_ANALYSIS_BASE_URL (local) → enabled via precedence', async () => {
       const r = await runProposalsStatus(
         {
           HARNESS_SESSION_RETROSPECTION: 'on',
           HARNESS_ANALYSIS_BASE_URL: 'http://127.0.0.1:11434/v1',
         },
         tmp
       );
       expect(r.emitters.retrospection.enabled).toBe(true);
       expect(r.emitters.retrospection.providerResolvable).toBe(true);
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/cli exec vitest run tests/commands/proposals-status.test.ts` — observe failure (`runProposalsStatus` missing).
3. MODIFY `packages/cli/src/commands/proposals.ts`:
   - Add import at top: `import { envEnabled } from '../utils/env-flag.js';`
   - Add the type + core function (place after `runProposalsShow`):

     ```ts
     export interface ProposalsStatusReport {
       queue: {
         open: number;
         gateRunning: number;
         gateFailed: number;
         approved: number;
         rejected: number;
         total: number;
       };
       emitters: {
         manualEmit: { surface: 'emit_skill_proposal'; available: true };
         retrospection: {
           enabled: boolean;
           envFlagSet: boolean;
           providerResolvable: boolean;
           dormantReason?: string;
         };
       };
     }

     /** Env-presence proxy for `resolveAnalysisProvider` precedence (Anthropic → local /v1). */
     function providerResolvable(env: NodeJS.ProcessEnv): boolean {
       if (env['ANTHROPIC_API_KEY']?.trim()) return true;
       if (env['HARNESS_ANALYSIS_BASE_URL']?.trim()) return true;
       return false;
     }

     export async function runProposalsStatus(
       env: NodeJS.ProcessEnv,
       projectRootPath: string
     ): Promise<ProposalsStatusReport> {
       const proposals = await listProposals(projectRootPath, { kind: 'skill' });
       const queue = {
         open: 0,
         gateRunning: 0,
         gateFailed: 0,
         approved: 0,
         rejected: 0,
         total: proposals.length,
       };
       for (const p of proposals) {
         switch (p.status) {
           case 'open':
             queue.open++;
             break;
           case 'gate-running':
             queue.gateRunning++;
             break;
           case 'gate-failed':
             queue.gateFailed++;
             break;
           case 'approved':
             queue.approved++;
             break;
           case 'rejected':
             queue.rejected++;
             break;
         }
       }

       const envFlagSet = envEnabled(env['HARNESS_SESSION_RETROSPECTION']);
       const resolvable = providerResolvable(env);
       const enabled = envFlagSet && resolvable;
       // Precedence mirrors the runtime (state.ts): flag checked before provider.
       let dormantReason: string | undefined;
       if (!envFlagSet) {
         dormantReason =
           'HARNESS_SESSION_RETROSPECTION is not set — session-terminus retrospection is opt-in';
       } else if (!resolvable) {
         dormantReason =
           'no analysis provider resolvable — set ANTHROPIC_API_KEY or HARNESS_ANALYSIS_BASE_URL';
       }

       return {
         queue,
         emitters: {
           manualEmit: { surface: 'emit_skill_proposal', available: true },
           retrospection: {
             enabled,
             envFlagSet,
             providerResolvable: resolvable,
             ...(dormantReason ? { dormantReason } : {}),
           },
         },
       };
     }
     ```

4. Run the test command from step 2 — observe pass.
5. Run: `pnpm --filter @harness-engineering/cli typecheck && pnpm --filter @harness-engineering/cli lint`
6. Commit: `feat(cli): add runProposalsStatus core reporting emitter enablement`

### Task 4: Add the action wrapper + register the `status` subcommand

**Depends on:** Task 3 | **Files:** `packages/cli/src/commands/proposals.ts`, `packages/cli/tests/commands/proposals-status.test.ts`

**Inputs:** `runProposalsStatus` (Task 3), the `projectRoot()` helper + `actListCommand` pattern.
**Outputs:** `harness proposals status [--json]` registered; exit code 0 always.

1. ADD a console-spy test to `packages/cli/tests/commands/proposals-status.test.ts` (new `describe` block):

   ```ts
   import { vi } from 'vitest';
   import { actStatusCommandForTest } from '../../src/commands/proposals';
   // If actStatusCommand is not exported, assert via the JSON path instead:

   describe('proposals status action', () => {
     const ORIG = process.env['HARNESS_PROJECT_ROOT'];
     let tmp: string;
     beforeEach(() => {
       tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-status-act-'));
       process.env['HARNESS_PROJECT_ROOT'] = tmp;
     });
     afterEach(() => {
       fs.rmSync(tmp, { recursive: true, force: true });
       if (ORIG !== undefined) process.env['HARNESS_PROJECT_ROOT'] = ORIG;
       else delete process.env['HARNESS_PROJECT_ROOT'];
       vi.restoreAllMocks();
     });

     it('--json prints a valid ProposalsStatusReport and exits 0', async () => {
       const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
       process.exitCode = 0;
       await actStatusCommandForTest({ json: true });
       const printed = spy.mock.calls.map((c) => String(c[0])).join('\n');
       const parsed = JSON.parse(printed);
       expect(parsed.queue.total).toBe(0);
       expect(parsed.emitters.manualEmit.available).toBe(true);
       expect(process.exitCode).toBe(0);
     });

     it('default (table) prints without throwing and exits 0', async () => {
       vi.spyOn(console, 'log').mockImplementation(() => {});
       process.exitCode = 0;
       await actStatusCommandForTest({});
       expect(process.exitCode).toBe(0);
     });
   });
   ```

   > If preferring not to add a test-only export, rename `actStatusCommandForTest` to the real `actStatusCommand` and export it. Keep whichever name; the test must import a real symbol.

2. Run the test — observe failure (symbol missing).
3. MODIFY `packages/cli/src/commands/proposals.ts` — add the action wrapper and register the subcommand. Export the action for testability:

   ```ts
   export async function actStatusCommand(opts: { json?: boolean }): Promise<void> {
     const report = await runProposalsStatus(process.env, projectRoot());
     if (opts.json) {
       console.log(JSON.stringify(report, null, 2));
       return;
     }
     const q = report.queue;
     const r = report.emitters.retrospection;
     console.log('Skill-proposal queue');
     console.log(
       `  open ${q.open}  gate-running ${q.gateRunning}  gate-failed ${q.gateFailed}` +
         `  approved ${q.approved}  rejected ${q.rejected}  (total ${q.total})`
     );
     console.log('Emitters');
     console.log('  manual emit (emit_skill_proposal): available');
     console.log(
       `  retrospection: ${r.enabled ? 'ENABLED' : 'dormant'}` +
         `  [flag ${r.envFlagSet ? 'set' : 'unset'}, provider ${r.providerResolvable ? 'resolvable' : 'unresolvable'}]`
     );
     if (r.dormantReason) console.log(`    reason: ${r.dormantReason}`);
     // Status is a report, never a gate: exit 0 always.
   }
   ```

   Register in `createProposalsCommand()` (before `return cmd;`):

   ```ts
   cmd
     .command('status')
     .description(
       'Report queue counts and whether each emission surface (manual emit, retrospection) is live or dormant'
     )
     .option('--json', 'Emit the machine-readable ProposalsStatusReport')
     .action(actStatusCommand);
   ```

   (Update the Task-4 test import to `actStatusCommand`.)

4. Run the test — observe pass.
5. Run: `pnpm --filter @harness-engineering/cli exec vitest run tests/commands/proposals-status.test.ts tests/commands/proposals.test.ts && pnpm --filter @harness-engineering/cli typecheck && pnpm --filter @harness-engineering/cli lint`
6. Commit: `feat(cli): register harness proposals status subcommand (table + --json)`

### Task 5: Regenerate the CLI reference [checkpoint:human-verify]

**Depends on:** Task 4 | **Files:** `docs/reference/cli-commands.md` | **Category:** integration

**Inputs:** built CLI (`generate-docs` imports `packages/cli/dist/index.js`).
**Outputs:** regenerated `docs/reference/cli-commands.md` containing `harness proposals status`.

1. Build the CLI so `dist/index.js` reflects the new subcommand:
   `pnpm --filter @harness-engineering/cli build`
2. Regenerate docs: `pnpm run generate-docs`
3. Verify freshness: `pnpm run generate-docs -- --check` (or `node scripts/generate-docs.mjs --check`) exits 0.
4. Verify content: `grep -n "proposals status" docs/reference/cli-commands.md` shows the new section.
5. Run `harness validate` if the CLI binary is available in this worktree; otherwise rely on the typecheck/lint/test gates from Tasks 1–4.
6. **[checkpoint:human-verify]** Show the operator the rendered human table (`harness proposals status`), the `--json` output, and the `docs/reference/cli-commands.md` diff. Confirm the table layout and dormant-reason wording read well before proceeding. Confirm no new file appeared under `.harness/proposals/` (`git status`).
7. Commit: `docs(cli): regenerate CLI reference for proposals status`

---

## Sequencing

- Task 1 → (Task 2 ∥ Task 3): Tasks 2 and 3 both depend only on Task 1 and touch disjoint files (`state.ts` vs `proposals.ts`), so they can run in parallel.
- Task 3 → Task 4 (same file, `proposals.ts`; sequential).
- Task 4 → Task 5 (needs the registered subcommand built into `dist`).

## Validation trace (truths → tasks)

| Observable truth                             | Delivered by                     |
| -------------------------------------------- | -------------------------------- |
| OT1 (core exists, dormant reason names flag) | Task 3                           |
| OT2 (`--json` valid shape)                   | Task 4                           |
| OT3 (flag + key → enabled)                   | Task 3 (matrix), Task 4 (wiring) |
| OT4 (matrix + tally + predicate tests)       | Tasks 1, 3, 4                    |
| OT5 (single envEnabled)                      | Tasks 1, 2                       |
| OT6 (no intelligence import)                 | Task 3 (D6 decision)             |
| OT7 (green + regenerated reference)          | Tasks 1–5                        |

## Out of scope (Phase 2/3)

`docs/guides/skill-proposal-loop.md`, README Skill Proposals bullet + ADR-link fix, changeset, full-build/baseline gauntlet, PR.

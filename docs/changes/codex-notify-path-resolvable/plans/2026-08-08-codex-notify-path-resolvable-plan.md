# Plan: Portable Codex notify command

**Date:** 2026-08-08 | **Spec:** `docs/changes/codex-notify-path-resolvable/proposal.md` | **Tasks:** 5 | **Time:** ~22 min | **Integration Tier:** small

## Goal

Make the generated Codex `notify` line machine-independent and committable by routing it through a new PATH-resolvable `harness hooks run session-retrospect-codex` command, without touching the already-portable Claude/Gemini/Cursor wiring.

## Observable Truths (Acceptance Criteria)

Mapped 1:1 to the spec's Success Criteria:

1. **Portable output.** After the generator runs in a project with `.codex/`, `.codex/config.toml` contains `notify = ["harness", "hooks", "run", "session-retrospect-codex"]` and no absolute filesystem path (no `/` outside the four command tokens). → Task 3
2. **Machine-independent.** The generated notify line is byte-identical when the generator runs from two different `projectDir` roots. → Task 3
3. **Functionally equivalent.** `harness hooks run session-retrospect-codex '<json>'` derives `sessionId = payload['thread-id'] || 'unknown'` and `cwd = payload.cwd || process.cwd()`, then delegates to the same `retrospectSession` core as the old `node .harness/hooks/session-retrospect-codex.js '<json>'` path; gated by `HARNESS_SESSION_RETROSPECTION`. → Tasks 1, 2 (archive behavior itself is inherited from the shared core, already proven by `session-retrospect-agents.test.ts`)
4. **Fail-soft.** Unknown `<name>`, missing/empty payload, malformed JSON, and any thrown error all exit 0 and never throw. → Task 2
5. **Idempotent + non-clobbering + in-place upgrade.** New-form line → `skipped`; foreign `notify` → `conflict` untouched; old absolute-path harness line (references `session-retrospect-codex.js`) → rewritten in place → `installed`. → Task 3
6. **Other agents unchanged.** Claude/Gemini/Cursor generated commands are byte-identical (their existing tests pass unmodified). → Task 3
7. `harness validate`, lint, typecheck, and the full CLI test suite pass. → Task 5

## NFR Targets

None elicited. This is a log-only, fail-soft hook with no hot path (no perf/scalability benchmark), no new untrusted-input surface beyond a JSON parse that is already fail-soft by contract (no new security floor), and its failure mode is already "silent exit 0" (resilience is the existing contract, covered by the Task 2 fail-soft tests). All four NFR dimensions default-skip; no NFR tasks emitted.

## Uncertainties

- **[ASSUMPTION]** `harness` is on `PATH` at Codex notify time (same assumption `.mcp.json` already makes). Documented in spec Assumptions; no task guards it (fail is silent and no worse than today).
- **[ASSUMPTION → resolved in Task 2]** A compiled-TS `run.ts` can cleanly `import` from the shipped plain-`.js` ESM `session-retrospect-core.js` under tsup/tsc. Task 2 determines this and picks the clean path; a documented fallback (inline the ~12-line parse in `run.ts`) exists, so it does not block.
- **[DEFERRABLE]** Re-running `harness update` to commit the now-portable `.codex/config.toml` is a post-merge manual step (spec "Post-merge follow-up"), explicitly out of this diff.

## File Map

- CREATE `packages/cli/src/commands/hooks/run.ts` (`createRunCommand` + testable `runHook`)
- MODIFY `packages/cli/src/commands/hooks/index.ts` (register `createRunCommand()`)
- MODIFY `packages/cli/src/hooks/session-retrospect-core.js` (add `parseCodexNotifyPayload`)
- MODIFY `packages/cli/src/hooks/session-retrospect-codex.js` (use helper; fix header note)
- MODIFY `packages/cli/src/hooks/agent-retrospect.ts` (`writeCodexNotifyHook` signature + 3-case rule + doc comment; `installAgentRetrospectHooks` call site)
- CREATE `packages/cli/tests/hooks/session-retrospect-core.test.ts` (helper unit tests)
- CREATE `packages/cli/tests/commands/hooks/run.test.ts` (dispatch + fail-soft + seam tests)
- MODIFY `packages/cli/tests/hooks/agent-retrospect.test.ts` (new Codex expectations)
- MODIFY `docs/reference/cli-commands.md` (regenerated, never hand-edited)

## Skeleton

Not produced — task count (5) is below the standard-mode threshold (8); full tasks follow directly.

## Environment

All build/test commands MUST run on **Node 22** (`.nvmrc` = 22; the repo's native deps — better-sqlite3 — break on newer Node). Prefix shells with:

```bash
export PATH="$HOME/.nvm/versions/node/$(ls $HOME/.nvm/versions/node | grep '^v22' | tail -1)/bin:$PATH"
node -v   # expect v22.x
```

Run vitest via the CLI package: `pnpm --filter @harness-engineering/cli test -- <path>` (or the repo's configured `vitest run <path>`). Confirm the exact invocation from a sibling command test (e.g. `packages/cli/tests/commands/hooks.test.ts`) before running.

---

## Tasks

### Task 1: Extract `parseCodexNotifyPayload` into the core and reuse it in the Codex entry script (TDD)

**Depends on:** none | **Files:** `packages/cli/src/hooks/session-retrospect-core.js`, `packages/cli/src/hooks/session-retrospect-codex.js`, `packages/cli/tests/hooks/session-retrospect-core.test.ts` | **Owns:** `packages/cli/src/hooks/session-retrospect-core.js` | **Category:** implementation

Centralize the ~12-line Codex payload-parse contract so `run.ts` and `session-retrospect-codex.js` cannot drift (spec D5 / Technical Design).

1. Create `packages/cli/tests/hooks/session-retrospect-core.test.ts`. Import `parseCodexNotifyPayload` from `../../src/hooks/session-retrospect-core.js`. Assert:
   - Valid JSON with `thread-id` + `cwd` → `{ sessionId: '<thread-id>', cwd: '<cwd>' }`.
   - Missing `thread-id` → `sessionId === 'unknown'`.
   - Missing/empty `cwd` → `cwd === process.cwd()`.
   - Non-string / empty / whitespace `raw` → `null`.
   - Malformed JSON (`'not json'`) → `null`.
2. Run the test — observe failure (export does not exist).
3. In `session-retrospect-core.js`, add and export:
   ```js
   /**
    * Parse Codex's notify JSON payload (delivered as a single argv string) into
    * the retrospect inputs. Returns null when the payload is absent or unparseable
    * so callers can fail-soft (exit 0). `thread-id` (hyphenated) is Codex's stable
    * per-conversation session id; cwd falls back to the process cwd because the
    * notify subprocess cwd is not guaranteed to be the project.
    * @param {unknown} raw
    * @returns {{ sessionId: string, cwd: string } | null}
    */
   export function parseCodexNotifyPayload(raw) {
     if (typeof raw !== 'string' || !raw.trim()) return null;
     let input;
     try {
       input = JSON.parse(raw);
     } catch {
       return null;
     }
     if (!input || typeof input !== 'object') return null;
     const sessionId = typeof input['thread-id'] === 'string' ? input['thread-id'] : 'unknown';
     const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
     return { sessionId, cwd };
   }
   ```
4. Refactor `session-retrospect-codex.js` `main()` to use the helper (preserving exit-0 fail-soft):
   ```js
   import {
     parseCodexNotifyPayload,
     retrospectLogLine,
     retrospectSession,
   } from './session-retrospect-core.js';
   // ...
   const parsed = parseCodexNotifyPayload(process.argv[2]);
   if (!parsed) process.exit(0);
   try {
     const result = await retrospectSession(parsed);
     const line = retrospectLogLine('session-retrospect-codex', result);
     if (line) process.stderr.write(line);
     process.exit(0);
   } catch (err) {
     /* existing stderr + exit 0 */
   }
   ```
5. Update the `session-retrospect-codex.js` header note (lines ~8-9) so it no longer states notify points at an absolute path — describe it as fired via the PATH-resolvable `harness hooks run session-retrospect-codex` command (this file remains shipped as the copied support script for backward compatibility, but the generated notify line no longer references it).
6. Run the test — observe pass. Run the existing `packages/cli/tests/hooks/session-retrospect-agents.test.ts` — observe still green (codex path behavior unchanged).
7. Run: `harness validate`
8. Commit: `refactor(cli): extract parseCodexNotifyPayload into session-retrospect-core`

### Task 2: Add `harness hooks run <name> [payload]` subcommand (TDD)

**Depends on:** Task 1 | **Files:** `packages/cli/src/commands/hooks/run.ts`, `packages/cli/src/commands/hooks/index.ts`, `packages/cli/tests/commands/hooks/run.test.ts` | **Owns:** `packages/cli/src/commands/hooks/run.ts` | **Category:** implementation

Implements D1/D2/D4/D5. Covers criteria 3 (parse + delegate seam) and 4 (fail-soft).

**Design for testability:** factor logic into an exported `async function runHook(name, rawPayload): Promise<number>` that returns the intended exit code (always 0) and never throws; the Commander `.action()` calls it and then `process.exit(<code>)`. Tests call `runHook` directly, so no `process.exit` fires inside vitest.

**Import-boundary determination (resolve here):** try `import { parseCodexNotifyPayload, retrospectSession, retrospectLogLine } from '../../hooks/session-retrospect-core.js';` in `run.ts`.

- Run `pnpm --filter @harness-engineering/cli typecheck` (or `build`) on Node 22.
- If it typechecks/builds cleanly → keep the import (preferred; no duplication).
- If TS rejects the untyped `.js` import under strict tsup/tsc → fall back to inlining the ~12-line parse from Task 1's helper directly in `run.ts` and importing only `retrospectSession`/`retrospectLogLine` (which are already imported by other consumers). Behavior is the contract; either path satisfies the criteria. Record the chosen path in the commit body.

1. Create `packages/cli/tests/commands/hooks/run.test.ts`. Import `runHook` from `../../../src/commands/hooks/run`. Assert (with `HARNESS_SESSION_RETROSPECTION` unset in these cases so no archive packages load):
   - `runHook('bogus-name', undefined)` resolves to `0` (unknown name, D4).
   - `runHook('session-retrospect-codex', undefined)` resolves to `0` (empty payload).
   - `runHook('session-retrospect-codex', 'not json')` resolves to `0` (malformed).
   - `runHook('session-retrospect-codex', JSON.stringify({ 'thread-id': 't1', cwd: <tmpdir> }))` resolves to `0` and, with the flag unset, is a no-op (spy asserts `retrospectSession` returns `{status:'disabled'}` OR simply that it resolves 0 without throwing and writes no sentinel under `<tmpdir>/.harness/state/retrospection`).
   - Also assert `createRunCommand()` returns a `Command` named `run` with a `<name>` arg and `[payload]` optional arg.
     > Archive-on-enabled equivalence (criterion 3's "archives once") is inherited from the shared `retrospectSession` core and is already proven end-to-end by `session-retrospect-agents.test.ts`; `run.ts` re-uses that exact core, so these tests verify the parse+delegate+exit-0 seam, not a re-proof of archiving.
2. Run the test — observe failure (module does not exist).
3. Create `packages/cli/src/commands/hooks/run.ts`:
   - A dispatch table `{ 'session-retrospect-codex': async (rawPayload) => { ... } }`. Unknown name → return 0 (D4).
   - The codex handler: `const parsed = parseCodexNotifyPayload(rawPayload); if (!parsed) return 0;` then `const result = await retrospectSession(parsed); const line = retrospectLogLine('session-retrospect-codex', result); if (line) process.stderr.write(line); return 0;` — wrap the whole body in `try/catch` that also returns 0 (write err to stderr).
   - `export async function runHook(name, rawPayload): Promise<number>` wrapping the dispatch, `try/catch` returning 0 on any throw.
   - `export function createRunCommand(): Command` following the `add.ts` pattern:
     ```ts
     return new Command('run')
       .argument('<name>', 'Hook name to run (e.g. session-retrospect-codex)')
       .argument(
         '[payload]',
         'JSON payload delivered by the agent (Codex notify passes it as the trailing arg)'
       )
       .description(
         'Run a bundled agent lifecycle hook by name (PATH-resolvable entry for Codex notify)'
       )
       .action(async (name: string, payload: string | undefined) => {
         process.exit(await runHook(name, payload));
       });
     ```
4. Register in `packages/cli/src/commands/hooks/index.ts`: add `import { createRunCommand } from './run';` and `command.addCommand(createRunCommand());`.
5. Run the test — observe pass.
6. Run: `harness validate` and `pnpm --filter @harness-engineering/cli typecheck`
7. Commit: `feat(cli): add harness hooks run subcommand for PATH-resolvable agent hooks`

### Task 3: Emit the PATH-resolvable Codex notify line with 3-case recognition (TDD)

**Depends on:** Task 2 | **Files:** `packages/cli/src/hooks/agent-retrospect.ts`, `packages/cli/tests/hooks/agent-retrospect.test.ts` | **Owns:** `packages/cli/src/hooks/agent-retrospect.ts` | **Category:** implementation

Implements D3 + the Migration recognition rule. Covers criteria 1, 2, 5, 6.

1. Update the Codex cases in `packages/cli/tests/hooks/agent-retrospect.test.ts` to the new contract (test-first):
   - Change the `describe('Codex …')` block to call `writeCodexNotifyHook(p)` (one arg). Define `const NEW_NOTIFY = 'notify = ["harness", "hooks", "run", "session-retrospect-codex"]';`.
   - **Portable output (criterion 1):** empty config → `installed`; file contains `NEW_NOTIFY`; assert the notify line contains no `/` (no absolute path).
   - **Top-level placement:** keep the existing "before first table" + "nested-array literal not corrupted" assertions, updated to `NEW_NOTIFY`.
   - **Machine-independent (criterion 2):** run the generator (via `installAgentRetrospectHooks({ projectDir })`, with a `.codex/` dir) from two different temp `projectDir` roots; assert the emitted notify lines are byte-identical.
   - **Idempotent (criterion 5a):** a config already holding `NEW_NOTIFY` → `skipped`, single occurrence.
   - **Foreign conflict (criterion 5b):** `notify = ["python3", "/home/me/my-notify.py"]` → `conflict`, file untouched.
   - **In-place upgrade (criterion 5c):** a config holding the OLD line `notify = ["node", "/abs/proj/.harness/hooks/session-retrospect-codex.js"]` → `installed`, and the file now contains `NEW_NOTIFY` and no longer references `session-retrospect-codex.js` / any absolute path.
   - **Other agents unchanged (criterion 6):** leave the Gemini/Cursor/`installAgentRetrospectHooks`/`initHooks` assertions untouched. Update only the codex assertion in the `initHooks multi-agent` block that expects `.codex/config.toml` to `toContain('session-retrospect-codex.js')` → expect it to contain `NEW_NOTIFY` and NOT the `.js` path. (The shipped support-file copy of `session-retrospect-codex.js` under `.harness/hooks/` still exists per `support-files.ts`; only the notify line changes — keep any assertion about the copied file itself.)
2. Run the codex tests — observe failure / compile error (old 2-arg signature).
3. Update `packages/cli/src/hooks/agent-retrospect.ts`:
   - Change signature to `writeCodexNotifyHook(configPath: string): AgentRetrospectStatus` (drop `scriptPath`).
   - New body:
     ```ts
     const scriptMarker = 'session-retrospect-codex.js'; // only the OLD harness generator ever wrote this
     const NEW_NOTIFY = 'notify = ["harness", "hooks", "run", "session-retrospect-codex"]';
     const existing = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf-8') : '';
     const notifyLineRe = /^[ \t]*notify[ \t]*=.*$/m;
     const match = existing.match(notifyLineRe);
     if (match) {
       const line = match[0];
       // Case 2 first: old harness form (references the copied .js) → rewrite in place → installed.
       if (line.includes(scriptMarker)) {
         const updated = existing.replace(notifyLineRe, NEW_NOTIFY);
         const tmp = configPath + '.tmp';
         fs.writeFileSync(tmp, updated);
         fs.renameSync(tmp, configPath);
         return 'installed';
       }
       // Case 1: new form (bare name marker, no .js) → skipped.
       if (line.includes('session-retrospect-codex')) return 'skipped';
       // Case 3: anything else → conflict, untouched.
       return 'conflict';
     }
     // absent → insert NEW_NOTIFY as a top-level key (existing empty/prepend logic).
     ```
     Reuse the existing empty-vs-prepend write logic, substituting `NEW_NOTIFY` for the old `notifyLine`.
   - Update the doc comment (lines ~178-192) to describe the PATH-resolvable command, the 3-case recognition rule (new → skip; old `.js` form → upgrade in place; foreign → conflict), and that it no longer takes a `scriptPath`.
   - In `installAgentRetrospectHooks`, delete the `scriptPath` computation (line ~253) and its comment (lines ~251-252); change the call to `writeCodexNotifyHook(configPath)`.
4. Run the codex tests — observe pass. Run the full `agent-retrospect.test.ts` — Gemini/Cursor/other-agent assertions still green (criterion 6).
5. Run: `harness validate`
6. Commit: `fix(cli): emit PATH-resolvable Codex notify line and upgrade legacy abs-path in place`

### Task 4: Regenerate the CLI reference doc so `hooks run` appears

**Depends on:** Task 3 | **Files:** `docs/reference/cli-commands.md` | **Category:** integration

Derived from the spec's Integration Points → Documentation Updates. The doc is generated from the built CLI, never hand-edited.

1. Build the CLI on Node 22 so the generator sees the new subcommand: `pnpm --filter @harness-engineering/cli build` (the doc generator imports `packages/cli/dist/index.js`).
2. Regenerate: `pnpm generate-docs` (i.e. `node scripts/generate-docs.mjs`).
3. Verify `docs/reference/cli-commands.md` now documents `harness hooks run` (grep for `hooks run`). Confirm `git diff docs/reference/cli-commands.md` shows only the `hooks run` addition and no unrelated churn.
4. Do NOT hand-edit the generated file; if the diff is wrong, fix the command metadata in `run.ts` and regenerate.
5. Run: `harness validate`
6. Commit: `docs(cli): regenerate CLI reference for harness hooks run`

### Task 5: Full verification gate

**Depends on:** Task 4 | **Files:** none (verification) | **Category:** integration

`[checkpoint:human-verify]` Covers criterion 7 and the human review before hand-off to PR.

1. On Node 22, run in order and confirm each passes:
   - `harness validate`
   - lint: `pnpm --filter @harness-engineering/cli lint`
   - typecheck: `pnpm --filter @harness-engineering/cli typecheck`
   - full CLI test suite: `pnpm --filter @harness-engineering/cli test`
2. Sanity-check the portable output end-to-end: in a scratch dir with a `.codex/` folder, run the generator path and confirm `.codex/config.toml` holds `notify = ["harness", "hooks", "run", "session-retrospect-codex"]` with no absolute path.
3. **[checkpoint:human-verify]** Show the human: the four green gates, the portable notify line, and a reminder that committing the regenerated `.codex/config.toml` in THIS repo is a separate post-merge step (re-run `harness update` after the new CLI is published — spec "Post-merge follow-up"). Wait for confirmation before proposing the PR.
4. No code commit in this task unless a gate required a fix (then commit that fix with an appropriate message).

---

## Sequencing Notes

- **Order:** Task 1 (shared parse helper) → Task 2 (command that consumes it) → Task 3 (generator that emits the command form) → Task 4 (doc regen, needs built dist reflecting Tasks 2-3) → Task 5 (gate).
- **Parallelism:** Tasks 1 and 3 touch disjoint files (`session-retrospect-core.js` + `session-retrospect-codex.js` vs `agent-retrospect.ts`) and could run in parallel, but Task 2 depends on Task 1 and Task 4 depends on both 2 and 3, so the practical critical path is sequential. Keep it sequential for a change this small.
- **Change deltas (existing behavior):**
  - [MODIFIED] `writeCodexNotifyHook` signature drops `scriptPath`; emits a PATH-resolvable command instead of `["node", <absPath>]`.
  - [MODIFIED] Codex idempotency now classifies three cases (new → skip, old `.js` → upgrade in place, foreign → conflict) instead of two.
  - [ADDED] `harness hooks run <name> [payload]` subcommand and `parseCodexNotifyPayload` core helper.
  - [MODIFIED] `session-retrospect-codex.js` reuses the core helper and its header note no longer claims an absolute path.

## Success Criteria (plan-level)

- Every one of the 7 spec criteria traces to a task (see Observable Truths mapping).
- Each task is completable in one context window, touches ≤3 files, and follows TDD for code changes.
- The generated `.codex/config.toml` notify line is byte-identical across machines and contains no absolute path.
- All Node-22 gates (validate, lint, typecheck, full CLI tests) pass.

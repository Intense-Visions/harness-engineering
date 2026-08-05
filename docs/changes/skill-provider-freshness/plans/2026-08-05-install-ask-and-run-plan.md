# Plan: Install Ask-And-Run (Phase 1)

**Date:** 2026-08-05 | **Spec:** `docs/changes/skill-provider-freshness/proposal.md` (Phase 1 + Technical Design §6) | **Tasks:** 4 | **Time:** ~16 min | **Integration Tier:** small

## Environment (executor MUST read first)

This repo requires **Node 22** — the system default (Node 26) breaks `better-sqlite3`'s native ABI and hangs the pre-commit hooks. Before running **any** `node` / `pnpm` / `npx` / build / test / lint command, first run:

```bash
export NVM_DIR="$HOME/.nvm"; source "$NVM_DIR/nvm.sh"; nvm use 22
```

Work exclusively in the worktree at `/Users/cwarner/Projects/harness-engineering/.claude/worktrees/skill-provider-autoupdate`. Do **not** `cd` to the main repo. All paths below are relative to the worktree root.

> Note: the worktree has no installed `node_modules`. `harness validate` runs against the globally-installed CLI. If `npx vitest` cannot resolve dependencies from the worktree, run tests from the location where the CLI package's dependencies are installed, or run `pnpm install` at the worktree root first (Node 22). Confirm the test runner works before Task 1.

## Goal

After a successful `harness install`, the CLI asks and runs `generate-slash-commands` for the user (TTY-gated, default `Y`, with `--generate` / `--no-generate` overrides) instead of only printing a hint — without hanging non-interactive installs; the `prompt()` helper is extracted into a shared module reused by both `update` and `install`.

## Scope (Phase 1 ONLY)

In scope: shared `prompt()` extraction; `offerGenerateSlashCommands()` on the install action; `--generate` / `--no-generate` flags; unit tests for all branches. **Out of scope (later phases):** lockfile schema v2, source provenance, freshness checker, `bin/harness.ts` wiring, and the `harness skill update` command. Do not touch those files.

## Observable Truths (Acceptance Criteria)

1. `packages/cli/src/output/prompt.ts` exports `prompt(question: string): Promise<string>` that resolves with the trimmed, lower-cased answer (behavior identical to the former private helper in `update.ts`).
2. `update.ts` imports `prompt` from `../output/prompt`, no longer defines its own `prompt`, and no longer imports `node:readline`; existing `update` behavior and its test suite are unchanged.
3. The `install` command exposes both a `--generate` and a `--no-generate` option; with neither flag, commander yields `opts.generate === undefined` (tri-state confirmed against commander `^12.1.0`).
4. **Event-driven:** When `process.stdout.isTTY` is true and neither override is set, after a successful install/upgrade the CLI prompts `Generate slash commands now? (Y/n)` (default `Y`) and, on assent, runs `execFileSync('harness', ['generate-slash-commands', ...scopeFlags], { stdio: 'inherit' })` where `scopeFlags` is `['--global', '--include-global']` when `opts.global` else `[]`.
5. **Event-driven:** When TTY and the user declines (`n`/`no`), `generate-slash-commands` does **not** run and today's manual hint is printed.
6. **Unwanted:** If `process.stdout.isTTY` is false, then the system shall not prompt or run — it prints today's hint unchanged.
7. **Optional:** Where `--generate` is passed, the system runs `generate-slash-commands` without prompting (regardless of TTY).
8. **Unwanted:** If `--no-generate` is passed, then the system shall not prompt, run, or print the hint — suppressed entirely.
9. `harness validate` passes; `npx vitest run` for the touched test files passes.

## File Map

- CREATE `packages/cli/src/output/prompt.ts`
- CREATE `packages/cli/tests/output/prompt.test.ts`
- MODIFY `packages/cli/src/commands/update.ts` (import shared `prompt`; remove private `prompt` + `node:readline` import)
- MODIFY `packages/cli/src/commands/install.ts` (`InstallOptions.generate`; `--generate`/`--no-generate` options; `offerGenerateSlashCommands` helper; wire into action; import shared `prompt`)
- MODIFY `packages/cli/tests/commands/install.test.ts` (option-presence + `offerGenerateSlashCommands` branch tests)

## Skeleton

_Not produced — task count (4) is below the standard-mode threshold (8)._

## Verified Facts (evidence)

- `packages/cli/src/commands/update.ts:139-150` — the private `prompt()` to extract; `node:readline` imported only at `update.ts:6` and used only at `update.ts:140` (safe to remove after extraction).
- `packages/cli/src/commands/install.ts:437-443` — the printed hint to replace; `globalFlag = opts.global ? ' --global --include-global' : ''`.
- `packages/cli/src/commands/install.ts:4` — `execFileSync` already imported from `'child_process'`; `install.ts:25` imports `logger` from `'../output/logger'`.
- `packages/cli/src/commands/install.ts:28-36` — `InstallOptions` interface (add `generate?` here).
- `packages/cli/src/commands/install.ts:409-450` — `createInstallCommand`; action arrow is already `async` and already gates the hint on `result.installed || result.upgraded`.
- Commander `^12.1.0` (`packages/cli/package.json:47`) gives tri-state for `.option('--generate')` + `.option('--no-generate')`: `undefined` / `true` / `false`. Verified empirically. The negated option's `.long === '--no-generate'`, `.attributeName() === 'generate'`.
- Test conventions: CLI tests live under `packages/cli/tests/**` mirroring `src`; readline is mocked via `vi.mock('node:readline', () => ({ default: { createInterface: ... } }))` (see `packages/cli/tests/commands/update.test.ts:38-48`). `packages/cli/tests/commands/install.test.ts` already mocks `child_process` with a throwing `execFileSync`.
- No generated CLI reference doc enumerates `install` flags (only prose/proposals mention them) — no doc-regeneration integration task needed for Phase 1.

## Uncertainties

- [ASSUMPTION] `npx vitest` resolves dependencies in the worktree (no local `node_modules`). If not, install deps at the worktree root with Node 22 first. Verify before Task 1. Does not change task code, only how tests are invoked.
- [DEFERRABLE] Exact wording of the warn message when `execFileSync` fails inside `run()`. Proposed: `"Failed to generate slash commands."` followed by the manual hint.

## Tasks

### Task 1: Extract shared `prompt()` into `output/prompt.ts` (TDD)

**Depends on:** none | **Files:** `packages/cli/src/output/prompt.ts`, `packages/cli/tests/output/prompt.test.ts`
**Skills:** `ts-testing-types` (reference)

1. Create `packages/cli/tests/output/prompt.test.ts`:

   ```ts
   import { describe, it, expect, vi } from 'vitest';

   vi.mock('node:readline', () => ({
     default: {
       createInterface: vi.fn(() => ({
         question: vi.fn((_q: string, cb: (answer: string) => void) => {
           cb('  YES  ');
         }),
         close: vi.fn(),
       })),
     },
   }));

   import { prompt } from '../../src/output/prompt';

   describe('prompt', () => {
     it('resolves with the trimmed, lower-cased answer', async () => {
       const answer = await prompt('Continue? (y/N) ');
       expect(answer).toBe('yes');
     });
   });
   ```

2. Run the test — observe failure (module does not exist yet):
   `npx vitest run packages/cli/tests/output/prompt.test.ts`
3. Create `packages/cli/src/output/prompt.ts`:

   ```ts
   import readline from 'node:readline';

   /**
    * Prompts the user with a question on stdin/stdout and resolves with the
    * trimmed, lower-cased answer. Shared by the `update` and `install` commands.
    */
   export function prompt(question: string): Promise<string> {
     const rl = readline.createInterface({
       input: process.stdin,
       output: process.stdout,
     });
     return new Promise((resolve) => {
       rl.question(question, (answer) => {
         rl.close();
         resolve(answer.trim().toLowerCase());
       });
     });
   }
   ```

4. Run the test — observe pass:
   `npx vitest run packages/cli/tests/output/prompt.test.ts`
5. Run: `harness validate`
6. Commit: `refactor(cli): extract shared prompt() into output/prompt`

### Task 2: Point `update.ts` at the shared `prompt` (refactor)

**Depends on:** Task 1 | **Files:** `packages/cli/src/commands/update.ts`

_Pure refactor — behavior preserved. Regression is covered by the existing `update` test suite plus Task 1's prompt test; no new test is added._

1. In `packages/cli/src/commands/update.ts`, remove the readline import (line 6): `import readline from 'node:readline';`.
2. Add the shared import alongside the other `../output/*` imports (after the `logger` import at line 9):
   `import { prompt } from '../output/prompt';`
3. Remove the private `prompt` function definition (the `function prompt(question: string): Promise<string> { ... }` block at lines 139-150). All existing call sites (`offerCleanupOfOtherInstalls`, `offerRegeneration`) now resolve to the imported `prompt` unchanged.
4. Run the existing suites — observe pass:
   `npx vitest run packages/cli/tests/commands/update.test.ts packages/cli/tests/commands/update-integrations-sync.test.ts`
5. Run: `harness validate`
6. Commit: `refactor(cli): reuse shared prompt in update command`

### Task 3: Add `--generate` / `--no-generate` options to `install` (TDD)

**Depends on:** Task 1 | **Files:** `packages/cli/src/commands/install.ts`, `packages/cli/tests/commands/install.test.ts`

1. In `packages/cli/tests/commands/install.test.ts`, add to the `describe('createInstallCommand options', ...)` block:

   ```ts
   it('has --generate option', () => {
     const cmd = createInstallCommand();
     expect(cmd.options.find((o) => o.long === '--generate')).toBeDefined();
   });

   it('has --no-generate option', () => {
     const cmd = createInstallCommand();
     expect(cmd.options.find((o) => o.long === '--no-generate')).toBeDefined();
   });
   ```

2. Run — observe failure:
   `npx vitest run packages/cli/tests/commands/install.test.ts -t "generate option"`
3. In `packages/cli/src/commands/install.ts`, add the field to `InstallOptions` (after `global?` at line ~33):

   ```ts
   /**
    * Post-install generate-slash-commands behavior. `undefined` = prompt when
    * interactive (TTY); `true` = run without prompting (`--generate`);
    * `false` = suppress entirely (`--no-generate`).
    */
   generate?: boolean;
   ```

4. In `createInstallCommand`, register the options immediately after `.option('--registry <url>', ...)` (line ~421):

   ```ts
   .option('--generate', 'Generate slash commands after install without prompting')
   .option('--no-generate', 'Skip generating slash commands after install')
   ```

5. Run — observe pass:
   `npx vitest run packages/cli/tests/commands/install.test.ts -t "generate option"`
6. Run: `harness validate`
7. Commit: `feat(cli): add --generate/--no-generate flags to install`

### Task 4: Implement `offerGenerateSlashCommands` and wire into the install action (TDD)

**Depends on:** Task 3 | **Files:** `packages/cli/src/commands/install.ts`, `packages/cli/tests/commands/install.test.ts`

1. In `packages/cli/tests/commands/install.test.ts`, add a module mock for the shared prompt near the other `vi.mock` calls (top of file):

   ```ts
   vi.mock('../../src/output/prompt', () => ({ prompt: vi.fn() }));
   ```

   Add these imports alongside the existing test imports (top of file, with the other `import`s):

   ```ts
   import { execFileSync } from 'child_process';
   import { prompt } from '../../src/output/prompt';
   ```

   Extend the value import from `../../src/commands/install` to also import `offerGenerateSlashCommands` (line 2), and add near the other `vi.mocked(...)` bindings:

   ```ts
   const mockedExecFileSync = vi.mocked(execFileSync);
   const mockedPrompt = vi.mocked(prompt);
   ```

2. Append a new describe block to `packages/cli/tests/commands/install.test.ts`:

   ```ts
   describe('offerGenerateSlashCommands', () => {
     const originalIsTTY = process.stdout.isTTY;
     let logSpy: ReturnType<typeof vi.spyOn>;

     beforeEach(() => {
       vi.clearAllMocks();
       mockedExecFileSync.mockImplementation(() => Buffer.from(''));
       logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
     });
     afterEach(() => {
       process.stdout.isTTY = originalIsTTY;
       logSpy.mockRestore();
     });

     const hintPrinted = (): boolean =>
       logSpy.mock.calls.some((c) => c.some((a) => String(a).includes('generate-slash-commands')));
     const generateRan = (): boolean =>
       mockedExecFileSync.mock.calls.some(
         (c) => c[0] === 'harness' && Array.isArray(c[1]) && c[1][0] === 'generate-slash-commands'
       );

     it('TTY + assent runs generate-slash-commands', async () => {
       process.stdout.isTTY = true;
       mockedPrompt.mockResolvedValue(''); // default Y
       await offerGenerateSlashCommands({});
       expect(mockedPrompt).toHaveBeenCalled();
       expect(generateRan()).toBe(true);
     });

     it('TTY + decline does not run generate-slash-commands', async () => {
       process.stdout.isTTY = true;
       mockedPrompt.mockResolvedValue('n');
       await offerGenerateSlashCommands({});
       expect(generateRan()).toBe(false);
       expect(hintPrinted()).toBe(true);
     });

     it('non-TTY prints the hint without prompting or running', async () => {
       process.stdout.isTTY = false;
       await offerGenerateSlashCommands({});
       expect(mockedPrompt).not.toHaveBeenCalled();
       expect(generateRan()).toBe(false);
       expect(hintPrinted()).toBe(true);
     });

     it('--generate runs without prompting and threads global scope flags', async () => {
       process.stdout.isTTY = false;
       await offerGenerateSlashCommands({ generate: true, global: true });
       expect(mockedPrompt).not.toHaveBeenCalled();
       expect(mockedExecFileSync).toHaveBeenCalledWith(
         'harness',
         ['generate-slash-commands', '--global', '--include-global'],
         { stdio: 'inherit' }
       );
     });

     it('--no-generate suppresses entirely (no prompt, run, or hint)', async () => {
       process.stdout.isTTY = true;
       await offerGenerateSlashCommands({ generate: false });
       expect(mockedPrompt).not.toHaveBeenCalled();
       expect(generateRan()).toBe(false);
       expect(hintPrinted()).toBe(false);
     });
   });
   ```

3. Run — observe failure (`offerGenerateSlashCommands` not exported yet):
   `npx vitest run packages/cli/tests/commands/install.test.ts -t "offerGenerateSlashCommands"`
4. In `packages/cli/src/commands/install.ts`, add the shared-prompt import alongside the existing imports (near the `logger` import at line 25):
   `import { prompt } from '../output/prompt';`
5. Add the exported helper immediately before `createInstallCommand` (before line 409):

   ```ts
   /**
    * After a successful install/upgrade, offers to run `generate-slash-commands`.
    * TTY-gated so non-interactive / CI installs never hang:
    *   - `--no-generate` (opts.generate === false): suppressed entirely.
    *   - `--generate` (opts.generate === true): runs without prompting.
    *   - interactive TTY: prompts "Generate slash commands now? (Y/n)" (default Y).
    *   - non-TTY: prints today's manual hint unchanged.
    */
   export async function offerGenerateSlashCommands(opts: InstallOptions): Promise<void> {
     if (opts.generate === false) return; // --no-generate: suppress entirely

     const scopeFlags = opts.global ? ['--global', '--include-global'] : [];
     const hint = `Run \`harness generate-slash-commands${
       opts.global ? ' --global --include-global' : ''
     }\` to register slash commands.`;

     const run = (): void => {
       try {
         execFileSync('harness', ['generate-slash-commands', ...scopeFlags], { stdio: 'inherit' });
       } catch {
         logger.warn('Failed to generate slash commands.');
         logger.info(hint);
       }
     };

     if (opts.generate === true) {
       run(); // --generate: run without prompting
       return;
     }

     if (!process.stdout.isTTY) {
       logger.info(hint); // non-TTY: print today's hint unchanged
       return;
     }

     const answer = await prompt('Generate slash commands now? (Y/n) ');
     if (answer === 'n' || answer === 'no') {
       logger.info(hint);
       return;
     }
     run();
   }
   ```

6. Replace the printed-hint block in the action (`packages/cli/src/commands/install.ts:437-443`):

   ```ts
   // Offer to generate slash commands after successful install/upgrade
   if (result.installed || result.upgraded) {
     await offerGenerateSlashCommands(opts);
   }
   ```

7. Run — observe pass:
   `npx vitest run packages/cli/tests/commands/install.test.ts`
8. Run the full touched set to confirm no regressions:
   `npx vitest run packages/cli/tests/output/prompt.test.ts packages/cli/tests/commands/update.test.ts packages/cli/tests/commands/install.test.ts`
9. Run: `harness validate`
10. Commit: `feat(cli): ask-and-run generate-slash-commands after install`

## Integration Points

The spec's Integration Points section covers the whole feature; for **Phase 1** the only entry-point change is the two new `install` flags plus the post-install behavior. No command registration, barrel export, or generated-doc regeneration is required (no generated CLI reference enumerates install flags). Documentation/ADR work is explicitly deferred to Phase 5. **No integration tasks derived for Phase 1.**

## Verification Trace

| Observable Truth                           | Task(s)   |
| ------------------------------------------ | --------- |
| 1 (shared prompt module)                   | Task 1    |
| 2 (update reuses prompt, readline removed) | Task 2    |
| 3 (flags + tri-state)                      | Task 3    |
| 4 (TTY assent runs)                        | Task 4    |
| 5 (TTY decline prints hint)                | Task 4    |
| 6 (non-TTY prints hint)                    | Task 4    |
| 7 (--generate runs)                        | Task 4    |
| 8 (--no-generate suppresses)               | Task 4    |
| 9 (validate + tests pass)                  | all tasks |

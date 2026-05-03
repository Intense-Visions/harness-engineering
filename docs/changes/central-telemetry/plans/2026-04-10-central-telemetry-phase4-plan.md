# Plan: Central Telemetry Phase 4 -- CLI Identity Command

**Date:** 2026-04-10
**Spec:** docs/changes/central-telemetry/proposal.md (Phase 4)
**Estimated tasks:** 6
**Estimated time:** 25 minutes

## Goal

Users can manage their telemetry identity via `harness telemetry identify` and inspect telemetry state via `harness telemetry status`, reading and writing `.harness/telemetry.json`.

## Observable Truths (Acceptance Criteria)

1. When `harness telemetry identify --project myapp --team platform --alias cwarner` is run, `.harness/telemetry.json` contains `{ "identity": { "project": "myapp", "team": "platform", "alias": "cwarner" } }`.
2. When `harness telemetry identify --project myapp` is run with an existing identity, only the `project` field is updated; other existing fields are preserved.
3. When `harness telemetry identify --clear` is run, `.harness/telemetry.json` is written with `{ "identity": {} }`, removing all identity fields.
4. When `harness telemetry status` is run with telemetry enabled and identity configured, the output displays: consent state (allowed/disallowed), install ID, identity fields (project, team, alias), and any active env var overrides (`DO_NOT_TRACK`, `HARNESS_TELEMETRY_OPTOUT`).
5. When `harness telemetry status --json` is run, the output is valid JSON with `consent`, `installId`, `identity`, and `envOverrides` fields.
6. If `DO_NOT_TRACK=1` is set, `harness telemetry status` shows consent as disallowed and indicates the env var override.
7. `npx vitest run packages/cli/tests/commands/telemetry.test.ts` passes with all tests green.
8. The `telemetry` command appears in `harness --help` output.

## File Map

- CREATE `packages/cli/src/commands/telemetry/index.ts`
- CREATE `packages/cli/src/commands/telemetry/identify.ts`
- CREATE `packages/cli/src/commands/telemetry/status.ts`
- CREATE `packages/cli/tests/commands/telemetry.test.ts`
- MODIFY `packages/cli/src/commands/_registry.ts` (add import and entry for createTelemetryCommand)
- MODIFY `packages/core/src/telemetry/consent.ts` (export `readIdentity` as public so CLI can reuse it)
- MODIFY `packages/core/src/telemetry/index.ts` (re-export `readIdentity`)
- MODIFY `packages/core/src/index.ts` (re-export `readIdentity` if not already covered by barrel)

_Skeleton not produced -- task count (6) below threshold (8)._

## Tasks

### Task 1: Export readIdentity from core telemetry module

**Depends on:** none
**Files:** `packages/core/src/telemetry/consent.ts`, `packages/core/src/telemetry/index.ts`

1. In `packages/core/src/telemetry/consent.ts`, change `function readIdentity` to `export function readIdentity` (line 10). The function is currently private; making it public allows the CLI status command to reuse it.

2. In `packages/core/src/telemetry/index.ts`, add the re-export:

   ```typescript
   export { readIdentity } from './consent';
   ```

3. Verify the barrel at `packages/core/src/index.ts` line 174 already re-exports from `./telemetry` -- it does (`export { resolveConsent, getOrCreateInstallId, collectEvents, send } from './telemetry'`). Update it to also include `readIdentity`:

   ```typescript
   export {
     resolveConsent,
     readIdentity,
     getOrCreateInstallId,
     collectEvents,
     send,
   } from './telemetry';
   ```

4. Run: `cd /Users/cwarner/Projects/harness-engineering && npx tsc --noEmit -p packages/core/tsconfig.json 2>&1 | head -20`
5. Run: `harness validate`
6. Commit: `feat(telemetry): export readIdentity from core telemetry module`

---

### Task 2: Create telemetry identify command

**Depends on:** Task 1
**Files:** `packages/cli/src/commands/telemetry/identify.ts`

1. Create `packages/cli/src/commands/telemetry/identify.ts`:

   ```typescript
   import { Command } from 'commander';
   import * as fs from 'node:fs';
   import * as path from 'node:path';
   import { logger } from '../../output/logger';

   interface TelemetryFile {
     identity: {
       project?: string;
       team?: string;
       alias?: string;
     };
   }

   function telemetryFilePath(cwd: string): string {
     return path.join(cwd, '.harness', 'telemetry.json');
   }

   function readTelemetryFile(cwd: string): TelemetryFile {
     const filePath = telemetryFilePath(cwd);
     try {
       const raw = fs.readFileSync(filePath, 'utf-8');
       const parsed = JSON.parse(raw);
       if (parsed && typeof parsed === 'object' && parsed.identity) {
         return parsed as TelemetryFile;
       }
       return { identity: {} };
     } catch {
       return { identity: {} };
     }
   }

   function writeTelemetryFile(cwd: string, data: TelemetryFile): void {
     const filePath = telemetryFilePath(cwd);
     const dir = path.dirname(filePath);
     fs.mkdirSync(dir, { recursive: true });
     fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
   }

   export function createIdentifyCommand(): Command {
     const cmd = new Command('identify')
       .description('Set or clear telemetry identity fields in .harness/telemetry.json')
       .option('--project <name>', 'Project name')
       .option('--team <name>', 'Team name')
       .option('--alias <name>', 'User alias')
       .option('--clear', 'Remove all identity fields')
       .action((opts) => {
         const cwd = process.cwd();

         if (opts.clear) {
           writeTelemetryFile(cwd, { identity: {} });
           logger.success('Telemetry identity cleared.');
           return;
         }

         const hasField = opts.project || opts.team || opts.alias;
         if (!hasField) {
           logger.error('Provide at least one of --project, --team, --alias, or --clear.');
           process.exitCode = 1;
           return;
         }

         const existing = readTelemetryFile(cwd);
         if (opts.project) existing.identity.project = opts.project;
         if (opts.team) existing.identity.team = opts.team;
         if (opts.alias) existing.identity.alias = opts.alias;

         writeTelemetryFile(cwd, existing);
         logger.success('Telemetry identity updated:');
         if (existing.identity.project) logger.info(`  project: ${existing.identity.project}`);
         if (existing.identity.team) logger.info(`  team:    ${existing.identity.team}`);
         if (existing.identity.alias) logger.info(`  alias:   ${existing.identity.alias}`);
       });

     return cmd;
   }
   ```

2. Run: `cd /Users/cwarner/Projects/harness-engineering && npx tsc --noEmit -p packages/cli/tsconfig.json 2>&1 | head -20`
3. Run: `harness validate`
4. Commit: `feat(telemetry): add identify command for setting identity fields`

---

### Task 3: Create telemetry status command

**Depends on:** Task 1
**Files:** `packages/cli/src/commands/telemetry/status.ts`

1. Create `packages/cli/src/commands/telemetry/status.ts`:

   ```typescript
   import { Command } from 'commander';
   import { logger } from '../../output/logger';

   interface StatusResult {
     consent: { allowed: boolean; reason?: string };
     installId: string | null;
     identity: { project?: string; team?: string; alias?: string };
     envOverrides: { DO_NOT_TRACK?: string; HARNESS_TELEMETRY_OPTOUT?: string };
   }

   export function createStatusCommand(): Command {
     const cmd = new Command('status')
       .description('Show current telemetry consent state, install ID, and identity')
       .action(async (_opts, command) => {
         const globalOpts = command.optsWithGlobals();
         const cwd = process.cwd();

         const { resolveConsent, readIdentity, getOrCreateInstallId } =
           await import('@harness-engineering/core');

         // Gather env overrides
         const envOverrides: StatusResult['envOverrides'] = {};
         if (process.env.DO_NOT_TRACK) envOverrides.DO_NOT_TRACK = process.env.DO_NOT_TRACK;
         if (process.env.HARNESS_TELEMETRY_OPTOUT)
           envOverrides.HARNESS_TELEMETRY_OPTOUT = process.env.HARNESS_TELEMETRY_OPTOUT;

         // Resolve consent (config param undefined = use defaults)
         const consent = resolveConsent(cwd, undefined);
         const identity = readIdentity(cwd);

         let installId: string | null = null;
         try {
           installId = getOrCreateInstallId(cwd);
         } catch {
           // may fail if .harness dir cannot be created
         }

         const result: StatusResult = {
           consent: {
             allowed: consent.allowed,
             ...(consent.allowed
               ? {}
               : {
                   reason:
                     process.env.DO_NOT_TRACK === '1'
                       ? 'DO_NOT_TRACK=1'
                       : process.env.HARNESS_TELEMETRY_OPTOUT === '1'
                         ? 'HARNESS_TELEMETRY_OPTOUT=1'
                         : 'telemetry.enabled is false in config',
                 }),
           },
           installId,
           identity,
           envOverrides,
         };

         if (globalOpts.json) {
           console.log(JSON.stringify(result, null, 2));
           return;
         }

         // Human-readable output
         logger.info(`Telemetry: ${consent.allowed ? 'enabled' : 'disabled'}`);
         if (!consent.allowed && result.consent.reason) {
           logger.info(`  Reason:  ${result.consent.reason}`);
         }
         logger.info(`Install ID: ${installId ?? 'not yet created'}`);

         const hasIdentity = identity.project || identity.team || identity.alias;
         if (hasIdentity) {
           logger.info('Identity:');
           if (identity.project) logger.info(`  project: ${identity.project}`);
           if (identity.team) logger.info(`  team:    ${identity.team}`);
           if (identity.alias) logger.info(`  alias:   ${identity.alias}`);
         } else {
           logger.info('Identity: not configured');
         }

         const overrideKeys = Object.keys(envOverrides);
         if (overrideKeys.length > 0) {
           logger.info('Env overrides:');
           for (const key of overrideKeys) {
             logger.info(`  ${key}=${envOverrides[key as keyof typeof envOverrides]}`);
           }
         }
       });

     return cmd;
   }
   ```

2. Run: `cd /Users/cwarner/Projects/harness-engineering && npx tsc --noEmit -p packages/cli/tsconfig.json 2>&1 | head -20`
3. Run: `harness validate`
4. Commit: `feat(telemetry): add status command showing consent state and identity`

---

### Task 4: Create telemetry parent command and register in CLI

**Depends on:** Task 2, Task 3
**Files:** `packages/cli/src/commands/telemetry/index.ts`, `packages/cli/src/commands/_registry.ts`

1. Create `packages/cli/src/commands/telemetry/index.ts`:

   ```typescript
   import { Command } from 'commander';
   import { createIdentifyCommand } from './identify';
   import { createStatusCommand } from './status';

   export function createTelemetryCommand(): Command {
     const command = new Command('telemetry').description(
       'Telemetry identity and status management'
     );
     command.addCommand(createIdentifyCommand());
     command.addCommand(createStatusCommand());
     return command;
   }
   ```

2. In `packages/cli/src/commands/_registry.ts`, add the import (alphabetically, after the `createTaintCommand` import):

   ```typescript
   import { createTelemetryCommand } from './telemetry';
   ```

3. In the `commandCreators` array, add `createTelemetryCommand` (alphabetically, after `createTaintCommand`):

   ```typescript
     createTelemetryCommand,
   ```

4. Run: `cd /Users/cwarner/Projects/harness-engineering && npx tsc --noEmit -p packages/cli/tsconfig.json 2>&1 | head -20`
5. Run: `harness validate`
6. Commit: `feat(telemetry): register telemetry parent command in CLI registry`

---

### Task 5: Write tests for telemetry commands

**Depends on:** Task 4
**Files:** `packages/cli/tests/commands/telemetry.test.ts`

1. Create `packages/cli/tests/commands/telemetry.test.ts`:

   ```typescript
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import * as fs from 'node:fs';
   import * as path from 'node:path';
   import { createTelemetryCommand } from '../../src/commands/telemetry/index';

   describe('telemetry command', () => {
     it('creates telemetry command with subcommands', () => {
       const cmd = createTelemetryCommand();
       expect(cmd.name()).toBe('telemetry');
       const subcommands = cmd.commands.map((c) => c.name());
       expect(subcommands).toContain('identify');
       expect(subcommands).toContain('status');
     });
   });

   describe('telemetry identify', () => {
     const tmpDir = path.join(__dirname, '__test-tmp-telemetry__');
     const harnessDir = path.join(tmpDir, '.harness');
     const telemetryFile = path.join(harnessDir, 'telemetry.json');
     const originalCwd = process.cwd();

     beforeEach(() => {
       fs.mkdirSync(harnessDir, { recursive: true });
       process.chdir(tmpDir);
     });

     afterEach(() => {
       process.chdir(originalCwd);
       fs.rmSync(tmpDir, { recursive: true, force: true });
     });

     it('sets all identity fields', async () => {
       const cmd = createTelemetryCommand();
       await cmd.parseAsync(
         [
           'node',
           'harness',
           'identify',
           '--project',
           'myapp',
           '--team',
           'platform',
           '--alias',
           'cwarner',
         ],
         { from: 'user' }
       );
       const data = JSON.parse(fs.readFileSync(telemetryFile, 'utf-8'));
       expect(data.identity).toEqual({ project: 'myapp', team: 'platform', alias: 'cwarner' });
     });

     it('preserves existing fields when setting a single field', async () => {
       fs.writeFileSync(
         telemetryFile,
         JSON.stringify({ identity: { project: 'existing', team: 'oldteam' } }),
         'utf-8'
       );
       const cmd = createTelemetryCommand();
       await cmd.parseAsync(['node', 'harness', 'identify', '--alias', 'newuser'], {
         from: 'user',
       });
       const data = JSON.parse(fs.readFileSync(telemetryFile, 'utf-8'));
       expect(data.identity).toEqual({ project: 'existing', team: 'oldteam', alias: 'newuser' });
     });

     it('clears all identity fields with --clear', async () => {
       fs.writeFileSync(
         telemetryFile,
         JSON.stringify({ identity: { project: 'myapp', alias: 'me' } }),
         'utf-8'
       );
       const cmd = createTelemetryCommand();
       await cmd.parseAsync(['node', 'harness', 'identify', '--clear'], { from: 'user' });
       const data = JSON.parse(fs.readFileSync(telemetryFile, 'utf-8'));
       expect(data.identity).toEqual({});
     });

     it('sets exitCode=1 when no flags provided', async () => {
       const originalExitCode = process.exitCode;
       const cmd = createTelemetryCommand();
       await cmd.parseAsync(['node', 'harness', 'identify'], { from: 'user' });
       expect(process.exitCode).toBe(1);
       process.exitCode = originalExitCode;
     });

     it('creates .harness directory if missing', async () => {
       fs.rmSync(harnessDir, { recursive: true, force: true });
       const cmd = createTelemetryCommand();
       await cmd.parseAsync(['node', 'harness', 'identify', '--project', 'newproj'], {
         from: 'user',
       });
       expect(fs.existsSync(telemetryFile)).toBe(true);
       const data = JSON.parse(fs.readFileSync(telemetryFile, 'utf-8'));
       expect(data.identity.project).toBe('newproj');
     });
   });

   describe('telemetry status', () => {
     const tmpDir = path.join(__dirname, '__test-tmp-telemetry-status__');
     const harnessDir = path.join(tmpDir, '.harness');
     const telemetryFile = path.join(harnessDir, 'telemetry.json');
     const originalCwd = process.cwd();
     const originalEnv = process.env;

     beforeEach(() => {
       process.env = { ...originalEnv };
       delete process.env.DO_NOT_TRACK;
       delete process.env.HARNESS_TELEMETRY_OPTOUT;
       fs.mkdirSync(harnessDir, { recursive: true });
       process.chdir(tmpDir);
     });

     afterEach(() => {
       process.chdir(originalCwd);
       process.env = originalEnv;
       fs.rmSync(tmpDir, { recursive: true, force: true });
     });

     it('outputs JSON with --json flag', async () => {
       fs.writeFileSync(
         telemetryFile,
         JSON.stringify({ identity: { project: 'testproj' } }),
         'utf-8'
       );
       const logs: string[] = [];
       const origLog = console.log;
       console.log = (...args: unknown[]) => logs.push(args.join(' '));

       try {
         const cmd = createTelemetryCommand();
         cmd.parent = { opts: () => ({ json: true }), parent: null } as any;
         await cmd.parseAsync(['node', 'harness', 'status', '--json'], { from: 'user' });
       } finally {
         console.log = origLog;
       }

       // At least one log entry should be valid JSON
       const jsonOutput = logs.find((l) => {
         try {
           JSON.parse(l);
           return true;
         } catch {
           return false;
         }
       });
       expect(jsonOutput).toBeDefined();
       const parsed = JSON.parse(jsonOutput!);
       expect(parsed).toHaveProperty('consent');
       expect(parsed).toHaveProperty('identity');
       expect(parsed).toHaveProperty('envOverrides');
     });

     it('shows disabled state when DO_NOT_TRACK=1', async () => {
       process.env.DO_NOT_TRACK = '1';
       const logs: string[] = [];
       const origLog = console.log;
       console.log = (...args: unknown[]) => logs.push(args.join(' '));

       try {
         const cmd = createTelemetryCommand();
         cmd.parent = { opts: () => ({ json: true }), parent: null } as any;
         await cmd.parseAsync(['node', 'harness', 'status', '--json'], { from: 'user' });
       } finally {
         console.log = origLog;
       }

       const jsonOutput = logs.find((l) => {
         try {
           JSON.parse(l);
           return true;
         } catch {
           return false;
         }
       });
       expect(jsonOutput).toBeDefined();
       const parsed = JSON.parse(jsonOutput!);
       expect(parsed.consent.allowed).toBe(false);
       expect(parsed.consent.reason).toBe('DO_NOT_TRACK=1');
       expect(parsed.envOverrides.DO_NOT_TRACK).toBe('1');
     });
   });
   ```

2. Run: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/cli/tests/commands/telemetry.test.ts`
3. Observe: tests should fail initially (imports will resolve, but the status --json test may need adjustment based on how commander propagates global options -- see Task 6 for fixup).
4. If all tests pass, proceed. If the status `--json` tests fail due to commander global opts propagation, adjust the test to parse from the parent command level or mock `optsWithGlobals`.
5. Run: `harness validate`
6. Commit: `test(telemetry): add unit tests for identify and status commands`

---

### Task 6: Verify end-to-end and fix test issues

**Depends on:** Task 5
**Files:** `packages/cli/tests/commands/telemetry.test.ts` (fixup if needed), `packages/cli/src/commands/telemetry/status.ts` (fixup if needed)

[checkpoint:human-verify] -- Run the full test suite and verify CLI output manually.

1. Run: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/cli/tests/commands/telemetry.test.ts`
2. If any tests fail due to commander `optsWithGlobals()` not finding `--json` when invoked as a subcommand, adjust the status command to accept `--json` as a local option instead:
   ```typescript
   // In status.ts, add .option('--json', 'Output as JSON') to the command
   // Then read opts.json instead of globalOpts.json
   ```
   Update the test accordingly to pass `--json` as a direct option.
3. Run: `cd /Users/cwarner/Projects/harness-engineering && npx tsc --noEmit -p packages/cli/tsconfig.json 2>&1 | head -20`
4. Run: `npx vitest run packages/cli/tests/commands/telemetry.test.ts` -- all tests green.
5. Run: `harness validate`
6. Commit: `fix(telemetry): resolve test fixups for CLI identity commands`

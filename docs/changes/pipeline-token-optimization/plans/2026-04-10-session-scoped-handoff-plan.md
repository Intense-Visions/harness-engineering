# Plan: Session-Scoped Handoff

**Date:** 2026-04-10
**Spec:** docs/changes/pipeline-token-optimization/proposal.md
**Estimated tasks:** 8
**Estimated time:** 30 min

## Goal

All 5 pipeline skills consistently write handoff to the session-scoped directory when a session slug is available, global `.harness/handoff.json` is formally deprecated in each skill, `artifacts.json` is documented in the session directory pattern, and `harness cleanup-sessions` removes stale session directories.

## Observable Truths (Acceptance Criteria)

1. When a pipeline skill completes with a session slug available, the system shall write handoff to `.harness/sessions/<slug>/handoff.json` — not `.harness/handoff.json`.
2. Each pipeline SKILL.md shall contain an explicit deprecation notice: global `.harness/handoff.json` writes are deprecated in favor of session-scoped writes.
3. Each pipeline SKILL.md shall document `artifacts.json` as part of the session directory structure alongside `handoff.json` and `state.json`.
4. When `harness cleanup-sessions` is run, the system shall delete session directories where the most recent file write is older than 24 hours and print a summary.
5. When `harness cleanup-sessions --dry-run` is run, the system shall list stale sessions without deleting them.
6. `pnpm vitest run packages/cli/tests/commands/cleanup-sessions.test.ts` passes with >= 4 tests.
7. `harness validate` passes.

## File Map

```
MODIFY agents/skills/claude-code/harness-brainstorming/SKILL.md
MODIFY agents/skills/claude-code/harness-planning/SKILL.md
MODIFY agents/skills/claude-code/harness-execution/SKILL.md
MODIFY agents/skills/claude-code/harness-verification/SKILL.md
MODIFY agents/skills/claude-code/harness-code-review/SKILL.md
CREATE packages/cli/src/commands/cleanup-sessions.ts
CREATE packages/cli/tests/commands/cleanup-sessions.test.ts
MODIFY packages/cli/src/commands/_registry.ts
```

_Skeleton not produced — rigor level is `fast`._

## Changes to Pipeline Skills

- **[MODIFIED]** Handoff write instruction in all 5 pipeline skills: add session-scoped path with global path as fallback
- **[ADDED]** Deprecation notice in all 5 pipeline skills: global `.harness/handoff.json` is deprecated
- **[ADDED]** `artifacts.json` listed in session directory structure documentation in all 5 pipeline skills
- **[ADDED]** `harness cleanup-sessions` CLI command with `--dry-run` flag

---

## Tasks

### Task 1: Update harness-brainstorming handoff to session-scoped

**Depends on:** none
**Files:** `agents/skills/claude-code/harness-brainstorming/SKILL.md`

1. Open `agents/skills/claude-code/harness-brainstorming/SKILL.md`.

2. Find the handoff block in step 7 (line ~134):

   ```
   Write `.harness/handoff.json`:
   ```

3. Replace that entire handoff instruction block with:

   ````markdown
   Write handoff to the session-scoped path when a session slug is known, otherwise fall back to the global path:

   - Session-scoped (preferred): `.harness/sessions/<session-slug>/handoff.json`
   - Global (fallback, deprecated): `.harness/handoff.json`

   > **[DEPRECATED]** Writing to `.harness/handoff.json` is deprecated. When running within an autopilot session, always write to `.harness/sessions/<session-slug>/handoff.json`. Global writes cause cross-session contamination in parallel runs.

   ```json
   {
     "fromSkill": "harness-brainstorming",
     "phase": "VALIDATE",
     "summary": "<1-sentence summary>",
     "artifacts": ["<spec path>"],
     "decisions": [{ "what": "<decision>", "why": "<rationale>" }],
     "contextKeywords": ["<keywords from Phase 2>"]
   }
   ```
   ````

   ```

   ```

4. Find the "Harness Integration" section. After the `**Handoff**` bullet, add:

   ```markdown
   - **Session directory** — When session slug is known, handoff goes to `.harness/sessions/<slug>/handoff.json`. The session directory structure is: `handoff.json`, `state.json`, `artifacts.json` (registry of spec/plan paths and file lists). Do not write to `.harness/handoff.json` in session context.
   ```

5. Run: `harness validate`
6. Commit: `feat(skills): session-scoped handoff in harness-brainstorming`

---

### Task 2: Update harness-planning handoff to session-scoped

**Depends on:** none
**Files:** `agents/skills/claude-code/harness-planning/SKILL.md`

1. Open `agents/skills/claude-code/harness-planning/SKILL.md`.

2. Find step 8 in Phase 4 (line ~190):

   ```
   8. **Write handoff.** Save `.harness/handoff.json` with `fromSkill`, `summary`, `pending`, `concerns`, `decisions`, `contextKeywords`.
   ```

3. Replace that line with:

   ```markdown
   8. **Write handoff.** Write to the session-scoped path when session slug is known, otherwise fall back to global path:
      - Session-scoped (preferred): `.harness/sessions/<session-slug>/handoff.json`
      - Global (fallback, **deprecated**): `.harness/handoff.json`

      > **[DEPRECATED]** Writing to `.harness/handoff.json` is deprecated. In autopilot sessions, always use `.harness/sessions/<slug>/handoff.json` to prevent cross-session contamination.

      Fields: `fromSkill`, `phase`, `summary`, `completed`, `pending`, `concerns`, `decisions`, `contextKeywords`.
   ```

4. Find the "Harness Integration" section. After the `**Handoff**` bullet, add:

   ```markdown
   - **Session directory** — Session-scoped writes go to `.harness/sessions/<slug>/`. Structure: `handoff.json`, `state.json`, `artifacts.json` (registry of spec/plan paths and produced file lists). Global `.harness/handoff.json` is deprecated for session-aware invocations.
   ```

5. Run: `harness validate`
6. Commit: `feat(skills): session-scoped handoff in harness-planning`

---

### Task 3: Update harness-execution handoff to session-scoped

**Depends on:** none
**Files:** `agents/skills/claude-code/harness-execution/SKILL.md`

1. Open `agents/skills/claude-code/harness-execution/SKILL.md`.

2. Find step 4 in Phase 4 PERSIST (line ~224):

   ```
   4. **Write handoff** to `handoff.json`:
   ```

3. Replace the step 4 block with:

   ````markdown
   4. **Write handoff.** Write to the session-scoped path when session slug is known, otherwise fall back to global:
      - Session-scoped (preferred): `.harness/sessions/<session-slug>/handoff.json`
      - Global (fallback, **deprecated**): `.harness/handoff.json`

      > **[DEPRECATED]** Writing to `.harness/handoff.json` is deprecated. In autopilot sessions, always write to `.harness/sessions/<slug>/handoff.json`.

      ```json
      {
        "fromSkill": "harness-execution",
        "timestamp": "YYYY-MM-DDTHH:MM:SSZ",
        "summary": "Completed Tasks 1-3. Task 4 blocked on missing API endpoint.",
        "pendingTasks": ["Task 4", "Task 5"],
        "blockers": ["Task 4: /api/notifications endpoint not implemented"],
        "learnings": ["Date comparison needs UTC normalization"]
      }
      ```
   ````

   ```

   ```

4. Note that step 6 already says "All session-scoped files use `{sessionDir}/` when session is known, otherwise `.harness/`" (line ~202) — verify this is still accurate and that it covers `handoff.json`. If it does not explicitly call out `handoff.json` as part of `{sessionDir}/`, add a clarifying note: `"Session-scoped files include: handoff.json, state.json, learnings.md, artifacts.json."`.

5. Run: `harness validate`
6. Commit: `feat(skills): session-scoped handoff in harness-execution`

---

### Task 4: Update harness-verification handoff to session-scoped

**Depends on:** none
**Files:** `agents/skills/claude-code/harness-verification/SKILL.md`

1. Open `agents/skills/claude-code/harness-verification/SKILL.md`.

2. Find line ~170:

   ```
   Write `.harness/handoff.json`:
   ```

3. Replace the "Handoff and Transition" block's write instruction with:

   ````markdown
   Write handoff to the session-scoped path when session slug is known, otherwise fall back to global:

   - Session-scoped (preferred): `.harness/sessions/<session-slug>/handoff.json`
   - Global (fallback, **deprecated**): `.harness/handoff.json`

   > **[DEPRECATED]** Writing to `.harness/handoff.json` is deprecated. In autopilot sessions, always write to `.harness/sessions/<slug>/handoff.json` to prevent cross-session contamination.

   ```json
   {
     "fromSkill": "harness-verification",
     "phase": "COMPLETE",
     "summary": "<verdict summary>",
     "artifacts": ["<verified file paths>"],
     "verdict": "pass | fail",
     "gaps": ["<gap descriptions if any>"]
   }
   ```
   ````

   ```

   ```

4. In the "Harness Integration" section (or equivalent), add or update the session directory note:

   ```markdown
   - **Session directory** — `.harness/sessions/<slug>/` contains `handoff.json`, `state.json`, `artifacts.json` (spec path, plan path, file lists from execution). Do not write to global `.harness/handoff.json` when session slug is known.
   ```

5. Run: `harness validate`
6. Commit: `feat(skills): session-scoped handoff in harness-verification`

---

### Task 5: Update harness-code-review handoff to session-scoped

**Depends on:** none
**Files:** `agents/skills/claude-code/harness-code-review/SKILL.md`

1. Open `agents/skills/claude-code/harness-code-review/SKILL.md`.

2. Find line ~445:

   ```
   Write `.harness/handoff.json`:
   ```

3. Replace the "Handoff and Transition" block's write instruction with:

   ````markdown
   Write handoff to the session-scoped path when session slug is known, otherwise fall back to global:

   - Session-scoped (preferred): `.harness/sessions/<session-slug>/handoff.json`
   - Global (fallback, **deprecated**): `.harness/handoff.json`

   > **[DEPRECATED]** Writing to `.harness/handoff.json` is deprecated. In autopilot sessions, always write to `.harness/sessions/<slug>/handoff.json`.

   ```json
   {
     "fromSkill": "harness-code-review",
     "phase": "OUTPUT",
     "summary": "<assessment summary>",
     "assessment": "approve | request-changes | comment",
     "findingCount": { "critical": 0, "important": 0, "suggestion": 0 },
     "artifacts": ["<reviewed files>"]
   }
   ```
   ````

   ```

   ```

4. In the "Harness Integration" section, add:

   ```markdown
   - **Session directory** — `.harness/sessions/<slug>/` contains `handoff.json`, `state.json`, `artifacts.json` (spec/plan paths, reviewed file list). Write handoff to session scope when slug is known. Global `.harness/handoff.json` is deprecated for session-aware invocations.
   ```

5. Run: `harness validate`
6. Commit: `feat(skills): session-scoped handoff in harness-code-review`

---

### Task 6: Create cleanup-sessions CLI command (TDD)

**Depends on:** none
**Files:** `packages/cli/src/commands/cleanup-sessions.ts`, `packages/cli/tests/commands/cleanup-sessions.test.ts`

1. Create test file `packages/cli/tests/commands/cleanup-sessions.test.ts`:

   ```typescript
   // packages/cli/tests/commands/cleanup-sessions.test.ts
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import * as fs from 'fs';
   import * as path from 'path';
   import * as os from 'os';
   import { runCleanupSessions } from '../../src/commands/cleanup-sessions';

   describe('cleanup-sessions command', () => {
     let tmpDir: string;
     let sessionsDir: string;

     beforeEach(() => {
       tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-test-'));
       sessionsDir = path.join(tmpDir, '.harness', 'sessions');
       fs.mkdirSync(sessionsDir, { recursive: true });
     });

     afterEach(() => {
       fs.rmSync(tmpDir, { recursive: true, force: true });
     });

     function createSession(name: string, ageMs: number): void {
       const sessionDir = path.join(sessionsDir, name);
       fs.mkdirSync(sessionDir, { recursive: true });
       const handoffPath = path.join(sessionDir, 'handoff.json');
       fs.writeFileSync(handoffPath, JSON.stringify({ fromSkill: 'harness-planning' }));
       // Backdate the mtime
       const pastTime = new Date(Date.now() - ageMs);
       fs.utimesSync(handoffPath, pastTime, pastTime);
       fs.utimesSync(sessionDir, pastTime, pastTime);
     }

     it('returns empty result when no sessions exist', async () => {
       const result = await runCleanupSessions({ cwd: tmpDir, dryRun: false });
       expect(result.ok).toBe(true);
       if (result.ok) {
         expect(result.value.removed).toEqual([]);
         expect(result.value.kept).toEqual([]);
       }
     });

     it('identifies stale sessions (older than 24h) in dry-run mode', async () => {
       createSession('stale-session', 25 * 60 * 60 * 1000); // 25 hours ago
       createSession('fresh-session', 1 * 60 * 60 * 1000); // 1 hour ago
       const result = await runCleanupSessions({ cwd: tmpDir, dryRun: true });
       expect(result.ok).toBe(true);
       if (result.ok) {
         expect(result.value.removed).toContain('stale-session');
         expect(result.value.kept).toContain('fresh-session');
         // dry-run: directory should still exist
         expect(fs.existsSync(path.join(sessionsDir, 'stale-session'))).toBe(true);
       }
     });

     it('deletes stale sessions when not in dry-run mode', async () => {
       createSession('stale-session', 25 * 60 * 60 * 1000);
       createSession('fresh-session', 1 * 60 * 60 * 1000);
       const result = await runCleanupSessions({ cwd: tmpDir, dryRun: false });
       expect(result.ok).toBe(true);
       if (result.ok) {
         expect(result.value.removed).toContain('stale-session');
         expect(result.value.kept).toContain('fresh-session');
         expect(fs.existsSync(path.join(sessionsDir, 'stale-session'))).toBe(false);
         expect(fs.existsSync(path.join(sessionsDir, 'fresh-session'))).toBe(true);
       }
     });

     it('returns ok with empty result when sessions directory does not exist', async () => {
       fs.rmSync(sessionsDir, { recursive: true, force: true });
       const result = await runCleanupSessions({ cwd: tmpDir, dryRun: false });
       expect(result.ok).toBe(true);
       if (result.ok) {
         expect(result.value.removed).toEqual([]);
         expect(result.value.kept).toEqual([]);
       }
     });
   });
   ```

2. Run test: `cd /Users/cwarner/Projects/harness-engineering && pnpm vitest run packages/cli/tests/commands/cleanup-sessions.test.ts`

3. Observe failure: `runCleanupSessions is not defined` (module not found).

4. Create implementation `packages/cli/src/commands/cleanup-sessions.ts`:

   ```typescript
   // packages/cli/src/commands/cleanup-sessions.ts
   import { Command } from 'commander';
   import * as fs from 'fs';
   import * as path from 'path';
   import type { Result } from '@harness-engineering/core';
   import { Ok, Err } from '@harness-engineering/core';
   import { logger } from '../output/logger';
   import { CLIError, ExitCode } from '../utils/errors';

   const STALE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

   interface CleanupSessionsOptions {
     cwd?: string;
     dryRun?: boolean;
   }

   interface CleanupSessionsResult {
     removed: string[];
     kept: string[];
   }

   function getMostRecentMtime(dirPath: string): number {
     let latest = 0;
     try {
       const entries = fs.readdirSync(dirPath, { withFileTypes: true });
       for (const entry of entries) {
         const fullPath = path.join(dirPath, entry.name);
         const stat = fs.statSync(fullPath);
         if (stat.mtimeMs > latest) latest = stat.mtimeMs;
       }
       // Also check the directory itself
       const dirStat = fs.statSync(dirPath);
       if (dirStat.mtimeMs > latest) latest = dirStat.mtimeMs;
     } catch {
       // If we can't stat, treat as old
     }
     return latest;
   }

   export async function runCleanupSessions(
     options: CleanupSessionsOptions
   ): Promise<Result<CleanupSessionsResult, CLIError>> {
     const cwd = options.cwd ?? process.cwd();
     const dryRun = options.dryRun ?? false;
     const sessionsDir = path.join(cwd, '.harness', 'sessions');

     const result: CleanupSessionsResult = { removed: [], kept: [] };

     if (!fs.existsSync(sessionsDir)) {
       return Ok(result);
     }

     let entries: fs.Dirent[];
     try {
       entries = fs.readdirSync(sessionsDir, { withFileTypes: true });
     } catch (err) {
       return Err(
         new CLIError(
           `Failed to read sessions directory: ${err instanceof Error ? err.message : String(err)}`,
           ExitCode.ERROR
         )
       );
     }

     const now = Date.now();

     for (const entry of entries) {
       if (!entry.isDirectory()) continue;
       const sessionPath = path.join(sessionsDir, entry.name);
       const mostRecent = getMostRecentMtime(sessionPath);
       const ageMs = now - mostRecent;

       if (ageMs > STALE_TTL_MS) {
         result.removed.push(entry.name);
         if (!dryRun) {
           try {
             fs.rmSync(sessionPath, { recursive: true, force: true });
           } catch (err) {
             return Err(
               new CLIError(
                 `Failed to remove session ${entry.name}: ${err instanceof Error ? err.message : String(err)}`,
                 ExitCode.ERROR
               )
             );
           }
         }
       } else {
         result.kept.push(entry.name);
       }
     }

     return Ok(result);
   }

   export function createCleanupSessionsCommand(): Command {
     const command = new Command('cleanup-sessions')
       .description('Remove stale session directories from .harness/sessions/ (no write in 24h)')
       .option('--dry-run', 'List stale sessions without deleting them', false)
       .option('--path <path>', 'Project root path', '.')
       .action(async (opts, cmd) => {
         const globalOpts = cmd.optsWithGlobals();
         const cwd = path.resolve(opts.path);

         const result = await runCleanupSessions({
           cwd,
           dryRun: opts.dryRun,
         });

         if (!result.ok) {
           logger.error(result.error.message);
           process.exit(result.error.exitCode);
           return;
         }

         const { removed, kept } = result.value;

         if (globalOpts.json) {
           console.log(JSON.stringify({ removed, kept, dryRun: opts.dryRun }, null, 2));
         } else {
           if (removed.length === 0 && kept.length === 0) {
             console.log('No sessions found.');
           } else {
             if (removed.length > 0) {
               const label = opts.dryRun ? 'Stale (would remove)' : 'Removed';
               console.log(`\n${label} (${removed.length}):`);
               for (const s of removed) console.log(`  - ${s}`);
             }
             if (kept.length > 0) {
               console.log(`\nKept (${kept.length}):`);
               for (const s of kept) console.log(`  - ${s}`);
             }
             if (!opts.dryRun && removed.length > 0) {
               console.log(`\nCleaned up ${removed.length} stale session(s).`);
             }
           }
         }

         process.exit(ExitCode.SUCCESS);
       });

     return command;
   }
   ```

5. Run test: `cd /Users/cwarner/Projects/harness-engineering && pnpm vitest run packages/cli/tests/commands/cleanup-sessions.test.ts`

6. Observe: all 4 tests pass.

7. Run: `harness validate`

8. Commit: `feat(cli): add cleanup-sessions command with --dry-run flag`

---

### Task 7: Register cleanup-sessions in CLI registry

**Depends on:** Task 6
**Files:** `packages/cli/src/commands/_registry.ts`

> Note: `_registry.ts` line 1 says "AUTO-GENERATED — do not edit. Run `pnpm run generate-barrel-exports` to regenerate." Check whether the generator will pick up the new command automatically.

1. Run the barrel generator: `cd /Users/cwarner/Projects/harness-engineering && pnpm run generate-barrel-exports`

2. Verify `_registry.ts` now includes:

   ```typescript
   import { createCleanupSessionsCommand } from './cleanup-sessions';
   ```

   and `createCleanupSessionsCommand` appears in the `commandCreators` array.

3. If the generator did NOT pick it up automatically (e.g., it requires a specific export naming convention), manually add to `_registry.ts`:
   - Add import after line ~16 (near `createCleanupCommand`):
     ```typescript
     import { createCleanupSessionsCommand } from './cleanup-sessions';
     ```
   - Add `createCleanupSessionsCommand,` to the `commandCreators` array in alphabetical order (after `createCleanupCommand`).

4. Run: `cd /Users/cwarner/Projects/harness-engineering && pnpm vitest run packages/cli/tests/commands/cleanup-sessions.test.ts`

5. Observe: still passes.

6. Run: `harness validate`

7. Commit: `feat(cli): register cleanup-sessions command in CLI registry`

---

### Task 8: Verify end-to-end and write delta doc

[checkpoint:human-verify]

**Depends on:** Tasks 1–7
**Files:** `docs/changes/pipeline-token-optimization/delta.md` (CREATE)

1. Run full test suite for the CLI package: `cd /Users/cwarner/Projects/harness-engineering && pnpm vitest run --reporter verbose 2>&1 | tail -20`

2. Run: `harness validate`

3. Verify the new command is discoverable: `harness cleanup-sessions --help`

4. Create `docs/changes/pipeline-token-optimization/delta.md`:

   ```markdown
   # Delta: Session-Scoped Handoff (Phase 2)

   **Date:** 2026-04-10
   **Plan:** docs/plans/2026-04-10-session-scoped-handoff-plan.md

   ## Changes

   ### Pipeline Skills

   - [MODIFIED] harness-brainstorming: handoff writes to `.harness/sessions/<slug>/handoff.json` when session slug is known
   - [MODIFIED] harness-planning: handoff writes to `.harness/sessions/<slug>/handoff.json` when session slug is known
   - [MODIFIED] harness-execution: handoff writes to `.harness/sessions/<slug>/handoff.json` when session slug is known
   - [MODIFIED] harness-verification: handoff writes to `.harness/sessions/<slug>/handoff.json` when session slug is known
   - [MODIFIED] harness-code-review: handoff writes to `.harness/sessions/<slug>/handoff.json` when session slug is known
   - [ADDED] All 5 skills: explicit deprecation notice for global `.harness/handoff.json` writes
   - [ADDED] All 5 skills: `artifacts.json` documented in session directory structure

   ### CLI

   - [ADDED] `harness cleanup-sessions` — removes session directories where most recent file write is older than 24h
   - [ADDED] `harness cleanup-sessions --dry-run` — lists stale sessions without deleting

   ## Invariants

   - Global `.harness/handoff.json` remains supported as a fallback for standalone (non-session) invocations
   - The session directory structure is: `handoff.json`, `state.json`, `artifacts.json`
   - Stale TTL is 24 hours based on most recent file mtime within the session directory
   ```

5. Run: `harness validate`

6. Commit: `docs(pipeline-token-optimization): add phase 2 delta and verify end-to-end`

---

## Sequence Summary

| Task | Description                           | Depends On | Parallelizable      |
| ---- | ------------------------------------- | ---------- | ------------------- |
| 1    | harness-brainstorming skill update    | none       | yes (with 2-5)      |
| 2    | harness-planning skill update         | none       | yes (with 1, 3-5)   |
| 3    | harness-execution skill update        | none       | yes (with 1-2, 4-5) |
| 4    | harness-verification skill update     | none       | yes (with 1-3, 5)   |
| 5    | harness-code-review skill update      | none       | yes (with 1-4)      |
| 6    | Create cleanup-sessions command (TDD) | none       | yes (with 1-5)      |
| 7    | Register cleanup-sessions in registry | Task 6     | no                  |
| 8    | Verify end-to-end, write delta doc    | Tasks 1-7  | no                  |

Tasks 1–6 are fully parallelizable. Tasks 7 and 8 are sequential after their dependencies.

**Estimated total:** 8 tasks, ~30 minutes

## Observable Truths Traced to Tasks

| Observable Truth                                  | Delivered By        |
| ------------------------------------------------- | ------------------- |
| Pipeline skills write to session-scoped path      | Tasks 1, 2, 3, 4, 5 |
| Deprecation notices present in all 5 skills       | Tasks 1, 2, 3, 4, 5 |
| `artifacts.json` documented in session pattern    | Tasks 1, 2, 3, 4, 5 |
| `harness cleanup-sessions` removes stale sessions | Task 6              |
| `--dry-run` lists without deleting                | Task 6              |
| Test suite passes                                 | Tasks 6, 8          |
| `harness validate` passes                         | Tasks 1-8           |

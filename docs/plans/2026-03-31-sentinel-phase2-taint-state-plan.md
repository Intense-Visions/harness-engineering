# Plan: Sentinel Phase 2 — Taint State Management

**Date:** 2026-03-31
**Spec:** docs/changes/sentinel-prompt-injection-defense/proposal.md
**Estimated tasks:** 6
**Estimated time:** 25 minutes

## Goal

Implement session-scoped taint state management so that injection findings from Phase 1 can mark sessions as tainted, and downstream hooks/middleware can read, check expiry, and clear that taint state.

## Observable Truths (Acceptance Criteria)

1. When `writeTaint()` is called with a session ID and findings, the system shall create `.harness/session-taint-{sessionId}.json` with correct JSON structure including `sessionId`, `taintedAt`, `expiresAt` (30 min from now), `reason`, `severity`, and `findings` array.
2. When `readTaint()` is called for a session whose taint file contains malformed JSON, the system shall delete the file and return `null` (fail-open).
3. When `readTaint()` is called for a session whose `expiresAt` is in the past, the system shall delete the taint file and return `null`.
4. When `isTainted()` is called for an expired taint, the system shall return `{ tainted: false, expired: true }` so the caller can emit the expiry notice.
5. When `clearTaint()` is called with a session ID, the system shall delete that session's taint file. When called without a session ID, the system shall delete all `session-taint-*.json` files in `.harness/`.
6. `harness taint clear` removes the taint file and logs confirmation to stdout. `harness taint clear --session abc` removes only that session's taint file.
7. When taint files exist for two different session IDs, clearing one shall not affect the other (SC17: concurrent session independence).
8. `npx vitest run packages/core/tests/security/taint.test.ts` passes with all lifecycle tests.
9. `harness validate` passes after all tasks complete.

## File Map

- CREATE `packages/core/src/security/taint.ts`
- CREATE `packages/core/tests/security/taint.test.ts`
- MODIFY `packages/core/src/security/index.ts` (add taint exports)
- CREATE `packages/cli/src/commands/taint/index.ts`
- CREATE `packages/cli/src/commands/taint/clear.ts`
- MODIFY `packages/cli/src/index.ts` (register taint command)

## Tasks

### Task 1: Define taint types and core read/write functions (TDD)

**Depends on:** none
**Files:** `packages/core/tests/security/taint.test.ts`, `packages/core/src/security/taint.ts`

1. Create test file `packages/core/tests/security/taint.test.ts`:

   ```typescript
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import * as fs from 'fs';
   import * as path from 'path';
   import * as os from 'os';
   import { writeTaint, readTaint } from '../../src/security/taint';
   import type { TaintState } from '../../src/security/taint';
   import type { InjectionFinding } from '../../src/security/injection-patterns';

   describe('taint state', () => {
     let tmpDir: string;

     beforeEach(() => {
       tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'taint-test-'));
     });

     afterEach(() => {
       fs.rmSync(tmpDir, { recursive: true, force: true });
     });

     describe('writeTaint', () => {
       it('creates .harness directory if it does not exist', () => {
         const findings: InjectionFinding[] = [
           { severity: 'high', ruleId: 'INJ-REROL-001', match: 'ignore previous instructions' },
         ];
         writeTaint(tmpDir, 'session-abc', {
           reason: 'Injection detected',
           severity: 'high',
           findings,
           source: 'PostToolUse result',
         });
         const harnessDir = path.join(tmpDir, '.harness');
         expect(fs.existsSync(harnessDir)).toBe(true);
       });

       it('creates taint file with correct structure', () => {
         const findings: InjectionFinding[] = [
           { severity: 'high', ruleId: 'INJ-REROL-001', match: 'ignore previous instructions' },
         ];
         writeTaint(tmpDir, 'session-abc', {
           reason: 'Injection detected',
           severity: 'high',
           findings,
           source: 'PostToolUse result',
         });
         const filePath = path.join(tmpDir, '.harness', 'session-taint-session-abc.json');
         expect(fs.existsSync(filePath)).toBe(true);
         const data: TaintState = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
         expect(data.sessionId).toBe('session-abc');
         expect(data.reason).toBe('Injection detected');
         expect(data.severity).toBe('high');
         expect(data.findings).toHaveLength(1);
         expect(data.findings[0].ruleId).toBe('INJ-REROL-001');
         expect(data.findings[0].source).toBe('PostToolUse result');
         expect(new Date(data.taintedAt).getTime()).toBeLessThanOrEqual(Date.now());
         // expiresAt should be ~30 min from taintedAt
         const diff = new Date(data.expiresAt).getTime() - new Date(data.taintedAt).getTime();
         expect(diff).toBe(30 * 60 * 1000);
       });

       it('uses "default" session ID when empty string provided', () => {
         writeTaint(tmpDir, '', {
           reason: 'test',
           severity: 'medium',
           findings: [],
           source: 'test',
         });
         const filePath = path.join(tmpDir, '.harness', 'session-taint-default.json');
         expect(fs.existsSync(filePath)).toBe(true);
         const data: TaintState = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
         expect(data.sessionId).toBe('default');
       });

       it('appends findings to existing taint file', () => {
         const finding1: InjectionFinding[] = [
           { severity: 'high', ruleId: 'INJ-REROL-001', match: 'ignore previous' },
         ];
         const finding2: InjectionFinding[] = [
           { severity: 'medium', ruleId: 'INJ-IND-001', match: 'when the user asks' },
         ];
         writeTaint(tmpDir, 'sess1', {
           reason: 'first',
           severity: 'high',
           findings: finding1,
           source: 'test',
         });
         writeTaint(tmpDir, 'sess1', {
           reason: 'second',
           severity: 'medium',
           findings: finding2,
           source: 'test',
         });
         const filePath = path.join(tmpDir, '.harness', 'session-taint-sess1.json');
         const data: TaintState = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
         expect(data.findings).toHaveLength(2);
         // severity should remain 'high' (highest seen)
         expect(data.severity).toBe('high');
       });
     });

     describe('readTaint', () => {
       it('returns null when no taint file exists', () => {
         const result = readTaint(tmpDir, 'nonexistent');
         expect(result).toBeNull();
       });

       it('returns taint state when file exists and is valid', () => {
         writeTaint(tmpDir, 'sess1', {
           reason: 'test',
           severity: 'high',
           findings: [{ severity: 'high', ruleId: 'INJ-UNI-001', match: 'zw char' }],
           source: 'test',
         });
         const result = readTaint(tmpDir, 'sess1');
         expect(result).not.toBeNull();
         expect(result!.sessionId).toBe('sess1');
       });

       it('deletes malformed JSON and returns null (fail-open)', () => {
         const harnessDir = path.join(tmpDir, '.harness');
         fs.mkdirSync(harnessDir, { recursive: true });
         const filePath = path.join(harnessDir, 'session-taint-bad.json');
         fs.writeFileSync(filePath, '{not valid json!!!');
         const result = readTaint(tmpDir, 'bad');
         expect(result).toBeNull();
         expect(fs.existsSync(filePath)).toBe(false);
       });
     });
   });
   ```

2. Run test: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/core/tests/security/taint.test.ts`
3. Observe failure: module `../../src/security/taint` does not exist.

4. Create implementation `packages/core/src/security/taint.ts`:

   ```typescript
   /**
    * Session-scoped taint state management.
    *
    * Taint files are the single source of truth for whether a session is
    * considered compromised by injection patterns. Pure filesystem operations --
    * hooks and middleware call these functions.
    */

   import * as fs from 'fs';
   import * as path from 'path';
   import type { InjectionFinding } from './injection-patterns';

   /** Default taint duration in milliseconds (30 minutes). */
   const TAINT_DURATION_MS = 30 * 60 * 1000;

   /** A single finding stored in the taint file, enriched with source and timestamp. */
   export interface TaintFinding {
     ruleId: string;
     severity: string;
     match: string;
     source: string;
     detectedAt: string;
   }

   /** The JSON structure persisted to `.harness/session-taint-{sessionId}.json`. */
   export interface TaintState {
     sessionId: string;
     taintedAt: string;
     expiresAt: string;
     reason: string;
     severity: 'high' | 'medium';
     findings: TaintFinding[];
   }

   /** Options for writing taint state. */
   export interface WriteTaintOptions {
     reason: string;
     severity: 'high' | 'medium';
     findings: InjectionFinding[];
     source: string;
   }

   /** Result of checking taint status. */
   export interface TaintCheckResult {
     tainted: boolean;
     expired: boolean;
     state: TaintState | null;
   }

   /**
    * Resolve the taint file path for a given session.
    * Falls back to 'default' if sessionId is empty/undefined.
    */
   export function taintFilePath(workspaceRoot: string, sessionId: string): string {
     const resolvedId = sessionId || 'default';
     return path.join(workspaceRoot, '.harness', `session-taint-${resolvedId}.json`);
   }

   /**
    * Write or update a taint file for the given session.
    *
    * If a taint file already exists, appends new findings and keeps the
    * highest severity. The expiresAt is NOT reset on update -- it remains
    * anchored to the original taint time.
    */
   export function writeTaint(
     workspaceRoot: string,
     sessionId: string,
     options: WriteTaintOptions
   ): TaintState {
     const resolvedId = sessionId || 'default';
     const harnessDir = path.join(workspaceRoot, '.harness');
     if (!fs.existsSync(harnessDir)) {
       fs.mkdirSync(harnessDir, { recursive: true });
     }

     const filePath = taintFilePath(workspaceRoot, resolvedId);
     const now = new Date().toISOString();

     const newFindings: TaintFinding[] = options.findings.map((f) => ({
       ruleId: f.ruleId,
       severity: f.severity,
       match: f.match,
       source: options.source,
       detectedAt: now,
     }));

     // Check for existing taint
     let existing: TaintState | null = null;
     if (fs.existsSync(filePath)) {
       try {
         existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
       } catch {
         // Malformed -- overwrite
         existing = null;
       }
     }

     const severityRank = { high: 0, medium: 1 } as const;
     const highestSeverity =
       existing && severityRank[existing.severity] < severityRank[options.severity]
         ? existing.severity
         : options.severity;

     const state: TaintState = {
       sessionId: resolvedId,
       taintedAt: existing?.taintedAt ?? now,
       expiresAt: existing?.expiresAt ?? new Date(Date.now() + TAINT_DURATION_MS).toISOString(),
       reason: options.reason,
       severity: highestSeverity,
       findings: [...(existing?.findings ?? []), ...newFindings],
     };

     fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8');
     return state;
   }

   /**
    * Read the taint state for a session.
    *
    * Returns null if no taint file exists.
    * Deletes and returns null if the file contains malformed JSON (fail-open).
    * Does NOT check expiry -- use isTainted() for expiry-aware checks.
    */
   export function readTaint(workspaceRoot: string, sessionId: string): TaintState | null {
     const filePath = taintFilePath(workspaceRoot, sessionId || 'default');
     if (!fs.existsSync(filePath)) {
       return null;
     }

     try {
       const raw = fs.readFileSync(filePath, 'utf-8');
       return JSON.parse(raw) as TaintState;
     } catch {
       // Malformed JSON -- delete and fail-open
       try {
         fs.unlinkSync(filePath);
       } catch {
         // Ignore unlink errors
       }
       return null;
     }
   }

   /**
    * Check whether a session is currently tainted.
    *
    * Handles expiry: if expiresAt < now, deletes the taint file and returns
    * { tainted: false, expired: true } so the caller can emit the expiry notice.
    */
   export function isTainted(workspaceRoot: string, sessionId: string): TaintCheckResult {
     const state = readTaint(workspaceRoot, sessionId);
     if (!state) {
       return { tainted: false, expired: false, state: null };
     }

     if (new Date(state.expiresAt).getTime() < Date.now()) {
       // Expired -- delete and signal expiry
       const filePath = taintFilePath(workspaceRoot, sessionId || 'default');
       try {
         fs.unlinkSync(filePath);
       } catch {
         // Ignore
       }
       return { tainted: false, expired: true, state };
     }

     return { tainted: true, expired: false, state };
   }

   /**
    * Clear taint for a specific session, or all sessions if no sessionId provided.
    *
    * Returns the number of taint files removed.
    */
   export function clearTaint(workspaceRoot: string, sessionId?: string): number {
     const harnessDir = path.join(workspaceRoot, '.harness');
     if (!fs.existsSync(harnessDir)) {
       return 0;
     }

     if (sessionId) {
       const filePath = taintFilePath(workspaceRoot, sessionId);
       if (fs.existsSync(filePath)) {
         fs.unlinkSync(filePath);
         return 1;
       }
       return 0;
     }

     // Clear all taint files
     const files = fs
       .readdirSync(harnessDir)
       .filter((f) => f.startsWith('session-taint-') && f.endsWith('.json'));
     for (const file of files) {
       fs.unlinkSync(path.join(harnessDir, file));
     }
     return files.length;
   }
   ```

5. Run test: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/core/tests/security/taint.test.ts`
6. Observe: all tests pass.
7. Run: `harness validate`
8. Commit: `feat(security): add taint state read/write with fail-open and session fallback`

---

### Task 2: Add expiry and isTainted tests (TDD)

**Depends on:** Task 1
**Files:** `packages/core/tests/security/taint.test.ts`, `packages/core/src/security/taint.ts`

1. Add test cases to `packages/core/tests/security/taint.test.ts` (append inside the outer `describe`):

   ```typescript
   describe('isTainted', () => {
     it('returns { tainted: false, expired: false } when no taint file exists', () => {
       const result = isTainted(tmpDir, 'no-session');
       expect(result.tainted).toBe(false);
       expect(result.expired).toBe(false);
       expect(result.state).toBeNull();
     });

     it('returns { tainted: true } for a valid, non-expired taint', () => {
       writeTaint(tmpDir, 'active', {
         reason: 'test',
         severity: 'medium',
         findings: [{ severity: 'medium', ruleId: 'INJ-IND-001', match: 'test' }],
         source: 'test',
       });
       const result = isTainted(tmpDir, 'active');
       expect(result.tainted).toBe(true);
       expect(result.expired).toBe(false);
       expect(result.state).not.toBeNull();
     });

     it('returns { tainted: false, expired: true } and deletes file when expired', () => {
       // Write taint, then manually set expiresAt to the past
       writeTaint(tmpDir, 'expired-sess', {
         reason: 'test',
         severity: 'high',
         findings: [{ severity: 'high', ruleId: 'INJ-UNI-001', match: 'zw' }],
         source: 'test',
       });
       const filePath = taintFilePath(tmpDir, 'expired-sess');
       const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
       data.expiresAt = new Date(Date.now() - 1000).toISOString();
       fs.writeFileSync(filePath, JSON.stringify(data));

       const result = isTainted(tmpDir, 'expired-sess');
       expect(result.tainted).toBe(false);
       expect(result.expired).toBe(true);
       expect(result.state).not.toBeNull();
       expect(result.state!.sessionId).toBe('expired-sess');
       // File should be deleted
       expect(fs.existsSync(filePath)).toBe(false);
     });

     it('handles malformed JSON as not tainted (fail-open)', () => {
       const harnessDir = path.join(tmpDir, '.harness');
       fs.mkdirSync(harnessDir, { recursive: true });
       fs.writeFileSync(path.join(harnessDir, 'session-taint-corrupt.json'), 'NOT JSON');
       const result = isTainted(tmpDir, 'corrupt');
       expect(result.tainted).toBe(false);
       expect(result.expired).toBe(false);
     });
   });
   ```

2. Update the import at the top of the test file to include `isTainted` and `taintFilePath`:

   ```typescript
   import { writeTaint, readTaint, isTainted, taintFilePath } from '../../src/security/taint';
   ```

3. Run test: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/core/tests/security/taint.test.ts`
4. Observe: all tests pass (implementation already exists from Task 1).
5. Run: `harness validate`
6. Commit: `test(security): add isTainted expiry and fail-open lifecycle tests`

---

### Task 3: Add clearTaint and concurrent session tests (TDD)

**Depends on:** Task 1
**Files:** `packages/core/tests/security/taint.test.ts`

1. Add test cases to `packages/core/tests/security/taint.test.ts` (append inside the outer `describe`):

   ```typescript
   describe('clearTaint', () => {
     it('removes a specific session taint file', () => {
       writeTaint(tmpDir, 'to-clear', {
         reason: 'test',
         severity: 'medium',
         findings: [{ severity: 'medium', ruleId: 'INJ-SOC-001', match: 'urgent' }],
         source: 'test',
       });
       const removed = clearTaint(tmpDir, 'to-clear');
       expect(removed).toBe(1);
       expect(readTaint(tmpDir, 'to-clear')).toBeNull();
     });

     it('returns 0 when session taint file does not exist', () => {
       const removed = clearTaint(tmpDir, 'nonexistent');
       expect(removed).toBe(0);
     });

     it('returns 0 when .harness directory does not exist', () => {
       const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'taint-empty-'));
       try {
         const removed = clearTaint(emptyDir);
         expect(removed).toBe(0);
       } finally {
         fs.rmSync(emptyDir, { recursive: true, force: true });
       }
     });

     it('clears all taint files when no sessionId provided', () => {
       writeTaint(tmpDir, 'sess-a', {
         reason: 'test',
         severity: 'high',
         findings: [{ severity: 'high', ruleId: 'INJ-UNI-001', match: 'a' }],
         source: 'test',
       });
       writeTaint(tmpDir, 'sess-b', {
         reason: 'test',
         severity: 'medium',
         findings: [{ severity: 'medium', ruleId: 'INJ-IND-001', match: 'b' }],
         source: 'test',
       });
       const removed = clearTaint(tmpDir);
       expect(removed).toBe(2);
       expect(readTaint(tmpDir, 'sess-a')).toBeNull();
       expect(readTaint(tmpDir, 'sess-b')).toBeNull();
     });
   });

   describe('concurrent session independence (SC17)', () => {
     it('taint files for different sessions are independent', () => {
       writeTaint(tmpDir, 'agent-1', {
         reason: 'agent 1 detected injection',
         severity: 'high',
         findings: [{ severity: 'high', ruleId: 'INJ-REROL-001', match: 'ignore' }],
         source: 'test',
       });
       writeTaint(tmpDir, 'agent-2', {
         reason: 'agent 2 detected injection',
         severity: 'medium',
         findings: [{ severity: 'medium', ruleId: 'INJ-IND-001', match: 'include' }],
         source: 'test',
       });

       // Clear agent-1, agent-2 should remain
       clearTaint(tmpDir, 'agent-1');
       expect(readTaint(tmpDir, 'agent-1')).toBeNull();
       const agent2 = readTaint(tmpDir, 'agent-2');
       expect(agent2).not.toBeNull();
       expect(agent2!.sessionId).toBe('agent-2');
     });

     it('isTainted is independent per session', () => {
       writeTaint(tmpDir, 'tainted-sess', {
         reason: 'test',
         severity: 'high',
         findings: [{ severity: 'high', ruleId: 'INJ-UNI-001', match: 'zw' }],
         source: 'test',
       });
       expect(isTainted(tmpDir, 'tainted-sess').tainted).toBe(true);
       expect(isTainted(tmpDir, 'clean-sess').tainted).toBe(false);
     });
   });
   ```

2. Update the import to include `clearTaint`:

   ```typescript
   import {
     writeTaint,
     readTaint,
     isTainted,
     clearTaint,
     taintFilePath,
   } from '../../src/security/taint';
   ```

3. Run test: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/core/tests/security/taint.test.ts`
4. Observe: all tests pass.
5. Run: `harness validate`
6. Commit: `test(security): add clearTaint and concurrent session independence tests`

---

### Task 4: Export taint module from security index

**Depends on:** Task 1
**Files:** `packages/core/src/security/index.ts`

1. Add the following exports to `packages/core/src/security/index.ts` after the injection-patterns exports:

   ```typescript
   /**
    * Session-scoped taint state management for sentinel injection defense.
    */
   export { writeTaint, readTaint, isTainted, clearTaint, taintFilePath } from './taint';
   export type { TaintState, TaintFinding, TaintCheckResult, WriteTaintOptions } from './taint';
   ```

2. Run test: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/core/tests/security/taint.test.ts`
3. Observe: still passes.
4. Run: `harness validate`
5. Run: `harness check-deps`
6. Commit: `feat(security): export taint module from security index`

---

### Task 5: Create `harness taint clear` CLI command

**Depends on:** Task 4
**Files:** `packages/cli/src/commands/taint/clear.ts`, `packages/cli/src/commands/taint/index.ts`

1. Create `packages/cli/src/commands/taint/index.ts`:

   ```typescript
   import { Command } from 'commander';
   import { createClearCommand } from './clear';

   export function createTaintCommand(): Command {
     const command = new Command('taint').description('Manage sentinel session taint state');
     command.addCommand(createClearCommand());
     return command;
   }
   ```

2. Create `packages/cli/src/commands/taint/clear.ts`:

   ```typescript
   import { Command } from 'commander';
   import * as path from 'path';
   import { clearTaint, readTaint } from '@harness-engineering/core';
   import { logger } from '../../output/logger';
   import { ExitCode } from '../../utils/errors';

   export function createClearCommand(): Command {
     return new Command('clear')
       .description('Clear session taint state (removes taint files)')
       .option('--session <id>', 'Clear taint for a specific session ID only')
       .option('--path <path>', 'Workspace root path', '.')
       .action(async (opts) => {
         const workspaceRoot = path.resolve(opts.path);

         if (opts.session) {
           // Check if taint exists before clearing for better messaging
           const existing = readTaint(workspaceRoot, opts.session);
           if (!existing) {
             logger.info(`No taint found for session "${opts.session}".`);
             process.exit(ExitCode.SUCCESS);
             return;
           }
           const removed = clearTaint(workspaceRoot, opts.session);
           if (removed > 0) {
             logger.info(
               `Sentinel: taint cleared for session "${opts.session}". Destructive operations re-enabled.`
             );
           }
         } else {
           const removed = clearTaint(workspaceRoot);
           if (removed === 0) {
             logger.info('No taint files found.');
           } else {
             logger.info(
               `Sentinel: cleared ${removed} taint file${removed === 1 ? '' : 's'}. Destructive operations re-enabled.`
             );
           }
         }
         process.exit(ExitCode.SUCCESS);
       });
   }
   ```

3. Run: `harness validate`
4. Commit: `feat(cli): add harness taint clear command`

---

### Task 6: Register taint command in CLI entry point

**Depends on:** Task 5
**Files:** `packages/cli/src/index.ts`

1. Add import to `packages/cli/src/index.ts` after the existing hooks import (line 35):

   ```typescript
   import { createTaintCommand } from './commands/taint';
   ```

2. Add command registration after the hooks `addCommand` line (after line 100):

   ```typescript
   program.addCommand(createTaintCommand());
   ```

3. Run: `cd /Users/cwarner/Projects/harness-engineering && npx harness taint clear --help`
4. Observe: help output shows `clear` subcommand with `--session` and `--path` options.
5. Run: `harness validate`
6. Run: `harness check-deps`
7. Commit: `feat(cli): register taint command in CLI entry point`

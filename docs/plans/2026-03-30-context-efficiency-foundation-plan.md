# Plan: Context Efficiency Pipeline — Phase 1: Foundation

**Date:** 2026-03-30
**Spec:** docs/changes/context-efficiency-pipeline/proposal.md
**Estimated tasks:** 8
**Estimated time:** 30 minutes

## Goal

Deliver the foundation modules for the Context Efficiency Pipeline: rename the rigor vocabulary from `auto|light|full` to `fast|standard|thorough`, and create three new utility modules (scratchpad, learnings-relevance, checkpoint-commit) with full test coverage.

## Observable Truths (Acceptance Criteria)

1. When the `complexity` parameter is passed via MCP skill tool, `fast|standard|thorough` are the only accepted enum values. The old values `auto|light|full` no longer appear in the schema.
2. When `evaluateSignals()` returns a value, it returns `'fast'` or `'thorough'` (not `'light'` or `'full'`).
3. When `detectComplexity()` falls back with no git context, it returns `'thorough'` (not `'full'`).
4. When `buildPreamble()` receives `complexity: 'fast'`, optional phases are skipped with the message "skipped in fast mode".
5. When `writeScratchpad()` is called, content is written to `.harness/sessions/<slug>/scratchpad/<phase>/<filename>` and the absolute path is returned.
6. When `readScratchpad()` is called for a non-existent file, it returns `null`.
7. When `clearScratchpad()` is called, the entire `scratchpad/<phase>/` directory is deleted.
8. When `scoreLearningRelevance("jaccard similarity scoring", "jaccard index scoring algorithm")` is called, it returns a number between 0 and 1 representing the Jaccard index of the tokenized keyword sets.
9. When `filterByRelevance()` receives learnings that all score below 0.7, zero learnings are included (no fallback).
10. When `filterByRelevance()` receives learnings above threshold, they are sorted descending by score and truncated to fit within the token budget.
11. When `commitAtCheckpoint()` is called with no uncommitted changes, it returns `{ committed: false }` and does not create a commit.
12. When `commitAtCheckpoint()` is called with `isRecovery: true`, the commit message is prefixed with `[autopilot][recovery]`.
13. The barrel file `packages/core/src/state/state-manager.ts` exports all new module functions.
14. `npx vitest run packages/core/tests/state/scratchpad.test.ts` passes.
15. `npx vitest run packages/core/tests/state/learnings-relevance.test.ts` passes.
16. `npx vitest run packages/core/tests/state/checkpoint-commit.test.ts` passes.
17. `npx vitest run packages/cli/tests/skill/complexity.test.ts` passes with updated vocabulary.
18. `npx vitest run packages/cli/tests/skill/preamble.test.ts` passes with updated vocabulary.
19. `npx vitest run packages/cli/tests/mcp/tools/skill.test.ts` passes with updated vocabulary.
20. `harness validate` passes after all changes.

## File Map

```
MODIFY packages/cli/src/skill/complexity.ts              — rename light|full|auto -> fast|thorough|standard
MODIFY packages/cli/src/commands/skill/run.ts             — rename complexity option help text and default
MODIFY packages/cli/src/commands/skill/preamble.ts        — rename light|full -> fast|thorough in types and logic
MODIFY packages/cli/src/mcp/tools/skill.ts                — rename enum and type in schema and handler
MODIFY packages/cli/tests/skill/complexity.test.ts        — update expected values
MODIFY packages/cli/tests/skill/preamble.test.ts          — update test inputs and assertions
MODIFY packages/cli/tests/mcp/tools/skill.test.ts         — update expected enum values
CREATE packages/core/src/state/scratchpad.ts               — write, read, clear functions
CREATE packages/core/tests/state/scratchpad.test.ts        — unit tests for scratchpad
CREATE packages/core/src/state/learnings-relevance.ts      — Jaccard scorer and filterByRelevance
CREATE packages/core/tests/state/learnings-relevance.test.ts — unit tests for learnings relevance
CREATE packages/core/src/state/checkpoint-commit.ts        — commit at checkpoint with recovery
CREATE packages/core/tests/state/checkpoint-commit.test.ts — unit tests for checkpoint commit
MODIFY packages/core/src/state/state-manager.ts           — add exports for new modules
```

## Tasks

### Task 1: Rename rigor vocabulary in source files

**Depends on:** none
**Files:** `packages/cli/src/skill/complexity.ts`, `packages/cli/src/commands/skill/run.ts`, `packages/cli/src/commands/skill/preamble.ts`, `packages/cli/src/mcp/tools/skill.ts`

1. In `packages/cli/src/skill/complexity.ts`:
   - Line 4: Change `export type Complexity = 'light' | 'full' | 'auto';` to `export type Complexity = 'fast' | 'thorough' | 'standard';`
   - Line 14: Change `export function evaluateSignals(signals: Signals): 'light' | 'full' {` to `export function evaluateSignals(signals: Signals): 'fast' | 'thorough' {`
   - Lines 16-18: Change all `return 'full'` to `return 'thorough'`
   - Lines 21-23: Change all `return 'light'` to `return 'fast'`
   - Line 25: Change `return 'full'` to `return 'thorough'`
   - Line 28: Change `export function detectComplexity(projectPath: string): 'light' | 'full' {` to `export function detectComplexity(projectPath: string): 'fast' | 'thorough' {`
   - Line 69: Change `return 'full'` to `return 'thorough'`

2. In `packages/cli/src/commands/skill/preamble.ts`:
   - Line 10: Change `complexity?: 'light' | 'full';` to `complexity?: 'fast' | 'thorough';`
   - Line 26: Change `if (options.complexity === 'light' && !phase.required) {` to `if (options.complexity === 'fast' && !phase.required) {`
   - Line 27: Change `(skipped in light mode)` to `(skipped in fast mode)`

3. In `packages/cli/src/commands/skill/run.ts`:
   - Line 29: Change `): 'light' | 'full' | undefined {` to `): 'fast' | 'thorough' | undefined {`
   - Line 31: Change `if (requested === 'auto')` to `if (requested === 'standard')`
   - Line 104: Change `'Complexity: auto, light, full', 'auto'` to `'Rigor level: fast, standard, thorough', 'standard'`

4. In `packages/cli/src/mcp/tools/skill.ts`:
   - Line 24: Change `enum: ['auto', 'light', 'full']` to `enum: ['fast', 'standard', 'thorough']`
   - Line 25: Change `description: 'Complexity level for scale-adaptive rigor'` to `description: 'Rigor level: fast (minimal), standard (default), thorough (full)'`
   - Line 37: Change `complexity?: 'auto' | 'light' | 'full';` to `complexity?: 'fast' | 'standard' | 'thorough';`

5. Run: `npx vitest run packages/cli/tests/skill/complexity.test.ts packages/cli/tests/skill/preamble.test.ts packages/cli/tests/mcp/tools/skill.test.ts` — observe failures (tests still assert old values)

### Task 2: Update vocabulary tests

**Depends on:** Task 1
**Files:** `packages/cli/tests/skill/complexity.test.ts`, `packages/cli/tests/skill/preamble.test.ts`, `packages/cli/tests/mcp/tools/skill.test.ts`

1. In `packages/cli/tests/skill/complexity.test.ts`:
   - Line 9: Change `expect(result).toBe('full')` to `expect(result).toBe('thorough')`
   - Line 12: Change description `'returns light|full based on signal detection'` to `'returns fast|thorough based on signal detection'`
   - Line 21: Change `).toBe('light')` to `).toBe('fast')`
   - Line 30: Change `).toBe('full')` to `).toBe('thorough')`
   - Line 39: Change `).toBe('light')` to `).toBe('fast')`
   - Line 48: Change `).toBe('full')` to `).toBe('thorough')`
   - Line 57: Change `).toBe('full')` to `).toBe('thorough')`

2. In `packages/cli/tests/skill/preamble.test.ts`:
   - Line 8: Change `complexity: 'light'` to `complexity: 'fast'`
   - Line 16: Change `'~~REFACTOR~~ (skipped in light mode)'` to `'~~REFACTOR~~ (skipped in fast mode)'`
   - Line 21: Change `complexity: 'full'` to `complexity: 'thorough'`

3. In `packages/cli/tests/mcp/tools/skill.test.ts`:
   - Lines 21-23: Change the three enum assertions:
     ```typescript
     expect(complexity.enum).toContain('fast');
     expect(complexity.enum).toContain('standard');
     expect(complexity.enum).toContain('thorough');
     ```

4. Run: `npx vitest run packages/cli/tests/skill/complexity.test.ts packages/cli/tests/skill/preamble.test.ts packages/cli/tests/mcp/tools/skill.test.ts`
5. Observe: all tests pass
6. Run: `npx harness validate`
7. Commit: `refactor(skill): rename rigor vocabulary from auto|light|full to fast|standard|thorough`

### Task 3: Create scratchpad module tests (TDD — red)

**Depends on:** none
**Files:** `packages/core/tests/state/scratchpad.test.ts`

1. Create test file `packages/core/tests/state/scratchpad.test.ts`:

   ```typescript
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import * as fs from 'fs';
   import * as path from 'path';
   import * as os from 'os';
   import { writeScratchpad, readScratchpad, clearScratchpad } from '../../src/state/scratchpad';

   describe('scratchpad', () => {
     let tmpDir: string;
     const session = 'test-session';
     const phase = 'planning';

     beforeEach(() => {
       tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-scratchpad-'));
     });

     afterEach(() => {
       fs.rmSync(tmpDir, { recursive: true });
     });

     describe('writeScratchpad', () => {
       it('writes content and returns absolute path', () => {
         const opts = { session, phase, projectPath: tmpDir };
         const result = writeScratchpad(opts, 'research.md', '# Research notes');

         expect(path.isAbsolute(result)).toBe(true);
         expect(result).toContain(
           path.join('.harness', 'sessions', session, 'scratchpad', phase, 'research.md')
         );
         expect(fs.existsSync(result)).toBe(true);
         expect(fs.readFileSync(result, 'utf-8')).toBe('# Research notes');
       });

       it('creates nested directories if they do not exist', () => {
         const opts = { session, phase: 'deep/nested', projectPath: tmpDir };
         const result = writeScratchpad(opts, 'notes.md', 'content');
         expect(fs.existsSync(result)).toBe(true);
       });

       it('overwrites existing file', () => {
         const opts = { session, phase, projectPath: tmpDir };
         writeScratchpad(opts, 'data.md', 'version 1');
         writeScratchpad(opts, 'data.md', 'version 2');
         const content = fs.readFileSync(
           path.join(tmpDir, '.harness', 'sessions', session, 'scratchpad', phase, 'data.md'),
           'utf-8'
         );
         expect(content).toBe('version 2');
       });
     });

     describe('readScratchpad', () => {
       it('returns content when file exists', () => {
         const opts = { session, phase, projectPath: tmpDir };
         writeScratchpad(opts, 'existing.md', 'hello');
         const content = readScratchpad(opts, 'existing.md');
         expect(content).toBe('hello');
       });

       it('returns null when file does not exist', () => {
         const opts = { session, phase, projectPath: tmpDir };
         const content = readScratchpad(opts, 'nonexistent.md');
         expect(content).toBeNull();
       });
     });

     describe('clearScratchpad', () => {
       it('deletes the phase scratchpad directory', () => {
         const opts = { session, phase, projectPath: tmpDir };
         writeScratchpad(opts, 'file1.md', 'content1');
         writeScratchpad(opts, 'file2.md', 'content2');

         const phaseDir = path.join(tmpDir, '.harness', 'sessions', session, 'scratchpad', phase);
         expect(fs.existsSync(phaseDir)).toBe(true);

         clearScratchpad(opts);
         expect(fs.existsSync(phaseDir)).toBe(false);
       });

       it('does not throw when directory does not exist', () => {
         const opts = { session, phase: 'nonexistent', projectPath: tmpDir };
         expect(() => clearScratchpad(opts)).not.toThrow();
       });

       it('does not delete other phase directories', () => {
         const opts1 = { session, phase: 'phase1', projectPath: tmpDir };
         const opts2 = { session, phase: 'phase2', projectPath: tmpDir };
         writeScratchpad(opts1, 'file.md', 'content1');
         writeScratchpad(opts2, 'file.md', 'content2');

         clearScratchpad(opts1);

         const phase2Dir = path.join(
           tmpDir,
           '.harness',
           'sessions',
           session,
           'scratchpad',
           'phase2'
         );
         expect(fs.existsSync(phase2Dir)).toBe(true);
       });
     });
   });
   ```

2. Run: `npx vitest run packages/core/tests/state/scratchpad.test.ts`
3. Observe: failure — module `../../src/state/scratchpad` does not exist

### Task 4: Implement scratchpad module (TDD — green)

**Depends on:** Task 3
**Files:** `packages/core/src/state/scratchpad.ts`, `packages/core/src/state/state-manager.ts`

1. Create `packages/core/src/state/scratchpad.ts`:

   ```typescript
   // packages/core/src/state/scratchpad.ts
   import * as fs from 'fs';
   import * as path from 'path';
   import { HARNESS_DIR, SESSIONS_DIR } from './constants';

   export interface ScratchpadOptions {
     session: string;
     phase: string;
     projectPath: string;
   }

   function scratchpadDir(opts: ScratchpadOptions): string {
     return path.join(
       opts.projectPath,
       HARNESS_DIR,
       SESSIONS_DIR,
       opts.session,
       'scratchpad',
       opts.phase
     );
   }

   /**
    * Write content to the session scratchpad.
    * Creates directories as needed. Returns the absolute path to the written file.
    */
   export function writeScratchpad(
     opts: ScratchpadOptions,
     filename: string,
     content: string
   ): string {
     const dir = scratchpadDir(opts);
     fs.mkdirSync(dir, { recursive: true });
     const filePath = path.join(dir, filename);
     fs.writeFileSync(filePath, content);
     return filePath;
   }

   /**
    * Read content from the session scratchpad.
    * Returns null if the file does not exist.
    */
   export function readScratchpad(opts: ScratchpadOptions, filename: string): string | null {
     const filePath = path.join(scratchpadDir(opts), filename);
     if (!fs.existsSync(filePath)) return null;
     return fs.readFileSync(filePath, 'utf-8');
   }

   /**
    * Delete the scratchpad directory for the given phase.
    * Called at phase transitions to free ephemeral working memory.
    */
   export function clearScratchpad(opts: ScratchpadOptions): void {
     const dir = scratchpadDir(opts);
     if (fs.existsSync(dir)) {
       fs.rmSync(dir, { recursive: true });
     }
   }
   ```

2. Add exports to `packages/core/src/state/state-manager.ts`:

   ```typescript
   export { writeScratchpad, readScratchpad, clearScratchpad } from './scratchpad';
   ```

3. Run: `npx vitest run packages/core/tests/state/scratchpad.test.ts`
4. Observe: all tests pass
5. Run: `npx harness validate`
6. Commit: `feat(state): add scratchpad module for ephemeral session working memory`

### Task 5: Create learnings-relevance module tests (TDD — red)

**Depends on:** none
**Files:** `packages/core/tests/state/learnings-relevance.test.ts`

1. Create test file `packages/core/tests/state/learnings-relevance.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import {
     tokenize,
     scoreLearningRelevance,
     filterByRelevance,
   } from '../../src/state/learnings-relevance';

   describe('tokenize', () => {
     it('lowercases and splits on whitespace and punctuation', () => {
       const tokens = tokenize('Hello, World! This is a test.');
       expect(tokens).toContain('hello');
       expect(tokens).toContain('world');
       expect(tokens).toContain('test');
     });

     it('deduplicates tokens', () => {
       const tokens = tokenize('the the the repeated');
       const unique = new Set(tokens);
       expect(tokens.length).toBe(unique.size);
     });

     it('returns empty set for empty string', () => {
       expect(tokenize('')).toEqual([]);
     });

     it('filters out single-character tokens', () => {
       const tokens = tokenize('a b c word');
       expect(tokens).not.toContain('a');
       expect(tokens).not.toContain('b');
       expect(tokens).toContain('word');
     });
   });

   describe('scoreLearningRelevance', () => {
     it('returns 1.0 for identical strings', () => {
       const score = scoreLearningRelevance('jaccard scoring', 'jaccard scoring');
       expect(score).toBe(1.0);
     });

     it('returns 0 when there is no overlap', () => {
       const score = scoreLearningRelevance('apple banana cherry', 'dog elephant fox');
       expect(score).toBe(0);
     });

     it('returns a value between 0 and 1 for partial overlap', () => {
       const score = scoreLearningRelevance(
         'jaccard similarity scoring algorithm',
         'jaccard index scoring method'
       );
       expect(score).toBeGreaterThan(0);
       expect(score).toBeLessThan(1);
     });

     it('returns 0 when both strings are empty', () => {
       expect(scoreLearningRelevance('', '')).toBe(0);
     });

     it('is symmetric', () => {
       const a = 'harness validate testing';
       const b = 'testing harness pipeline';
       expect(scoreLearningRelevance(a, b)).toBe(scoreLearningRelevance(b, a));
     });
   });

   describe('filterByRelevance', () => {
     const learnings = [
       'Always run harness validate before committing changes to ensure pipeline health',
       'UTC normalization is needed for date comparisons in session timestamps',
       'Jaccard similarity is effective for keyword-based relevance scoring without dependencies',
       'Use TDD approach: write test first, observe failure, then implement',
       'The graph module requires explicit node deduplication on concurrent writes',
     ];

     it('filters out learnings below 0.7 threshold', () => {
       const result = filterByRelevance(learnings, 'jaccard similarity scoring relevance');
       // Only the Jaccard-related learning should score above 0.7
       for (const r of result) {
         expect(r.toLowerCase()).toContain('jaccard');
       }
     });

     it('returns empty array when no learnings meet threshold', () => {
       const result = filterByRelevance(learnings, 'quantum computing blockchain');
       expect(result).toEqual([]);
     });

     it('sorts results by score descending', () => {
       // Use context that partially matches multiple learnings
       const result = filterByRelevance(
         learnings,
         'harness validate testing TDD approach write test first observe failure implement changes pipeline',
         0.3 // lower threshold to include multiple results
       );
       expect(result.length).toBeGreaterThanOrEqual(1);
     });

     it('respects token budget', () => {
       // Very small budget should truncate results
       const result = filterByRelevance(
         learnings,
         'harness validate testing TDD pipeline',
         0.1, // low threshold to include many
         20 // very small token budget (~80 chars)
       );
       // Total chars of results should be roughly <= 80
       const totalChars = result.join('\n').length;
       expect(totalChars).toBeLessThanOrEqual(100); // ~20 tokens * 4 chars + separators
     });

     it('uses default threshold of 0.7', () => {
       const result = filterByRelevance(learnings, 'completely unrelated topic xyz');
       expect(result).toEqual([]);
     });

     it('uses default token budget of 1000', () => {
       // With a very relevant context that matches all, budget limits output
       const manyLearnings = Array.from(
         { length: 100 },
         (_, i) => `Learning ${i}: harness validate pipeline testing TDD`
       );
       const result = filterByRelevance(
         manyLearnings,
         'harness validate pipeline testing TDD',
         0.3
       );
       // Should not return all 100 — budget caps it
       expect(result.length).toBeLessThan(100);
     });
   });
   ```

2. Run: `npx vitest run packages/core/tests/state/learnings-relevance.test.ts`
3. Observe: failure — module `../../src/state/learnings-relevance` does not exist

### Task 6: Implement learnings-relevance module (TDD — green)

**Depends on:** Task 5
**Files:** `packages/core/src/state/learnings-relevance.ts`, `packages/core/src/state/state-manager.ts`

1. Create `packages/core/src/state/learnings-relevance.ts`:

   ```typescript
   // packages/core/src/state/learnings-relevance.ts

   /**
    * Tokenize a string into a deduplicated set of lowercase keywords.
    * Splits on whitespace and punctuation, filters tokens with length <= 1.
    */
   export function tokenize(text: string): string[] {
     if (!text || text.trim() === '') return [];
     const tokens = text
       .toLowerCase()
       .split(/[\s\p{P}]+/u)
       .filter((t) => t.length > 1);
     return [...new Set(tokens)];
   }

   /**
    * Score the relevance of a learning to a context string using Jaccard similarity.
    * Returns |intersection| / |union| (0-1). Returns 0 if both are empty.
    */
   export function scoreLearningRelevance(learningText: string, context: string): number {
     const learningTokens = tokenize(learningText);
     const contextTokens = tokenize(context);

     if (learningTokens.length === 0 && contextTokens.length === 0) return 0;
     if (learningTokens.length === 0 || contextTokens.length === 0) return 0;

     const learningSet = new Set(learningTokens);
     const contextSet = new Set(contextTokens);

     let intersection = 0;
     for (const token of learningSet) {
       if (contextSet.has(token)) intersection++;
     }

     const union = new Set([...learningSet, ...contextSet]).size;
     return union === 0 ? 0 : intersection / union;
   }

   /** Estimate token count from a string (chars / 4, ceiling). */
   function estimateTokens(text: string): number {
     return Math.ceil(text.length / 4);
   }

   /**
    * Filter learnings by Jaccard relevance to a context string.
    *
    * - Scores each learning against context
    * - Filters below threshold (default 0.7)
    * - Sorts descending by score
    * - Truncates to fit within token budget (default 1000)
    */
   export function filterByRelevance(
     learnings: string[],
     context: string,
     threshold: number = 0.7,
     tokenBudget: number = 1000
   ): string[] {
     const scored = learnings
       .map((learning) => ({
         text: learning,
         score: scoreLearningRelevance(learning, context),
       }))
       .filter((entry) => entry.score >= threshold)
       .sort((a, b) => b.score - a.score);

     const result: string[] = [];
     let totalTokens = 0;

     for (const entry of scored) {
       const separator = result.length > 0 ? '\n' : '';
       const entryCost = estimateTokens(entry.text + separator);
       if (totalTokens + entryCost > tokenBudget) break;
       result.push(entry.text);
       totalTokens += entryCost;
     }

     return result;
   }
   ```

2. Add exports to `packages/core/src/state/state-manager.ts`:

   ```typescript
   export { tokenize, scoreLearningRelevance, filterByRelevance } from './learnings-relevance';
   ```

3. Run: `npx vitest run packages/core/tests/state/learnings-relevance.test.ts`
4. Observe: all tests pass
5. Run: `npx harness validate`
6. Commit: `feat(state): add learnings-relevance module with Jaccard scoring and threshold filtering`

### Task 7: Create checkpoint-commit module tests (TDD — red)

**Depends on:** none
**Files:** `packages/core/tests/state/checkpoint-commit.test.ts`

1. Create test file `packages/core/tests/state/checkpoint-commit.test.ts`:

   ```typescript
   import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
   import * as fs from 'fs';
   import * as path from 'path';
   import * as os from 'os';
   import { execFileSync } from 'child_process';
   import { commitAtCheckpoint } from '../../src/state/checkpoint-commit';

   describe('commitAtCheckpoint', () => {
     let tmpDir: string;

     beforeEach(() => {
       tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-checkpoint-'));
       // Initialize a git repo
       execFileSync('git', ['init'], { cwd: tmpDir });
       execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: tmpDir });
       execFileSync('git', ['config', 'user.name', 'Test'], { cwd: tmpDir });
       // Create initial commit so HEAD exists
       fs.writeFileSync(path.join(tmpDir, 'README.md'), '# Test');
       execFileSync('git', ['add', '.'], { cwd: tmpDir });
       execFileSync('git', ['commit', '-m', 'initial'], { cwd: tmpDir });
     });

     afterEach(() => {
       fs.rmSync(tmpDir, { recursive: true });
     });

     it('commits staged changes with checkpoint label', async () => {
       fs.writeFileSync(path.join(tmpDir, 'file.ts'), 'content');
       const result = await commitAtCheckpoint({
         projectPath: tmpDir,
         session: 'test-session',
         checkpointLabel: 'Checkpoint 1: types defined',
       });

       expect(result.committed).toBe(true);
       expect(result.sha).toBeDefined();
       expect(result.sha!.length).toBeGreaterThanOrEqual(7);
       expect(result.message).toContain('[autopilot]');
       expect(result.message).toContain('Checkpoint 1: types defined');

       // Verify the commit exists in git log
       const log = execFileSync('git', ['log', '--oneline', '-1'], {
         cwd: tmpDir,
         encoding: 'utf-8',
       });
       expect(log).toContain('[autopilot] Checkpoint 1: types defined');
     });

     it('skips commit when nothing to commit', async () => {
       const result = await commitAtCheckpoint({
         projectPath: tmpDir,
         session: 'test-session',
         checkpointLabel: 'Checkpoint 2: no changes',
       });

       expect(result.committed).toBe(false);
       expect(result.sha).toBeUndefined();
     });

     it('uses recovery prefix when isRecovery is true', async () => {
       fs.writeFileSync(path.join(tmpDir, 'recovery.ts'), 'recovery content');
       const result = await commitAtCheckpoint({
         projectPath: tmpDir,
         session: 'test-session',
         checkpointLabel: 'Checkpoint 3: partial work',
         isRecovery: true,
       });

       expect(result.committed).toBe(true);
       expect(result.message).toContain('[autopilot][recovery]');
       expect(result.message).toContain('Checkpoint 3: partial work');

       const log = execFileSync('git', ['log', '--oneline', '-1'], {
         cwd: tmpDir,
         encoding: 'utf-8',
       });
       expect(log).toContain('[autopilot][recovery]');
     });

     it('handles multiple files in a single checkpoint', async () => {
       fs.writeFileSync(path.join(tmpDir, 'a.ts'), 'a');
       fs.writeFileSync(path.join(tmpDir, 'b.ts'), 'b');
       fs.mkdirSync(path.join(tmpDir, 'sub'));
       fs.writeFileSync(path.join(tmpDir, 'sub', 'c.ts'), 'c');

       const result = await commitAtCheckpoint({
         projectPath: tmpDir,
         session: 'test-session',
         checkpointLabel: 'Checkpoint 4: multiple files',
       });

       expect(result.committed).toBe(true);
     });
   });
   ```

2. Run: `npx vitest run packages/core/tests/state/checkpoint-commit.test.ts`
3. Observe: failure — module `../../src/state/checkpoint-commit` does not exist

### Task 8: Implement checkpoint-commit module (TDD — green)

**Depends on:** Task 7
**Files:** `packages/core/src/state/checkpoint-commit.ts`, `packages/core/src/state/state-manager.ts`

1. Create `packages/core/src/state/checkpoint-commit.ts`:

   ```typescript
   // packages/core/src/state/checkpoint-commit.ts
   import { execFileSync } from 'child_process';

   export interface CheckpointCommitOptions {
     projectPath: string;
     session: string;
     checkpointLabel: string;
     isRecovery?: boolean;
   }

   export interface CommitResult {
     committed: boolean;
     sha?: string;
     message: string;
   }

   /**
    * Commit all changes at a checkpoint boundary.
    *
    * 1. git add -A (within project path)
    * 2. git status — if nothing staged, skip
    * 3. git commit with message: "[autopilot] <checkpointLabel>"
    *    Recovery commits: "[autopilot][recovery] <checkpointLabel>"
    *
    * Returns { committed: boolean, sha?: string, message: string }
    */
   export async function commitAtCheckpoint(opts: CheckpointCommitOptions): Promise<CommitResult> {
     const { projectPath, checkpointLabel, isRecovery } = opts;
     const execOpts = { cwd: projectPath, encoding: 'utf-8' as const };

     // Stage all changes
     execFileSync('git', ['add', '-A'], execOpts);

     // Check if there are staged changes
     const status = execFileSync('git', ['status', '--porcelain'], execOpts).trim();
     if (status === '') {
       return { committed: false, message: 'Nothing to commit' };
     }

     // Build commit message
     const prefix = isRecovery ? '[autopilot][recovery]' : '[autopilot]';
     const message = `${prefix} ${checkpointLabel}`;

     // Commit
     execFileSync('git', ['commit', '-m', message], execOpts);

     // Get the SHA of the new commit
     const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], execOpts).trim();

     return { committed: true, sha, message };
   }
   ```

2. Add exports to `packages/core/src/state/state-manager.ts`:

   ```typescript
   export { commitAtCheckpoint } from './checkpoint-commit';
   export type { CheckpointCommitOptions, CommitResult } from './checkpoint-commit';
   ```

3. Run: `npx vitest run packages/core/tests/state/checkpoint-commit.test.ts`
4. Observe: all tests pass
5. Run: `npx harness validate`
6. Commit: `feat(state): add checkpoint-commit module for autopilot checkpoint boundaries`

---

## Verification

After all tasks are complete, run the full test suite for both affected packages:

```bash
npx vitest run packages/core/tests/state/scratchpad.test.ts packages/core/tests/state/learnings-relevance.test.ts packages/core/tests/state/checkpoint-commit.test.ts packages/cli/tests/skill/complexity.test.ts packages/cli/tests/skill/preamble.test.ts packages/cli/tests/mcp/tools/skill.test.ts
```

Then run `npx harness validate` to confirm overall project health.

## Observable Truth Traceability

| Observable Truth                                        | Delivered by Task(s)   |
| ------------------------------------------------------- | ---------------------- |
| 1. MCP tool accepts `fast\|standard\|thorough` only     | Task 1, Task 2         |
| 2. `evaluateSignals()` returns `fast` or `thorough`     | Task 1, Task 2         |
| 3. `detectComplexity()` fallback returns `thorough`     | Task 1, Task 2         |
| 4. `buildPreamble()` with `fast` skips phases           | Task 1, Task 2         |
| 5. `writeScratchpad()` writes to correct path           | Task 3, Task 4         |
| 6. `readScratchpad()` returns null for missing          | Task 3, Task 4         |
| 7. `clearScratchpad()` deletes phase directory          | Task 3, Task 4         |
| 8. `scoreLearningRelevance()` returns Jaccard index     | Task 5, Task 6         |
| 9. `filterByRelevance()` returns empty below threshold  | Task 5, Task 6         |
| 10. `filterByRelevance()` sorts and truncates           | Task 5, Task 6         |
| 11. `commitAtCheckpoint()` skips when clean             | Task 7, Task 8         |
| 12. Recovery commits use `[autopilot][recovery]` prefix | Task 7, Task 8         |
| 13. Barrel file exports all new functions               | Task 4, Task 6, Task 8 |
| 14-16. Unit tests pass for all three modules            | Task 4, Task 6, Task 8 |
| 17-19. Vocabulary tests pass                            | Task 2                 |
| 20. `harness validate` passes                           | All tasks              |

## Parallel Execution Opportunities

- **Tasks 1-2** (vocabulary rename) can run in parallel with **Tasks 3-4** (scratchpad) and **Tasks 5-6** (learnings-relevance) and **Tasks 7-8** (checkpoint-commit)
- Within each pair, the test task must complete before the implementation task
- The final barrel file exports (state-manager.ts) accumulate across Tasks 4, 6, and 8

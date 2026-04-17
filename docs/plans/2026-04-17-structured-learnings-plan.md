# Plan: Structured Learnings Enhancement

**Date:** 2026-04-17 | **Spec:** docs/changes/structured-learnings/proposal.md | **Tasks:** 13 | **Time:** ~50 min

## Goal

The harness learnings system supports structured fields (root_cause, tried_and_failed), detects semantic overlap before creating entries, audits learnings for staleness against current code, and surfaces relevant past learnings during code review.

## Observable Truths (Acceptance Criteria)

1. When `appendLearning` is called with `rootCause: "circular-import"` and `triedAndFailed: ["manual-reorder", "barrel-split"]`, the written entry contains `[root_cause:circular-import]` and `[tried:manual-reorder,barrel-split]` inline tags
2. When `loadIndexEntries` parses an entry with `[root_cause:X]` and `[tried:A,B]`, the returned `LearningsIndexEntry` has `rootCause === "X"` and `triedAndFailed === ["A", "B"]`
3. When `checkOverlap` is called with a new entry that shares 80% lexical similarity, same skill tag, and same root_cause as an existing entry, the returned score is >= 0.7
4. When `checkOverlap` is called with an unrelated entry, the returned score is < 0.3
5. When `appendLearning` is called and overlap is detected (>= 0.7), the result includes `overlap` with dimension breakdown and `appended` is still `true`
6. When `detectStaleLearnings` is called and a learning references `src/foo/bar.ts` which no longer exists, it appears in `stale` with `missingReferences` containing that path
7. When the review pipeline runs with the `'learnings'` domain, a `ReviewFinding` with severity `'suggestion'` is produced when a past learning matches a changed file
8. `npx vitest run packages/core/tests/state/learnings-overlap.test.ts` passes
9. `npx vitest run packages/core/tests/state/learnings-staleness.test.ts` passes
10. `npx vitest run packages/core/tests/review/learnings-agent.test.ts` passes

## File Map

```
MODIFY packages/core/src/state/learnings-content.ts (add rootCause/triedAndFailed to LearningsIndexEntry, update extractIndexEntry parser)
MODIFY packages/core/src/state/learnings.ts (extend appendLearning with rootCause, triedAndFailed, overlap check; new AppendLearningResult type)
CREATE packages/core/src/state/learnings-overlap.ts (5-dimension overlap scoring)
CREATE packages/core/src/state/learnings-staleness.ts (file-reference staleness detection)
MODIFY packages/core/src/state/index.ts (export new types and functions)
MODIFY packages/core/src/review/types/context.ts (add 'learnings' to ReviewDomain)
CREATE packages/core/src/review/agents/learnings-agent.ts (learnings-researcher review agent)
MODIFY packages/core/src/review/agents/index.ts (register learnings agent descriptor)
MODIFY packages/core/src/review/fan-out.ts (add learnings to AGENT_RUNNERS)
MODIFY packages/core/src/review/context-scoper.ts (add learnings to ALL_DOMAINS, add scopeLearningsContext)
MODIFY packages/core/src/review/pipeline-orchestrator.ts (add 'learnings' to fallback bundles)
CREATE packages/core/tests/state/learnings-overlap.test.ts (overlap scoring tests)
CREATE packages/core/tests/state/learnings-staleness.test.ts (staleness detection tests)
CREATE packages/core/tests/review/learnings-agent.test.ts (learnings agent tests)
```

## Tasks

### Task 1: Add rootCause and triedAndFailed to LearningsIndexEntry type and parser

**Depends on:** none | **Files:** packages/core/src/state/learnings-content.ts

1. In `packages/core/src/state/learnings-content.ts`, add optional fields to `LearningsIndexEntry`:
   ```typescript
   export interface LearningsIndexEntry {
     hash: string;
     tags: string[];
     summary: string;
     fullText: string;
     rootCause?: string;
     triedAndFailed?: string[];
   }
   ```
2. Update `extractIndexEntry()` to parse the new tags:

   ```typescript
   export function extractIndexEntry(entry: string): LearningsIndexEntry {
     const lines = entry.split('\n');
     const summary = lines[0] ?? entry;
     const tags: string[] = [];
     const skillMatch = entry.match(/\[skill:([^\]]+)\]/);
     if (skillMatch?.[1]) tags.push(skillMatch[1]);
     const outcomeMatch = entry.match(/\[outcome:([^\]]+)\]/);
     if (outcomeMatch?.[1]) tags.push(outcomeMatch[1]);

     // Parse structured fields
     const rootCauseMatch = entry.match(/\[root_cause:([^\]]+)\]/);
     const triedMatch = entry.match(/\[tried:([^\]]+)\]/);

     return {
       hash: computeEntryHash(entry),
       tags,
       summary,
       fullText: entry,
       ...(rootCauseMatch?.[1] ? { rootCause: rootCauseMatch[1] } : {}),
       ...(triedMatch?.[1]
         ? { triedAndFailed: triedMatch[1].split(',').map((s) => s.trim()) }
         : {}),
     };
   }
   ```

3. Run: `npx vitest run packages/core/tests/state/learnings.test.ts`
4. Run: `npx vitest run packages/core/tests/state/learnings-content.test.ts` (if exists)
5. Commit: `feat(learnings): add rootCause and triedAndFailed to LearningsIndexEntry type and parser`

### Task 2: Test structured fields parsing

**Depends on:** Task 1 | **Files:** packages/core/tests/state/learnings.test.ts

1. Add tests to `packages/core/tests/state/learnings.test.ts`:

   ```typescript
   describe('extractIndexEntry with structured fields', () => {
     it('should extract rootCause from entry', () => {
       const entry =
         '- **2026-04-17 [skill:debugging] [outcome:gotcha] [root_cause:circular-import]:** Found circular dep';
       const idx = extractIndexEntry(entry);
       expect(idx.rootCause).toBe('circular-import');
     });

     it('should extract triedAndFailed from entry', () => {
       const entry =
         '- **2026-04-17 [skill:debugging] [tried:manual-fix,auto-gen]:** Tried multiple approaches';
       const idx = extractIndexEntry(entry);
       expect(idx.triedAndFailed).toEqual(['manual-fix', 'auto-gen']);
     });

     it('should handle entry without structured fields', () => {
       const entry = '- **2026-04-17 [skill:debugging]:** Simple learning';
       const idx = extractIndexEntry(entry);
       expect(idx.rootCause).toBeUndefined();
       expect(idx.triedAndFailed).toBeUndefined();
     });

     it('should extract both rootCause and triedAndFailed together', () => {
       const entry =
         '- **2026-04-17 [skill:debug] [outcome:gotcha] [root_cause:race-condition] [tried:mutex,semaphore]:** Fixed race';
       const idx = extractIndexEntry(entry);
       expect(idx.rootCause).toBe('race-condition');
       expect(idx.triedAndFailed).toEqual(['mutex', 'semaphore']);
     });
   });
   ```

2. Run: `npx vitest run packages/core/tests/state/learnings.test.ts` — observe pass
3. Commit: `test(learnings): add tests for structured fields parsing`

### Task 3: Extend appendLearning with rootCause and triedAndFailed parameters

**Depends on:** Task 1 | **Files:** packages/core/src/state/learnings.ts

1. Update `appendLearning` signature to accept optional structured fields:
   ```typescript
   export async function appendLearning(
     projectPath: string,
     learning: string,
     skillName?: string,
     outcome?: string,
     stream?: string,
     session?: string,
     rootCause?: string,
     triedAndFailed?: string[]
   ): Promise<Result<void, Error>> {
   ```
2. Update the `bulletLine` construction to include the new tags (insert before the colon-content):

   ```typescript
   // Build optional structured tags
   const structuredTags: string[] = [];
   if (rootCause) structuredTags.push(`[root_cause:${rootCause}]`);
   if (triedAndFailed && triedAndFailed.length > 0)
     structuredTags.push(`[tried:${triedAndFailed.join(',')}]`);
   const structuredStr = structuredTags.length > 0 ? ' ' + structuredTags.join(' ') : '';

   let bulletLine: string;
   if (skillName && outcome) {
     bulletLine = `- **${timestamp} [skill:${skillName}] [outcome:${outcome}]${structuredStr}:** ${learning}`;
   } else if (skillName) {
     bulletLine = `- **${timestamp} [skill:${skillName}]${structuredStr}:** ${learning}`;
   } else {
     bulletLine = `- **${timestamp}${structuredStr}:** ${learning}`;
   }
   ```

3. Run: `npx vitest run packages/core/tests/state/learnings.test.ts` — existing tests should still pass
4. Commit: `feat(learnings): extend appendLearning with rootCause and triedAndFailed parameters`

### Task 4: Test appendLearning with structured fields

**Depends on:** Task 3 | **Files:** packages/core/tests/state/learnings.test.ts

1. Add tests to `packages/core/tests/state/learnings.test.ts`:

   ```typescript
   describe('appendLearning with structured fields', () => {
     let tmpDir: string;

     beforeEach(() => {
       tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-learnings-'));
     });

     afterEach(() => {
       fs.rmSync(tmpDir, { recursive: true });
     });

     it('should include root_cause tag in written entry', async () => {
       const result = await appendLearning(
         tmpDir,
         'Found circular dep',
         'debugging',
         'gotcha',
         undefined,
         undefined,
         'circular-import'
       );
       expect(result.ok).toBe(true);
       const content = fs.readFileSync(path.join(tmpDir, '.harness', 'learnings.md'), 'utf-8');
       expect(content).toContain('[root_cause:circular-import]');
     });

     it('should include tried tag in written entry', async () => {
       const result = await appendLearning(
         tmpDir,
         'Tried multiple approaches',
         'debugging',
         'gotcha',
         undefined,
         undefined,
         undefined,
         ['manual-fix', 'auto-gen']
       );
       expect(result.ok).toBe(true);
       const content = fs.readFileSync(path.join(tmpDir, '.harness', 'learnings.md'), 'utf-8');
       expect(content).toContain('[tried:manual-fix,auto-gen]');
     });

     it('should include both root_cause and tried tags', async () => {
       const result = await appendLearning(
         tmpDir,
         'Complex fix',
         'debugging',
         'gotcha',
         undefined,
         undefined,
         'race-condition',
         ['mutex', 'semaphore']
       );
       expect(result.ok).toBe(true);
       const content = fs.readFileSync(path.join(tmpDir, '.harness', 'learnings.md'), 'utf-8');
       expect(content).toContain('[root_cause:race-condition]');
       expect(content).toContain('[tried:mutex,semaphore]');
     });

     it('should work without structured fields (backwards compatible)', async () => {
       const result = await appendLearning(tmpDir, 'Simple learning', 'testing', 'success');
       expect(result.ok).toBe(true);
       const content = fs.readFileSync(path.join(tmpDir, '.harness', 'learnings.md'), 'utf-8');
       expect(content).not.toContain('[root_cause:');
       expect(content).not.toContain('[tried:');
     });
   });
   ```

2. Run: `npx vitest run packages/core/tests/state/learnings.test.ts` — observe pass
3. Commit: `test(learnings): add tests for appendLearning with structured fields`

### Task 5: Create learnings-overlap module with 5-dimension scoring (TDD)

**Depends on:** Task 1 | **Files:** packages/core/src/state/learnings-overlap.ts, packages/core/tests/state/learnings-overlap.test.ts

1. Create test file `packages/core/tests/state/learnings-overlap.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import {
     checkOverlap,
     computeLexicalSimilarity,
     computeStructuralMatch,
     computeRootCauseMatch,
     computeTemporalProximity,
     computeCodeReferenceOverlap,
   } from '../../src/state/learnings-overlap';

   describe('computeLexicalSimilarity', () => {
     it('returns 1.0 for identical normalized content', () => {
       expect(
         computeLexicalSimilarity(
           'the auth module has a race condition',
           'the auth module has a race condition'
         )
       ).toBe(1.0);
     });

     it('returns 0.0 for completely different content', () => {
       expect(
         computeLexicalSimilarity('auth module race condition', 'database schema migration')
       ).toBe(0.0);
     });

     it('returns partial score for overlapping words', () => {
       const score = computeLexicalSimilarity(
         'auth module race condition fix',
         'auth module timeout issue fix'
       );
       expect(score).toBeGreaterThan(0.3);
       expect(score).toBeLessThan(0.8);
     });
   });

   describe('computeStructuralMatch', () => {
     it('returns 1.0 for same skill and outcome', () => {
       const a = '- **2026-04-17 [skill:debugging] [outcome:gotcha]:** text';
       const b = '- **2026-04-17 [skill:debugging] [outcome:gotcha]:** other';
       expect(computeStructuralMatch(a, b)).toBe(1.0);
     });

     it('returns 0.5 for same skill but different outcome', () => {
       const a = '- **2026-04-17 [skill:debugging] [outcome:gotcha]:** text';
       const b = '- **2026-04-17 [skill:debugging] [outcome:success]:** other';
       expect(computeStructuralMatch(a, b)).toBe(0.5);
     });

     it('returns 0.0 for different skill and outcome', () => {
       const a = '- **2026-04-17 [skill:debugging] [outcome:gotcha]:** text';
       const b = '- **2026-04-17 [skill:testing] [outcome:success]:** other';
       expect(computeStructuralMatch(a, b)).toBe(0.0);
     });
   });

   describe('computeRootCauseMatch', () => {
     it('returns 1.0 for same root cause', () => {
       const a = '- **2026-04-17 [root_cause:circular-import]:** text';
       const b = '- **2026-04-17 [root_cause:circular-import]:** other';
       expect(computeRootCauseMatch(a, b)).toBe(1.0);
     });

     it('returns 0.0 for different root cause', () => {
       const a = '- **2026-04-17 [root_cause:circular-import]:** text';
       const b = '- **2026-04-17 [root_cause:race-condition]:** other';
       expect(computeRootCauseMatch(a, b)).toBe(0.0);
     });

     it('returns 0.0 when neither has root cause', () => {
       expect(computeRootCauseMatch('text without tags', 'other without tags')).toBe(0.0);
     });
   });

   describe('computeTemporalProximity', () => {
     it('returns 1.0 for same date', () => {
       const a = '- **2026-04-17:** text';
       const b = '- **2026-04-17:** other';
       expect(computeTemporalProximity(a, b)).toBe(1.0);
     });

     it('returns ~0.5 for 7 days apart', () => {
       const a = '- **2026-04-17:** text';
       const b = '- **2026-04-10:** other';
       const score = computeTemporalProximity(a, b);
       expect(score).toBeGreaterThan(0.4);
       expect(score).toBeLessThan(0.6);
     });

     it('returns 0.0 for 30+ days apart', () => {
       const a = '- **2026-04-17:** text';
       const b = '- **2026-03-01:** other';
       expect(computeTemporalProximity(a, b)).toBe(0.0);
     });
   });

   describe('computeCodeReferenceOverlap', () => {
     it('returns 1.0 for identical file references', () => {
       const a = 'Changed src/state/learnings.ts to fix the bug';
       const b = 'The file src/state/learnings.ts had a race condition';
       expect(computeCodeReferenceOverlap(a, b)).toBe(1.0);
     });

     it('returns 0.0 for no shared references', () => {
       const a = 'Changed src/state/learnings.ts';
       const b = 'Changed packages/cli/src/commands/prune.ts';
       expect(computeCodeReferenceOverlap(a, b)).toBe(0.0);
     });

     it('returns 0.0 when no file references found', () => {
       expect(computeCodeReferenceOverlap('no files here', 'none here either')).toBe(0.0);
     });
   });

   describe('checkOverlap', () => {
     it('returns high score for near-duplicate entries', () => {
       const newEntry =
         '- **2026-04-17 [skill:debugging] [outcome:gotcha] [root_cause:circular-import]:** The graph package had a circular dependency in src/state/learnings.ts';
       const existing = [
         '- **2026-04-17 [skill:debugging] [outcome:gotcha] [root_cause:circular-import]:** Found circular dependency issue in src/state/learnings.ts graph package',
       ];
       const result = checkOverlap(newEntry, existing);
       expect(result.score).toBeGreaterThanOrEqual(0.7);
       expect(result.matchedEntry).toBe(existing[0]);
     });

     it('returns low score for unrelated entries', () => {
       const newEntry =
         '- **2026-04-17 [skill:debugging] [outcome:gotcha]:** Auth token expiry bug';
       const existing = [
         '- **2026-03-01 [skill:testing] [outcome:success]:** Database migration completed successfully',
       ];
       const result = checkOverlap(newEntry, existing);
       expect(result.score).toBeLessThan(0.3);
     });

     it('returns score 0 when no existing entries', () => {
       const result = checkOverlap('- **2026-04-17:** something', []);
       expect(result.score).toBe(0);
       expect(result.matchedEntry).toBeUndefined();
     });

     it('uses configurable threshold', () => {
       const newEntry = '- **2026-04-17 [skill:debugging]:** auth issue in src/auth.ts';
       const existing = ['- **2026-04-17 [skill:debugging]:** auth problem in src/auth.ts'];
       const highThreshold = checkOverlap(newEntry, existing, { threshold: 0.95 });
       const lowThreshold = checkOverlap(newEntry, existing, { threshold: 0.1 });
       // Both compute the same score; threshold only affects which entry is "matched"
       expect(highThreshold.score).toBe(lowThreshold.score);
     });
   });
   ```

2. Run: `npx vitest run packages/core/tests/state/learnings-overlap.test.ts` — observe failure (module not found)
3. Create `packages/core/src/state/learnings-overlap.ts`:

   ```typescript
   // packages/core/src/state/learnings-overlap.ts
   //
   // Semantic overlap detection for learnings: 5-dimension scoring.
   // Prevents near-duplicate learnings with different wording.

   import { normalizeLearningContent, parseDateFromEntry } from './learnings-content';

   // --- Types ---

   export interface OverlapDimensions {
     lexical: number;
     structural: number;
     rootCause: number;
     temporal: number;
     codeReference: number;
   }

   export interface OverlapResult {
     score: number;
     dimensions: OverlapDimensions;
     matchedEntry?: string;
     matchedHash?: string;
   }

   // --- Dimension Weights ---

   const WEIGHTS = {
     lexical: 0.3,
     structural: 0.25,
     rootCause: 0.2,
     temporal: 0.1,
     codeReference: 0.15,
   } as const;

   // --- Dimension Scorers ---

   /**
    * Jaccard coefficient on word sets from normalized content.
    */
   export function computeLexicalSimilarity(a: string, b: string): number {
     const wordsA = new Set(
       normalizeLearningContent(a)
         .split(/\s+/)
         .filter((w) => w.length > 2)
     );
     const wordsB = new Set(
       normalizeLearningContent(b)
         .split(/\s+/)
         .filter((w) => w.length > 2)
     );
     if (wordsA.size === 0 && wordsB.size === 0) return 0;
     const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));
     const union = new Set([...wordsA, ...wordsB]);
     if (union.size === 0) return 0;
     return intersection.size / union.size;
   }

   /**
    * Binary match on skill and outcome tags, averaged.
    * Returns 1.0 if both match, 0.5 if one matches, 0.0 if neither.
    */
   export function computeStructuralMatch(a: string, b: string): number {
     const skillA = a.match(/\[skill:([^\]]+)\]/)?.[1];
     const skillB = b.match(/\[skill:([^\]]+)\]/)?.[1];
     const outcomeA = a.match(/\[outcome:([^\]]+)\]/)?.[1];
     const outcomeB = b.match(/\[outcome:([^\]]+)\]/)?.[1];

     let matches = 0;
     let comparisons = 0;

     if (skillA && skillB) {
       comparisons++;
       if (skillA === skillB) matches++;
     }
     if (outcomeA && outcomeB) {
       comparisons++;
       if (outcomeA === outcomeB) matches++;
     }

     if (comparisons === 0) return 0;
     return matches / comparisons;
   }

   /**
    * Binary match on root_cause tag. 1.0 if same, 0.0 otherwise.
    */
   export function computeRootCauseMatch(a: string, b: string): number {
     const rcA = a.match(/\[root_cause:([^\]]+)\]/)?.[1];
     const rcB = b.match(/\[root_cause:([^\]]+)\]/)?.[1];
     if (!rcA || !rcB) return 0;
     return rcA === rcB ? 1.0 : 0.0;
   }

   /**
    * Temporal decay: 1.0 at same day, 0.5 at 7 days, 0.0 at 30+ days.
    * Uses exponential decay: e^(-daysDiff * ln(2) / 7)
    */
   export function computeTemporalProximity(a: string, b: string): number {
     const dateA = parseDateFromEntry(a);
     const dateB = parseDateFromEntry(b);
     if (!dateA || !dateB) return 0;

     const msA = new Date(dateA).getTime();
     const msB = new Date(dateB).getTime();
     const daysDiff = Math.abs(msA - msB) / (1000 * 60 * 60 * 24);

     if (daysDiff >= 30) return 0;
     return Math.exp((-daysDiff * Math.LN2) / 7);
   }

   /**
    * Extract file path references from text.
    * Matches patterns like src/foo/bar.ts, packages/X/Y.ts, etc.
    */
   export function extractFileReferences(text: string): string[] {
     const pattern = /(?:^|\s)((?:[\w@.-]+\/)+[\w.-]+\.(?:ts|js|tsx|jsx|json|md|mts|mjs))/g;
     const refs: string[] = [];
     let match: RegExpExecArray | null;
     while ((match = pattern.exec(text)) !== null) {
       if (match[1]) refs.push(match[1]);
     }
     return refs;
   }

   /**
    * Jaccard coefficient on file path references.
    */
   export function computeCodeReferenceOverlap(a: string, b: string): number {
     const refsA = new Set(extractFileReferences(a));
     const refsB = new Set(extractFileReferences(b));
     if (refsA.size === 0 && refsB.size === 0) return 0;
     const intersection = new Set([...refsA].filter((r) => refsB.has(r)));
     const union = new Set([...refsA, ...refsB]);
     if (union.size === 0) return 0;
     return intersection.size / union.size;
   }

   // --- Composite Scorer ---

   /**
    * Check overlap between a new entry and existing entries.
    * Returns the highest-scoring match with dimension breakdown.
    */
   export function checkOverlap(
     newEntry: string,
     existingEntries: string[],
     options?: { threshold?: number }
   ): OverlapResult {
     const threshold = options?.threshold ?? 0.7;

     if (existingEntries.length === 0) {
       return {
         score: 0,
         dimensions: { lexical: 0, structural: 0, rootCause: 0, temporal: 0, codeReference: 0 },
       };
     }

     let bestScore = 0;
     let bestDimensions: OverlapDimensions = {
       lexical: 0,
       structural: 0,
       rootCause: 0,
       temporal: 0,
       codeReference: 0,
     };
     let bestEntry: string | undefined;

     for (const existing of existingEntries) {
       const dimensions: OverlapDimensions = {
         lexical: computeLexicalSimilarity(newEntry, existing),
         structural: computeStructuralMatch(newEntry, existing),
         rootCause: computeRootCauseMatch(newEntry, existing),
         temporal: computeTemporalProximity(newEntry, existing),
         codeReference: computeCodeReferenceOverlap(newEntry, existing),
       };

       const score =
         dimensions.lexical * WEIGHTS.lexical +
         dimensions.structural * WEIGHTS.structural +
         dimensions.rootCause * WEIGHTS.rootCause +
         dimensions.temporal * WEIGHTS.temporal +
         dimensions.codeReference * WEIGHTS.codeReference;

       if (score > bestScore) {
         bestScore = score;
         bestDimensions = dimensions;
         bestEntry = existing;
       }
     }

     return {
       score: bestScore,
       dimensions: bestDimensions,
       ...(bestScore >= threshold && bestEntry ? { matchedEntry: bestEntry } : {}),
     };
   }
   ```

4. Run: `npx vitest run packages/core/tests/state/learnings-overlap.test.ts` — observe pass
5. Commit: `feat(learnings): add 5-dimension semantic overlap detection module`

### Task 6: Integrate overlap check into appendLearning

**Depends on:** Task 3, Task 5 | **Files:** packages/core/src/state/learnings.ts

1. Add the `AppendLearningResult` interface and import `checkOverlap`:

   ```typescript
   import { checkOverlap } from './learnings-overlap';
   import type { OverlapResult } from './learnings-overlap';

   export interface AppendLearningResult {
     appended: boolean;
     overlap?: OverlapResult;
   }
   ```

2. Change `appendLearning` return type from `Result<void, Error>` to `Result<AppendLearningResult, Error>`.
3. Before writing the entry, load existing entries and run overlap check:
   ```typescript
   // After duplicate check, before writing:
   // Semantic overlap check against existing entries
   let overlapResult: OverlapResult | undefined;
   if (fs.existsSync(learningsPath)) {
     const existingContent = fs.readFileSync(learningsPath, 'utf-8');
     const existingEntries = existingContent
       .split('\n')
       .filter((line) => /^- \*\*\d{4}-\d{2}-\d{2}/.test(line));
     const overlap = checkOverlap(bulletLine, existingEntries);
     if (overlap.score >= 0.7) {
       overlapResult = overlap;
     }
   }
   ```
4. Update the return statements to return `AppendLearningResult`:
   ```typescript
   // At duplicate skip:
   return Ok({ appended: false });
   // At success:
   return Ok({ appended: true, ...(overlapResult ? { overlap: overlapResult } : {}) });
   ```
5. Run: `npx vitest run packages/core/tests/state/learnings.test.ts` — fix any type errors in existing tests (they expect `Result<void>`, now get `Result<AppendLearningResult>`)
6. Commit: `feat(learnings): integrate semantic overlap check into appendLearning`

### Task 7: Test overlap integration in appendLearning

**Depends on:** Task 6 | **Files:** packages/core/tests/state/learnings.test.ts

1. Add tests:

   ```typescript
   describe('appendLearning overlap detection', () => {
     let tmpDir: string;

     beforeEach(() => {
       tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-learnings-'));
     });

     afterEach(() => {
       fs.rmSync(tmpDir, { recursive: true });
     });

     it('should return overlap when similar entry exists', async () => {
       await appendLearning(
         tmpDir,
         'The auth module has a race condition in src/auth.ts',
         'debugging',
         'gotcha',
         undefined,
         undefined,
         'race-condition'
       );
       const result = await appendLearning(
         tmpDir,
         'Found race condition issue in the auth module src/auth.ts',
         'debugging',
         'gotcha',
         undefined,
         undefined,
         'race-condition'
       );
       expect(result.ok).toBe(true);
       if (result.ok) {
         expect(result.value.appended).toBe(true);
         expect(result.value.overlap).toBeDefined();
         expect(result.value.overlap!.score).toBeGreaterThanOrEqual(0.7);
       }
     });

     it('should not return overlap for unrelated entry', async () => {
       await appendLearning(tmpDir, 'Database migration completed', 'testing', 'success');
       const result = await appendLearning(
         tmpDir,
         'Auth token expiry needs handling',
         'debugging',
         'gotcha'
       );
       expect(result.ok).toBe(true);
       if (result.ok) {
         expect(result.value.appended).toBe(true);
         expect(result.value.overlap).toBeUndefined();
       }
     });

     it('should return appended false for exact duplicate', async () => {
       await appendLearning(tmpDir, 'Exact same learning text', 'debugging', 'gotcha');
       const result = await appendLearning(
         tmpDir,
         'Exact same learning text',
         'debugging',
         'gotcha'
       );
       expect(result.ok).toBe(true);
       if (result.ok) {
         expect(result.value.appended).toBe(false);
       }
     });
   });
   ```

2. Run: `npx vitest run packages/core/tests/state/learnings.test.ts` — observe pass
3. Commit: `test(learnings): add tests for overlap detection integration in appendLearning`

### Task 8: Create learnings-staleness module (TDD)

**Depends on:** Task 1 | **Files:** packages/core/src/state/learnings-staleness.ts, packages/core/tests/state/learnings-staleness.test.ts

1. Create test file `packages/core/tests/state/learnings-staleness.test.ts`:

   ```typescript
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import * as fs from 'fs';
   import * as path from 'path';
   import * as os from 'os';
   import { detectStaleLearnings } from '../../src/state/learnings-staleness';
   import { extractFileReferences } from '../../src/state/learnings-overlap';

   describe('detectStaleLearnings', () => {
     let tmpDir: string;

     beforeEach(() => {
       tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-staleness-'));
       fs.mkdirSync(path.join(tmpDir, '.harness'), { recursive: true });
     });

     afterEach(() => {
       fs.rmSync(tmpDir, { recursive: true });
     });

     it('should detect learning referencing non-existent file', async () => {
       const learningsContent = `# Learnings\n\n<!-- hash:abc12345 tags:debugging,gotcha -->\n- **2026-04-17 [skill:debugging] [outcome:gotcha]:** Fixed bug in src/foo/bar.ts causing crash\n`;
       fs.writeFileSync(path.join(tmpDir, '.harness', 'learnings.md'), learningsContent);

       const result = await detectStaleLearnings(tmpDir);
       expect(result.ok).toBe(true);
       if (result.ok) {
         expect(result.value.stale.length).toBe(1);
         expect(result.value.stale[0]!.missingReferences).toContain('src/foo/bar.ts');
       }
     });

     it('should not flag learning referencing existing file', async () => {
       // Create the referenced file
       fs.mkdirSync(path.join(tmpDir, 'src', 'foo'), { recursive: true });
       fs.writeFileSync(path.join(tmpDir, 'src', 'foo', 'bar.ts'), 'export const x = 1;');

       const learningsContent = `# Learnings\n\n<!-- hash:abc12345 -->\n- **2026-04-17 [skill:debugging]:** Fixed bug in src/foo/bar.ts\n`;
       fs.writeFileSync(path.join(tmpDir, '.harness', 'learnings.md'), learningsContent);

       const result = await detectStaleLearnings(tmpDir);
       expect(result.ok).toBe(true);
       if (result.ok) {
         expect(result.value.stale.length).toBe(0);
         expect(result.value.fresh).toBe(1);
       }
     });

     it('should handle learnings with no file references', async () => {
       const learningsContent = `# Learnings\n\n<!-- hash:abc12345 -->\n- **2026-04-17 [skill:testing]:** Always run tests before committing\n`;
       fs.writeFileSync(path.join(tmpDir, '.harness', 'learnings.md'), learningsContent);

       const result = await detectStaleLearnings(tmpDir);
       expect(result.ok).toBe(true);
       if (result.ok) {
         expect(result.value.stale.length).toBe(0);
       }
     });

     it('should return empty report when no learnings file exists', async () => {
       const result = await detectStaleLearnings(tmpDir);
       expect(result.ok).toBe(true);
       if (result.ok) {
         expect(result.value.total).toBe(0);
         expect(result.value.stale.length).toBe(0);
       }
     });
   });
   ```

2. Run: `npx vitest run packages/core/tests/state/learnings-staleness.test.ts` — observe failure
3. Create `packages/core/src/state/learnings-staleness.ts`:

   ```typescript
   // packages/core/src/state/learnings-staleness.ts
   //
   // Active staleness detection: audits learnings against current code state.
   // Flags entries referencing files that no longer exist.

   import * as fs from 'fs';
   import * as path from 'path';
   import type { Result } from '../shared/result';
   import { Ok, Err } from '../shared/result';
   import { getStateDir, LEARNINGS_FILE } from './state-shared';
   import { loadRelevantLearnings } from './learnings-loader';
   import { extractIndexEntry, parseDateFromEntry } from './learnings-content';
   import { extractFileReferences } from './learnings-overlap';

   // --- Types ---

   export interface StalenessEntry {
     entryHash: string;
     entrySummary: string;
     missingReferences: string[];
     entryDate: string;
   }

   export interface StalenessReport {
     total: number;
     stale: StalenessEntry[];
     fresh: number;
   }

   // --- Detection ---

   /**
    * Detect stale learnings by checking file references against the filesystem.
    * A learning is stale if it references files that no longer exist.
    */
   export async function detectStaleLearnings(
     projectPath: string,
     stream?: string,
     session?: string
   ): Promise<Result<StalenessReport, Error>> {
     try {
       const loadResult = await loadRelevantLearnings(projectPath, undefined, stream, session);
       if (!loadResult.ok) return loadResult;
       const entries = loadResult.value;

       if (entries.length === 0) {
         return Ok({ total: 0, stale: [], fresh: 0 });
       }

       const staleEntries: StalenessEntry[] = [];
       let freshCount = 0;

       for (const entry of entries) {
         const refs = extractFileReferences(entry);
         if (refs.length === 0) {
           // Entries without file references are not considered stale
           freshCount++;
           continue;
         }

         const missing = refs.filter((ref) => {
           const absPath = path.join(projectPath, ref);
           return !fs.existsSync(absPath);
         });

         if (missing.length > 0) {
           const idx = extractIndexEntry(entry);
           staleEntries.push({
             entryHash: idx.hash,
             entrySummary: idx.summary,
             missingReferences: missing,
             entryDate: parseDateFromEntry(entry) ?? 'unknown',
           });
         } else {
           freshCount++;
         }
       }

       return Ok({
         total: entries.length,
         stale: staleEntries,
         fresh: freshCount,
       });
     } catch (error) {
       return Err(
         new Error(
           `Failed to detect stale learnings: ${error instanceof Error ? error.message : String(error)}`
         )
       );
     }
   }
   ```

4. Run: `npx vitest run packages/core/tests/state/learnings-staleness.test.ts` — observe pass
5. Commit: `feat(learnings): add active staleness detection module`

### Task 9: Add 'learnings' to ReviewDomain type

**Depends on:** none | **Files:** packages/core/src/review/types/context.ts

1. In `packages/core/src/review/types/context.ts`, update `ReviewDomain`:
   ```typescript
   export type ReviewDomain = 'compliance' | 'bug' | 'security' | 'architecture' | 'learnings';
   ```
2. Run: `npx vitest run packages/core/tests/review/` — check for type errors or test failures
3. Commit: `feat(review): add learnings to ReviewDomain type`

### Task 10: Create learnings-agent review agent (TDD)

**Depends on:** Task 9 | **Files:** packages/core/src/review/agents/learnings-agent.ts, packages/core/tests/review/learnings-agent.test.ts

1. Create test file `packages/core/tests/review/learnings-agent.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import {
     runLearningsAgent,
     LEARNINGS_DESCRIPTOR,
   } from '../../src/review/agents/learnings-agent';
   import type { ContextBundle } from '../../src/review/types';

   function makeBundle(changedFiles: { path: string; content: string }[]): ContextBundle {
     return {
       domain: 'learnings' as const,
       changeType: 'feature' as const,
       changedFiles: changedFiles.map((f) => ({
         ...f,
         reason: 'changed' as const,
         lines: f.content.split('\n').length,
       })),
       contextFiles: [],
       commitHistory: [],
       diffLines: 10,
       contextLines: 0,
     };
   }

   describe('LEARNINGS_DESCRIPTOR', () => {
     it('has correct domain and tier', () => {
       expect(LEARNINGS_DESCRIPTOR.domain).toBe('learnings');
       expect(LEARNINGS_DESCRIPTOR.tier).toBe('fast');
     });
   });

   describe('runLearningsAgent', () => {
     it('returns empty findings for bundle with no learnings context', () => {
       const bundle = makeBundle([{ path: 'src/auth.ts', content: 'export function login() {}' }]);
       const findings = runLearningsAgent(bundle);
       expect(findings).toEqual([]);
     });

     it('returns suggestion finding when context file contains relevant learning', () => {
       const bundle: ContextBundle = {
         domain: 'learnings' as const,
         changeType: 'feature' as const,
         changedFiles: [
           {
             path: 'src/state/learnings.ts',
             content: 'export function appendLearning() {}',
             reason: 'changed' as const,
             lines: 1,
           },
         ],
         contextFiles: [
           {
             path: 'learnings-context',
             content:
               '- **2026-04-17 [skill:debugging] [outcome:gotcha]:** The learnings module in src/state/learnings.ts has a race condition when writing concurrently',
             reason: 'convention' as const,
             lines: 1,
           },
         ],
         commitHistory: [],
         diffLines: 10,
         contextLines: 1,
       };
       const findings = runLearningsAgent(bundle);
       expect(findings.length).toBeGreaterThan(0);
       expect(findings[0]!.domain).toBe('learnings');
       expect(findings[0]!.severity).toBe('suggestion');
     });

     it('all findings have domain learnings and severity suggestion', () => {
       const bundle: ContextBundle = {
         domain: 'learnings' as const,
         changeType: 'feature' as const,
         changedFiles: [
           {
             path: 'src/auth.ts',
             content: 'export function login() {}',
             reason: 'changed' as const,
             lines: 1,
           },
         ],
         contextFiles: [
           {
             path: 'learnings-context',
             content:
               '- **2026-04-17 [skill:debugging]:** The src/auth.ts module needs error handling',
             reason: 'convention' as const,
             lines: 1,
           },
         ],
         commitHistory: [],
         diffLines: 10,
         contextLines: 1,
       };
       const findings = runLearningsAgent(bundle);
       for (const f of findings) {
         expect(f.domain).toBe('learnings');
         expect(f.severity).toBe('suggestion');
       }
     });
   });
   ```

2. Run: `npx vitest run packages/core/tests/review/learnings-agent.test.ts` — observe failure
3. Create `packages/core/src/review/agents/learnings-agent.ts`:

   ```typescript
   import type { ContextBundle, ReviewFinding, ReviewAgentDescriptor } from '../types';
   import { makeFindingId } from '../constants';
   import { scoreRelevance } from '../../state/learnings-content';

   export const LEARNINGS_DESCRIPTOR: ReviewAgentDescriptor = {
     domain: 'learnings',
     tier: 'fast',
     displayName: 'Learnings Researcher',
     focusAreas: [
       'Past learnings — relevant gotchas, decisions, and observations from prior work',
       'Known issues — previously encountered bugs or pitfalls in changed files',
       'Tried approaches — what was attempted before and what failed',
     ],
   };

   /** Minimum relevance score to surface a learning as a finding. */
   const RELEVANCE_THRESHOLD = 0.3;

   /**
    * Parse individual learning entries from context file content.
    */
   function parseLearningEntries(content: string): string[] {
     return content.split('\n').filter((line) => /^- \*\*\d{4}-\d{2}-\d{2}/.test(line));
   }

   /**
    * Run the learnings-researcher review agent.
    *
    * Surfaces relevant past learnings as suggestion-level findings.
    * Examines learnings context files for entries mentioning changed file paths
    * or having high relevance to the changed code.
    */
   export function runLearningsAgent(bundle: ContextBundle): ReviewFinding[] {
     const findings: ReviewFinding[] = [];
     const changedPaths = bundle.changedFiles.map((f) => f.path);

     // Learnings are passed as context files with reason 'convention'
     const learningsContextFiles = bundle.contextFiles.filter(
       (f) => f.path === 'learnings-context' || f.path.includes('learnings')
     );

     if (learningsContextFiles.length === 0) return [];

     for (const lcf of learningsContextFiles) {
       const entries = parseLearningEntries(lcf.content);

       for (const entry of entries) {
         // Check if learning mentions any changed file
         for (const changedPath of changedPaths) {
           const fileName = changedPath.split('/').pop() ?? changedPath;
           const relevance =
             scoreRelevance(entry, changedPath) + (entry.includes(fileName) ? 0.3 : 0);

           if (relevance >= RELEVANCE_THRESHOLD || entry.includes(changedPath)) {
             // Extract summary from entry (strip date/tags prefix)
             const summaryMatch = entry.match(/:\*\*\s*(.+)$/);
             const summary = summaryMatch?.[1] ?? entry.slice(0, 80);

             findings.push({
               id: makeFindingId('learnings', changedPath, 1, summary),
               file: changedPath,
               lineRange: [1, 1],
               domain: 'learnings',
               severity: 'suggestion',
               title: `Past learning relevant: ${summary.slice(0, 60)}`,
               rationale: `A previous learning may be relevant to changes in this file:\n${entry}`,
               evidence: [entry],
               validatedBy: 'heuristic',
             });
             break; // One finding per learning per file
           }
         }
       }
     }

     return findings;
   }
   ```

4. Run: `npx vitest run packages/core/tests/review/learnings-agent.test.ts` — observe pass
5. Commit: `feat(review): add learnings-researcher review agent`

### Task 11: Register learnings agent in fan-out pipeline

**Depends on:** Task 9, Task 10 | **Files:** packages/core/src/review/agents/index.ts, packages/core/src/review/fan-out.ts

1. In `packages/core/src/review/agents/index.ts`, add:
   ```typescript
   export { runLearningsAgent, LEARNINGS_DESCRIPTOR } from './learnings-agent';
   ```
   And update `AGENT_DESCRIPTORS`:
   ```typescript
   import { LEARNINGS_DESCRIPTOR } from './learnings-agent';
   // ...
   export const AGENT_DESCRIPTORS: Record<ReviewDomain, ReviewAgentDescriptor> = {
     compliance: COMPLIANCE_DESCRIPTOR,
     bug: BUG_DETECTION_DESCRIPTOR,
     security: SECURITY_DESCRIPTOR,
     architecture: ARCHITECTURE_DESCRIPTOR,
     learnings: LEARNINGS_DESCRIPTOR,
   };
   ```
2. In `packages/core/src/review/fan-out.ts`, add import and runner:
   ```typescript
   import { runLearningsAgent } from './agents/learnings-agent';
   // ...
   const AGENT_RUNNERS: Record<ReviewDomain, (bundle: ContextBundle) => ReviewFinding[]> = {
     compliance: runComplianceAgent,
     bug: runBugDetectionAgent,
     security: runSecurityAgent,
     architecture: runArchitectureAgent,
     learnings: runLearningsAgent,
   };
   ```
3. In `packages/core/src/review/context-scoper.ts`, update `ALL_DOMAINS`:
   ```typescript
   const ALL_DOMAINS: ReviewDomain[] = [
     'compliance',
     'bug',
     'security',
     'architecture',
     'learnings',
   ];
   ```
   And add the `learnings` scoper to the `scopers` record:
   ```typescript
   learnings: () => Promise.resolve([]),  // Learnings context populated by orchestration layer
   ```
4. In `packages/core/src/review/pipeline-orchestrator.ts`, update the fallback bundles array:
   ```typescript
   contextBundles = (['compliance', 'bug', 'security', 'architecture', 'learnings'] as const).map(...)
   ```
5. Run: `npx vitest run packages/core/tests/review/fan-out.test.ts` — fix if needed (tests check for 4 domains, now 5)
6. Run: `npx vitest run packages/core/tests/review/` — all review tests pass
7. Commit: `feat(review): register learnings agent in fan-out pipeline and context scoper`

### Task 12: Update barrel exports in state/index.ts

**Depends on:** Task 5, Task 6, Task 8 | **Files:** packages/core/src/state/index.ts

1. Add exports for new modules:

   ```typescript
   /**
    * Semantic overlap detection for learnings.
    */
   export {
     checkOverlap,
     computeLexicalSimilarity,
     extractFileReferences,
   } from './learnings-overlap';
   export type { OverlapResult, OverlapDimensions } from './learnings-overlap';

   /**
    * Active staleness detection for learnings.
    */
   export { detectStaleLearnings } from './learnings-staleness';
   export type { StalenessReport, StalenessEntry } from './learnings-staleness';
   ```

2. Add `AppendLearningResult` type export from learnings.ts:
   ```typescript
   export type { BudgetedLearningsOptions, AppendLearningResult } from './learnings';
   ```
3. Run: `npx vitest run packages/core/tests/` — all tests pass
4. Commit: `feat(learnings): export overlap, staleness, and AppendLearningResult from state barrel`

### Task 13: Run full test suite and validate

**Depends on:** all previous tasks | **Files:** none (validation only)

1. Run: `npx vitest run packages/core/tests/state/learnings-overlap.test.ts`
2. Run: `npx vitest run packages/core/tests/state/learnings-staleness.test.ts`
3. Run: `npx vitest run packages/core/tests/review/learnings-agent.test.ts`
4. Run: `npx vitest run packages/core/tests/state/learnings.test.ts`
5. Run: `npx vitest run packages/core/tests/review/fan-out.test.ts`
6. Run: `npx vitest run packages/core/tests/`
7. Run: `npx harness validate`
8. Commit: `chore(learnings): verify all tests pass for structured learnings enhancement`

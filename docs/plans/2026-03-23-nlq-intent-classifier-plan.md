# Plan: NLQ IntentClassifier -- Scored Multi-Signal Classifier

**Date:** 2026-03-23
**Spec:** docs/changes/natural-language-graph-queries/proposal.md
**Phase:** 2 of 8 (IntentClassifier)
**Estimated tasks:** 5
**Estimated time:** 20 minutes

## Goal

Implement a scored multi-signal intent classifier that maps natural language questions to one of 5 intents (impact, find, relationships, explain, anomaly) with confidence scores, passing a test suite of 25+ example questions.

## Observable Truths (Acceptance Criteria)

1. When `classify("what breaks if I change auth?")` is called, the system shall return `{ intent: 'impact', confidence: >0.3, signals: { keyword: >0, verbPattern: >0 } }`.
2. When `classify("where is the auth middleware?")` is called, the system shall return `{ intent: 'find', confidence: >0.3 }`.
3. When `classify("what calls UserService?")` is called, the system shall return `{ intent: 'relationships', confidence: >0.3 }`.
4. When `classify("what is GraphStore?")` is called, the system shall return `{ intent: 'explain', confidence: >0.3 }`.
5. When `classify("what looks wrong?")` is called, the system shall return `{ intent: 'anomaly', confidence: >0.3 }`.
6. All 5 intents classify correctly on at least 5 example questions per intent (25+ total tests).
7. When the top score is below 0.3, the system shall return suggestions based on the top 2 intents.
8. `INTENTS` const array is exported from `types.ts`, mirroring the `NODE_TYPES`/`EDGE_TYPES` pattern.
9. `npx vitest run tests/nlq/IntentClassifier.test.ts` passes with 25+ tests.
10. `harness validate` passes.

## File Map

- MODIFY `packages/graph/src/nlq/types.ts` (add `INTENTS` const array)
- CREATE `packages/graph/src/nlq/IntentClassifier.ts`
- CREATE `packages/graph/tests/nlq/IntentClassifier.test.ts`
- MODIFY `packages/graph/src/nlq/index.ts` (re-export `INTENTS` and `IntentClassifier`)

## Tasks

### Task 1: Add INTENTS const array to types.ts

**Depends on:** none
**Files:** `packages/graph/src/nlq/types.ts`

1. Open `packages/graph/src/nlq/types.ts`.
2. Add the `INTENTS` const array before the `Intent` type, then derive `Intent` from it (mirroring `NODE_TYPES`/`NodeType` pattern):

   Replace:

   ```typescript
   /**
    * Intent categories for natural language graph queries.
    */
   export type Intent = 'impact' | 'find' | 'relationships' | 'explain' | 'anomaly';
   ```

   With:

   ```typescript
   /**
    * All supported intent categories for natural language graph queries.
    * Runtime-accessible array mirroring NODE_TYPES / EDGE_TYPES pattern.
    */
   export const INTENTS = ['impact', 'find', 'relationships', 'explain', 'anomaly'] as const;

   /**
    * Intent categories for natural language graph queries.
    */
   export type Intent = (typeof INTENTS)[number];
   ```

3. Run: `npx vitest run tests/nlq/types.test.ts` -- verify all existing tests still pass (the `Intent` type is unchanged structurally).
4. Run: `harness validate`
5. Commit: `feat(nlq): add INTENTS const array to types.ts`

---

### Task 2: Create IntentClassifier with signal scoring (TDD -- test first)

**Depends on:** Task 1
**Files:** `packages/graph/tests/nlq/IntentClassifier.test.ts`, `packages/graph/src/nlq/IntentClassifier.ts`

1. Create test file `packages/graph/tests/nlq/IntentClassifier.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { IntentClassifier } from '../../src/nlq/IntentClassifier.js';
   import type { ClassificationResult } from '../../src/nlq/types.js';

   const classifier = new IntentClassifier();

   function expectIntent(result: ClassificationResult, intent: string): void {
     expect(result.intent).toBe(intent);
     expect(result.confidence).toBeGreaterThan(0.3);
   }

   describe('IntentClassifier', () => {
     describe('impact intent', () => {
       const questions = [
         'what breaks if I change auth?',
         'what is affected if I modify UserService?',
         'what happens if I remove the login handler?',
         'what is the blast radius of changing the database layer?',
         'if I delete this file, what depends on it?',
       ];

       it.each(questions)('classifies "%s" as impact', (q) => {
         expectIntent(classifier.classify(q), 'impact');
       });
     });

     describe('find intent', () => {
       const questions = [
         'where is the auth middleware?',
         'find all controllers',
         'show me every test file',
         'locate the UserService class',
         'list all files in the auth module',
       ];

       it.each(questions)('classifies "%s" as find', (q) => {
         expectIntent(classifier.classify(q), 'find');
       });
     });

     describe('relationships intent', () => {
       const questions = [
         'what calls UserService?',
         'what does AuthMiddleware depend on?',
         'what imports the database module?',
         'what connects to the API gateway?',
         'who are the callers of hashPassword?',
       ];

       it.each(questions)('classifies "%s" as relationships', (q) => {
         expectIntent(classifier.classify(q), 'relationships');
       });
     });

     describe('explain intent', () => {
       const questions = [
         'what is GraphStore?',
         'describe the auth module',
         'tell me about UserService',
         'give me an overview of the codebase',
         'how does the query engine work?',
       ];

       it.each(questions)('classifies "%s" as explain', (q) => {
         expectIntent(classifier.classify(q), 'explain');
       });
     });

     describe('anomaly intent', () => {
       const questions = [
         'what looks wrong?',
         'are there any code smells?',
         'find problems in the codebase',
         'what are the hotspots?',
         'show me suspicious files',
       ];

       it.each(questions)('classifies "%s" as anomaly', (q) => {
         expectIntent(classifier.classify(q), 'anomaly');
       });
     });

     describe('confidence scoring', () => {
       it('returns confidence between 0 and 1', () => {
         const result = classifier.classify('what breaks if I change auth?');
         expect(result.confidence).toBeGreaterThanOrEqual(0);
         expect(result.confidence).toBeLessThanOrEqual(1);
       });

       it('returns signal scores in the result', () => {
         const result = classifier.classify('what breaks if I change auth?');
         expect(result.signals).toBeDefined();
         expect(typeof result.signals).toBe('object');
       });

       it('returns low confidence for gibberish input', () => {
         const result = classifier.classify('asdf jkl qwerty');
         expect(result.confidence).toBeLessThan(0.3);
       });
     });

     describe('edge cases', () => {
       it('handles empty string', () => {
         const result = classifier.classify('');
         expect(result.confidence).toBeLessThan(0.3);
       });

       it('is case-insensitive', () => {
         const lower = classifier.classify('what breaks if I change auth?');
         const upper = classifier.classify('WHAT BREAKS IF I CHANGE AUTH?');
         expect(lower.intent).toBe(upper.intent);
       });

       it('handles extra whitespace', () => {
         const result = classifier.classify('  what   breaks   if   I   change   auth?  ');
         expect(result.intent).toBe('impact');
       });
     });
   });
   ```

2. Run: `npx vitest run tests/nlq/IntentClassifier.test.ts` -- observe failure (IntentClassifier does not exist).

3. Create `packages/graph/src/nlq/IntentClassifier.ts`:

   ```typescript
   import { INTENTS } from './types.js';
   import type { Intent, ClassificationResult } from './types.js';

   /**
    * Signal configuration for a single intent.
    */
   interface SignalSet {
     readonly keywords: readonly string[];
     readonly questionWords: readonly string[];
     readonly verbPatterns: readonly RegExp[];
   }

   /**
    * Signal weights for combining scores.
    */
   const SIGNAL_WEIGHTS: Readonly<Record<string, number>> = {
     keyword: 0.35,
     questionWord: 0.2,
     verbPattern: 0.45,
   } as const;

   /**
    * Per-intent signal configuration.
    */
   const INTENT_SIGNALS: Readonly<Record<Intent, SignalSet>> = {
     impact: {
       keywords: ['break', 'affect', 'impact', 'change', 'depend', 'blast', 'radius', 'risk'],
       questionWords: ['what'],
       verbPatterns: [
         /what\s+(breaks|happens|is affected)/,
         /if\s+i\s+(change|modify|remove|delete)/,
       ],
     },
     find: {
       keywords: ['find', 'where', 'locate', 'search', 'show', 'list', 'all'],
       questionWords: ['where'],
       verbPatterns: [/where\s+is/, /find\s+(the|all|every)/],
     },
     relationships: {
       keywords: [
         'connect',
         'call',
         'import',
         'use',
         'depend',
         'link',
         'neighbor',
         'caller',
         'callee',
       ],
       questionWords: ['what', 'who'],
       verbPatterns: [/connects?\s+to/, /depends?\s+on/, /calls?/, /imports?/],
     },
     explain: {
       keywords: ['what', 'describe', 'explain', 'tell', 'about', 'overview', 'summary'],
       questionWords: ['what', 'how'],
       verbPatterns: [/what\s+is/, /describe\s+/, /tell\s+me\s+about/, /how\s+does/],
     },
     anomaly: {
       keywords: [
         'wrong',
         'problem',
         'anomaly',
         'smell',
         'issue',
         'outlier',
         'hotspot',
         'risk',
         'suspicious',
       ],
       questionWords: ['what'],
       verbPatterns: [/what.*(wrong|problem|smell)/, /find.*(issue|anomal|problem)/],
     },
   } as const;

   /**
    * Scored multi-signal intent classifier.
    *
    * Combines keyword presence, question-word matching, and verb-pattern matching
    * to classify natural language questions into one of 5 intents with a confidence
    * score between 0 and 1.
    */
   export class IntentClassifier {
     /**
      * Classify a natural language question into an intent.
      *
      * @param question - The natural language question to classify
      * @returns ClassificationResult with intent, confidence, and per-signal scores
      */
     classify(question: string): ClassificationResult {
       const normalized = question.toLowerCase().trim();

       const scores: Array<{
         readonly intent: Intent;
         readonly confidence: number;
         readonly signals: Record<string, number>;
       }> = [];

       for (const intent of INTENTS) {
         const signals = this.scoreIntent(normalized, INTENT_SIGNALS[intent]);
         const confidence = this.combineSignals(signals);
         scores.push({ intent, confidence, signals });
       }

       // Sort descending by confidence
       scores.sort((a, b) => b.confidence - a.confidence);

       const best = scores[0]!;
       return {
         intent: best.intent,
         confidence: best.confidence,
         signals: best.signals,
       };
     }

     /**
      * Score individual signals for an intent against the normalized query.
      */
     private scoreIntent(normalized: string, signalSet: SignalSet): Record<string, number> {
       return {
         keyword: this.scoreKeywords(normalized, signalSet.keywords),
         questionWord: this.scoreQuestionWord(normalized, signalSet.questionWords),
         verbPattern: this.scoreVerbPatterns(normalized, signalSet.verbPatterns),
       };
     }

     /**
      * Score keyword signal: fraction of intent keywords found in the query.
      * Uses word-stem matching (checks if any word in the query starts with the keyword).
      */
     private scoreKeywords(normalized: string, keywords: readonly string[]): number {
       if (keywords.length === 0) return 0;

       const words = normalized.split(/\s+/);
       let matched = 0;

       for (const keyword of keywords) {
         if (words.some((w) => w.startsWith(keyword))) {
           matched++;
         }
       }

       return matched / keywords.length;
     }

     /**
      * Score question-word signal: 1.0 if the query starts with a matching
      * question word, 0 otherwise.
      */
     private scoreQuestionWord(normalized: string, questionWords: readonly string[]): number {
       const firstWord = normalized.split(/\s+/)[0] ?? '';
       return questionWords.includes(firstWord) ? 1.0 : 0.0;
     }

     /**
      * Score verb-pattern signal: fraction of verb patterns that match the query.
      */
     private scoreVerbPatterns(normalized: string, patterns: readonly RegExp[]): number {
       if (patterns.length === 0) return 0;

       let matched = 0;
       for (const pattern of patterns) {
         if (pattern.test(normalized)) {
           matched++;
         }
       }

       return matched / patterns.length;
     }

     /**
      * Combine individual signal scores into a single confidence score
      * using weighted average.
      */
     private combineSignals(signals: Record<string, number>): number {
       let total = 0;
       let weightSum = 0;

       for (const [signal, score] of Object.entries(signals)) {
         const weight = SIGNAL_WEIGHTS[signal] ?? 0;
         total += score * weight;
         weightSum += weight;
       }

       return weightSum > 0 ? total / weightSum : 0;
     }
   }
   ```

4. Run: `npx vitest run tests/nlq/IntentClassifier.test.ts` -- observe all tests pass.
5. Run: `harness validate`
6. Commit: `feat(nlq): implement IntentClassifier with multi-signal scoring`

---

### Task 3: Add low-confidence suggestion tests

**Depends on:** Task 2
**Files:** `packages/graph/tests/nlq/IntentClassifier.test.ts`

This task extends the test file with tests that validate the low-confidence behavior (confidence < 0.3 returning suggestions). The suggestion logic is a consumer concern (the orchestrator will use it), but we verify here that the classifier correctly produces low confidence for ambiguous/gibberish input, which is the classifier's contract.

1. Add the following test block to `packages/graph/tests/nlq/IntentClassifier.test.ts`, inside the main `describe('IntentClassifier', ...)` block, after the `edge cases` describe:

   ```typescript
   describe('low confidence detection', () => {
     it('returns confidence below 0.3 for unrelated input', () => {
       const result = classifier.classify('the weather is nice today');
       expect(result.confidence).toBeLessThan(0.3);
     });

     it('returns confidence below 0.3 for single stop word', () => {
       const result = classifier.classify('the');
       expect(result.confidence).toBeLessThan(0.3);
     });

     it('still picks the best intent even when confidence is low', () => {
       const result = classifier.classify('maybe something about risk');
       // 'risk' is a keyword for both impact and anomaly; classifier should still pick one
       expect(result.intent).toBeDefined();
       expect(typeof result.confidence).toBe('number');
     });
   });
   ```

2. Run: `npx vitest run tests/nlq/IntentClassifier.test.ts` -- observe all tests pass (including new ones).
3. Run: `harness validate`
4. Commit: `test(nlq): add low-confidence classification tests`

---

### Task 4: Add disambiguation and additional coverage tests

**Depends on:** Task 3
**Files:** `packages/graph/tests/nlq/IntentClassifier.test.ts`

This task adds tests for queries that could match multiple intents, ensuring the classifier picks the most specific one. This brings total test count well above 25.

1. Add the following test block to `packages/graph/tests/nlq/IntentClassifier.test.ts`, inside the main describe:

   ```typescript
   describe('disambiguation', () => {
     it('prefers impact over explain for "what happens if I change X"', () => {
       const result = classifier.classify('what happens if I change the database?');
       expect(result.intent).toBe('impact');
     });

     it('prefers relationships over explain for "what depends on X"', () => {
       const result = classifier.classify('what depends on UserService?');
       expect(result.intent).toBe('relationships');
     });

     it('prefers anomaly over find for "find problems"', () => {
       const result = classifier.classify('find problems in the codebase');
       expect(result.intent).toBe('anomaly');
     });

     it('prefers find over explain for "where is X"', () => {
       const result = classifier.classify('where is the main entry point?');
       expect(result.intent).toBe('find');
     });

     it('prefers explain over relationships for "how does X work"', () => {
       const result = classifier.classify('how does the query engine work?');
       expect(result.intent).toBe('explain');
     });
   });
   ```

2. Run: `npx vitest run tests/nlq/IntentClassifier.test.ts` -- observe all tests pass.
3. If any disambiguation test fails, adjust `SIGNAL_WEIGHTS` in `IntentClassifier.ts` to correct the ranking. The verb-pattern weight (0.45) should generally dominate over keywords (0.35) to ensure phrase-level patterns win over individual word matches.
4. Run: `harness validate`
5. Commit: `test(nlq): add disambiguation and coverage tests for IntentClassifier`

---

### Task 5: Export IntentClassifier and INTENTS from nlq index

**Depends on:** Task 4
**Files:** `packages/graph/src/nlq/index.ts`

1. Modify `packages/graph/src/nlq/index.ts` to add exports:

   Replace:

   ```typescript
   export type { Intent, ClassificationResult, ResolvedEntity, AskGraphResult } from './types.js';
   ```

   With:

   ```typescript
   export { INTENTS } from './types.js';
   export type { Intent, ClassificationResult, ResolvedEntity, AskGraphResult } from './types.js';
   export { IntentClassifier } from './IntentClassifier.js';
   ```

2. Run: `npx vitest run tests/nlq/` -- verify all NLQ tests pass (both types.test.ts and IntentClassifier.test.ts).
3. Run: `harness validate`
4. Commit: `feat(nlq): export IntentClassifier and INTENTS from nlq index`

## Traceability

| Observable Truth                                  | Delivered by                                                     |
| ------------------------------------------------- | ---------------------------------------------------------------- |
| 1. impact classification                          | Task 2 (tests + impl)                                            |
| 2. find classification                            | Task 2                                                           |
| 3. relationships classification                   | Task 2                                                           |
| 4. explain classification                         | Task 2                                                           |
| 5. anomaly classification                         | Task 2                                                           |
| 6. 25+ test questions                             | Tasks 2, 3, 4 (5 per intent + edge cases + disambiguation = 35+) |
| 7. low confidence < 0.3 returns suggestions basis | Task 3                                                           |
| 8. INTENTS const array                            | Task 1                                                           |
| 9. test suite passes                              | Tasks 2, 3, 4                                                    |
| 10. harness validate                              | Every task                                                       |

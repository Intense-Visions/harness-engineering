# Plan: outcome-eval — Phase 1 (Types & Contract)

**Date:** 2026-06-22 | **Spec:** docs/changes/outcome-eval/proposal.md | **Tasks:** 4 | **Time:** ~15 min | **Integration Tier:** small

## Goal

Create the `packages/intelligence/src/outcome-eval/` module skeleton with the core
contract types, a zod `verdictSchema` for the LLM response (no `authority`), and the
confidence→authority mapping as a pure, exhaustively-tested function. No LLM calls,
no graph writes, no section resolver — those are Phases 2–5.

## Scope (this phase only)

Covers spec Implementation Order **Phase 1** and Success Criteria **2, 3, 4**.
Out of scope: section resolver (criterion 5), evaluator/prompts (1, 7), graph
persistence (6), skill/orchestrator wiring (8, 9).

## Observable Truths (Acceptance Criteria)

1. `outcome-eval/types.ts` exports `Verdict`, `Confidence`, `JudgedAgainst`,
   `OutcomeEvalInput`, `OutcomeVerdict` exactly as the spec's Technical Design.
2. `authority.ts` exports `deriveAuthority(verdict, confidence)` returning
   `'blocking'` **iff** `verdict === 'NOT_SATISFIED' && confidence === 'high'`;
   the other 8 of 9 verdict×confidence pairs return `'advisory'` (Criterion 2, 3).
3. `prompts.ts` exports `verdictSchema` (zod) validating
   `{ verdict, confidence, rationale, unmetCriteria }` and a `LlmVerdict` inferred
   type; `authority` is **not** a field of the schema.
4. Running `npx vitest run tests/outcome-eval/authority.test.ts` passes: 9
   verdict×confidence pairs asserted, plus a payload-injection test proving a
   client-supplied `authority` key cannot reach the typed result via
   `verdictSchema` (Criterion 4).
5. `harness validate` passes; the module imports only `zod` and intra-module files
   (layer rule: `intelligence` may depend only on `types` and `graph`).

## File Map

- CREATE packages/intelligence/src/outcome-eval/types.ts
- CREATE packages/intelligence/src/outcome-eval/prompts.ts
- CREATE packages/intelligence/src/outcome-eval/authority.ts
- CREATE packages/intelligence/src/outcome-eval/index.ts
- CREATE packages/intelligence/tests/outcome-eval/authority.test.ts
- CREATE packages/intelligence/tests/outcome-eval/schema.test.ts
- MODIFY packages/intelligence/src/index.ts (add barrel exports)

## Skeleton

_Not produced — task count (4) below standard-mode threshold (8)._

## Uncertainties

- [ASSUMPTION] `verdictSchema` uses `.strict()` so an injected `authority` key is
  rejected at the schema boundary, satisfying Criterion 4 directly. If a future
  provider strips unknown keys instead, the strict schema still holds.
- [DEFERRABLE] `prompts.ts` will also gain `OUTCOME_EVAL_SYSTEM_PROMPT` and
  `buildUserPrompt` in Phase 3; this phase adds only `verdictSchema`.

## Tasks

### Task 1: Define core contract types

**Depends on:** none | **Files:** `packages/intelligence/src/outcome-eval/types.ts`

1. Create `packages/intelligence/src/outcome-eval/types.ts` with exactly:

   ```ts
   /**
    * outcome-eval contract types.
    *
    * `authority` is DERIVED in TypeScript from (verdict, confidence) via
    * `deriveAuthority` in `./authority.js`. It is NEVER read from the LLM
    * response — see `verdictSchema` in `./prompts.js`, which omits it.
    */

   export type Verdict = 'SATISFIED' | 'NOT_SATISFIED' | 'INCONCLUSIVE';

   export type Confidence = 'low' | 'medium' | 'high';

   export type JudgedAgainst = 'success-criteria' | 'user-visible-behavior' | 'overview';

   export interface OutcomeEvalInput {
     /** Absolute or repo-relative path to the spec markdown. */
     specPath: string;
     /** Unified diff of the change under judgment. */
     diff: string;
     /** Captured test-runner output. */
     testOutput: string;
     /** Pre-resolved judgment section; otherwise the section-resolver runs. */
     specSection?: string;
   }

   export interface OutcomeVerdict {
     verdict: Verdict;
     confidence: Confidence;
     /** Cites specific met / unmet criteria. */
     rationale: string;
     judgedAgainst: JudgedAgainst;
     /** Empty when SATISFIED. */
     unmetCriteria: string[];
     /** DERIVED in TS from (verdict, confidence); never from the LLM. */
     authority: 'blocking' | 'advisory';
   }
   ```

2. Run: `cd packages/intelligence && npx tsc --noEmit -p tsconfig.json` (expect clean; no consumers yet)
3. Run: `harness validate`
4. Commit: `feat(outcome-eval): define core contract types`

---

### Task 2 (TDD): confidence→authority pure function

**Depends on:** Task 1 | **Files:** `packages/intelligence/tests/outcome-eval/authority.test.ts`, `packages/intelligence/src/outcome-eval/authority.ts`

1. Create the test `packages/intelligence/tests/outcome-eval/authority.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { deriveAuthority } from '../../src/outcome-eval/authority.js';
   import type { Verdict, Confidence } from '../../src/outcome-eval/types.js';

   const VERDICTS: Verdict[] = ['SATISFIED', 'NOT_SATISFIED', 'INCONCLUSIVE'];
   const CONFIDENCES: Confidence[] = ['low', 'medium', 'high'];

   describe('deriveAuthority', () => {
     it('is blocking iff NOT_SATISFIED + high', () => {
       expect(deriveAuthority('NOT_SATISFIED', 'high')).toBe('blocking');
     });

     it('is advisory for every other verdict×confidence pair (8 of 9)', () => {
       for (const v of VERDICTS) {
         for (const c of CONFIDENCES) {
           const expected = v === 'NOT_SATISFIED' && c === 'high' ? 'blocking' : 'advisory';
           expect(deriveAuthority(v, c)).toBe(expected);
         }
       }
     });

     it('INCONCLUSIVE is always advisory regardless of confidence (Criterion 3)', () => {
       for (const c of CONFIDENCES) {
         expect(deriveAuthority('INCONCLUSIVE', c)).toBe('advisory');
       }
     });

     it('SATISFIED is always advisory regardless of confidence', () => {
       for (const c of CONFIDENCES) {
         expect(deriveAuthority('SATISFIED', c)).toBe('advisory');
       }
     });
   });
   ```

2. Run: `cd packages/intelligence && npx vitest run tests/outcome-eval/authority.test.ts` — observe failure (module not found).
3. Create the implementation `packages/intelligence/src/outcome-eval/authority.ts`:

   ```ts
   import type { Verdict, Confidence } from './types.js';

   /**
    * Pure mapping from (verdict, confidence) to ship authority.
    *
    * Blocking iff a NOT_SATISFIED verdict is held with high confidence; every
    * other combination — including all INCONCLUSIVE and SATISFIED cases — is
    * advisory. Missing inputs never punish the change.
    *
    * This function is the false-positive-critical seam. Authority is computed
    * here in TypeScript and is NEVER trusted from the LLM response.
    */
   export function deriveAuthority(
     verdict: Verdict,
     confidence: Confidence
   ): 'blocking' | 'advisory' {
     return verdict === 'NOT_SATISFIED' && confidence === 'high' ? 'blocking' : 'advisory';
   }
   ```

4. Run: `cd packages/intelligence && npx vitest run tests/outcome-eval/authority.test.ts` — observe pass.
5. Run: `harness validate`
6. Commit: `feat(outcome-eval): add deriveAuthority pure function`

---

### Task 3 (TDD): verdictSchema (zod LLM response, no authority)

**Depends on:** Task 1 | **Files:** `packages/intelligence/tests/outcome-eval/schema.test.ts`, `packages/intelligence/src/outcome-eval/prompts.ts`

1. Create the test `packages/intelligence/tests/outcome-eval/schema.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { verdictSchema } from '../../src/outcome-eval/prompts.js';

   describe('verdictSchema', () => {
     it('accepts a well-formed LLM verdict payload', () => {
       const parsed = verdictSchema.parse({
         verdict: 'NOT_SATISFIED',
         confidence: 'high',
         rationale: 'Criterion 2 unmet: endpoint returns 200 not 404.',
         unmetCriteria: ['Criterion 2'],
       });
       expect(parsed.verdict).toBe('NOT_SATISFIED');
       expect(parsed.confidence).toBe('high');
       expect(parsed.unmetCriteria).toEqual(['Criterion 2']);
     });

     it('does not expose authority as a field (Criterion 4)', () => {
       expect(Object.keys(verdictSchema.shape)).not.toContain('authority');
     });

     it('rejects a payload that attempts to inject authority directly (Criterion 4)', () => {
       const result = verdictSchema.safeParse({
         verdict: 'NOT_SATISFIED',
         confidence: 'high',
         rationale: 'attempting to self-assign blocking authority',
         unmetCriteria: [],
         authority: 'blocking',
       });
       expect(result.success).toBe(false);
     });

     it('rejects an out-of-enum verdict', () => {
       const result = verdictSchema.safeParse({
         verdict: 'MAYBE',
         confidence: 'high',
         rationale: 'x',
         unmetCriteria: [],
       });
       expect(result.success).toBe(false);
     });
   });
   ```

2. Run: `cd packages/intelligence && npx vitest run tests/outcome-eval/schema.test.ts` — observe failure (module not found).
3. Create the implementation `packages/intelligence/src/outcome-eval/prompts.ts`:

   ```ts
   import { z } from 'zod';

   /**
    * Zod schema for the LLM verdict response.
    *
    * `authority` is intentionally ABSENT: it is derived in TypeScript by
    * `deriveAuthority` and must never be supplied by the model. The schema is
    * `.strict()` so an injected `authority` (or any other extra key) is rejected
    * at the parse boundary rather than silently passing through.
    *
    * Phase 3 will add OUTCOME_EVAL_SYSTEM_PROMPT and buildUserPrompt here.
    */
   export const verdictSchema = z
     .object({
       verdict: z
         .enum(['SATISFIED', 'NOT_SATISFIED', 'INCONCLUSIVE'])
         .describe('Whether the change satisfies the judged spec section'),
       confidence: z
         .enum(['low', 'medium', 'high'])
         .describe('Confidence in the verdict; high requires a named criterion'),
       rationale: z.string().describe('Cites specific met / unmet criteria'),
       unmetCriteria: z.array(z.string()).describe('Unmet criteria; empty when SATISFIED'),
     })
     .strict();

   export type LlmVerdict = z.infer<typeof verdictSchema>;
   ```

4. Run: `cd packages/intelligence && npx vitest run tests/outcome-eval/schema.test.ts` — observe pass.
5. Run: `harness validate`
6. Commit: `feat(outcome-eval): add verdictSchema (no authority field)`

---

### Task 4: Barrel exports for the new module

**Depends on:** Tasks 1–3 | **Files:** `packages/intelligence/src/outcome-eval/index.ts`, `packages/intelligence/src/index.ts` | **Category:** integration

1. Create `packages/intelligence/src/outcome-eval/index.ts`:

   ```ts
   // outcome-eval — post-execution spec-satisfaction judgment (Phase 1: types & contract)
   export type {
     Verdict,
     Confidence,
     JudgedAgainst,
     OutcomeEvalInput,
     OutcomeVerdict,
   } from './types.js';
   export { deriveAuthority } from './authority.js';
   export { verdictSchema } from './prompts.js';
   export type { LlmVerdict } from './prompts.js';
   ```

2. In `packages/intelligence/src/index.ts`, append after the `// Outcome` block
   (the `ExecutionOutcomeConnector` export, around line 54):

   ```ts
   // Outcome-Eval — post-execution spec-satisfaction verdict (Phase 1: types & contract)
   export { deriveAuthority, verdictSchema } from './outcome-eval/index.js';
   export type {
     Verdict,
     Confidence,
     JudgedAgainst,
     OutcomeEvalInput,
     OutcomeVerdict,
     LlmVerdict,
   } from './outcome-eval/index.js';
   ```

3. Run: `cd packages/intelligence && npx tsc --noEmit -p tsconfig.json` — observe clean.
4. Run: `cd packages/intelligence && npx vitest run tests/outcome-eval/` — observe all pass.
5. Run: `harness validate`
6. Run: `harness check-deps` (confirm no new circular deps and layer rule respected)
7. Commit: `feat(outcome-eval): export module from intelligence barrel`

## Sequencing Notes

- Task 1 (types) is the root dependency. Tasks 2 and 3 both depend on Task 1 and
  are **parallelizable** (authority vs prompts touch disjoint files).
- Task 4 (barrels) depends on all of 1–3 and runs last.
- Every task is TDD where it produces logic (Tasks 2, 3); Tasks 1 and 4 are
  pure type/wiring with `tsc --noEmit` as their verification gate.

## Traceability

| Observable Truth                                    | Task(s) |
| --------------------------------------------------- | ------- |
| 1 — types exact                                     | Task 1  |
| 2 — deriveAuthority blocking iff NOT_SATISFIED+high | Task 2  |
| 3 — verdictSchema shape, no authority               | Task 3  |
| 4 — authority not LLM-readable (injection rejected) | Task 3  |
| 5 — harness validate + layer rule                   | Task 4  |

# Plan: outcome-eval Phase 3 — Evaluator & Prompts

**Date:** 2026-06-22 | **Spec:** docs/changes/outcome-eval/proposal.md | **Tasks:** 5 | **Time:** ~21 min | **Integration Tier:** medium

## Goal

Wire `OutcomeEvaluator` to an injected `AnalysisProvider` with a conservative-confidence prompt so `evaluate()` returns a fully populated `OutcomeVerdict` (verdict + confidence + judgedAgainst + TS-derived authority), satisfying spec Success Criteria 1 and 7. The graph write (`execution_outcome` node) is deferred to Phase 4 behind a clean seam.

## Scope Boundary (read first)

IN this phase (Phase 3 of the spec's Implementation Order):

- `prompts.ts`: add `OUTCOME_EVAL_SYSTEM_PROMPT` (conservative-confidence) and `buildUserPrompt(section, diff, testOutput)`. `verdictSchema` / `LlmVerdict` already exist from Phase 1 — do not redefine.
- `evaluator.ts`: `OutcomeEvaluator` class wired to `AnalysisProvider`, holding `GraphStore` for Phase 4.
- Unit tests with a stub provider (no real LLM): verdict/confidence/authority/judgedAgainst flow-through, INCONCLUSIVE on no-section, authority derivation, and the conservative-confidence calibration test (Criterion 7).

OUT of this phase (do NOT plan or implement):

- Phase 4: the `execution_outcome` graph write via `ExecutionOutcomeConnector` (Criterion 6).
- Phase 5: skill wrapper (`SKILL.md`, `skill.yaml`), orchestrator step 6.5, ADRs (Criteria 8, 9).

## Observable Truths (Acceptance Criteria)

1. (Criterion 1) `OutcomeEvaluator.evaluate(input)` returns an `OutcomeVerdict` with all of `verdict`, `confidence`, `judgedAgainst`, `authority` populated, for a spec+diff+testOutput input. Verified by a unit test with a stub provider returning a `SATISFIED`/`high` payload — asserting the resulting `authority === 'advisory'` and `judgedAgainst` equals the resolved section tag.
2. When `resolveSection` returns `null` (no judgable section), the system shall return `verdict: 'INCONCLUSIVE'`, `confidence` clamped per the prompt-free path, `judgedAgainst: 'overview'` (the terminal fallback tag), `unmetCriteria: []`, and `authority: 'advisory'` — WITHOUT calling the provider. Verified by a unit test asserting the stub provider's `analyze` spy was not called.
3. `evaluate()` derives `authority` via `deriveAuthority(verdict, confidence)` and never reads it from the provider response. Verified by a test feeding a stub payload that includes an injected `authority: 'blocking'` key: `verdictSchema.parse` (strict) rejects the extra key, so the evaluator's re-parse throws OR strips it; the returned `authority` is the TS-derived value, never `'blocking'` from the payload.
4. (Criterion 7) `OUTCOME_EVAL_SYSTEM_PROMPT` text contains the conservative-confidence posture: `high` confidence requires naming a specific met/unmet criterion; default is `medium`; bias toward advisory. Verified by a string-content assertion AND a stubbed partial-satisfaction scenario test asserting the evaluator faithfully returns the stub's `medium` confidence (the test documents that the prompt instructs the model to cap at `medium` for partial satisfaction).
5. `buildUserPrompt(section, diff, testOutput)` produces a prompt string embedding all three inputs under labeled headings. Verified by a unit test asserting each input substring is present.
6. `harness validate` passes for the intelligence package; the module imports only from `../analysis-provider`, `@harness-engineering/graph`, `./types.js`, `./prompts.js`, `./section-resolver.js`, `./authority.js` (layer rule: intelligence → types, graph).

## Uncertainties

- [ASSUMPTION] `provider.analyze<LlmVerdict>` returns `AnalysisResponse<LlmVerdict>` whose `.result` is the parsed payload (confirmed from `pesl/llm-simulation.ts:44-51` and `analysis-provider/interface.ts:11-19`). The evaluator re-parses `.result` through `verdictSchema` (`.strict()`) defensively so an injected `authority` key is rejected at the evaluator boundary regardless of whether the provider enforced strict mode. If wrong, Task 3 changes.
- [DEFERRABLE / documented follow-up] `analysis-provider/schema.ts#zodToJsonSchema` does NOT emit `additionalProperties: false` (confirmed: `convertObject` at schema.ts:6-18 never sets it). This matters ONLY for the openai-compatible provider's strict structured-output path. This phase's evaluator is provider-agnostic (provider is injected; tests use a stub), so it does NOT exercise that path. The evaluator's defensive `verdictSchema.parse(.strict())` re-parse is the in-TS guard that rejects an injected `authority` key even when the provider did not. Action: leave the schema.ts gap as a documented follow-up for the real-provider wiring in Phase 5; record it in the handoff `concerns`. No Phase 3 code change required.
- [ASSUMPTION] Holding `GraphStore` as an unused-for-now `private readonly store` does not trip lint. Confirmed by precedent: `PeslSimulator` (simulator.ts:26-34) stores `private readonly store: GraphStore` the same way. A `private readonly` field assigned in the constructor is not flagged as unused by the project's lint config. If lint flags it, the documented fallback is to reference it in the Phase 4 seam method body (a no-op `void this.store;`) — but the precedent says this is unnecessary.

## Design Decisions (this phase)

- **Phase 4 seam:** `evaluate()` calls a private `async persistOutcome(verdict, input): Promise<void>` method whose Phase 3 body is an intentional no-op (returns immediately). The method signature and call site exist now so Phase 4 fills only the body — no caller change. The no-op body has a one-line doc comment stating Phase 4 fills it; this is NOT a `// TODO` (the directive forbids TODO-free seams that are actually TODOs — the seam is a real, typed, called method, not a deferred edit).
- **No-section path:** when `resolveSection(markdown)` returns `null`, `evaluate()` short-circuits BEFORE calling the provider: builds an INCONCLUSIVE verdict directly with `judgedAgainst: 'overview'`, `confidence: 'low'`, `unmetCriteria: []`, authority via `deriveAuthority('INCONCLUSIVE', 'low') === 'advisory'`. (Rationale: missing inputs must never call the LLM and must never block — spec key design point "INCONCLUSIVE is always advisory".)
- **specSection precedence:** if `input.specSection` is provided, it is used as the section body and `judgedAgainst` defaults to `'success-criteria'` (the highest-priority tag) since the caller pre-resolved. Otherwise read the spec file at `input.specPath` and run `resolveSection`.
- **Strict re-parse:** `evaluate()` parses `response.result` through `verdictSchema` before constructing the verdict, so an injected `authority` key (or any extra key) is rejected at the evaluator boundary — the false-positive-critical seam holds even if a provider is lax.

## File Map

- MODIFY packages/intelligence/src/outcome-eval/prompts.ts (add OUTCOME_EVAL_SYSTEM_PROMPT, buildUserPrompt)
- CREATE packages/intelligence/src/outcome-eval/evaluator.ts
- MODIFY packages/intelligence/src/outcome-eval/index.ts (export OutcomeEvaluator, prompt symbols)
- CREATE packages/intelligence/tests/outcome-eval/prompts.test.ts
- CREATE packages/intelligence/tests/outcome-eval/evaluator.test.ts

## Skeleton

_Not produced — task count (5) below the standard-mode threshold (8)._

## Tasks

### Task 1: Add conservative-confidence prompts to prompts.ts (TDD)

**Depends on:** none | **Files:** packages/intelligence/src/outcome-eval/prompts.ts, packages/intelligence/tests/outcome-eval/prompts.test.ts

1. Create `packages/intelligence/tests/outcome-eval/prompts.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { OUTCOME_EVAL_SYSTEM_PROMPT, buildUserPrompt } from '../../src/outcome-eval/prompts.js';

   describe('OUTCOME_EVAL_SYSTEM_PROMPT', () => {
     it('encodes the conservative-confidence posture', () => {
       const p = OUTCOME_EVAL_SYSTEM_PROMPT.toLowerCase();
       // high confidence requires naming a specific criterion
       expect(p).toContain('high');
       expect(p).toMatch(/specific|name|cite/);
       // default is medium
       expect(p).toContain('medium');
       // bias toward advisory / not blocking
       expect(p).toMatch(/advisory|caution|conservative/);
     });

     it('instructs the model not to emit authority', () => {
       expect(OUTCOME_EVAL_SYSTEM_PROMPT.toLowerCase()).toMatch(/do not|never/);
       expect(OUTCOME_EVAL_SYSTEM_PROMPT.toLowerCase()).toContain('authority');
     });
   });

   describe('buildUserPrompt', () => {
     it('embeds section, diff, and test output under labeled headings', () => {
       const out = buildUserPrompt('SECTION_BODY', 'DIFF_BODY', 'TEST_BODY');
       expect(out).toContain('SECTION_BODY');
       expect(out).toContain('DIFF_BODY');
       expect(out).toContain('TEST_BODY');
       expect(out).toMatch(/spec|criteria/i);
       expect(out).toMatch(/diff/i);
       expect(out).toMatch(/test/i);
     });
   });
   ```

2. Run: `npx vitest run packages/intelligence/tests/outcome-eval/prompts.test.ts` — observe failure (symbols not exported).

3. Edit `packages/intelligence/src/outcome-eval/prompts.ts`. Remove the stale Phase-3 note in the file header comment ("Phase 3 will add OUTCOME_EVAL_SYSTEM_PROMPT and buildUserPrompt here.") since they now exist. Append AFTER the existing `verdictSchema` / `LlmVerdict` block (do not modify the schema):

   ````ts
   /**
    * System prompt for outcome-eval. Conservative-confidence posture copied from
    * security-craft (SKILL.md): the model defaults to `medium` confidence; `high`
    * requires naming a specific met or unmet criterion; the bias is toward
    * advisory, not blocking. `authority` is derived in TypeScript and must never
    * be supplied by the model — the schema is `.strict()` and rejects it.
    */
   export const OUTCOME_EVAL_SYSTEM_PROMPT = `You are a post-execution outcome judge. Given a spec acceptance section, a unified diff, and test output, decide whether the change SATISFIED, NOT_SATISFIED, or is INCONCLUSIVE against that section.
   
   Confidence calibration (be conservative — false alarms are costly):
   - Default to "medium" confidence.
   - Use "high" ONLY when you can name a SPECIFIC criterion from the section that the diff and test output clearly met or clearly failed to meet, and quote or paraphrase it in the rationale.
   - Use "low" when the diff or test output is ambiguous, partial, or insufficient to judge.
   - When the change only PARTIALLY meets the criteria, do not exceed "medium" confidence.
   - Bias toward advisory caution: if unsure between two confidence levels, choose the lower one.
   
   Rules:
   - The rationale MUST cite specific met or unmet criteria from the section.
   - "unmetCriteria" lists the section criteria the change failed to meet; it is empty when the verdict is SATISFIED.
   - Do NOT emit an "authority" field. Authority is computed downstream in TypeScript from (verdict, confidence) and must never come from you.
   
   Return your judgment using the structured_output tool.`;

   /**
    * Build the user prompt from the resolved spec section body, the change diff,
    * and the captured test output. Mirrors the labeled-section structure of
    * sel/pesl prompts.
    */
   export function buildUserPrompt(section: string, diff: string, testOutput: string): string {
     return [
       '## Spec Acceptance Criteria (judge against this section)',
       section.trim() || '(empty — treat as inconclusive)',
       '',
       '## Change Diff',
       '```diff',
       diff.trim() || '(empty diff)',
       '```',
       '',
       '## Test Output',
       '```',
       testOutput.trim() || '(no test output captured)',
       '```',
       '',
       '## Instructions',
       'Judge whether the diff satisfies the acceptance criteria above. Calibrate confidence conservatively per your system instructions. Cite specific criteria in the rationale.',
     ].join('\n');
   }
   ````

4. Run: `npx vitest run packages/intelligence/tests/outcome-eval/prompts.test.ts` — observe pass.

5. Run: `npx harness validate`

6. Commit: `feat(outcome-eval): add conservative-confidence system prompt and buildUserPrompt`

### Task 2: Create OutcomeEvaluator with the no-section INCONCLUSIVE short-circuit (TDD)

**Depends on:** Task 1 | **Files:** packages/intelligence/src/outcome-eval/evaluator.ts, packages/intelligence/tests/outcome-eval/evaluator.test.ts

This task creates the class skeleton, the constructor (holding the unused-now `store`), and the no-section path. The provider-call path is added in Task 3.

1. Create `packages/intelligence/tests/outcome-eval/evaluator.test.ts` with a stub provider and shared helpers, plus the no-section test:

   ```ts
   import { describe, it, expect, vi } from 'vitest';
   import { GraphStore } from '@harness-engineering/graph';
   import type {
     AnalysisProvider,
     AnalysisResponse,
   } from '../../src/analysis-provider/interface.js';
   import { OutcomeEvaluator } from '../../src/outcome-eval/evaluator.js';
   import type { LlmVerdict } from '../../src/outcome-eval/prompts.js';

   function makeProvider(
     payload: Record<string, unknown>,
     analyzeSpy = vi.fn()
   ): { provider: AnalysisProvider; analyzeSpy: ReturnType<typeof vi.fn> } {
     const provider: AnalysisProvider = {
       async analyze<T>(): Promise<AnalysisResponse<T>> {
         analyzeSpy();
         return {
           result: payload as T,
           tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
           model: 'stub',
           latencyMs: 0,
         };
       },
     };
     return { provider, analyzeSpy };
   }

   const SPEC_WITH_CRITERIA = [
     '# Spec',
     '## Success Criteria',
     '1. The endpoint returns 200.',
     '',
   ].join('\n');

   const SPEC_NO_SECTION = ['# Spec', '## Random Heading', 'nothing judgable here', ''].join('\n');

   describe('OutcomeEvaluator — no judgable section', () => {
     it('returns INCONCLUSIVE/advisory WITHOUT calling the provider', async () => {
       const { provider, analyzeSpy } = makeProvider({});
       const evaluator = new OutcomeEvaluator(provider, new GraphStore());
       const verdict = await evaluator.evaluate({
         specPath: 'in-memory',
         diff: 'some diff',
         testOutput: 'ok',
         specSection: undefined,
         // section resolution will use the markdown passed via specSection-less path;
         // see Task 2 step 3 for how specPath/markdown is read.
       });
       expect(analyzeSpy).not.toHaveBeenCalled();
       expect(verdict.verdict).toBe('INCONCLUSIVE');
       expect(verdict.authority).toBe('advisory');
       expect(verdict.judgedAgainst).toBe('overview');
       expect(verdict.unmetCriteria).toEqual([]);
     });
   });
   ```

   NOTE: the no-section test needs the evaluator to see `SPEC_NO_SECTION` markdown. Because `OutcomeEvalInput` reads `specPath` from disk, write the fixture to a temp file in the test. Replace the `evaluate` call above with:

   ```ts
   import { mkdtempSync, writeFileSync } from 'node:fs';
   import { tmpdir } from 'node:os';
   import { join } from 'node:path';

   const dir = mkdtempSync(join(tmpdir(), 'outcome-eval-'));
   const noSectionPath = join(dir, 'no-section.md');
   writeFileSync(noSectionPath, SPEC_NO_SECTION);
   // ...
   const verdict = await evaluator.evaluate({
     specPath: noSectionPath,
     diff: 'some diff',
     testOutput: 'ok',
   });
   ```

   (Keep `SPEC_WITH_CRITERIA` exported/defined for Tasks 3 and 4.)

2. Run: `npx vitest run packages/intelligence/tests/outcome-eval/evaluator.test.ts` — observe failure (no module).

3. Create `packages/intelligence/src/outcome-eval/evaluator.ts`:

   ```ts
   import { readFile } from 'node:fs/promises';
   import type { GraphStore } from '@harness-engineering/graph';
   import type { AnalysisProvider } from '../analysis-provider/interface.js';
   import type { OutcomeEvalInput, OutcomeVerdict, JudgedAgainst } from './types.js';
   import { deriveAuthority } from './authority.js';
   import { resolveSection } from './section-resolver.js';
   import { OUTCOME_EVAL_SYSTEM_PROMPT, buildUserPrompt, verdictSchema } from './prompts.js';
   import type { LlmVerdict } from './prompts.js';

   export interface OutcomeEvaluatorOptions {
     /** Override model for the outcome-eval LLM call. */
     model?: string;
   }

   /**
    * Post-execution spec-satisfaction judge. Mirrors PeslSimulator's
    * (provider, store, options) constructor shape. The store is held for the
    * Phase 4 execution_outcome graph write; see `persistOutcome`.
    */
   export class OutcomeEvaluator {
     private readonly provider: AnalysisProvider;
     private readonly store: GraphStore;
     private readonly options: OutcomeEvaluatorOptions;

     constructor(
       provider: AnalysisProvider,
       store: GraphStore,
       options: OutcomeEvaluatorOptions = {}
     ) {
       this.provider = provider;
       this.store = store;
       this.options = options;
     }

     async evaluate(input: OutcomeEvalInput): Promise<OutcomeVerdict> {
       const resolved = await this.resolveJudgmentSection(input);

       // No judgable section: never call the LLM, never block.
       if (resolved === null) {
         const verdict = this.buildVerdict(
           'INCONCLUSIVE',
           'low',
           'No judgable spec section found.',
           'overview',
           []
         );
         await this.persistOutcome(verdict, input);
         return verdict;
       }

       // Provider path added in Task 3.
       const verdict = this.buildVerdict(
         'INCONCLUSIVE',
         'low',
         'pending',
         resolved.judgedAgainst,
         []
       );
       await this.persistOutcome(verdict, input);
       return verdict;
     }

     private async resolveJudgmentSection(
       input: OutcomeEvalInput
     ): Promise<{ judgedAgainst: JudgedAgainst; body: string } | null> {
       if (input.specSection !== undefined) {
         return { judgedAgainst: 'success-criteria', body: input.specSection };
       }
       const markdown = await readFile(input.specPath, 'utf8');
       return resolveSection(markdown);
     }

     private buildVerdict(
       verdict: OutcomeVerdict['verdict'],
       confidence: OutcomeVerdict['confidence'],
       rationale: string,
       judgedAgainst: JudgedAgainst,
       unmetCriteria: string[]
     ): OutcomeVerdict {
       return {
         verdict,
         confidence,
         rationale,
         judgedAgainst,
         unmetCriteria,
         authority: deriveAuthority(verdict, confidence),
       };
     }

     /**
      * Phase 4 seam: writes the execution_outcome node via ExecutionOutcomeConnector.
      * Intentionally a no-op in Phase 3 — Phase 4 fills the body using `this.store`.
      */
     private async persistOutcome(
       _verdict: OutcomeVerdict,
       _input: OutcomeEvalInput
     ): Promise<void> {
       // No-op until Phase 4. `this.store` is held for that write.
       return;
     }
   }
   ```

   If lint flags `this.store` or `this.options` as unused: reference both inside `persistOutcome` with `void this.store;` and use `this.options.model` in Task 3 (it is consumed there). Document the chosen approach in the commit body if a `void` reference is needed.

4. Run: `npx vitest run packages/intelligence/tests/outcome-eval/evaluator.test.ts` — observe the no-section test pass.

5. Run: `npx harness validate`

6. Commit: `feat(outcome-eval): add OutcomeEvaluator with no-section INCONCLUSIVE short-circuit`

### Task 3: Wire the provider call with strict re-parse and TS-derived authority (TDD)

**Depends on:** Task 2 | **Files:** packages/intelligence/src/outcome-eval/evaluator.ts, packages/intelligence/tests/outcome-eval/evaluator.test.ts

1. Append tests to `packages/intelligence/tests/outcome-eval/evaluator.test.ts`:

   ```ts
   describe('OutcomeEvaluator — provider path', () => {
     it('flows verdict/confidence/judgedAgainst through and derives authority (Criterion 1)', async () => {
       const dir = mkdtempSync(join(tmpdir(), 'outcome-eval-'));
       const p = join(dir, 'spec.md');
       writeFileSync(p, SPEC_WITH_CRITERIA);
       const { provider, analyzeSpy } = makeProvider({
         verdict: 'SATISFIED',
         confidence: 'high',
         rationale: 'Criterion "returns 200" met by the new handler.',
         unmetCriteria: [],
       } satisfies LlmVerdict);
       const evaluator = new OutcomeEvaluator(provider, new GraphStore());
       const v = await evaluator.evaluate({ specPath: p, diff: 'd', testOutput: 't' });
       expect(analyzeSpy).toHaveBeenCalledOnce();
       expect(v.verdict).toBe('SATISFIED');
       expect(v.confidence).toBe('high');
       expect(v.judgedAgainst).toBe('success-criteria');
       expect(v.authority).toBe('advisory'); // SATISFIED is never blocking
       expect(v.rationale).toContain('returns 200');
     });

     it('derives blocking ONLY for NOT_SATISFIED+high', async () => {
       const dir = mkdtempSync(join(tmpdir(), 'outcome-eval-'));
       const p = join(dir, 'spec.md');
       writeFileSync(p, SPEC_WITH_CRITERIA);
       const { provider } = makeProvider({
         verdict: 'NOT_SATISFIED',
         confidence: 'high',
         rationale: 'Criterion "returns 200" unmet — handler returns 500.',
         unmetCriteria: ['returns 200'],
       } satisfies LlmVerdict);
       const v = await new OutcomeEvaluator(provider, new GraphStore()).evaluate({
         specPath: p,
         diff: 'd',
         testOutput: 't',
       });
       expect(v.authority).toBe('blocking');
       expect(v.unmetCriteria).toEqual(['returns 200']);
     });

     it('rejects an LLM-injected authority key at the strict parse boundary (Criterion 4)', async () => {
       const dir = mkdtempSync(join(tmpdir(), 'outcome-eval-'));
       const p = join(dir, 'spec.md');
       writeFileSync(p, SPEC_WITH_CRITERIA);
       const { provider } = makeProvider({
         verdict: 'NOT_SATISFIED',
         confidence: 'high',
         rationale: 'x',
         unmetCriteria: [],
         authority: 'blocking', // malicious/buggy extra key
       });
       const evaluator = new OutcomeEvaluator(provider, new GraphStore());
       // Strict schema rejects the extra key -> evaluate throws.
       await expect(
         evaluator.evaluate({ specPath: p, diff: 'd', testOutput: 't' })
       ).rejects.toThrow();
     });
   });
   ```

2. Run: `npx vitest run packages/intelligence/tests/outcome-eval/evaluator.test.ts` — observe the three new tests fail (evaluator still returns pending INCONCLUSIVE).

3. Edit `evaluator.ts` `evaluate()`: replace the "Provider path added in Task 3" block with the real call:

   ```ts
   const response = await this.provider.analyze<LlmVerdict>({
     prompt: buildUserPrompt(resolved.body, input.diff, input.testOutput),
     systemPrompt: OUTCOME_EVAL_SYSTEM_PROMPT,
     responseSchema: verdictSchema,
     ...(this.options.model !== undefined && { model: this.options.model }),
   });

   // Defensive strict re-parse: rejects any extra key (e.g. an injected
   // `authority`) even if the provider did not enforce strict mode. This is
   // the false-positive-critical seam — authority is derived in TS below.
   const llm = verdictSchema.parse(response.result);

   const verdict = this.buildVerdict(
     llm.verdict,
     llm.confidence,
     llm.rationale,
     resolved.judgedAgainst,
     llm.unmetCriteria
   );
   await this.persistOutcome(verdict, input);
   return verdict;
   ```

   Remove the now-dead `const verdict = this.buildVerdict('INCONCLUSIVE', 'low', 'pending', ...)` lines from Task 2.

4. Run: `npx vitest run packages/intelligence/tests/outcome-eval/evaluator.test.ts` — observe all pass.

5. Run: `npx harness validate`

6. Commit: `feat(outcome-eval): wire provider call with strict re-parse and TS-derived authority`

### Task 4: Conservative-confidence calibration test (Criterion 7) (TDD)

**Depends on:** Task 3 | **Files:** packages/intelligence/tests/outcome-eval/evaluator.test.ts

1. Append the calibration test. It pairs the system-prompt content assertion (the instruction that caps partial satisfaction at medium) with a stubbed partial-satisfaction scenario, asserting the evaluator faithfully returns the medium-confidence verdict and that such a verdict is advisory:

   ```ts
   import { OUTCOME_EVAL_SYSTEM_PROMPT } from '../../src/outcome-eval/prompts.js';

   describe('OutcomeEvaluator — conservative-confidence calibration (Criterion 7)', () => {
     it('system prompt caps partial satisfaction at medium', () => {
       expect(OUTCOME_EVAL_SYSTEM_PROMPT.toLowerCase()).toMatch(
         /partial.*medium|not exceed.*medium/
       );
     });

     it('a partial-satisfaction verdict (medium) is advisory, never blocking', async () => {
       const dir = mkdtempSync(join(tmpdir(), 'outcome-eval-'));
       const p = join(dir, 'spec.md');
       writeFileSync(p, SPEC_WITH_CRITERIA);
       // Stub models a partial-satisfaction outcome: NOT_SATISFIED at medium.
       const { provider } = makeProvider({
         verdict: 'NOT_SATISFIED',
         confidence: 'medium',
         rationale: 'Endpoint added but error path unverified — partial.',
         unmetCriteria: ['returns 200 on error path'],
       } satisfies LlmVerdict);
       const v = await new OutcomeEvaluator(provider, new GraphStore()).evaluate({
         specPath: p,
         diff: 'd',
         testOutput: 't',
       });
       expect(v.confidence).toBe('medium');
       expect(v.authority).toBe('advisory'); // medium NOT_SATISFIED never blocks
     });
   });
   ```

2. Run: `npx vitest run packages/intelligence/tests/outcome-eval/evaluator.test.ts` — if the first assertion fails because the prompt does not contain the `partial.*medium` phrasing, that means Task 1's prompt text must include the explicit "do not exceed medium" line. It does (the system prompt has "When the change only PARTIALLY meets the criteria, do not exceed \"medium\" confidence."). Confirm the regex matches; adjust the regex to the prompt wording if needed (do NOT weaken the prompt).

3. Run: `npx harness validate`

4. Commit: `test(outcome-eval): add conservative-confidence calibration test (Criterion 7)`

### Task 5: Export OutcomeEvaluator from the barrel and verify build

**Depends on:** Task 4 | **Files:** packages/intelligence/src/outcome-eval/index.ts | **Category:** integration

1. Edit `packages/intelligence/src/outcome-eval/index.ts`. Update the Phase-1 header comment to reflect Phase 3, and add exports:

   ```ts
   export { OutcomeEvaluator } from './evaluator.js';
   export type { OutcomeEvaluatorOptions } from './evaluator.js';
   export { OUTCOME_EVAL_SYSTEM_PROMPT, buildUserPrompt } from './prompts.js';
   ```

   (Confirm `verdictSchema` and `LlmVerdict` are already exported from Phase 1 — they are; do not duplicate.)

2. Add the new surface to the PACKAGE barrel `packages/intelligence/src/index.ts`. It uses explicit named exports (confirmed: lines 56-67 export `deriveAuthority, verdictSchema, resolveSection` and the types from `./outcome-eval/index.js` — NOT `export *`). So add the Phase 3 symbols to the existing value-export line and a new export:

   ```ts
   // change the existing value export line to include the new runtime exports:
   export {
     deriveAuthority,
     verdictSchema,
     resolveSection,
     OutcomeEvaluator,
     OUTCOME_EVAL_SYSTEM_PROMPT,
     buildUserPrompt,
   } from './outcome-eval/index.js';
   // and add OutcomeEvaluatorOptions to the existing `export type { ... } from './outcome-eval/index.js'` block.
   ```

   Update the `// Phase 1: types & contract` comment on the section header to `// Phase 3: evaluator & prompts`.

3. Run the full intelligence test suite: `npx vitest run packages/intelligence/tests/outcome-eval/`

4. Run: `npx harness validate`

5. Run: `npx harness check-deps` — confirm no new circular dependency and that outcome-eval imports only from analysis-provider, graph, and its own siblings (layer rule: intelligence → types, graph).

6. Commit: `feat(outcome-eval): export OutcomeEvaluator from package barrel`

## Sequencing Notes

- Task 1 (prompts) has no dependency and could run before or in parallel with the evaluator skeleton, but the evaluator imports the prompt symbols, so Task 1 precedes Task 2.
- Tasks 2 → 3 → 4 are strictly sequential (each extends `evaluate()` and the shared test file).
- Task 5 is the integration/barrel task and runs last.

## Carry-Over Notes for Phase 4 / Phase 5

- The `persistOutcome` private method in `evaluator.ts` is the Phase 4 seam — fill its body with the `ExecutionOutcomeConnector` write using `this.store`. Update Criterion 6 integration test there.
- `analysis-provider/schema.ts#zodToJsonSchema` does not emit `additionalProperties: false`. When Phase 5 wires the real openai-compatible provider, assess whether its strict structured-output mode requires it; the evaluator's `verdictSchema.parse` re-parse already guards the in-TS boundary, but the provider may reject or mis-handle the request schema. Tracked as a documented follow-up, not a Phase 3 blocker.
- No `docs/changes/outcome-eval/SKILLS.md` exists. Run `harness advise-skills --spec-path docs/changes/outcome-eval/proposal.md` before Phase 5 (skill wrapper) to get design/framework/knowledge skill recommendations.

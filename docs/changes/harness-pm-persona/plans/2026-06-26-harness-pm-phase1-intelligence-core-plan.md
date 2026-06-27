# Plan: Harness PM — Phase 1 (Intelligence core / `acceptance-eval` module)

**Date:** 2026-06-26 | **Spec:** `docs/changes/harness-pm-persona/proposal.md` (Phase 1: Intelligence core) | **Tasks:** 8 | **Time:** ~33 min | **Integration Tier:** medium

## Goal

Ship a new `packages/intelligence/src/acceptance-eval/` module — the upstream
twin of `outcome-eval` — that judges spec acceptance-criteria measurability via
the cli `AnalysisProvider`, deriving a `blocking` authority in TypeScript (never
from the LLM) only when criteria are objectively absent.

## Scope (Phase 1 only)

In: `types.ts`, `authority.ts` (+ exhaustive unit tests), `prompts.ts`
(schema + system prompt + user-prompt builder), `evaluator.ts`, `index.ts`
barrel, and root re-export from `packages/intelligence/src/index.ts`.
`section-resolver` is **imported** from `outcome-eval`, not forked.

Out (later phases): MCP tool (`packages/cli/src/mcp/tools/acceptance-eval.ts`,
Phase 2), skill (Phase 3), persona (Phase 4), docs/ADR (Phase 5), and any graph
persistence of an acceptance verdict.

## Observable Truths (Acceptance Criteria — Phase 1 subset)

1. `deriveAcceptanceAuthority(measurability, confidence)` returns `'blocking'`
   **iff** `measurability === 'NOT_MEASURABLE' && confidence === 'high'`; every
   other one of the 9 (measurability × confidence) pairs returns `'advisory'`.
   Unit-tested against a hand-written literal oracle for all 9 pairs.
2. `acceptanceVerdictSchema` is `.strict()`: it accepts a well-formed payload
   (`measurability`/`confidence`/`rationale`/`criteriaFindings`/`coverageFindings`),
   rejects a payload with an injected `authority` key, and rejects an
   out-of-enum `measurability`.
3. `AcceptanceEvaluator.evaluate()` flows `measurability`, `confidence`,
   `criteriaFindings`, `coverageFindings`, and `rationale` through from the
   provider response and sets `authority` via `deriveAcceptanceAuthority` —
   never reading `authority` from the LLM (strict re-parse discards it).
4. `evaluate()` degrades to `INCONCLUSIVE` / `low` / `advisory` with empty
   findings (never throws, never blocks) on: no judgable spec section, provider
   rejection, malformed payload, and a missing spec file. The provider is NOT
   called on the no-section or missing-file paths.
5. `section-resolver` is imported from `outcome-eval` — a grep for
   `function resolveSection` finds exactly one definition (in `outcome-eval`),
   none under `acceptance-eval`.
6. `AcceptanceEvaluator`, `deriveAcceptanceAuthority`, `acceptanceVerdictSchema`,
   and the `AcceptanceVerdict` type are exported from
   `@harness-engineering/intelligence` (`packages/intelligence/src/index.ts`).
7. `pnpm --filter @harness-engineering/intelligence test` passes for
   `tests/acceptance-eval/*`; `harness validate` passes (no NEW issues).

## File Map

```
CREATE packages/intelligence/src/acceptance-eval/types.ts
CREATE packages/intelligence/src/acceptance-eval/authority.ts
CREATE packages/intelligence/src/acceptance-eval/prompts.ts
CREATE packages/intelligence/src/acceptance-eval/evaluator.ts
CREATE packages/intelligence/src/acceptance-eval/index.ts
MODIFY packages/intelligence/src/index.ts            (add acceptance-eval re-exports)
CREATE packages/intelligence/tests/acceptance-eval/authority.test.ts
CREATE packages/intelligence/tests/acceptance-eval/schema.test.ts
CREATE packages/intelligence/tests/acceptance-eval/prompts.test.ts
CREATE packages/intelligence/tests/acceptance-eval/evaluator.test.ts
CREATE packages/intelligence/tests/acceptance-eval/exports.test.ts
REUSE  packages/intelligence/src/outcome-eval/section-resolver.ts  (import only — NOT modified, NOT forked)
```

## Key decisions (made during planning — flag if you disagree)

- **D-P1-1 — Reuse outcome-eval contract types.** `acceptance-eval/types.ts`
  imports `Confidence`, `JudgedAgainst`, and `Authority` from
  `../outcome-eval/types.js` and defines only the NEW types (`Measurability`,
  `Finding`, `AcceptanceEvalInput`, `AcceptanceVerdict`). The spec wrote
  `judgedAgainst: string`; we tighten it to the imported `JudgedAgainst` because
  the reused resolver returns it. This honors "reuse, don't fork" (SPEC-R004).
- **D-P1-2 — `Finding` shape.** No reusable `Finding` exists (the
  `CanaryFinding` in `adapters/canary.ts` is unrelated). Define a minimal
  advisory `Finding = { target: string; message: string }`. Both finding arrays
  are advisory-only, so no `severity` field is needed (YAGNI).
- **D-P1-3 — No GraphStore / no persistence in Phase 1.** `OutcomeEvaluator`'s
  constructor is `(provider, store, options)` because it writes an
  `execution_outcome` node. There is no acceptance-outcome node type and Phase 1
  success criteria do not require persistence, so `AcceptanceEvaluator`'s
  constructor is `(provider, options)`. See **Concerns** — the MCP tool's `path?`
  param (Phase 2) implies future persistence this phase does not build.
- **D-P1-4 — No-judgable-section degrades to advisory, does NOT block.** Mirrors
  `outcome-eval`'s "missing inputs never punish the change". The `blocking`
  trigger is exclusively an LLM-judged `NOT_MEASURABLE` + `high` over a section
  that exists. This avoids false-positive blocks on non-spec / mis-parsed files.
  This is a genuine judgment call — see `[checkpoint:decision]` on Task 5.

## Skeleton

_Not produced — task count (8) is below the standard-rigor threshold (8 triggers
a skeleton only at >= 8; the count is exactly at the boundary and the structure
is a direct mirror of the already-shipped `outcome-eval` module, so direction is
low-risk). Proceeding to full tasks._

## Tasks

### Task 1: Define `acceptance-eval` contract types

**Depends on:** none | **Files:** `packages/intelligence/src/acceptance-eval/types.ts`
**Skills:** `ts-module-patterns` (reference)

Types carry no runtime behavior; their correctness is exercised by the schema,
authority, and evaluator tests in later tasks.

1. Create `packages/intelligence/src/acceptance-eval/types.ts`:

   ```ts
   /**
    * acceptance-eval contract types — the upstream twin of outcome-eval.
    *
    * `authority` is DERIVED in TypeScript from (measurability, confidence) via
    * `deriveAcceptanceAuthority` in `./authority.js`. It is NEVER read from the
    * LLM response — see `acceptanceVerdictSchema` in `./prompts.js`, which omits
    * it. `Confidence`, `JudgedAgainst`, and `Authority` are REUSED from
    * outcome-eval (not forked), consistent with the imported section-resolver.
    */
   import type { Confidence, JudgedAgainst, Authority } from '../outcome-eval/types.js';

   export type { Confidence, JudgedAgainst, Authority };

   /** (c) the measurability gate dimension. */
   export type Measurability = 'MEASURABLE' | 'NOT_MEASURABLE' | 'INCONCLUSIVE';

   /** A single advisory observation about one criterion or behavior. */
   export interface Finding {
     /** The specific criterion or user-visible behavior this finding references. */
     target: string;
     /** The advisory observation (e.g. 'not observable', 'no covering test'). */
     message: string;
   }

   export interface AcceptanceEvalInput {
     /** Absolute or repo-relative path to the spec markdown. */
     specPath: string;
     /** Pre-resolved judgment section; otherwise the section-resolver runs. */
     specSection?: string;
     /**
      * Located test snippets for coverage responsibility (b). Optional: absence
      * degrades (b) coverageFindings to advisory-empty and never affects the
      * (c) measurability gate.
      */
     testContent?: string;
   }

   export interface AcceptanceVerdict {
     measurability: Measurability; // (c)
     confidence: Confidence;
     /** DERIVED in TS from (measurability, confidence); never from the LLM. */
     authority: Authority;
     /** Which spec section resolved. */
     judgedAgainst: JudgedAgainst;
     /** (a) advisory — observability / testability / completeness critique. */
     criteriaFindings: Finding[];
     /** (b) advisory — user-visible behaviors with no covering test. */
     coverageFindings: Finding[];
     rationale: string;
   }
   ```

2. Run: `pnpm --filter @harness-engineering/intelligence typecheck`
3. Run: `harness validate`
4. Commit: `feat(acceptance-eval): define contract types`

---

### Task 2: `deriveAcceptanceAuthority` + exhaustive 9-pair unit tests (TDD)

**Depends on:** Task 1 | **Files:** `packages/intelligence/src/acceptance-eval/authority.ts`, `packages/intelligence/tests/acceptance-eval/authority.test.ts`
**Skills:** `ts-testing-types` (reference)
**`[checkpoint:human-verify]`** — after tests pass, show the 9-pair oracle table and confirm it matches the gate intent (blocking only on objectively-absent criteria).

1. Create `packages/intelligence/tests/acceptance-eval/authority.test.ts`
   (mirrors `tests/outcome-eval/authority.test.ts` with a literal oracle):

   ```ts
   import { describe, it, expect } from 'vitest';
   import { deriveAcceptanceAuthority } from '../../src/acceptance-eval/authority.js';
   import type { Measurability, Confidence, Authority } from '../../src/acceptance-eval/types.js';

   const CONFIDENCES: Confidence[] = ['low', 'medium', 'high'];

   /** Hand-written oracle: all 9 (measurability, confidence) pairs as literals. */
   const AUTHORITY_TABLE: ReadonlyArray<[Measurability, Confidence, Authority]> = [
     ['MEASURABLE', 'low', 'advisory'],
     ['MEASURABLE', 'medium', 'advisory'],
     ['MEASURABLE', 'high', 'advisory'],
     ['NOT_MEASURABLE', 'low', 'advisory'],
     ['NOT_MEASURABLE', 'medium', 'advisory'],
     ['NOT_MEASURABLE', 'high', 'blocking'],
     ['INCONCLUSIVE', 'low', 'advisory'],
     ['INCONCLUSIVE', 'medium', 'advisory'],
     ['INCONCLUSIVE', 'high', 'advisory'],
   ];

   describe('deriveAcceptanceAuthority', () => {
     it('is blocking iff NOT_MEASURABLE + high', () => {
       expect(deriveAcceptanceAuthority('NOT_MEASURABLE', 'high')).toBe('blocking');
     });

     it.each(AUTHORITY_TABLE)(
       'maps (%s, %s) to %s — full 9-pair table against a literal oracle',
       (measurability, confidence, expected) => {
         expect(deriveAcceptanceAuthority(measurability, confidence)).toBe(expected);
       }
     );

     it('INCONCLUSIVE is always advisory regardless of confidence', () => {
       for (const c of CONFIDENCES) {
         expect(deriveAcceptanceAuthority('INCONCLUSIVE', c)).toBe('advisory');
       }
     });

     it('MEASURABLE is always advisory regardless of confidence', () => {
       for (const c of CONFIDENCES) {
         expect(deriveAcceptanceAuthority('MEASURABLE', c)).toBe('advisory');
       }
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/intelligence test acceptance-eval/authority`
   — observe failure (module not found).
3. Create `packages/intelligence/src/acceptance-eval/authority.ts` (exact
   structural mirror of `outcome-eval/authority.ts`):

   ```ts
   import type { Measurability, Confidence, Authority } from './types.js';

   /**
    * Pure mapping from (measurability, confidence) to gate authority.
    *
    * Blocking iff a spec is judged NOT_MEASURABLE with high confidence — i.e. it
    * objectively lacks measurable success criteria; every other combination,
    * including all INCONCLUSIVE and MEASURABLE cases, is advisory. Missing or
    * uncertain inputs never punish the spec.
    *
    * This function is the false-positive-critical seam. Authority is computed
    * here in TypeScript and is NEVER trusted from the LLM response.
    */
   export function deriveAcceptanceAuthority(
     measurability: Measurability,
     confidence: Confidence
   ): Authority {
     return measurability === 'NOT_MEASURABLE' && confidence === 'high' ? 'blocking' : 'advisory';
   }
   ```

4. Run the test again — observe pass.
5. Run: `harness validate`
6. **`[checkpoint:human-verify]`** Present the 9-pair table result; confirm gate intent.
7. Commit: `feat(acceptance-eval): derive blocking authority for unmeasurable specs`

---

### Task 3: `acceptanceVerdictSchema` + zod schema validation test (TDD)

**Depends on:** Task 1 | **Files:** `packages/intelligence/src/acceptance-eval/prompts.ts`, `packages/intelligence/tests/acceptance-eval/schema.test.ts`
**Skills:** `ts-zod-integration`, `zod-schema-definition`, `zod-infer-types` (reference)

1. Create `packages/intelligence/tests/acceptance-eval/schema.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { acceptanceVerdictSchema } from '../../src/acceptance-eval/prompts.js';

   describe('acceptanceVerdictSchema', () => {
     it('accepts a well-formed LLM verdict payload', () => {
       const parsed = acceptanceVerdictSchema.parse({
         measurability: 'NOT_MEASURABLE',
         confidence: 'high',
         rationale: 'No section states an observable, testable outcome.',
         criteriaFindings: [{ target: 'Criterion 1', message: 'not observable' }],
         coverageFindings: [{ target: 'login flow', message: 'no covering test' }],
       });
       expect(parsed.measurability).toBe('NOT_MEASURABLE');
       expect(parsed.criteriaFindings[0].target).toBe('Criterion 1');
       expect(parsed.coverageFindings[0].message).toBe('no covering test');
     });

     it('does not expose authority as a field', () => {
       expect(Object.keys(acceptanceVerdictSchema.shape)).not.toContain('authority');
     });

     it('rejects a payload that injects authority directly', () => {
       const result = acceptanceVerdictSchema.safeParse({
         measurability: 'NOT_MEASURABLE',
         confidence: 'high',
         rationale: 'attempting to self-assign blocking authority',
         criteriaFindings: [],
         coverageFindings: [],
         authority: 'blocking',
       });
       expect(result.success).toBe(false);
     });

     it('rejects an out-of-enum measurability', () => {
       const result = acceptanceVerdictSchema.safeParse({
         measurability: 'MAYBE',
         confidence: 'high',
         rationale: 'x',
         criteriaFindings: [],
         coverageFindings: [],
       });
       expect(result.success).toBe(false);
     });

     it('rejects a finding with an extra key (strict findings)', () => {
       const result = acceptanceVerdictSchema.safeParse({
         measurability: 'MEASURABLE',
         confidence: 'low',
         rationale: 'ok',
         criteriaFindings: [{ target: 't', message: 'm', severity: 'high' }],
         coverageFindings: [],
       });
       expect(result.success).toBe(false);
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/intelligence test acceptance-eval/schema`
   — observe failure (module not found).
3. Create `packages/intelligence/src/acceptance-eval/prompts.ts` with the schema
   half only (system prompt + builder added in Task 4):

   ```ts
   import { z } from 'zod';

   /** A single advisory finding. `.strict()` rejects unexpected keys. */
   export const findingSchema = z
     .object({
       target: z.string().describe('The criterion or user-visible behavior referenced'),
       message: z.string().describe('The advisory observation'),
     })
     .strict();

   /**
    * Zod schema for the LLM verdict response.
    *
    * `authority` is intentionally ABSENT: it is derived in TypeScript by
    * `deriveAcceptanceAuthority` and must never be supplied by the model. The
    * schema is `.strict()`, so an injected `authority` (or any other extra key)
    * is rejected at the parse boundary rather than silently passing through.
    */
   export const acceptanceVerdictSchema = z
     .object({
       measurability: z
         .enum(['MEASURABLE', 'NOT_MEASURABLE', 'INCONCLUSIVE'])
         .describe('Whether the spec section states measurable, testable success criteria'),
       confidence: z
         .enum(['low', 'medium', 'high'])
         .describe('Confidence in the verdict; high requires a named criterion'),
       rationale: z.string().describe('Cites specific criteria/behaviors'),
       criteriaFindings: z
         .array(findingSchema)
         .describe('(a) advisory observability/testability/completeness critique'),
       coverageFindings: z
         .array(findingSchema)
         .describe('(b) advisory user-visible behaviors with no covering test'),
     })
     .strict();

   export type LlmAcceptanceVerdict = z.infer<typeof acceptanceVerdictSchema>;
   ```

4. Run the test again — observe pass.
5. Run: `harness validate`
6. Commit: `feat(acceptance-eval): add strict zod verdict schema`

---

### Task 4: System prompt + `buildUserPrompt` + prompt tests (TDD)

**Depends on:** Task 3 | **Files:** `packages/intelligence/src/acceptance-eval/prompts.ts` (extend), `packages/intelligence/tests/acceptance-eval/prompts.test.ts`

1. Create `packages/intelligence/tests/acceptance-eval/prompts.test.ts`:

   `````ts
   import { describe, it, expect } from 'vitest';
   import {
     ACCEPTANCE_EVAL_SYSTEM_PROMPT,
     buildUserPrompt,
     PROMPT_FIELD_MAX_CHARS,
   } from '../../src/acceptance-eval/prompts.js';

   describe('ACCEPTANCE_EVAL_SYSTEM_PROMPT', () => {
     it('encodes the conservative-confidence posture', () => {
       const p = ACCEPTANCE_EVAL_SYSTEM_PROMPT.toLowerCase();
       expect(p).toContain('high');
       expect(p).toMatch(/specific|name|cite/);
       expect(p).toContain('medium');
       expect(p).toMatch(/advisory|caution|conservative/);
     });

     it('instructs the model not to emit authority', () => {
       expect(ACCEPTANCE_EVAL_SYSTEM_PROMPT.toLowerCase()).toMatch(/do not|never/);
       expect(ACCEPTANCE_EVAL_SYSTEM_PROMPT.toLowerCase()).toContain('authority');
     });

     it('names the three responsibilities (measurability, criteria, coverage)', () => {
       const p = ACCEPTANCE_EVAL_SYSTEM_PROMPT.toLowerCase();
       expect(p).toMatch(/measurab/);
       expect(p).toMatch(/cover|test/);
     });
   });

   describe('buildUserPrompt', () => {
     it('embeds the section and test content under labeled headings', () => {
       const out = buildUserPrompt('SECTION_BODY', 'TEST_BODY');
       expect(out).toContain('SECTION_BODY');
       expect(out).toContain('TEST_BODY');
       expect(out).toMatch(/criteria|acceptance/i);
       expect(out).toMatch(/test/i);
     });

     it('tolerates omitted test content with a placeholder', () => {
       const out = buildUserPrompt('SECTION_BODY');
       expect(out).toContain('SECTION_BODY');
       expect(out).toMatch(/no test content|not provided|none/i);
     });

     it('truncates over-long test content with a marker', () => {
       const huge = 'T'.repeat(PROMPT_FIELD_MAX_CHARS + 5000);
       const out = buildUserPrompt('SECTION', huge);
       expect(out).not.toContain(huge);
       expect(out).toMatch(/truncated/i);
     });

     it('fences test content containing triple backticks without early close', () => {
       const withFence = 'before\n```\ncode inside\n```\nafter';
       const out = buildUserPrompt('SECTION', withFence);
       expect(out).toContain('code inside');
       expect(out).toContain('````');
     });
   });
   `````

2. Run: `pnpm --filter @harness-engineering/intelligence test acceptance-eval/prompts`
   — observe failure (exports missing).
3. Append to `packages/intelligence/src/acceptance-eval/prompts.ts` (mirrors
   `outcome-eval/prompts.ts` clamp/fence helpers):

   `````ts
   /**
    * System prompt for acceptance-eval. Conservative-confidence posture mirrors
    * outcome-eval: default to medium; high requires naming a specific criterion;
    * bias toward advisory. `authority` is derived in TypeScript and must never be
    * supplied by the model — the schema is `.strict()` and rejects it.
    */
   export const ACCEPTANCE_EVAL_SYSTEM_PROMPT = `You are a PRE-execution acceptance-criteria judge. Given a spec acceptance section (and optionally located test snippets), assess three things:
   (a) criteria quality — are the success criteria observable, testable, and complete? (advisory findings)
   (b) coverage — do any user-visible behaviors lack a covering test? (advisory findings)
   (c) measurability — does the spec state MEASURABLE, NOT_MEASURABLE, or is it INCONCLUSIVE on whether any measurable success criteria exist at all?
   
   Confidence calibration (be conservative — false alarms are costly):
   - Default to "medium" confidence.
   - Use "high" ONLY when you can name a SPECIFIC criterion (or its absence) and quote or paraphrase it in the rationale.
   - Use "low" when the section is ambiguous, partial, or insufficient to judge.
   - Bias toward advisory caution: if unsure between two confidence levels, choose the lower one.
   
   Rules:
   - "measurability" is NOT_MEASURABLE only when the section states no observable, testable success criterion at all.
   - "criteriaFindings" holds advisory (a) observations; "coverageFindings" holds advisory (b) observations; both may be empty.
   - Do NOT emit an "authority" field. Authority is computed downstream in TypeScript from (measurability, confidence) and must never come from you.
   
   Return your judgment using the structured_output tool.`;

   /** Per-field character cap for the test-content block in the user prompt. */
   export const PROMPT_FIELD_MAX_CHARS = 12_000;

   /** Outer fence uses 4 backticks so an inner ``` cannot close it early. */
   const FENCE = '````';

   function clampField(text: string): string {
     const trimmed = text.trim();
     if (trimmed.length <= PROMPT_FIELD_MAX_CHARS) return trimmed;
     const dropped = trimmed.length - PROMPT_FIELD_MAX_CHARS;
     return `${trimmed.slice(0, PROMPT_FIELD_MAX_CHARS)}\n… [truncated ${dropped} chars]`;
   }

   /**
    * Build the user prompt from the resolved spec section body and optional
    * located test snippets. Test content is clamped to PROMPT_FIELD_MAX_CHARS and
    * wrapped in a 4-backtick fence so an inner ``` cannot close the fence early.
    */
   export function buildUserPrompt(section: string, testContent?: string): string {
     const tests = (testContent ?? '').trim();
     return [
       '## Spec Acceptance Criteria (judge against this section)',
       section.trim() || '(empty — treat as inconclusive)',
       '',
       '## Located Test Snippets (coverage evidence — may be absent)',
       `${FENCE}`,
       tests ? clampField(tests) : '(no test content provided)',
       FENCE,
       '',
       '## Instructions',
       'Judge measurability (c), and emit advisory criteria (a) and coverage (b) findings. Calibrate confidence conservatively per your system instructions. Cite specific criteria in the rationale.',
     ].join('\n');
   }
   `````

4. Run the test again — observe pass.
5. Run: `harness validate`
6. Commit: `feat(acceptance-eval): add system prompt and user-prompt builder`

---

### Task 5: `AcceptanceEvaluator` core + happy-path/no-section tests (TDD)

**Depends on:** Tasks 1, 3, 4 | **Files:** `packages/intelligence/src/acceptance-eval/evaluator.ts`, `packages/intelligence/tests/acceptance-eval/evaluator.test.ts`
**Skills:** `ts-testing-types`, `ts-satisfies-operator` (reference)
**`[checkpoint:decision]`** — confirm decision **D-P1-4**: a no-judgable-section spec degrades to `INCONCLUSIVE`/`advisory` (does NOT block). If the reviewer wants no-section to be the blocking case instead, this evaluator's no-section branch and its test change before proceeding.

1. Create `packages/intelligence/tests/acceptance-eval/evaluator.test.ts` with
   the stub-provider harness (mirrors `tests/outcome-eval/evaluator.test.ts`)
   plus the core cases:

   ```ts
   import { mkdtempSync, writeFileSync } from 'node:fs';
   import { tmpdir } from 'node:os';
   import { join } from 'node:path';
   import { describe, it, expect, vi } from 'vitest';
   import type {
     AnalysisProvider,
     AnalysisRequest,
     AnalysisResponse,
   } from '../../src/analysis-provider/interface.js';
   import { AcceptanceEvaluator } from '../../src/acceptance-eval/evaluator.js';
   import {
     ACCEPTANCE_EVAL_SYSTEM_PROMPT,
     acceptanceVerdictSchema,
   } from '../../src/acceptance-eval/prompts.js';
   import type { LlmAcceptanceVerdict } from '../../src/acceptance-eval/prompts.js';

   interface StubProvider {
     provider: AnalysisProvider;
     analyzeSpy: ReturnType<typeof vi.fn>;
     lastRequest: () => AnalysisRequest | undefined;
   }

   function makeProvider(
     payload: Record<string, unknown>,
     opts: { parseWithSchema?: boolean } = {}
   ): StubProvider {
     let captured: AnalysisRequest | undefined;
     const analyzeSpy = vi.fn();
     const provider: AnalysisProvider = {
       async analyze<T>(request: AnalysisRequest): Promise<AnalysisResponse<T>> {
         analyzeSpy(request);
         captured = request;
         const result = (
           opts.parseWithSchema ? request.responseSchema.parse(payload) : payload
         ) as T;
         return {
           result,
           tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
           model: request.model ?? 'stub',
           latencyMs: 0,
         };
       },
     };
     return { provider, analyzeSpy, lastRequest: () => captured };
   }

   const SPEC_WITH_CRITERIA = [
     '# Spec',
     '## Success Criteria',
     '1. The endpoint returns 200.',
     '',
   ].join('\n');
   const SPEC_NO_SECTION = ['# Spec', '## Random Heading', 'nothing judgable', ''].join('\n');

   function writeSpec(body: string): string {
     const dir = mkdtempSync(join(tmpdir(), 'acceptance-eval-'));
     const p = join(dir, 'spec.md');
     writeFileSync(p, body);
     return p;
   }

   const MEASURABLE: LlmAcceptanceVerdict = {
     measurability: 'MEASURABLE',
     confidence: 'medium',
     rationale: 'Criterion "returns 200" is observable and testable.',
     criteriaFindings: [],
     coverageFindings: [],
   };

   describe('AcceptanceEvaluator — no judgable section (D-P1-4)', () => {
     it('returns INCONCLUSIVE/advisory WITHOUT calling the provider', async () => {
       const { provider, analyzeSpy } = makeProvider({});
       const v = await new AcceptanceEvaluator(provider).evaluate({
         specPath: writeSpec(SPEC_NO_SECTION),
       });
       expect(analyzeSpy).not.toHaveBeenCalled();
       expect(v.measurability).toBe('INCONCLUSIVE');
       expect(v.authority).toBe('advisory');
       expect(v.judgedAgainst).toBe('overview');
       expect(v.criteriaFindings).toEqual([]);
       expect(v.coverageFindings).toEqual([]);
     });

     it('treats a pre-resolved empty specSection as no-section', async () => {
       const { provider, analyzeSpy } = makeProvider({});
       const v = await new AcceptanceEvaluator(provider).evaluate({
         specPath: '/nope.md',
         specSection: '  \n\t ',
       });
       expect(analyzeSpy).not.toHaveBeenCalled();
       expect(v.measurability).toBe('INCONCLUSIVE');
       expect(v.authority).toBe('advisory');
       expect(v.confidence).toBe('low');
     });
   });

   describe('AcceptanceEvaluator — provider request shape', () => {
     it('forwards system prompt, populated user prompt, schema, and model', async () => {
       const { provider, lastRequest } = makeProvider(MEASURABLE, { parseWithSchema: true });
       await new AcceptanceEvaluator(provider, { model: 'gpt-judge' }).evaluate({
         specPath: writeSpec(SPEC_WITH_CRITERIA),
         testContent: 'TEST_Y',
       });
       const req = lastRequest();
       expect(req?.systemPrompt).toBe(ACCEPTANCE_EVAL_SYSTEM_PROMPT);
       expect(req?.prompt).toContain('returns 200');
       expect(req?.prompt).toContain('TEST_Y');
       expect(req?.responseSchema).toBe(acceptanceVerdictSchema);
       expect(req?.model).toBe('gpt-judge');
     });

     it('omits the model when no override is configured', async () => {
       const { provider, lastRequest } = makeProvider(MEASURABLE);
       await new AcceptanceEvaluator(provider).evaluate({
         specPath: writeSpec(SPEC_WITH_CRITERIA),
       });
       expect(lastRequest()?.model).toBeUndefined();
     });
   });

   describe('AcceptanceEvaluator — provider path', () => {
     it('flows fields through and derives advisory authority for MEASURABLE', async () => {
       const { provider, analyzeSpy } = makeProvider(MEASURABLE);
       const v = await new AcceptanceEvaluator(provider).evaluate({
         specPath: writeSpec(SPEC_WITH_CRITERIA),
       });
       expect(analyzeSpy).toHaveBeenCalledOnce();
       expect(v.measurability).toBe('MEASURABLE');
       expect(v.judgedAgainst).toBe('success-criteria');
       expect(v.authority).toBe('advisory');
     });

     it('derives blocking ONLY for NOT_MEASURABLE+high and flows findings', async () => {
       const { provider } = makeProvider({
         measurability: 'NOT_MEASURABLE',
         confidence: 'high',
         rationale: 'No observable criterion is stated.',
         criteriaFindings: [{ target: 'Overview', message: 'no measurable outcome' }],
         coverageFindings: [],
       } satisfies LlmAcceptanceVerdict);
       const v = await new AcceptanceEvaluator(provider).evaluate({
         specPath: writeSpec(SPEC_WITH_CRITERIA),
       });
       expect(v.authority).toBe('blocking');
       expect(v.criteriaFindings[0].message).toBe('no measurable outcome');
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/intelligence test acceptance-eval/evaluator`
   — observe failure (module not found).
3. Create `packages/intelligence/src/acceptance-eval/evaluator.ts` (mirrors
   `OutcomeEvaluator` minus the GraphStore/persistence; reuses the imported
   `resolveSection`). The `judge` try/catch degrade body is added in Task 6 —
   here the provider call is direct so the no-section + happy + blocking tests
   pass:

   ```ts
   import { readFile } from 'node:fs/promises';
   import type { AnalysisProvider } from '../analysis-provider/interface.js';
   import { resolveSection } from '../outcome-eval/section-resolver.js';
   import type { AcceptanceEvalInput, AcceptanceVerdict, JudgedAgainst } from './types.js';
   import { deriveAcceptanceAuthority } from './authority.js';
   import {
     ACCEPTANCE_EVAL_SYSTEM_PROMPT,
     buildUserPrompt,
     acceptanceVerdictSchema,
   } from './prompts.js';
   import type { LlmAcceptanceVerdict } from './prompts.js';

   export interface AcceptanceEvaluatorOptions {
     /** Override model for the acceptance-eval LLM call. */
     model?: string;
   }

   /**
    * Pre-execution acceptance-criteria judge — the upstream twin of
    * OutcomeEvaluator. Built on the cli AnalysisProvider. The LLM returns only
    * measurability/confidence/criteriaFindings/coverageFindings/rationale;
    * `authority` is derived in TypeScript and never read from the model.
    *
    * Unlike OutcomeEvaluator it holds no GraphStore: there is no acceptance
    * outcome node type and Phase 1 does not persist (see plan D-P1-3).
    */
   export class AcceptanceEvaluator {
     private readonly provider: AnalysisProvider;
     private readonly options: AcceptanceEvaluatorOptions;

     constructor(provider: AnalysisProvider, options: AcceptanceEvaluatorOptions = {}) {
       this.provider = provider;
       this.options = options;
     }

     async evaluate(input: AcceptanceEvalInput): Promise<AcceptanceVerdict> {
       let resolved: { judgedAgainst: JudgedAgainst; body: string } | null;
       try {
         resolved = await this.resolveJudgmentSection(input);
       } catch {
         return this.degradedVerdict('overview');
       }

       if (resolved === null) {
         return this.buildVerdict(
           'INCONCLUSIVE',
           'low',
           'No judgable spec section found.',
           'overview',
           [],
           []
         );
       }

       return this.judge(resolved, input);
     }

     private async judge(
       resolved: { judgedAgainst: JudgedAgainst; body: string },
       input: AcceptanceEvalInput
     ): Promise<AcceptanceVerdict> {
       const response = await this.provider.analyze<LlmAcceptanceVerdict>({
         prompt: buildUserPrompt(resolved.body, input.testContent),
         systemPrompt: ACCEPTANCE_EVAL_SYSTEM_PROMPT,
         responseSchema: acceptanceVerdictSchema,
         ...(this.options.model !== undefined && { model: this.options.model }),
       });
       const llm = acceptanceVerdictSchema.parse(response.result);
       return this.buildVerdict(
         llm.measurability,
         llm.confidence,
         llm.rationale,
         resolved.judgedAgainst,
         llm.criteriaFindings,
         llm.coverageFindings
       );
     }

     private degradedVerdict(judgedAgainst: JudgedAgainst): AcceptanceVerdict {
       return this.buildVerdict(
         'INCONCLUSIVE',
         'low',
         'Evaluation could not be completed; defaulting to an inconclusive, advisory verdict.',
         judgedAgainst,
         [],
         []
       );
     }

     private async resolveJudgmentSection(
       input: AcceptanceEvalInput
     ): Promise<{ judgedAgainst: JudgedAgainst; body: string } | null> {
       if (input.specSection !== undefined) {
         return input.specSection.trim() === ''
           ? null
           : { judgedAgainst: 'success-criteria', body: input.specSection };
       }
       const markdown = await readFile(input.specPath, 'utf8');
       return resolveSection(markdown);
     }

     private buildVerdict(
       measurability: AcceptanceVerdict['measurability'],
       confidence: AcceptanceVerdict['confidence'],
       rationale: string,
       judgedAgainst: JudgedAgainst,
       criteriaFindings: AcceptanceVerdict['criteriaFindings'],
       coverageFindings: AcceptanceVerdict['coverageFindings']
     ): AcceptanceVerdict {
       return {
         measurability,
         confidence,
         rationale,
         judgedAgainst,
         criteriaFindings,
         coverageFindings,
         authority: deriveAcceptanceAuthority(measurability, confidence),
       };
     }
   }
   ```

4. Run the test again — observe pass.
5. **`[checkpoint:decision]`** Confirm D-P1-4 (no-section → advisory).
6. Run: `harness validate`
7. Commit: `feat(acceptance-eval): add AcceptanceEvaluator core`

---

### Task 6: Degrade-safe error boundary for the evaluator (TDD)

**Depends on:** Task 5 | **Files:** `packages/intelligence/src/acceptance-eval/evaluator.ts` (wrap `judge`), `packages/intelligence/tests/acceptance-eval/evaluator.test.ts` (extend)

1. Append degrade-safe cases to `evaluator.test.ts` (add a rejecting-provider
   helper at the top of the new `describe`):

   ```ts
   function makeRejectingProvider(reason: string) {
     const analyzeSpy = vi.fn();
     const provider: AnalysisProvider = {
       async analyze<T>(request: AnalysisRequest): Promise<AnalysisResponse<T>> {
         analyzeSpy(request);
         throw new Error(reason);
       },
     };
     return { provider, analyzeSpy };
   }

   describe('AcceptanceEvaluator — degrade-safe error boundary', () => {
     it('degrades to INCONCLUSIVE/advisory when the provider rejects (no secret leak)', async () => {
       const { provider, analyzeSpy } = makeRejectingProvider('429 rate limited: sk-secret-token');
       const v = await new AcceptanceEvaluator(provider).evaluate({
         specPath: writeSpec(SPEC_WITH_CRITERIA),
       });
       expect(analyzeSpy).toHaveBeenCalledOnce();
       expect(v.measurability).toBe('INCONCLUSIVE');
       expect(v.confidence).toBe('low');
       expect(v.authority).toBe('advisory');
       expect(v.judgedAgainst).toBe('success-criteria');
       expect(v.rationale).not.toContain('sk-secret-token');
       expect(v.rationale).toMatch(/could not be completed/i);
     });

     it('degrades when the strict re-parse fails on a malformed payload', async () => {
       const { provider } = makeProvider({ measurability: 'MAYBE' });
       const v = await new AcceptanceEvaluator(provider).evaluate({
         specPath: writeSpec(SPEC_WITH_CRITERIA),
       });
       expect(v.measurability).toBe('INCONCLUSIVE');
       expect(v.authority).toBe('advisory');
       expect(v.judgedAgainst).toBe('success-criteria');
     });

     it('never surfaces an LLM-injected authority key; degrades to advisory', async () => {
       const { provider } = makeProvider({
         measurability: 'NOT_MEASURABLE',
         confidence: 'high',
         rationale: 'x',
         criteriaFindings: [],
         coverageFindings: [],
         authority: 'blocking',
       });
       const v = await new AcceptanceEvaluator(provider).evaluate({
         specPath: writeSpec(SPEC_WITH_CRITERIA),
       });
       expect(v.authority).toBe('advisory'); // injected 'blocking' never surfaces
       expect(v.measurability).toBe('INCONCLUSIVE');
       expect(v.confidence).toBe('low');
     });

     it('degrades to advisory when the spec file is missing; provider NOT called', async () => {
       const { provider, analyzeSpy } = makeProvider({});
       const v = await new AcceptanceEvaluator(provider).evaluate({
         specPath: '/definitely/missing/spec.md',
       });
       expect(analyzeSpy).not.toHaveBeenCalled();
       expect(v.measurability).toBe('INCONCLUSIVE');
       expect(v.authority).toBe('advisory');
       expect(v.judgedAgainst).toBe('overview');
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/intelligence test acceptance-eval/evaluator`
   — observe failures (the injected-authority and provider-rejection cases throw
   because `judge` has no try/catch yet).
3. Wrap the body of `judge` in `evaluator.ts` in a try/catch that degrades
   (replace the current direct body):

   ```ts
     private async judge(
       resolved: { judgedAgainst: JudgedAgainst; body: string },
       input: AcceptanceEvalInput
     ): Promise<AcceptanceVerdict> {
       try {
         const response = await this.provider.analyze<LlmAcceptanceVerdict>({
           prompt: buildUserPrompt(resolved.body, input.testContent),
           systemPrompt: ACCEPTANCE_EVAL_SYSTEM_PROMPT,
           responseSchema: acceptanceVerdictSchema,
           ...(this.options.model !== undefined && { model: this.options.model }),
         });
         // Defensive strict re-parse: rejects any extra key (e.g. an injected
         // `authority`) even if the provider did not enforce strict mode.
         const llm = acceptanceVerdictSchema.parse(response.result);
         return this.buildVerdict(
           llm.measurability,
           llm.confidence,
           llm.rationale,
           resolved.judgedAgainst,
           llm.criteriaFindings,
           llm.coverageFindings
         );
       } catch {
         return this.degradedVerdict(resolved.judgedAgainst);
       }
     }
   ```

4. Run the full evaluator test again — observe all pass.
5. Run: `harness validate`
6. Commit: `feat(acceptance-eval): degrade safely on provider/parse failure`

---

### Task 7: Barrel exports for the `acceptance-eval` module

**Depends on:** Tasks 1, 2, 3, 4, 6 | **Files:** `packages/intelligence/src/acceptance-eval/index.ts`
**Skills:** `ts-module-patterns` (reference)

1. Create `packages/intelligence/src/acceptance-eval/index.ts` (mirror
   `outcome-eval/index.ts`):

   ```ts
   // acceptance-eval — pre-execution acceptance-criteria measurability judgment.
   export type {
     Measurability,
     Finding,
     AcceptanceEvalInput,
     AcceptanceVerdict,
     Confidence,
     JudgedAgainst,
     Authority,
   } from './types.js';
   export { deriveAcceptanceAuthority } from './authority.js';
   export {
     acceptanceVerdictSchema,
     findingSchema,
     ACCEPTANCE_EVAL_SYSTEM_PROMPT,
     buildUserPrompt,
   } from './prompts.js';
   export type { LlmAcceptanceVerdict } from './prompts.js';
   export { AcceptanceEvaluator } from './evaluator.js';
   export type { AcceptanceEvaluatorOptions } from './evaluator.js';
   ```

2. Run: `pnpm --filter @harness-engineering/intelligence typecheck`
3. Run: `harness validate`
4. Commit: `feat(acceptance-eval): add module barrel exports`

---

### Task 8: Wire root package exports + exports/reuse guard test (TDD)

**Depends on:** Task 7 | **Files:** `packages/intelligence/src/index.ts` (modify), `packages/intelligence/tests/acceptance-eval/exports.test.ts` | **Category:** integration

1. Create `packages/intelligence/tests/acceptance-eval/exports.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import {
     AcceptanceEvaluator,
     deriveAcceptanceAuthority,
     acceptanceVerdictSchema,
   } from '../../src/index.js';
   import type { AcceptanceVerdict } from '../../src/index.js';

   describe('@harness-engineering/intelligence acceptance-eval surface', () => {
     it('re-exports AcceptanceEvaluator, deriveAcceptanceAuthority, acceptanceVerdictSchema', () => {
       expect(typeof AcceptanceEvaluator).toBe('function');
       expect(typeof deriveAcceptanceAuthority).toBe('function');
       expect(typeof acceptanceVerdictSchema.parse).toBe('function');
     });

     it('AcceptanceVerdict type is importable from the barrel (compile-time)', () => {
       const v: AcceptanceVerdict = {
         measurability: 'MEASURABLE',
         confidence: 'low',
         authority: 'advisory',
         judgedAgainst: 'success-criteria',
         criteriaFindings: [],
         coverageFindings: [],
         rationale: 'ok',
       };
       expect(v.authority).toBe('advisory');
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/intelligence test acceptance-eval/exports`
   — observe failure (symbols not exported from `src/index.js`).
3. Modify `packages/intelligence/src/index.ts` — add after the Outcome-Eval
   export block (around line 84):

   ```ts
   // Acceptance-Eval — pre-execution acceptance-criteria measurability judgment (upstream twin)
   export {
     deriveAcceptanceAuthority,
     acceptanceVerdictSchema,
     findingSchema,
     AcceptanceEvaluator,
     ACCEPTANCE_EVAL_SYSTEM_PROMPT,
     buildUserPrompt as buildAcceptanceUserPrompt,
   } from './acceptance-eval/index.js';
   export type {
     Measurability,
     Finding,
     AcceptanceEvalInput,
     AcceptanceVerdict,
     LlmAcceptanceVerdict,
     AcceptanceEvaluatorOptions,
   } from './acceptance-eval/index.js';
   ```

   Note: `buildUserPrompt` is aliased to `buildAcceptanceUserPrompt` to avoid a
   name collision with `outcome-eval`'s already-exported `buildUserPrompt`.
   `Confidence`/`JudgedAgainst`/`Authority` are already exported by the
   outcome-eval block — do NOT re-export them (duplicate-export error).

4. Run the exports test again — observe pass.
5. Run the full module suite: `pnpm --filter @harness-engineering/intelligence test acceptance-eval`
6. Verify reuse (Observable Truth 5): `grep -rn "function resolveSection" packages/intelligence/src`
   returns exactly one hit (`outcome-eval/section-resolver.ts`).
7. Run: `harness validate` and `harness check-deps` (confirm no NEW circular dep
   from the acceptance-eval → outcome-eval import).
8. Commit: `feat(acceptance-eval): export evaluator surface from intelligence`

## Sequencing notes

- Task 1 (types) gates everything. Tasks 2 and 3 are parallelizable (authority
  vs schema, no shared file). Task 4 extends Task 3's file (sequential). Tasks
  5→6 are sequential (same evaluator file). Task 7 (barrel) after 6. Task 8
  (root wiring + integration guard) last.
- `section-resolver` reuse appears only as an import in Task 5; no new resolver
  file is created (Observable Truth 5).

## Concerns / risks

- **C1 — No persistence vs MCP `path?` (Phase 2).** D-P1-3 omits a GraphStore.
  The spec's MCP tool lists `path?` "for graph persistence, matching
  outcome-eval". Phase 2 must either drop `path?` or add an acceptance-outcome
  persistence seam (new node type — out of Phase 1 scope). Flag for Phase 2.
- **C2 — No-section blocking policy (D-P1-4).** Whether an unstructured/non-spec
  file should block is a judgment call resolved here as "advisory". Covered by
  `[checkpoint:decision]` on Task 5; reversing it changes one branch + one test.
- **C3 — `buildUserPrompt` name collision.** Root `src/index.ts` already exports
  `buildUserPrompt` from outcome-eval; the acceptance-eval one is aliased to
  `buildAcceptanceUserPrompt` at the root barrel (Task 8). Watch for downstream
  imports expecting an unaliased name.
- **C4 — Pre-existing repo noise.** `harness validate` emits dashboard
  design-token warnings and `harness check-deps` reports circular deps in
  `packages/cli/src/drift` and `.../shared/craft` — all pre-existing and outside
  `packages/intelligence`. Do not attempt to fix in this phase; only ensure no
  NEW issues are introduced.
- **C5 — Pre-commit hook churn.** The repo's pre-commit runs prettier/format and
  plugin-artifact regen; if it reformats a created file, re-add and re-commit
  (no source change needed).

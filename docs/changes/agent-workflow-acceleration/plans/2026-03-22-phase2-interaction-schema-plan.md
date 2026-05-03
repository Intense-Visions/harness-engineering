# Plan: Phase 2 -- emit_interaction Schema & Interaction Redesign

**Date:** 2026-03-22
**Spec:** docs/changes/agent-workflow-acceleration/proposal.md
**Estimated tasks:** 7
**Estimated time:** 35 minutes

## Goal

Redesign `emit_interaction` with Zod-validated schemas that enforce structured decision analysis (pros/cons, recommendation, confidence), add batch decision mode, add quality gates to transitions, and render all interactions as readable markdown.

## Observable Truths (Acceptance Criteria)

1. When `emit_interaction` is called with `type: 'question'` and options missing `pros` or `cons` fields, the system shall return an error with `isError: true` and a message identifying which fields are absent.
2. When `emit_interaction` is called with `type: 'question'` and a valid `InteractionQuestion` payload, the system shall return markdown containing a comparison table with pros/cons per option, a recommendation line with confidence level, and risk/effort rows where provided.
3. When `emit_interaction` is called with `type: 'question'` and no options (free-form question), the system shall return the question text without a table.
4. When `emit_interaction` is called with `type: 'confirmation'` and a valid `InteractionConfirmation` payload including optional `impact` and `risk`, the system shall render markdown showing the confirmation text, context, impact, and risk level.
5. When `emit_interaction` is called with `type: 'transition'` and a `qualityGate` object, the system shall render markdown showing each check name with a pass/fail indicator and an overall gate status.
6. When `emit_interaction` is called with `type: 'batch'`, the system shall render all decisions in a numbered list with recommendations, and the response JSON shall include `batchMode: true`.
7. If `emit_interaction` `type: 'batch'` is called with any decision having `risk` other than `'low'`, the system shall reject the call with an error explaining that batch mode is restricted to low-risk decisions.
8. Zod schema validation rejects invalid inputs with specific error messages for every required field across all four interaction types.
9. The response shape `{ content: [{ type: 'text', text: JSON.stringify({id, prompt, ...}) }] }` is preserved for all types (existing integration contract).
10. `npx vitest run packages/mcp-server/tests/tools/interaction.test.ts` passes with 20+ tests covering valid inputs, invalid inputs, rendering output, and edge cases.
11. `harness validate` passes.

## File Map

```
CREATE packages/mcp-server/src/tools/interaction-schemas.ts    -- Zod schemas for all interaction types
CREATE packages/mcp-server/src/tools/interaction-renderer.ts   -- markdown rendering functions
MODIFY packages/mcp-server/src/tools/interaction.ts            -- rewire to use Zod schemas + renderer
MODIFY packages/mcp-server/tests/tools/interaction.test.ts     -- rewrite tests for new schema
MODIFY packages/mcp-server/src/server.ts                       -- update type enum to include 'batch'
```

## Tasks

### Task 1: Define Zod schemas for all interaction types

**Depends on:** none
**Files:** `packages/mcp-server/src/tools/interaction-schemas.ts`

1. Create `packages/mcp-server/src/tools/interaction-schemas.ts` with the following content:

```typescript
import { z } from 'zod';

export const RiskLevel = z.enum(['low', 'medium', 'high']);
export const EffortLevel = z.enum(['low', 'medium', 'high']);
export const ConfidenceLevel = z.enum(['low', 'medium', 'high']);

export const InteractionOptionSchema = z.object({
  label: z.string().min(1),
  pros: z.array(z.string().min(1)).min(1),
  cons: z.array(z.string().min(1)).min(1),
  risk: RiskLevel.optional(),
  effort: EffortLevel.optional(),
});

export const InteractionQuestionSchema = z.object({
  text: z.string().min(1),
  options: z.array(InteractionOptionSchema).min(2).optional(),
  recommendation: z
    .object({
      optionIndex: z.number().int().min(0),
      reason: z.string().min(1),
      confidence: ConfidenceLevel,
    })
    .optional(),
  default: z.number().int().min(0).optional(),
});

// Enforce: if options are provided, recommendation is required
export const InteractionQuestionWithOptionsSchema = InteractionQuestionSchema.refine(
  (data) => {
    if (data.options && data.options.length > 0) {
      return data.recommendation !== undefined;
    }
    return true;
  },
  { message: 'recommendation is required when options are provided' }
).refine(
  (data) => {
    if (data.recommendation && data.options) {
      return data.recommendation.optionIndex < data.options.length;
    }
    return true;
  },
  { message: 'recommendation.optionIndex must reference a valid option' }
);

export const InteractionConfirmationSchema = z.object({
  text: z.string().min(1),
  context: z.string().min(1),
  impact: z.string().optional(),
  risk: RiskLevel.optional(),
});

export const QualityGateCheckSchema = z.object({
  name: z.string().min(1),
  passed: z.boolean(),
  detail: z.string().optional(),
});

export const QualityGateSchema = z.object({
  checks: z.array(QualityGateCheckSchema).min(1),
  allPassed: z.boolean(),
});

export const InteractionTransitionSchema = z.object({
  completedPhase: z.string().min(1),
  suggestedNext: z.string().min(1),
  reason: z.string().min(1),
  artifacts: z.array(z.string()),
  requiresConfirmation: z.boolean(),
  summary: z.string().min(1),
  qualityGate: QualityGateSchema.optional(),
});

export const BatchDecisionSchema = z.object({
  label: z.string().min(1),
  recommendation: z.string().min(1),
  risk: z.literal('low'),
});

export const InteractionBatchSchema = z.object({
  text: z.string().min(1),
  decisions: z.array(BatchDecisionSchema).min(1),
});

export const InteractionTypeSchema = z.enum(['question', 'confirmation', 'transition', 'batch']);

export const EmitInteractionInputSchema = z.object({
  path: z.string().min(1),
  type: InteractionTypeSchema,
  stream: z.string().optional(),
  question: InteractionQuestionSchema.optional(),
  confirmation: InteractionConfirmationSchema.optional(),
  transition: InteractionTransitionSchema.optional(),
  batch: InteractionBatchSchema.optional(),
});

// Exported types
export type InteractionOption = z.infer<typeof InteractionOptionSchema>;
export type InteractionQuestion = z.infer<typeof InteractionQuestionSchema>;
export type InteractionConfirmation = z.infer<typeof InteractionConfirmationSchema>;
export type InteractionTransition = z.infer<typeof InteractionTransitionSchema>;
export type InteractionBatch = z.infer<typeof InteractionBatchSchema>;
export type QualityGate = z.infer<typeof QualityGateSchema>;
export type EmitInteractionInput = z.infer<typeof EmitInteractionInputSchema>;
```

2. Run: `cd packages/mcp-server && npx tsc --noEmit src/tools/interaction-schemas.ts`
3. Observe: no type errors.
4. Run: `harness validate`
5. Commit: `feat(interaction): add Zod schemas for redesigned emit_interaction types`

---

### Task 2: Create markdown renderer for structured interactions

**Depends on:** Task 1
**Files:** `packages/mcp-server/src/tools/interaction-renderer.ts`

1. Create `packages/mcp-server/src/tools/interaction-renderer.ts`:

```typescript
import type {
  InteractionQuestion,
  InteractionConfirmation,
  InteractionTransition,
  InteractionBatch,
  InteractionOption,
} from './interaction-schemas.js';

function columnLabel(index: number): string {
  return String.fromCharCode(65 + index);
}

export function renderQuestion(question: InteractionQuestion): string {
  const { text, options, recommendation } = question;

  // Free-form question (no options)
  if (!options || options.length === 0) {
    let prompt = text;
    if (question.default !== undefined) {
      prompt += `\n\nDefault: option ${question.default}`;
    }
    return prompt;
  }

  // Build comparison table
  const headers = options.map(
    (opt: InteractionOption, i: number) => `${columnLabel(i)}) ${opt.label}`
  );
  const headerRow = `| | ${headers.join(' | ')} |`;
  const separatorRow = `|---|${options.map(() => '---').join('|')}|`;

  const prosRow = `| **Pros** | ${options.map((opt: InteractionOption) => opt.pros.join('; ')).join(' | ')} |`;
  const consRow = `| **Cons** | ${options.map((opt: InteractionOption) => opt.cons.join('; ')).join(' | ')} |`;

  const rows = [headerRow, separatorRow, prosRow, consRow];

  // Optional risk row
  if (options.some((opt: InteractionOption) => opt.risk)) {
    const riskRow = `| **Risk** | ${options.map((opt: InteractionOption) => (opt.risk ? capitalize(opt.risk) : '-')).join(' | ')} |`;
    rows.push(riskRow);
  }

  // Optional effort row
  if (options.some((opt: InteractionOption) => opt.effort)) {
    const effortRow = `| **Effort** | ${options.map((opt: InteractionOption) => (opt.effort ? capitalize(opt.effort) : '-')).join(' | ')} |`;
    rows.push(effortRow);
  }

  let prompt = `### Decision needed: ${text}\n\n${rows.join('\n')}`;

  // Recommendation
  if (recommendation) {
    const recLabel = `${columnLabel(recommendation.optionIndex)}) ${options[recommendation.optionIndex].label}`;
    prompt += `\n\n**Recommendation:** ${recLabel} (confidence: ${recommendation.confidence})`;
    prompt += `\n> ${recommendation.reason}`;
  }

  return prompt;
}

export function renderConfirmation(confirmation: InteractionConfirmation): string {
  let prompt = `${confirmation.text}\n\nContext: ${confirmation.context}`;
  if (confirmation.impact) {
    prompt += `\n\nImpact: ${confirmation.impact}`;
  }
  if (confirmation.risk) {
    prompt += `\nRisk: ${capitalize(confirmation.risk)}`;
  }
  prompt += '\n\nProceed? (yes/no)';
  return prompt;
}

export function renderTransition(transition: InteractionTransition): string {
  let prompt =
    `Phase "${transition.completedPhase}" complete. ${transition.reason}\n\n` +
    `${transition.summary}\n\n` +
    `Artifacts produced:\n${transition.artifacts.map((a: string) => `  - ${a}`).join('\n')}`;

  if (transition.qualityGate) {
    prompt += '\n\n**Quality Gate:**\n';
    for (const check of transition.qualityGate.checks) {
      const icon = check.passed ? 'PASS' : 'FAIL';
      prompt += `  - [${icon}] ${check.name}`;
      if (check.detail) {
        prompt += ` -- ${check.detail}`;
      }
      prompt += '\n';
    }
    prompt += transition.qualityGate.allPassed
      ? '  All checks passed.'
      : '  **Some checks failed.**';
  }

  prompt += '\n\n';
  prompt += transition.requiresConfirmation
    ? `Suggested next: "${transition.suggestedNext}". Proceed?`
    : `Proceeding to ${transition.suggestedNext}...`;

  return prompt;
}

export function renderBatch(batch: InteractionBatch): string {
  let prompt = `${batch.text}\n\n`;
  batch.decisions.forEach((d, i) => {
    prompt += `${i + 1}. **${d.label}** -- Recommendation: ${d.recommendation} (risk: low)\n`;
  });
  prompt += '\nApprove all? (yes/no)';
  return prompt;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
```

2. Run: `cd packages/mcp-server && npx tsc --noEmit src/tools/interaction-renderer.ts`
3. Observe: no type errors.
4. Run: `harness validate`
5. Commit: `feat(interaction): add markdown renderer for structured interaction types`

---

### Task 3: Rewire emit_interaction handler to use Zod validation and renderer

**Depends on:** Task 1, Task 2
**Files:** `packages/mcp-server/src/tools/interaction.ts`

1. Rewrite `packages/mcp-server/src/tools/interaction.ts`. The key changes:
   - Import Zod schemas from `interaction-schemas.js` and renderers from `interaction-renderer.js`
   - Replace the inline JSON `inputSchema` definition with a new one that includes `batch` type and structured sub-schemas
   - In the handler, parse input through `EmitInteractionInputSchema` first, then validate the type-specific payload through the refined schema (e.g., `InteractionQuestionWithOptionsSchema`)
   - Replace inline prompt building with calls to `renderQuestion()`, `renderConfirmation()`, `renderTransition()`, `renderBatch()`
   - Add `case 'batch'` to the switch
   - Preserve the `recordInteraction()` helper and handoff-write logic in transitions
   - Preserve the response shape `{ content: [{ type: 'text', text: JSON.stringify({id, prompt, ...}) }] }`
   - The `EmitInteractionInput` interface is replaced by the Zod-inferred type

2. Exact changes to the `emitInteractionDefinition`:
   - Add `'batch'` to the type enum: `enum: ['question', 'confirmation', 'transition', 'batch']`
   - Replace `question.properties.options` from `{ type: 'array', items: { type: 'string' } }` to an object-array schema reflecting `InteractionOption`
   - Add `question.properties.recommendation` object with `optionIndex`, `reason`, `confidence`
   - Add `confirmation.properties.impact` and `confirmation.properties.risk`
   - Add `transition.properties.qualityGate` object
   - Add `batch` property with `text` and `decisions` array

3. Exact changes to `handleEmitInteraction`:
   - At the top of the function, parse `input` with Zod: `const parseResult = EmitInteractionInputSchema.safeParse(input);` -- if `!parseResult.success`, return error with `parseResult.error.issues.map(i => i.message).join('; ')`
   - In `case 'question'`: validate with `InteractionQuestionWithOptionsSchema.safeParse(input.question)` -- if invalid, return error. Otherwise call `renderQuestion(parsedQuestion)` for the prompt.
   - In `case 'confirmation'`: validate with `InteractionConfirmationSchema.safeParse(input.confirmation)` -- call `renderConfirmation()`
   - In `case 'transition'`: validate with `InteractionTransitionSchema.safeParse(input.transition)` -- call `renderTransition()`. Preserve the handoff-write logic.
   - Add `case 'batch'`: validate with `InteractionBatchSchema.safeParse(input.batch)` -- call `renderBatch()`. Add `batchMode: true` to response JSON.

4. Run: `cd packages/mcp-server && npx tsc --noEmit`
5. Observe: no type errors.
6. Run: `harness validate`
7. Commit: `feat(interaction): rewire emit_interaction to use Zod validation and markdown rendering`

---

### Task 4: Update server.ts tool definition for batch type

**Depends on:** Task 3
**Files:** `packages/mcp-server/src/server.ts`

1. The import and handler registration in `server.ts` already references `emitInteractionDefinition` and `handleEmitInteraction` -- no import changes needed since the exports from `interaction.ts` keep the same names.
2. Verify the definition object exported from `interaction.ts` now includes `batch` in its enum. No changes to `server.ts` are needed if the definition is updated in Task 3 (it is imported by reference).
3. Run: `cd packages/mcp-server && npx tsc --noEmit`
4. Run: `npx vitest run packages/mcp-server/tests/tools/interaction.test.ts` -- expect failures (existing tests use old schema).
5. Run: `harness validate`
6. Commit: `chore(interaction): verify server.ts picks up updated definition`

Note: This task may be a no-op if server.ts needs no changes. The verification step is the deliverable.

---

### Task 5: Rewrite interaction tests -- schema validation (valid + invalid inputs)

**Depends on:** Task 3
**Files:** `packages/mcp-server/tests/tools/interaction.test.ts`

1. Rewrite `packages/mcp-server/tests/tools/interaction.test.ts`. The test file should contain these test groups:

**Schema validation tests (direct Zod schema tests):**

```typescript
import { describe, it, expect } from 'vitest';
import {
  InteractionOptionSchema,
  InteractionQuestionWithOptionsSchema,
  InteractionConfirmationSchema,
  InteractionTransitionSchema,
  InteractionBatchSchema,
  EmitInteractionInputSchema,
} from '../../src/tools/interaction-schemas';

describe('InteractionOptionSchema', () => {
  it('accepts valid option with pros, cons, risk, effort', () => {
    const result = InteractionOptionSchema.safeParse({
      label: 'Use JWT',
      pros: ['Already in codebase'],
      cons: ['No refresh tokens'],
      risk: 'low',
      effort: 'low',
    });
    expect(result.success).toBe(true);
  });

  it('rejects option with empty pros', () => {
    const result = InteractionOptionSchema.safeParse({
      label: 'Use JWT',
      pros: [],
      cons: ['No refresh tokens'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects option missing cons', () => {
    const result = InteractionOptionSchema.safeParse({
      label: 'Use JWT',
      pros: ['Fast'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid risk enum value', () => {
    const result = InteractionOptionSchema.safeParse({
      label: 'Use JWT',
      pros: ['Fast'],
      cons: ['Slow'],
      risk: 'critical',
    });
    expect(result.success).toBe(false);
  });
});

describe('InteractionQuestionWithOptionsSchema', () => {
  it('accepts question with options and recommendation', () => {
    const result = InteractionQuestionWithOptionsSchema.safeParse({
      text: 'Pick auth approach',
      options: [
        { label: 'JWT', pros: ['Simple'], cons: ['No refresh'] },
        { label: 'OAuth2', pros: ['Standard'], cons: ['Complex'] },
      ],
      recommendation: { optionIndex: 0, reason: 'Simpler', confidence: 'high' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects question with options but no recommendation', () => {
    const result = InteractionQuestionWithOptionsSchema.safeParse({
      text: 'Pick auth approach',
      options: [
        { label: 'JWT', pros: ['Simple'], cons: ['No refresh'] },
        { label: 'OAuth2', pros: ['Standard'], cons: ['Complex'] },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects recommendation with out-of-bounds optionIndex', () => {
    const result = InteractionQuestionWithOptionsSchema.safeParse({
      text: 'Pick auth approach',
      options: [
        { label: 'JWT', pros: ['Simple'], cons: ['No refresh'] },
        { label: 'OAuth2', pros: ['Standard'], cons: ['Complex'] },
      ],
      recommendation: { optionIndex: 5, reason: 'Simpler', confidence: 'high' },
    });
    expect(result.success).toBe(false);
  });

  it('accepts free-form question (no options, no recommendation)', () => {
    const result = InteractionQuestionWithOptionsSchema.safeParse({
      text: 'What is the target environment?',
    });
    expect(result.success).toBe(true);
  });
});

describe('InteractionConfirmationSchema', () => {
  it('accepts valid confirmation with impact and risk', () => {
    const result = InteractionConfirmationSchema.safeParse({
      text: 'Deploy?',
      context: 'All tests pass',
      impact: 'Production updated',
      risk: 'medium',
    });
    expect(result.success).toBe(true);
  });

  it('accepts confirmation without optional fields', () => {
    const result = InteractionConfirmationSchema.safeParse({
      text: 'Deploy?',
      context: 'All tests pass',
    });
    expect(result.success).toBe(true);
  });

  it('rejects confirmation missing context', () => {
    const result = InteractionConfirmationSchema.safeParse({
      text: 'Deploy?',
    });
    expect(result.success).toBe(false);
  });
});

describe('InteractionTransitionSchema', () => {
  it('accepts transition with qualityGate', () => {
    const result = InteractionTransitionSchema.safeParse({
      completedPhase: 'planning',
      suggestedNext: 'execution',
      reason: 'Plan approved',
      artifacts: ['plan.md'],
      requiresConfirmation: true,
      summary: '8 tasks planned',
      qualityGate: {
        checks: [
          { name: 'validate', passed: true },
          { name: 'typecheck', passed: false, detail: '3 errors' },
        ],
        allPassed: false,
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts transition without qualityGate', () => {
    const result = InteractionTransitionSchema.safeParse({
      completedPhase: 'planning',
      suggestedNext: 'execution',
      reason: 'Plan approved',
      artifacts: [],
      requiresConfirmation: true,
      summary: 'Done',
    });
    expect(result.success).toBe(true);
  });
});

describe('InteractionBatchSchema', () => {
  it('accepts batch with low-risk decisions', () => {
    const result = InteractionBatchSchema.safeParse({
      text: 'Approve these decisions:',
      decisions: [
        { label: 'Use ESM', recommendation: 'Yes', risk: 'low' },
        { label: 'Add vitest', recommendation: 'Yes', risk: 'low' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects batch with non-low risk', () => {
    const result = InteractionBatchSchema.safeParse({
      text: 'Approve these:',
      decisions: [{ label: 'Drop database', recommendation: 'No', risk: 'high' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects batch with empty decisions', () => {
    const result = InteractionBatchSchema.safeParse({
      text: 'Approve these:',
      decisions: [],
    });
    expect(result.success).toBe(false);
  });
});
```

2. Run: `npx vitest run packages/mcp-server/tests/tools/interaction.test.ts`
3. Observe: all schema validation tests pass.
4. Run: `harness validate`
5. Commit: `test(interaction): add Zod schema validation tests for all interaction types`

---

### Task 6: Rewrite interaction tests -- handler and rendering tests

**Depends on:** Task 5
**Files:** `packages/mcp-server/tests/tools/interaction.test.ts`

1. Add the following test groups to the same file (below the schema tests):

```typescript
import { emitInteractionDefinition, handleEmitInteraction } from '../../src/tools/interaction';

describe('emit_interaction tool', () => {
  it('has correct definition with batch type', () => {
    expect(emitInteractionDefinition.name).toBe('emit_interaction');
    const typeProp = emitInteractionDefinition.inputSchema.properties.type as { enum: string[] };
    expect(typeProp.enum).toContain('batch');
    expect(typeProp.enum).toContain('question');
    expect(typeProp.enum).toContain('confirmation');
    expect(typeProp.enum).toContain('transition');
  });

  describe('question type', () => {
    it('renders markdown table for structured question', async () => {
      const response = await handleEmitInteraction({
        path: '/tmp/test-interaction',
        type: 'question',
        question: {
          text: 'Authentication approach',
          options: [
            {
              label: 'JWT Middleware',
              pros: ['Already in codebase', 'Team knows it'],
              cons: ['No refresh tokens', 'Session-only'],
              risk: 'low',
              effort: 'low',
            },
            {
              label: 'OAuth2 Provider',
              pros: ['Industry standard', 'Refresh tokens built-in'],
              cons: ['New dependency', 'Learning curve'],
              risk: 'medium',
              effort: 'medium',
            },
          ],
          recommendation: {
            optionIndex: 0,
            reason: 'Sufficient for current requirements',
            confidence: 'high',
          },
        },
      });
      expect(response.isError).toBeFalsy();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.id).toBeDefined();
      expect(parsed.prompt).toContain('### Decision needed:');
      expect(parsed.prompt).toContain('JWT Middleware');
      expect(parsed.prompt).toContain('OAuth2 Provider');
      expect(parsed.prompt).toContain('**Pros**');
      expect(parsed.prompt).toContain('**Cons**');
      expect(parsed.prompt).toContain('**Risk**');
      expect(parsed.prompt).toContain('**Effort**');
      expect(parsed.prompt).toContain('**Recommendation:**');
      expect(parsed.prompt).toContain('confidence: high');
    });

    it('renders free-form question without table', async () => {
      const response = await handleEmitInteraction({
        path: '/tmp/test-interaction',
        type: 'question',
        question: { text: 'What is the target environment?' },
      });
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.prompt).toContain('What is the target environment?');
      expect(parsed.prompt).not.toContain('### Decision needed:');
    });

    it('returns error when question has options but no recommendation', async () => {
      const response = await handleEmitInteraction({
        path: '/tmp/test-interaction',
        type: 'question',
        question: {
          text: 'Pick one',
          options: [
            { label: 'A', pros: ['Good'], cons: ['Bad'] },
            { label: 'B', pros: ['Fast'], cons: ['Slow'] },
          ],
        },
      });
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('recommendation');
    });

    it('returns error when question payload is missing', async () => {
      const response = await handleEmitInteraction({
        path: '/tmp/test-interaction',
        type: 'question',
      });
      expect(response.isError).toBe(true);
    });
  });

  describe('confirmation type', () => {
    it('renders confirmation with impact and risk', async () => {
      const response = await handleEmitInteraction({
        path: '/tmp/test-interaction',
        type: 'confirmation',
        confirmation: {
          text: 'Deploy to production?',
          context: 'All staging tests pass',
          impact: 'Production environment will be updated',
          risk: 'medium',
        },
      });
      expect(response.isError).toBeFalsy();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.prompt).toContain('Deploy to production?');
      expect(parsed.prompt).toContain('All staging tests pass');
      expect(parsed.prompt).toContain('Impact:');
      expect(parsed.prompt).toContain('Risk: Medium');
      expect(parsed.prompt).toContain('Proceed? (yes/no)');
    });

    it('renders confirmation without optional fields', async () => {
      const response = await handleEmitInteraction({
        path: '/tmp/test-interaction',
        type: 'confirmation',
        confirmation: { text: 'Continue?', context: 'Step complete' },
      });
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.prompt).not.toContain('Impact:');
      expect(parsed.prompt).not.toContain('Risk:');
    });

    it('returns error when confirmation payload is missing', async () => {
      const response = await handleEmitInteraction({
        path: '/tmp/test-interaction',
        type: 'confirmation',
      });
      expect(response.isError).toBe(true);
    });
  });

  describe('transition type', () => {
    it('renders transition with qualityGate', async () => {
      const response = await handleEmitInteraction({
        path: '/tmp/test-interaction',
        type: 'transition',
        transition: {
          completedPhase: 'planning',
          suggestedNext: 'execution',
          reason: 'Plan approved',
          artifacts: ['docs/plans/plan.md'],
          requiresConfirmation: true,
          summary: '8 tasks, 30 min estimate',
          qualityGate: {
            checks: [
              { name: 'validate', passed: true },
              { name: 'typecheck', passed: false, detail: '3 type errors' },
            ],
            allPassed: false,
          },
        },
      });
      expect(response.isError).toBeFalsy();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.prompt).toContain('[PASS] validate');
      expect(parsed.prompt).toContain('[FAIL] typecheck');
      expect(parsed.prompt).toContain('3 type errors');
      expect(parsed.prompt).toContain('Some checks failed');
      expect(parsed.handoffWritten).toBe(true);
    });

    it('renders transition without qualityGate', async () => {
      const response = await handleEmitInteraction({
        path: '/tmp/test-interaction',
        type: 'transition',
        transition: {
          completedPhase: 'SCOPE',
          suggestedNext: 'DECOMPOSE',
          reason: 'All must-haves derived',
          artifacts: ['docs/plans/plan.md'],
          requiresConfirmation: true,
          summary: 'All must-haves derived from goals.',
        },
      });
      expect(response.isError).toBeFalsy();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.prompt).not.toContain('Quality Gate');
      expect(parsed.prompt).toContain('SCOPE');
    });

    it('returns autoTransition for non-confirmed transitions', async () => {
      const response = await handleEmitInteraction({
        path: '/tmp/test-interaction',
        type: 'transition',
        transition: {
          completedPhase: 'execution',
          suggestedNext: 'verification',
          reason: 'All tasks complete',
          artifacts: ['src/service.ts'],
          requiresConfirmation: false,
          summary: 'Completed 5 tasks.',
        },
      });
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.autoTransition).toBe(true);
      expect(parsed.nextAction).toContain('verification');
    });

    it('returns error when transition payload is missing', async () => {
      const response = await handleEmitInteraction({
        path: '/tmp/test-interaction',
        type: 'transition',
      });
      expect(response.isError).toBe(true);
    });
  });

  describe('batch type', () => {
    it('renders batch decisions and returns batchMode flag', async () => {
      const response = await handleEmitInteraction({
        path: '/tmp/test-interaction',
        type: 'batch',
        batch: {
          text: 'The following low-risk decisions need approval:',
          decisions: [
            { label: 'Use ESM modules', recommendation: 'Yes, standard for Node 22', risk: 'low' },
            { label: 'Add vitest', recommendation: 'Yes, already used in project', risk: 'low' },
          ],
        },
      });
      expect(response.isError).toBeFalsy();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.batchMode).toBe(true);
      expect(parsed.prompt).toContain('Use ESM modules');
      expect(parsed.prompt).toContain('Add vitest');
      expect(parsed.prompt).toContain('Approve all?');
    });

    it('returns error when batch payload is missing', async () => {
      const response = await handleEmitInteraction({
        path: '/tmp/test-interaction',
        type: 'batch',
      });
      expect(response.isError).toBe(true);
    });
  });

  it('returns error for unknown type', async () => {
    const response = await handleEmitInteraction({
      path: '/tmp/test-interaction',
      type: 'unknown' as 'question',
    });
    expect(response.isError).toBe(true);
  });
});
```

2. Run: `npx vitest run packages/mcp-server/tests/tools/interaction.test.ts`
3. Observe: all tests pass (20+ tests total between Task 5 and Task 6).
4. Run: `harness validate`
5. Commit: `test(interaction): add handler and rendering tests for redesigned emit_interaction`

---

### Task 7: Full build verification and cleanup

[checkpoint:human-verify]
**Depends on:** Task 6
**Files:** all modified files

1. Run full test suite: `npx turbo run test`
2. Observe: all packages pass (zero regressions).
3. Run: `cd packages/mcp-server && npx tsc --noEmit`
4. Observe: no type errors.
5. Run: `harness validate`
6. Observe: validation passed.
7. If any failures: fix them and re-run. Do not proceed with regressions.
8. Commit: `chore(interaction): phase 2 schema redesign complete -- full suite green`

---

## Traceability

| Observable Truth                           | Delivered By                                                        |
| ------------------------------------------ | ------------------------------------------------------------------- |
| OT1: Missing pros/cons rejected            | Task 1 (schema), Task 3 (handler), Task 5 (test)                    |
| OT2: Markdown table with pros/cons         | Task 2 (renderer), Task 3 (handler), Task 6 (test)                  |
| OT3: Free-form question no table           | Task 2 (renderer), Task 6 (test)                                    |
| OT4: Confirmation with impact/risk         | Task 2 (renderer), Task 3 (handler), Task 6 (test)                  |
| OT5: Transition with qualityGate           | Task 1 (schema), Task 2 (renderer), Task 3 (handler), Task 6 (test) |
| OT6: Batch mode renders + batchMode flag   | Task 1 (schema), Task 2 (renderer), Task 3 (handler), Task 6 (test) |
| OT7: Batch rejects non-low risk            | Task 1 (schema `z.literal('low')`), Task 5 (test)                   |
| OT8: Zod validation rejects invalid inputs | Task 1 (schema), Task 3 (handler), Task 5 (test)                    |
| OT9: Response shape preserved              | Task 3 (handler), Task 6 (test)                                     |
| OT10: 20+ tests passing                    | Task 5, Task 6                                                      |
| OT11: harness validate passes              | Task 7                                                              |

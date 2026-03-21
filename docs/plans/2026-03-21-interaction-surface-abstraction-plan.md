# Plan: Interaction Surface Abstraction

**Date:** 2026-03-21
**Spec:** docs/changes/interaction-surface-abstraction/proposal.md
**Estimated tasks:** 14
**Estimated time:** 55 minutes

## Goal

Decouple harness skills from specific interaction surfaces by introducing structured `emit_interaction` MCP tool for round-trip interactions and conventional markdown patterns for display-only output, then migrate the 5 core development loop skills.

## Observable Truths (Acceptance Criteria)

1. `packages/core/src/interaction/types.ts` exists and exports `EmitInteractionInputSchema`, `InteractionTypeSchema`, `QuestionSchema`, `ConfirmationSchema`, `TransitionSchema` as Zod schemas, plus their inferred TypeScript types.
2. When `EmitInteractionInputSchema.safeParse()` is called with a valid question input, it returns `{ success: true }`. When called with an invalid input (missing `type`, wrong enum), it returns `{ success: false }`.
3. `packages/core/src/interaction/index.ts` exists and re-exports all schemas and types from `types.ts`.
4. `packages/core/src/index.ts` exports the interaction module via `export * from './interaction'`.
5. `packages/mcp-server/src/tools/interaction.ts` exists and exports `emitInteractionDefinition` (tool definition) and `handleEmitInteraction` (handler function).
6. When `handleEmitInteraction` is called with `{ path: '/tmp/test', type: 'question', question: { text: 'Pick one', options: ['A', 'B'] } }`, it returns a response containing `{ id, prompt }` with a UUID-format `id` and a prompt string containing the question text and options.
7. When `handleEmitInteraction` is called with `{ path: '/tmp/test', type: 'confirmation', confirmation: { text: 'Deploy?', context: 'Staging passed' } }`, it returns a response containing `{ id, prompt }` with the confirmation text.
8. When `handleEmitInteraction` is called with `{ path: '/tmp/test', type: 'transition', transition: { completedPhase: 'SCOPE', suggestedNext: 'DECOMPOSE', reason: 'Scope complete', artifacts: ['docs/plans/x.md'] } }`, it returns `{ id, prompt, handoffWritten: true }`.
9. The `emit_interaction` tool is registered in `packages/mcp-server/src/server.ts` in both `TOOL_DEFINITIONS` and `TOOL_HANDLERS`.
10. `packages/cli/src/output/formatter.ts` exports a `parseConventionalMarkdown(text: string)` function that extracts `**[TYPE]** Title` patterns. When called with `**[CRITICAL]** Bad thing\n**[STRENGTH]** Good thing`, it returns an array of `{ type: 'CRITICAL', title: 'Bad thing' }` and `{ type: 'STRENGTH', title: 'Good thing' }`.
11. All 5 skill YAML files (`harness-brainstorming`, `harness-planning`, `harness-execution`, `harness-verification`, `harness-code-review`) list `emit_interaction` in their `tools` array.
12. All 5 SKILL.md files contain `emit_interaction` instructions for round-trip interactions (questions, confirmations, transitions) and use `**[TYPE]**` markdown conventions for display-only output.
13. If the SKILL.md files contain surface-specific references ("terminal", "CLI", or specific rendering targets), the migration is incomplete. Migrated SKILL.md files shall not contain surface-specific references.
14. The regex `\*\*\[(CRITICAL|IMPORTANT|SUGGESTION|STRENGTH|FIXED|Phase \d+/\d+)\]\*\*` matches all display-only patterns documented in the spec.
15. `harness validate` passes after all tasks are complete.
16. `npx vitest run packages/core/tests/interaction/types.test.ts` passes.
17. `npx vitest run packages/mcp-server/tests/tools/interaction.test.ts` passes.
18. `npx vitest run packages/cli/tests/output/formatter.test.ts` passes (including new `parseConventionalMarkdown` tests).

## File Map

```
CREATE packages/core/src/interaction/types.ts
CREATE packages/core/src/interaction/index.ts
CREATE packages/core/tests/interaction/types.test.ts
MODIFY packages/core/src/index.ts (add interaction re-export)
CREATE packages/mcp-server/src/tools/interaction.ts
CREATE packages/mcp-server/tests/tools/interaction.test.ts
MODIFY packages/mcp-server/src/server.ts (register emit_interaction tool)
MODIFY packages/cli/src/output/formatter.ts (add parseConventionalMarkdown)
MODIFY packages/cli/tests/output/formatter.test.ts (add parseConventionalMarkdown tests)
MODIFY agents/skills/claude-code/harness-brainstorming/skill.yaml (add emit_interaction to tools)
MODIFY agents/skills/claude-code/harness-brainstorming/SKILL.md (migration)
MODIFY agents/skills/claude-code/harness-planning/skill.yaml (add emit_interaction to tools)
MODIFY agents/skills/claude-code/harness-planning/SKILL.md (migration)
MODIFY agents/skills/claude-code/harness-execution/skill.yaml (add emit_interaction to tools)
MODIFY agents/skills/claude-code/harness-execution/SKILL.md (migration)
MODIFY agents/skills/claude-code/harness-verification/skill.yaml (add emit_interaction to tools)
MODIFY agents/skills/claude-code/harness-verification/SKILL.md (migration)
MODIFY agents/skills/claude-code/harness-code-review/skill.yaml (add emit_interaction to tools)
MODIFY agents/skills/claude-code/harness-code-review/SKILL.md (migration)
CREATE docs/conventions/markdown-interaction-patterns.md
```

## Tasks

### Task 1: Define interaction Zod schemas and types (TDD)

**Depends on:** none
**Files:** `packages/core/src/interaction/types.ts`, `packages/core/tests/interaction/types.test.ts`

1. Create test file `packages/core/tests/interaction/types.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import {
     InteractionTypeSchema,
     QuestionSchema,
     ConfirmationSchema,
     TransitionSchema,
     EmitInteractionInputSchema,
   } from '../../src/interaction/types';

   describe('InteractionTypeSchema', () => {
     it('accepts valid types', () => {
       expect(InteractionTypeSchema.safeParse('question').success).toBe(true);
       expect(InteractionTypeSchema.safeParse('confirmation').success).toBe(true);
       expect(InteractionTypeSchema.safeParse('transition').success).toBe(true);
     });

     it('rejects invalid types', () => {
       expect(InteractionTypeSchema.safeParse('invalid').success).toBe(false);
       expect(InteractionTypeSchema.safeParse('').success).toBe(false);
     });
   });

   describe('QuestionSchema', () => {
     it('validates a question with options', () => {
       const result = QuestionSchema.safeParse({
         text: 'Pick a framework',
         options: ['React', 'Vue', 'Svelte'],
         default: 'React',
       });
       expect(result.success).toBe(true);
     });

     it('validates a free-form question (no options)', () => {
       const result = QuestionSchema.safeParse({ text: 'What is the target?' });
       expect(result.success).toBe(true);
     });

     it('rejects missing text', () => {
       expect(QuestionSchema.safeParse({}).success).toBe(false);
     });
   });

   describe('ConfirmationSchema', () => {
     it('validates a confirmation', () => {
       const result = ConfirmationSchema.safeParse({
         text: 'Deploy to production?',
         context: 'All tests pass on staging',
       });
       expect(result.success).toBe(true);
     });

     it('rejects missing context', () => {
       expect(ConfirmationSchema.safeParse({ text: 'Deploy?' }).success).toBe(false);
     });
   });

   describe('TransitionSchema', () => {
     it('validates a transition', () => {
       const result = TransitionSchema.safeParse({
         completedPhase: 'SCOPE',
         suggestedNext: 'DECOMPOSE',
         reason: 'All must-haves derived',
         artifacts: ['docs/plans/plan.md'],
       });
       expect(result.success).toBe(true);
     });

     it('rejects missing artifacts', () => {
       const result = TransitionSchema.safeParse({
         completedPhase: 'SCOPE',
         suggestedNext: 'DECOMPOSE',
         reason: 'Done',
       });
       expect(result.success).toBe(false);
     });
   });

   describe('EmitInteractionInputSchema', () => {
     it('validates a complete question input', () => {
       const result = EmitInteractionInputSchema.safeParse({
         path: '/project',
         type: 'question',
         question: { text: 'Pick one', options: ['A', 'B'] },
       });
       expect(result.success).toBe(true);
     });

     it('validates a confirmation input with stream', () => {
       const result = EmitInteractionInputSchema.safeParse({
         path: '/project',
         type: 'confirmation',
         stream: 'feature-x',
         confirmation: { text: 'Proceed?', context: 'Tests pass' },
       });
       expect(result.success).toBe(true);
     });

     it('validates a transition input', () => {
       const result = EmitInteractionInputSchema.safeParse({
         path: '/project',
         type: 'transition',
         transition: {
           completedPhase: 'EXPLORE',
           suggestedNext: 'EVALUATE',
           reason: 'Context gathered',
           artifacts: ['notes.md'],
         },
       });
       expect(result.success).toBe(true);
     });

     it('rejects missing path', () => {
       const result = EmitInteractionInputSchema.safeParse({
         type: 'question',
         question: { text: 'Hi' },
       });
       expect(result.success).toBe(false);
     });

     it('rejects invalid type', () => {
       const result = EmitInteractionInputSchema.safeParse({
         path: '/project',
         type: 'unknown',
       });
       expect(result.success).toBe(false);
     });
   });
   ```

2. Run test: `npx vitest run packages/core/tests/interaction/types.test.ts` — observe failure (module not found).
3. Create implementation `packages/core/src/interaction/types.ts`:

   ```typescript
   // packages/core/src/interaction/types.ts
   import { z } from 'zod';

   export const InteractionTypeSchema = z.enum(['question', 'confirmation', 'transition']);

   export const QuestionSchema = z.object({
     text: z.string(),
     options: z.array(z.string()).optional(),
     default: z.string().optional(),
   });

   export const ConfirmationSchema = z.object({
     text: z.string(),
     context: z.string(),
   });

   export const TransitionSchema = z.object({
     completedPhase: z.string(),
     suggestedNext: z.string(),
     reason: z.string(),
     artifacts: z.array(z.string()),
   });

   export const EmitInteractionInputSchema = z.object({
     path: z.string(),
     type: InteractionTypeSchema,
     stream: z.string().optional(),
     question: QuestionSchema.optional(),
     confirmation: ConfirmationSchema.optional(),
     transition: TransitionSchema.optional(),
   });

   export type InteractionType = z.infer<typeof InteractionTypeSchema>;
   export type Question = z.infer<typeof QuestionSchema>;
   export type Confirmation = z.infer<typeof ConfirmationSchema>;
   export type Transition = z.infer<typeof TransitionSchema>;
   export type EmitInteractionInput = z.infer<typeof EmitInteractionInputSchema>;
   ```

4. Run test: `npx vitest run packages/core/tests/interaction/types.test.ts` — observe all pass.
5. Run: `harness validate`
6. Commit: `feat(core): add interaction surface Zod schemas and types`

---

### Task 2: Create interaction module index and re-export from core

**Depends on:** Task 1
**Files:** `packages/core/src/interaction/index.ts`, `packages/core/src/index.ts`

1. Create `packages/core/src/interaction/index.ts`:
   ```typescript
   // packages/core/src/interaction/index.ts
   export {
     InteractionTypeSchema,
     QuestionSchema,
     ConfirmationSchema,
     TransitionSchema,
     EmitInteractionInputSchema,
   } from './types';
   export type {
     InteractionType,
     Question,
     Confirmation,
     Transition,
     EmitInteractionInput,
   } from './types';
   ```
2. Add to `packages/core/src/index.ts` — insert before the `// Package version` comment:
   ```typescript
   // Interaction module
   export * from './interaction';
   ```
3. Run: `npx vitest run packages/core/tests/interaction/types.test.ts` — confirm still passes.
4. Run: `harness validate`
5. Run: `harness check-deps`
6. Commit: `feat(core): re-export interaction module from core index`

---

### Task 3: Implement emit_interaction MCP tool handler (TDD)

**Depends on:** Task 2
**Files:** `packages/mcp-server/src/tools/interaction.ts`, `packages/mcp-server/tests/tools/interaction.test.ts`

1. Create test file `packages/mcp-server/tests/tools/interaction.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { emitInteractionDefinition, handleEmitInteraction } from '../../src/tools/interaction';

   describe('emit_interaction tool', () => {
     it('has correct definition', () => {
       expect(emitInteractionDefinition.name).toBe('emit_interaction');
       expect(emitInteractionDefinition.inputSchema.required).toContain('path');
       expect(emitInteractionDefinition.inputSchema.required).toContain('type');
     });

     it('has type enum with question, confirmation, transition', () => {
       const typeProp = emitInteractionDefinition.inputSchema.properties.type as {
         enum: string[];
       };
       expect(typeProp.enum).toContain('question');
       expect(typeProp.enum).toContain('confirmation');
       expect(typeProp.enum).toContain('transition');
     });

     describe('question type', () => {
       it('returns id and prompt for a multiple-choice question', async () => {
         const response = await handleEmitInteraction({
           path: '/tmp/test-interaction',
           type: 'question',
           question: { text: 'Pick a framework', options: ['React', 'Vue'] },
         });
         expect(response.isError).toBeFalsy();
         const parsed = JSON.parse(response.content[0].text);
         expect(parsed.id).toMatch(
           /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
         );
         expect(parsed.prompt).toContain('Pick a framework');
         expect(parsed.prompt).toContain('React');
         expect(parsed.prompt).toContain('Vue');
       });

       it('returns prompt for a free-form question', async () => {
         const response = await handleEmitInteraction({
           path: '/tmp/test-interaction',
           type: 'question',
           question: { text: 'What is the target environment?' },
         });
         const parsed = JSON.parse(response.content[0].text);
         expect(parsed.prompt).toContain('What is the target environment?');
       });

       it('returns error when question payload is missing', async () => {
         const response = await handleEmitInteraction({
           path: '/tmp/test-interaction',
           type: 'question',
         });
         expect(response.isError).toBe(true);
         expect(response.content[0].text).toContain('question');
       });
     });

     describe('confirmation type', () => {
       it('returns id and prompt for a confirmation', async () => {
         const response = await handleEmitInteraction({
           path: '/tmp/test-interaction',
           type: 'confirmation',
           confirmation: {
             text: 'Deploy to production?',
             context: 'All staging tests pass',
           },
         });
         expect(response.isError).toBeFalsy();
         const parsed = JSON.parse(response.content[0].text);
         expect(parsed.id).toBeDefined();
         expect(parsed.prompt).toContain('Deploy to production?');
         expect(parsed.prompt).toContain('All staging tests pass');
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
       it('returns id, prompt, and handoffWritten for a transition', async () => {
         const response = await handleEmitInteraction({
           path: '/tmp/test-interaction',
           type: 'transition',
           transition: {
             completedPhase: 'SCOPE',
             suggestedNext: 'DECOMPOSE',
             reason: 'All must-haves derived',
             artifacts: ['docs/plans/plan.md'],
           },
         });
         expect(response.isError).toBeFalsy();
         const parsed = JSON.parse(response.content[0].text);
         expect(parsed.id).toBeDefined();
         expect(parsed.prompt).toContain('SCOPE');
         expect(parsed.prompt).toContain('DECOMPOSE');
         expect(parsed.handoffWritten).toBe(true);
       });

       it('returns error when transition payload is missing', async () => {
         const response = await handleEmitInteraction({
           path: '/tmp/test-interaction',
           type: 'transition',
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

2. Run test: `npx vitest run packages/mcp-server/tests/tools/interaction.test.ts` — observe failure.
3. Create implementation `packages/mcp-server/src/tools/interaction.ts`:

   ```typescript
   import { randomUUID } from 'crypto';
   import { sanitizePath } from '../utils/sanitize-path.js';

   export const emitInteractionDefinition = {
     name: 'emit_interaction',
     description:
       'Emit a structured interaction (question, confirmation, or phase transition) for round-trip communication with the user',
     inputSchema: {
       type: 'object' as const,
       properties: {
         path: { type: 'string', description: 'Path to project root' },
         type: {
           type: 'string',
           enum: ['question', 'confirmation', 'transition'],
           description: 'Type of interaction',
         },
         stream: {
           type: 'string',
           description: 'State stream for recording (auto-resolves from branch if omitted)',
         },
         question: {
           type: 'object',
           description: 'Question payload (required when type is question)',
           properties: {
             text: { type: 'string', description: 'The question text' },
             options: {
               type: 'array',
               items: { type: 'string' },
               description: 'Multiple choice options (omit for free-form)',
             },
             default: { type: 'string', description: 'Default answer' },
           },
           required: ['text'],
         },
         confirmation: {
           type: 'object',
           description: 'Confirmation payload (required when type is confirmation)',
           properties: {
             text: { type: 'string', description: 'What to confirm' },
             context: { type: 'string', description: 'Why confirmation is needed' },
           },
           required: ['text', 'context'],
         },
         transition: {
           type: 'object',
           description: 'Transition payload (required when type is transition)',
           properties: {
             completedPhase: { type: 'string', description: 'Phase that was completed' },
             suggestedNext: { type: 'string', description: 'Suggested next phase' },
             reason: { type: 'string', description: 'Why the transition is happening' },
             artifacts: {
               type: 'array',
               items: { type: 'string' },
               description: 'File paths produced during the completed phase',
             },
           },
           required: ['completedPhase', 'suggestedNext', 'reason', 'artifacts'],
         },
       },
       required: ['path', 'type'],
     },
   };

   interface EmitInteractionInput {
     path: string;
     type: 'question' | 'confirmation' | 'transition';
     stream?: string;
     question?: { text: string; options?: string[]; default?: string };
     confirmation?: { text: string; context: string };
     transition?: {
       completedPhase: string;
       suggestedNext: string;
       reason: string;
       artifacts: string[];
     };
   }

   export async function handleEmitInteraction(input: EmitInteractionInput) {
     try {
       const projectPath = sanitizePath(input.path);
       const id = randomUUID();

       switch (input.type) {
         case 'question': {
           if (!input.question) {
             return {
               content: [
                 {
                   type: 'text' as const,
                   text: 'Error: question payload is required when type is question',
                 },
               ],
               isError: true,
             };
           }
           const { text, options, default: defaultAnswer } = input.question;
           let prompt = text;
           if (options && options.length > 0) {
             prompt +=
               '\n\nOptions:\n' +
               options.map((o, i) => `  ${String.fromCharCode(65 + i)}) ${o}`).join('\n');
           }
           if (defaultAnswer) {
             prompt += `\n\nDefault: ${defaultAnswer}`;
           }

           // Record in state decisions array
           await recordInteraction(projectPath, id, 'question', text, input.stream);

           return {
             content: [{ type: 'text' as const, text: JSON.stringify({ id, prompt }) }],
           };
         }

         case 'confirmation': {
           if (!input.confirmation) {
             return {
               content: [
                 {
                   type: 'text' as const,
                   text: 'Error: confirmation payload is required when type is confirmation',
                 },
               ],
               isError: true,
             };
           }
           const { text, context } = input.confirmation;
           const prompt = `${text}\n\nContext: ${context}\n\nProceed? (yes/no)`;

           await recordInteraction(projectPath, id, 'confirmation', text, input.stream);

           return {
             content: [{ type: 'text' as const, text: JSON.stringify({ id, prompt }) }],
           };
         }

         case 'transition': {
           if (!input.transition) {
             return {
               content: [
                 {
                   type: 'text' as const,
                   text: 'Error: transition payload is required when type is transition',
                 },
               ],
               isError: true,
             };
           }
           const { completedPhase, suggestedNext, reason, artifacts } = input.transition;
           const prompt =
             `Phase "${completedPhase}" complete. ${reason}\n\n` +
             `Artifacts produced:\n${artifacts.map((a) => `  - ${a}`).join('\n')}\n\n` +
             `Suggested next: "${suggestedNext}". Proceed?`;

           // Write handoff
           try {
             const { saveHandoff } = await import('@harness-engineering/core');
             await saveHandoff(
               projectPath,
               {
                 timestamp: new Date().toISOString(),
                 fromSkill: 'emit_interaction',
                 phase: completedPhase,
                 summary: reason,
                 completed: [completedPhase],
                 pending: [suggestedNext],
                 concerns: [],
                 decisions: [],
                 blockers: [],
                 contextKeywords: [],
               },
               input.stream
             );
           } catch {
             // Handoff write failure is non-fatal
           }

           await recordInteraction(
             projectPath,
             id,
             'transition',
             `${completedPhase} -> ${suggestedNext}`,
             input.stream
           );

           return {
             content: [
               {
                 type: 'text' as const,
                 text: JSON.stringify({ id, prompt, handoffWritten: true }),
               },
             ],
           };
         }

         default: {
           return {
             content: [
               { type: 'text' as const, text: `Error: unknown interaction type: ${input.type}` },
             ],
             isError: true,
           };
         }
       }
     } catch (error) {
       return {
         content: [
           {
             type: 'text' as const,
             text: `Error: ${error instanceof Error ? error.message : String(error)}`,
           },
         ],
         isError: true,
       };
     }
   }

   async function recordInteraction(
     projectPath: string,
     id: string,
     type: string,
     decision: string,
     stream?: string
   ): Promise<void> {
     try {
       const { loadState, saveState } = await import('@harness-engineering/core');
       const stateResult = await loadState(projectPath, stream);
       if (stateResult.ok) {
         const state = stateResult.value;
         state.decisions.push({
           date: new Date().toISOString(),
           decision: `[${type}:${id}] ${decision}`,
           context: 'pending user response',
         });
         await saveState(projectPath, state, stream);
       }
     } catch {
       // State recording failure is non-fatal
     }
   }
   ```

4. Run test: `npx vitest run packages/mcp-server/tests/tools/interaction.test.ts` — observe all pass.
5. Run: `harness validate`
6. Commit: `feat(mcp): implement emit_interaction tool handler`

---

### Task 4: Register emit_interaction in MCP server

**Depends on:** Task 3
**Files:** `packages/mcp-server/src/server.ts`

1. Add import to `packages/mcp-server/src/server.ts` after the existing security import:
   ```typescript
   import { emitInteractionDefinition, handleEmitInteraction } from './tools/interaction.js';
   ```
2. Add `emitInteractionDefinition` to the `TOOL_DEFINITIONS` array (after `listStreamsDefinition`).
3. Add `emit_interaction: handleEmitInteraction as ToolHandler` to the `TOOL_HANDLERS` object (after the `list_streams` entry).
4. Run: `npx vitest run packages/mcp-server/tests/tools/interaction.test.ts` — confirm still passes.
5. Run: `npx vitest run packages/mcp-server/tests/server.test.ts` — confirm server tests still pass.
6. Run: `harness validate`
7. Commit: `feat(mcp): register emit_interaction tool in server`

---

### Task 5: Add parseConventionalMarkdown utility (TDD)

**Depends on:** none (parallel with Tasks 1-4)
**Files:** `packages/cli/src/output/formatter.ts`, `packages/cli/tests/output/formatter.test.ts`

1. Add tests to `packages/cli/tests/output/formatter.test.ts`:

   ```typescript
   describe('parseConventionalMarkdown', () => {
     it('extracts CRITICAL finding', () => {
       const result = parseConventionalMarkdown('**[CRITICAL]** Missing auth check');
       expect(result).toEqual([{ type: 'CRITICAL', title: 'Missing auth check' }]);
     });

     it('extracts multiple findings', () => {
       const input = [
         '**[CRITICAL]** Bad thing',
         '**[STRENGTH]** Good thing',
         '**[SUGGESTION]** Maybe this',
       ].join('\n');
       const result = parseConventionalMarkdown(input);
       expect(result).toHaveLength(3);
       expect(result[0]).toEqual({ type: 'CRITICAL', title: 'Bad thing' });
       expect(result[1]).toEqual({ type: 'STRENGTH', title: 'Good thing' });
       expect(result[2]).toEqual({ type: 'SUGGESTION', title: 'Maybe this' });
     });

     it('extracts Phase progress markers', () => {
       const result = parseConventionalMarkdown('**[Phase 3/7]** Context scoping');
       expect(result).toEqual([{ type: 'Phase 3/7', title: 'Context scoping' }]);
     });

     it('extracts FIXED markers', () => {
       const result = parseConventionalMarkdown('**[FIXED]** Added missing link');
       expect(result).toEqual([{ type: 'FIXED', title: 'Added missing link' }]);
     });

     it('extracts IMPORTANT markers', () => {
       const result = parseConventionalMarkdown('**[IMPORTANT]** Check error handling');
       expect(result).toEqual([{ type: 'IMPORTANT', title: 'Check error handling' }]);
     });

     it('returns empty array for no matches', () => {
       const result = parseConventionalMarkdown('Just some regular text');
       expect(result).toEqual([]);
     });

     it('ignores non-matching bold text', () => {
       const result = parseConventionalMarkdown('**bold** not a marker');
       expect(result).toEqual([]);
     });
   });
   ```

   Note: add `import { parseConventionalMarkdown } from '../../src/output/formatter';` to the imports at the top of the test file.

2. Run test: `npx vitest run packages/cli/tests/output/formatter.test.ts` — observe failure (function not exported).
3. Add to `packages/cli/src/output/formatter.ts` at the end of the file:

   ```typescript
   export interface ConventionalMarkdownEntry {
     type: string;
     title: string;
   }

   /**
    * Parse conventional markdown patterns (**[TYPE]** Title) from text.
    * Extracts structured data from display-only output using the harness
    * interaction surface conventions.
    */
   export function parseConventionalMarkdown(text: string): ConventionalMarkdownEntry[] {
     const pattern =
       /\*\*\[(CRITICAL|IMPORTANT|SUGGESTION|STRENGTH|FIXED|Phase \d+\/\d+)\]\*\*\s+(.+)/g;
     const entries: ConventionalMarkdownEntry[] = [];
     let match: RegExpExecArray | null;
     while ((match = pattern.exec(text)) !== null) {
       entries.push({ type: match[1], title: match[2].trim() });
     }
     return entries;
   }
   ```

4. Run test: `npx vitest run packages/cli/tests/output/formatter.test.ts` — observe all pass.
5. Run: `harness validate`
6. Commit: `feat(cli): add parseConventionalMarkdown utility for interaction surface patterns`

---

### Task 6: Document markdown interaction conventions

**Depends on:** none (parallel)
**Files:** `docs/conventions/markdown-interaction-patterns.md`

1. Create `docs/conventions/markdown-interaction-patterns.md`:

   ```markdown
   # Markdown Interaction Patterns

   **Date:** 2026-03-21
   **Spec:** docs/changes/interaction-surface-abstraction/proposal.md

   ## Purpose

   Display-only output from harness skills uses conventional markdown patterns.
   These patterns are human-readable in any terminal or markdown viewer, and
   parseable by regex for post-processors and future surface adapters.

   ## Patterns

   ### Finding
   ```

   **[CRITICAL]** Title of the finding

   > Detailed explanation of what's wrong and why it matters
   > Suggestion: how to fix it

   ```

   Severities: `CRITICAL`, `IMPORTANT`, `SUGGESTION`

   ### Progress

   ```

   **[Phase 3/7]** Context scoping — loading graph and computing impact

   ```

   ### Strength (reviews)

   ```

   **[STRENGTH]** Clean separation of parsing and validation logic

   ```

   ### Auto-fix log

   ```

   **[FIXED]** Added missing traceability link: goal "fast startup" → criterion #4

   ```

   ## Parsing Regex

   All patterns can be extracted with:

   ```

   \*\*\[(CRITICAL|IMPORTANT|SUGGESTION|STRENGTH|FIXED|Phase \d+/\d+)\]\*\*

   ```

   ## Round-Trip Interactions

   For interactions requiring a user response (questions, confirmations,
   phase transitions), use the `emit_interaction` MCP tool instead of
   markdown conventions. See the spec for details.

   ## Guidelines for Skill Authors

   1. Use `**[TYPE]**` patterns for all display-only structured output.
   2. Use `emit_interaction` for all round-trip interactions.
   3. Never reference a specific surface ("terminal", "CLI", "GitHub") in
      skill instructions. The abstraction handles surface differences.
   4. Markdown conventions degrade gracefully — they look good in any
      markdown-capable viewer without special rendering.
   ```

2. Run: `harness validate`
3. Commit: `docs: add markdown interaction pattern conventions`

---

### Task 7: Migrate harness-brainstorming skill

[checkpoint:human-verify] — Review type definitions and tool before migrating skills

**Depends on:** Tasks 1-4, Task 6
**Files:** `agents/skills/claude-code/harness-brainstorming/skill.yaml`, `agents/skills/claude-code/harness-brainstorming/SKILL.md`

1. Edit `agents/skills/claude-code/harness-brainstorming/skill.yaml` — add `emit_interaction` to the `tools` list after `Grep`:
   ```yaml
   tools:
     - Bash
     - Read
     - Write
     - Edit
     - Glob
     - Grep
     - emit_interaction
   ```
2. Edit `agents/skills/claude-code/harness-brainstorming/SKILL.md` — apply these changes:

   **Phase 2 (EVALUATE):** After step 1 ("Ask ONE question at a time"), add interaction instruction:

   ````markdown
   When asking a clarifying question, use `emit_interaction` with `type: 'question'`:

   ```json
   emit_interaction({
     path: "<project-root>",
     type: "question",
     question: {
       text: "For auth, should we use:",
       options: ["A) existing JWT middleware", "B) OAuth2 via provider X", "C) external service"]
     }
   })
   ```
   ````

   This records the question in state and returns a formatted prompt to present.

   ````

   **Phase 4 (VALIDATE):** Replace step 5 ("Ask for final sign-off") with:
   ```markdown
   5. **Request sign-off via `emit_interaction`:**
      ```json
      emit_interaction({
        path: "<project-root>",
        type: "confirmation",
        confirmation: {
          text: "Approve spec at <file-path>?",
          context: "<one-paragraph summary of the design>"
        }
      })
   ````

   The human must explicitly approve before this skill is complete.

   ````

   **After Phase 4 (sign-off received):** Add transition instruction:
   ```markdown
   6. **Emit phase transition:**
      ```json
      emit_interaction({
        path: "<project-root>",
        type: "transition",
        transition: {
          completedPhase: "brainstorming",
          suggestedNext: "planning",
          reason: "Spec approved by human, ready for implementation planning",
          artifacts: ["<spec-file-path>"]
        }
      })
   ````

   ````

   **Phase 3 (PRIORITIZE):** Add display-only convention for approach tradeoffs:
   ```markdown
   When presenting approach tradeoffs, use conventional markdown patterns:
   ````

   **[IMPORTANT]** Approach 1 trades simplicity for extensibility
   **[SUGGESTION]** Consider Approach 2 if real-time requirements emerge later

   ```

   ```

   **Remove** any references to "terminal" or "CLI" if present (scan and replace).

3. Run: `harness validate`
4. Commit: `feat(skills): migrate harness-brainstorming to interaction surface abstraction`

---

### Task 8: Migrate harness-planning skill

**Depends on:** Tasks 1-4, Task 6
**Files:** `agents/skills/claude-code/harness-planning/skill.yaml`, `agents/skills/claude-code/harness-planning/SKILL.md`

1. Edit `agents/skills/claude-code/harness-planning/skill.yaml` — add `emit_interaction` to the `tools` list after `Glob`:
   ```yaml
   tools:
     - Bash
     - Read
     - Write
     - Edit
     - Glob
     - emit_interaction
   ```
2. Edit `agents/skills/claude-code/harness-planning/SKILL.md` — apply these changes:

   **Phase 1 (SCOPE):** Add instruction for scope clarification questions:

   ````markdown
   When scope is ambiguous and requires clarification, use `emit_interaction`:

   ```json
   emit_interaction({
     path: "<project-root>",
     type: "question",
     question: {
       text: "The spec mentions X but does not define behavior for Y. Should we:",
       options: ["A) Include Y in this plan", "B) Defer Y to a follow-up plan", "C) Update the spec first"]
     }
   })
   ```
   ````

   ````

   **Phase 4 (VALIDATE):** Replace step 9 ("Present the plan to the human for review") with:
   ```markdown
   9. **Request plan sign-off:**
      ```json
      emit_interaction({
        path: "<project-root>",
        type: "confirmation",
        confirmation: {
          text: "Approve plan at <plan-file-path>?",
          context: "<task count> tasks, <estimated time> minutes. <one-sentence summary>"
        }
      })
   ````

   10. **Emit phase transition after approval:**
       ```json
       emit_interaction({
         path: "<project-root>",
         type: "transition",
         transition: {
           completedPhase: "planning",
           suggestedNext: "execution",
           reason: "Plan approved, ready for task-by-task implementation",
           artifacts: ["<plan-file-path>"]
         }
       })
       ```

   ````

   **Display-only patterns:** Add to Phase 2 (DECOMPOSE):
   ```markdown
   When presenting the task breakdown, use progress markers:
   ````

   **[Phase 2/4]** DECOMPOSE — mapping file structure and creating tasks

   ```

   ```

3. Run: `harness validate`
4. Commit: `feat(skills): migrate harness-planning to interaction surface abstraction`

---

### Task 9: Migrate harness-execution skill

**Depends on:** Tasks 1-4, Task 6
**Files:** `agents/skills/claude-code/harness-execution/skill.yaml`, `agents/skills/claude-code/harness-execution/SKILL.md`

1. Edit `agents/skills/claude-code/harness-execution/skill.yaml` — add `emit_interaction` to the `tools` list after `Grep`:
   ```yaml
   tools:
     - Bash
     - Read
     - Write
     - Edit
     - Glob
     - Grep
     - emit_interaction
   ```
2. Edit `agents/skills/claude-code/harness-execution/SKILL.md` — apply these changes:

   **Checkpoint Protocol:** Replace the three checkpoint descriptions to use `emit_interaction`:

   For `[checkpoint:human-verify]`:

   ````markdown
   **`[checkpoint:human-verify]` — Show and Confirm**

   1. Stop execution.
   2. Use `emit_interaction` to present the checkpoint:
      ```json
      emit_interaction({
        path: "<project-root>",
        type: "confirmation",
        confirmation: {
          text: "Task N complete. Output: <summary>. Continue to Task N+1?",
          context: "<test output or file diff summary>"
        }
      })
      ```
   ````

   3. Wait for the human to confirm before proceeding.

   ````

   For `[checkpoint:decision]`:
   ```markdown
   **`[checkpoint:decision]` — Present Options and Wait**

   1. Stop execution.
   2. Use `emit_interaction` to present the decision:
      ```json
      emit_interaction({
        path: "<project-root>",
        type: "question",
        question: {
          text: "Task N requires a decision: <description>",
          options: ["<option A>", "<option B>"]
        }
      })
   ````

   3. Wait for the human to choose.

   ````

   **Phase completion:** Add transition at the end of Phase 3 (VERIFY):
   ```markdown
   After all tasks pass verification:
   ```json
   emit_interaction({
     path: "<project-root>",
     type: "transition",
     transition: {
       completedPhase: "execution",
       suggestedNext: "verification",
       reason: "All plan tasks executed and verified",
       artifacts: ["<list of created/modified files>"]
     }
   })
   ````

   ````

   **Display-only patterns:** Add to Phase 2 (EXECUTE):
   ```markdown
   When reporting task progress, use progress markers:
   ````

   **[Phase N/M]** Task N — <task description>

   ```

   ```

3. Run: `harness validate`
4. Commit: `feat(skills): migrate harness-execution to interaction surface abstraction`

---

### Task 10: Migrate harness-verification skill

**Depends on:** Tasks 1-4, Task 6
**Files:** `agents/skills/claude-code/harness-verification/skill.yaml`, `agents/skills/claude-code/harness-verification/SKILL.md`

1. Edit `agents/skills/claude-code/harness-verification/skill.yaml` — add `emit_interaction` to the `tools` list after `Glob`:
   ```yaml
   tools:
     - Bash
     - Read
     - Glob
     - emit_interaction
   ```
2. Edit `agents/skills/claude-code/harness-verification/SKILL.md` — apply these changes:

   **After Gap Identification section:** Add confirmation for verification acceptance:

   ````markdown
   ### Verification Sign-Off

   After producing the verification report, request acceptance:

   ```json
   emit_interaction({
     path: "<project-root>",
     type: "confirmation",
     confirmation: {
       text: "Verification report: <VERDICT>. Accept and proceed?",
       context: "<summary: N artifacts checked, N gaps found>"
     }
   })
   ```
   ````

   ````

   **After verification acceptance:** Add transition:
   ```markdown
   After verification is accepted:
   ```json
   emit_interaction({
     path: "<project-root>",
     type: "transition",
     transition: {
       completedPhase: "verification",
       suggestedNext: "review",
       reason: "All artifacts verified at 3 levels, no gaps remaining",
       artifacts: ["<verified file paths>"]
     }
   })
   ````

   ````

   **Display-only patterns:** The existing `[EXISTS: PASS]`, `[SUBSTANTIVE: PASS]`, `[WIRED: PASS]` patterns in the verification report are already conventional markdown. Add a note:
   ```markdown
   The verification report uses conventional markdown patterns for structured output:
   ````

   **[CRITICAL]** path/to/file.ts:22 — TODO: implement validation (anti-pattern)
   **[IMPORTANT]** path/to/file.ts — exported but not imported by any other file

   ```

   ```

3. Run: `harness validate`
4. Commit: `feat(skills): migrate harness-verification to interaction surface abstraction`

---

### Task 11: Migrate harness-code-review skill

**Depends on:** Tasks 1-4, Task 6
**Files:** `agents/skills/claude-code/harness-code-review/skill.yaml`, `agents/skills/claude-code/harness-code-review/SKILL.md`

1. Edit `agents/skills/claude-code/harness-code-review/skill.yaml` — add `emit_interaction` to the `tools` list after `Grep`:
   ```yaml
   tools:
     - Bash
     - Read
     - Glob
     - Grep
     - emit_interaction
   ```
2. Edit `agents/skills/claude-code/harness-code-review/SKILL.md` — apply these changes:

   **Phase 7 (OUTPUT):** Add display-only conventions for findings:

   ```markdown
   When rendering the review in terminal output, use conventional markdown patterns:

   For strengths:
   ```

   **[STRENGTH]** Clean separation between route handler and service logic

   ```

   For issues by severity:
   ```

   **[CRITICAL]** api/routes/users.ts:12-15 — Direct import from db/queries.ts bypasses service layer
   **[IMPORTANT]** services/user-service.ts:45 — createUser does not handle duplicate email
   **[SUGGESTION]** Consider extracting validation into a shared utility

   ```

   ```

   **After Phase 7:** Add review acceptance confirmation:

   ````markdown
   ### Review Acceptance

   After delivering the review output, request acceptance:

   ```json
   emit_interaction({
     path: "<project-root>",
     type: "confirmation",
     confirmation: {
       text: "Review complete: <Assessment>. Accept review?",
       context: "<N critical, N important, N suggestion findings>"
     }
   })
   ```
   ````

   ````

   **After review acceptance:** Add transition:
   ```markdown
   After review is accepted:
   ```json
   emit_interaction({
     path: "<project-root>",
     type: "transition",
     transition: {
       completedPhase: "review",
       suggestedNext: "merge",
       reason: "Review accepted with assessment: <Approve|Request Changes|Comment>",
       artifacts: ["<reviewed PR or files>"]
     }
   })
   ````

   ```

   ```

3. Run: `harness validate`
4. Commit: `feat(skills): migrate harness-code-review to interaction surface abstraction`

---

### Task 12: Verify no surface-specific references remain in migrated skills

**Depends on:** Tasks 7-11
**Files:** none (verification only)

1. Search all 5 migrated SKILL.md files for surface-specific terms:
   ```bash
   grep -i -n 'terminal\|CLI output\|console\.log\|terminal rendering' \
     agents/skills/claude-code/harness-brainstorming/SKILL.md \
     agents/skills/claude-code/harness-planning/SKILL.md \
     agents/skills/claude-code/harness-execution/SKILL.md \
     agents/skills/claude-code/harness-verification/SKILL.md \
     agents/skills/claude-code/harness-code-review/SKILL.md
   ```
   If any matches are found, replace them with surface-agnostic language. The word "terminal" appearing in the code-review skill's Phase 7 heading "Terminal Output (default)" should be replaced with "Default Output" or "Text Output."
2. Verify all 5 `skill.yaml` files list `emit_interaction` in their tools array:
   ```bash
   grep 'emit_interaction' \
     agents/skills/claude-code/harness-brainstorming/skill.yaml \
     agents/skills/claude-code/harness-planning/skill.yaml \
     agents/skills/claude-code/harness-execution/skill.yaml \
     agents/skills/claude-code/harness-verification/skill.yaml \
     agents/skills/claude-code/harness-code-review/skill.yaml
   ```
   Expect 5 matches.
3. Run: `harness validate`
4. Commit: `refactor(skills): remove surface-specific references from migrated skills`

---

### Task 13: Run full test suite and integration check

[checkpoint:human-verify] — Review all changes before final validation

**Depends on:** Tasks 1-12
**Files:** none (verification only)

1. Run core interaction tests: `npx vitest run packages/core/tests/interaction/types.test.ts`
2. Run MCP interaction tests: `npx vitest run packages/mcp-server/tests/tools/interaction.test.ts`
3. Run CLI formatter tests: `npx vitest run packages/cli/tests/output/formatter.test.ts`
4. Run MCP server tests: `npx vitest run packages/mcp-server/tests/server.test.ts`
5. Run: `harness validate`
6. Run: `harness check-deps`
7. Verify the `emit_interaction` tool appears in server tool definitions by checking that `packages/mcp-server/src/server.ts` imports include `emitInteractionDefinition` and `handleEmitInteraction`.
8. No commit (verification only).

---

### Task 14: Write handoff context

**Depends on:** Task 13
**Files:** `.harness/handoff.json`

1. Write `.harness/handoff.json`:
   ```json
   {
     "fromSkill": "harness-planning",
     "phase": "VALIDATE",
     "summary": "Planned interaction surface abstraction: core Zod types, emit_interaction MCP tool, parseConventionalMarkdown CLI utility, and migration of 5 core skills to use structured interactions and markdown conventions",
     "completed": [],
     "pending": [
       "Task 1: Define interaction Zod schemas and types",
       "Task 2: Create interaction module index and re-export from core",
       "Task 3: Implement emit_interaction MCP tool handler",
       "Task 4: Register emit_interaction in MCP server",
       "Task 5: Add parseConventionalMarkdown utility",
       "Task 6: Document markdown interaction conventions",
       "Task 7: Migrate harness-brainstorming skill",
       "Task 8: Migrate harness-planning skill",
       "Task 9: Migrate harness-execution skill",
       "Task 10: Migrate harness-verification skill",
       "Task 11: Migrate harness-code-review skill",
       "Task 12: Verify no surface-specific references",
       "Task 13: Run full test suite and integration check",
       "Task 14: Write handoff context"
     ],
     "concerns": [
       "Skill migration tasks (7-11) modify SKILL.md files that are LLM instructions — exact wording matters for LLM compliance",
       "The code-review skill has 'Terminal Output' heading in Phase 7 that needs surface-agnostic rename",
       "State recording in emit_interaction is best-effort (non-fatal) — integration test coverage for state writes is limited"
     ],
     "decisions": [
       "Used randomUUID for interaction IDs to enable future async resolve_interaction extension",
       "State recording is non-fatal to avoid breaking the interaction flow if state file is locked or missing",
       "Handoff write in transition type is non-fatal for the same reason",
       "parseConventionalMarkdown lives in CLI formatter since it is a CLI post-processing utility",
       "The review skill is harness-code-review (not harness-review) based on actual directory name"
     ],
     "contextKeywords": [
       "interaction-surface",
       "emit-interaction",
       "markdown-conventions",
       "phase-transition",
       "zod-schemas",
       "mcp-tool",
       "skill-migration",
       "display-only-output"
     ]
   }
   ```
2. Commit: `chore: write handoff context for interaction surface abstraction`

## Parallel Opportunities

- **Tasks 1-4** (core types + MCP tool) and **Task 5** (parseConventionalMarkdown) are independent and can run in parallel.
- **Task 6** (documentation) is independent and can run in parallel with everything.
- **Tasks 7-11** (skill migrations) can all run in parallel with each other once Tasks 1-4 and 6 are complete.

## Traceability

| Observable Truth                                 | Delivering Task(s)         |
| ------------------------------------------------ | -------------------------- |
| 1. Core types exist                              | Task 1                     |
| 2. Schema validation works                       | Task 1                     |
| 3. Interaction index exists                      | Task 2                     |
| 4. Core re-exports interaction                   | Task 2                     |
| 5. MCP tool definition + handler exist           | Task 3                     |
| 6. Question type returns id + prompt             | Task 3                     |
| 7. Confirmation type returns id + prompt         | Task 3                     |
| 8. Transition type returns handoffWritten        | Task 3                     |
| 9. Tool registered in server                     | Task 4                     |
| 10. parseConventionalMarkdown works              | Task 5                     |
| 11. All 5 skill.yaml files list emit_interaction | Tasks 7-11, verified in 12 |
| 12. All 5 SKILL.md files use emit_interaction    | Tasks 7-11, verified in 12 |
| 13. No surface-specific references               | Task 12                    |
| 14. Regex matches all patterns                   | Task 5                     |
| 15. harness validate passes                      | Task 13                    |
| 16-18. All test suites pass                      | Task 13                    |

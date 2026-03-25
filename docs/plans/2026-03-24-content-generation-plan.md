# Plan: Content Generation for Blueprint

**Date:** 2026-03-24
**Spec:** docs/changes/harness-blueprint/proposal.md
**Estimated tasks:** 4
**Estimated time:** 15 minutes

## Goal

Build the LLM pipeline for "Code-to-English" and "Quiz" generation and integrate it into the `BlueprintGenerator`.

## Observable Truths (Acceptance Criteria)

1. `ContentPipeline.generateModuleContent` returns a structured object with `codeTranslation` and `quiz` (with valid JSON).
2. `BlueprintGenerator` calls `contentPipeline.generateModuleContent` for each module in the blueprint data.
3. Integration verified by test demonstrating full generation cycle.

## File Map

- MODIFY packages/core/src/blueprint/content-pipeline.ts
- MODIFY packages/core/src/blueprint/generator.ts
- CREATE packages/core/src/blueprint/content-pipeline.test.ts

## Tasks

### Task 1: Create ContentPipeline Test (TDD)

**Depends on:** none
**Files:** packages/core/src/blueprint/content-pipeline.test.ts

1. Create `packages/core/src/blueprint/content-pipeline.test.ts`:

   ```typescript
   import { ContentPipeline } from './content-pipeline';
   import { BlueprintModule } from './types';
   import { describe, it, expect, vi } from 'vitest';

   describe('ContentPipeline', () => {
     it('generates content for a module', async () => {
       const pipeline = new ContentPipeline();
       const module: BlueprintModule = {
         id: 'm1',
         files: ['src/index.ts'],
         content: null as any,
       };
       const content = await pipeline.generateModuleContent(module);
       expect(content).toHaveProperty('codeTranslation');
       expect(content).toHaveProperty('quiz');
       expect(Array.isArray(content.quiz.questions)).toBe(true);
     });
   });
   ```

2. Run test: `npx vitest run packages/core/src/blueprint/content-pipeline.test.ts`
3. Observe: passes (since existing implementation is functional but needs robust parsing).
4. Run: `harness validate`
5. Commit: `feat(blueprint): add test for ContentPipeline`

### Task 2: Robust LLM Interaction in ContentPipeline

**Depends on:** Task 1
**Files:** packages/core/src/blueprint/content-pipeline.ts

1. Update `packages/core/src/blueprint/content-pipeline.ts` to use better prompting for structured JSON quizzes:

   ````typescript
   import { BlueprintModule } from './types';
   import { llmService } from '../shared/llm';

   export interface Content {
     codeTranslation: string;
     quiz: Quiz;
   }

   export interface Quiz {
     questions: {
       question: string;
       answer: string;
     }[];
   }

   export class ContentPipeline {
     async generateModuleContent(module: BlueprintModule): Promise<Content> {
       const codeContext = module.files.join('\n');
       const translation = await llmService.generate(
         `You are a technical educator. Explain the following code clearly and concisely: ${codeContext}`
       );
       const quizJson = await llmService.generate(
         `Create 3 technical quiz questions for this code. Return ONLY valid JSON in this format: { "questions": [{ "question": "...", "answer": "..." }] }. Code: ${codeContext}`
       );

       let quiz: Quiz;
       try {
         // Clean potential markdown code blocks
         const cleanJson = quizJson
           .replace(/```json/g, '')
           .replace(/```/g, '')
           .trim();
         quiz = JSON.parse(cleanJson);
       } catch (e) {
         console.error('Failed to parse quiz JSON', e);
         quiz = { questions: [{ question: 'Failed to generate quiz', answer: 'N/A' }] };
       }

       return {
         codeTranslation: translation,
         quiz: quiz,
       };
     }
   }
   ````

2. Run test: `npx vitest run packages/core/src/blueprint/content-pipeline.test.ts`
3. Run: `harness validate`
4. Commit: `feat(blueprint): improve LLM prompting for quizzes`

### Task 3: Integrate Pipeline into Generator

**Depends on:** Task 2
**Files:** packages/core/src/blueprint/generator.ts

1. Ensure `BlueprintGenerator` correctly awaits the async content generation.
2. Review `packages/core/src/blueprint/generator.ts`:

   ```typescript
   // ... existing imports ...
   export class BlueprintGenerator {
     private contentPipeline = new ContentPipeline();

     async generate(data: BlueprintData, options: BlueprintOptions): Promise<void> {
       // Parallelize content generation for speed
       await Promise.all(
         data.modules.map(async (module) => {
           module.content = await this.contentPipeline.generateModuleContent(module);
         })
       );

       const html = ejs.render(SHELL_TEMPLATE, {
         ...data,
         styles: STYLES,
         scripts: SCRIPTS,
       });

       await fs.mkdir(options.outputDir, { recursive: true });
       await fs.writeFile(path.join(options.outputDir, 'index.html'), html);
     }
   }
   ```

3. Commit: `feat(blueprint): parallelize module content generation`

### Task 4: Final Verification

[checkpoint:human-verify]

1. Verify generator works with integrated pipeline.
2. Run `harness validate`
3. Commit: `chore(blueprint): finalize content pipeline integration`

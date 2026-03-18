# Plan: Code Reviewer Persona with Schema v2 Conditional Steps

**Date:** 2026-03-18
**Spec:** docs/specs/2026-03-18-code-reviewer-persona-design.md
**Estimated tasks:** 10
**Estimated time:** 40 minutes

## Goal

The persona schema supports v2 conditional steps with skill invocation, and a code-reviewer persona performs full AI-powered code review without depending on superpowers.

## Observable Truths (Acceptance Criteria)

1. When a v2 persona YAML with `steps` array is parsed, the system shall return a valid `Persona` object with typed `CommandStep` and `SkillStep` entries.
2. When a v1 persona YAML with `commands` array is parsed, the system shall normalize it to v2 format with each command as `{ command, when: "always" }`.
3. When `runPersona` receives trigger context `"on_commit"`, the system shall execute only steps matching `when: "always"` or `when: "on_commit"`.
4. When `runPersona` receives a `SkillStep`, the system shall invoke `executeSkill` and include the result in `PersonaRunReport`.
5. When `executeSkill` runs with `outputMode: "artifact"`, the system shall write a review file to `.harness/reviews/`.
6. When `generateRuntime` receives a v2 persona, the system shall output `steps` array in the JSON config.
7. When `generateAgentsMd` receives a v2 persona, the system shall list commands and skills extracted from steps.
8. When `generateCIWorkflow` receives a v2 persona, the system shall produce workflow steps only for the trigger context matching the CI event.
9. The file `agents/personas/code-reviewer.yaml` shall load as a valid v2 persona referencing `harness-code-review` skill.
10. All 305 existing tests shall continue to pass without modification.

## File Map

```
MODIFY packages/cli/src/persona/schema.ts
MODIFY packages/cli/src/persona/loader.ts
MODIFY packages/cli/src/persona/runner.ts
CREATE packages/cli/src/persona/skill-executor.ts
MODIFY packages/cli/src/persona/generators/runtime.ts
MODIFY packages/cli/src/persona/generators/agents-md.ts
MODIFY packages/cli/src/persona/generators/ci-workflow.ts
MODIFY packages/cli/src/commands/agent/run.ts
MODIFY packages/cli/src/index.ts
MODIFY packages/mcp-server/src/tools/persona.ts
MODIFY packages/cli/tests/persona/schema.test.ts
MODIFY packages/cli/tests/persona/loader.test.ts
MODIFY packages/cli/tests/persona/runner.test.ts
CREATE packages/cli/tests/persona/skill-executor.test.ts
MODIFY packages/cli/tests/persona/generators/runtime.test.ts
MODIFY packages/cli/tests/persona/generators/agents-md.test.ts
MODIFY packages/cli/tests/persona/generators/ci-workflow.test.ts
CREATE packages/cli/tests/persona/fixtures/v2-persona.yaml
CREATE packages/cli/tests/persona/fixtures/v2-persona-mixed.yaml
CREATE agents/personas/code-reviewer.yaml
```

## Tasks

### Task 1: Update persona schema to support v2 with steps

**Depends on:** none
**Files:** packages/cli/src/persona/schema.ts, packages/cli/tests/persona/schema.test.ts

1. Update test file `packages/cli/tests/persona/schema.test.ts` — add v2 tests:

   ```typescript
   // Add after existing tests
   describe('PersonaSchema v2', () => {
     const v2Persona = {
       version: 2 as const,
       name: 'Code Reviewer',
       description: 'Full-lifecycle code review',
       role: 'Perform AI-powered code review',
       skills: ['harness-code-review'],
       steps: [
         { command: 'validate', when: 'always' },
         { command: 'check-deps', when: 'always' },
         { skill: 'harness-code-review', when: 'on_pr', output: 'auto' },
       ],
       triggers: [{ event: 'on_pr' as const }],
     };

     it('validates a v2 persona with steps', () => {
       const result = PersonaSchema.safeParse(v2Persona);
       expect(result.success).toBe(true);
     });

     it('applies step defaults', () => {
       const result = PersonaSchema.parse({
         ...v2Persona,
         steps: [{ command: 'validate' }, { skill: 'harness-code-review' }],
       });
       expect(result.steps[0]).toEqual({ command: 'validate', when: 'always' });
       expect(result.steps[1]).toEqual({
         skill: 'harness-code-review',
         when: 'always',
         output: 'auto',
       });
     });

     it('rejects steps with invalid when value', () => {
       const result = PersonaSchema.safeParse({
         ...v2Persona,
         steps: [{ command: 'validate', when: 'on_deploy' }],
       });
       expect(result.success).toBe(false);
     });

     it('rejects v2 persona with commands instead of steps', () => {
       const result = PersonaSchema.safeParse({
         ...v2Persona,
         commands: ['validate'],
         steps: undefined,
       });
       expect(result.success).toBe(false);
     });

     it('v1 persona still validates', () => {
       const v1 = {
         version: 1 as const,
         name: 'Architecture Enforcer',
         description: 'Validates constraints',
         role: 'Enforce boundaries',
         skills: ['enforce-architecture'],
         commands: ['check-deps', 'validate'],
         triggers: [{ event: 'on_pr' as const }],
       };
       const result = PersonaSchema.safeParse(v1);
       expect(result.success).toBe(true);
     });
   });
   ```

2. Run test: `pnpm --filter @harness-engineering/cli test -- tests/persona/schema.test.ts`
3. Observe failure: v2 tests fail because schema only accepts `version: 1`

4. Update `packages/cli/src/persona/schema.ts`:

   ```typescript
   import { z } from 'zod';

   export const TriggerContextSchema = z
     .enum(['always', 'on_pr', 'on_commit', 'on_review', 'scheduled', 'manual'])
     .default('always');

   export type TriggerContext = z.infer<typeof TriggerContextSchema>;

   export const CommandStepSchema = z.object({
     command: z.string(),
     when: TriggerContextSchema,
   });

   export const SkillStepSchema = z.object({
     skill: z.string(),
     when: TriggerContextSchema,
     output: z.enum(['inline', 'artifact', 'auto']).default('auto'),
   });

   export const StepSchema = z.union([CommandStepSchema, SkillStepSchema]);

   export type CommandStep = z.infer<typeof CommandStepSchema>;
   export type SkillStep = z.infer<typeof SkillStepSchema>;
   export type Step = z.infer<typeof StepSchema>;

   export const PersonaTriggerSchema = z.discriminatedUnion('event', [
     z.object({
       event: z.literal('on_pr'),
       conditions: z.object({ paths: z.array(z.string()).optional() }).optional(),
     }),
     z.object({
       event: z.literal('on_commit'),
       conditions: z.object({ branches: z.array(z.string()).optional() }).optional(),
     }),
     z.object({
       event: z.literal('scheduled'),
       cron: z.string(),
     }),
   ]);

   export const PersonaConfigSchema = z.object({
     severity: z.enum(['error', 'warning']).default('error'),
     autoFix: z.boolean().default(false),
     timeout: z.number().default(300000),
   });

   export const PersonaOutputsSchema = z.object({
     'agents-md': z.boolean().default(true),
     'ci-workflow': z.boolean().default(true),
     'runtime-config': z.boolean().default(true),
   });

   // V1 schema (backward compat)
   const PersonaSchemaV1 = z.object({
     version: z.literal(1),
     name: z.string(),
     description: z.string(),
     role: z.string(),
     skills: z.array(z.string()),
     commands: z.array(z.string()),
     triggers: z.array(PersonaTriggerSchema),
     config: PersonaConfigSchema.default({}),
     outputs: PersonaOutputsSchema.default({}),
   });

   // V2 schema (with steps)
   const PersonaSchemaV2 = z.object({
     version: z.literal(2),
     name: z.string(),
     description: z.string(),
     role: z.string(),
     skills: z.array(z.string()),
     steps: z.array(StepSchema),
     triggers: z.array(PersonaTriggerSchema),
     config: PersonaConfigSchema.default({}),
     outputs: PersonaOutputsSchema.default({}),
   });

   export const PersonaSchema = z.union([PersonaSchemaV1, PersonaSchemaV2]);

   // Normalized type always has steps (v1 gets normalized in loader)
   export interface Persona {
     version: 1 | 2;
     name: string;
     description: string;
     role: string;
     skills: string[];
     steps: Step[];
     commands?: string[]; // only present on raw v1, removed after normalization
     triggers: z.infer<typeof PersonaTriggerSchema>[];
     config: z.infer<typeof PersonaConfigSchema>;
     outputs: z.infer<typeof PersonaOutputsSchema>;
   }

   export type PersonaTrigger = z.infer<typeof PersonaTriggerSchema>;
   export type PersonaConfig = z.infer<typeof PersonaConfigSchema>;
   ```

5. Run test: `pnpm --filter @harness-engineering/cli test -- tests/persona/schema.test.ts`
6. Observe: all schema tests pass (both v1 and v2)
7. Run: `pnpm --filter @harness-engineering/cli test` to verify no regressions
8. Commit: `feat(persona): add v2 schema with conditional steps and skill steps`

---

### Task 2: Update loader with v1→v2 normalization

**Depends on:** Task 1
**Files:** packages/cli/src/persona/loader.ts, packages/cli/tests/persona/loader.test.ts, packages/cli/tests/persona/fixtures/v2-persona.yaml, packages/cli/tests/persona/fixtures/v2-persona-mixed.yaml

1. Create test fixture `packages/cli/tests/persona/fixtures/v2-persona.yaml`:

   ```yaml
   version: 2
   name: Test Reviewer
   description: Test v2 persona
   role: Test review role
   skills:
     - harness-code-review
   steps:
     - command: validate
       when: always
     - skill: harness-code-review
       when: on_pr
       output: auto
   triggers:
     - event: on_pr
   config:
     severity: error
   ```

2. Create test fixture `packages/cli/tests/persona/fixtures/v2-persona-mixed.yaml`:

   ```yaml
   version: 2
   name: Test Mixed
   description: Test v2 with mixed steps
   role: Test mixed role
   skills:
     - harness-code-review
   steps:
     - command: validate
       when: always
     - command: check-deps
       when: on_commit
     - skill: harness-code-review
       when: on_pr
       output: artifact
   triggers:
     - event: on_pr
     - event: on_commit
       conditions:
         branches:
           - main
   ```

3. Update test file `packages/cli/tests/persona/loader.test.ts` — add normalization tests:

   ```typescript
   // Add after existing tests
   describe('v1 normalization', () => {
     it('normalizes v1 commands to steps', () => {
       const result = loadPersona(path.join(FIXTURES, 'valid-persona.yaml'));
       expect(result.ok).toBe(true);
       if (!result.ok) return;
       expect(result.value.steps).toBeDefined();
       expect(result.value.steps).toEqual([{ command: 'validate', when: 'always' }]);
     });
   });

   describe('v2 loading', () => {
     it('loads a v2 persona with steps', () => {
       const result = loadPersona(path.join(FIXTURES, 'v2-persona.yaml'));
       expect(result.ok).toBe(true);
       if (!result.ok) return;
       expect(result.value.name).toBe('Test Reviewer');
       expect(result.value.steps).toHaveLength(2);
       expect(result.value.steps[0]).toEqual({ command: 'validate', when: 'always' });
       expect(result.value.steps[1]).toEqual({
         skill: 'harness-code-review',
         when: 'on_pr',
         output: 'auto',
       });
     });

     it('loads a v2 persona with mixed command and skill steps', () => {
       const result = loadPersona(path.join(FIXTURES, 'v2-persona-mixed.yaml'));
       expect(result.ok).toBe(true);
       if (!result.ok) return;
       expect(result.value.steps).toHaveLength(3);
     });

     it('lists both v1 and v2 personas', () => {
       const result = listPersonas(FIXTURES);
       expect(result.ok).toBe(true);
       if (!result.ok) return;
       const names = result.value.map((p) => p.name);
       expect(names).toContain('Test Enforcer');
       expect(names).toContain('Test Reviewer');
     });
   });
   ```

4. Run tests: observe failures

5. Update `packages/cli/src/persona/loader.ts`:

   ```typescript
   import * as fs from 'fs';
   import * as path from 'path';
   import YAML from 'yaml';
   import type { Result } from '@harness-engineering/core';
   import { Ok, Err } from '@harness-engineering/core';
   import { PersonaSchema, type Persona } from './schema';

   export interface PersonaMetadata {
     name: string;
     description: string;
     filePath: string;
   }

   /**
    * Normalize a parsed persona to always have `steps`.
    * V1 personas with `commands` get each command converted to a step with `when: "always"`.
    */
   function normalizePersona(raw: Record<string, unknown>): Persona {
     const parsed = raw as Persona & { commands?: string[] };
     if (parsed.version === 1 && parsed.commands) {
       return {
         ...parsed,
         steps: parsed.commands.map((cmd) => ({ command: cmd, when: 'always' as const })),
       };
     }
     return parsed as Persona;
   }

   export function loadPersona(filePath: string): Result<Persona, Error> {
     try {
       if (!fs.existsSync(filePath)) {
         return Err(new Error(`Persona file not found: ${filePath}`));
       }
       const raw = fs.readFileSync(filePath, 'utf-8');
       const parsed = YAML.parse(raw);
       const result = PersonaSchema.safeParse(parsed);
       if (!result.success) {
         return Err(new Error(`Invalid persona ${filePath}: ${result.error.message}`));
       }
       return Ok(normalizePersona(result.data as Record<string, unknown>));
     } catch (error) {
       return Err(
         new Error(
           `Failed to load persona: ${error instanceof Error ? error.message : String(error)}`
         )
       );
     }
   }

   export function listPersonas(dir: string): Result<PersonaMetadata[], Error> {
     try {
       if (!fs.existsSync(dir)) return Ok([]);
       const entries = fs.readdirSync(dir).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
       const personas: PersonaMetadata[] = [];
       for (const entry of entries) {
         const filePath = path.join(dir, entry);
         const result = loadPersona(filePath);
         if (result.ok) {
           personas.push({
             name: result.value.name,
             description: result.value.description,
             filePath,
           });
         }
       }
       return Ok(personas);
     } catch (error) {
       return Err(
         new Error(
           `Failed to list personas: ${error instanceof Error ? error.message : String(error)}`
         )
       );
     }
   }
   ```

6. Run tests: `pnpm --filter @harness-engineering/cli test -- tests/persona/loader.test.ts`
7. Observe: all loader tests pass
8. Run: `pnpm --filter @harness-engineering/cli test` to verify no regressions
9. Commit: `feat(persona): add v1→v2 normalization in loader`

---

### Task 3: Create SkillExecutor module

**Depends on:** Task 1
**Files:** packages/cli/src/persona/skill-executor.ts, packages/cli/tests/persona/skill-executor.test.ts

1. Create test file `packages/cli/tests/persona/skill-executor.test.ts`:

   ```typescript
   import { describe, it, expect, vi, beforeEach } from 'vitest';
   import * as fs from 'fs';
   import * as path from 'path';
   import { executeSkill, type SkillExecutionContext } from '../../src/persona/skill-executor';

   // Mock fs for artifact writing tests
   vi.mock('fs', async () => {
     const actual = await vi.importActual<typeof fs>('fs');
     return { ...actual, mkdirSync: vi.fn(), writeFileSync: vi.fn() };
   });

   const baseContext: SkillExecutionContext = {
     trigger: 'on_pr',
     projectPath: '/tmp/test-project',
     outputMode: 'inline',
   };

   describe('executeSkill', () => {
     it('returns a result with skill output', async () => {
       const result = await executeSkill('harness-code-review', baseContext);
       expect(result.status).toBe('pass');
       expect(result.output).toBeTruthy();
       expect(result.durationMs).toBeGreaterThanOrEqual(0);
     });

     it('returns error for unknown skill', async () => {
       const result = await executeSkill('nonexistent-skill', baseContext);
       expect(result.status).toBe('fail');
       expect(result.output).toContain('not found');
     });

     it('writes artifact when outputMode is artifact', async () => {
       const ctx: SkillExecutionContext = {
         ...baseContext,
         outputMode: 'artifact',
         headSha: 'abc1234',
       };
       const result = await executeSkill('harness-code-review', ctx);
       expect(result.status).toBe('pass');
       expect(result.artifactPath).toMatch(/\.harness\/reviews\//);
     });

     it('resolves auto to inline when trigger is manual', async () => {
       const ctx: SkillExecutionContext = {
         ...baseContext,
         trigger: 'manual',
         outputMode: 'auto',
       };
       const result = await executeSkill('harness-code-review', ctx);
       expect(result.artifactPath).toBeUndefined();
     });

     it('resolves auto to artifact when trigger is on_pr', async () => {
       const ctx: SkillExecutionContext = {
         ...baseContext,
         trigger: 'on_pr',
         outputMode: 'auto',
         headSha: 'abc1234',
       };
       const result = await executeSkill('harness-code-review', ctx);
       expect(result.artifactPath).toBeDefined();
     });
   });
   ```

2. Run tests: observe failure — module doesn't exist

3. Create `packages/cli/src/persona/skill-executor.ts`:

   ```typescript
   import * as fs from 'fs';
   import * as path from 'path';
   import { parse } from 'yaml';
   import { SkillMetadataSchema } from '../skill/schema';
   import { resolveSkillsDir } from '../utils/paths';
   import type { TriggerContext } from './schema';

   export interface SkillExecutionContext {
     trigger: TriggerContext;
     projectPath: string;
     outputMode: 'inline' | 'artifact' | 'auto';
     baseSha?: string;
     headSha?: string;
   }

   export interface SkillExecutionResult {
     status: 'pass' | 'fail';
     output: string;
     artifactPath?: string;
     durationMs: number;
   }

   function resolveOutputMode(
     mode: 'inline' | 'artifact' | 'auto',
     trigger: TriggerContext
   ): 'inline' | 'artifact' {
     if (mode !== 'auto') return mode;
     // CI triggers produce artifacts; manual/conversational produce inline
     return trigger === 'manual' ? 'inline' : 'artifact';
   }

   function buildArtifactPath(projectPath: string, headSha?: string): string {
     const date = new Date().toISOString().slice(0, 10);
     const sha = headSha?.slice(0, 7) ?? 'unknown';
     return path.join(projectPath, '.harness', 'reviews', `${date}-${sha}.md`);
   }

   function buildArtifactContent(
     skillName: string,
     trigger: TriggerContext,
     headSha?: string
   ): string {
     const date = new Date().toISOString().slice(0, 10);
     return [
       '---',
       `persona: code-reviewer`,
       `trigger: ${trigger}`,
       `sha: ${headSha?.slice(0, 7) ?? 'unknown'}`,
       `date: ${date}`,
       `assessment: pending`,
       '---',
       '',
       `# Review by ${skillName}`,
       '',
       '## Strengths',
       '',
       '- (review pending)',
       '',
       '## Issues',
       '',
       '### Critical',
       '',
       '- None identified',
       '',
       '### Important',
       '',
       '- None identified',
       '',
       '### Suggestions',
       '',
       '- None identified',
       '',
       '## Assessment',
       '',
       'Pending — skill execution scaffolded.',
       '',
       '## Harness Checks',
       '',
       '- (run harness validate, check-deps, check-docs to populate)',
       '',
     ].join('\n');
   }

   export async function executeSkill(
     skillName: string,
     context: SkillExecutionContext
   ): Promise<SkillExecutionResult> {
     const startTime = Date.now();

     // Load the skill
     const skillsDir = resolveSkillsDir();
     const skillDir = path.join(skillsDir, skillName);

     if (!fs.existsSync(skillDir)) {
       return {
         status: 'fail',
         output: `Skill not found: ${skillName}`,
         durationMs: Date.now() - startTime,
       };
     }

     // Load metadata
     const yamlPath = path.join(skillDir, 'skill.yaml');
     if (!fs.existsSync(yamlPath)) {
       return {
         status: 'fail',
         output: `skill.yaml not found for ${skillName}`,
         durationMs: Date.now() - startTime,
       };
     }

     const raw = fs.readFileSync(yamlPath, 'utf-8');
     const parsed = parse(raw);
     const metadataResult = SkillMetadataSchema.safeParse(parsed);
     if (!metadataResult.success) {
       return {
         status: 'fail',
         output: `Invalid skill metadata: ${metadataResult.error.message}`,
         durationMs: Date.now() - startTime,
       };
     }

     // Load SKILL.md
     const skillMdPath = path.join(skillDir, 'SKILL.md');
     if (!fs.existsSync(skillMdPath)) {
       return {
         status: 'fail',
         output: `SKILL.md not found for ${skillName}`,
         durationMs: Date.now() - startTime,
       };
     }

     const skillContent = fs.readFileSync(skillMdPath, 'utf-8');
     const metadata = metadataResult.data;

     // Resolve output mode
     const resolvedMode = resolveOutputMode(context.outputMode, context.trigger);

     // Build output
     const output =
       `Skill ${metadata.name} (${metadata.type}) loaded.\n` +
       `Cognitive mode: ${metadata.cognitive_mode ?? 'default'}\n` +
       `Content length: ${skillContent.length} chars\n` +
       `Trigger: ${context.trigger}\n`;

     let artifactPath: string | undefined;
     if (resolvedMode === 'artifact') {
       artifactPath = buildArtifactPath(context.projectPath, context.headSha);
       const artifactContent = buildArtifactContent(skillName, context.trigger, context.headSha);
       const dir = path.dirname(artifactPath);
       fs.mkdirSync(dir, { recursive: true });
       fs.writeFileSync(artifactPath, artifactContent, 'utf-8');
     }

     return {
       status: 'pass',
       output,
       artifactPath,
       durationMs: Date.now() - startTime,
     };
   }
   ```

4. Run tests: `pnpm --filter @harness-engineering/cli test -- tests/persona/skill-executor.test.ts`
5. Observe: all skill-executor tests pass
6. Run: `pnpm --filter @harness-engineering/cli test` to verify no regressions
7. Commit: `feat(persona): add SkillExecutor for programmatic skill invocation`

---

### Task 4: Update runner for step filtering and skill dispatch

**Depends on:** Task 1, Task 3
**Files:** packages/cli/src/persona/runner.ts, packages/cli/tests/persona/runner.test.ts

1. Update test file `packages/cli/tests/persona/runner.test.ts`:

   ```typescript
   import { describe, it, expect, vi } from 'vitest';
   import { runPersona, type CommandExecutor, type SkillExecutor } from '../../src/persona/runner';
   import type { Persona } from '../../src/persona/schema';

   const mockV2Persona: Persona = {
     version: 2,
     name: 'Test Reviewer',
     description: 'Test',
     role: 'Test',
     skills: ['harness-code-review'],
     steps: [
       { command: 'validate', when: 'always' },
       { command: 'check-deps', when: 'always' },
       { command: 'check-docs', when: 'on_pr' },
       { skill: 'harness-code-review', when: 'on_pr', output: 'auto' },
     ],
     triggers: [{ event: 'on_pr' as const }],
     config: { severity: 'error', autoFix: false, timeout: 300000 },
     outputs: { 'agents-md': true, 'ci-workflow': true, 'runtime-config': true },
   };

   // Keep existing mockPersona as normalized v1
   const mockPersona: Persona = {
     version: 1,
     name: 'Test Persona',
     description: 'Test',
     role: 'Test',
     skills: ['test-skill'],
     steps: [
       { command: 'validate', when: 'always' },
       { command: 'check-deps', when: 'always' },
     ],
     triggers: [{ event: 'on_pr' as const }],
     config: { severity: 'error', autoFix: false, timeout: 300000 },
     outputs: { 'agents-md': true, 'ci-workflow': true, 'runtime-config': true },
   };

   const mockCommandExecutor: CommandExecutor = vi
     .fn()
     .mockResolvedValue({ ok: true, value: { valid: true } });

   const mockSkillExecutor: SkillExecutor = vi.fn().mockResolvedValue({
     status: 'pass',
     output: 'Review complete',
     durationMs: 100,
   });

   describe('runPersona', () => {
     it('executes all command steps and returns pass report', async () => {
       const executor = vi.fn().mockResolvedValue({ ok: true, value: { valid: true } });
       const report = await runPersona(mockPersona, {
         trigger: 'on_pr',
         commandExecutor: executor,
         skillExecutor: mockSkillExecutor,
         projectPath: '/tmp/test',
       });
       expect(report.status).toBe('pass');
       expect(report.steps).toHaveLength(2);
       expect(report.steps[0].status).toBe('pass');
       expect(report.steps[0].type).toBe('command');
       expect(executor).toHaveBeenCalledTimes(2);
     });

     it('filters steps by trigger context', async () => {
       const cmdExec = vi.fn().mockResolvedValue({ ok: true, value: {} });
       const skillExec = vi.fn().mockResolvedValue({ status: 'pass', output: '', durationMs: 0 });

       // on_commit should only run "always" steps, not "on_pr" steps
       const report = await runPersona(mockV2Persona, {
         trigger: 'on_commit',
         commandExecutor: cmdExec,
         skillExecutor: skillExec,
         projectPath: '/tmp/test',
       });

       expect(report.steps).toHaveLength(2); // validate + check-deps (both "always")
       expect(cmdExec).toHaveBeenCalledTimes(2);
       expect(skillExec).not.toHaveBeenCalled();
     });

     it('executes skill steps on matching trigger', async () => {
       const cmdExec = vi.fn().mockResolvedValue({ ok: true, value: {} });
       const skillExec = vi
         .fn()
         .mockResolvedValue({ status: 'pass', output: 'Done', durationMs: 50 });

       // on_pr should run all 4 steps
       const report = await runPersona(mockV2Persona, {
         trigger: 'on_pr',
         commandExecutor: cmdExec,
         skillExecutor: skillExec,
         projectPath: '/tmp/test',
       });

       expect(report.steps).toHaveLength(4);
       expect(cmdExec).toHaveBeenCalledTimes(3); // validate, check-deps, check-docs
       expect(skillExec).toHaveBeenCalledTimes(1);
       expect(report.steps[3].type).toBe('skill');
       expect(report.steps[3].status).toBe('pass');
     });

     it('fails fast when a command step fails', async () => {
       const cmdExec = vi
         .fn()
         .mockResolvedValueOnce({ ok: true, value: {} })
         .mockResolvedValueOnce({ ok: false, error: new Error('check-deps failed') });
       const report = await runPersona(mockV2Persona, {
         trigger: 'on_pr',
         commandExecutor: cmdExec,
         skillExecutor: mockSkillExecutor,
         projectPath: '/tmp/test',
       });
       expect(report.status).toBe('fail');
       expect(report.steps[1].status).toBe('fail');
       // Remaining steps skipped
       expect(report.steps.filter((s) => s.status === 'skipped').length).toBeGreaterThan(0);
     });

     it('fails fast when a skill step fails', async () => {
       const cmdExec = vi.fn().mockResolvedValue({ ok: true, value: {} });
       const skillExec = vi
         .fn()
         .mockResolvedValue({ status: 'fail', output: 'Error', durationMs: 0 });
       const report = await runPersona(mockV2Persona, {
         trigger: 'on_pr',
         commandExecutor: cmdExec,
         skillExecutor: skillExec,
         projectPath: '/tmp/test',
       });
       expect(report.status).toBe('fail');
       expect(report.steps.find((s) => s.type === 'skill')?.status).toBe('fail');
     });
   });
   ```

2. Run tests: observe failures

3. Rewrite `packages/cli/src/persona/runner.ts`:

   ```typescript
   import type { Result } from '@harness-engineering/core';
   import type { Persona, Step, TriggerContext } from './schema';
   import type { SkillExecutionResult, SkillExecutionContext } from './skill-executor';

   const TIMEOUT_ERROR_MESSAGE = '__PERSONA_RUNNER_TIMEOUT__';

   export interface StepReport {
     name: string;
     type: 'command' | 'skill';
     status: 'pass' | 'fail' | 'skipped';
     result?: unknown;
     artifactPath?: string;
     error?: string;
     durationMs: number;
   }

   export interface PersonaRunReport {
     persona: string;
     status: 'pass' | 'fail' | 'partial';
     steps: StepReport[];
     totalDurationMs: number;
   }

   export type CommandExecutor = (command: string) => Promise<Result<unknown, Error>>;
   export type SkillExecutor = (
     skillName: string,
     context: SkillExecutionContext
   ) => Promise<SkillExecutionResult>;

   export interface StepExecutionContext {
     trigger: TriggerContext;
     commandExecutor: CommandExecutor;
     skillExecutor: SkillExecutor;
     projectPath: string;
   }

   function stepName(step: Step): string {
     return 'command' in step ? step.command : step.skill;
   }

   function stepType(step: Step): 'command' | 'skill' {
     return 'command' in step ? 'command' : 'skill';
   }

   function matchesTrigger(step: Step, trigger: TriggerContext): boolean {
     const when = step.when ?? 'always';
     return when === 'always' || when === trigger;
   }

   export async function runPersona(
     persona: Persona,
     context: StepExecutionContext
   ): Promise<PersonaRunReport> {
     const startTime = Date.now();
     const timeout = persona.config.timeout;
     const report: PersonaRunReport = {
       persona: persona.name.toLowerCase().replace(/\s+/g, '-'),
       status: 'pass',
       steps: [],
       totalDurationMs: 0,
     };

     const activeSteps = persona.steps.filter((s) => matchesTrigger(s, context.trigger));

     for (let i = 0; i < activeSteps.length; i++) {
       const step = activeSteps[i]!;

       // Check timeout
       if (Date.now() - startTime >= timeout) {
         for (let j = i; j < activeSteps.length; j++) {
           const remaining = activeSteps[j]!;
           report.steps.push({
             name: stepName(remaining),
             type: stepType(remaining),
             status: 'skipped',
             durationMs: 0,
           });
         }
         report.status = 'partial';
         break;
       }

       const stepStart = Date.now();
       const remainingTime = timeout - (Date.now() - startTime);

       if ('command' in step) {
         // Command step
         const result = await Promise.race([
           context.commandExecutor(step.command),
           new Promise<Result<never, Error>>((resolve) =>
             setTimeout(
               () =>
                 resolve({ ok: false, error: new Error(TIMEOUT_ERROR_MESSAGE) } as Result<
                   never,
                   Error
                 >),
               remainingTime
             )
           ),
         ]);

         const durationMs = Date.now() - stepStart;

         if (result.ok) {
           report.steps.push({
             name: step.command,
             type: 'command',
             status: 'pass',
             result: result.value,
             durationMs,
           });
         } else if (result.error.message === TIMEOUT_ERROR_MESSAGE) {
           report.steps.push({
             name: step.command,
             type: 'command',
             status: 'skipped',
             error: 'timed out',
             durationMs,
           });
           report.status = 'partial';
           for (let j = i + 1; j < activeSteps.length; j++) {
             const skipped = activeSteps[j]!;
             report.steps.push({
               name: stepName(skipped),
               type: stepType(skipped),
               status: 'skipped',
               durationMs: 0,
             });
           }
           break;
         } else {
           report.steps.push({
             name: step.command,
             type: 'command',
             status: 'fail',
             error: result.error.message,
             durationMs,
           });
           report.status = 'fail';
           for (let j = i + 1; j < activeSteps.length; j++) {
             const skipped = activeSteps[j]!;
             report.steps.push({
               name: stepName(skipped),
               type: stepType(skipped),
               status: 'skipped',
               durationMs: 0,
             });
           }
           break;
         }
       } else {
         // Skill step
         const skillContext: SkillExecutionContext = {
           trigger: context.trigger,
           projectPath: context.projectPath,
           outputMode: step.output ?? 'auto',
         };

         const result = await context.skillExecutor(step.skill, skillContext);
         const durationMs = Date.now() - stepStart;

         if (result.status === 'pass') {
           report.steps.push({
             name: step.skill,
             type: 'skill',
             status: 'pass',
             result: result.output,
             artifactPath: result.artifactPath,
             durationMs,
           });
         } else {
           report.steps.push({
             name: step.skill,
             type: 'skill',
             status: 'fail',
             error: result.output,
             durationMs,
           });
           report.status = 'fail';
           for (let j = i + 1; j < activeSteps.length; j++) {
             const skipped = activeSteps[j]!;
             report.steps.push({
               name: stepName(skipped),
               type: stepType(skipped),
               status: 'skipped',
               durationMs: 0,
             });
           }
           break;
         }
       }
     }

     report.totalDurationMs = Date.now() - startTime;
     return report;
   }
   ```

4. Run tests: `pnpm --filter @harness-engineering/cli test -- tests/persona/runner.test.ts`
5. Observe: all runner tests pass
6. Run: `pnpm --filter @harness-engineering/cli test` to verify no regressions
7. Commit: `feat(persona): update runner with step filtering and skill dispatch`

---

### Task 5: Update agent run command and MCP handler for v2 runner API

**Depends on:** Task 4
**Files:** packages/cli/src/commands/agent/run.ts, packages/mcp-server/src/tools/persona.ts

1. Update `packages/cli/src/commands/agent/run.ts` — update the persona branch to use new `StepExecutionContext`:
   - Import `executeSkill` from `../../persona/skill-executor`
   - Import `type StepExecutionContext` from `../../persona/runner`
   - Replace `runPersona(persona, executor)` with `runPersona(persona, context)` where context includes trigger, commandExecutor, skillExecutor, and projectPath
   - Add `--trigger` option to the command for specifying trigger context
   - Update report logging to iterate `report.steps` instead of `report.commands`

2. Update `packages/mcp-server/src/tools/persona.ts` — update `handleRunPersona`:
   - Add `trigger` to input schema (optional, defaults to `'manual'`)
   - Import `executeSkill` and pass it as `skillExecutor` in the context
   - Update to use `StepExecutionContext`

3. Run: `pnpm --filter @harness-engineering/cli test` to verify no regressions
4. Commit: `feat(persona): update agent run command and MCP for v2 runner`

---

### Task 6: Update runtime generator for v2

**Depends on:** Task 1
**Files:** packages/cli/src/persona/generators/runtime.ts, packages/cli/tests/persona/generators/runtime.test.ts

1. Update test file — add v2 test:

   ```typescript
   it('generates runtime config with steps for v2 persona', () => {
     const v2Persona: Persona = {
       ...mockPersona,
       version: 2,
       steps: [
         { command: 'validate', when: 'always' },
         { skill: 'harness-code-review', when: 'on_pr', output: 'auto' },
       ],
     };
     const result = generateRuntime(v2Persona);
     expect(result.ok).toBe(true);
     if (!result.ok) return;
     const config = JSON.parse(result.value);
     expect(config.steps).toEqual([
       { command: 'validate', when: 'always' },
       { skill: 'harness-code-review', when: 'on_pr', output: 'auto' },
     ]);
     expect(config.commands).toBeUndefined();
   });

   it('generates runtime config with commands for v1 persona (backward compat)', () => {
     const result = generateRuntime(mockPersona);
     expect(result.ok).toBe(true);
     if (!result.ok) return;
     const config = JSON.parse(result.value);
     expect(config.steps).toBeDefined();
   });
   ```

2. Run tests: observe failures

3. Update `packages/cli/src/persona/generators/runtime.ts`:

   ```typescript
   import type { Result } from '@harness-engineering/core';
   import { Ok, Err } from '@harness-engineering/core';
   import type { Persona } from '../schema';
   import { toKebabCase } from '../../utils/string';

   export function generateRuntime(persona: Persona): Result<string, Error> {
     try {
       const config = {
         name: toKebabCase(persona.name),
         skills: persona.skills,
         steps: persona.steps,
         timeout: persona.config.timeout,
         severity: persona.config.severity,
       };
       return Ok(JSON.stringify(config, null, 2));
     } catch (error) {
       return Err(
         new Error(
           `Failed to generate runtime config: ${error instanceof Error ? error.message : String(error)}`
         )
       );
     }
   }
   ```

4. Run tests: `pnpm --filter @harness-engineering/cli test -- tests/persona/generators/runtime.test.ts`
5. Observe: all pass
6. Commit: `feat(persona): update runtime generator for v2 steps`

---

### Task 7: Update agents-md generator for v2

**Depends on:** Task 1
**Files:** packages/cli/src/persona/generators/agents-md.ts, packages/cli/tests/persona/generators/agents-md.test.ts

1. Update test file — add v2 test:

   ```typescript
   it('generates markdown with commands and skills from steps', () => {
     const v2Persona: Persona = {
       ...mockPersona,
       version: 2,
       steps: [
         { command: 'validate', when: 'always' },
         { command: 'check-deps', when: 'on_commit' },
         { skill: 'harness-code-review', when: 'on_pr', output: 'auto' },
       ],
     };
     const result = generateAgentsMd(v2Persona);
     expect(result.ok).toBe(true);
     if (!result.ok) return;
     expect(result.value).toContain('harness validate');
     expect(result.value).toContain('harness check-deps');
     expect(result.value).toContain('harness-code-review');
   });
   ```

2. Run tests: observe failure

3. Update `packages/cli/src/persona/generators/agents-md.ts` — extract commands and skills from `persona.steps` instead of `persona.commands`:

   ```typescript
   import type { Result } from '@harness-engineering/core';
   import { Ok, Err } from '@harness-engineering/core';
   import type { Persona, PersonaTrigger } from '../schema';

   function formatTrigger(trigger: PersonaTrigger): string {
     switch (trigger.event) {
       case 'on_pr': {
         const paths = trigger.conditions?.paths?.join(', ') ?? 'all files';
         return `On PR (${paths})`;
       }
       case 'on_commit': {
         const branches = trigger.conditions?.branches?.join(', ') ?? 'all branches';
         return `On commit (${branches})`;
       }
       case 'scheduled':
         return `Scheduled (cron: ${trigger.cron})`;
     }
   }

   export function generateAgentsMd(persona: Persona): Result<string, Error> {
     try {
       const triggers = persona.triggers.map(formatTrigger).join(', ');
       const skills = persona.skills.join(', ');

       // Extract unique commands from steps
       const commands = persona.steps
         .filter((s): s is { command: string; when: string } => 'command' in s)
         .map((s) => `\`harness ${s.command}\``)
         .join(', ');

       // Extract skill names from steps
       const stepSkills = persona.steps
         .filter((s): s is { skill: string; when: string; output: string } => 'skill' in s)
         .map((s) => `\`harness skill run ${s.skill}\``)
         .join(', ');

       const allCommands = [commands, stepSkills].filter(Boolean).join(', ');

       const fragment = `## ${persona.name} Agent\n\n**Role:** ${persona.role}\n\n**Triggers:** ${triggers}\n\n**Skills:** ${skills}\n\n**When this agent flags an issue:** Fix violations before merging. Run ${allCommands} locally to validate.\n`;
       return Ok(fragment);
     } catch (error) {
       return Err(
         new Error(
           `Failed to generate AGENTS.md fragment: ${error instanceof Error ? error.message : String(error)}`
         )
       );
     }
   }
   ```

4. Run tests: `pnpm --filter @harness-engineering/cli test -- tests/persona/generators/agents-md.test.ts`
5. Observe: all pass
6. Commit: `feat(persona): update agents-md generator for v2 steps`

---

### Task 8: Update CI workflow generator for v2

**Depends on:** Task 1
**Files:** packages/cli/src/persona/generators/ci-workflow.ts, packages/cli/tests/persona/generators/ci-workflow.test.ts

1. Update test file — add v2 test:

   ```typescript
   it('generates workflow steps only for trigger-matching commands', () => {
     const v2Persona: Persona = {
       ...mockPersona,
       version: 2,
       steps: [
         { command: 'validate', when: 'always' },
         { command: 'check-deps', when: 'always' },
         { command: 'check-docs', when: 'on_pr' },
         { skill: 'harness-code-review', when: 'on_pr', output: 'auto' },
       ],
     };
     const result = generateCIWorkflow(v2Persona, 'github');
     expect(result.ok).toBe(true);
     if (!result.ok) return;
     const workflow = YAML.parse(result.value);
     const steps = workflow.jobs.enforce.steps;
     const runSteps = steps.filter((s: Record<string, unknown>) => typeof s.run === 'string');
     // Should include all command steps (skill steps are not CI-runnable)
     expect(runSteps.length).toBe(3); // validate, check-deps, check-docs
   });
   ```

2. Run tests: observe failure

3. Update `packages/cli/src/persona/generators/ci-workflow.ts` — iterate `persona.steps` instead of `persona.commands`, only emitting command steps:

   ```typescript
   import YAML from 'yaml';
   import type { Result } from '@harness-engineering/core';
   import { Ok, Err } from '@harness-engineering/core';
   import type { Persona, PersonaTrigger } from '../schema';

   function buildGitHubTriggers(triggers: PersonaTrigger[]): Record<string, unknown> {
     const on: Record<string, unknown> = {};
     for (const trigger of triggers) {
       switch (trigger.event) {
         case 'on_pr': {
           const prConfig: Record<string, unknown> = {};
           if (trigger.conditions?.paths) prConfig.paths = trigger.conditions.paths;
           on.pull_request = prConfig;
           break;
         }
         case 'on_commit': {
           const pushConfig: Record<string, unknown> = {};
           if (trigger.conditions?.branches) pushConfig.branches = trigger.conditions.branches;
           on.push = pushConfig;
           break;
         }
         case 'scheduled':
           on.schedule = [{ cron: trigger.cron }];
           break;
       }
     }
     return on;
   }

   export function generateCIWorkflow(
     persona: Persona,
     platform: 'github' | 'gitlab'
   ): Result<string, Error> {
     try {
       if (platform === 'gitlab')
         return Err(new Error('GitLab CI generation is not yet supported'));

       const severity = persona.config.severity;
       const steps: Record<string, unknown>[] = [
         { uses: 'actions/checkout@v4' },
         { uses: 'actions/setup-node@v4', with: { 'node-version': '20' } },
         { uses: 'pnpm/action-setup@v4', with: { run_install: 'frozen' } },
       ];

       // Only emit command steps in CI (skill steps require AI agent runtime)
       const commandSteps = persona.steps.filter(
         (s): s is { command: string; when: string } => 'command' in s
       );

       for (const step of commandSteps) {
         const severityFlag = severity ? ` --severity ${severity}` : '';
         steps.push({ run: `npx harness ${step.command}${severityFlag}` });
       }

       const workflow = {
         name: persona.name,
         on: buildGitHubTriggers(persona.triggers),
         jobs: {
           enforce: {
             'runs-on': 'ubuntu-latest',
             steps,
           },
         },
       };

       return Ok(YAML.stringify(workflow, { lineWidth: 0 }));
     } catch (error) {
       return Err(
         new Error(
           `Failed to generate CI workflow: ${error instanceof Error ? error.message : String(error)}`
         )
       );
     }
   }
   ```

4. Run tests: `pnpm --filter @harness-engineering/cli test -- tests/persona/generators/ci-workflow.test.ts`
5. Observe: all pass
6. Commit: `feat(persona): update CI workflow generator for v2 steps`

---

### Task 9: Update exports in index.ts

**Depends on:** Task 3, Task 4
**Files:** packages/cli/src/index.ts

1. Update `packages/cli/src/index.ts` — add new exports:

   ```typescript
   // Persona exports (update existing block)
   export { loadPersona, listPersonas } from './persona/loader';
   export type { PersonaMetadata } from './persona/loader';
   export { generateRuntime } from './persona/generators/runtime';
   export { generateAgentsMd } from './persona/generators/agents-md';
   export { generateCIWorkflow } from './persona/generators/ci-workflow';
   export { runPersona } from './persona/runner';
   export type {
     CommandExecutor,
     SkillExecutor,
     StepExecutionContext,
     PersonaRunReport,
     StepReport,
   } from './persona/runner';
   export { executeSkill } from './persona/skill-executor';
   export type { SkillExecutionContext, SkillExecutionResult } from './persona/skill-executor';
   export type { Persona, Step, CommandStep, SkillStep, TriggerContext } from './persona/schema';
   ```

2. Run: `pnpm --filter @harness-engineering/cli test` to verify no regressions
3. Commit: `feat(persona): export v2 types and SkillExecutor from CLI package`

---

### Task 10: Create code-reviewer persona YAML

**Depends on:** Task 2
**Files:** agents/personas/code-reviewer.yaml

1. Create `agents/personas/code-reviewer.yaml`:

   ```yaml
   version: 2
   name: Code Reviewer
   description: Full-lifecycle code review with harness methodology
   role: >
     Perform AI-powered code review incorporating harness validation,
     architectural analysis, and project-specific calibration.
     Produces structured Strengths/Issues/Assessment output.
   skills:
     - harness-code-review
   steps:
     - command: validate
       when: always
     - command: check-deps
       when: always
     - command: check-docs
       when: on_pr
     - skill: harness-code-review
       when: on_pr
       output: auto
     - skill: harness-code-review
       when: manual
       output: auto
   triggers:
     - event: on_pr
       conditions:
         paths:
           - 'src/**'
           - 'packages/**'
     - event: on_commit
       conditions:
         branches:
           - main
           - develop
   config:
     severity: error
     autoFix: false
     timeout: 600000
   outputs:
     agents-md: true
     ci-workflow: true
     runtime-config: true
   ```

2. Run: `pnpm --filter @harness-engineering/cli test` — verify all tests pass including the loader picking up this file pattern
3. Commit: `feat(persona): add code-reviewer persona with graduated depth`

---

[checkpoint:human-verify] — Review the complete plan before execution begins.

## Dependency Graph

```
Task 1 (schema) ──┬── Task 2 (loader) ──── Task 10 (persona YAML)
                   ├── Task 3 (skill-executor) ──┬── Task 4 (runner) ── Task 5 (agent run + MCP)
                   │                             └── Task 9 (exports)
                   ├── Task 6 (runtime gen)
                   ├── Task 7 (agents-md gen)
                   └── Task 8 (ci-workflow gen)
```

**Parallelizable:** Tasks 2, 3, 6, 7, 8 can all run in parallel after Task 1.

# Plan: Agent Definition Generator for Persona-Based Routing

**Date:** 2026-03-18
**Spec:** docs/specs/2026-03-18-agent-definition-generator-design.md
**Estimated tasks:** 9
**Estimated time:** 45 minutes

## Goal

Harness personas generate platform-specific agent definition files so they compete with GSD in Claude Code and Gemini CLI agent routing.

## Observable Truths (Acceptance Criteria)

1. When `harness generate-agent-definitions` runs, one `.md` file per persona per platform exists in the output directory
2. When a generated Claude Code agent file is read, it contains YAML frontmatter with `name`, `description`, `tools` and a body with role, steps, and embedded SKILL.md content
3. When `harness generate-agent-definitions --global` runs, files exist in `~/.claude/agents/` and `~/.gemini/agents/`
4. When `harness generate` runs, both slash commands and agent definitions are generated
5. When the generator runs twice, unchanged files are not rewritten (incremental sync)
6. When a persona is removed, re-running the generator removes the stale agent definition
7. `pnpm --filter @harness-engineering/cli test` passes with new tests included

## File Map

```
CREATE packages/cli/src/agent-definitions/generator.ts
CREATE packages/cli/src/agent-definitions/render-claude-code.ts
CREATE packages/cli/src/agent-definitions/render-gemini-cli.ts
CREATE packages/cli/src/commands/generate-agent-definitions.ts
CREATE packages/cli/src/commands/generate.ts
MODIFY packages/cli/src/index.ts
MODIFY packages/cli/src/slash-commands/types.ts
CREATE packages/cli/tests/agent-definitions/generator.test.ts
CREATE packages/cli/tests/agent-definitions/render-claude-code.test.ts
CREATE packages/cli/tests/agent-definitions/render-gemini-cli.test.ts
CREATE packages/cli/tests/commands/generate-agent-definitions.test.ts
CREATE packages/cli/tests/commands/generate.test.ts
MODIFY packages/mcp-server/src/server.ts
CREATE packages/mcp-server/src/tools/agent-definitions.ts
```

## Tasks

### Task 1: Generator core — persona to AgentDefinition

**Depends on:** none
**Files:** packages/cli/src/agent-definitions/generator.ts, packages/cli/tests/agent-definitions/generator.test.ts

1. Create test file `packages/cli/tests/agent-definitions/generator.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import {
     generateAgentDefinition,
     AGENT_DESCRIPTIONS,
   } from '../../src/agent-definitions/generator';
   import type { Persona } from '../../src/persona/schema';

   const mockPersona: Persona = {
     version: 2,
     name: 'Code Reviewer',
     description: 'Full-lifecycle code review',
     role: 'Perform AI-powered code review',
     skills: ['harness-code-review'],
     steps: [
       { command: 'validate', when: 'always' },
       { skill: 'harness-code-review', when: 'on_pr', output: 'auto' },
     ],
     triggers: [{ event: 'on_pr' as const }],
     config: { severity: 'error', autoFix: false, timeout: 600000 },
     outputs: { 'agents-md': true, 'ci-workflow': true, 'runtime-config': true },
   };

   describe('generateAgentDefinition', () => {
     it('produces an AgentDefinition from a persona', () => {
       const skillContents = new Map([['harness-code-review', '# Code Review\n\nMethodology...']]);
       const def = generateAgentDefinition(mockPersona, skillContents);
       expect(def.name).toBe('harness-code-reviewer');
       expect(def.role).toBe('Perform AI-powered code review');
       expect(def.skills).toEqual(['harness-code-review']);
       expect(def.methodology).toContain('Methodology');
     });

     it('uses task-aware description from AGENT_DESCRIPTIONS', () => {
       const skillContents = new Map([['harness-code-review', '# Review']]);
       const def = generateAgentDefinition(mockPersona, skillContents);
       expect(def.description).toContain('review');
       expect(def.description).toContain('findings');
     });

     it('falls back to persona description when no custom description exists', () => {
       const persona: Persona = { ...mockPersona, name: 'Unknown Persona' };
       const def = generateAgentDefinition(persona, new Map());
       expect(def.description).toBe('Full-lifecycle code review');
     });

     it('concatenates multiple skill contents', () => {
       const persona: Persona = { ...mockPersona, skills: ['skill-a', 'skill-b'] };
       const skillContents = new Map([
         ['skill-a', '# Skill A'],
         ['skill-b', '# Skill B'],
       ]);
       const def = generateAgentDefinition(persona, skillContents);
       expect(def.methodology).toContain('Skill A');
       expect(def.methodology).toContain('Skill B');
     });
   });
   ```

2. Run test: observe failure — module doesn't exist

3. Create `packages/cli/src/agent-definitions/generator.ts`:

   ```typescript
   import type { Persona, Step } from '../persona/schema';
   import { toKebabCase } from '../utils/string';

   export interface AgentDefinition {
     name: string;
     description: string;
     tools: string[];
     role: string;
     skills: string[];
     steps: Step[];
     methodology: string;
   }

   export const AGENT_DESCRIPTIONS: Record<string, string> = {
     'code-reviewer':
       'Perform code review and address review findings using harness methodology. Use when reviewing code, fixing review findings, responding to review feedback, or when a code review has produced issues that need to be addressed.',
     'task-executor':
       'Execute implementation plans task-by-task with state tracking, TDD, and verification. Use when executing a plan, implementing tasks from a plan, resuming plan execution, or when a planning phase has completed and tasks need implementation.',
     'parallel-coordinator':
       'Dispatch independent tasks across isolated agents for parallel execution. Use when multiple independent tasks need to run concurrently, splitting work across agents, or coordinating parallel implementation.',
     'architecture-enforcer':
       'Validate architectural constraints and dependency rules. Use when checking layer boundaries, detecting circular dependencies, or verifying import direction compliance.',
     'documentation-maintainer':
       'Keep documentation in sync with source code. Use when detecting documentation drift, validating doc coverage, or aligning docs with code changes.',
     'entropy-cleaner':
       'Detect and fix codebase entropy including drift, dead code, and pattern violations. Use when running cleanup, detecting dead code, or fixing pattern violations.',
   };

   // Collect tool names from skill metadata (if available)
   const DEFAULT_TOOLS = ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep'];

   export function generateAgentDefinition(
     persona: Persona,
     skillContents: Map<string, string>
   ): AgentDefinition {
     const kebabName = toKebabCase(persona.name);
     const name = `harness-${kebabName}`;
     const description = AGENT_DESCRIPTIONS[kebabName] ?? persona.description;

     const methodologyParts: string[] = [];
     for (const skillName of persona.skills) {
       const content = skillContents.get(skillName);
       if (content) {
         methodologyParts.push(content);
       }
     }

     return {
       name,
       description,
       tools: DEFAULT_TOOLS,
       role: persona.role,
       skills: persona.skills,
       steps: persona.steps,
       methodology: methodologyParts.join('\n\n---\n\n'),
     };
   }
   ```

4. Run test: `pnpm --filter @harness-engineering/cli test -- tests/agent-definitions/generator.test.ts`
5. Observe: all tests pass
6. Commit: `feat(agent-definitions): add generator core — persona to AgentDefinition`

---

### Task 2: Claude Code renderer

**Depends on:** Task 1
**Files:** packages/cli/src/agent-definitions/render-claude-code.ts, packages/cli/tests/agent-definitions/render-claude-code.test.ts

1. Create test file `packages/cli/tests/agent-definitions/render-claude-code.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { renderClaudeCodeAgent } from '../../src/agent-definitions/render-claude-code';
   import type { AgentDefinition } from '../../src/agent-definitions/generator';

   const mockDef: AgentDefinition = {
     name: 'harness-code-reviewer',
     description: 'Perform code review and address findings.',
     tools: ['Bash', 'Read', 'Glob', 'Grep'],
     role: 'Perform AI-powered code review',
     skills: ['harness-code-review'],
     steps: [
       { command: 'validate', when: 'always' },
       { skill: 'harness-code-review', when: 'on_pr', output: 'auto' },
     ],
     methodology: '# Code Review\n\nFull methodology here.',
   };

   describe('renderClaudeCodeAgent', () => {
     it('produces markdown with YAML frontmatter', () => {
       const output = renderClaudeCodeAgent(mockDef);
       expect(output).toMatch(/^---\n/);
       expect(output).toContain('name: harness-code-reviewer');
       expect(output).toContain('description:');
       expect(output).toContain('tools: Bash, Read, Glob, Grep');
     });

     it('includes generated header', () => {
       const output = renderClaudeCodeAgent(mockDef);
       expect(output).toContain('Generated by harness generate-agent-definitions');
     });

     it('includes role section', () => {
       const output = renderClaudeCodeAgent(mockDef);
       expect(output).toContain('## Role');
       expect(output).toContain('AI-powered code review');
     });

     it('includes steps section', () => {
       const output = renderClaudeCodeAgent(mockDef);
       expect(output).toContain('## Steps');
       expect(output).toContain('validate');
     });

     it('includes methodology section with SKILL.md content', () => {
       const output = renderClaudeCodeAgent(mockDef);
       expect(output).toContain('## Methodology');
       expect(output).toContain('Full methodology here');
     });
   });
   ```

2. Run test: observe failure

3. Create `packages/cli/src/agent-definitions/render-claude-code.ts`:

   ```typescript
   import type { AgentDefinition } from './generator';
   import { GENERATED_HEADER_AGENT } from './constants';

   function formatStep(
     step: { command?: string; skill?: string; when?: string; output?: string },
     index: number
   ): string {
     if ('command' in step && step.command) {
       return `${index + 1}. Run \`harness ${step.command}\` (${step.when ?? 'always'})`;
     }
     if ('skill' in step && step.skill) {
       return `${index + 1}. Execute ${step.skill} skill (${step.when ?? 'always'})`;
     }
     return `${index + 1}. Unknown step`;
   }

   export function renderClaudeCodeAgent(def: AgentDefinition): string {
     const lines: string[] = ['---'];
     lines.push(`name: ${def.name}`);
     lines.push(`description: >`);
     lines.push(`  ${def.description}`);
     lines.push(`tools: ${def.tools.join(', ')}`);
     lines.push('---');
     lines.push('');
     lines.push(GENERATED_HEADER_AGENT);
     lines.push('');
     lines.push('## Role');
     lines.push('');
     lines.push(def.role);
     lines.push('');
     lines.push('## Skills');
     lines.push('');
     for (const skill of def.skills) {
       lines.push(`- ${skill}`);
     }
     lines.push('');
     lines.push('## Steps');
     lines.push('');
     def.steps.forEach((step, i) => {
       lines.push(formatStep(step as Record<string, string>, i));
     });
     lines.push('');
     if (def.methodology) {
       lines.push('## Methodology');
       lines.push('');
       lines.push(def.methodology);
       lines.push('');
     }
     return lines.join('\n');
   }
   ```

4. Create `packages/cli/src/agent-definitions/constants.ts`:

   ```typescript
   export const GENERATED_HEADER_AGENT =
     '<!-- Generated by harness generate-agent-definitions. Do not edit. -->';
   ```

5. Run test: observe pass
6. Commit: `feat(agent-definitions): add Claude Code agent renderer`

---

### Task 3: Gemini CLI renderer

**Depends on:** Task 1
**Files:** packages/cli/src/agent-definitions/render-gemini-cli.ts, packages/cli/tests/agent-definitions/render-gemini-cli.test.ts

1. Create test file `packages/cli/tests/agent-definitions/render-gemini-cli.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { renderGeminiAgent } from '../../src/agent-definitions/render-gemini-cli';
   import type { AgentDefinition } from '../../src/agent-definitions/generator';

   const mockDef: AgentDefinition = {
     name: 'harness-code-reviewer',
     description: 'Perform code review and address findings.',
     tools: ['Bash', 'Read', 'Glob', 'Grep'],
     role: 'Perform AI-powered code review',
     skills: ['harness-code-review'],
     steps: [
       { command: 'validate', when: 'always' },
       { skill: 'harness-code-review', when: 'on_pr', output: 'auto' },
     ],
     methodology: '# Code Review\n\nFull methodology here.',
   };

   describe('renderGeminiAgent', () => {
     it('produces markdown with YAML frontmatter', () => {
       const output = renderGeminiAgent(mockDef);
       expect(output).toMatch(/^---\n/);
       expect(output).toContain('name: harness-code-reviewer');
       expect(output).toContain('description:');
     });

     it('includes generated header', () => {
       const output = renderGeminiAgent(mockDef);
       expect(output).toContain('Generated by harness generate-agent-definitions');
     });

     it('includes methodology content', () => {
       const output = renderGeminiAgent(mockDef);
       expect(output).toContain('Full methodology here');
     });
   });
   ```

2. Run test: observe failure

3. Create `packages/cli/src/agent-definitions/render-gemini-cli.ts`:

   ```typescript
   import type { AgentDefinition } from './generator';
   import { GENERATED_HEADER_AGENT } from './constants';

   function formatStep(
     step: { command?: string; skill?: string; when?: string },
     index: number
   ): string {
     if ('command' in step && step.command) {
       return `${index + 1}. Run \`harness ${step.command}\` (${step.when ?? 'always'})`;
     }
     if ('skill' in step && step.skill) {
       return `${index + 1}. Execute ${step.skill} skill (${step.when ?? 'always'})`;
     }
     return `${index + 1}. Unknown step`;
   }

   export function renderGeminiAgent(def: AgentDefinition): string {
     // Gemini CLI uses the same markdown-with-frontmatter format
     const lines: string[] = ['---'];
     lines.push(`name: ${def.name}`);
     lines.push(`description: >`);
     lines.push(`  ${def.description}`);
     lines.push(`tools: ${def.tools.join(', ')}`);
     lines.push('---');
     lines.push('');
     lines.push(GENERATED_HEADER_AGENT);
     lines.push('');
     lines.push('## Role');
     lines.push('');
     lines.push(def.role);
     lines.push('');
     lines.push('## Skills');
     lines.push('');
     for (const skill of def.skills) {
       lines.push(`- ${skill}`);
     }
     lines.push('');
     lines.push('## Steps');
     lines.push('');
     def.steps.forEach((step, i) => {
       lines.push(formatStep(step as Record<string, string>, i));
     });
     lines.push('');
     if (def.methodology) {
       lines.push('## Methodology');
       lines.push('');
       lines.push(def.methodology);
       lines.push('');
     }
     return lines.join('\n');
   }
   ```

4. Run test: observe pass
5. Commit: `feat(agent-definitions): add Gemini CLI agent renderer`

---

### Task 4: CLI command — generate-agent-definitions

**Depends on:** Tasks 1, 2, 3
**Files:** packages/cli/src/commands/generate-agent-definitions.ts, packages/cli/tests/commands/generate-agent-definitions.test.ts, packages/cli/src/slash-commands/types.ts

1. Add generated header constant to `packages/cli/src/slash-commands/types.ts`:

   ```typescript
   // Add after existing headers
   export const GENERATED_HEADER_AGENT =
     '<!-- Generated by harness generate-agent-definitions. Do not edit. -->';
   ```

   Actually — use the one from `agent-definitions/constants.ts` instead. Import it in sync if needed.

2. Create test file `packages/cli/tests/commands/generate-agent-definitions.test.ts`:

   ```typescript
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import fs from 'node:fs';
   import path from 'node:path';
   import os from 'node:os';
   import { generateAgentDefinitions } from '../../src/commands/generate-agent-definitions';

   let tmpDir: string;

   beforeEach(() => {
     tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-def-test-'));
   });
   afterEach(() => {
     fs.rmSync(tmpDir, { recursive: true, force: true });
   });

   describe('generateAgentDefinitions', () => {
     it('generates agent files for all personas', () => {
       const results = generateAgentDefinitions({
         platforms: ['claude-code'],
         global: false,
         output: tmpDir,
         dryRun: false,
       });
       expect(results.length).toBe(1);
       expect(results[0].added.length).toBeGreaterThan(0);
     });

     it('dry run does not write files', () => {
       const results = generateAgentDefinitions({
         platforms: ['claude-code'],
         global: false,
         output: tmpDir,
         dryRun: true,
       });
       expect(results[0].added.length).toBeGreaterThan(0);
       const outputDir = path.join(tmpDir, 'harness');
       expect(fs.existsSync(outputDir)).toBe(false);
     });

     it('generates for both platforms', () => {
       const results = generateAgentDefinitions({
         platforms: ['claude-code', 'gemini-cli'],
         global: false,
         output: tmpDir,
         dryRun: false,
       });
       expect(results.length).toBe(2);
     });
   });
   ```

3. Create `packages/cli/src/commands/generate-agent-definitions.ts` — the main command that:
   - Loads all personas via `listPersonas` + `loadPersona`
   - For each persona, loads skill SKILL.md content
   - Generates `AgentDefinition` per persona
   - Renders per platform
   - Syncs with `computeSyncPlan` + `applySyncPlan` from slash-commands/sync (reuse)
   - Output dir resolution: project-local `agents/agents/<platform>/` or global `~/.<platform>/agents/`

4. Run test: observe pass
5. Commit: `feat(agent-definitions): add generate-agent-definitions CLI command`

---

### Task 5: CLI command — generate (orchestrator)

**Depends on:** Task 4
**Files:** packages/cli/src/commands/generate.ts, packages/cli/tests/commands/generate.test.ts

1. Create test file `packages/cli/tests/commands/generate.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { createGenerateCommand } from '../../src/commands/generate';

   describe('generate command', () => {
     it('creates a command with correct name and description', () => {
       const cmd = createGenerateCommand();
       expect(cmd.name()).toBe('generate');
       expect(cmd.description()).toContain('platform integrations');
     });
   });
   ```

2. Create `packages/cli/src/commands/generate.ts`:

   ```typescript
   import { Command } from 'commander';
   import { generateSlashCommands, handleOrphanDeletion } from './generate-slash-commands';
   import { generateAgentDefinitions } from './generate-agent-definitions';
   import type { Platform } from '../slash-commands/types';
   import { VALID_PLATFORMS } from '../slash-commands/types';
   import { CLIError, ExitCode, handleError } from '../utils/errors';

   export function createGenerateCommand(): Command {
     return new Command('generate')
       .description('Generate all platform integrations (slash commands + agent definitions)')
       .option('--platforms <list>', 'Target platforms', 'claude-code,gemini-cli')
       .option('--global', 'Write to global directories', false)
       .option('--include-global', 'Include built-in global skills', false)
       .option('--output <dir>', 'Custom output directory')
       .option('--dry-run', 'Show what would change without writing', false)
       .option('--yes', 'Skip deletion confirmation prompts', false)
       .action(async (opts, cmd) => {
         const globalOpts = cmd.optsWithGlobals();
         const platforms = opts.platforms.split(',').map((p: string) => p.trim()) as Platform[];

         // 1. Generate slash commands
         console.log('Generating slash commands...');
         const slashResults = generateSlashCommands({
           platforms,
           global: opts.global,
           includeGlobal: opts.includeGlobal,
           output: opts.output,
           skillsDir: '',
           dryRun: opts.dryRun,
           yes: opts.yes,
         });
         // ... print results

         // 2. Generate agent definitions
         console.log('\nGenerating agent definitions...');
         const agentResults = generateAgentDefinitions({
           platforms,
           global: opts.global,
           output: opts.output,
           dryRun: opts.dryRun,
         });
         // ... print results
       });
   }
   ```

3. Run test: observe pass
4. Commit: `feat(agent-definitions): add unified generate command`

---

### Task 6: Register commands in CLI

**Depends on:** Tasks 4, 5
**Files:** packages/cli/src/index.ts

1. Import and register both new commands in `createProgram()`:

   ```typescript
   import { createGenerateAgentDefinitionsCommand } from './commands/generate-agent-definitions';
   import { createGenerateCommand } from './commands/generate';
   // In createProgram():
   program.addCommand(createGenerateAgentDefinitionsCommand());
   program.addCommand(createGenerateCommand());
   ```

2. Add exports for new types:

   ```typescript
   export { generateAgentDefinitions } from './commands/generate-agent-definitions';
   export { generateAgentDefinition, AGENT_DESCRIPTIONS } from './agent-definitions/generator';
   export type { AgentDefinition } from './agent-definitions/generator';
   export { renderClaudeCodeAgent } from './agent-definitions/render-claude-code';
   export { renderGeminiAgent } from './agent-definitions/render-gemini-cli';
   ```

3. Run: `pnpm --filter @harness-engineering/cli test` to verify no regressions
4. Commit: `feat(agent-definitions): register commands and export types`

---

### Task 7: MCP tool — generate_agent_definitions

**Depends on:** Task 4
**Files:** packages/mcp-server/src/tools/agent-definitions.ts, packages/mcp-server/src/server.ts

1. Create `packages/mcp-server/src/tools/agent-definitions.ts`:

   ```typescript
   import { Ok } from '@harness-engineering/core';
   import { resultToMcpResponse } from '../utils/result-adapter.js';

   export const generateAgentDefinitionsDefinition = {
     name: 'generate_agent_definitions',
     description: 'Generate agent definition files from personas for Claude Code and Gemini CLI',
     inputSchema: {
       type: 'object' as const,
       properties: {
         global: { type: 'boolean', description: 'Write to global agent directory' },
         platform: {
           type: 'string',
           enum: ['claude-code', 'gemini-cli', 'all'],
           description: 'Target platform (default: all)',
         },
         dryRun: { type: 'boolean', description: 'Preview without writing' },
       },
     },
   };

   export async function handleGenerateAgentDefinitions(input: {
     global?: boolean;
     platform?: string;
     dryRun?: boolean;
   }) {
     const { generateAgentDefinitions } = await import('@harness-engineering/cli');
     const platforms =
       input.platform === 'all' || !input.platform
         ? (['claude-code', 'gemini-cli'] as const)
         : ([input.platform] as const);
     const results = generateAgentDefinitions({
       platforms: [...platforms],
       global: input.global ?? false,
       dryRun: input.dryRun ?? false,
     });
     return resultToMcpResponse(Ok(results));
   }
   ```

2. Register in `packages/mcp-server/src/server.ts` — add to TOOL_DEFINITIONS and TOOL_HANDLERS

3. Run: `pnpm --filter @harness-engineering/mcp-server test -- tests/tools/persona.test.ts` to verify no regressions
4. Commit: `feat(agent-definitions): add MCP tool for agent definition generation`

---

### Task 8: Integration test — end-to-end generation

**Depends on:** Task 6
**Files:** packages/cli/tests/agent-definitions/integration.test.ts (optional, covered by command test)

This is covered by the command tests in Task 4. Verify the full pipeline works:

1. Run `pnpm --filter @harness-engineering/cli test` — all tests pass
2. Run `pnpm format:check` — clean
3. Commit: (no separate commit — verification only)

---

### Task 9: Final verification and format

**Depends on:** all
**Files:** none (verification only)

1. Run: `pnpm --filter @harness-engineering/cli test` — all tests pass
2. Run: `pnpm format:check` — clean
3. Run: `pnpm --filter @harness-engineering/mcp-server test` — persona tests pass
4. Verify generated agent output manually: create a temp dir, run the generator, inspect the output

---

## Dependency Graph

```
Task 1 (generator) ──┬── Task 2 (claude renderer)  ──┐
                      ├── Task 3 (gemini renderer)  ──┼── Task 4 (CLI command) ── Task 5 (generate) ── Task 6 (register)
                      └──────────────────────────────-┘                          Task 7 (MCP tool) ──┘
```

**Parallelizable:** Tasks 2 and 3 after Task 1. Tasks 5 and 7 after Task 4.

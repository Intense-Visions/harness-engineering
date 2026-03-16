# Group C: Skill System Evolution Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the skill system with a cognitive-mode metadata field, a scaffolding CLI command, and two new skill patterns (error taxonomy, architecture advisor).

**Architecture:** C1 adds the `cognitive_mode` optional field to the skill schema (types + CLI validation + backfill). C2 adds `harness create-skill` interactive command. C3 and C4 create new skills that use the enriched metadata.

**Tech Stack:** TypeScript, Zod, Commander, YAML, Vitest, chalk

**Spec:** `docs/specs/2026-03-16-research-roadmap-design.md` (Group C section)

**Implementation order:** C1 -> C2 -> C3 -> C4

---

## Chunk 1: Cognitive-Mode Field in Skill Metadata (C1)

### Task 1: Add CognitiveMode type and SkillMetadata to packages/types

**Files:**
- Modify: `packages/types/src/index.ts`

- [ ] **Step 1: Write failing test for CognitiveMode type exports**

Create `packages/types/src/skill.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  STANDARD_COGNITIVE_MODES,
  type CognitiveMode,
  type SkillMetadata,
} from './index';

describe('CognitiveMode', () => {
  it('exports standard cognitive modes', () => {
    expect(STANDARD_COGNITIVE_MODES).toContain('adversarial-reviewer');
    expect(STANDARD_COGNITIVE_MODES).toContain('constructive-architect');
    expect(STANDARD_COGNITIVE_MODES).toContain('meticulous-implementer');
    expect(STANDARD_COGNITIVE_MODES).toContain('diagnostic-investigator');
    expect(STANDARD_COGNITIVE_MODES).toContain('advisory-guide');
    expect(STANDARD_COGNITIVE_MODES).toContain('meticulous-verifier');
    expect(STANDARD_COGNITIVE_MODES).toHaveLength(6);
  });

  it('CognitiveMode accepts standard modes', () => {
    const mode: CognitiveMode = 'adversarial-reviewer';
    expect(mode).toBe('adversarial-reviewer');
  });

  it('CognitiveMode accepts custom string values', () => {
    // CognitiveMode is string — custom values are valid
    const mode: CognitiveMode = 'my-custom-mode';
    expect(mode).toBe('my-custom-mode');
  });

  it('SkillMetadata has optional cognitive_mode field', () => {
    const withMode: SkillMetadata = {
      name: 'test-skill',
      version: '1.0.0',
      description: 'A test',
      cognitive_mode: 'adversarial-reviewer',
    };
    expect(withMode.cognitive_mode).toBe('adversarial-reviewer');

    const withoutMode: SkillMetadata = {
      name: 'test-skill',
      version: '1.0.0',
      description: 'A test',
    };
    expect(withoutMode.cognitive_mode).toBeUndefined();
  });
});
```

Run: `cd packages/types && npx vitest run src/skill.test.ts` — expect failure (types not yet exported).

- [ ] **Step 2: Add CognitiveMode and SkillMetadata types to packages/types/src/index.ts**

Append to `packages/types/src/index.ts` (after the existing `Placeholder` line):

```typescript
// --- Skill Metadata Types ---

/**
 * Standard cognitive modes for skills.
 * Custom string values are also accepted — this list is not exhaustive.
 */
export const STANDARD_COGNITIVE_MODES = [
  'adversarial-reviewer',
  'constructive-architect',
  'meticulous-implementer',
  'diagnostic-investigator',
  'advisory-guide',
  'meticulous-verifier',
] as const;

/**
 * Cognitive mode determines the behavioral stance of a skill.
 * Standard modes are recommended but any kebab-case string is valid.
 */
export type CognitiveMode = (typeof STANDARD_COGNITIVE_MODES)[number] | (string & {});

/**
 * Minimal skill metadata type for cross-package use.
 * The canonical Zod schema lives in @harness-engineering/cli — this type
 * captures the fields other packages need without coupling to Zod.
 */
export interface SkillMetadata {
  name: string;
  version: string;
  description: string;
  cognitive_mode?: CognitiveMode;
}
```

Run: `cd packages/types && npx vitest run src/skill.test.ts` — expect pass.

- [ ] **Step 3: Build types package**

Run: `cd packages/types && pnpm build` — expect success.

Commit: `feat(types): add CognitiveMode type and SkillMetadata interface`

### Task 2: Update CLI skill schema to accept cognitive_mode

**Files:**
- Modify: `packages/cli/src/skill/schema.ts`

- [ ] **Step 4: Write failing test for cognitive_mode in schema**

Create `packages/cli/tests/skill/schema.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { SkillMetadataSchema, ALLOWED_COGNITIVE_MODES } from '../../src/skill/schema';

describe('SkillMetadataSchema cognitive_mode', () => {
  const baseSkill = {
    name: 'test-skill',
    version: '1.0.0',
    description: 'A test skill',
    triggers: ['manual'],
    platforms: ['claude-code'],
    tools: ['Bash'],
    type: 'flexible',
  };

  it('accepts a skill without cognitive_mode (backward compatible)', () => {
    const result = SkillMetadataSchema.safeParse(baseSkill);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cognitive_mode).toBeUndefined();
    }
  });

  it('accepts a skill with a standard cognitive_mode', () => {
    const result = SkillMetadataSchema.safeParse({
      ...baseSkill,
      cognitive_mode: 'adversarial-reviewer',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cognitive_mode).toBe('adversarial-reviewer');
    }
  });

  it('accepts a skill with a custom cognitive_mode (kebab-case)', () => {
    const result = SkillMetadataSchema.safeParse({
      ...baseSkill,
      cognitive_mode: 'my-custom-mode',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cognitive_mode).toBe('my-custom-mode');
    }
  });

  it('rejects cognitive_mode that is not kebab-case', () => {
    const result = SkillMetadataSchema.safeParse({
      ...baseSkill,
      cognitive_mode: 'NotKebabCase',
    });
    expect(result.success).toBe(false);
  });

  it('exports ALLOWED_COGNITIVE_MODES list', () => {
    expect(ALLOWED_COGNITIVE_MODES).toContain('adversarial-reviewer');
    expect(ALLOWED_COGNITIVE_MODES).toContain('constructive-architect');
    expect(ALLOWED_COGNITIVE_MODES).toContain('meticulous-implementer');
    expect(ALLOWED_COGNITIVE_MODES).toContain('diagnostic-investigator');
    expect(ALLOWED_COGNITIVE_MODES).toContain('advisory-guide');
    expect(ALLOWED_COGNITIVE_MODES).toContain('meticulous-verifier');
    expect(ALLOWED_COGNITIVE_MODES).toHaveLength(6);
  });
});
```

Run: `cd packages/cli && npx vitest run tests/skill/schema.test.ts` — expect failure.

- [ ] **Step 5: Add cognitive_mode to SkillMetadataSchema**

In `packages/cli/src/skill/schema.ts`, add the cognitive mode constant and field:

After the `ALLOWED_PLATFORMS` line, add:

```typescript
export const ALLOWED_COGNITIVE_MODES = [
  'adversarial-reviewer',
  'constructive-architect',
  'meticulous-implementer',
  'diagnostic-investigator',
  'advisory-guide',
  'meticulous-verifier',
] as const;
```

In the `SkillMetadataSchema` z.object, add after the `depends_on` field:

```typescript
  cognitive_mode: z.string()
    .regex(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/, 'Cognitive mode must be kebab-case')
    .optional(),
```

Update the exported type at the bottom of the file:

```typescript
export type SkillMetadata = z.infer<typeof SkillMetadataSchema>;
```

(This type already exists — the inferred type now includes `cognitive_mode?: string`.)

Run: `cd packages/cli && npx vitest run tests/skill/schema.test.ts` — expect pass.

Commit: `feat(cli): add cognitive_mode field to skill schema validation`

### Task 3: Backfill existing skills with cognitive_mode

**Files:**
- Modify: 21 `skill.yaml` files under `agents/skills/claude-code/`

- [ ] **Step 6: Add cognitive_mode to all existing skill.yaml files**

Add the `cognitive_mode` field after `description` in each skill.yaml. The mapping:

| Skill | cognitive_mode |
|-------|---------------|
| `harness-code-review` | `adversarial-reviewer` |
| `harness-debugging` | `diagnostic-investigator` |
| `harness-planning` | `constructive-architect` |
| `harness-execution` | `meticulous-implementer` |
| `harness-verification` | `meticulous-verifier` |
| `harness-brainstorming` | `constructive-architect` |
| `harness-tdd` | `meticulous-implementer` |
| `harness-refactoring` | `meticulous-implementer` |
| `harness-git-workflow` | `meticulous-verifier` |
| `harness-onboarding` | `advisory-guide` |
| `harness-parallel-agents` | `constructive-architect` |
| `harness-skill-authoring` | `constructive-architect` |
| `harness-state-management` | `meticulous-implementer` |
| `initialize-harness-project` | `constructive-architect` |
| `add-harness-component` | `constructive-architect` |
| `align-documentation` | `meticulous-verifier` |
| `check-mechanical-constraints` | `meticulous-verifier` |
| `cleanup-dead-code` | `diagnostic-investigator` |
| `detect-doc-drift` | `diagnostic-investigator` |
| `enforce-architecture` | `meticulous-verifier` |
| `validate-context-engineering` | `meticulous-verifier` |

For each file, insert `cognitive_mode: <value>` on the line immediately after the `description:` line.

Example — `agents/skills/claude-code/harness-code-review/skill.yaml` becomes:

```yaml
name: harness-code-review
version: "1.0.0"
description: Structured code review with automated harness checks
cognitive_mode: adversarial-reviewer
triggers:
  - manual
  - on_pr
  - on_review
# ... rest unchanged
```

- [ ] **Step 7: Run harness validate to confirm all skills pass**

Run: `cd /Users/cwarner/Projects/harness-engineering && npx harness skill validate` (or `pnpm --filter @harness-engineering/cli exec harness skill validate`) — expect all 21 skills pass.

Commit: `feat(skills): backfill cognitive_mode across all 21 existing skills`

---

## Chunk 2: Skill Scaffolding CLI Command (C2)

### Task 4: Create the create-skill command

**Files:**
- Create: `packages/cli/src/commands/create-skill.ts`
- Modify: `packages/cli/src/index.ts`

- [ ] **Step 8: Write failing test for create-skill command registration**

Create `packages/cli/tests/commands/create-skill.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { createCreateSkillCommand } from '../../src/commands/create-skill';

describe('create-skill command', () => {
  it('creates a command named create-skill', () => {
    const cmd = createCreateSkillCommand();
    expect(cmd.name()).toBe('create-skill');
  });

  it('has required options', () => {
    const cmd = createCreateSkillCommand();
    const optionNames = cmd.options.map((o) => o.long);
    expect(optionNames).toContain('--name');
    expect(optionNames).toContain('--description');
    expect(optionNames).toContain('--cognitive-mode');
  });
});

describe('create-skill file generation', () => {
  const tmpDir = path.join(process.cwd(), '.test-tmp-create-skill');
  const skillsDir = path.join(tmpDir, 'agents', 'skills', 'claude-code');

  beforeEach(() => {
    fs.mkdirSync(skillsDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('generates skill.yaml with correct fields', async () => {
    const { generateSkillFiles } = await import('../../src/commands/create-skill');
    generateSkillFiles({
      name: 'my-test-skill',
      description: 'A test skill for validation',
      cognitiveMode: 'diagnostic-investigator',
      reads: ['src/**/*.ts', 'docs/**/*.md'],
      produces: 'diagnostic report',
      checks: { pre: ['pnpm typecheck'], post: ['pnpm test'] },
      outputDir: skillsDir,
    });

    const yamlPath = path.join(skillsDir, 'my-test-skill', 'skill.yaml');
    expect(fs.existsSync(yamlPath)).toBe(true);

    const content = fs.readFileSync(yamlPath, 'utf-8');
    expect(content).toContain('name: my-test-skill');
    expect(content).toContain('cognitive_mode: diagnostic-investigator');
    expect(content).toContain('A test skill for validation');
  });

  it('generates SKILL.md with required sections', async () => {
    const { generateSkillFiles } = await import('../../src/commands/create-skill');
    generateSkillFiles({
      name: 'my-test-skill',
      description: 'A test skill for validation',
      cognitiveMode: 'advisory-guide',
      reads: [],
      produces: 'advice',
      checks: { pre: [], post: [] },
      outputDir: skillsDir,
    });

    const mdPath = path.join(skillsDir, 'my-test-skill', 'SKILL.md');
    expect(fs.existsSync(mdPath)).toBe(true);

    const content = fs.readFileSync(mdPath, 'utf-8');
    expect(content).toContain('# my-test-skill');
    expect(content).toContain('## When to Use');
    expect(content).toContain('## Process');
    expect(content).toContain('## Harness Integration');
    expect(content).toContain('## Success Criteria');
    expect(content).toContain('## Examples');
    expect(content).toContain('## Deterministic Checks');
    expect(content).toContain('Cognitive Mode: advisory-guide');
  });

  it('does not overwrite existing skill directory', async () => {
    const { generateSkillFiles } = await import('../../src/commands/create-skill');
    const existingDir = path.join(skillsDir, 'my-test-skill');
    fs.mkdirSync(existingDir, { recursive: true });
    fs.writeFileSync(path.join(existingDir, 'skill.yaml'), 'existing');

    expect(() =>
      generateSkillFiles({
        name: 'my-test-skill',
        description: 'Overwrite attempt',
        cognitiveMode: 'advisory-guide',
        reads: [],
        produces: '',
        checks: { pre: [], post: [] },
        outputDir: skillsDir,
      })
    ).toThrow(/already exists/);
  });
});
```

Run: `cd packages/cli && npx vitest run tests/commands/create-skill.test.ts` — expect failure.

- [ ] **Step 9: Implement create-skill command**

Create `packages/cli/src/commands/create-skill.ts`:

```typescript
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { stringify } from 'yaml';
import chalk from 'chalk';
import { ALLOWED_COGNITIVE_MODES } from '../skill/schema';
import { logger } from '../output/logger';
import { ExitCode } from '../utils/errors';
import { resolveSkillsDir } from '../utils/paths';

export interface CreateSkillOptions {
  name: string;
  description: string;
  cognitiveMode: string;
  reads: string[];
  produces: string;
  checks: { pre: string[]; post: string[] };
  outputDir?: string;
}

export function generateSkillFiles(opts: CreateSkillOptions): void {
  const outputDir = opts.outputDir ?? resolveSkillsDir();
  const skillDir = path.join(outputDir, opts.name);

  if (fs.existsSync(skillDir) && fs.readdirSync(skillDir).length > 0) {
    throw new Error(`Skill directory already exists: ${skillDir}`);
  }

  fs.mkdirSync(skillDir, { recursive: true });

  // Generate skill.yaml
  const metadata: Record<string, unknown> = {
    name: opts.name,
    version: '1.0.0',
    description: opts.description,
    cognitive_mode: opts.cognitiveMode,
    triggers: ['manual'],
    platforms: ['claude-code'],
    tools: ['Bash', 'Read', 'Glob', 'Grep'],
    cli: {
      command: `harness skill run ${opts.name}`,
      args: [
        { name: 'path', description: 'Project root path', required: false },
      ],
    },
    mcp: {
      tool: 'run_skill',
      input: { skill: opts.name, path: 'string' },
    },
    type: 'flexible',
    state: { persistent: false, files: [] },
    depends_on: [],
  };

  const yamlContent = stringify(metadata, { lineWidth: 120 });
  fs.writeFileSync(path.join(skillDir, 'skill.yaml'), yamlContent, 'utf-8');

  // Generate SKILL.md
  const checksSection = buildChecksSection(opts.checks);
  const readsSection = opts.reads.length > 0
    ? opts.reads.map((r) => `- \`${r}\``).join('\n')
    : '- *(define glob patterns for files this skill reads)*';

  const skillMd = `# ${opts.name}

> Cognitive Mode: ${opts.cognitiveMode}

${opts.description}

## When to Use

- *(describe the situations where this skill should be invoked)*

## Context Assembly

**Files read:**
${readsSection}

**Produces:** ${opts.produces || '*(describe what this skill outputs)*'}

## Deterministic Checks

${checksSection}

## Process

1. *(define the step-by-step process)*

## Harness Integration

- Follows harness engineering principles
- Uses deterministic-first approach (mechanical checks before LLM reasoning)

## Success Criteria

- [ ] *(define measurable success criteria)*

## Examples

### Example 1

*(provide a concrete usage example)*
`;

  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillMd, 'utf-8');
}

function buildChecksSection(checks: { pre: string[]; post: string[] }): string {
  const lines: string[] = [];

  lines.push('**Pre-execution:**');
  if (checks.pre.length > 0) {
    for (const c of checks.pre) lines.push(`- \`${c}\``);
  } else {
    lines.push('- *(none defined)*');
  }

  lines.push('');
  lines.push('**Post-execution:**');
  if (checks.post.length > 0) {
    for (const c of checks.post) lines.push(`- \`${c}\``);
  } else {
    lines.push('- *(none defined)*');
  }

  return lines.join('\n');
}

export function createCreateSkillCommand(): Command {
  return new Command('create-skill')
    .description('Scaffold a new skill with skill.yaml and SKILL.md')
    .requiredOption('--name <name>', 'Skill name (kebab-case)')
    .requiredOption('--description <desc>', 'One-line description')
    .option(
      '--cognitive-mode <mode>',
      `Cognitive mode (${ALLOWED_COGNITIVE_MODES.join(', ')}, or custom)`,
      'constructive-architect'
    )
    .option('--reads <patterns...>', 'Glob patterns for files the skill reads')
    .option('--produces <output>', 'What the skill produces')
    .option('--pre-checks <commands...>', 'Pre-execution mechanical checks')
    .option('--post-checks <commands...>', 'Post-execution mechanical checks')
    .action(async (opts) => {
      // Validate name is kebab-case
      if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(opts.name)) {
        logger.error('Skill name must be kebab-case (e.g., my-skill-name)');
        process.exit(ExitCode.ERROR);
        return;
      }

      try {
        generateSkillFiles({
          name: opts.name,
          description: opts.description,
          cognitiveMode: opts.cognitiveMode,
          reads: opts.reads ?? [],
          produces: opts.produces ?? '',
          checks: {
            pre: opts.preChecks ?? [],
            post: opts.postChecks ?? [],
          },
        });

        logger.success(`Skill scaffolded: agents/skills/claude-code/${opts.name}/`);
        console.log(chalk.dim('  - skill.yaml'));
        console.log(chalk.dim('  - SKILL.md'));
        console.log('');
        console.log(`Next: edit ${chalk.bold('SKILL.md')} to define your skill's process.`);
        console.log(`Validate: ${chalk.bold(`harness skill validate`)}`);
      } catch (e) {
        logger.error(e instanceof Error ? e.message : String(e));
        process.exit(ExitCode.ERROR);
      }
    });
}
```

- [ ] **Step 10: Register create-skill command in CLI index**

In `packages/cli/src/index.ts`, add the import and registration:

After the existing import for `createStateCommand`, add:

```typescript
import { createCreateSkillCommand } from './commands/create-skill';
```

In `createProgram()`, after `program.addCommand(createStateCommand());`, add:

```typescript
  program.addCommand(createCreateSkillCommand());
```

Run: `cd packages/cli && npx vitest run tests/commands/create-skill.test.ts` — expect pass.

- [ ] **Step 11: Run full CLI test suite to confirm no regressions**

Run: `cd packages/cli && pnpm test` — expect all tests pass.

Commit: `feat(cli): add harness create-skill scaffolding command`

---

## Chunk 3: Error Taxonomy Skill (C3)

### Task 5: Create harness-diagnostics skill

**Files:**
- Create: `agents/skills/claude-code/harness-diagnostics/skill.yaml`
- Create: `agents/skills/claude-code/harness-diagnostics/SKILL.md`

- [ ] **Step 12: Create harness-diagnostics/skill.yaml**

Create `agents/skills/claude-code/harness-diagnostics/skill.yaml`:

```yaml
name: harness-diagnostics
version: "1.0.0"
description: Classify errors into taxonomy categories and route to resolution strategies
cognitive_mode: diagnostic-investigator
triggers:
  - manual
  - on_bug_fix
platforms:
  - claude-code
  - gemini-cli
tools:
  - Bash
  - Read
  - Glob
  - Grep
  - Edit
  - Write
cli:
  command: harness skill run harness-diagnostics
  args:
    - name: path
      description: Project root path
      required: false
    - name: error
      description: Error message or description to diagnose
      required: false
mcp:
  tool: run_skill
  input:
    skill: harness-diagnostics
    path: string
type: rigid
phases:
  - name: classify
    description: Categorize the error into one of 7 taxonomy categories
    required: true
  - name: route
    description: Apply the resolution strategy for the error category
    required: true
  - name: resolve
    description: Execute the resolution and verify the fix
    required: true
  - name: record
    description: Record findings in anti-pattern log if initial approach failed
    required: false
state:
  persistent: true
  files:
    - .harness/diagnostics/
depends_on: []
```

- [ ] **Step 13: Create harness-diagnostics/SKILL.md**

Create `agents/skills/claude-code/harness-diagnostics/SKILL.md`:

```markdown
# harness-diagnostics

> Cognitive Mode: diagnostic-investigator

Classify errors into taxonomy categories and route to the appropriate resolution strategy. This skill adds a structured classification layer on top of general debugging — instead of ad-hoc investigation, every error is first categorized, then handled with a category-specific playbook.

## When to Use

- An error occurs during development, testing, or CI and the cause is not immediately obvious
- A bug report needs systematic investigation
- You want to ensure the resolution approach matches the error type (not every problem is a code fix)
- After a failed debugging attempt, to re-classify and try a different strategy

## Error Taxonomy

### Category 1: Syntax/Type
**Signals:** Compilation failure, TypeScript error, parse error, type mismatch
**Resolution:** Read error output line/column, locate file, apply mechanical fix. Run typecheck to confirm.

### Category 2: Logic
**Signals:** Wrong output, incorrect behavior, test assertion failure, off-by-one, wrong condition
**Resolution:** Write a failing test that captures the expected behavior FIRST. Then investigate the logic path, fix, and confirm test passes.

### Category 3: Design
**Signals:** Architectural issue, wrong abstraction, coupling, violation of separation of concerns
**Resolution:** Escalate to human architect (advisory mode). Do NOT attempt to refactor without approval. Document the design concern and proposed alternatives.

### Category 4: Performance
**Signals:** Slow response, high memory usage, timeout, O(n^2) patterns
**Resolution:** Profile FIRST (measure, do not guess). Identify the hot path. Optimize only the measured bottleneck. Verify with before/after benchmarks.

### Category 5: Security
**Signals:** Vulnerability report, unsafe input handling, credential exposure, injection risk
**Resolution:** Check against OWASP top 10. Apply the minimal fix. Verify the fix does not introduce regressions. Flag for security review.

### Category 6: Environment
**Signals:** Dependency version mismatch, missing config, platform-specific failure, permission denied, CI-only failure
**Resolution:** Check versions (`node -v`, `pnpm -v`, dependency lockfile). Compare local vs. CI environment. Fix config/dependency, not code (unless code has a hard dependency on a specific version).

### Category 7: Flaky
**Signals:** Intermittent failure, passes locally but fails in CI, timing-dependent, race condition
**Resolution:** Isolate the timing dependency. Look for shared mutable state, uncontrolled async, or missing awaits. Add deterministic synchronization or retry with backoff. Never suppress with `.skip`.

## Context Assembly

**Files read:**
- Error output / stack trace (provided by user or captured from terminal)
- `src/**/*.ts` — source files referenced in stack trace
- `tests/**/*.test.ts` — test files related to failing code
- `.harness/anti-patterns.md` — prior failed approaches (if exists)
- `.harness/diagnostics/` — prior diagnostic sessions (if exists)

**Produces:** Diagnosis report with category, root cause, resolution applied, and verification result.

## Deterministic Checks

**Pre-execution:**
- `pnpm typecheck` — capture current type errors
- `pnpm test` — capture current test failures

**Post-execution:**
- `pnpm typecheck` — confirm no new type errors introduced
- `pnpm test` — confirm fix resolves the issue and introduces no regressions

## Process

1. **Collect evidence:** Gather the error message, stack trace, and any reproduction steps.
2. **Classify:** Match the error signals against the 7 categories above. If signals match multiple categories, pick the most specific one (e.g., a type error in a performance-critical path is Category 1, not Category 4).
3. **Route:** Follow the resolution strategy for the matched category exactly. Do NOT skip steps (e.g., do not skip profiling for performance issues).
4. **Resolve:** Apply the fix following the category-specific playbook.
5. **Verify:** Run deterministic post-checks. If the fix does not resolve the issue, re-classify — the initial category may have been wrong.
6. **Record:** If the first approach failed, append to `.harness/anti-patterns.md` with what was tried, why it failed, and what worked instead.

## Harness Integration

- Follows harness engineering principles
- Uses deterministic-first approach: mechanical checks bracket LLM reasoning
- Builds on `harness-debugging` but adds the classification/routing layer
- Writes to `.harness/anti-patterns.md` following the convention from Group B3
- Reads prior diagnostics from `.harness/diagnostics/` for pattern recognition

## Success Criteria

- [ ] Error is classified into exactly one of the 7 categories
- [ ] Resolution strategy matches the category playbook
- [ ] Post-execution checks pass (typecheck + tests)
- [ ] If initial approach failed, it is recorded in anti-pattern log

## Gates

- Classification must be explicit — the skill must state the category before proceeding
- Category 3 (Design) MUST escalate to human — the skill must NOT attempt architectural refactoring

## Escalation

- If error does not fit any category, escalate to human with evidence collected
- If resolution fails after 2 attempts with different strategies, escalate to human
- Category 3 (Design) always escalates — skill documents but does not fix

## Examples

### Example 1: Type Error

**Input:** `error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.`

**Classification:** Category 1 — Syntax/Type

**Resolution:**
1. Read the error: file `src/utils/calc.ts`, line 42
2. Inspect the function signature — expects `number`, caller passes `string`
3. Fix: add `parseInt()` or fix the caller's type
4. Run `pnpm typecheck` — passes
5. Run `pnpm test` — passes

### Example 2: Flaky Test

**Input:** `test "handles concurrent requests" — FAIL (timeout) — passes on retry`

**Classification:** Category 7 — Flaky

**Resolution:**
1. Isolate: look for missing `await`, shared state, or `setTimeout` without control
2. Found: test uses `setTimeout(100)` for debounce — timing varies in CI
3. Fix: replace with `vi.useFakeTimers()` and `vi.advanceTimersByTime(100)`
4. Run test 10x — passes consistently
5. Record: no anti-pattern (first approach worked)
```

- [ ] **Step 14: Validate the new skill**

Run: `cd /Users/cwarner/Projects/harness-engineering && pnpm --filter @harness-engineering/cli exec harness skill validate` — expect harness-diagnostics passes validation along with all others.

Commit: `feat(skills): add harness-diagnostics error taxonomy skill (C3)`

---

## Chunk 4: Architecture Advisor Skill (C4)

### Task 6: Create harness-architecture-advisor skill

**Files:**
- Create: `agents/skills/claude-code/harness-architecture-advisor/skill.yaml`
- Create: `agents/skills/claude-code/harness-architecture-advisor/SKILL.md`

- [ ] **Step 15: Create harness-architecture-advisor/skill.yaml**

Create `agents/skills/claude-code/harness-architecture-advisor/skill.yaml`:

```yaml
name: harness-architecture-advisor
version: "1.0.0"
description: Interactive architecture advisor that surfaces trade-offs and helps humans choose
cognitive_mode: advisory-guide
triggers:
  - manual
  - on_new_feature
platforms:
  - claude-code
  - gemini-cli
tools:
  - Read
  - Glob
  - Grep
  - Bash
cli:
  command: harness skill run harness-architecture-advisor
  args:
    - name: path
      description: Project root path
      required: false
    - name: topic
      description: "Architecture topic (e.g., api-design, data-modeling, decomposition)"
      required: false
mcp:
  tool: run_skill
  input:
    skill: harness-architecture-advisor
    path: string
type: flexible
phases:
  - name: discover
    description: Ask questions about the problem space and constraints
    required: true
  - name: analyze
    description: Research the codebase and identify relevant patterns
    required: true
  - name: propose
    description: Present 2-3 architectural options with trade-offs
    required: true
  - name: document
    description: Write an Architecture Decision Record for the chosen option
    required: true
state:
  persistent: true
  files:
    - .harness/architecture/
depends_on: []
```

- [ ] **Step 16: Create harness-architecture-advisor/SKILL.md**

Create `agents/skills/claude-code/harness-architecture-advisor/SKILL.md`:

```markdown
# harness-architecture-advisor

> Cognitive Mode: advisory-guide

Interactive architecture advisor that helps humans make informed design decisions. This skill asks questions, researches the codebase, presents trade-off analyses, and helps document decisions. It does NOT make decisions or execute changes — it surfaces options and defers the final choice to the human architect.

## When to Use

- Starting a new feature that requires architectural decisions
- Choosing between technologies, patterns, or approaches
- Decomposing a system into components
- Designing APIs or data models
- Evaluating whether to refactor vs. extend existing architecture
- Any decision where trade-offs need to be explicitly surfaced

## Context Assembly

**Files read:**
- `docs/specs/**/*.md` — existing specs and design documents
- `docs/standard/**/*.md` — project principles and conventions
- `AGENTS.md` — project structure and architecture overview
- `harness.config.json` — layer definitions and architectural constraints
- `src/**/*.ts` — source code relevant to the decision area
- `.harness/architecture/` — prior architecture decisions (if exists)

**Produces:** Architecture Decision Record (ADR) documenting the decision, alternatives considered, and rationale.

## Deterministic Checks

**Pre-execution:**
- *(none — this is a pure advisory skill, no code changes)*

**Post-execution:**
- Validate ADR follows the template structure
- Confirm the ADR references specific files/components (not vague generalities)

## Process

### Phase 1: Discover

Ask the human architect these questions (adapt to context):

1. **Problem space:** What are you building? What problem does it solve?
2. **Consumers:** Who/what consumes this component? (users, other services, internal modules)
3. **Constraints:** What are the hard constraints?
   - Performance requirements (latency, throughput)
   - Compatibility requirements (existing APIs, data formats)
   - Team expertise (familiar technologies vs. learning curve)
   - Timeline (quick solution vs. long-term investment)
4. **Scale:** What is the expected scale? (data volume, concurrent users, growth trajectory)
5. **Existing patterns:** Are there existing patterns in the codebase that should be followed or deliberately broken from?

Do NOT proceed to Phase 2 until the human has answered or explicitly deferred these questions.

### Phase 2: Analyze

1. Read the codebase to understand current architecture patterns
2. Identify relevant existing components, interfaces, and data flows
3. Check for constraints defined in `harness.config.json` (layer boundaries, allowed dependencies)
4. Review prior ADRs in `.harness/architecture/` for consistency
5. Note any existing technical debt that affects the decision

### Phase 3: Propose

Present 2-3 architectural options. For each option:

```
### Option [N]: [Name]

**Approach:** [1-2 sentence summary]

**How it works:**
- [key implementation details]

**Pros:**
- [concrete benefit with evidence from codebase analysis]

**Cons:**
- [concrete drawback with specific impact]

**Fits when:**
- [conditions where this option is best]

**Effort:** [rough estimate: small/medium/large]
```

After presenting options, explicitly ask: "Which option do you prefer, or would you like to explore a different direction?"

Do NOT proceed to Phase 4 without the human's choice.

### Phase 4: Document

Write an Architecture Decision Record:

```markdown
# ADR: [Title]

**Date:** [YYYY-MM-DD]
**Status:** Accepted
**Decision makers:** [human architect name if known]

## Context

[Problem space and constraints from Phase 1]

## Decision

[The chosen option and why]

## Alternatives Considered

[Other options from Phase 3 with brief rationale for rejection]

## Consequences

### Positive
- [benefits of the decision]

### Negative
- [trade-offs accepted]

### Risks
- [potential future issues to monitor]

## Action Items

- [ ] [specific next steps to implement the decision]
```

Save the ADR to `.harness/architecture/[YYYY-MM-DD]-[topic].md`.

## Harness Integration

- Follows harness engineering principles
- Advisory mode: asks questions and surfaces trade-offs, does NOT execute
- Respects architectural constraints defined in `harness.config.json`
- Outputs structured ADR that other skills can reference
- Connects to the human-architect model — the skill is a thinking partner, not a decision maker

## Success Criteria

- [ ] All 5 discovery questions are asked (or explicitly deferred by human)
- [ ] At least 2 options are presented with concrete trade-offs
- [ ] Human makes an explicit choice before documentation proceeds
- [ ] ADR follows the template structure with all sections filled
- [ ] ADR references specific files, components, or interfaces (not abstract generalities)

## Gates

- Phase 1 -> Phase 2: Human has responded to discovery questions
- Phase 3 -> Phase 4: Human has chosen an option

## Escalation

- If the problem space is too broad, ask the human to narrow scope
- If constraints conflict (e.g., "must be fast AND must use technology X which is slow"), surface the conflict explicitly and ask the human to prioritize
- If no option is clearly better, say so — present the trade-off matrix and let the human decide

## Examples

### Example 1: API Design Decision

**Topic:** "Should our new notification service use REST or event-driven architecture?"

**Phase 1 — Discovery:**
- Building a notification system for 3 internal services
- Consumers: user-service, billing-service, admin-dashboard
- Constraints: must handle 1000 notifications/min, team knows Express well
- Existing patterns: all current services use REST

**Phase 3 — Options:**
1. REST endpoints (familiar, simple, synchronous)
2. Event bus with Redis pub/sub (decoupled, async, moderate learning curve)
3. Hybrid: REST for admin, events for service-to-service (best of both, more complexity)

**Phase 4 — ADR:** Documents Option 3 chosen because it balances familiarity for the admin dashboard with decoupling for inter-service communication.

### Example 2: Component Decomposition

**Topic:** "The user module has grown to 2000 lines — how should we split it?"

**Phase 2 — Analysis:** Found 4 distinct concerns: authentication, profile management, permissions, and preferences. Current coupling is through a shared UserService class.

**Phase 3 — Options:**
1. Split into 4 modules with shared types (clean, most work)
2. Extract auth + permissions into a separate module, keep profile + preferences together (moderate effort, addresses the main pain point)
3. Keep single module but split into sub-files with a barrel export (least disruption, doesn't fix coupling)
```

- [ ] **Step 17: Validate the new skill**

Run: `cd /Users/cwarner/Projects/harness-engineering && pnpm --filter @harness-engineering/cli exec harness skill validate` — expect harness-architecture-advisor passes validation along with all others.

Commit: `feat(skills): add harness-architecture-advisor interactive advisor skill (C4)`

---

## Chunk 5: Final Validation

### Task 7: End-to-end validation

- [ ] **Step 18: Run full test suite**

Run: `cd /Users/cwarner/Projects/harness-engineering && pnpm test` — expect all packages pass.

- [ ] **Step 19: Build all packages**

Run: `cd /Users/cwarner/Projects/harness-engineering && pnpm build` — expect success.

- [ ] **Step 20: Validate all skills including new ones**

Run: `cd /Users/cwarner/Projects/harness-engineering && pnpm --filter @harness-engineering/cli exec harness skill validate` — expect 23 skills pass (21 original + harness-diagnostics + harness-architecture-advisor).

- [ ] **Step 21: Smoke test create-skill command**

Run:
```bash
cd /tmp && mkdir test-create-skill && cd test-create-skill
mkdir -p agents/skills/claude-code
pnpm --filter @harness-engineering/cli exec harness create-skill \
  --name smoke-test-skill \
  --description "Smoke test for scaffolding" \
  --cognitive-mode constructive-architect
```

Verify `skill.yaml` and `SKILL.md` are generated with correct content. Clean up the temp directory.

Commit: (no commit needed — this is validation only)

Final commit: `feat: complete Group C — Skill System Evolution (C1-C4)`

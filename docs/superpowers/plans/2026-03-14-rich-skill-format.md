# Rich Skill Format & Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the skill system to a rich format (skill.yaml + SKILL.md), add state management infrastructure, CLI `harness skill` commands, MCP `run_skill` tool, and create all 21 skill stubs.

**Architecture:** Replace existing `SkillMetadataSchema` with expanded schema supporting CLI/MCP bindings, behavioral types, phases, and state management. Add `HarnessState` API to core library. Add `harness skill` and `harness state` CLI command groups. Add `run_skill` MCP tool. Migrate 11 existing skills and create 10 new skill directories, all with SKILL.md stubs.

**Tech Stack:** TypeScript, Zod, yaml, Commander.js, `@modelcontextprotocol/sdk`, Vitest

**Spec:** [2026-03-14-rich-skill-format-design.md](../specs/2026-03-14-rich-skill-format-design.md)

---

## File Structure

### Schema & Validation (modify existing)

```
agents/skills/tests/
├── schema.ts              # REWRITE: New SkillMetadataSchema (Zod)
├── schema.test.ts         # REWRITE: Tests for new schema
├── structure.test.ts      # NEW: SKILL.md required section linting (replaces prompt-lint.test.ts)
├── references.test.ts     # NEW: depends_on + cross-references (replaces includes.test.ts)
├── prompt-lint.test.ts    # DELETE
└── includes.test.ts       # DELETE
```

### State Management (new in core)

```
packages/core/src/state/
├── types.ts               # HarnessState interface + Zod schema
├── state-manager.ts       # loadState, saveState, appendLearning
└── index.ts               # Re-exports
packages/core/tests/state/
├── types.test.ts
└── state-manager.test.ts
```

### CLI Commands (new)

```
packages/cli/src/commands/skill/
├── index.ts               # Parent: harness skill
├── list.ts                # harness skill list
├── run.ts                 # harness skill run <name>
├── validate.ts            # harness skill validate
└── info.ts                # harness skill info <name>
packages/cli/src/commands/state/
├── index.ts               # Parent: harness state
├── show.ts                # harness state show
├── reset.ts               # harness state reset
└── learn.ts               # harness state learn <message>
```

### MCP Tool (new)

```
packages/mcp-server/src/tools/
└── skill.ts               # run_skill tool
```

### Skill Directories (migrate + new)

```
agents/skills/claude-code/
├── validate-context-engineering/   # MIGRATE: skill.yaml + SKILL.md (replaces prompt.md + README.md)
├── enforce-architecture/           # MIGRATE
├── check-mechanical-constraints/   # MIGRATE
├── harness-tdd/                    # MIGRATE
├── harness-code-review/            # MIGRATE
├── harness-refactoring/            # MIGRATE
├── detect-doc-drift/               # MIGRATE
├── cleanup-dead-code/              # MIGRATE
├── align-documentation/            # MIGRATE
├── initialize-harness-project/     # MIGRATE
├── add-harness-component/          # MIGRATE
├── harness-brainstorming/          # NEW
├── harness-debugging/              # NEW
├── harness-planning/               # NEW
├── harness-verification/           # NEW
├── harness-parallel-agents/        # NEW
├── harness-execution/              # NEW
├── harness-git-workflow/           # NEW
├── harness-skill-authoring/        # NEW
├── harness-onboarding/             # NEW
└── harness-state-management/       # NEW
```

**Modified files:**
- `packages/cli/src/index.ts` — Register skill + state commands
- `packages/core/src/index.ts` — Export state module
- `packages/mcp-server/src/server.ts` — Register run_skill tool

**Deleted files:**
- `agents/skills/tests/prompt-lint.test.ts`
- `agents/skills/tests/includes.test.ts`
- `agents/skills/shared/` directory (fragments inlined into SKILL.md)
- All `prompt.md` and `README.md` files in existing skill directories

---

## Chunk 1: Schema & Validation

### Task 1: New SkillMetadataSchema

**Files:**
- Rewrite: `agents/skills/tests/schema.ts`
- Rewrite: `agents/skills/tests/schema.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// agents/skills/tests/schema.test.ts
import { describe, it, expect } from 'vitest';
import { SkillMetadataSchema } from './schema';

describe('SkillMetadataSchema', () => {
  const validSkill = {
    name: 'harness-tdd',
    version: '1.0.0',
    description: 'Test-driven development integrated with harness validation',
    triggers: ['manual', 'on_new_feature', 'on_bug_fix'],
    platforms: ['claude-code', 'gemini-cli'],
    tools: ['Bash', 'Read', 'Write', 'Edit'],
    type: 'rigid',
  };

  it('validates a complete skill.yaml', () => {
    const result = SkillMetadataSchema.safeParse(validSkill);
    expect(result.success).toBe(true);
  });

  it('validates with all optional fields', () => {
    const full = {
      ...validSkill,
      cli: {
        command: 'harness skill run harness-tdd',
        args: [{ name: 'path', description: 'Project root', required: false }],
      },
      mcp: { tool: 'run_skill', input: { skill: 'harness-tdd', path: 'string' } },
      phases: [
        { name: 'red', description: 'Write failing test' },
        { name: 'green', description: 'Implement minimal code' },
      ],
      state: { persistent: true, files: ['.harness/state.json'] },
      depends_on: ['harness-verification'],
    };
    const result = SkillMetadataSchema.safeParse(full);
    expect(result.success).toBe(true);
  });

  it('applies defaults for optional fields', () => {
    const result = SkillMetadataSchema.parse(validSkill);
    expect(result.state).toEqual({ persistent: false, files: [] });
    expect(result.depends_on).toEqual([]);
  });

  it('rejects invalid name format', () => {
    const result = SkillMetadataSchema.safeParse({ ...validSkill, name: 'Invalid Name' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid platform', () => {
    const result = SkillMetadataSchema.safeParse({ ...validSkill, platforms: ['invalid'] });
    expect(result.success).toBe(false);
  });

  it('rejects invalid trigger', () => {
    const result = SkillMetadataSchema.safeParse({ ...validSkill, triggers: ['on_deploy'] });
    expect(result.success).toBe(false);
  });

  it('rejects invalid type', () => {
    const result = SkillMetadataSchema.safeParse({ ...validSkill, type: 'optional' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid version format', () => {
    const result = SkillMetadataSchema.safeParse({ ...validSkill, version: '1' });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agents/skills && npx vitest run tests/schema.test.ts`
Expected: FAIL — new fields not in schema

- [ ] **Step 3: Rewrite schema.ts**

```typescript
// agents/skills/tests/schema.ts
import { z } from 'zod';

const SkillPhaseSchema = z.object({
  name: z.string(),
  description: z.string(),
});

const SkillCliSchema = z.object({
  command: z.string(),
  args: z.array(z.object({
    name: z.string(),
    description: z.string(),
    required: z.boolean().default(false),
  })).default([]),
});

const SkillMcpSchema = z.object({
  tool: z.string(),
  input: z.record(z.string()),
});

const SkillStateSchema = z.object({
  persistent: z.boolean().default(false),
  files: z.array(z.string()).default([]),
});

const ALLOWED_TRIGGERS = [
  'manual', 'on_pr', 'on_commit', 'on_new_feature',
  'on_bug_fix', 'on_refactor', 'on_project_init', 'on_review',
] as const;

const ALLOWED_PLATFORMS = ['claude-code', 'gemini-cli'] as const;

export const SkillMetadataSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9-]*$/, 'Name must be lowercase with hyphens'),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must be semver format'),
  description: z.string().min(10).max(200),
  triggers: z.array(z.enum(ALLOWED_TRIGGERS)),
  platforms: z.array(z.enum(ALLOWED_PLATFORMS)),
  tools: z.array(z.string()),
  cli: SkillCliSchema.optional(),
  mcp: SkillMcpSchema.optional(),
  type: z.enum(['rigid', 'flexible']),
  phases: z.array(SkillPhaseSchema).optional(),
  state: SkillStateSchema.default({}),
  depends_on: z.array(z.string()).default([]),
});

export type SkillMetadata = z.infer<typeof SkillMetadataSchema>;

// Re-export sub-schemas for use in tests
export { ALLOWED_TRIGGERS, ALLOWED_PLATFORMS };
export type { SkillPhaseSchema, SkillCliSchema, SkillMcpSchema, SkillStateSchema };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agents/skills && npx vitest run tests/schema.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add agents/skills/tests/schema.ts agents/skills/tests/schema.test.ts
git commit -m "feat(skills): rewrite SkillMetadataSchema for rich skill format"
```

---

### Task 2: SKILL.md Structure Linter

**Files:**
- Create: `agents/skills/tests/structure.test.ts`
- Delete: `agents/skills/tests/prompt-lint.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// agents/skills/tests/structure.test.ts
import { describe, it, expect } from 'vitest';
import { glob } from 'glob';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'yaml';
import { SkillMetadataSchema } from './schema';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = resolve(__dirname, '..');

const REQUIRED_SECTIONS = ['## When to Use', '## Process', '## Harness Integration', '## Success Criteria', '## Examples'];
const RIGID_SECTIONS = ['## Gates', '## Escalation'];

describe('SKILL.md structure', () => {
  const skillMdFiles = glob.sync('**/SKILL.md', {
    cwd: SKILLS_DIR,
    ignore: ['**/node_modules/**', '**/tests/**'],
  });

  if (skillMdFiles.length === 0) {
    it.skip('no SKILL.md files found yet', () => {});
    return;
  }

  it.each(skillMdFiles)('%s has required sections', (file) => {
    const content = readFileSync(resolve(SKILLS_DIR, file), 'utf-8');
    for (const section of REQUIRED_SECTIONS) {
      expect(content, `Missing section: ${section} in ${file}`).toContain(section);
    }
  });

  it.each(skillMdFiles)('%s starts with h1 heading', (file) => {
    const content = readFileSync(resolve(SKILLS_DIR, file), 'utf-8');
    expect(content.trim()).toMatch(/^# /);
  });

  it.each(skillMdFiles)('%s has corresponding skill.yaml', (file) => {
    const dir = resolve(SKILLS_DIR, file, '..');
    expect(existsSync(resolve(dir, 'skill.yaml')), `Missing skill.yaml for ${file}`).toBe(true);
  });
});

describe('rigid skills have Gates and Escalation sections', () => {
  const skillYamlFiles = glob.sync('**/skill.yaml', {
    cwd: SKILLS_DIR,
    ignore: ['**/node_modules/**', '**/tests/**'],
  });

  if (skillYamlFiles.length === 0) {
    it.skip('no skill.yaml files found yet', () => {});
    return;
  }

  const rigidSkills = skillYamlFiles.filter((file) => {
    const content = readFileSync(resolve(SKILLS_DIR, file), 'utf-8');
    const parsed = parse(content);
    return parsed?.type === 'rigid';
  });

  if (rigidSkills.length === 0) {
    it.skip('no rigid skills found yet', () => {});
    return;
  }

  it.each(rigidSkills)('%s (rigid) has Gates and Escalation sections', (file) => {
    const dir = resolve(SKILLS_DIR, file, '..');
    const skillMdPath = resolve(dir, 'SKILL.md');
    if (!existsSync(skillMdPath)) return; // skip if SKILL.md doesn't exist yet
    const content = readFileSync(skillMdPath, 'utf-8');
    for (const section of RIGID_SECTIONS) {
      expect(content, `Rigid skill missing section: ${section}`).toContain(section);
    }
  });
});
```

- [ ] **Step 2: Delete old prompt-lint.test.ts**

Run: `rm agents/skills/tests/prompt-lint.test.ts`

- [ ] **Step 3: Run test**

Run: `cd agents/skills && npx vitest run tests/structure.test.ts`
Expected: PASS (tests skip when no SKILL.md files exist yet)

- [ ] **Step 4: Commit**

```bash
git rm agents/skills/tests/prompt-lint.test.ts
git add agents/skills/tests/structure.test.ts
git commit -m "feat(skills): add SKILL.md structure linter, remove prompt-lint"
```

---

### Task 3: References Validation Test

**Files:**
- Create: `agents/skills/tests/references.test.ts`
- Delete: `agents/skills/tests/includes.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// agents/skills/tests/references.test.ts
import { describe, it, expect } from 'vitest';
import { glob } from 'glob';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'yaml';
import { SkillMetadataSchema } from './schema';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = resolve(__dirname, '..');

describe('skill.yaml schema validation', () => {
  const skillFiles = glob.sync('**/skill.yaml', {
    cwd: SKILLS_DIR,
    ignore: ['**/node_modules/**', '**/tests/**'],
  });

  if (skillFiles.length === 0) {
    it.skip('no skill files found yet', () => {});
    return;
  }

  it.each(skillFiles)('%s conforms to schema', (file) => {
    const content = readFileSync(resolve(SKILLS_DIR, file), 'utf-8');
    const parsed = parse(content);
    const result = SkillMetadataSchema.safeParse(parsed);
    expect(result.success, `Schema validation failed for ${file}: ${JSON.stringify(result)}`).toBe(true);
  });
});

describe('depends_on references', () => {
  const skillFiles = glob.sync('**/skill.yaml', {
    cwd: SKILLS_DIR,
    ignore: ['**/node_modules/**', '**/tests/**'],
  });

  if (skillFiles.length === 0) {
    it.skip('no skill files found yet', () => {});
    return;
  }

  // Collect all skill names
  const allSkillNames = new Set<string>();
  for (const file of skillFiles) {
    const content = readFileSync(resolve(SKILLS_DIR, file), 'utf-8');
    const parsed = parse(content);
    if (parsed?.name) allSkillNames.add(parsed.name);
  }

  it.each(skillFiles)('%s depends_on references existing skills', (file) => {
    const content = readFileSync(resolve(SKILLS_DIR, file), 'utf-8');
    const parsed = parse(content);
    const result = SkillMetadataSchema.safeParse(parsed);
    if (!result.success) return;

    for (const dep of result.data.depends_on) {
      expect(allSkillNames.has(dep), `${file} references unknown skill: ${dep}`).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Delete old includes.test.ts**

Run: `rm agents/skills/tests/includes.test.ts`

- [ ] **Step 3: Run test**

Run: `cd agents/skills && npx vitest run tests/references.test.ts`
Expected: PASS (existing skill.yaml files will fail schema — that's expected, they'll be migrated in Task 7)

Note: Tests will initially fail because existing skill.yaml files use the old schema (missing `type`, `platforms`, etc.). This is expected — Task 7 migrates them. For now, the test infrastructure is correct.

- [ ] **Step 4: Commit**

```bash
git rm agents/skills/tests/includes.test.ts
git add agents/skills/tests/references.test.ts
git commit -m "feat(skills): add depends_on reference validation, remove includes test"
```

---

## Chunk 2: State Management

### Task 4: HarnessState Types

**Files:**
- Create: `packages/core/src/state/types.ts`
- Test: `packages/core/tests/state/types.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/tests/state/types.test.ts
import { describe, it, expect } from 'vitest';
import { HarnessStateSchema } from '../../src/state/types';

describe('HarnessStateSchema', () => {
  it('validates a complete state', () => {
    const result = HarnessStateSchema.safeParse({
      schemaVersion: 1,
      position: { phase: 'implementation', task: 'task-3' },
      decisions: [{ date: '2026-03-14', decision: 'Use Next.js', context: 'Framework choice' }],
      blockers: [],
      progress: { 'task-1': 'complete', 'task-2': 'in_progress' },
      lastSession: { date: '2026-03-14', summary: 'Completed template system' },
    });
    expect(result.success).toBe(true);
  });

  it('applies defaults for empty state', () => {
    const result = HarnessStateSchema.parse({ schemaVersion: 1 });
    expect(result.position).toEqual({});
    expect(result.decisions).toEqual([]);
    expect(result.blockers).toEqual([]);
    expect(result.progress).toEqual({});
  });

  it('rejects invalid schema version', () => {
    const result = HarnessStateSchema.safeParse({ schemaVersion: 2 });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write implementation**

```typescript
// packages/core/src/state/types.ts
import { z } from 'zod';

export const HarnessStateSchema = z.object({
  schemaVersion: z.literal(1),
  position: z.object({
    phase: z.string().optional(),
    task: z.string().optional(),
  }).default({}),
  decisions: z.array(z.object({
    date: z.string(),
    decision: z.string(),
    context: z.string(),
  })).default([]),
  blockers: z.array(z.object({
    id: z.string(),
    description: z.string(),
    status: z.enum(['open', 'resolved']),
  })).default([]),
  progress: z.record(z.enum(['pending', 'in_progress', 'complete'])).default({}),
  lastSession: z.object({
    date: z.string(),
    summary: z.string(),
  }).optional(),
});

export type HarnessState = z.infer<typeof HarnessStateSchema>;

export const DEFAULT_STATE: HarnessState = {
  schemaVersion: 1,
  position: {},
  decisions: [],
  blockers: [],
  progress: {},
};
```

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/state/ packages/core/tests/state/
git commit -m "feat(state): add HarnessState schema and types"
```

---

### Task 5: State Manager (loadState, saveState, appendLearning)

**Files:**
- Create: `packages/core/src/state/state-manager.ts`
- Create: `packages/core/src/state/index.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/tests/state/state-manager.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/tests/state/state-manager.test.ts
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { loadState, saveState, appendLearning } from '../../src/state/state-manager';

describe('loadState', () => {
  it('returns default state when .harness/state.json missing', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'state-test-'));
    const result = await loadState(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.schemaVersion).toBe(1);
      expect(result.value.decisions).toEqual([]);
    }
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('loads existing state', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'state-test-'));
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(path.join(harnessDir, 'state.json'), JSON.stringify({
      schemaVersion: 1,
      position: { phase: 'test' },
      decisions: [],
      blockers: [],
      progress: { 'task-1': 'complete' },
    }));
    const result = await loadState(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.progress['task-1']).toBe('complete');
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('returns error for corrupted JSON', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'state-test-'));
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(path.join(harnessDir, 'state.json'), 'not json{{{');
    const result = await loadState(tmpDir);
    expect(result.ok).toBe(false);
    fs.rmSync(tmpDir, { recursive: true });
  });
});

describe('saveState', () => {
  it('creates .harness directory and writes state', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'state-test-'));
    const state = {
      schemaVersion: 1 as const,
      position: { phase: 'test' },
      decisions: [],
      blockers: [],
      progress: {},
    };
    const result = await saveState(tmpDir, state);
    expect(result.ok).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.harness', 'state.json'))).toBe(true);
    fs.rmSync(tmpDir, { recursive: true });
  });
});

describe('appendLearning', () => {
  it('creates learnings.md and appends', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'state-test-'));
    await appendLearning(tmpDir, 'First learning');
    await appendLearning(tmpDir, 'Second learning');
    const content = fs.readFileSync(path.join(tmpDir, '.harness', 'learnings.md'), 'utf-8');
    expect(content).toContain('First learning');
    expect(content).toContain('Second learning');
    fs.rmSync(tmpDir, { recursive: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write implementation**

```typescript
// packages/core/src/state/state-manager.ts
import * as fs from 'fs';
import * as path from 'path';
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import { HarnessStateSchema, DEFAULT_STATE, type HarnessState } from './types';

const HARNESS_DIR = '.harness';
const STATE_FILE = 'state.json';
const LEARNINGS_FILE = 'learnings.md';

export async function loadState(projectPath: string): Promise<Result<HarnessState, Error>> {
  const statePath = path.join(projectPath, HARNESS_DIR, STATE_FILE);

  if (!fs.existsSync(statePath)) {
    return Ok({ ...DEFAULT_STATE });
  }

  try {
    const raw = fs.readFileSync(statePath, 'utf-8');
    const parsed = JSON.parse(raw);
    const result = HarnessStateSchema.safeParse(parsed);

    if (!result.success) {
      return Err(new Error(`Invalid state file ${statePath}: ${result.error.message}`));
    }

    return Ok(result.data);
  } catch (error) {
    return Err(new Error(`Failed to load state from ${statePath}: ${error instanceof Error ? error.message : String(error)}`));
  }
}

export async function saveState(projectPath: string, state: HarnessState): Promise<Result<void, Error>> {
  const harnessDir = path.join(projectPath, HARNESS_DIR);
  const statePath = path.join(harnessDir, STATE_FILE);

  try {
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
    return Ok(undefined);
  } catch (error) {
    return Err(new Error(`Failed to save state: ${error instanceof Error ? error.message : String(error)}`));
  }
}

export async function appendLearning(projectPath: string, learning: string): Promise<Result<void, Error>> {
  const harnessDir = path.join(projectPath, HARNESS_DIR);
  const learningsPath = path.join(harnessDir, LEARNINGS_FILE);

  try {
    fs.mkdirSync(harnessDir, { recursive: true });
    const timestamp = new Date().toISOString().split('T')[0];
    const entry = `\n- **${timestamp}:** ${learning}\n`;

    if (!fs.existsSync(learningsPath)) {
      fs.writeFileSync(learningsPath, `# Learnings\n${entry}`);
    } else {
      fs.appendFileSync(learningsPath, entry);
    }

    return Ok(undefined);
  } catch (error) {
    return Err(new Error(`Failed to append learning: ${error instanceof Error ? error.message : String(error)}`));
  }
}
```

```typescript
// packages/core/src/state/index.ts
export { HarnessStateSchema, DEFAULT_STATE } from './types';
export type { HarnessState } from './types';
export { loadState, saveState, appendLearning } from './state-manager';
```

- [ ] **Step 4: Export from core index.ts**

Add to `packages/core/src/index.ts`:
```typescript
// State module
export * from './state';
```

- [ ] **Step 5: Run test to verify it passes**

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/state/ packages/core/tests/state/ packages/core/src/index.ts
git commit -m "feat(state): add HarnessState manager (load, save, appendLearning)"
```

---

## Chunk 3: CLI Commands

### Task 6: `harness skill` Commands

**Files:**
- Create: `packages/cli/src/commands/skill/index.ts`
- Create: `packages/cli/src/commands/skill/list.ts`
- Create: `packages/cli/src/commands/skill/run.ts`
- Create: `packages/cli/src/commands/skill/validate.ts`
- Create: `packages/cli/src/commands/skill/info.ts`
- Modify: `packages/cli/src/index.ts`
- Test: `packages/cli/tests/commands/skill.test.ts`

This task creates 4 CLI subcommands. The implementer should:

1. Read existing command patterns (e.g., `packages/cli/src/commands/persona/list.ts`) for style
2. `list` — scans `agents/skills/claude-code/` for skill.yaml files, parses with SkillMetadataSchema, outputs table/json/quiet
3. `run <name>` — finds the skill directory, reads SKILL.md, optionally injects project context (harness.config.json + .harness/state.json if persistent), outputs to stdout
4. `validate` — runs schema validation on all skill.yaml files + SKILL.md structure check
5. `info <name>` — shows skill metadata (name, description, type, triggers, phases, depends_on)
6. Register all in `packages/cli/src/index.ts`

The `resolveSkillsDir()` function should follow the same pattern as `resolvePersonasDir()` in `packages/cli/src/utils/paths.ts` — use `findUpDir('agents', 'skills')`.

- [ ] **Step 1: Write test**

```typescript
// packages/cli/tests/commands/skill.test.ts
import { describe, it, expect } from 'vitest';
import { createSkillCommand } from '../../src/commands/skill/index';

describe('skill command', () => {
  it('creates skill command with subcommands', () => {
    const cmd = createSkillCommand();
    expect(cmd.name()).toBe('skill');
    const subcommands = cmd.commands.map((c) => c.name());
    expect(subcommands).toContain('list');
    expect(subcommands).toContain('run');
    expect(subcommands).toContain('validate');
    expect(subcommands).toContain('info');
  });
});
```

- [ ] **Step 2: Implement all 4 subcommands + parent**

Follow existing patterns from persona commands. Key difference: `run` reads SKILL.md content and outputs it.

- [ ] **Step 3: Register in CLI index**

Add to `packages/cli/src/index.ts`:
```typescript
import { createSkillCommand } from './commands/skill';
// In createProgram():
program.addCommand(createSkillCommand());
```

- [ ] **Step 4: Run all tests**

Run: `cd packages/cli && npx vitest run`

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/skill/ packages/cli/tests/commands/skill.test.ts packages/cli/src/index.ts
git commit -m "feat(cli): add harness skill list/run/validate/info commands"
```

---

### Task 7: `harness state` Commands

**Files:**
- Create: `packages/cli/src/commands/state/index.ts`
- Create: `packages/cli/src/commands/state/show.ts`
- Create: `packages/cli/src/commands/state/reset.ts`
- Create: `packages/cli/src/commands/state/learn.ts`
- Modify: `packages/cli/src/index.ts`
- Test: `packages/cli/tests/commands/state.test.ts`

Similar pattern to skill commands. Uses `loadState`, `saveState`, `appendLearning` from `@harness-engineering/core`.

- `show` — calls `loadState`, formats output (table/json/quiet)
- `reset` — prompts for confirmation, then deletes `.harness/state.json`
- `learn <message>` — calls `appendLearning`

- [ ] **Step 1: Write test**

```typescript
// packages/cli/tests/commands/state.test.ts
import { describe, it, expect } from 'vitest';
import { createStateCommand } from '../../src/commands/state/index';

describe('state command', () => {
  it('creates state command with subcommands', () => {
    const cmd = createStateCommand();
    expect(cmd.name()).toBe('state');
    const subcommands = cmd.commands.map((c) => c.name());
    expect(subcommands).toContain('show');
    expect(subcommands).toContain('reset');
    expect(subcommands).toContain('learn');
  });
});
```

- [ ] **Step 2: Implement all 3 subcommands + parent**
- [ ] **Step 3: Register in CLI index**
- [ ] **Step 4: Run all tests**
- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/state/ packages/cli/tests/commands/state.test.ts packages/cli/src/index.ts
git commit -m "feat(cli): add harness state show/reset/learn commands"
```

---

## Chunk 4: MCP Tool + Skill Migration

### Task 8: MCP `run_skill` Tool

**Files:**
- Create: `packages/mcp-server/src/tools/skill.ts`
- Modify: `packages/mcp-server/src/server.ts`
- Test: `packages/mcp-server/tests/tools/skill.test.ts`

- [ ] **Step 1: Write test**

```typescript
// packages/mcp-server/tests/tools/skill.test.ts
import { describe, it, expect } from 'vitest';
import { runSkillDefinition } from '../../src/tools/skill';

describe('run_skill tool', () => {
  it('has correct definition', () => {
    expect(runSkillDefinition.name).toBe('run_skill');
    expect(runSkillDefinition.inputSchema.required).toContain('skill');
  });
});
```

- [ ] **Step 2: Implement**

The tool finds the skill directory, reads SKILL.md, optionally loads project state, and returns the content. Follow the same pattern as other MCP tools (dynamic imports, `resultToMcpResponse`).

- [ ] **Step 3: Register in server.ts**
- [ ] **Step 4: Update integration test** (expect 15 tools now)
- [ ] **Step 5: Commit**

```bash
git add packages/mcp-server/src/tools/skill.ts packages/mcp-server/src/server.ts packages/mcp-server/tests/
git commit -m "feat(mcp-server): add run_skill tool"
```

---

### Task 9: Migrate Existing 11 Skills

**Files:**
- Modify: All 11 `agents/skills/claude-code/*/skill.yaml` files
- Create: All 11 `agents/skills/claude-code/*/SKILL.md` files (stubs)
- Delete: All 11 `agents/skills/claude-code/*/prompt.md` files
- Delete: All 11 `agents/skills/claude-code/*/README.md` files
- Delete: `agents/skills/shared/` directory

For each of the 11 existing skills:
1. Rewrite `skill.yaml` to new schema (add `platforms`, `type`, remove `platform`, `category`, `includes`)
2. Create `SKILL.md` stub with all required sections (see stub format in spec)
3. Delete `prompt.md` and `README.md`

The 11 skills to migrate:
1. `validate-context-engineering` — type: flexible
2. `enforce-architecture` — type: rigid
3. `check-mechanical-constraints` — type: rigid
4. `harness-tdd` — type: rigid
5. `harness-code-review` — type: rigid
6. `harness-refactoring` — type: flexible
7. `detect-doc-drift` — type: flexible
8. `cleanup-dead-code` — type: flexible
9. `align-documentation` — type: flexible
10. `initialize-harness-project` — type: flexible
11. `add-harness-component` — type: flexible

Example migrated skill.yaml for `harness-tdd`:
```yaml
name: harness-tdd
version: "1.0.0"
description: Test-driven development integrated with harness validation
triggers:
  - manual
  - on_new_feature
  - on_bug_fix
platforms:
  - claude-code
  - gemini-cli
tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
cli:
  command: harness skill run harness-tdd
  args:
    - name: path
      description: Project root path
      required: false
mcp:
  tool: run_skill
  input:
    skill: harness-tdd
    path: string
type: rigid
phases:
  - name: red
    description: Write failing test
  - name: green
    description: Implement minimal code to pass
  - name: refactor
    description: Clean up while keeping tests green
  - name: validate
    description: Run harness checks
state:
  persistent: false
  files: []
depends_on:
  - harness-verification
```

- [ ] **Step 1: Delete shared/ directory**

Run: `rm -rf agents/skills/shared/`

- [ ] **Step 2: Migrate all 11 skill.yaml files**

For each skill, rewrite skill.yaml with new schema fields. Use the spec's skill inventory (Section 3) for `type` and `depends_on` values.

- [ ] **Step 3: Create SKILL.md stubs for all 11 skills**

Use the stub format from the spec. Each stub has all required sections with TODO markers. For rigid skills, include `## Gates` and `## Escalation` sections.

- [ ] **Step 4: Delete all prompt.md and README.md files**

Run: `find agents/skills/claude-code -name "prompt.md" -delete && find agents/skills/claude-code -name "README.md" -delete`

- [ ] **Step 5: Mirror to gemini-cli** (symlinks)

For each skill in claude-code, create a symlink in gemini-cli:
```bash
cd agents/skills/gemini-cli
for skill in ../claude-code/*/; do
  name=$(basename "$skill")
  rm -rf "$name"
  ln -s "../claude-code/$name" "$name"
done
```

- [ ] **Step 6: Run validation tests**

Run: `cd agents/skills && npx vitest run`
Expected: All schema, structure, and reference tests pass

- [ ] **Step 7: Commit**

```bash
git add agents/skills/
git commit -m "feat(skills): migrate 11 existing skills to rich format

Rewrite skill.yaml to new schema, create SKILL.md stubs,
delete prompt.md/README.md/shared/, symlink gemini-cli."
```

---

### Task 10: Create 10 New Skill Directories

**Files:**
- Create: 10 new directories in `agents/skills/claude-code/` with `skill.yaml` + `SKILL.md` stubs

New skills:
1. `harness-brainstorming` — type: rigid, depends_on: [harness-planning]
2. `harness-debugging` — type: rigid, state.persistent: true, state.files: ['.harness/debug/']
3. `harness-planning` — type: rigid, depends_on: [harness-verification]
4. `harness-verification` — type: rigid
5. `harness-parallel-agents` — type: flexible
6. `harness-execution` — type: rigid, state.persistent: true, state.files: ['.harness/state.json', '.harness/learnings.md'], depends_on: [harness-verification]
7. `harness-git-workflow` — type: flexible
8. `harness-skill-authoring` — type: flexible
9. `harness-onboarding` — type: flexible
10. `harness-state-management` — type: flexible, state.persistent: true, state.files: ['.harness/state.json']

For each: create skill.yaml with appropriate fields + SKILL.md stub.

- [ ] **Step 1: Create all 10 skill directories with skill.yaml + SKILL.md**
- [ ] **Step 2: Symlink to gemini-cli**
- [ ] **Step 3: Run validation tests**

Run: `cd agents/skills && npx vitest run`
Expected: All 21 skills pass schema + structure validation

- [ ] **Step 4: Commit**

```bash
git add agents/skills/
git commit -m "feat(skills): add 10 new skill directories with stubs

harness-brainstorming, harness-debugging, harness-planning,
harness-verification, harness-parallel-agents, harness-execution,
harness-git-workflow, harness-skill-authoring, harness-onboarding,
harness-state-management"
```

---

### Task 11: Final Integration Verification

- [ ] **Step 1: Run all skill tests**

Run: `cd agents/skills && npx vitest run`
Expected: All tests pass, 21 skills validated

- [ ] **Step 2: Run all CLI tests**

Run: `cd packages/cli && npx vitest run`
Expected: All tests pass including new skill/state commands

- [ ] **Step 3: Run all MCP tests**

Run: `cd packages/mcp-server && npx vitest run`
Expected: All tests pass, 15 tools registered

- [ ] **Step 4: Run all core tests**

Run: `cd packages/core && npx vitest run`
Expected: All tests pass including state management

- [ ] **Step 5: Build all packages**

Run: `pnpm --filter @harness-engineering/types --filter @harness-engineering/core --filter @harness-engineering/cli --filter @harness-engineering/eslint-plugin --filter @harness-engineering/linter-gen --filter @harness-engineering/mcp-server run build`
Expected: All packages build

- [ ] **Step 6: Commit any fixes**

- [ ] **Step 7: Final commit**

```bash
git commit --allow-empty -m "chore: rich skill format infrastructure complete

21 skills (11 migrated + 10 new) with SKILL.md stubs
State management API in core
harness skill list/run/validate/info CLI commands
harness state show/reset/learn CLI commands
run_skill MCP tool
All tests passing, all packages building"
```

---

End of plan.

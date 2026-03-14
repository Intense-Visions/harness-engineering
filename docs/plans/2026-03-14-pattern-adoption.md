# Pattern Adoption Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopt 14 framework research patterns into harness engineering via mechanical enforcement (core code) and behavioral guidance (SKILL.md updates).

**Architecture:** New Zod schemas in types.ts, 6 new functions + 1 modified function in state-manager.ts, mechanical gate runner. Skill SKILL.md files updated for mechanical and behavioral patterns. Templates scaffolded with new directories.

**Tech Stack:** TypeScript, Zod, Vitest, Node.js fs API

**Spec:** `docs/specs/2026-03-14-pattern-adoption-design.md`

---

## Chunk 1: Core Schemas and Types

### Task 1: Add new Zod schemas to types.ts

**Files:**
- Modify: `packages/core/src/state/types.ts`
- Test: `packages/core/tests/state/types.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/tests/state/types.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  HarnessStateSchema,
  FailureEntrySchema,
  HandoffSchema,
  GateResultSchema,
  GateConfigSchema,
} from '../../src/state/types';

describe('FailureEntrySchema', () => {
  it('should parse a valid failure entry', () => {
    const entry = {
      date: '2026-03-14',
      skill: 'harness-tdd',
      type: 'dead-end',
      description: 'Attempted X, failed because Y',
    };
    const result = FailureEntrySchema.safeParse(entry);
    expect(result.success).toBe(true);
  });

  it('should reject entry missing required fields', () => {
    const result = FailureEntrySchema.safeParse({ date: '2026-03-14' });
    expect(result.success).toBe(false);
  });
});

describe('HandoffSchema', () => {
  it('should parse a valid handoff', () => {
    const handoff = {
      timestamp: '2026-03-14T10:30:00Z',
      fromSkill: 'harness-execution',
      phase: 'EXECUTE',
      summary: 'Completed tasks 1-3 of 5',
      completed: ['Task 1', 'Task 2', 'Task 3'],
      pending: ['Task 4', 'Task 5'],
      concerns: [],
      decisions: [],
      blockers: [],
      contextKeywords: ['auth', 'middleware'],
    };
    const result = HandoffSchema.safeParse(handoff);
    expect(result.success).toBe(true);
  });

  it('should allow optional fields to be omitted', () => {
    const minimal = {
      timestamp: '2026-03-14T10:30:00Z',
      fromSkill: 'harness-planning',
      phase: 'VALIDATE',
      summary: 'Planning complete',
    };
    const result = HandoffSchema.safeParse(minimal);
    expect(result.success).toBe(true);
  });
});

describe('GateResultSchema', () => {
  it('should parse a gate result with checks', () => {
    const result = GateResultSchema.safeParse({
      passed: false,
      checks: [
        { name: 'test', passed: true, command: 'npm test' },
        { name: 'lint', passed: false, command: 'npx eslint .', output: '2 errors' },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe('GateConfigSchema', () => {
  it('should parse a gate config with custom checks', () => {
    const result = GateConfigSchema.safeParse({
      checks: [{ name: 'test', command: 'npm test -- --coverage' }],
      trace: true,
    });
    expect(result.success).toBe(true);
  });

  it('should parse an empty config', () => {
    const result = GateConfigSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe('HarnessStateSchema lastSession extensions', () => {
  it('should parse state with extended lastSession fields', () => {
    const state = {
      schemaVersion: 1,
      position: { phase: 'execute', task: 'Task 3' },
      decisions: [],
      blockers: [],
      progress: { 'Task 1': 'complete', 'Task 2': 'complete' },
      lastSession: {
        date: '2026-03-14',
        summary: 'Completed Tasks 1-2',
        lastSkill: 'harness-execution',
        pendingTasks: ['Task 3', 'Task 4', 'Task 5'],
      },
    };
    const result = HarnessStateSchema.safeParse(state);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.lastSession?.lastSkill).toBe('harness-execution');
      expect(result.data.lastSession?.pendingTasks).toEqual(['Task 3', 'Task 4', 'Task 5']);
    }
  });

  it('should parse state with original lastSession (no new fields)', () => {
    const state = {
      schemaVersion: 1,
      position: {},
      decisions: [],
      blockers: [],
      progress: {},
      lastSession: {
        date: '2026-03-14',
        summary: 'Did some work',
      },
    };
    const result = HarnessStateSchema.safeParse(state);
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm exec vitest run tests/state/types.test.ts`
Expected: FAIL — `FailureEntrySchema`, `HandoffSchema`, `GateResultSchema`, `GateConfigSchema` not found in exports

- [ ] **Step 3: Write implementation**

Modify `packages/core/src/state/types.ts`:

```typescript
// packages/core/src/state/types.ts
import { z } from 'zod';

export const FailureEntrySchema = z.object({
  date: z.string(),
  skill: z.string(),
  type: z.string(),
  description: z.string(),
});

export type FailureEntry = z.infer<typeof FailureEntrySchema>;

export const HandoffSchema = z.object({
  timestamp: z.string(),
  fromSkill: z.string(),
  phase: z.string(),
  summary: z.string(),
  completed: z.array(z.string()).default([]),
  pending: z.array(z.string()).default([]),
  concerns: z.array(z.string()).default([]),
  decisions: z.array(z.object({
    what: z.string(),
    why: z.string(),
  })).default([]),
  blockers: z.array(z.string()).default([]),
  contextKeywords: z.array(z.string()).default([]),
});

export type Handoff = z.infer<typeof HandoffSchema>;

export const GateCheckSchema = z.object({
  name: z.string(),
  passed: z.boolean(),
  command: z.string(),
  output: z.string().optional(),
  duration: z.number().optional(),
});

export const GateResultSchema = z.object({
  passed: z.boolean(),
  checks: z.array(GateCheckSchema),
});

export type GateResult = z.infer<typeof GateResultSchema>;

export const GateConfigSchema = z.object({
  checks: z.array(z.object({
    name: z.string(),
    command: z.string(),
  })).optional(),
  trace: z.boolean().optional(),
});

export type GateConfig = z.infer<typeof GateConfigSchema>;

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
    lastSkill: z.string().optional(),
    pendingTasks: z.array(z.string()).optional(),
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

- [ ] **Step 4: Update exports in index.ts**

Modify `packages/core/src/state/index.ts`:

```typescript
// packages/core/src/state/index.ts
export {
  HarnessStateSchema,
  DEFAULT_STATE,
  FailureEntrySchema,
  HandoffSchema,
  GateResultSchema,
  GateConfigSchema,
} from './types';
export type {
  HarnessState,
  FailureEntry,
  Handoff,
  GateResult,
  GateConfig,
} from './types';
export {
  loadState,
  saveState,
  appendLearning,
} from './state-manager';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/core && pnpm exec vitest run tests/state/types.test.ts`
Expected: PASS — all 8 tests pass

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/state/types.ts packages/core/src/state/index.ts packages/core/tests/state/types.test.ts
git commit -m "feat(state): add FailureEntry, Handoff, GateResult, GateConfig schemas and extend lastSession"
```

---

## Chunk 2: Failure Log Functions

### Task 2: Implement appendFailure and loadFailures

**Files:**
- Modify: `packages/core/src/state/state-manager.ts`
- Test: `packages/core/tests/state/failures.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/tests/state/failures.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { appendFailure, loadFailures } from '../../src/state/state-manager';

describe('appendFailure', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-failures-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should create failures.md with header if file does not exist', async () => {
    const result = await appendFailure(tmpDir, 'Attempted X, failed', 'harness-tdd', 'dead-end');
    expect(result.ok).toBe(true);

    const content = fs.readFileSync(path.join(tmpDir, '.harness', 'failures.md'), 'utf-8');
    expect(content).toContain('# Failures');
    expect(content).toContain('[skill:harness-tdd]');
    expect(content).toContain('[type:dead-end]');
    expect(content).toContain('Attempted X, failed');
  });

  it('should append to existing failures.md', async () => {
    await appendFailure(tmpDir, 'First failure', 'harness-tdd', 'dead-end');
    await appendFailure(tmpDir, 'Second failure', 'harness-execution', 'blocked');

    const content = fs.readFileSync(path.join(tmpDir, '.harness', 'failures.md'), 'utf-8');
    expect(content).toContain('First failure');
    expect(content).toContain('Second failure');
    expect(content).toContain('[skill:harness-execution]');
  });
});

describe('loadFailures', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-failures-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should return empty array when no failures file exists', async () => {
    const result = await loadFailures(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });

  it('should parse failure entries from file', async () => {
    await appendFailure(tmpDir, 'Test failure', 'harness-tdd', 'dead-end');
    const result = await loadFailures(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(1);
      expect(result.value[0].skill).toBe('harness-tdd');
      expect(result.value[0].type).toBe('dead-end');
      expect(result.value[0].description).toBe('Test failure');
    }
  });

  it('should parse multiple failure entries', async () => {
    await appendFailure(tmpDir, 'Failure one', 'harness-tdd', 'dead-end');
    await appendFailure(tmpDir, 'Failure two', 'harness-execution', 'blocked');
    const result = await loadFailures(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(2);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm exec vitest run tests/state/failures.test.ts`
Expected: FAIL — `appendFailure` and `loadFailures` not found in exports

- [ ] **Step 3: Write implementation**

Add to `packages/core/src/state/state-manager.ts` (after existing `appendLearning`):

```typescript
const FAILURES_FILE = 'failures.md';

export async function appendFailure(
  projectPath: string,
  description: string,
  skillName: string,
  type: string
): Promise<Result<void, Error>> {
  const harnessDir = path.join(projectPath, HARNESS_DIR);
  const failuresPath = path.join(harnessDir, FAILURES_FILE);

  try {
    fs.mkdirSync(harnessDir, { recursive: true });
    const timestamp = new Date().toISOString().split('T')[0];
    const entry = `\n- **${timestamp} [skill:${skillName}] [type:${type}]:** ${description}\n`;

    if (!fs.existsSync(failuresPath)) {
      fs.writeFileSync(failuresPath, `# Failures\n${entry}`);
    } else {
      fs.appendFileSync(failuresPath, entry);
    }

    return Ok(undefined);
  } catch (error) {
    return Err(new Error(`Failed to append failure: ${error instanceof Error ? error.message : String(error)}`));
  }
}

const FAILURE_LINE_REGEX = /^- \*\*(\d{4}-\d{2}-\d{2}) \[skill:([^\]]+)\] \[type:([^\]]+)\]:\*\* (.+)$/;

export async function loadFailures(
  projectPath: string
): Promise<Result<Array<{ date: string; skill: string; type: string; description: string }>, Error>> {
  const failuresPath = path.join(projectPath, HARNESS_DIR, FAILURES_FILE);

  if (!fs.existsSync(failuresPath)) {
    return Ok([]);
  }

  try {
    const content = fs.readFileSync(failuresPath, 'utf-8');
    const entries: Array<{ date: string; skill: string; type: string; description: string }> = [];

    for (const line of content.split('\n')) {
      const match = line.match(FAILURE_LINE_REGEX);
      if (match) {
        entries.push({
          date: match[1],
          skill: match[2],
          type: match[3],
          description: match[4],
        });
      }
    }

    return Ok(entries);
  } catch (error) {
    return Err(new Error(`Failed to load failures: ${error instanceof Error ? error.message : String(error)}`));
  }
}
```

- [ ] **Step 4: Update exports**

Add to `packages/core/src/state/index.ts` exports from state-manager:

```typescript
export {
  loadState,
  saveState,
  appendLearning,
  appendFailure,
  loadFailures,
} from './state-manager';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/core && pnpm exec vitest run tests/state/failures.test.ts`
Expected: PASS — all 5 tests pass

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/state/state-manager.ts packages/core/src/state/index.ts packages/core/tests/state/failures.test.ts
git commit -m "feat(state): add appendFailure and loadFailures for anti-pattern tracking"
```

---

### Task 3: Implement archiveFailures

**Files:**
- Modify: `packages/core/src/state/state-manager.ts`
- Test: `packages/core/tests/state/archive-failures.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/tests/state/archive-failures.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { appendFailure, archiveFailures, loadFailures } from '../../src/state/state-manager';

describe('archiveFailures', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-archive-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should move failures.md to archive directory', async () => {
    await appendFailure(tmpDir, 'Old failure', 'harness-tdd', 'dead-end');
    const result = await archiveFailures(tmpDir);
    expect(result.ok).toBe(true);

    // Archive should exist
    const archiveDir = path.join(tmpDir, '.harness', 'archive');
    const archiveFiles = fs.readdirSync(archiveDir);
    expect(archiveFiles.length).toBe(1);
    expect(archiveFiles[0]).toMatch(/^failures-\d{4}-\d{2}-\d{2}\.md$/);

    // Archive content should have the old failure
    const archiveContent = fs.readFileSync(path.join(archiveDir, archiveFiles[0]), 'utf-8');
    expect(archiveContent).toContain('Old failure');

    // Active failures should be empty
    const active = await loadFailures(tmpDir);
    expect(active.ok).toBe(true);
    if (active.ok) {
      expect(active.value).toEqual([]);
    }
  });

  it('should handle same-day collision with counter suffix', async () => {
    await appendFailure(tmpDir, 'First batch', 'harness-tdd', 'dead-end');
    await archiveFailures(tmpDir);

    await appendFailure(tmpDir, 'Second batch', 'harness-execution', 'blocked');
    await archiveFailures(tmpDir);

    const archiveDir = path.join(tmpDir, '.harness', 'archive');
    const archiveFiles = fs.readdirSync(archiveDir).sort();
    expect(archiveFiles.length).toBe(2);
    expect(archiveFiles[1]).toMatch(/^failures-\d{4}-\d{2}-\d{2}-2\.md$/);
  });

  it('should be a no-op when no failures file exists', async () => {
    const result = await archiveFailures(tmpDir);
    expect(result.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm exec vitest run tests/state/archive-failures.test.ts`
Expected: FAIL — `archiveFailures` not found

- [ ] **Step 3: Write implementation**

Add to `packages/core/src/state/state-manager.ts`:

```typescript
export async function archiveFailures(projectPath: string): Promise<Result<void, Error>> {
  const harnessDir = path.join(projectPath, HARNESS_DIR);
  const failuresPath = path.join(harnessDir, FAILURES_FILE);

  if (!fs.existsSync(failuresPath)) {
    return Ok(undefined);
  }

  try {
    const archiveDir = path.join(harnessDir, 'archive');
    fs.mkdirSync(archiveDir, { recursive: true });

    const date = new Date().toISOString().split('T')[0];
    let archiveName = `failures-${date}.md`;
    let counter = 2;

    while (fs.existsSync(path.join(archiveDir, archiveName))) {
      archiveName = `failures-${date}-${counter}.md`;
      counter++;
    }

    fs.renameSync(failuresPath, path.join(archiveDir, archiveName));
    return Ok(undefined);
  } catch (error) {
    return Err(new Error(`Failed to archive failures: ${error instanceof Error ? error.message : String(error)}`));
  }
}
```

- [ ] **Step 4: Update exports**

Add `archiveFailures` to `packages/core/src/state/index.ts`.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/core && pnpm exec vitest run tests/state/archive-failures.test.ts`
Expected: PASS — all 3 tests pass

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/state/state-manager.ts packages/core/src/state/index.ts packages/core/tests/state/archive-failures.test.ts
git commit -m "feat(state): add archiveFailures for milestone-scoped failure cleanup"
```

---

## Chunk 3: Tagged Learnings and Handoff Functions

### Task 4: Modify appendLearning to support tags and add loadRelevantLearnings

**Files:**
- Modify: `packages/core/src/state/state-manager.ts`
- Test: `packages/core/tests/state/learnings.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/tests/state/learnings.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { appendLearning, loadRelevantLearnings } from '../../src/state/state-manager';

describe('appendLearning with tags', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-learnings-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should write tagged entry when skillName and outcome provided', async () => {
    const result = await appendLearning(tmpDir, 'UTC normalization needed', 'harness-tdd', 'gotcha');
    expect(result.ok).toBe(true);

    const content = fs.readFileSync(path.join(tmpDir, '.harness', 'learnings.md'), 'utf-8');
    expect(content).toContain('[skill:harness-tdd]');
    expect(content).toContain('[outcome:gotcha]');
    expect(content).toContain('UTC normalization needed');
  });

  it('should write untagged entry when no tags provided (backwards compatible)', async () => {
    const result = await appendLearning(tmpDir, 'Simple learning');
    expect(result.ok).toBe(true);

    const content = fs.readFileSync(path.join(tmpDir, '.harness', 'learnings.md'), 'utf-8');
    expect(content).not.toContain('[skill:');
    expect(content).toContain('Simple learning');
  });
});

describe('loadRelevantLearnings', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-learnings-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should return empty array when no learnings file exists', async () => {
    const result = await loadRelevantLearnings(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });

  it('should return all entries when no skill filter', async () => {
    await appendLearning(tmpDir, 'Learning A', 'harness-tdd', 'success');
    await appendLearning(tmpDir, 'Learning B', 'harness-execution', 'gotcha');
    await appendLearning(tmpDir, 'Learning C');

    const result = await loadRelevantLearnings(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(3);
    }
  });

  it('should filter by skill name', async () => {
    await appendLearning(tmpDir, 'TDD learning', 'harness-tdd', 'success');
    await appendLearning(tmpDir, 'Execution learning', 'harness-execution', 'gotcha');
    await appendLearning(tmpDir, 'Another TDD', 'harness-tdd', 'gotcha');

    const result = await loadRelevantLearnings(tmpDir, 'harness-tdd');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(2);
      expect(result.value.every(e => e.includes('harness-tdd'))).toBe(true);
    }
  });

  it('should include untagged entries when no filter', async () => {
    await appendLearning(tmpDir, 'Tagged', 'harness-tdd', 'success');
    await appendLearning(tmpDir, 'Untagged');

    const result = await loadRelevantLearnings(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(2);
    }
  });

  it('should handle heading-based format from execution skill', async () => {
    // Write a heading-based entry directly (legacy format)
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(
      path.join(harnessDir, 'learnings.md'),
      '# Learnings\n\n## 2026-03-14 — Task 3: Notification Expiry\n- [learning]: UTC normalization needed\n'
    );

    const result = await loadRelevantLearnings(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm exec vitest run tests/state/learnings.test.ts`
Expected: FAIL — `loadRelevantLearnings` not found, and `appendLearning` signature mismatch

- [ ] **Step 3: Write implementation**

Replace the existing `appendLearning` in `packages/core/src/state/state-manager.ts` and add `loadRelevantLearnings`:

```typescript
export async function appendLearning(
  projectPath: string,
  learning: string,
  skillName?: string,
  outcome?: string
): Promise<Result<void, Error>> {
  const harnessDir = path.join(projectPath, HARNESS_DIR);
  const learningsPath = path.join(harnessDir, LEARNINGS_FILE);

  try {
    fs.mkdirSync(harnessDir, { recursive: true });
    const timestamp = new Date().toISOString().split('T')[0];

    let entry: string;
    if (skillName && outcome) {
      entry = `\n- **${timestamp} [skill:${skillName}] [outcome:${outcome}]:** ${learning}\n`;
    } else if (skillName) {
      entry = `\n- **${timestamp} [skill:${skillName}]:** ${learning}\n`;
    } else {
      entry = `\n- **${timestamp}:** ${learning}\n`;
    }

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

export async function loadRelevantLearnings(
  projectPath: string,
  skillName?: string
): Promise<Result<string[], Error>> {
  const learningsPath = path.join(projectPath, HARNESS_DIR, LEARNINGS_FILE);

  if (!fs.existsSync(learningsPath)) {
    return Ok([]);
  }

  try {
    const content = fs.readFileSync(learningsPath, 'utf-8');
    const lines = content.split('\n');
    const entries: string[] = [];
    let currentBlock: string[] = [];

    for (const line of lines) {
      // Skip the file header
      if (line.startsWith('# ')) continue;

      // Detect entry boundaries: dated bullet points or heading-based entries
      const isDatedBullet = /^- \*\*\d{4}-\d{2}-\d{2}/.test(line);
      const isHeading = /^## \d{4}-\d{2}-\d{2}/.test(line);

      if (isDatedBullet || isHeading) {
        // Flush previous block
        if (currentBlock.length > 0) {
          entries.push(currentBlock.join('\n'));
        }
        currentBlock = [line];
      } else if (line.trim() !== '' && currentBlock.length > 0) {
        currentBlock.push(line);
      }
    }

    // Flush last block
    if (currentBlock.length > 0) {
      entries.push(currentBlock.join('\n'));
    }

    if (!skillName) {
      return Ok(entries);
    }

    // Filter by skill name tag
    const filtered = entries.filter(entry => entry.includes(`[skill:${skillName}]`));
    return Ok(filtered);
  } catch (error) {
    return Err(new Error(`Failed to load learnings: ${error instanceof Error ? error.message : String(error)}`));
  }
}
```

- [ ] **Step 4: Update exports**

Add `loadRelevantLearnings` to `packages/core/src/state/index.ts`.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/core && pnpm exec vitest run tests/state/learnings.test.ts`
Expected: PASS — all 7 tests pass

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/state/state-manager.ts packages/core/src/state/index.ts packages/core/tests/state/learnings.test.ts
git commit -m "feat(state): add tagged learnings and loadRelevantLearnings for skill-filtered retrieval"
```

---

### Task 5: Implement saveHandoff and loadHandoff

**Files:**
- Modify: `packages/core/src/state/state-manager.ts`
- Test: `packages/core/tests/state/handoff.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/tests/state/handoff.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { saveHandoff, loadHandoff } from '../../src/state/state-manager';
import type { Handoff } from '../../src/state/types';

describe('saveHandoff', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-handoff-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should write handoff.json', async () => {
    const handoff: Handoff = {
      timestamp: '2026-03-14T10:30:00Z',
      fromSkill: 'harness-execution',
      phase: 'EXECUTE',
      summary: 'Completed tasks 1-3',
      completed: ['Task 1', 'Task 2', 'Task 3'],
      pending: ['Task 4'],
      concerns: ['Database migration needed'],
      decisions: [{ what: 'Used Zod', why: 'Existing pattern' }],
      blockers: [],
      contextKeywords: ['auth', 'middleware'],
    };

    const result = await saveHandoff(tmpDir, handoff);
    expect(result.ok).toBe(true);

    const content = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.harness', 'handoff.json'), 'utf-8')
    );
    expect(content.fromSkill).toBe('harness-execution');
    expect(content.completed).toEqual(['Task 1', 'Task 2', 'Task 3']);
  });
});

describe('loadHandoff', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-handoff-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should return null when no handoff file exists', async () => {
    const result = await loadHandoff(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
  });

  it('should parse existing handoff.json', async () => {
    const handoff: Handoff = {
      timestamp: '2026-03-14T10:30:00Z',
      fromSkill: 'harness-planning',
      phase: 'VALIDATE',
      summary: '5 tasks planned',
      completed: [],
      pending: ['Task 1', 'Task 2', 'Task 3', 'Task 4', 'Task 5'],
      concerns: [],
      decisions: [],
      blockers: [],
      contextKeywords: [],
    };

    await saveHandoff(tmpDir, handoff);
    const result = await loadHandoff(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).not.toBeNull();
      expect(result.value!.fromSkill).toBe('harness-planning');
      expect(result.value!.pending.length).toBe(5);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm exec vitest run tests/state/handoff.test.ts`
Expected: FAIL — `saveHandoff` and `loadHandoff` not found

- [ ] **Step 3: Write implementation**

Add to `packages/core/src/state/state-manager.ts`:

```typescript
import { HandoffSchema, type Handoff } from './types';

const HANDOFF_FILE = 'handoff.json';

export async function saveHandoff(
  projectPath: string,
  handoff: Handoff
): Promise<Result<void, Error>> {
  const harnessDir = path.join(projectPath, HARNESS_DIR);
  const handoffPath = path.join(harnessDir, HANDOFF_FILE);

  try {
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(handoffPath, JSON.stringify(handoff, null, 2));
    return Ok(undefined);
  } catch (error) {
    return Err(new Error(`Failed to save handoff: ${error instanceof Error ? error.message : String(error)}`));
  }
}

export async function loadHandoff(
  projectPath: string
): Promise<Result<Handoff | null, Error>> {
  const handoffPath = path.join(projectPath, HARNESS_DIR, HANDOFF_FILE);

  if (!fs.existsSync(handoffPath)) {
    return Ok(null);
  }

  try {
    const raw = fs.readFileSync(handoffPath, 'utf-8');
    const parsed = JSON.parse(raw);
    const result = HandoffSchema.safeParse(parsed);

    if (!result.success) {
      return Err(new Error(`Invalid handoff file: ${result.error.message}`));
    }

    return Ok(result.data);
  } catch (error) {
    return Err(new Error(`Failed to load handoff: ${error instanceof Error ? error.message : String(error)}`));
  }
}
```

Note: The `import { HandoffSchema, type Handoff } from './types';` should be merged with the existing import at the top of `state-manager.ts`. The final import line should be:
```typescript
import { HarnessStateSchema, DEFAULT_STATE, type HarnessState, HandoffSchema, type Handoff } from './types';
```

- [ ] **Step 4: Update exports**

Add `saveHandoff` and `loadHandoff` to `packages/core/src/state/index.ts`.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/core && pnpm exec vitest run tests/state/handoff.test.ts`
Expected: PASS — all 3 tests pass

- [ ] **Step 6: Run all state tests together**

Run: `cd packages/core && pnpm exec vitest run tests/state/`
Expected: PASS — all tests in all state test files pass

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/state/state-manager.ts packages/core/src/state/index.ts packages/core/tests/state/handoff.test.ts
git commit -m "feat(state): add saveHandoff and loadHandoff for structured phase context transfer"
```

---

## Chunk 4: Mechanical Done Gate

### Task 6: Implement runMechanicalGate

**Files:**
- Modify: `packages/core/src/state/state-manager.ts`
- Test: `packages/core/tests/state/gate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/tests/state/gate.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { runMechanicalGate } from '../../src/state/state-manager';

describe('runMechanicalGate', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-gate-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should return passed=true with no checks when project type is undetectable', async () => {
    const result = await runMechanicalGate(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.passed).toBe(true);
      expect(result.value.checks).toEqual([]);
    }
  });

  it('should detect npm project and run available checks', async () => {
    // Create a minimal npm project with a passing test script
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        scripts: { test: 'echo "tests pass"', lint: 'echo "lint clean"' },
      })
    );

    const result = await runMechanicalGate(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.checks.length).toBeGreaterThan(0);
      expect(result.value.checks.every(c => c.name && c.command && typeof c.passed === 'boolean')).toBe(true);
    }
  });

  it('should use custom checks from gate.json', async () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(
      path.join(harnessDir, 'gate.json'),
      JSON.stringify({
        checks: [{ name: 'custom', command: 'echo "custom pass"' }],
      })
    );

    const result = await runMechanicalGate(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.checks.length).toBe(1);
      expect(result.value.checks[0].name).toBe('custom');
      expect(result.value.checks[0].passed).toBe(true);
    }
  });

  it('should report failed checks correctly', async () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(
      path.join(harnessDir, 'gate.json'),
      JSON.stringify({
        checks: [
          { name: 'pass', command: 'echo "ok"' },
          { name: 'fail', command: 'exit 1' },
        ],
      })
    );

    const result = await runMechanicalGate(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.passed).toBe(false);
      expect(result.value.checks.find(c => c.name === 'pass')?.passed).toBe(true);
      expect(result.value.checks.find(c => c.name === 'fail')?.passed).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm exec vitest run tests/state/gate.test.ts`
Expected: FAIL — `runMechanicalGate` not found

- [ ] **Step 3: Write implementation**

Add to `packages/core/src/state/state-manager.ts`:

```typescript
import { execSync } from 'child_process';
import { GateConfigSchema, type GateResult } from './types';

const GATE_CONFIG_FILE = 'gate.json';

export async function runMechanicalGate(
  projectPath: string
): Promise<Result<GateResult, Error>> {
  const harnessDir = path.join(projectPath, HARNESS_DIR);
  const gateConfigPath = path.join(harnessDir, GATE_CONFIG_FILE);

  try {
    let checks: Array<{ name: string; command: string }> = [];

    // Check for custom gate config
    if (fs.existsSync(gateConfigPath)) {
      const raw = JSON.parse(fs.readFileSync(gateConfigPath, 'utf-8'));
      const config = GateConfigSchema.safeParse(raw);
      if (config.success && config.data.checks) {
        checks = config.data.checks;
      }
    }

    // Auto-detect project type if no custom checks
    if (checks.length === 0) {
      const packageJsonPath = path.join(projectPath, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        const scripts = pkg.scripts || {};

        if (scripts.test) checks.push({ name: 'test', command: 'npm test' });
        if (scripts.lint) checks.push({ name: 'lint', command: 'npm run lint' });
        if (scripts.typecheck) checks.push({ name: 'typecheck', command: 'npm run typecheck' });
        if (scripts.build) checks.push({ name: 'build', command: 'npm run build' });
      }

      // Check for Go project
      if (fs.existsSync(path.join(projectPath, 'go.mod'))) {
        checks.push({ name: 'test', command: 'go test ./...' });
        checks.push({ name: 'build', command: 'go build ./...' });
      }

      // Check for Python project
      if (fs.existsSync(path.join(projectPath, 'pyproject.toml')) ||
          fs.existsSync(path.join(projectPath, 'setup.py'))) {
        checks.push({ name: 'test', command: 'python -m pytest' });
      }
    }

    // Run each check
    const results: GateResult['checks'] = [];

    for (const check of checks) {
      const start = Date.now();
      try {
        execSync(check.command, {
          cwd: projectPath,
          stdio: 'pipe',
          timeout: 120_000,
        });
        results.push({
          name: check.name,
          passed: true,
          command: check.command,
          duration: Date.now() - start,
        });
      } catch (error) {
        const output = error instanceof Error ? (error as any).stderr?.toString() || error.message : String(error);
        results.push({
          name: check.name,
          passed: false,
          command: check.command,
          output: output.slice(0, 2000),
          duration: Date.now() - start,
        });
      }
    }

    return Ok({
      passed: results.length === 0 || results.every(r => r.passed),
      checks: results,
    });
  } catch (error) {
    return Err(new Error(`Failed to run mechanical gate: ${error instanceof Error ? error.message : String(error)}`));
  }
}
```

Note: Add `import { execSync } from 'child_process';` to the top of state-manager.ts. Update the types import to include `GateConfigSchema` and `GateResult`.

- [ ] **Step 4: Update exports**

Add `runMechanicalGate` to `packages/core/src/state/index.ts`.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/core && pnpm exec vitest run tests/state/gate.test.ts`
Expected: PASS — all 4 tests pass

- [ ] **Step 6: Run all state tests**

Run: `cd packages/core && pnpm exec vitest run tests/state/`
Expected: PASS — all tests across all state test files pass

- [ ] **Step 7: Run full test suite**

Run: `cd packages/core && pnpm exec vitest run`
Expected: PASS — no regressions

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/state/state-manager.ts packages/core/src/state/index.ts packages/core/tests/state/gate.test.ts
git commit -m "feat(state): add runMechanicalGate for two-tier verification"
```

---

[checkpoint:human-verify]
"Core implementation complete (Tasks 1-6). All new schemas, functions, and tests are in place. Ready to proceed to skill SKILL.md updates (Tasks 7-12)?"

---

## Chunk 5: Mechanical Skill Updates

### Task 7: Update harness-execution SKILL.md

**Files:**
- Modify: `agents/skills/claude-code/harness-execution/SKILL.md`

- [ ] **Step 1: Add failure/learnings/handoff loading to PREPARE phase**

After the existing step 3 ("Load learnings"), add:

```markdown
4. **Load failures.** Read `.harness/failures.md` for known dead ends and anti-patterns. If any entries match the current plan's tasks or approaches, surface them as warnings before beginning work: "Warning: Previous failure on [topic] — [description]. Consider alternative approaches."

5. **Load handoff.** Read `.harness/handoff.json` if it exists. This contains structured context from the previous skill (planning or a prior execution session): what was completed, what is pending, any concerns or decisions. Use this to orient rather than re-reading the full plan from scratch.
```

- [ ] **Step 2: Add mechanical gate to EXECUTE phase**

After existing step 4 ("Commit atomically"), add:

```markdown
5. **Run mechanical gate.** After each task's commit, run the mechanical gate (test suite, linter, type checker, build, harness validate). This is a binary pass/fail check — all must pass.
   - **All pass:** Mark task complete, proceed to next task.
   - **Any fail:** Read the error output. Attempt to fix within the current task scope (max 2 retry attempts).
   - **Still failing after 2 retries:** Record the failure in `.harness/failures.md` with `appendFailure()`. Report the issue and escalate — do not proceed to the next task.
```

- [ ] **Step 3: Replace VERIFY phase with two-tier model**

Replace the existing Phase 3 VERIFY content with:

```markdown
### Phase 3: VERIFY — Two-Tier Validation

**Quick gate (default, after every task):**
The mechanical gate in Phase 2 Step 5 IS the standard verification. If all checks passed during execution, the task is verified.

**Deep audit (on-demand):**
When `--deep` is passed, or at milestone boundaries (final task in a plan), invoke the full harness-verification skill for 3-level EXISTS → SUBSTANTIVE → WIRED verification. This catches issues the mechanical gate cannot: stub implementations, missing test assertions, artifacts not wired into the system.

Do NOT invoke harness-verification after every task — only at key milestones or when explicitly requested.
```

- [ ] **Step 4: Update PERSIST phase**

Replace the existing Phase 4 PERSIST content with:

```markdown
### Phase 4: PERSIST — Save Progress, Learnings, Failures, and Handoff

Between tasks (especially between sessions):

1. **Update `.harness/state.json`** with current position, progress, decisions, and blockers. Include enriched session data:
   ```json
   {
     "lastSession": {
       "date": "YYYY-MM-DD",
       "summary": "Completed Tasks 1-3, starting Task 4",
       "lastSkill": "harness-execution",
       "pendingTasks": ["Task 4", "Task 5"]
     }
   }
   ```

2. **Append to `.harness/learnings.md`** with skill tags:
   ```markdown
   - **YYYY-MM-DD [skill:harness-execution] [outcome:gotcha]:** Description of what was learned
   ```

3. **Record failures** in `.harness/failures.md` if any task required escalation:
   ```markdown
   - **YYYY-MM-DD [skill:harness-execution] [type:dead-end]:** Attempted X approach for Task N, failed because Y. Do not retry unless Z changes.
   ```

4. **Write `.harness/handoff.json`** with structured context for the next session or skill:
   ```json
   {
     "timestamp": "ISO-8601",
     "fromSkill": "harness-execution",
     "phase": "PERSIST",
     "summary": "Completed N of M tasks",
     "completed": ["Task 1", ...],
     "pending": ["Task N+1", ...],
     "concerns": ["any issues noticed"],
     "decisions": [{"what": "...", "why": "..."}],
     "blockers": ["any unresolved blockers"],
     "contextKeywords": ["domain", "terms"]
   }
   ```

5. **Learnings are append-only.** Never edit or delete previous learnings.
```

- [ ] **Step 5: Add Trace Output section**

Add after the Escalation section:

```markdown
## Trace Output (Optional)

When the project's `.harness/gate.json` has `"trace": true`, or when `--verbose` is passed, append a one-sentence reasoning summary at each phase boundary to `.harness/trace.md`:

```
**[PREPARE 10:30:02]** Loaded 3 failures, 7 relevant learnings. No blockers from previous session.
**[EXECUTE 10:31:15]** Task 1 complete. Mechanical gate passed (4/4 checks).
**[VERIFY 10:45:00]** All 5 tasks verified via quick gate. No deep audit requested.
**[PERSIST 10:45:30]** Handoff written. 2 learnings captured. No failures.
```

This is for human debugging of agent behavior only. Not read by other skills. Not required.
```

- [ ] **Step 6: Commit**

```bash
git add agents/skills/claude-code/harness-execution/SKILL.md
git commit -m "feat(skills): update harness-execution with mechanical gate, handoffs, and failure tracking"
```

---

### Task 8: Update harness-verification SKILL.md

**Files:**
- Modify: `agents/skills/claude-code/harness-verification/SKILL.md`

- [ ] **Step 1: Read the current file**

Read `agents/skills/claude-code/harness-verification/SKILL.md` to understand current structure.

- [ ] **Step 2: Add tier clarification to When to Use**

Add after the existing "When to Use" bullets:

```markdown
### Verification Tiers

Harness uses a two-tier verification model:

| Tier | Skill | When | What |
|------|-------|------|------|
| **Quick gate** | harness-execution (built-in) | After every task | test + lint + typecheck + build + harness validate |
| **Deep audit** | harness-verification (this skill) | Milestones, PRs, on-demand | EXISTS → SUBSTANTIVE → WIRED |

Use this skill (deep audit) for milestone boundaries, before creating PRs, or when the quick gate passes but something feels wrong. Do NOT invoke this skill after every individual task — that is what the quick gate handles.
```

- [ ] **Step 3: Add Non-Determinism Tolerance section**

Add before the Examples section:

```markdown
## Non-Determinism Tolerance

For mechanical checks (tests pass, lint clean, types check), results are binary — pass or fail. No tolerance.

For behavioral verification (did the agent follow a convention, did the output match a style guide), accept threshold-based results:
- Run the check multiple times if needed
- "Agent followed the constraint in 4/5 runs" = pass
- "Agent followed the constraint in 2/5 runs" = fail — the convention is poorly written, not the agent

If a behavioral convention fails more than 40% of the time, the convention needs rewriting. Blame the instruction, not the executor.
```

- [ ] **Step 4: Add tagged learnings to completion**

Add to the end of the final verification phase:

```markdown
After verification completes, append a tagged learning:
```markdown
- **YYYY-MM-DD [skill:harness-verification] [outcome:pass/fail]:** Verified [feature]. [Brief note on what was found or confirmed.]
```
```

- [ ] **Step 5: Commit**

```bash
git add agents/skills/claude-code/harness-verification/SKILL.md
git commit -m "feat(skills): update harness-verification with tier clarification, error budgets, and tagged learnings"
```

---

### Task 9: Update harness-state-management SKILL.md

**Files:**
- Modify: `agents/skills/claude-code/harness-state-management/SKILL.md`

- [ ] **Step 1: Add new files documentation to Phase 1 LOAD**

After the existing step 3 ("Read `.harness/learnings.md`"), add:

```markdown
4. **Read `.harness/failures.md`** if it exists. Scan for active anti-patterns and dead ends. These prevent repeating known-failed approaches.

5. **Read `.harness/handoff.json`** if it exists. This contains structured context from the last skill that ran: what was completed, what is pending, concerns, and decisions. Use this for session orientation.

6. **Check `.harness/archive/`** for historical failure logs if investigating why a past approach was abandoned.
```

- [ ] **Step 2: Add archival workflow section**

Add after the "Building Institutional Knowledge Over Time" section:

```markdown
### Archival Workflow

The `.harness/failures.md` file is scoped to the current milestone. When a milestone completes:

1. **Archive failures:** Move `failures.md` to `.harness/archive/failures-YYYY-MM-DD.md` using `archiveFailures()` or manually. A fresh `failures.md` starts for the next milestone.
2. **Do NOT archive learnings.** `.harness/learnings.md` is permanent — it grows over the project lifetime. Learnings from past milestones remain valuable.
3. **Do NOT archive state.** `.harness/state.json` is overwritten with each session update. The git history preserves previous states.
4. **Handoff is ephemeral.** `.harness/handoff.json` is overwritten by whichever skill runs last. No archival needed.
```

- [ ] **Step 3: Update the Harness Integration section**

Add to the existing integration list:

```markdown
- **`.harness/failures.md`** — Active anti-patterns and dead ends. Read at session start, appended when failures occur. Archived at milestone boundaries.
- **`.harness/handoff.json`** — Structured context from the last skill. Read at session start for orientation. Overwritten by each skill.
- **`.harness/trace.md`** — Optional reasoning trace (when verbose/trace mode is on). For human debugging only.
- **`.harness/archive/`** — Archived failure logs from past milestones.
```

- [ ] **Step 4: Update the "What Belongs Where" table in Examples**

Add rows:

```markdown
| "Tried approach X, failed because Y" | `.harness/failures.md` | Anti-pattern that agents should avoid repeating |
| "Completed Tasks 1-3, Task 4 pending" | `.harness/handoff.json` | Structured context for next skill or session |
| "[PREPARE 10:30] Loaded 3 failures" | `.harness/trace.md` | Debugging agent behavior (optional) |
```

- [ ] **Step 5: Commit**

```bash
git add agents/skills/claude-code/harness-state-management/SKILL.md
git commit -m "feat(skills): update harness-state-management with failures, handoffs, trace, and archival docs"
```

---

### Task 10: Update harness-planning SKILL.md

**Files:**
- Modify: `agents/skills/claude-code/harness-planning/SKILL.md`

- [ ] **Step 1: Add failure checking to VALIDATE phase**

In the VALIDATE phase, add before "Write the plan":

```markdown
5. **Check failures log.** Read `.harness/failures.md` before finalizing the plan. If any planned approaches match known failures (same file, same pattern, same library), flag them:
   - "Warning: Task N uses approach X, which previously failed (see failures.md entry from YYYY-MM-DD). Consider alternative approach."
   - If the human decides to proceed anyway, note the risk in the plan.
```

- [ ] **Step 2: Add handoff writing**

Add after "Write the plan to `docs/plans/`":

```markdown
6. **Write handoff.** Save `.harness/handoff.json` so harness-execution can pick up context without re-reading the full plan:
   ```json
   {
     "timestamp": "ISO-8601",
     "fromSkill": "harness-planning",
     "phase": "VALIDATE",
     "summary": "N tasks planned for [feature]",
     "completed": [],
     "pending": ["Task 1", "Task 2", ...],
     "concerns": ["any concerns from planning"],
     "decisions": [{"what": "...", "why": "..."}],
     "blockers": [],
     "contextKeywords": ["key", "domain", "terms"]
   }
   ```
```

- [ ] **Step 3: Add Change Specifications section**

Add after the Harness Integration section:

```markdown
## Change Specifications

When planning changes to existing functionality (not greenfield), express requirements as deltas against existing behavior:

- `[ADDED]` — New behavior that doesn't exist yet
- `[MODIFIED]` — Existing behavior that changes (state before → after)
- `[REMOVED]` — Existing behavior being deleted

Example:
```
[MODIFIED] Auth middleware: session timeout 30min → 60min
[ADDED] Auth middleware: refresh token rotation on each request
[REMOVED] Auth middleware: legacy cookie-based fallback
```

This format is not mandatory for greenfield work. Use it when the plan modifies existing documented behavior, especially when a `docs/specs/` directory exists with source-of-truth specifications. When present, produce a `docs/changes/<feature>/delta.md` alongside the task plan.
```

- [ ] **Step 4: Commit**

```bash
git add agents/skills/claude-code/harness-planning/SKILL.md
git commit -m "feat(skills): update harness-planning with failure checking, handoff writing, and delta-spec format"
```

---

## Chunk 6: Behavioral Skill Updates and Templates

### Task 11: Update remaining skill SKILL.md files (behavioral patterns)

**Files:**
- Modify: `agents/skills/claude-code/harness-brainstorming/SKILL.md`
- Modify: `agents/skills/claude-code/harness-skill-authoring/SKILL.md`
- Modify: `agents/skills/claude-code/harness-onboarding/SKILL.md`

- [ ] **Step 1: Add Context Keywords to harness-brainstorming**

Add after the EVALUATE phase in SKILL.md:

```markdown
### Context Keywords

During Phase 2 (EVALUATE), as the design takes shape, extract 5-10 domain keywords that capture the core concepts being discussed. Include these in the spec document's frontmatter or opening section:

```markdown
**Keywords:** auth, middleware, session-tokens, jwt, refresh-rotation
```

These keywords flow into `.harness/handoff.json` (via the `contextKeywords` field) when planning picks up the spec. They keep agents anchored to the domain across phase transitions without requiring full-document repetition. Select keywords that would help a fresh agent quickly understand what area of the codebase this work relates to.
```

Also add to Phase 4 VALIDATE, after "Write the spec to `docs/`":

```markdown
When the project has a `docs/specs/` directory, write proposals to `docs/changes/<feature>/proposal.md` instead of a flat spec file. This follows the specs/changes convention: `docs/specs/` is the source of truth for what exists, `docs/changes/` is for what's being proposed. When no `docs/specs/` exists, fall back to the existing behavior.
```

- [ ] **Step 2: Add Skill Quality Checklist to harness-skill-authoring**

Add after the VALIDATE phase in SKILL.md:

```markdown
## Skill Quality Checklist

When authoring or reviewing a skill, evaluate on two independent dimensions:

**Activation clarity** — Can an agent determine WHEN to use this skill?
- **Clear:** Triggers are specific, "When to Use" lists concrete scenarios, negative cases ("NOT when...") are documented
- **Ambiguous:** Triggers are vague ("when working on code"), overlap with other skills, or missing negative cases
- **Missing:** No triggers defined, no "When to Use" section

**Implementation specificity** — Does the skill tell the agent HOW to do the work?
- **Specific:** Steps are concrete, phases have exact actions, examples show complete workflows
- **Vague:** Steps say "do the right thing" or "handle appropriately", phases are described abstractly
- **Missing:** No process section, no phases, no examples

A good skill scores **clear + specific**. A skill with clear activation but vague implementation is a trap — agents know to use it but don't know what to do. A skill with vague activation but specific implementation is wasted — great instructions that never fire.

Target: both dimensions should score **clear/specific** before a skill is considered production-ready.
```

- [ ] **Step 3: Add Adoption Maturity to harness-onboarding**

Add after the Examples section in SKILL.md:

```markdown
## Adoption Maturity

When onboarding a new developer or assessing a project's harness adoption, use this progression to understand where the project is and what to aim for next:

| Level | Name | Description |
|-------|------|-------------|
| 1 | **Manual** | Developer writes CLAUDE.md/AGENTS.md by hand, runs harness commands manually, no automated enforcement |
| 2 | **Repeatable** | Skills and personas are installed, agent follows conventions consistently, state management is active |
| 3 | **Automated** | Mechanical gates enforce constraints in CI, `harness validate` runs on every PR, failures auto-log to `.harness/failures.md` |
| 4 | **Self-improving** | Learnings accumulate across sessions, agents reference prior failures before starting work, institutional knowledge compounds over time |

This is not prescriptive — projects do not need to reach Level 4 to get value from harness. It is orientation: "you are here, here is what unlocks next." Most projects start at Level 1 and reach Level 2-3 within the first week of adoption.
```

- [ ] **Step 4: Commit**

```bash
git add agents/skills/claude-code/harness-brainstorming/SKILL.md agents/skills/claude-code/harness-skill-authoring/SKILL.md agents/skills/claude-code/harness-onboarding/SKILL.md
git commit -m "feat(skills): add behavioral patterns — context keywords, skill quality checklist, adoption maturity"
```

---

### Task 12: Add docs/specs/ and docs/changes/ to templates

**Files:**
- Modify: `templates/intermediate/template.json`
- Modify: `templates/advanced/template.json`
- Modify: `templates/nextjs/template.json`
- Create: `templates/intermediate/docs/specs/.gitkeep`
- Create: `templates/intermediate/docs/changes/.gitkeep`
- Create: `templates/advanced/docs/specs/.gitkeep`
- Create: `templates/advanced/docs/changes/.gitkeep`

- [ ] **Step 1: Read template.json files**

Read all three template.json files to understand their structure.

- [ ] **Step 2: Add .gitkeep files**

Create the following empty files:
- `templates/intermediate/docs/specs/.gitkeep`
- `templates/intermediate/docs/changes/.gitkeep`
- `templates/advanced/docs/specs/.gitkeep`
- `templates/advanced/docs/changes/.gitkeep`

Note: nextjs template does not have a docs/ directory — skip it to avoid adding structure that doesn't fit the template's convention.

- [ ] **Step 3: Update template.json files if they list files**

Check if `template.json` files enumerate their contents. If so, add the new directories. If they use glob patterns or implicit discovery, no change is needed.

- [ ] **Step 4: Commit**

```bash
git add templates/
git commit -m "feat(templates): add docs/specs/ and docs/changes/ to intermediate and advanced templates"
```

---

### Task 13: Final validation

- [ ] **Step 1: Run full test suite**

Run: `cd /Users/cwarner/Projects/harness-engineering/packages/core && pnpm exec vitest run`
Expected: PASS — all tests pass including new state tests

- [ ] **Step 2: Run cross-check tests**

Run: `cd /Users/cwarner/Projects/harness-engineering/packages/cli && pnpm exec vitest run tests/commands/validate-cross-check.test.ts`
Expected: PASS — cross-check tests pass with new docs/specs/ and docs/plans/ paths

- [ ] **Step 3: Verify no superpowers directory references**

Run: `grep -r "docs/superpowers" --include="*.ts" --include="*.md" --include="*.json" --include="*.yaml" /Users/cwarner/Projects/harness-engineering/ | grep -v node_modules | grep -v ".git/"`
Expected: No matches (only `superpowers:` skill name references should remain)

- [ ] **Step 4: Commit any fixes**

If any issues found, fix and commit.

- [ ] **Step 5: Final commit message**

No commit needed if all passes. The work is complete.

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | Zod schemas + lastSession extension | types.ts, index.ts |
| 2 | appendFailure + loadFailures | state-manager.ts |
| 3 | archiveFailures | state-manager.ts |
| 4 | Tagged appendLearning + loadRelevantLearnings | state-manager.ts |
| 5 | saveHandoff + loadHandoff | state-manager.ts |
| 6 | runMechanicalGate | state-manager.ts |
| 7 | harness-execution SKILL.md (mechanical) | SKILL.md |
| 8 | harness-verification SKILL.md (mechanical) | SKILL.md |
| 9 | harness-state-management SKILL.md (mechanical) | SKILL.md |
| 10 | harness-planning SKILL.md (mechanical) | SKILL.md |
| 11 | Behavioral skill updates (3 skills) | 3x SKILL.md |
| 12 | Template directory scaffolding | templates/ |
| 13 | Final validation | — |

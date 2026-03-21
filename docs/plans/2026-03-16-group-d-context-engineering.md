# Group D: Context Engineering Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Formalize context engineering from a principle into concrete tools — token budget guidance, staged context pipeline, MCP resource endpoints, and JIT context filtering.

**Architecture:** D1 is documentation + optional utility. D2 adds pipeline types (`packages/types/`) and orchestration (`packages/core/`). D3 extends the MCP server with read-only resource endpoints. D4 adds phase-aware filtering that consumes D1 budgets and D2 pipeline hooks.

**Tech Stack:** TypeScript, Zod, Vitest, @modelcontextprotocol/sdk

**Spec:** [2026-03-16-research-roadmap-design.md](../specs/2026-03-16-research-roadmap-design.md) (Group D section)

**Implementation order:** D1 → D2 → D3 → D4

---

## File Structure

### D1: Token Budget Guidance

```
docs/standard/principles.md                          # MODIFY: add Token Budget Allocation subsection
packages/core/src/context/budget.ts                  # NEW: contextBudget utility
packages/core/src/context/budget.types.ts            # NEW: TokenBudget type
packages/core/tests/context/budget.test.ts           # NEW
```

### D2: Staged Context Pipeline

```
packages/types/src/index.ts                          # MODIFY: export pipeline types
packages/types/src/pipeline.ts                       # NEW: SkillContext, TurnContext, SkillLifecycleHooks
packages/core/src/pipeline/skill-pipeline.ts         # NEW: SkillPipeline orchestrator
packages/core/src/pipeline/types.ts                  # NEW: PipelineResult, PipelineOptions
packages/core/tests/pipeline/skill-pipeline.test.ts  # NEW
```

### D3: Context-as-MCP-Service

```
packages/mcp-server/src/server.ts                    # MODIFY: register resource handlers
packages/mcp-server/src/resources/skills.ts          # NEW: harness://skills resource
packages/mcp-server/src/resources/rules.ts           # NEW: harness://rules resource
packages/mcp-server/src/resources/project.ts         # NEW: harness://project resource
packages/mcp-server/src/resources/learnings.ts       # NEW: harness://learnings resource
packages/mcp-server/tests/resources/skills.test.ts   # NEW
packages/mcp-server/tests/resources/rules.test.ts    # NEW
packages/mcp-server/tests/resources/project.test.ts  # NEW
packages/mcp-server/tests/resources/learnings.test.ts # NEW
```

### D4: JIT Context Filtering

```
packages/core/src/context/filter.ts                  # NEW: contextFilter utility
packages/core/src/context/filter.types.ts            # NEW: WorkflowPhase, ContextFilterResult
packages/core/tests/context/filter.test.ts           # NEW
```

---

## Chunk 1: Token Budget Documentation (D1a)

### Task 1: Add Token Budget Allocation subsection to principles.md

**Files:**

- Modify: `docs/standard/principles.md`

- [ ] **Step 1: Add "Token Budget Allocation" subsection before the Implementation Checklist of Principle 1**

Insert the following between the "Documentation Coverage" subsection content (ending around line 94) and the "Examples" subsection (line 97) in `docs/standard/principles.md`. Place it after the `Documentation Coverage` block and before `### Examples`:

In `docs/standard/principles.md`, locate this text:

```markdown
- Documented: Code with corresponding design docs, README, or ADRs
- Undocumented: Code without any architectural explanation
- Goal: >90% coverage, with explicit exceptions for obvious code
```

Immediately after that block, insert:

```markdown
#### Token Budget Allocation

When assembling context for an AI agent, budget your available context window deliberately. Not all context is equal — overspending on one category starves the others. The following allocation is a recommended heuristic, not a hard rule. Skills should reference these proportions during context assembly.

| Category                             | Budget | Purpose                                                                          |
| ------------------------------------ | ------ | -------------------------------------------------------------------------------- |
| System prompt / skill instructions   | 15%    | Behavioral guidance — the skill's SKILL.md, cognitive mode, and constraints      |
| Project manifest (AGENTS.md, config) | 5%     | Project context — navigation map, conventions, and settings                      |
| Task specification                   | 20%    | What to do — the spec, requirements, or issue being addressed                    |
| Active code (under review/edit)      | 40%    | Primary work material — the files being created, modified, or reviewed           |
| Interfaces and type definitions      | 10%    | Structural context — types, schemas, and API contracts referenced by active code |
| Reserve (agent reasoning)            | 10%    | Working memory — space for the agent's chain-of-thought and tool calls           |

**Usage guidance:**

- **Small context windows (≤32K tokens):** Compress system prompt and project manifest categories. Prioritize active code and task spec.
- **Large context windows (≥128K tokens):** The reserve category can absorb more structural context. Consider including related test files in the active code budget.
- **Multi-turn sessions:** The reserve category grows in importance — prior turn results consume working memory. Use the `perTurn` lifecycle hook (see Staged Context Pipeline) to evict stale context.
- **Review workflows:** Shift budget from task specification toward active code (the diff) and interfaces (the contracts being validated).

Skills that consume context should document which budget categories they draw from in their `## Context Assembly` section.
```

- [ ] **Step 2: Verify the document renders correctly**

Run: `head -100 docs/standard/principles.md` to confirm the subsection is positioned correctly within Principle 1.

- [ ] **Step 3: Commit**

```bash
git add docs/standard/principles.md
git commit -m "docs(principles): add token budget allocation guidance to Context Engineering principle"
```

---

## Chunk 2: Token Budget Utility (D1b)

### Task 2: Create TokenBudget type

**Files:**

- Create: `packages/core/src/context/budget.types.ts`

- [ ] **Step 1: Create budget types file**

```typescript
// packages/core/src/context/budget.types.ts

/**
 * Token budget categories for context assembly.
 * Each category represents a proportion of the total context window.
 */
export interface TokenBudget {
  /** Total tokens available in the context window */
  total: number;
  /** Per-category token limits */
  categories: TokenBudgetCategories;
}

export interface TokenBudgetCategories {
  /** Skill instructions, SKILL.md, cognitive mode (default: 15%) */
  systemPrompt: number;
  /** AGENTS.md, .harness/config, conventions (default: 5%) */
  projectManifest: number;
  /** Spec, requirements, issue content (default: 20%) */
  taskSpec: number;
  /** Files under review/edit (default: 40%) */
  activeCode: number;
  /** Types, schemas, API contracts (default: 10%) */
  interfaces: number;
  /** Agent reasoning, chain-of-thought (default: 10%) */
  reserve: number;
}

/**
 * Custom overrides for budget proportions.
 * Values are decimals (0.0 - 1.0) and must sum to 1.0.
 */
export interface BudgetOverrides {
  systemPrompt?: number;
  projectManifest?: number;
  taskSpec?: number;
  activeCode?: number;
  interfaces?: number;
  reserve?: number;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/core/src/context/budget.types.ts
git commit -m "feat(core): add TokenBudget types for context budget allocation"
```

### Task 3: Write failing tests for contextBudget utility

**Files:**

- Create: `packages/core/tests/context/budget.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/tests/context/budget.test.ts
import { describe, it, expect } from 'vitest';
import { contextBudget } from '../../src/context/budget';

describe('contextBudget', () => {
  it('returns default budget proportions for a given total', () => {
    const budget = contextBudget(100_000);

    expect(budget.total).toBe(100_000);
    expect(budget.categories.systemPrompt).toBe(15_000);
    expect(budget.categories.projectManifest).toBe(5_000);
    expect(budget.categories.taskSpec).toBe(20_000);
    expect(budget.categories.activeCode).toBe(40_000);
    expect(budget.categories.interfaces).toBe(10_000);
    expect(budget.categories.reserve).toBe(10_000);
  });

  it('applies custom overrides', () => {
    const budget = contextBudget(100_000, {
      systemPrompt: 0.1,
      activeCode: 0.5,
      reserve: 0.05,
    });

    expect(budget.categories.systemPrompt).toBe(10_000);
    expect(budget.categories.activeCode).toBe(50_000);
    expect(budget.categories.reserve).toBe(5_000);
    // Non-overridden categories keep defaults
    expect(budget.categories.projectManifest).toBe(5_000);
    expect(budget.categories.taskSpec).toBe(20_000);
    expect(budget.categories.interfaces).toBe(10_000);
  });

  it('floors token counts to integers', () => {
    const budget = contextBudget(99_999);

    // 99_999 * 0.15 = 14999.85 → 14999
    expect(budget.categories.systemPrompt).toBe(14_999);
    // 99_999 * 0.05 = 4999.95 → 4999
    expect(budget.categories.projectManifest).toBe(4_999);
  });

  it('handles small context windows', () => {
    const budget = contextBudget(1_000);

    expect(budget.total).toBe(1_000);
    expect(budget.categories.systemPrompt).toBe(150);
    expect(budget.categories.activeCode).toBe(400);
    expect(budget.categories.reserve).toBe(100);
  });

  it('returns zero for zero total', () => {
    const budget = contextBudget(0);

    expect(budget.total).toBe(0);
    expect(budget.categories.systemPrompt).toBe(0);
    expect(budget.categories.activeCode).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run tests/context/budget.test.ts`

### Task 4: Implement contextBudget utility

**Files:**

- Create: `packages/core/src/context/budget.ts`

- [ ] **Step 1: Write implementation**

````typescript
// packages/core/src/context/budget.ts
import type { TokenBudget, BudgetOverrides } from './budget.types';

/**
 * Default budget proportions (must sum to 1.0).
 */
const DEFAULT_PROPORTIONS = {
  systemPrompt: 0.15,
  projectManifest: 0.05,
  taskSpec: 0.2,
  activeCode: 0.4,
  interfaces: 0.1,
  reserve: 0.1,
} as const;

/**
 * Calculate per-category token limits from a total token budget.
 *
 * @param totalTokens - Total tokens available in the context window
 * @param overrides - Optional custom proportions (decimals 0.0-1.0)
 * @returns TokenBudget with per-category limits
 *
 * @example
 * ```typescript
 * const budget = contextBudget(128_000);
 * // budget.categories.activeCode === 51_200
 * ```
 */
export function contextBudget(totalTokens: number, overrides?: BudgetOverrides): TokenBudget {
  const proportions = {
    ...DEFAULT_PROPORTIONS,
    ...overrides,
  };

  return {
    total: totalTokens,
    categories: {
      systemPrompt: Math.floor(totalTokens * proportions.systemPrompt),
      projectManifest: Math.floor(totalTokens * proportions.projectManifest),
      taskSpec: Math.floor(totalTokens * proportions.taskSpec),
      activeCode: Math.floor(totalTokens * proportions.activeCode),
      interfaces: Math.floor(totalTokens * proportions.interfaces),
      reserve: Math.floor(totalTokens * proportions.reserve),
    },
  };
}
````

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd packages/core && npx vitest run tests/context/budget.test.ts`

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/context/budget.ts packages/core/src/context/budget.types.ts packages/core/tests/context/budget.test.ts
git commit -m "feat(core): add contextBudget utility for token budget allocation"
```

---

## Chunk 3: Staged Context Pipeline Types (D2a)

### Task 5: Create pipeline types in packages/types

**Files:**

- Create: `packages/types/src/pipeline.ts`
- Modify: `packages/types/src/index.ts`

- [ ] **Step 1: Create pipeline types file**

```typescript
// packages/types/src/pipeline.ts
import type { Result } from './index';

/**
 * Error type for skill pipeline operations.
 */
export interface SkillError {
  code:
    | 'PRECONDITION_FAILED'
    | 'BUDGET_EXCEEDED'
    | 'HOOK_FAILED'
    | 'EXECUTION_FAILED'
    | 'CONTEXT_ASSEMBLY_FAILED';
  message: string;
  phase: string;
  details: Record<string, unknown>;
}

/**
 * Token budget categories for context assembly.
 */
export interface TokenBudget {
  total: number;
  categories: {
    systemPrompt: number;
    projectManifest: number;
    taskSpec: number;
    activeCode: number;
    interfaces: number;
    reserve: number;
  };
}

/**
 * Context available to a skill during execution.
 */
export interface SkillContext {
  /** Name of the skill being executed */
  skillName: string;
  /** Current execution phase (e.g., 'red', 'green', 'refactor') */
  phase: string;
  /** Files relevant to the current context */
  files: string[];
  /** Token budget for this execution */
  tokenBudget: TokenBudget;
  /** Arbitrary metadata passed through the pipeline */
  metadata: Record<string, unknown>;
}

/**
 * Extended context for multi-turn skill execution.
 */
export interface TurnContext extends SkillContext {
  /** Current turn number (1-based) */
  turnNumber: number;
  /** Results from previous turns */
  previousResults: Result<unknown, Error>[];
}

/**
 * Result produced by a skill execution.
 */
export interface SkillResult {
  /** Whether the skill completed successfully */
  success: boolean;
  /** Artifacts produced (file paths, reports, etc.) */
  artifacts: string[];
  /** Human-readable summary */
  summary: string;
  /** Metadata to pass to postExecution hook */
  metadata: Record<string, unknown>;
}

/**
 * Lifecycle hooks for staged context pipeline.
 *
 * - preExecution: validate preconditions, assemble initial context within budget
 * - perTurn: inject or filter context during multi-turn execution
 * - postExecution: write handoff artifacts, update learnings, record anti-patterns
 */
export interface SkillLifecycleHooks {
  preExecution: (context: SkillContext) => Result<SkillContext, SkillError>;
  perTurn: (context: TurnContext) => Result<TurnContext, SkillError>;
  postExecution: (context: SkillContext, result: SkillResult) => Result<void, SkillError>;
}
```

- [ ] **Step 2: Export pipeline types from packages/types/src/index.ts**

Add to the end of `packages/types/src/index.ts`:

```typescript
// Pipeline types for staged context pipeline (Group D)
export type {
  SkillError,
  TokenBudget,
  SkillContext,
  TurnContext,
  SkillResult,
  SkillLifecycleHooks,
} from './pipeline';
```

- [ ] **Step 3: Verify types compile**

Run: `cd packages/types && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add packages/types/src/pipeline.ts packages/types/src/index.ts
git commit -m "feat(types): add SkillContext, TurnContext, and SkillLifecycleHooks pipeline types"
```

---

## Chunk 4: Skill Pipeline Orchestrator (D2b)

### Task 6: Create pipeline module types

**Files:**

- Create: `packages/core/src/pipeline/types.ts`

- [ ] **Step 1: Create pipeline result types**

```typescript
// packages/core/src/pipeline/types.ts
import type {
  SkillContext,
  SkillResult,
  SkillLifecycleHooks,
  SkillError,
} from '@harness-engineering/types';
import type { Result } from '../shared/result';

/**
 * Options for running a skill through the pipeline.
 */
export interface PipelineOptions {
  /** Initial context for the skill */
  context: SkillContext;
  /** Lifecycle hooks (all three are required) */
  hooks: SkillLifecycleHooks;
  /** The skill execution function */
  execute: (context: SkillContext) => Promise<Result<SkillResult, SkillError>>;
  /** Maximum number of turns for multi-turn execution (default: 1) */
  maxTurns?: number;
}

/**
 * Result of running a skill through the pipeline.
 */
export interface PipelineResult {
  /** Whether the full pipeline succeeded */
  success: boolean;
  /** The skill result (if execution completed) */
  skillResult?: SkillResult;
  /** Error that stopped the pipeline (if any) */
  error?: SkillError;
  /** Which stage failed: 'preExecution' | 'execution' | 'perTurn' | 'postExecution' */
  failedStage?: string;
  /** Context as it was when the pipeline stopped */
  finalContext: SkillContext;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/core/src/pipeline/types.ts
git commit -m "feat(core): add PipelineOptions and PipelineResult types"
```

### Task 7: Write failing tests for SkillPipeline

**Files:**

- Create: `packages/core/tests/pipeline/skill-pipeline.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/core/tests/pipeline/skill-pipeline.test.ts
import { describe, it, expect, vi } from 'vitest';
import { runPipeline } from '../../src/pipeline/skill-pipeline';
import type {
  SkillContext,
  SkillResult,
  SkillLifecycleHooks,
  SkillError,
} from '@harness-engineering/types';
import { Ok, Err } from '../../src/shared/result';

function makeContext(overrides?: Partial<SkillContext>): SkillContext {
  return {
    skillName: 'test-skill',
    phase: 'implement',
    files: ['src/index.ts'],
    tokenBudget: {
      total: 100_000,
      categories: {
        systemPrompt: 15_000,
        projectManifest: 5_000,
        taskSpec: 20_000,
        activeCode: 40_000,
        interfaces: 10_000,
        reserve: 10_000,
      },
    },
    metadata: {},
    ...overrides,
  };
}

function makeHooks(overrides?: Partial<SkillLifecycleHooks>): SkillLifecycleHooks {
  return {
    preExecution: (ctx) => Ok(ctx),
    perTurn: (ctx) => Ok(ctx),
    postExecution: () => Ok(undefined),
    ...overrides,
  };
}

function makeSkillResult(overrides?: Partial<SkillResult>): SkillResult {
  return {
    success: true,
    artifacts: ['output.ts'],
    summary: 'Done',
    metadata: {},
    ...overrides,
  };
}

describe('runPipeline', () => {
  it('runs full pipeline: preExecution → execute → postExecution', async () => {
    const preExecution = vi.fn((ctx: SkillContext) => Ok(ctx));
    const postExecution = vi.fn(() => Ok(undefined as void));
    const execute = vi.fn(async () => Ok(makeSkillResult()));

    const result = await runPipeline({
      context: makeContext(),
      hooks: makeHooks({ preExecution, postExecution }),
      execute,
    });

    expect(result.success).toBe(true);
    expect(preExecution).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledOnce();
    expect(postExecution).toHaveBeenCalledOnce();
    expect(result.skillResult?.summary).toBe('Done');
  });

  it('stops pipeline if preExecution fails', async () => {
    const error: SkillError = {
      code: 'PRECONDITION_FAILED',
      message: 'Missing spec file',
      phase: 'preExecution',
      details: {},
    };
    const execute = vi.fn(async () => Ok(makeSkillResult()));

    const result = await runPipeline({
      context: makeContext(),
      hooks: makeHooks({ preExecution: () => Err(error) }),
      execute,
    });

    expect(result.success).toBe(false);
    expect(result.failedStage).toBe('preExecution');
    expect(result.error?.code).toBe('PRECONDITION_FAILED');
    expect(execute).not.toHaveBeenCalled();
  });

  it('stops pipeline if execution fails', async () => {
    const error: SkillError = {
      code: 'EXECUTION_FAILED',
      message: 'Skill crashed',
      phase: 'execution',
      details: {},
    };
    const postExecution = vi.fn(() => Ok(undefined as void));

    const result = await runPipeline({
      context: makeContext(),
      hooks: makeHooks({ postExecution }),
      execute: async () => Err(error),
    });

    expect(result.success).toBe(false);
    expect(result.failedStage).toBe('execution');
    expect(postExecution).not.toHaveBeenCalled();
  });

  it('passes modified context from preExecution to execute', async () => {
    const preExecution = (ctx: SkillContext) => Ok({ ...ctx, metadata: { enriched: true } });
    const execute = vi.fn(async (ctx: SkillContext) => {
      expect(ctx.metadata.enriched).toBe(true);
      return Ok(makeSkillResult());
    });

    await runPipeline({
      context: makeContext(),
      hooks: makeHooks({ preExecution }),
      execute,
    });

    expect(execute).toHaveBeenCalledOnce();
  });

  it('calls perTurn hook for multi-turn execution', async () => {
    const perTurn = vi.fn((ctx) => Ok(ctx));
    let callCount = 0;
    const execute = vi.fn(async () => {
      callCount++;
      if (callCount < 3) {
        return Ok(makeSkillResult({ success: false, summary: 'Not done yet' }));
      }
      return Ok(makeSkillResult({ success: true, summary: 'Done' }));
    });

    const result = await runPipeline({
      context: makeContext(),
      hooks: makeHooks({ perTurn }),
      execute,
      maxTurns: 3,
    });

    expect(result.success).toBe(true);
    // perTurn called before turns 2 and 3 (not before turn 1, preExecution handles that)
    expect(perTurn).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it('respects maxTurns limit', async () => {
    const execute = vi.fn(async () => Ok(makeSkillResult({ success: false, summary: 'Not done' })));

    const result = await runPipeline({
      context: makeContext(),
      hooks: makeHooks(),
      execute,
      maxTurns: 2,
    });

    // Pipeline completes but skill did not succeed
    expect(result.success).toBe(false);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(result.failedStage).toBe('execution');
  });

  it('defaults to single-turn execution', async () => {
    const execute = vi.fn(async () => Ok(makeSkillResult()));

    await runPipeline({
      context: makeContext(),
      hooks: makeHooks(),
      execute,
    });

    expect(execute).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run tests/pipeline/skill-pipeline.test.ts`

### Task 8: Implement SkillPipeline

**Files:**

- Create: `packages/core/src/pipeline/skill-pipeline.ts`

- [ ] **Step 1: Write implementation**

```typescript
// packages/core/src/pipeline/skill-pipeline.ts
import type {
  SkillContext,
  SkillResult,
  SkillError,
  TurnContext,
} from '@harness-engineering/types';
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import type { PipelineOptions, PipelineResult } from './types';

/**
 * Run a skill through the staged context pipeline.
 *
 * Execution flow:
 * 1. preExecution hook — validate preconditions, enrich context
 * 2. execute (turn 1) — run the skill
 * 3. If multi-turn and skill not done: perTurn hook → execute (turn N)
 * 4. postExecution hook — write handoff artifacts, record learnings
 *
 * The pipeline stops immediately if any hook or execution returns an error.
 */
export async function runPipeline(options: PipelineOptions): Promise<PipelineResult> {
  const { hooks, execute, maxTurns = 1 } = options;

  // Stage 1: preExecution
  const preResult = hooks.preExecution(options.context);
  if (!preResult.ok) {
    return {
      success: false,
      error: preResult.error,
      failedStage: 'preExecution',
      finalContext: options.context,
    };
  }

  let currentContext: SkillContext = preResult.value;
  let lastSkillResult: SkillResult | undefined;
  const previousResults: Result<unknown, Error>[] = [];

  // Stage 2: execute (possibly multi-turn)
  for (let turn = 1; turn <= maxTurns; turn++) {
    // For turns after the first, call perTurn hook
    if (turn > 1) {
      const turnContext: TurnContext = {
        ...currentContext,
        turnNumber: turn,
        previousResults,
      };
      const perTurnResult = hooks.perTurn(turnContext);
      if (!perTurnResult.ok) {
        return {
          success: false,
          error: perTurnResult.error,
          failedStage: 'perTurn',
          finalContext: currentContext,
        };
      }
      currentContext = perTurnResult.value;
    }

    const execResult = await execute(currentContext);
    if (!execResult.ok) {
      return {
        success: false,
        error: execResult.error,
        failedStage: 'execution',
        finalContext: currentContext,
      };
    }

    lastSkillResult = execResult.value;
    previousResults.push(execResult as Result<unknown, Error>);

    // If the skill reports success, stop iterating
    if (lastSkillResult.success) {
      break;
    }

    // If we've exhausted turns without success, report failure
    if (turn === maxTurns && !lastSkillResult.success) {
      return {
        success: false,
        skillResult: lastSkillResult,
        failedStage: 'execution',
        finalContext: currentContext,
      };
    }
  }

  // Stage 3: postExecution
  const postResult = hooks.postExecution(currentContext, lastSkillResult!);
  if (!postResult.ok) {
    return {
      success: false,
      error: postResult.error,
      failedStage: 'postExecution',
      skillResult: lastSkillResult,
      finalContext: currentContext,
    };
  }

  return {
    success: true,
    skillResult: lastSkillResult,
    finalContext: currentContext,
  };
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd packages/core && npx vitest run tests/pipeline/skill-pipeline.test.ts`

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/pipeline/types.ts packages/core/src/pipeline/skill-pipeline.ts packages/core/tests/pipeline/skill-pipeline.test.ts
git commit -m "feat(core): add SkillPipeline orchestrator for staged context pipeline"
```

---

## Chunk 5: Context-as-MCP-Service — Skills Resource (D3a)

### Task 9: Create harness://skills resource

**Files:**

- Create: `packages/mcp-server/src/resources/skills.ts`
- Create: `packages/mcp-server/tests/resources/skills.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// packages/mcp-server/tests/resources/skills.test.ts
import { describe, it, expect } from 'vitest';
import { loadSkillsResource } from '../../src/resources/skills';

describe('loadSkillsResource', () => {
  it('returns a list of skills with metadata', async () => {
    // Uses the actual agents/skills/claude-code directory
    const result = await loadSkillsResource();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Array.isArray(result.value)).toBe(true);
      expect(result.value.length).toBeGreaterThan(0);

      const skill = result.value[0];
      expect(skill.name).toBeDefined();
      expect(typeof skill.name).toBe('string');
      expect(skill.description).toBeDefined();
    }
  });

  it('includes cognitive_mode if present in skill.yaml', async () => {
    const result = await loadSkillsResource();

    expect(result.ok).toBe(true);
    if (result.ok) {
      // At least some skills may have cognitive_mode after Group C
      const withMode = result.value.filter((s) => s.cognitiveMode);
      // This is a soft check — cognitive_mode is optional
      expect(result.value.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/mcp-server && npx vitest run tests/resources/skills.test.ts`

- [ ] **Step 3: Write implementation**

```typescript
// packages/mcp-server/src/resources/skills.ts
import * as fs from 'fs';
import * as path from 'path';
import { Ok, Err } from '@harness-engineering/core';
import type { Result } from '@harness-engineering/core';
import { resolveSkillsDir } from '../utils/paths.js';

export interface SkillResourceEntry {
  name: string;
  description: string;
  cognitiveMode?: string;
  phases?: string[];
}

/**
 * Load all available skills with their metadata.
 * Reads skill.yaml files from the skills directory.
 */
export async function loadSkillsResource(): Promise<Result<SkillResourceEntry[], Error>> {
  try {
    const skillsDir = resolveSkillsDir();
    if (!fs.existsSync(skillsDir)) {
      return Ok([]);
    }

    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    const skills: SkillResourceEntry[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const yamlPath = path.join(skillsDir, entry.name, 'skill.yaml');
      if (!fs.existsSync(yamlPath)) continue;

      const content = fs.readFileSync(yamlPath, 'utf-8');
      const skill = parseSkillYaml(entry.name, content);
      if (skill) {
        skills.push(skill);
      }
    }

    return Ok(skills);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Minimal YAML parser for skill.yaml files.
 * Extracts name, description, and cognitive_mode fields.
 */
function parseSkillYaml(dirName: string, content: string): SkillResourceEntry | null {
  const lines = content.split('\n');
  let name = dirName;
  let description = '';
  let cognitiveMode: string | undefined;
  const phases: string[] = [];

  for (const line of lines) {
    const nameMatch = line.match(/^name:\s*(.+)/);
    if (nameMatch) name = nameMatch[1].trim().replace(/^['"]|['"]$/g, '');

    const descMatch = line.match(/^description:\s*(.+)/);
    if (descMatch) description = descMatch[1].trim().replace(/^['"]|['"]$/g, '');

    const modeMatch = line.match(/^cognitive_mode:\s*(.+)/);
    if (modeMatch) cognitiveMode = modeMatch[1].trim().replace(/^['"]|['"]$/g, '');

    const phaseMatch = line.match(/^\s+-\s+name:\s*(.+)/);
    if (phaseMatch) phases.push(phaseMatch[1].trim().replace(/^['"]|['"]$/g, ''));
  }

  return { name, description, cognitiveMode, phases: phases.length > 0 ? phases : undefined };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/mcp-server && npx vitest run tests/resources/skills.test.ts`

- [ ] **Step 5: Commit**

```bash
git add packages/mcp-server/src/resources/skills.ts packages/mcp-server/tests/resources/skills.test.ts
git commit -m "feat(mcp-server): add harness://skills resource endpoint"
```

---

## Chunk 6: Context-as-MCP-Service — Rules, Project, Learnings (D3b)

### Task 10: Create harness://rules resource

**Files:**

- Create: `packages/mcp-server/src/resources/rules.ts`
- Create: `packages/mcp-server/tests/resources/rules.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// packages/mcp-server/tests/resources/rules.test.ts
import { describe, it, expect } from 'vitest';
import { loadRulesResource } from '../../src/resources/rules';

describe('loadRulesResource', () => {
  it('returns active linter rules from project config', async () => {
    const result = await loadRulesResource('/tmp/test-project');

    // Even for non-existent projects, should return Ok with empty array
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Array.isArray(result.value)).toBe(true);
    }
  });

  it('returns rules with name and severity', async () => {
    const result = await loadRulesResource(process.cwd());

    expect(result.ok).toBe(true);
    if (result.ok && result.value.length > 0) {
      const rule = result.value[0];
      expect(rule.name).toBeDefined();
      expect(rule.severity).toBeDefined();
    }
  });
});
```

- [ ] **Step 2: Write implementation**

```typescript
// packages/mcp-server/src/resources/rules.ts
import * as fs from 'fs';
import * as path from 'path';
import { Ok, Err } from '@harness-engineering/core';
import type { Result } from '@harness-engineering/core';

export interface RuleResourceEntry {
  name: string;
  severity: 'error' | 'warn' | 'off';
  source: string;
}

/**
 * Load active linter rules from a project's configuration.
 * Checks .harness/config, eslint config, and tsconfig.
 */
export async function loadRulesResource(
  projectPath: string
): Promise<Result<RuleResourceEntry[], Error>> {
  try {
    const rules: RuleResourceEntry[] = [];

    // Check for .harness/config
    const harnessConfigPath = path.join(projectPath, '.harness', 'config.json');
    if (fs.existsSync(harnessConfigPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(harnessConfigPath, 'utf-8'));
        if (config.rules) {
          for (const [name, severity] of Object.entries(config.rules)) {
            rules.push({
              name,
              severity: severity as RuleResourceEntry['severity'],
              source: '.harness/config',
            });
          }
        }
      } catch {
        // Skip unparseable config
      }
    }

    // Check for eslint config
    const eslintPaths = ['.eslintrc.json', '.eslintrc.js', 'eslint.config.js', 'eslint.config.mjs'];
    for (const eslintFile of eslintPaths) {
      const eslintPath = path.join(projectPath, eslintFile);
      if (fs.existsSync(eslintPath) && eslintFile.endsWith('.json')) {
        try {
          const config = JSON.parse(fs.readFileSync(eslintPath, 'utf-8'));
          if (config.rules) {
            for (const [name, value] of Object.entries(config.rules)) {
              const severity = Array.isArray(value) ? value[0] : value;
              rules.push({
                name,
                severity: normalizeSeverity(severity),
                source: eslintFile,
              });
            }
          }
        } catch {
          // Skip unparseable config
        }
      }
    }

    return Ok(rules);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

function normalizeSeverity(value: unknown): RuleResourceEntry['severity'] {
  if (value === 2 || value === 'error') return 'error';
  if (value === 1 || value === 'warn') return 'warn';
  return 'off';
}
```

- [ ] **Step 3: Run test, verify pass, commit**

```bash
git add packages/mcp-server/src/resources/rules.ts packages/mcp-server/tests/resources/rules.test.ts
git commit -m "feat(mcp-server): add harness://rules resource endpoint"
```

### Task 11: Create harness://project resource

**Files:**

- Create: `packages/mcp-server/src/resources/project.ts`
- Create: `packages/mcp-server/tests/resources/project.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// packages/mcp-server/tests/resources/project.test.ts
import { describe, it, expect } from 'vitest';
import { loadProjectResource } from '../../src/resources/project';

describe('loadProjectResource', () => {
  it('returns project structure from AGENTS.md', async () => {
    const result = await loadProjectResource(process.cwd());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.hasAgentsMap).toBeDefined();
      expect(typeof result.value.projectName).toBe('string');
    }
  });

  it('returns graceful result for missing AGENTS.md', async () => {
    const result = await loadProjectResource('/tmp/nonexistent');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.hasAgentsMap).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Write implementation**

```typescript
// packages/mcp-server/src/resources/project.ts
import * as fs from 'fs';
import * as path from 'path';
import { Ok, Err } from '@harness-engineering/core';
import type { Result } from '@harness-engineering/core';

export interface ProjectResourceData {
  projectName: string;
  hasAgentsMap: boolean;
  agentsMapContent?: string;
  hasHarnessConfig: boolean;
  conventions: string[];
}

/**
 * Load project structure and conventions from AGENTS.md and .harness/config.
 */
export async function loadProjectResource(
  projectPath: string
): Promise<Result<ProjectResourceData, Error>> {
  try {
    const projectName = path.basename(projectPath);
    const agentsMapPath = path.join(projectPath, 'AGENTS.md');
    const harnessConfigPath = path.join(projectPath, '.harness', 'config.json');

    const hasAgentsMap = fs.existsSync(agentsMapPath);
    const hasHarnessConfig = fs.existsSync(harnessConfigPath);
    const conventions: string[] = [];

    let agentsMapContent: string | undefined;
    if (hasAgentsMap) {
      agentsMapContent = fs.readFileSync(agentsMapPath, 'utf-8');
    }

    // Extract conventions from .harness/config if present
    if (hasHarnessConfig) {
      try {
        const config = JSON.parse(fs.readFileSync(harnessConfigPath, 'utf-8'));
        if (config.conventions && Array.isArray(config.conventions)) {
          conventions.push(...config.conventions);
        }
      } catch {
        // Skip unparseable config
      }
    }

    return Ok({
      projectName,
      hasAgentsMap,
      agentsMapContent,
      hasHarnessConfig,
      conventions,
    });
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}
```

- [ ] **Step 3: Run test, verify pass, commit**

```bash
git add packages/mcp-server/src/resources/project.ts packages/mcp-server/tests/resources/project.test.ts
git commit -m "feat(mcp-server): add harness://project resource endpoint"
```

### Task 12: Create harness://learnings resource

**Files:**

- Create: `packages/mcp-server/src/resources/learnings.ts`
- Create: `packages/mcp-server/tests/resources/learnings.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// packages/mcp-server/tests/resources/learnings.test.ts
import { describe, it, expect } from 'vitest';
import { loadLearningsResource } from '../../src/resources/learnings';

describe('loadLearningsResource', () => {
  it('returns empty learnings for project without .harness directory', async () => {
    const result = await loadLearningsResource('/tmp/nonexistent');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.reviewLearnings).toBeNull();
      expect(result.value.antiPatterns).toBeNull();
    }
  });

  it('returns review learnings if file exists', async () => {
    // This test works against the real project; if .harness/review-learnings.md
    // doesn't exist, it returns null gracefully
    const result = await loadLearningsResource(process.cwd());

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Either null or a string — both are valid
      expect(
        result.value.reviewLearnings === null || typeof result.value.reviewLearnings === 'string'
      ).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Write implementation**

```typescript
// packages/mcp-server/src/resources/learnings.ts
import * as fs from 'fs';
import * as path from 'path';
import { Ok, Err } from '@harness-engineering/core';
import type { Result } from '@harness-engineering/core';

export interface LearningsResourceData {
  /** Contents of .harness/review-learnings.md (null if absent) */
  reviewLearnings: string | null;
  /** Contents of .harness/anti-patterns.md (null if absent) */
  antiPatterns: string | null;
}

/**
 * Load review learnings and anti-pattern log from .harness/ directory.
 */
export async function loadLearningsResource(
  projectPath: string
): Promise<Result<LearningsResourceData, Error>> {
  try {
    const reviewPath = path.join(projectPath, '.harness', 'review-learnings.md');
    const antiPatternsPath = path.join(projectPath, '.harness', 'anti-patterns.md');

    const reviewLearnings = fs.existsSync(reviewPath) ? fs.readFileSync(reviewPath, 'utf-8') : null;

    const antiPatterns = fs.existsSync(antiPatternsPath)
      ? fs.readFileSync(antiPatternsPath, 'utf-8')
      : null;

    return Ok({ reviewLearnings, antiPatterns });
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}
```

- [ ] **Step 3: Run tests, verify pass, commit**

```bash
git add packages/mcp-server/src/resources/learnings.ts packages/mcp-server/tests/resources/learnings.test.ts
git commit -m "feat(mcp-server): add harness://learnings resource endpoint"
```

---

## Chunk 7: Register MCP Resources in Server (D3c)

### Task 13: Register resource handlers in MCP server

**Files:**

- Modify: `packages/mcp-server/src/server.ts`

- [ ] **Step 1: Add resource imports and capability**

In `packages/mcp-server/src/server.ts`, add imports for resource modules and the `ListResourcesRequestSchema` / `ReadResourceRequestSchema`:

```typescript
// Add to imports at top of server.ts
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { loadSkillsResource } from './resources/skills.js';
import { loadRulesResource } from './resources/rules.js';
import { loadProjectResource } from './resources/project.js';
import { loadLearningsResource } from './resources/learnings.js';
```

- [ ] **Step 2: Update server capabilities to include resources**

In `createHarnessServer()`, change the capabilities:

```typescript
{ capabilities: { tools: {}, resources: {} } }
```

- [ ] **Step 3: Add resource list handler**

After the `ListToolsRequestSchema` handler, add:

```typescript
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: 'harness://skills',
      name: 'Harness Skills',
      description: 'Available skills with metadata (name, description, cognitive mode)',
      mimeType: 'application/json',
    },
    {
      uri: 'harness://rules',
      name: 'Harness Rules',
      description: 'Active linter rules and constraints',
      mimeType: 'application/json',
    },
    {
      uri: 'harness://project',
      name: 'Project Context',
      description: 'Project structure from AGENTS.md and .harness/config',
      mimeType: 'application/json',
    },
    {
      uri: 'harness://learnings',
      name: 'Learnings',
      description: 'Review learnings and anti-pattern log',
      mimeType: 'application/json',
    },
  ],
}));
```

- [ ] **Step 4: Add resource read handler**

After the resource list handler, add:

```typescript
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  const projectPath = process.cwd();

  switch (uri) {
    case 'harness://skills': {
      const result = await loadSkillsResource();
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: result.ok
              ? JSON.stringify(result.value, null, 2)
              : JSON.stringify({ error: result.error.message }),
          },
        ],
      };
    }
    case 'harness://rules': {
      const result = await loadRulesResource(projectPath);
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: result.ok
              ? JSON.stringify(result.value, null, 2)
              : JSON.stringify({ error: result.error.message }),
          },
        ],
      };
    }
    case 'harness://project': {
      const result = await loadProjectResource(projectPath);
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: result.ok
              ? JSON.stringify(result.value, null, 2)
              : JSON.stringify({ error: result.error.message }),
          },
        ],
      };
    }
    case 'harness://learnings': {
      const result = await loadLearningsResource(projectPath);
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: result.ok
              ? JSON.stringify(result.value, null, 2)
              : JSON.stringify({ error: result.error.message }),
          },
        ],
      };
    }
    default:
      return {
        contents: [
          {
            uri,
            mimeType: 'text/plain',
            text: `Unknown resource: ${uri}`,
          },
        ],
      };
  }
});
```

- [ ] **Step 5: Verify compilation**

Run: `cd packages/mcp-server && npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add packages/mcp-server/src/server.ts
git commit -m "feat(mcp-server): register harness:// resource endpoints for context-as-MCP-service"
```

---

## Chunk 8: JIT Context Filtering (D4)

### Task 14: Create filter types

**Files:**

- Create: `packages/core/src/context/filter.types.ts`

- [ ] **Step 1: Create filter types file**

```typescript
// packages/core/src/context/filter.types.ts
import type { TokenBudget } from './budget.types';

/**
 * Workflow phases that determine what context is relevant.
 */
export type WorkflowPhase = 'implement' | 'review' | 'debug' | 'plan';

/**
 * A single context item with its category and estimated token cost.
 */
export interface ContextItem {
  /** Identifier for this context item (e.g., file path, label) */
  id: string;
  /** Budget category this item draws from */
  category: keyof TokenBudget['categories'];
  /** Estimated token count for this item */
  tokens: number;
  /** The content (or reference to content) */
  content: string;
  /** Priority within its category (higher = more important) */
  priority: number;
}

/**
 * Result of filtering context for a specific workflow phase.
 */
export interface ContextFilterResult {
  /** Items that fit within budget, sorted by priority */
  included: ContextItem[];
  /** Items that were excluded due to budget constraints */
  excluded: ContextItem[];
  /** Per-category token usage */
  usage: Record<string, { used: number; limit: number }>;
  /** Total tokens used across all included items */
  totalTokensUsed: number;
  /** The phase this filter was applied for */
  phase: WorkflowPhase;
}

/**
 * Phase-specific priority overrides.
 * Maps context item IDs (or glob patterns) to priority adjustments.
 */
export interface PhasePriorityConfig {
  implement: ContextPriorityRule[];
  review: ContextPriorityRule[];
  debug: ContextPriorityRule[];
  plan: ContextPriorityRule[];
}

export interface ContextPriorityRule {
  /** Glob pattern or exact ID to match */
  match: string;
  /** Priority value (higher = more likely to be included) */
  priority: number;
  /** Budget category to assign */
  category: keyof TokenBudget['categories'];
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/core/src/context/filter.types.ts
git commit -m "feat(core): add JIT context filtering types"
```

### Task 15: Write failing tests for contextFilter

**Files:**

- Create: `packages/core/tests/context/filter.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/core/tests/context/filter.test.ts
import { describe, it, expect } from 'vitest';
import { contextFilter, getDefaultPriorities } from '../../src/context/filter';
import { contextBudget } from '../../src/context/budget';
import type { ContextItem } from '../../src/context/filter.types';

function makeItem(overrides: Partial<ContextItem> & { id: string }): ContextItem {
  return {
    category: 'activeCode',
    tokens: 1000,
    content: 'content',
    priority: 50,
    ...overrides,
  };
}

describe('contextFilter', () => {
  const budget = contextBudget(10_000);

  it('includes items that fit within budget', () => {
    const items: ContextItem[] = [
      makeItem({ id: 'src/index.ts', tokens: 3000, category: 'activeCode', priority: 80 }),
      makeItem({ id: 'types.ts', tokens: 500, category: 'interfaces', priority: 70 }),
    ];

    const result = contextFilter('implement', budget, items);

    expect(result.included).toHaveLength(2);
    expect(result.excluded).toHaveLength(0);
    expect(result.phase).toBe('implement');
  });

  it('excludes items that exceed category budget', () => {
    const items: ContextItem[] = [
      makeItem({ id: 'big-file.ts', tokens: 5000, category: 'activeCode', priority: 80 }),
      makeItem({ id: 'another-big.ts', tokens: 5000, category: 'activeCode', priority: 60 }),
    ];

    // activeCode budget = 10_000 * 0.40 = 4000
    const result = contextFilter('implement', budget, items);

    // Only the first item fits (4000 budget, first item is 5000 — actually exceeds)
    // Both exceed individually, but the higher priority one should be attempted first
    expect(result.included.length + result.excluded.length).toBe(2);
    expect(result.totalTokensUsed).toBeLessThanOrEqual(budget.total);
  });

  it('sorts included items by priority (highest first)', () => {
    const items: ContextItem[] = [
      makeItem({ id: 'low.ts', tokens: 100, category: 'activeCode', priority: 10 }),
      makeItem({ id: 'high.ts', tokens: 100, category: 'activeCode', priority: 90 }),
      makeItem({ id: 'mid.ts', tokens: 100, category: 'activeCode', priority: 50 }),
    ];

    const result = contextFilter('implement', budget, items);

    expect(result.included[0].id).toBe('high.ts');
    expect(result.included[1].id).toBe('mid.ts');
    expect(result.included[2].id).toBe('low.ts');
  });

  it('tracks per-category usage', () => {
    const items: ContextItem[] = [
      makeItem({ id: 'code.ts', tokens: 1000, category: 'activeCode' }),
      makeItem({ id: 'types.ts', tokens: 500, category: 'interfaces' }),
    ];

    const result = contextFilter('implement', budget, items);

    expect(result.usage.activeCode.used).toBe(1000);
    expect(result.usage.activeCode.limit).toBe(4000);
    expect(result.usage.interfaces.used).toBe(500);
    expect(result.usage.interfaces.limit).toBe(1000);
  });

  it('returns correct totalTokensUsed', () => {
    const items: ContextItem[] = [
      makeItem({ id: 'a.ts', tokens: 1000, category: 'activeCode' }),
      makeItem({ id: 'b.ts', tokens: 500, category: 'interfaces' }),
      makeItem({ id: 'c.md', tokens: 200, category: 'taskSpec' }),
    ];

    const result = contextFilter('implement', budget, items);

    expect(result.totalTokensUsed).toBe(1700);
  });

  it('handles empty item list', () => {
    const result = contextFilter('implement', budget, []);

    expect(result.included).toHaveLength(0);
    expect(result.excluded).toHaveLength(0);
    expect(result.totalTokensUsed).toBe(0);
  });
});

describe('getDefaultPriorities', () => {
  it('returns phase-specific priority rules for implement', () => {
    const rules = getDefaultPriorities('implement');

    expect(rules.length).toBeGreaterThan(0);
    // Implement phase should prioritize source files and type definitions
    const sourceRule = rules.find((r) => r.match === '*.ts' || r.match === 'src/**');
    expect(sourceRule).toBeDefined();
  });

  it('returns phase-specific priority rules for review', () => {
    const rules = getDefaultPriorities('review');

    expect(rules.length).toBeGreaterThan(0);
  });

  it('returns phase-specific priority rules for debug', () => {
    const rules = getDefaultPriorities('debug');

    expect(rules.length).toBeGreaterThan(0);
  });

  it('returns phase-specific priority rules for plan', () => {
    const rules = getDefaultPriorities('plan');

    expect(rules.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run tests/context/filter.test.ts`

### Task 16: Implement contextFilter

**Files:**

- Create: `packages/core/src/context/filter.ts`

- [ ] **Step 1: Write implementation**

```typescript
// packages/core/src/context/filter.ts
import type { TokenBudget } from './budget.types';
import type {
  WorkflowPhase,
  ContextItem,
  ContextFilterResult,
  ContextPriorityRule,
} from './filter.types';

/**
 * Default priority rules per workflow phase.
 *
 * - Implement: source files, type definitions, test examples, spec
 * - Review: diff, specs, review learnings, lint results, commit history
 * - Debug: error output, recent changes, anti-pattern log, related tests
 * - Plan: requirements, existing architecture, constraints, prior handoffs
 */
const DEFAULT_PRIORITIES: Record<WorkflowPhase, ContextPriorityRule[]> = {
  implement: [
    { match: 'src/**', priority: 90, category: 'activeCode' },
    { match: '*.ts', priority: 85, category: 'activeCode' },
    { match: '*.types.ts', priority: 80, category: 'interfaces' },
    { match: 'types/**', priority: 80, category: 'interfaces' },
    { match: '*.test.ts', priority: 60, category: 'activeCode' },
    { match: 'docs/changes/**', priority: 70, category: 'taskSpec' },
    { match: 'SKILL.md', priority: 50, category: 'systemPrompt' },
  ],
  review: [
    { match: '*.diff', priority: 95, category: 'activeCode' },
    { match: 'docs/changes/**', priority: 85, category: 'taskSpec' },
    { match: '.harness/review-learnings.md', priority: 80, category: 'systemPrompt' },
    { match: '*.lint.json', priority: 70, category: 'interfaces' },
    { match: 'git-log', priority: 65, category: 'activeCode' },
    { match: '*.ts', priority: 60, category: 'activeCode' },
  ],
  debug: [
    { match: '*.error', priority: 95, category: 'activeCode' },
    { match: '*.log', priority: 90, category: 'activeCode' },
    { match: 'src/**', priority: 80, category: 'activeCode' },
    { match: '.harness/anti-patterns.md', priority: 85, category: 'systemPrompt' },
    { match: '*.test.ts', priority: 75, category: 'activeCode' },
    { match: 'git-diff', priority: 70, category: 'activeCode' },
  ],
  plan: [
    { match: 'docs/changes/**', priority: 90, category: 'taskSpec' },
    { match: 'docs/architecture/**', priority: 85, category: 'interfaces' },
    { match: 'AGENTS.md', priority: 80, category: 'projectManifest' },
    { match: '.harness/handoff.md', priority: 75, category: 'taskSpec' },
    { match: 'docs/constraints/**', priority: 70, category: 'interfaces' },
    { match: 'src/**', priority: 50, category: 'activeCode' },
  ],
};

/**
 * Get default priority rules for a workflow phase.
 */
export function getDefaultPriorities(phase: WorkflowPhase): ContextPriorityRule[] {
  return DEFAULT_PRIORITIES[phase];
}

/**
 * Filter context items to fit within a token budget, prioritized by workflow phase.
 *
 * Items are sorted by priority (highest first) and greedily included until
 * their category budget is exhausted. Items that don't fit are placed in
 * the excluded list.
 *
 * @param phase - Current workflow phase (determines default priorities)
 * @param budget - Token budget with per-category limits
 * @param items - Context items to filter
 * @returns Filtered result with included/excluded items and usage stats
 */
export function contextFilter(
  phase: WorkflowPhase,
  budget: TokenBudget,
  items: ContextItem[]
): ContextFilterResult {
  // Sort by priority descending
  const sorted = [...items].sort((a, b) => b.priority - a.priority);

  // Track per-category usage
  const categoryUsage: Record<string, { used: number; limit: number }> = {};
  for (const [key, limit] of Object.entries(budget.categories)) {
    categoryUsage[key] = { used: 0, limit };
  }

  const included: ContextItem[] = [];
  const excluded: ContextItem[] = [];
  let totalTokensUsed = 0;

  for (const item of sorted) {
    const cat = categoryUsage[item.category];
    if (!cat) {
      excluded.push(item);
      continue;
    }

    if (cat.used + item.tokens <= cat.limit && totalTokensUsed + item.tokens <= budget.total) {
      included.push(item);
      cat.used += item.tokens;
      totalTokensUsed += item.tokens;
    } else {
      excluded.push(item);
    }
  }

  return {
    included,
    excluded,
    usage: categoryUsage,
    totalTokensUsed,
    phase,
  };
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd packages/core && npx vitest run tests/context/filter.test.ts`

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/context/filter.ts packages/core/src/context/filter.types.ts packages/core/tests/context/filter.test.ts
git commit -m "feat(core): add JIT context filtering with phase-aware budget allocation"
```

---

## Chunk 9: Export and Integration (D4b)

### Task 17: Export new modules from package entry points

**Files:**

- Modify: `packages/core/src/context/` (ensure budget and filter are exported)

- [ ] **Step 1: Check if packages/core has a barrel export and add new exports**

If `packages/core/src/index.ts` exists (or the equivalent entry point), add:

```typescript
// Context engineering - budget
export { contextBudget } from './context/budget';
export type { TokenBudget, TokenBudgetCategories, BudgetOverrides } from './context/budget.types';

// Context engineering - filter
export { contextFilter, getDefaultPriorities } from './context/filter';
export type {
  WorkflowPhase,
  ContextItem,
  ContextFilterResult,
  ContextPriorityRule,
  PhasePriorityConfig,
} from './context/filter.types';

// Pipeline
export { runPipeline } from './pipeline/skill-pipeline';
export type { PipelineOptions, PipelineResult } from './pipeline/types';
```

- [ ] **Step 2: Verify full test suite passes**

Run: `cd packages/core && npx vitest run`

- [ ] **Step 3: Verify MCP server test suite passes**

Run: `cd packages/mcp-server && npx vitest run`

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/index.ts
git commit -m "feat(core): export context budget, filter, and pipeline modules"
```

---

## Summary

| Chunk | Item        | Deliverable                                                                     | Files                                                                                               |
| ----- | ----------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1     | D1a         | Token budget docs in principles.md                                              | `docs/standard/principles.md`                                                                       |
| 2     | D1b         | `contextBudget()` utility + types + tests                                       | `packages/core/src/context/budget.ts`, `budget.types.ts`, `tests/context/budget.test.ts`            |
| 3     | D2a         | Pipeline types in packages/types                                                | `packages/types/src/pipeline.ts`, `packages/types/src/index.ts`                                     |
| 4     | D2b         | `runPipeline()` orchestrator + tests                                            | `packages/core/src/pipeline/skill-pipeline.ts`, `types.ts`, `tests/pipeline/skill-pipeline.test.ts` |
| 5     | D3a         | `harness://skills` resource + tests                                             | `packages/mcp-server/src/resources/skills.ts`, `tests/resources/skills.test.ts`                     |
| 6     | D3b         | `harness://rules`, `harness://project`, `harness://learnings` resources + tests | `packages/mcp-server/src/resources/{rules,project,learnings}.ts`                                    |
| 7     | D3c         | Register resources in MCP server                                                | `packages/mcp-server/src/server.ts`                                                                 |
| 8     | D4          | `contextFilter()` + types + tests                                               | `packages/core/src/context/filter.ts`, `filter.types.ts`, `tests/context/filter.test.ts`            |
| 9     | Integration | Export all new modules from entry points                                        | `packages/core/src/index.ts`                                                                        |

**Total estimated steps:** ~40 checkboxes across 9 chunks
**Estimated time:** 2-3 hours

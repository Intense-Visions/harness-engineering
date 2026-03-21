# MCP Server Expansion Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the harness MCP server from 15 to 23 tools and 4 to 5 resources, achieving full CLI-MCP feature parity.

**Architecture:** Each new tool follows the existing definition+handler pattern with dynamic imports of `@harness-engineering/core` or CLI packages. New tool files are organized by domain (state, feedback, phase-gate, cross-check). Two existing tools (detect_entropy, apply_fixes) are enhanced in-place.

**Tech Stack:** TypeScript, `@modelcontextprotocol/sdk`, `@harness-engineering/core`, `vitest`

**Spec:** `docs/changes/mcp-server-expansion/proposal.md`

---

## Chunk 1: State Management Tools

### Task 1: Create state tool — `manage_state` and `manage_handoff`

**Files:**

- Create: `packages/mcp-server/src/tools/state.ts`
- Create: `packages/mcp-server/tests/tools/state.test.ts`

- [ ] **Step 1: Write failing tests for manage_state definition and show action**

```typescript
// packages/mcp-server/tests/tools/state.test.ts
import { describe, it, expect, vi } from 'vitest';
import {
  manageStateDefinition,
  handleManageState,
  manageHandoffDefinition,
  handleManageHandoff,
} from '../../src/tools/state';

describe('manage_state tool', () => {
  it('has correct definition', () => {
    expect(manageStateDefinition.name).toBe('manage_state');
    expect(manageStateDefinition.inputSchema.required).toContain('path');
    expect(manageStateDefinition.inputSchema.required).toContain('action');
  });

  it('show action returns state or default for missing project', async () => {
    const response = await handleManageState({ path: '/nonexistent', action: 'show' });
    expect(response.content).toHaveLength(1);
    // Should return default state, not error — loadState returns default when missing
    const parsed = JSON.parse(response.content[0].text);
    expect(parsed).toHaveProperty('schemaVersion');
  });

  it('returns error for unknown action', async () => {
    const response = await handleManageState({ path: '/tmp', action: 'invalid' as any });
    expect(response.isError).toBe(true);
  });

  it('learn action requires learning param', async () => {
    const response = await handleManageState({ path: '/tmp', action: 'learn' });
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain('learning');
  });

  it('failure action requires description, skillName, failureType', async () => {
    const response = await handleManageState({ path: '/tmp', action: 'failure' });
    expect(response.isError).toBe(true);
  });
});

describe('manage_handoff tool', () => {
  it('has correct definition', () => {
    expect(manageHandoffDefinition.name).toBe('manage_handoff');
    expect(manageHandoffDefinition.inputSchema.required).toContain('path');
    expect(manageHandoffDefinition.inputSchema.required).toContain('action');
  });

  it('load action returns null for missing handoff', async () => {
    const response = await handleManageHandoff({ path: '/nonexistent', action: 'load' });
    expect(response.content).toHaveLength(1);
    expect(response.isError).toBeUndefined();
  });

  it('save action requires handoff param', async () => {
    const response = await handleManageHandoff({ path: '/tmp', action: 'save' });
    expect(response.isError).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/mcp-server && npx vitest run tests/tools/state.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement manage_state and manage_handoff handlers**

```typescript
// packages/mcp-server/src/tools/state.ts
import * as path from 'path';
import { Ok, Err } from '@harness-engineering/core';
import { resultToMcpResponse, type McpToolResponse } from '../utils/result-adapter.js';

type StateAction = 'show' | 'learn' | 'failure' | 'archive' | 'reset' | 'gate';
type HandoffAction = 'save' | 'load';

export const manageStateDefinition = {
  name: 'manage_state',
  description:
    'Manage harness project state: show current state, record learnings/failures, archive failures, reset state, or run mechanical gate checks',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root directory' },
      action: {
        type: 'string',
        enum: ['show', 'learn', 'failure', 'archive', 'reset', 'gate'],
        description: 'State operation to perform',
      },
      learning: { type: 'string', description: 'Learning text (required for learn action)' },
      skillName: { type: 'string', description: 'Skill context for learning or failure' },
      outcome: { type: 'string', description: 'Learning outcome' },
      description: {
        type: 'string',
        description: 'Failure description (required for failure action)',
      },
      failureType: { type: 'string', description: 'Failure type (required for failure action)' },
    },
    required: ['path', 'action'],
  },
};

export async function handleManageState(input: {
  path: string;
  action: StateAction;
  learning?: string;
  skillName?: string;
  outcome?: string;
  description?: string;
  failureType?: string;
}): Promise<McpToolResponse> {
  const projectPath = path.resolve(input.path);

  try {
    const core = await import('@harness-engineering/core');

    switch (input.action) {
      case 'show': {
        const result = await core.loadState(projectPath);
        return resultToMcpResponse(result);
      }
      case 'learn': {
        if (!input.learning) {
          return resultToMcpResponse(Err(new Error('Missing required param: learning')));
        }
        const result = await core.appendLearning(
          projectPath,
          input.learning,
          input.skillName,
          input.outcome
        );
        return resultToMcpResponse(result.ok ? Ok({ recorded: true }) : result);
      }
      case 'failure': {
        if (!input.description || !input.skillName || !input.failureType) {
          return resultToMcpResponse(
            Err(new Error('Missing required params: description, skillName, failureType'))
          );
        }
        const result = await core.appendFailure(
          projectPath,
          input.description,
          input.skillName,
          input.failureType
        );
        return resultToMcpResponse(result.ok ? Ok({ recorded: true }) : result);
      }
      case 'archive': {
        const result = await core.archiveFailures(projectPath);
        return resultToMcpResponse(result.ok ? Ok({ archived: true }) : result);
      }
      case 'reset': {
        const result = await core.saveState(projectPath, {
          schemaVersion: 1,
          position: {},
          decisions: [],
          blockers: [],
          progress: {},
        });
        return resultToMcpResponse(result.ok ? Ok({ reset: true }) : result);
      }
      case 'gate': {
        const result = await core.runMechanicalGate(projectPath);
        return resultToMcpResponse(result);
      }
      default:
        return resultToMcpResponse(Err(new Error(`Unknown action: ${input.action}`)));
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

export const manageHandoffDefinition = {
  name: 'manage_handoff',
  description: 'Save or load session handoff context for agent continuity across sessions',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root directory' },
      action: {
        type: 'string',
        enum: ['save', 'load'],
        description: 'Handoff operation to perform',
      },
      handoff: {
        type: 'object',
        description: 'Handoff data to persist (required for save action)',
      },
    },
    required: ['path', 'action'],
  },
};

export async function handleManageHandoff(input: {
  path: string;
  action: HandoffAction;
  handoff?: Record<string, unknown>;
}): Promise<McpToolResponse> {
  const projectPath = path.resolve(input.path);

  try {
    const core = await import('@harness-engineering/core');

    switch (input.action) {
      case 'load': {
        const result = await core.loadHandoff(projectPath);
        return resultToMcpResponse(result.ok ? Ok(result.value ?? null) : result);
      }
      case 'save': {
        if (!input.handoff) {
          return resultToMcpResponse(Err(new Error('Missing required param: handoff')));
        }
        const result = await core.saveHandoff(projectPath, input.handoff as any);
        return resultToMcpResponse(result.ok ? Ok({ saved: true }) : result);
      }
      default:
        return resultToMcpResponse(Err(new Error(`Unknown action: ${input.action}`)));
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/mcp-server && npx vitest run tests/tools/state.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/mcp-server/src/tools/state.ts packages/mcp-server/tests/tools/state.test.ts
git commit -m "feat(mcp-server): add manage_state and manage_handoff tools"
```

---

### Task 2: Create state resource — `harness://state`

**Files:**

- Create: `packages/mcp-server/src/resources/state.ts`
- Create: `packages/mcp-server/tests/resources/state.test.ts`

- [ ] **Step 1: Write failing test for state resource**

```typescript
// packages/mcp-server/tests/resources/state.test.ts
import { describe, it, expect } from 'vitest';
import { getStateResource } from '../../src/resources/state';

describe('state resource', () => {
  it('returns valid JSON for nonexistent project', async () => {
    const result = await getStateResource('/nonexistent/path');
    const parsed = JSON.parse(result);
    expect(parsed).toHaveProperty('schemaVersion');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/mcp-server && npx vitest run tests/resources/state.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement state resource**

```typescript
// packages/mcp-server/src/resources/state.ts
export async function getStateResource(projectRoot: string): Promise<string> {
  try {
    const { loadState } = await import('@harness-engineering/core');
    const result = await loadState(projectRoot);
    if (result.ok) {
      return JSON.stringify(result.value, null, 2);
    }
    // Return default state on error
    return JSON.stringify({
      schemaVersion: 1,
      position: {},
      decisions: [],
      blockers: [],
      progress: {},
    });
  } catch {
    return JSON.stringify({
      schemaVersion: 1,
      position: {},
      decisions: [],
      blockers: [],
      progress: {},
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/mcp-server && npx vitest run tests/resources/state.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/mcp-server/src/resources/state.ts packages/mcp-server/tests/resources/state.test.ts
git commit -m "feat(mcp-server): add harness://state resource"
```

---

## Chunk 2: Feedback Tools

### Task 3: Create feedback tools — `create_self_review`, `analyze_diff`, `request_peer_review`

**Files:**

- Create: `packages/mcp-server/src/tools/feedback.ts`
- Create: `packages/mcp-server/tests/tools/feedback.test.ts`

- [ ] **Step 1: Write failing tests for feedback tool definitions**

```typescript
// packages/mcp-server/tests/tools/feedback.test.ts
import { describe, it, expect } from 'vitest';
import {
  createSelfReviewDefinition,
  handleCreateSelfReview,
  analyzeDiffDefinition,
  handleAnalyzeDiff,
  requestPeerReviewDefinition,
  handleRequestPeerReview,
} from '../../src/tools/feedback';

describe('create_self_review tool', () => {
  it('has correct definition', () => {
    expect(createSelfReviewDefinition.name).toBe('create_self_review');
    expect(createSelfReviewDefinition.inputSchema.required).toContain('path');
    expect(createSelfReviewDefinition.inputSchema.required).toContain('diff');
  });

  it('returns checklist for a simple diff', async () => {
    const response = await handleCreateSelfReview({
      path: '/nonexistent',
      diff: 'diff --git a/file.ts b/file.ts\n--- a/file.ts\n+++ b/file.ts\n@@ -1 +1 @@\n-old\n+new',
    });
    expect(response.content).toHaveLength(1);
    // Should not error — returns empty checklist for non-harness project
    expect(response.isError).toBeUndefined();
  });
});

describe('analyze_diff tool', () => {
  it('has correct definition', () => {
    expect(analyzeDiffDefinition.name).toBe('analyze_diff');
    expect(analyzeDiffDefinition.inputSchema.required).toContain('diff');
  });

  it('parses a valid diff without error', async () => {
    const response = await handleAnalyzeDiff({
      diff: 'diff --git a/file.ts b/file.ts\n--- a/file.ts\n+++ b/file.ts\n@@ -1 +1 @@\n-old\n+new',
    });
    expect(response.content).toHaveLength(1);
    expect(response.isError).toBeUndefined();
  });
});

describe('request_peer_review tool', () => {
  it('has correct definition', () => {
    expect(requestPeerReviewDefinition.name).toBe('request_peer_review');
    expect(requestPeerReviewDefinition.inputSchema.required).toContain('path');
    expect(requestPeerReviewDefinition.inputSchema.required).toContain('agentType');
    expect(requestPeerReviewDefinition.inputSchema.required).toContain('diff');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/mcp-server && npx vitest run tests/tools/feedback.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement feedback tools**

```typescript
// packages/mcp-server/src/tools/feedback.ts
import * as path from 'path';
import { Ok, Err } from '@harness-engineering/core';
import { resultToMcpResponse, type McpToolResponse } from '../utils/result-adapter.js';

export const createSelfReviewDefinition = {
  name: 'create_self_review',
  description:
    'Generate a checklist-based code review from a git diff, checking harness constraints, custom rules, and diff patterns',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root directory' },
      diff: { type: 'string', description: 'Git diff output to review' },
      customRules: {
        type: 'array',
        items: { type: 'object' },
        description: 'Additional review rules',
      },
      maxFileSize: { type: 'number', description: 'Max lines per file' },
      maxFileCount: { type: 'number', description: 'Max files in diff' },
    },
    required: ['path', 'diff'],
  },
};

export async function handleCreateSelfReview(input: {
  path: string;
  diff: string;
  customRules?: Array<Record<string, unknown>>;
  maxFileSize?: number;
  maxFileCount?: number;
}): Promise<McpToolResponse> {
  try {
    const core = await import('@harness-engineering/core');
    const changes = core.parseDiff(input.diff);
    if (!changes.ok) return resultToMcpResponse(changes);

    const config = {
      rootDir: path.resolve(input.path),
      harness: { context: true, constraints: true, entropy: true },
      customRules: input.customRules as any[],
      diffAnalysis: {
        enabled: true,
        maxFileSize: input.maxFileSize,
        maxChangedFiles: input.maxFileCount,
      },
    };

    const result = await core.createSelfReview(changes.value, config);
    return resultToMcpResponse(result);
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

export const analyzeDiffDefinition = {
  name: 'analyze_diff',
  description:
    'Parse a git diff and check for forbidden patterns, oversized files, and missing test coverage',
  inputSchema: {
    type: 'object' as const,
    properties: {
      diff: { type: 'string', description: 'Git diff output to analyze' },
      forbiddenPatterns: {
        type: 'array',
        items: { type: 'string' },
        description: 'Regex patterns to flag as violations',
      },
      maxFileSize: { type: 'number', description: 'Max additions per file' },
      maxFileCount: { type: 'number', description: 'Max files in diff' },
    },
    required: ['diff'],
  },
};

export async function handleAnalyzeDiff(input: {
  diff: string;
  forbiddenPatterns?: string[];
  maxFileSize?: number;
  maxFileCount?: number;
}): Promise<McpToolResponse> {
  try {
    const core = await import('@harness-engineering/core');
    const changes = core.parseDiff(input.diff);
    if (!changes.ok) return resultToMcpResponse(changes);

    const options = {
      enabled: true,
      forbiddenPatterns: input.forbiddenPatterns?.map((p) => ({
        pattern: p,
        message: `Forbidden pattern: ${p}`,
      })),
      maxFileSize: input.maxFileSize,
      maxChangedFiles: input.maxFileCount,
    };

    const result = await core.analyzeDiff(changes.value, options);
    return resultToMcpResponse(result);
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

export const requestPeerReviewDefinition = {
  name: 'request_peer_review',
  description:
    'Spawn an agent subprocess to perform code review. Returns structured feedback with approval status. Timeout: 120 seconds.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root directory' },
      agentType: {
        type: 'string',
        enum: [
          'architecture-enforcer',
          'documentation-maintainer',
          'test-reviewer',
          'entropy-cleaner',
          'custom',
        ],
        description: 'Type of review agent to spawn',
      },
      diff: { type: 'string', description: 'Git diff output to review' },
      context: { type: 'string', description: 'Additional review context' },
    },
    required: ['path', 'agentType', 'diff'],
  },
};

export async function handleRequestPeerReview(input: {
  path: string;
  agentType: string;
  diff: string;
  context?: string;
}): Promise<McpToolResponse> {
  try {
    const core = await import('@harness-engineering/core');
    const reviewContext = {
      files: [],
      diff: input.diff,
      metadata: input.context ? { context: input.context } : undefined,
    };

    const result = await core.requestPeerReview(input.agentType as any, reviewContext, {
      timeout: 120_000,
      wait: true,
    });
    return resultToMcpResponse(result);
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/mcp-server && npx vitest run tests/tools/feedback.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/mcp-server/src/tools/feedback.ts packages/mcp-server/tests/tools/feedback.test.ts
git commit -m "feat(mcp-server): add create_self_review, analyze_diff, request_peer_review tools"
```

---

## Chunk 3: CLI-Wrapped Tools

### Task 4: Create phase gate tool — `check_phase_gate`

**Files:**

- Create: `packages/mcp-server/src/tools/phase-gate.ts`
- Create: `packages/mcp-server/tests/tools/phase-gate.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/mcp-server/tests/tools/phase-gate.test.ts
import { describe, it, expect } from 'vitest';
import { checkPhaseGateDefinition, handleCheckPhaseGate } from '../../src/tools/phase-gate';

describe('check_phase_gate tool', () => {
  it('has correct definition', () => {
    expect(checkPhaseGateDefinition.name).toBe('check_phase_gate');
    expect(checkPhaseGateDefinition.inputSchema.required).toContain('path');
  });

  it('returns result for project path', async () => {
    const response = await handleCheckPhaseGate({ path: '/nonexistent' });
    expect(response.content).toHaveLength(1);
    // May error or return skipped — either is valid for nonexistent path
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/mcp-server && npx vitest run tests/tools/phase-gate.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement phase gate tool**

```typescript
// packages/mcp-server/src/tools/phase-gate.ts
import * as path from 'path';
import type { McpToolResponse } from '../utils/result-adapter.js';

export const checkPhaseGateDefinition = {
  name: 'check_phase_gate',
  description:
    'Verify implementation-to-spec mappings: checks that each implementation file has a corresponding spec document',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root directory' },
    },
    required: ['path'],
  },
};

export async function handleCheckPhaseGate(input: { path: string }): Promise<McpToolResponse> {
  try {
    const { runCheckPhaseGate } = await import('@harness-engineering/cli');
    const result = await runCheckPhaseGate({ cwd: path.resolve(input.path) });
    if (result.ok) {
      return { content: [{ type: 'text' as const, text: JSON.stringify(result.value) }] };
    }
    return { content: [{ type: 'text' as const, text: result.error.message }], isError: true };
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/mcp-server && npx vitest run tests/tools/phase-gate.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/mcp-server/src/tools/phase-gate.ts packages/mcp-server/tests/tools/phase-gate.test.ts
git commit -m "feat(mcp-server): add check_phase_gate tool"
```

---

### Task 5: Create cross-check tool — `validate_cross_check`

**Files:**

- Create: `packages/mcp-server/src/tools/cross-check.ts`
- Create: `packages/mcp-server/tests/tools/cross-check.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/mcp-server/tests/tools/cross-check.test.ts
import { describe, it, expect } from 'vitest';
import {
  validateCrossCheckDefinition,
  handleValidateCrossCheck,
} from '../../src/tools/cross-check';

describe('validate_cross_check tool', () => {
  it('has correct definition', () => {
    expect(validateCrossCheckDefinition.name).toBe('validate_cross_check');
    expect(validateCrossCheckDefinition.inputSchema.required).toContain('path');
  });

  it('returns result for project path', async () => {
    const response = await handleValidateCrossCheck({ path: '/nonexistent' });
    expect(response.content).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/mcp-server && npx vitest run tests/tools/cross-check.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement cross-check tool**

```typescript
// packages/mcp-server/src/tools/cross-check.ts
import * as path from 'path';
import type { McpToolResponse } from '../utils/result-adapter.js';

export const validateCrossCheckDefinition = {
  name: 'validate_cross_check',
  description:
    'Validate plan-to-implementation coverage: checks that specs have plans and plans have implementations, detects staleness',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root directory' },
      specsDir: {
        type: 'string',
        description: 'Specs directory relative to project root (default: docs/specs)',
      },
      plansDir: {
        type: 'string',
        description: 'Plans directory relative to project root (default: docs/plans)',
      },
    },
    required: ['path'],
  },
};

export async function handleValidateCrossCheck(input: {
  path: string;
  specsDir?: string;
  plansDir?: string;
}): Promise<McpToolResponse> {
  const projectPath = path.resolve(input.path);

  try {
    const { runCrossCheck } = await import('@harness-engineering/cli');
    const result = await runCrossCheck({
      projectPath,
      specsDir: path.resolve(projectPath, input.specsDir ?? 'docs/specs'),
      plansDir: path.resolve(projectPath, input.plansDir ?? 'docs/plans'),
    });
    if (result.ok) {
      return { content: [{ type: 'text' as const, text: JSON.stringify(result.value) }] };
    }
    return { content: [{ type: 'text' as const, text: result.error.message }], isError: true };
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/mcp-server && npx vitest run tests/tools/cross-check.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/mcp-server/src/tools/cross-check.ts packages/mcp-server/tests/tools/cross-check.test.ts
git commit -m "feat(mcp-server): add validate_cross_check tool"
```

---

### Task 6: Add `create_skill` to existing skill tool file

**Files:**

- Modify: `packages/mcp-server/src/tools/skill.ts`
- Modify: `packages/mcp-server/tests/tools/skill.test.ts`

- [ ] **Step 1: Write failing test for create_skill**

Add to `packages/mcp-server/tests/tools/skill.test.ts`:

```typescript
import { createSkillDefinition, handleCreateSkill } from '../../src/tools/skill';

describe('create_skill tool', () => {
  it('has correct definition', () => {
    expect(createSkillDefinition.name).toBe('create_skill');
    expect(createSkillDefinition.inputSchema.required).toContain('path');
    expect(createSkillDefinition.inputSchema.required).toContain('name');
    expect(createSkillDefinition.inputSchema.required).toContain('description');
  });

  it('returns error for invalid skill name', async () => {
    const response = await handleCreateSkill({
      path: '/tmp',
      name: 'Invalid Name With Spaces',
      description: 'test',
    });
    expect(response.isError).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/mcp-server && npx vitest run tests/tools/skill.test.ts`
Expected: FAIL — createSkillDefinition not exported

- [ ] **Step 3: Add create_skill to skill.ts**

Append to `packages/mcp-server/src/tools/skill.ts`:

```typescript
export const createSkillDefinition = {
  name: 'create_skill',
  description: 'Scaffold a new harness skill with skill.yaml and SKILL.md',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root directory' },
      name: { type: 'string', description: 'Skill name in kebab-case (e.g., my-new-skill)' },
      description: { type: 'string', description: 'Skill description' },
      cognitiveMode: {
        type: 'string',
        enum: [
          'adversarial-reviewer',
          'constructive-architect',
          'meticulous-implementer',
          'diagnostic-investigator',
          'advisory-guide',
          'meticulous-verifier',
        ],
        description: 'Cognitive mode (default: constructive-architect)',
      },
    },
    required: ['path', 'name', 'description'],
  },
};

export async function handleCreateSkill(input: {
  path: string;
  name: string;
  description: string;
  cognitiveMode?: string;
}): Promise<McpToolResponse> {
  try {
    const { generateSkillFiles } = await import('@harness-engineering/cli');
    const result = generateSkillFiles({
      name: input.name,
      description: input.description,
      cognitiveMode: input.cognitiveMode ?? 'constructive-architect',
      outputDir: path.resolve(input.path),
    });
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
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
```

Also add the missing imports at the top of `skill.ts`:

```typescript
import { type McpToolResponse } from '../utils/result-adapter.js';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/mcp-server && npx vitest run tests/tools/skill.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/mcp-server/src/tools/skill.ts packages/mcp-server/tests/tools/skill.test.ts
git commit -m "feat(mcp-server): add create_skill tool"
```

---

## Chunk 4: Enhance Existing Tools

### Task 7: Add `type` filter to `detect_entropy`

**Files:**

- Modify: `packages/mcp-server/src/tools/entropy.ts`
- Modify or create: `packages/mcp-server/tests/tools/entropy.test.ts`

- [ ] **Step 1: Write failing test for type filter**

```typescript
// packages/mcp-server/tests/tools/entropy.test.ts
import { describe, it, expect } from 'vitest';
import { detectEntropyDefinition, handleDetectEntropy } from '../../src/tools/entropy';

describe('detect_entropy tool', () => {
  it('has type parameter in definition', () => {
    expect(detectEntropyDefinition.inputSchema.properties).toHaveProperty('type');
    expect(detectEntropyDefinition.inputSchema.properties.type.enum).toEqual([
      'drift',
      'dead-code',
      'patterns',
      'all',
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/mcp-server && npx vitest run tests/tools/entropy.test.ts`
Expected: FAIL — no `type` property in definition

- [ ] **Step 3: Add type parameter to detect_entropy**

In `packages/mcp-server/src/tools/entropy.ts`, update `detectEntropyDefinition`:

```typescript
export const detectEntropyDefinition = {
  name: 'detect_entropy',
  description: 'Detect documentation drift, dead code, and pattern violations',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      type: {
        type: 'string',
        enum: ['drift', 'dead-code', 'patterns', 'all'],
        description: 'Type of entropy to detect (default: all)',
      },
    },
    required: ['path'],
  },
};
```

Update `handleDetectEntropy` to accept and use the type parameter:

```typescript
export async function handleDetectEntropy(input: { path: string; type?: string }) {
  try {
    const { EntropyAnalyzer } = await import('@harness-engineering/core');
    const typeFilter = input.type ?? 'all';
    const analyzer = new EntropyAnalyzer({
      rootDir: path.resolve(input.path),
      analyze: {
        drift: typeFilter === 'all' || typeFilter === 'drift',
        deadCode: typeFilter === 'all' || typeFilter === 'dead-code',
        patterns: typeFilter === 'all' || typeFilter === 'patterns',
      },
    });
    const result = await analyzer.analyze();
    return resultToMcpResponse(result);
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/mcp-server && npx vitest run tests/tools/entropy.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/mcp-server/src/tools/entropy.ts packages/mcp-server/tests/tools/entropy.test.ts
git commit -m "feat(mcp-server): add type filter to detect_entropy tool"
```

---

### Task 8: Add suggestions to `apply_fixes` response

**Files:**

- Modify: `packages/mcp-server/src/tools/entropy.ts`
- Modify: `packages/mcp-server/tests/tools/entropy.test.ts`

- [ ] **Step 1: Write failing test for suggestions in apply_fixes**

Add to `packages/mcp-server/tests/tools/entropy.test.ts`:

```typescript
import { applyFixesDefinition } from '../../src/tools/entropy';

describe('apply_fixes tool', () => {
  it('description mentions suggestions', () => {
    expect(applyFixesDefinition.description).toContain('suggestion');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/mcp-server && npx vitest run tests/tools/entropy.test.ts`
Expected: FAIL — description doesn't contain 'suggestion'

- [ ] **Step 3: Update apply_fixes to include suggestions**

In `packages/mcp-server/src/tools/entropy.ts`, update the definition:

```typescript
export const applyFixesDefinition = {
  name: 'apply_fixes',
  description:
    'Auto-fix detected entropy issues and return actionable suggestions for remaining issues',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      dryRun: { type: 'boolean', description: 'Preview fixes without applying' },
    },
    required: ['path'],
  },
};
```

Update `handleApplyFixes` to include suggestions:

```typescript
export async function handleApplyFixes(input: { path: string; dryRun?: boolean }) {
  try {
    const { EntropyAnalyzer, createFixes, applyFixes, generateSuggestions } =
      await import('@harness-engineering/core');
    const analyzer = new EntropyAnalyzer({
      rootDir: path.resolve(input.path),
      analyze: { drift: true, deadCode: true, patterns: true },
    });
    const analysisResult = await analyzer.analyze();
    if (!analysisResult.ok) return resultToMcpResponse(analysisResult);

    const report = analysisResult.value;
    const deadCode = report.deadCode;
    const fixes = deadCode ? createFixes(deadCode, {}) : [];
    const suggestions = generateSuggestions(report.deadCode, report.drift, report.patterns);

    if (input.dryRun) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ fixes, suggestions }) }],
      };
    }

    if (fixes.length > 0) {
      const applied = await applyFixes(fixes, {});
      if (!applied.ok) return resultToMcpResponse(applied);
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify({ ...applied.value, suggestions }) },
        ],
      };
    }

    return resultToMcpResponse(Ok({ fixes: [], applied: 0, suggestions }));
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/mcp-server && npx vitest run tests/tools/entropy.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/mcp-server/src/tools/entropy.ts packages/mcp-server/tests/tools/entropy.test.ts
git commit -m "feat(mcp-server): add suggestions to apply_fixes response"
```

---

## Chunk 5: Server Registration and Docs

### Task 9: Register all new tools and resources in server.ts

**Files:**

- Modify: `packages/mcp-server/src/server.ts`
- Modify: `packages/mcp-server/tests/server.test.ts`

- [ ] **Step 1: Write failing test for new tool count**

Update `packages/mcp-server/tests/server.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { createHarnessServer, getToolDefinitions, getResourceDefinitions } from '../src/server';

describe('MCP Server', () => {
  it('creates a server instance', () => {
    const server = createHarnessServer();
    expect(server).toBeDefined();
  });

  it('registers all 23 tools', () => {
    const tools = getToolDefinitions();
    expect(tools).toHaveLength(23);
  });

  it('registers all 5 resources', () => {
    const resources = getResourceDefinitions();
    expect(resources).toHaveLength(5);
  });

  it('registers new state tools', () => {
    const names = getToolDefinitions().map((t) => t.name);
    expect(names).toContain('manage_state');
    expect(names).toContain('manage_handoff');
  });

  it('registers new feedback tools', () => {
    const names = getToolDefinitions().map((t) => t.name);
    expect(names).toContain('create_self_review');
    expect(names).toContain('analyze_diff');
    expect(names).toContain('request_peer_review');
  });

  it('registers new CLI-wrapped tools', () => {
    const names = getToolDefinitions().map((t) => t.name);
    expect(names).toContain('check_phase_gate');
    expect(names).toContain('validate_cross_check');
    expect(names).toContain('create_skill');
  });

  it('registers harness://state resource', () => {
    const uris = getResourceDefinitions().map((r) => r.uri);
    expect(uris).toContain('harness://state');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/mcp-server && npx vitest run tests/server.test.ts`
Expected: FAIL — tool count is 15, not 23

- [ ] **Step 3: Update server.ts with all new registrations**

Add imports at the top of `packages/mcp-server/src/server.ts`:

```typescript
import {
  manageStateDefinition,
  handleManageState,
  manageHandoffDefinition,
  handleManageHandoff,
} from './tools/state.js';
import {
  createSelfReviewDefinition,
  handleCreateSelfReview,
  analyzeDiffDefinition,
  handleAnalyzeDiff,
  requestPeerReviewDefinition,
  handleRequestPeerReview,
} from './tools/feedback.js';
import { checkPhaseGateDefinition, handleCheckPhaseGate } from './tools/phase-gate.js';
import { validateCrossCheckDefinition, handleValidateCrossCheck } from './tools/cross-check.js';
import { createSkillDefinition, handleCreateSkill } from './tools/skill.js';
import { getStateResource } from './resources/state.js';
```

Add to `TOOL_DEFINITIONS` array:

```typescript
  manageStateDefinition,
  manageHandoffDefinition,
  createSelfReviewDefinition,
  analyzeDiffDefinition,
  requestPeerReviewDefinition,
  checkPhaseGateDefinition,
  validateCrossCheckDefinition,
  createSkillDefinition,
```

Add to `TOOL_HANDLERS` record:

```typescript
  manage_state: handleManageState as ToolHandler,
  manage_handoff: handleManageHandoff as ToolHandler,
  create_self_review: handleCreateSelfReview as ToolHandler,
  analyze_diff: handleAnalyzeDiff as ToolHandler,
  request_peer_review: handleRequestPeerReview as ToolHandler,
  check_phase_gate: handleCheckPhaseGate as ToolHandler,
  validate_cross_check: handleValidateCrossCheck as ToolHandler,
  create_skill: handleCreateSkill as ToolHandler,
```

Add to `RESOURCE_DEFINITIONS` array:

```typescript
  {
    uri: 'harness://state',
    name: 'Project State',
    description: 'Current harness state including position, progress, decisions, and blockers',
    mimeType: 'application/json',
  },
```

Add to `RESOURCE_HANDLERS` record:

```typescript
  'harness://state': getStateResource,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/mcp-server && npx vitest run tests/server.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Run full test suite**

Run: `cd packages/mcp-server && npx vitest run`
Expected: All tests PASS

- [ ] **Step 6: Type-check the package**

Run: `npx tsc --noEmit -p packages/mcp-server/tsconfig.json`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add packages/mcp-server/src/server.ts packages/mcp-server/tests/server.test.ts
git commit -m "feat(mcp-server): register all new tools and resources in server"
```

---

### Task 10: Update documentation with new counts

**Files:**

- Modify: `README.md`
- Modify: `docs/guides/getting-started.md`

- [ ] **Step 1: Update README.md**

Update the tool/resource counts in the AI Agent Integration section:

- Change "15 tools" to "23 tools" wherever referenced
- Change "4 resources" to "5 resources" wherever referenced
- Update the MCP server description in the Packages table if it references tool count

- [ ] **Step 2: Update getting-started.md**

Update the "What the MCP Server Provides" section:

- Change `**15 tools**` to `**23 tools**`
- Change `**4 resources**` to `**5 resources**`
- Add `harness://state` to the resource list

- [ ] **Step 3: Commit**

```bash
git add README.md docs/guides/getting-started.md
git commit -m "docs: update MCP server tool and resource counts"
```

---

### Task 11: Verify MCP server exports for CLI-wrapped tools

**Files:**

- Check: `packages/cli/src/index.ts` or `packages/cli/package.json` exports

The CLI-wrapped tools (`check_phase_gate`, `validate_cross_check`, `create_skill`) import from `@harness-engineering/cli`. Verify these functions are exported from the CLI package's public API.

- [ ] **Step 1: Check CLI exports**

Check `packages/cli/src/index.ts` for exported functions: `runCheckPhaseGate`, `runCrossCheck`, `generateSkillFiles`.

- [ ] **Step 2: Add missing exports if needed**

If any function is not exported from the CLI's public API, add it to `packages/cli/src/index.ts`.

- [ ] **Step 3: Run type-check on mcp-server**

Run: `npx tsc --noEmit -p packages/mcp-server/tsconfig.json`
Expected: No errors

- [ ] **Step 4: Commit if changes were needed**

```bash
git add packages/cli/src/index.ts
git commit -m "feat(cli): export functions needed by mcp-server tools"
```

---

### Task 12: Final integration test

- [ ] **Step 1: Run full mcp-server test suite**

Run: `cd packages/mcp-server && npx vitest run`
Expected: All tests PASS

- [ ] **Step 2: Run full monorepo build**

Run: `pnpm build`
Expected: All packages build successfully

- [ ] **Step 3: Smoke test MCP server**

Run: `echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | npx @harness-engineering/mcp-server 2>/dev/null | head -1`

Verify response contains `"serverInfo"`.

- [ ] **Step 4: Verify tool count in live server**

Run: `echo -e '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}\n{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | npx @harness-engineering/mcp-server 2>/dev/null | tail -1 | node -e "process.stdin.on('data',d=>{const r=JSON.parse(d);console.log('Tools:',r.result.tools.length)})"`

Expected: `Tools: 23`

- [ ] **Step 5: Commit all remaining changes and tag**

```bash
git add -A
git status  # verify nothing unexpected
git commit -m "feat(mcp-server): complete MCP server expansion — 23 tools, 5 resources"
```

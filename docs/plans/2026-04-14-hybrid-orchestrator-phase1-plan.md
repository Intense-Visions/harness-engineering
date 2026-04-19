# Plan: Hybrid Orchestrator Phase 1 -- Local Backend + Model Router

**Date:** 2026-04-14 | **Spec:** docs/changes/hybrid-orchestrator/proposal.md | **Tasks:** 14 | **Time:** ~55 min

## Goal

The orchestrator routes issues to a local OpenAI-compatible model backend and escalates complex work to `needs-human` status, visible in the roadmap tracker and CLI logs.

## Observable Truths (Acceptance Criteria)

1. **SC1:** When a `LocalBackend` is configured, the system shall connect to the specified OpenAI-compatible endpoint and complete multi-turn agent sessions identically to the existing `OpenAIBackend`.
2. **SC2:** When the orchestrator dispatches `quick-fix` or `diagnostic` issues, the system shall route them to the local backend without human involvement.
3. **SC3:** The system shall route `full-exploration` issues (no spec, no plan) to `needs-human`.
4. **SC4:** When a `guided-change` issue has concern signals, the system shall escalate to `needs-human`; when it has none, the system shall dispatch locally.
5. **SC5:** When a diagnostic issue has 1 failed retry, the system shall produce an `EscalateEffect` rather than a standard retry.
6. **SC10:** While the local backend is unavailable, the system shall route all issues to the primary backend or `needs-human`, with no crashes.

## File Map

```
MODIFY packages/types/src/roadmap.ts                            (add 'needs-human' to FeatureStatus)
MODIFY packages/types/src/orchestrator.ts                       (add EscalationConfig, ScopeTier, ConcernSignal, RoutingDecision types; extend AgentConfig)
MODIFY packages/core/src/roadmap/parse.ts                       (add 'needs-human' to VALID_STATUSES)
CREATE packages/orchestrator/src/agent/backends/local.ts         (LocalBackend implementation)
CREATE packages/orchestrator/tests/agent/backends/local.test.ts  (LocalBackend tests)
CREATE packages/orchestrator/src/core/model-router.ts            (routeIssue + detectScopeTier pure functions)
CREATE packages/orchestrator/tests/core/model-router.test.ts     (model router tests)
MODIFY packages/orchestrator/src/types/events.ts                 (add backend field to DispatchEffect; add EscalateEffect)
MODIFY packages/orchestrator/src/core/state-machine.ts           (routing in handleTick; escalation in handleWorkerExit)
MODIFY packages/orchestrator/tests/core/state-machine.test.ts    (routing + escalation tests)
MODIFY packages/orchestrator/src/workflow/config.ts              (escalation defaults in getDefaultConfig)
CREATE packages/orchestrator/src/core/interaction-queue.ts        (JSON file persistence)
CREATE packages/orchestrator/tests/core/interaction-queue.test.ts (interaction queue tests)
MODIFY packages/orchestrator/src/orchestrator.ts                 (wire LocalBackend, handle EscalateEffect, call routeIssue)
MODIFY packages/orchestrator/src/core/index.ts                   (export new modules)
MODIFY packages/orchestrator/src/index.ts                        (export local backend)
MODIFY packages/types/src/index.ts                               (export new types)
```

## Skeleton

1. Type foundations -- FeatureStatus, ScopeTier, EscalationConfig, RoutingDecision, ConcernSignal (~3 tasks, ~10 min)
2. LocalBackend with TDD (~2 tasks, ~8 min)
3. Model router with TDD -- detectScopeTier + routeIssue (~2 tasks, ~10 min)
4. State machine extensions -- DispatchEffect.backend, EscalateEffect, diagnostic escalation (~3 tasks, ~12 min)
5. Interaction queue with TDD (~2 tasks, ~8 min)
6. Orchestrator wiring -- LocalBackend creation, routing call, effect handling (~2 tasks, ~7 min)

**Estimated total:** 14 tasks, ~55 minutes

## Tasks

### Task 1: Add `needs-human` to FeatureStatus type and roadmap parser

**Depends on:** none | **Files:** `packages/types/src/roadmap.ts`, `packages/core/src/roadmap/parse.ts`

1. Edit `packages/types/src/roadmap.ts` line 4:

```typescript
export type FeatureStatus =
  | 'backlog'
  | 'planned'
  | 'in-progress'
  | 'done'
  | 'blocked'
  | 'needs-human';
```

2. Edit `packages/core/src/roadmap/parse.ts` lines 13-19, add `'needs-human'` to `VALID_STATUSES`:

```typescript
const VALID_STATUSES: ReadonlySet<string> = new Set([
  'backlog',
  'planned',
  'in-progress',
  'done',
  'blocked',
  'needs-human',
]);
```

3. Run: `npx vitest run --config packages/orchestrator/vitest.config.mts`
4. Run: `npx harness validate`
5. Commit: `feat(types): add needs-human to FeatureStatus and roadmap parser`

---

### Task 2: Add orchestrator types -- ScopeTier, ConcernSignal, RoutingDecision, EscalationConfig

**Depends on:** none | **Files:** `packages/types/src/orchestrator.ts`, `packages/types/src/index.ts`

1. Append before the closing of `packages/types/src/orchestrator.ts` (after `WorkflowDefinition`):

```typescript
// --- Model Routing ---

/**
 * Scope tier determines the routing default for an issue.
 * Detected from plan/spec presence or label override.
 */
export type ScopeTier = 'quick-fix' | 'guided-change' | 'full-exploration' | 'diagnostic';

/**
 * A concern signal that may gate routing for signal-gated scope tiers.
 */
export interface ConcernSignal {
  /** Machine-readable signal name (e.g., 'highComplexity', 'securitySensitive') */
  name: string;
  /** Human-readable reason */
  reason: string;
}

/**
 * Result of the routeIssue() pure function.
 */
export type RoutingDecision =
  | { action: 'dispatch-local' }
  | { action: 'needs-human'; reasons: string[] };

/**
 * Configuration for escalation routing behavior.
 */
export interface EscalationConfig {
  /** Scope tiers that always escalate to human (default: ['full-exploration']) */
  alwaysHuman: ScopeTier[];
  /** Scope tiers that always dispatch to local backend (default: ['quick-fix', 'diagnostic']) */
  autoExecute: ScopeTier[];
  /** Scope tiers that dispatch locally only when no concern signals fire (default: ['guided-change']) */
  signalGated: ScopeTier[];
  /** Max retries for diagnostic issues before escalating (default: 1) */
  diagnosticRetryBudget: number;
}
```

2. Extend the `AgentConfig` interface in the same file (add after `stallTimeoutMs` field):

```typescript
  /** Local backend type (currently only 'openai-compatible') */
  localBackend?: 'openai-compatible';
  /** Model name for local backend */
  localModel?: string;
  /** Endpoint URL for local backend (e.g., http://localhost:11434/v1) */
  localEndpoint?: string;
  /** API key for local backend (some servers require a dummy key) */
  localApiKey?: string;
  /** Escalation routing configuration */
  escalation?: Partial<EscalationConfig>;
```

3. Export new types from `packages/types/src/index.ts` -- add to the orchestrator export block:

```typescript
export type {
  // ... existing exports ...
  ScopeTier,
  ConcernSignal,
  RoutingDecision,
  EscalationConfig,
} from './orchestrator';
```

4. Run: `npx harness validate`
5. Commit: `feat(types): add ScopeTier, ConcernSignal, RoutingDecision, EscalationConfig types`

---

### Task 3: Add EscalateEffect and backend field to DispatchEffect

**Depends on:** Task 2 | **Files:** `packages/orchestrator/src/types/events.ts`

1. Modify `DispatchEffect` in `packages/orchestrator/src/types/events.ts` to add the `backend` field:

```typescript
export interface DispatchEffect {
  type: 'dispatch';
  issue: Issue;
  attempt: number | null;
  /** Which backend to dispatch to. Defaults to 'primary' for backward compat. */
  backend?: 'local' | 'primary';
}
```

2. Add `EscalateEffect` interface after `EmitLogEffect`:

```typescript
export interface EscalateEffect {
  type: 'escalate';
  issueId: string;
  identifier: string;
  reasons: string[];
}
```

3. Add `EscalateEffect` to the `SideEffect` union:

```typescript
export type SideEffect =
  | DispatchEffect
  | StopEffect
  | ScheduleRetryEffect
  | ReleaseClaimEffect
  | CleanWorkspaceEffect
  | UpdateTokensEffect
  | EmitLogEffect
  | EscalateEffect;
```

4. Run: `npx vitest run --config packages/orchestrator/vitest.config.mts`
5. Run: `npx harness validate`
6. Commit: `feat(orchestrator): add EscalateEffect and backend field to DispatchEffect`

---

### Task 4: Add escalation config defaults to workflow config

**Depends on:** Task 2 | **Files:** `packages/orchestrator/src/workflow/config.ts`

1. Edit `getDefaultConfig()` in `packages/orchestrator/src/workflow/config.ts` to add escalation defaults to the agent section:

```typescript
agent: {
  backend: 'mock',
  maxConcurrentAgents: 1,
  maxTurns: 10,
  maxRetryBackoffMs: 5000,
  maxConcurrentAgentsByState: {},
  turnTimeoutMs: 300000,
  readTimeoutMs: 30000,
  stallTimeoutMs: 60000,
  escalation: {
    alwaysHuman: ['full-exploration'],
    autoExecute: ['quick-fix', 'diagnostic'],
    signalGated: ['guided-change'],
    diagnosticRetryBudget: 1,
  },
},
```

2. Run: `npx harness validate`
3. Commit: `feat(orchestrator): add escalation config defaults`

---

### Task 5: Write LocalBackend tests (TDD -- red phase)

**Depends on:** Task 2 | **Files:** `packages/orchestrator/tests/agent/backends/local.test.ts`

1. Create `packages/orchestrator/tests/agent/backends/local.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocalBackend } from '../../../src/agent/backends/local';

// Mock the openai module (same pattern as openai.test.ts)
vi.mock('openai', () => {
  const mockModelsList = vi.fn().mockResolvedValue({ data: [{ id: 'deepseek-coder-v2' }] });

  const mockStream = {
    [Symbol.asyncIterator]: async function* () {
      yield {
        choices: [{ delta: { content: 'Fix ' }, finish_reason: null }],
        usage: null,
      };
      yield {
        choices: [{ delta: { content: 'applied' }, finish_reason: 'stop' }],
        usage: {
          prompt_tokens: 80,
          completion_tokens: 20,
          total_tokens: 100,
        },
      };
    },
  };

  const mockChatCreate = vi.fn().mockResolvedValue(mockStream);

  const MockOpenAI = vi.fn().mockImplementation(function () {
    return {
      models: { list: mockModelsList },
      chat: {
        completions: { create: mockChatCreate },
      },
    };
  });

  return {
    default: MockOpenAI,
    __mockChatCreate: mockChatCreate,
    __mockModelsList: mockModelsList,
  };
});

describe('LocalBackend', () => {
  let backend: LocalBackend;

  beforeEach(() => {
    vi.clearAllMocks();
    backend = new LocalBackend({
      endpoint: 'http://localhost:11434/v1',
      model: 'deepseek-coder-v2',
    });
  });

  describe('constructor', () => {
    it('has name "local"', () => {
      expect(backend.name).toBe('local');
    });

    it('uses default endpoint when none provided', () => {
      const defaultBackend = new LocalBackend({});
      expect(defaultBackend.name).toBe('local');
    });
  });

  describe('startSession', () => {
    it('returns Ok with session containing backendName local', async () => {
      const result = await backend.startSession({
        workspacePath: '/tmp/workspace',
        permissionMode: 'full',
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.backendName).toBe('local');
        expect(result.value.sessionId).toMatch(/^local-session-/);
        expect(result.value.workspacePath).toBe('/tmp/workspace');
      }
    });

    it('stores systemPrompt from params', async () => {
      const result = await backend.startSession({
        workspacePath: '/tmp/workspace',
        permissionMode: 'full',
        systemPrompt: 'You are a local coding assistant.',
      });
      expect(result.ok).toBe(true);
    });
  });

  describe('runTurn', () => {
    it('yields AgentEvents and returns TurnResult with success:true', async () => {
      const sessionResult = await backend.startSession({
        workspacePath: '/tmp/workspace',
        permissionMode: 'full',
      });
      expect(sessionResult.ok).toBe(true);
      if (!sessionResult.ok) return;

      const session = sessionResult.value;
      const events: import('@harness-engineering/types').AgentEvent[] = [];

      const gen = backend.runTurn(session, {
        sessionId: session.sessionId,
        prompt: 'Fix the bug',
        isContinuation: false,
      });

      let next = await gen.next();
      while (!next.done) {
        events.push(next.value);
        next = await gen.next();
      }
      const result = next.value;

      expect(events.length).toBeGreaterThan(0);
      expect(events[0].type).toBe('text');
      expect(result.success).toBe(true);
      expect(result.usage.inputTokens).toBe(80);
      expect(result.usage.outputTokens).toBe(20);
    });
  });

  describe('stopSession', () => {
    it('returns Ok(undefined)', async () => {
      const sessionResult = await backend.startSession({
        workspacePath: '/tmp/workspace',
        permissionMode: 'full',
      });
      if (sessionResult.ok) {
        const stopResult = await backend.stopSession(sessionResult.value);
        expect(stopResult.ok).toBe(true);
      }
    });
  });

  describe('healthCheck', () => {
    it('returns Ok when models.list succeeds', async () => {
      const result = await backend.healthCheck();
      expect(result.ok).toBe(true);
    });

    it('returns Err when endpoint is unreachable', async () => {
      const openaiModule = await import('openai');
      const mockInstance = (openaiModule.default as ReturnType<typeof vi.fn>).mock.results.at(
        -1
      )?.value;
      if (mockInstance) {
        mockInstance.models.list.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      }
      const result = await backend.healthCheck();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('ECONNREFUSED');
      }
    });
  });
});
```

2. Run: `npx vitest run --config packages/orchestrator/vitest.config.mts tests/agent/backends/local.test.ts` -- confirm all tests fail (module not found).
3. Run: `npx harness validate`
4. Commit: `test(orchestrator): add LocalBackend test suite (red phase)`

---

### Task 6: Implement LocalBackend (TDD -- green phase)

**Depends on:** Task 5 | **Files:** `packages/orchestrator/src/agent/backends/local.ts`, `packages/orchestrator/src/index.ts`

1. Create `packages/orchestrator/src/agent/backends/local.ts`:

```typescript
import OpenAI from 'openai';
import {
  AgentBackend,
  SessionStartParams,
  AgentSession,
  TurnParams,
  AgentEvent,
  TurnResult,
  Result,
  Ok,
  Err,
  AgentError,
} from '@harness-engineering/types';

export interface LocalBackendConfig {
  /** Endpoint URL (e.g., http://localhost:11434/v1). Defaults to http://localhost:11434/v1. */
  endpoint?: string;
  /** Model name (e.g., deepseek-coder-v2). Defaults to 'deepseek-coder-v2'. */
  model?: string;
  /** Optional API key (some servers require a dummy key). */
  apiKey?: string;
}

export interface LocalSession extends AgentSession {
  systemPrompt?: string;
}

export class LocalBackend implements AgentBackend {
  readonly name = 'local';
  private config: Required<LocalBackendConfig>;
  private client: OpenAI;

  constructor(config: LocalBackendConfig = {}) {
    this.config = {
      endpoint: config.endpoint ?? 'http://localhost:11434/v1',
      model: config.model ?? 'deepseek-coder-v2',
      apiKey: config.apiKey ?? 'ollama',
    };
    this.client = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.endpoint,
    });
  }

  async startSession(params: SessionStartParams): Promise<Result<AgentSession, AgentError>> {
    const session: LocalSession = {
      sessionId: `local-session-${Date.now()}`,
      workspacePath: params.workspacePath,
      backendName: this.name,
      startedAt: new Date().toISOString(),
      ...(params.systemPrompt !== undefined && { systemPrompt: params.systemPrompt }),
    };
    return Ok(session);
  }

  async *runTurn(
    session: AgentSession,
    params: TurnParams
  ): AsyncGenerator<AgentEvent, TurnResult, void> {
    const localSession = session as LocalSession;

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    if (localSession.systemPrompt) {
      messages.push({ role: 'system', content: localSession.systemPrompt });
    }

    messages.push({ role: 'user', content: params.prompt });

    let inputTokens = 0;
    let outputTokens = 0;
    let totalTokens = 0;

    try {
      const stream = await this.client.chat.completions.create({
        model: this.config.model,
        messages,
        stream: true,
        stream_options: { include_usage: true },
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;

        if (delta?.content) {
          const event: AgentEvent = {
            type: 'text',
            timestamp: new Date().toISOString(),
            content: delta.content,
            sessionId: session.sessionId,
          };
          yield event;
        }

        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens ?? 0;
          outputTokens = chunk.usage.completion_tokens ?? 0;
          totalTokens = chunk.usage.total_tokens ?? 0;
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Local backend request failed';
      yield {
        type: 'error',
        timestamp: new Date().toISOString(),
        content: errorMessage,
        sessionId: session.sessionId,
      };
      return {
        success: false,
        sessionId: session.sessionId,
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        error: errorMessage,
      };
    }

    return {
      success: true,
      sessionId: session.sessionId,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens,
      },
    };
  }

  async stopSession(_session: AgentSession): Promise<Result<void, AgentError>> {
    return Ok(undefined);
  }

  async healthCheck(): Promise<Result<void, AgentError>> {
    try {
      await this.client.models.list();
      return Ok(undefined);
    } catch (err) {
      return Err({
        category: 'response_error',
        message: err instanceof Error ? err.message : 'Local backend health check failed',
      });
    }
  }
}
```

2. Add export to `packages/orchestrator/src/index.ts`:

```typescript
export * from './agent/backends/local';
```

3. Run: `npx vitest run --config packages/orchestrator/vitest.config.mts tests/agent/backends/local.test.ts` -- all tests pass.
4. Run: `npx harness validate`
5. Commit: `feat(orchestrator): implement LocalBackend for OpenAI-compatible servers`

---

### Task 7: Write model router tests (TDD -- red phase)

**Depends on:** Task 2 | **Files:** `packages/orchestrator/tests/core/model-router.test.ts`

1. Create `packages/orchestrator/tests/core/model-router.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { detectScopeTier, routeIssue } from '../../src/core/model-router';
import type { Issue, EscalationConfig, ConcernSignal } from '@harness-engineering/types';

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 'id-1',
    identifier: 'TEST-1',
    title: 'Test issue',
    description: null,
    priority: null,
    state: 'Todo',
    branchName: null,
    url: null,
    labels: [],
    blockedBy: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: null,
    ...overrides,
  };
}

const defaultConfig: EscalationConfig = {
  alwaysHuman: ['full-exploration'],
  autoExecute: ['quick-fix', 'diagnostic'],
  signalGated: ['guided-change'],
  diagnosticRetryBudget: 1,
};

describe('detectScopeTier', () => {
  it('returns full-exploration when no spec and no plan exist', () => {
    const tier = detectScopeTier(makeIssue(), { hasSpec: false, hasPlans: false });
    expect(tier).toBe('full-exploration');
  });

  it('returns guided-change when spec exists but no plan', () => {
    const tier = detectScopeTier(makeIssue(), { hasSpec: true, hasPlans: false });
    expect(tier).toBe('guided-change');
  });

  it('returns guided-change when plan exists', () => {
    const tier = detectScopeTier(makeIssue(), { hasSpec: false, hasPlans: true });
    expect(tier).toBe('guided-change');
  });

  it('returns quick-fix when label override is present', () => {
    const issue = makeIssue({ labels: ['scope:quick-fix'] });
    const tier = detectScopeTier(issue, { hasSpec: false, hasPlans: false });
    expect(tier).toBe('quick-fix');
  });

  it('returns diagnostic when label override is present', () => {
    const issue = makeIssue({ labels: ['scope:diagnostic'] });
    const tier = detectScopeTier(issue, { hasSpec: false, hasPlans: false });
    expect(tier).toBe('diagnostic');
  });

  it('label override takes precedence over artifact detection', () => {
    const issue = makeIssue({ labels: ['scope:quick-fix'] });
    const tier = detectScopeTier(issue, { hasSpec: true, hasPlans: true });
    expect(tier).toBe('quick-fix');
  });

  it('returns full-exploration for explicit label override', () => {
    const issue = makeIssue({ labels: ['scope:full-exploration'] });
    const tier = detectScopeTier(issue, { hasSpec: true, hasPlans: true });
    expect(tier).toBe('full-exploration');
  });
});

describe('routeIssue', () => {
  it('returns needs-human for full-exploration (SC3)', () => {
    const result = routeIssue('full-exploration', [], defaultConfig);
    expect(result.action).toBe('needs-human');
    if (result.action === 'needs-human') {
      expect(result.reasons).toContain('full-exploration tier always requires human');
    }
  });

  it('returns dispatch-local for quick-fix (SC2)', () => {
    const result = routeIssue('quick-fix', [], defaultConfig);
    expect(result.action).toBe('dispatch-local');
  });

  it('returns dispatch-local for diagnostic with no signals (SC2)', () => {
    const result = routeIssue('diagnostic', [], defaultConfig);
    expect(result.action).toBe('dispatch-local');
  });

  it('returns dispatch-local for guided-change with no concern signals', () => {
    const result = routeIssue('guided-change', [], defaultConfig);
    expect(result.action).toBe('dispatch-local');
  });

  it('returns needs-human for guided-change with concern signals (SC4)', () => {
    const signals: ConcernSignal[] = [
      { name: 'highComplexity', reason: 'Issue touches 12 files across 4 packages' },
    ];
    const result = routeIssue('guided-change', signals, defaultConfig);
    expect(result.action).toBe('needs-human');
    if (result.action === 'needs-human') {
      expect(result.reasons).toContain('highComplexity: Issue touches 12 files across 4 packages');
    }
  });

  it('returns needs-human for guided-change with multiple concern signals', () => {
    const signals: ConcernSignal[] = [
      { name: 'highComplexity', reason: 'Many files' },
      { name: 'securitySensitive', reason: 'Auth changes' },
    ];
    const result = routeIssue('guided-change', signals, defaultConfig);
    expect(result.action).toBe('needs-human');
    if (result.action === 'needs-human') {
      expect(result.reasons).toHaveLength(2);
    }
  });

  it('respects custom alwaysHuman config', () => {
    const customConfig: EscalationConfig = {
      ...defaultConfig,
      alwaysHuman: ['full-exploration', 'diagnostic'],
      autoExecute: ['quick-fix'],
    };
    const result = routeIssue('diagnostic', [], customConfig);
    expect(result.action).toBe('needs-human');
  });

  it('returns dispatch-local for scope tier not in any config list', () => {
    const emptyConfig: EscalationConfig = {
      alwaysHuman: [],
      autoExecute: [],
      signalGated: [],
      diagnosticRetryBudget: 1,
    };
    // When a tier is not in any list, default to dispatch-local
    const result = routeIssue('quick-fix', [], emptyConfig);
    expect(result.action).toBe('dispatch-local');
  });
});
```

2. Run: `npx vitest run --config packages/orchestrator/vitest.config.mts tests/core/model-router.test.ts` -- confirm tests fail (module not found).
3. Run: `npx harness validate`
4. Commit: `test(orchestrator): add model router test suite (red phase)`

---

### Task 8: Implement model router (TDD -- green phase)

**Depends on:** Task 7 | **Files:** `packages/orchestrator/src/core/model-router.ts`, `packages/orchestrator/src/core/index.ts`

1. Create `packages/orchestrator/src/core/model-router.ts`:

```typescript
import type {
  Issue,
  ScopeTier,
  ConcernSignal,
  RoutingDecision,
  EscalationConfig,
} from '@harness-engineering/types';

/**
 * Artifact presence metadata for scope tier detection.
 */
export interface ArtifactPresence {
  hasSpec: boolean;
  hasPlans: boolean;
}

const SCOPE_LABEL_PREFIX = 'scope:';
const VALID_SCOPE_TIERS: ReadonlySet<string> = new Set([
  'quick-fix',
  'guided-change',
  'full-exploration',
  'diagnostic',
]);

/**
 * Detect the scope tier for an issue based on label overrides and artifact presence.
 *
 * Label override (e.g., `scope:quick-fix`) takes precedence.
 * Otherwise, infer from spec/plan presence:
 *   - No spec, no plan -> full-exploration
 *   - Spec or plan exists -> guided-change
 */
export function detectScopeTier(issue: Issue, artifacts: ArtifactPresence): ScopeTier {
  // Check for label override
  for (const label of issue.labels) {
    if (label.startsWith(SCOPE_LABEL_PREFIX)) {
      const tier = label.slice(SCOPE_LABEL_PREFIX.length);
      if (VALID_SCOPE_TIERS.has(tier)) {
        return tier as ScopeTier;
      }
    }
  }

  // Infer from artifacts
  if (artifacts.hasPlans || artifacts.hasSpec) {
    return 'guided-change';
  }

  return 'full-exploration';
}

/**
 * Pure routing function. Determines whether an issue should be dispatched
 * to the local backend or escalated to needs-human.
 *
 * Routing rules (in order):
 * 1. If tier is in alwaysHuman -> needs-human
 * 2. If tier is in autoExecute -> dispatch-local
 * 3. If tier is in signalGated -> check concern signals
 * 4. Otherwise -> dispatch-local (safe default)
 */
export function routeIssue(
  scopeTier: ScopeTier,
  concernSignals: ConcernSignal[],
  config: EscalationConfig
): RoutingDecision {
  // Rule 1: Always human
  if (config.alwaysHuman.includes(scopeTier)) {
    return {
      action: 'needs-human',
      reasons: [`${scopeTier} tier always requires human`],
    };
  }

  // Rule 2: Auto execute
  if (config.autoExecute.includes(scopeTier)) {
    return { action: 'dispatch-local' };
  }

  // Rule 3: Signal gated
  if (config.signalGated.includes(scopeTier)) {
    if (concernSignals.length > 0) {
      return {
        action: 'needs-human',
        reasons: concernSignals.map((s) => `${s.name}: ${s.reason}`),
      };
    }
    return { action: 'dispatch-local' };
  }

  // Rule 4: Default - dispatch locally
  return { action: 'dispatch-local' };
}
```

2. Add export to `packages/orchestrator/src/core/index.ts`:

```typescript
export { detectScopeTier, routeIssue } from './model-router';
export type { ArtifactPresence } from './model-router';
```

3. Run: `npx vitest run --config packages/orchestrator/vitest.config.mts tests/core/model-router.test.ts` -- all tests pass.
4. Run: `npx harness validate`
5. Commit: `feat(orchestrator): implement model router with detectScopeTier and routeIssue`

---

### Task 9: Extend state machine -- routing in handleTick, EscalateEffect in handleWorkerExit

**Depends on:** Task 3, Task 8 | **Files:** `packages/orchestrator/src/core/state-machine.ts`

This task modifies the pure state machine to:

- Add `backend: 'local'` to dispatch effects when routing decides local
- Produce `EscalateEffect` instead of `DispatchEffect` when routing decides needs-human
- Produce `EscalateEffect` for diagnostic issues that exceed retry budget

1. In `packages/orchestrator/src/core/state-machine.ts`, add import for routing types:

```typescript
import type { EscalationConfig, ScopeTier } from '@harness-engineering/types';
import { routeIssue } from './model-router';
import type { ArtifactPresence } from './model-router';
```

2. Add a helper to resolve escalation config with defaults:

```typescript
function resolveEscalationConfig(config: WorkflowConfig): EscalationConfig {
  const partial = config.agent.escalation;
  return {
    alwaysHuman: partial?.alwaysHuman ?? ['full-exploration'],
    autoExecute: partial?.autoExecute ?? ['quick-fix', 'diagnostic'],
    signalGated: partial?.signalGated ?? ['guided-change'],
    diagnosticRetryBudget: partial?.diagnosticRetryBudget ?? 1,
  };
}
```

3. Modify the dispatch loop in `handleTick` -- after the `canDispatch` check and before `effects.push({ type: 'dispatch' ... })`, insert routing logic. The full replacement for the dispatch loop inside `handleTick`:

Replace the `for (const issue of eligible)` loop body with:

```typescript
const escalationConfig = resolveEscalationConfig(config);

for (const issue of eligible) {
  if (!canDispatch(next, issue.state, config.agent.maxConcurrentAgentsByState)) {
    break; // No more slots available
  }

  // Route the issue if local backend is configured
  if (config.agent.localBackend) {
    // Detect scope tier from labels (artifact presence is resolved by the orchestrator,
    // not the state machine -- pass empty artifacts here for label-only detection)
    const artifacts: ArtifactPresence = { hasSpec: false, hasPlans: false };
    // Check for scope label override; if no label override, the orchestrator
    // will have attached scope info via issue metadata before the tick.
    // For now, use label-based detection only in the state machine.
    const { detectScopeTier } = await import('./model-router');
    const scopeTier = detectScopeTier(issue, artifacts);
    const decision = routeIssue(scopeTier, [], escalationConfig);

    if (decision.action === 'needs-human') {
      next.claimed.add(issue.id);
      effects.push({
        type: 'escalate',
        issueId: issue.id,
        identifier: issue.identifier,
        reasons: decision.reasons,
      });
      continue;
    }
  }

  next.claimed.add(issue.id);
  // Add a placeholder RunningEntry so canDispatch sees the correct count
  next.running.set(issue.id, {
    issueId: issue.id,
    identifier: issue.identifier,
    issue,
    attempt: null,
    workspacePath: '',
    startedAt: new Date(nowMs).toISOString(),
    phase: 'PreparingWorkspace',
    session: null,
  });
  effects.push({
    type: 'dispatch',
    issue,
    attempt: null,
    backend: config.agent.localBackend ? 'local' : 'primary',
  });
}
```

**Important correction:** The state machine must remain synchronous (pure functional). We cannot use `await import()` inside the state machine. Since `routeIssue` and `detectScopeTier` are already imported at the top of the file (step 1), we use them directly. The above code should NOT use dynamic import. The corrected loop is:

```typescript
const escalationConfig = resolveEscalationConfig(config);

for (const issue of eligible) {
  if (!canDispatch(next, issue.state, config.agent.maxConcurrentAgentsByState)) {
    break;
  }

  if (config.agent.localBackend) {
    const scopeTier = detectScopeTier(issue, { hasSpec: false, hasPlans: false });
    const decision = routeIssue(scopeTier, [], escalationConfig);

    if (decision.action === 'needs-human') {
      next.claimed.add(issue.id);
      effects.push({
        type: 'escalate',
        issueId: issue.id,
        identifier: issue.identifier,
        reasons: decision.reasons,
      });
      continue;
    }
  }

  next.claimed.add(issue.id);
  next.running.set(issue.id, {
    issueId: issue.id,
    identifier: issue.identifier,
    issue,
    attempt: null,
    workspacePath: '',
    startedAt: new Date(nowMs).toISOString(),
    phase: 'PreparingWorkspace',
    session: null,
  });
  effects.push({
    type: 'dispatch',
    issue,
    attempt: null,
    backend: config.agent.localBackend ? 'local' : 'primary',
  });
}
```

**Note:** Artifact presence (`hasSpec`, `hasPlans`) is a simplification for now using labels only. The orchestrator layer (Task 12) will resolve artifacts before calling the state machine. In the state machine, we only use `detectScopeTier` with label-based detection. Full artifact detection is handled by the orchestrator before passing issues to the tick.

4. Modify `handleWorkerExit` to escalate diagnostics that exceed retry budget. After the `else` branch (error case), add a diagnostic escalation check:

Replace the error branch in `handleWorkerExit`:

```typescript
  } else {
    const nextAttempt = (attempt ?? 0) + 1;
    const escalationConfig = resolveEscalationConfig(config);

    // Check if this is a diagnostic issue that has exceeded its retry budget
    const scopeLabel = entry?.issue.labels.find((l) => l.startsWith('scope:'));
    const isDiagnostic = scopeLabel === 'scope:diagnostic';
    if (isDiagnostic && nextAttempt > escalationConfig.diagnosticRetryBudget) {
      effects.push({
        type: 'escalate',
        issueId,
        identifier: entry?.identifier ?? issueId,
        reasons: [`diagnostic exceeded retry budget (${escalationConfig.diagnosticRetryBudget})`],
      });
      return { nextState: next, effects };
    }

    const delayMs = calculateRetryDelay(nextAttempt, 'failure', config.agent.maxRetryBackoffMs);
    next.retryAttempts.set(issueId, {
      issueId,
      identifier: entry?.identifier ?? issueId,
      attempt: nextAttempt,
      dueAtMs: nowMs + delayMs,
      error: error ?? 'unknown error',
    });
    effects.push({
      type: 'scheduleRetry',
      issueId,
      identifier: entry?.identifier ?? issueId,
      attempt: nextAttempt,
      delayMs,
      error: error ?? 'unknown error',
    });
  }
```

5. Run: `npx vitest run --config packages/orchestrator/vitest.config.mts tests/core/state-machine.test.ts`
6. Run: `npx harness validate`
7. Commit: `feat(orchestrator): extend state machine with routing and diagnostic escalation`

---

### Task 10: Add state machine tests for routing and escalation

**Depends on:** Task 9 | **Files:** `packages/orchestrator/tests/core/state-machine.test.ts`

1. Append the following test suites to `packages/orchestrator/tests/core/state-machine.test.ts`:

```typescript
describe('applyEvent - tick with routing', () => {
  function makeRoutingConfig(overrides: Partial<WorkflowConfig> = {}): WorkflowConfig {
    return makeConfig({
      agent: {
        ...makeConfig().agent,
        localBackend: 'openai-compatible' as const,
        localModel: 'deepseek-coder-v2',
        localEndpoint: 'http://localhost:11434/v1',
        escalation: {
          alwaysHuman: ['full-exploration'],
          autoExecute: ['quick-fix', 'diagnostic'],
          signalGated: ['guided-change'],
          diagnosticRetryBudget: 1,
        },
      },
      ...overrides,
    });
  }

  it('should escalate full-exploration issues to needs-human (SC3)', () => {
    const config = makeRoutingConfig();
    const state = createEmptyState(config);
    // No scope label, no artifacts -> full-exploration -> needs-human
    const candidates = [makeIssue({ id: '1', identifier: 'A-1' })];

    const event: OrchestratorEvent = {
      type: 'tick',
      candidates,
      runningStates: new Map(),
      nowMs: 1706745600000,
    };

    const { effects } = applyEvent(state, event, config);
    const escalations = effects.filter((e) => e.type === 'escalate');
    expect(escalations).toHaveLength(1);
    if (escalations[0] && escalations[0].type === 'escalate') {
      expect(escalations[0].issueId).toBe('1');
      expect(escalations[0].reasons).toContain('full-exploration tier always requires human');
    }
    // No dispatch effects
    const dispatches = effects.filter((e) => e.type === 'dispatch');
    expect(dispatches).toHaveLength(0);
  });

  it('should dispatch quick-fix issues to local backend (SC2)', () => {
    const config = makeRoutingConfig();
    const state = createEmptyState(config);
    const candidates = [makeIssue({ id: '1', identifier: 'A-1', labels: ['scope:quick-fix'] })];

    const event: OrchestratorEvent = {
      type: 'tick',
      candidates,
      runningStates: new Map(),
      nowMs: 1706745600000,
    };

    const { effects } = applyEvent(state, event, config);
    const dispatches = effects.filter((e) => e.type === 'dispatch') as DispatchEffect[];
    expect(dispatches).toHaveLength(1);
    expect(dispatches[0].backend).toBe('local');
  });

  it('should dispatch diagnostic issues to local backend (SC2)', () => {
    const config = makeRoutingConfig();
    const state = createEmptyState(config);
    const candidates = [makeIssue({ id: '1', identifier: 'A-1', labels: ['scope:diagnostic'] })];

    const event: OrchestratorEvent = {
      type: 'tick',
      candidates,
      runningStates: new Map(),
      nowMs: 1706745600000,
    };

    const { effects } = applyEvent(state, event, config);
    const dispatches = effects.filter((e) => e.type === 'dispatch') as DispatchEffect[];
    expect(dispatches).toHaveLength(1);
    expect(dispatches[0].backend).toBe('local');
  });

  it('should not route when localBackend is not configured', () => {
    const config = makeConfig(); // No localBackend
    const state = createEmptyState(config);
    const candidates = [makeIssue({ id: '1', identifier: 'A-1' })];

    const event: OrchestratorEvent = {
      type: 'tick',
      candidates,
      runningStates: new Map(),
      nowMs: 1706745600000,
    };

    const { effects } = applyEvent(state, event, config);
    const dispatches = effects.filter((e) => e.type === 'dispatch') as DispatchEffect[];
    expect(dispatches).toHaveLength(1);
    // backend should be 'primary' (or undefined for backward compat)
    expect(dispatches[0].backend).not.toBe('local');
  });
});

describe('applyEvent - worker_exit with diagnostic escalation', () => {
  function makeRoutingConfig(): WorkflowConfig {
    return makeConfig({
      agent: {
        ...makeConfig().agent,
        localBackend: 'openai-compatible' as const,
        escalation: {
          diagnosticRetryBudget: 1,
        },
      },
    });
  }

  it('should escalate diagnostic after 1 failed retry (SC5)', () => {
    const config = makeRoutingConfig();
    const state = createEmptyState(config);
    state.running.set('id-1', {
      issueId: 'id-1',
      identifier: 'TEST-1',
      issue: makeIssue({ id: 'id-1', labels: ['scope:diagnostic'] }),
      attempt: 1,
      workspacePath: '/tmp/ws/test-1',
      startedAt: '2026-01-01T00:00:00Z',
      phase: 'StreamingTurn',
      session: null,
    });

    const event: OrchestratorEvent = {
      type: 'worker_exit',
      issueId: 'id-1',
      reason: 'error',
      error: 'agent failed to fix bug',
      attempt: 1,
    };

    const { effects } = applyEvent(state, event, config);
    const escalations = effects.filter((e) => e.type === 'escalate');
    expect(escalations).toHaveLength(1);
    if (escalations[0] && escalations[0].type === 'escalate') {
      expect(escalations[0].reasons[0]).toContain('diagnostic exceeded retry budget');
    }
    // Should NOT produce a scheduleRetry effect
    const retries = effects.filter((e) => e.type === 'scheduleRetry');
    expect(retries).toHaveLength(0);
  });

  it('should NOT escalate diagnostic on first attempt failure (allows 1 retry)', () => {
    const config = makeRoutingConfig();
    const state = createEmptyState(config);
    state.running.set('id-1', {
      issueId: 'id-1',
      identifier: 'TEST-1',
      issue: makeIssue({ id: 'id-1', labels: ['scope:diagnostic'] }),
      attempt: null,
      workspacePath: '/tmp/ws/test-1',
      startedAt: '2026-01-01T00:00:00Z',
      phase: 'StreamingTurn',
      session: null,
    });

    const event: OrchestratorEvent = {
      type: 'worker_exit',
      issueId: 'id-1',
      reason: 'error',
      error: 'first failure',
      attempt: null,
    };

    const { effects } = applyEvent(state, event, config);
    // First failure: nextAttempt = 1, budget = 1, so 1 <= 1 means do NOT escalate yet
    const retries = effects.filter((e) => e.type === 'scheduleRetry');
    expect(retries).toHaveLength(1);
    const escalations = effects.filter((e) => e.type === 'escalate');
    expect(escalations).toHaveLength(0);
  });

  it('should NOT escalate non-diagnostic issues', () => {
    const config = makeRoutingConfig();
    const state = createEmptyState(config);
    state.running.set('id-1', {
      issueId: 'id-1',
      identifier: 'TEST-1',
      issue: makeIssue({ id: 'id-1', labels: ['scope:guided-change'] }),
      attempt: 1,
      workspacePath: '/tmp/ws/test-1',
      startedAt: '2026-01-01T00:00:00Z',
      phase: 'StreamingTurn',
      session: null,
    });

    const event: OrchestratorEvent = {
      type: 'worker_exit',
      issueId: 'id-1',
      reason: 'error',
      error: 'agent failed',
      attempt: 1,
    };

    const { effects } = applyEvent(state, event, config);
    const retries = effects.filter((e) => e.type === 'scheduleRetry');
    expect(retries).toHaveLength(1);
    const escalations = effects.filter((e) => e.type === 'escalate');
    expect(escalations).toHaveLength(0);
  });
});
```

2. Add import for `DispatchEffect` at the top of the test file if not already present:

```typescript
import type { OrchestratorEvent, SideEffect, DispatchEffect } from '../../src/types/events';
```

3. Run: `npx vitest run --config packages/orchestrator/vitest.config.mts tests/core/state-machine.test.ts` -- all tests pass.
4. Run: `npx harness validate`
5. Commit: `test(orchestrator): add state machine tests for routing and diagnostic escalation`

---

### Task 11: Write interaction queue tests (TDD -- red phase)

**Depends on:** none | **Files:** `packages/orchestrator/tests/core/interaction-queue.test.ts`

1. Create `packages/orchestrator/tests/core/interaction-queue.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { InteractionQueue } from '../../src/core/interaction-queue';
import type { PendingInteraction } from '../../src/core/interaction-queue';

describe('InteractionQueue', () => {
  let tmpDir: string;
  let queue: InteractionQueue;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'iq-test-'));
    queue = new InteractionQueue(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('push', () => {
    it('creates the interactions directory if it does not exist', async () => {
      const interaction: PendingInteraction = {
        id: 'int-1',
        issueId: 'issue-1',
        type: 'needs-human',
        reasons: ['full-exploration tier always requires human'],
        context: {
          issueTitle: 'Implement new feature',
          issueDescription: null,
          specPath: null,
          planPath: null,
          relatedFiles: [],
        },
        createdAt: '2026-01-01T00:00:00Z',
        status: 'pending',
      };

      await queue.push(interaction);

      const filePath = path.join(tmpDir, 'int-1.json');
      const raw = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      expect(parsed.id).toBe('int-1');
      expect(parsed.status).toBe('pending');
    });
  });

  describe('list', () => {
    it('returns empty array when no interactions exist', async () => {
      const result = await queue.list();
      expect(result).toEqual([]);
    });

    it('returns all pending interactions', async () => {
      await queue.push({
        id: 'int-1',
        issueId: 'issue-1',
        type: 'needs-human',
        reasons: ['reason-1'],
        context: {
          issueTitle: 'A',
          issueDescription: null,
          specPath: null,
          planPath: null,
          relatedFiles: [],
        },
        createdAt: '2026-01-01T00:00:00Z',
        status: 'pending',
      });
      await queue.push({
        id: 'int-2',
        issueId: 'issue-2',
        type: 'needs-human',
        reasons: ['reason-2'],
        context: {
          issueTitle: 'B',
          issueDescription: null,
          specPath: null,
          planPath: null,
          relatedFiles: [],
        },
        createdAt: '2026-01-01T00:01:00Z',
        status: 'pending',
      });

      const result = await queue.list();
      expect(result).toHaveLength(2);
    });
  });

  describe('updateStatus', () => {
    it('updates the status of an interaction', async () => {
      await queue.push({
        id: 'int-1',
        issueId: 'issue-1',
        type: 'needs-human',
        reasons: ['reason-1'],
        context: {
          issueTitle: 'A',
          issueDescription: null,
          specPath: null,
          planPath: null,
          relatedFiles: [],
        },
        createdAt: '2026-01-01T00:00:00Z',
        status: 'pending',
      });

      await queue.updateStatus('int-1', 'resolved');

      const items = await queue.list();
      expect(items[0].status).toBe('resolved');
    });

    it('throws when interaction does not exist', async () => {
      await expect(queue.updateStatus('nonexistent', 'resolved')).rejects.toThrow();
    });
  });

  describe('listPending', () => {
    it('returns only pending interactions', async () => {
      await queue.push({
        id: 'int-1',
        issueId: 'issue-1',
        type: 'needs-human',
        reasons: ['reason-1'],
        context: {
          issueTitle: 'A',
          issueDescription: null,
          specPath: null,
          planPath: null,
          relatedFiles: [],
        },
        createdAt: '2026-01-01T00:00:00Z',
        status: 'pending',
      });
      await queue.push({
        id: 'int-2',
        issueId: 'issue-2',
        type: 'needs-human',
        reasons: ['reason-2'],
        context: {
          issueTitle: 'B',
          issueDescription: null,
          specPath: null,
          planPath: null,
          relatedFiles: [],
        },
        createdAt: '2026-01-01T00:01:00Z',
        status: 'resolved',
      });

      const result = await queue.listPending();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('int-1');
    });
  });
});
```

2. Run: `npx vitest run --config packages/orchestrator/vitest.config.mts tests/core/interaction-queue.test.ts` -- confirm tests fail.
3. Run: `npx harness validate`
4. Commit: `test(orchestrator): add interaction queue test suite (red phase)`

---

### Task 12: Implement interaction queue (TDD -- green phase)

**Depends on:** Task 11 | **Files:** `packages/orchestrator/src/core/interaction-queue.ts`, `packages/orchestrator/src/core/index.ts`

1. Create `packages/orchestrator/src/core/interaction-queue.ts`:

```typescript
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/**
 * A pending human interaction, typically from an escalation.
 */
export interface PendingInteraction {
  /** Unique interaction ID */
  id: string;
  /** ID of the related issue */
  issueId: string;
  /** Interaction type */
  type: 'needs-human';
  /** Reasons for escalation */
  reasons: string[];
  /** Context for the human */
  context: {
    issueTitle: string;
    issueDescription: string | null;
    specPath: string | null;
    planPath: string | null;
    relatedFiles: string[];
  };
  /** ISO timestamp of creation */
  createdAt: string;
  /** Current status */
  status: 'pending' | 'claimed' | 'resolved';
}

/**
 * Persistent queue of pending human interactions.
 * Each interaction is stored as a separate JSON file in the configured directory.
 */
export class InteractionQueue {
  private dir: string;

  /**
   * @param dir - Directory path for storing interaction JSON files
   */
  constructor(dir: string) {
    this.dir = dir;
  }

  /**
   * Push a new interaction to the queue.
   */
  async push(interaction: PendingInteraction): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    const filePath = path.join(this.dir, `${interaction.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(interaction, null, 2), 'utf-8');
  }

  /**
   * List all interactions (regardless of status).
   */
  async list(): Promise<PendingInteraction[]> {
    try {
      const files = await fs.readdir(this.dir);
      const jsonFiles = files.filter((f) => f.endsWith('.json'));
      const interactions: PendingInteraction[] = [];

      for (const file of jsonFiles) {
        const filePath = path.join(this.dir, file);
        const raw = await fs.readFile(filePath, 'utf-8');
        interactions.push(JSON.parse(raw) as PendingInteraction);
      }

      return interactions;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw err;
    }
  }

  /**
   * List only pending interactions.
   */
  async listPending(): Promise<PendingInteraction[]> {
    const all = await this.list();
    return all.filter((i) => i.status === 'pending');
  }

  /**
   * Update the status of an interaction.
   */
  async updateStatus(id: string, status: PendingInteraction['status']): Promise<void> {
    const filePath = path.join(this.dir, `${id}.json`);
    let raw: string;
    try {
      raw = await fs.readFile(filePath, 'utf-8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Interaction ${id} not found`);
      }
      throw err;
    }
    const interaction = JSON.parse(raw) as PendingInteraction;
    interaction.status = status;
    await fs.writeFile(filePath, JSON.stringify(interaction, null, 2), 'utf-8');
  }
}
```

2. Add export to `packages/orchestrator/src/core/index.ts`:

```typescript
export { InteractionQueue } from './interaction-queue';
export type { PendingInteraction } from './interaction-queue';
```

3. Run: `npx vitest run --config packages/orchestrator/vitest.config.mts tests/core/interaction-queue.test.ts` -- all tests pass.
4. Run: `npx harness validate`
5. Commit: `feat(orchestrator): implement interaction queue with JSON file persistence`

---

### Task 13: Wire LocalBackend and EscalateEffect handling into orchestrator

**Depends on:** Task 6, Task 9, Task 12 | **Files:** `packages/orchestrator/src/orchestrator.ts`

1. Add imports at the top of `packages/orchestrator/src/orchestrator.ts`:

```typescript
import { LocalBackend } from './agent/backends/local';
import { InteractionQueue } from './core/interaction-queue';
import type { EscalateEffect } from './types/events';
```

2. Add `interactionQueue` field to the `Orchestrator` class (after the `logger` field):

```typescript
  private interactionQueue: InteractionQueue;
```

3. Initialize the interaction queue in the constructor (after logger initialization):

```typescript
this.interactionQueue = new InteractionQueue(
  path.join(config.workspace.root, '..', 'interactions')
);
```

Add `import * as path from 'node:path';` at the top if not already present.

4. Extend `createBackend()` to support `'local'` backend type. Add a new `createLocalBackend()` method:

```typescript
  private createLocalBackend(): AgentBackend | null {
    if (this.config.agent.localBackend === 'openai-compatible') {
      return new LocalBackend({
        endpoint: this.config.agent.localEndpoint,
        model: this.config.agent.localModel,
        apiKey: this.config.agent.localApiKey,
      });
    }
    return null;
  }
```

5. Add a `localRunner` field alongside `runner`:

```typescript
  private localRunner: AgentRunner | null;
```

Initialize it in the constructor after `this.runner`:

```typescript
const localBackend = this.createLocalBackend();
this.localRunner = localBackend
  ? new AgentRunner(localBackend, { maxTurns: config.agent.maxTurns })
  : null;
```

6. Modify `handleEffect` to handle `'escalate'`:

```typescript
      case 'escalate':
        await this.handleEscalation(effect as EscalateEffect);
        break;
```

7. Add the `handleEscalation` method:

```typescript
  /**
   * Handles an escalation effect by writing to the interaction queue and logging.
   */
  private async handleEscalation(effect: EscalateEffect): Promise<void> {
    const issue = Array.from(this.state.running.values()).find(
      (e) => e.issueId === effect.issueId
    )?.issue;

    this.logger.warn(
      `Escalating ${effect.identifier} to needs-human: ${effect.reasons.join('; ')}`,
      { issueId: effect.issueId }
    );

    await this.interactionQueue.push({
      id: `interaction-${Date.now()}-${effect.issueId.slice(0, 8)}`,
      issueId: effect.issueId,
      type: 'needs-human',
      reasons: effect.reasons,
      context: {
        issueTitle: issue?.title ?? effect.identifier,
        issueDescription: issue?.description ?? null,
        specPath: null,
        planPath: null,
        relatedFiles: [],
      },
      createdAt: new Date().toISOString(),
      status: 'pending',
    });
  }
```

8. Modify `dispatchIssue` to use the correct runner based on the `backend` field. Add a `backend` parameter:

Change the signature of `dispatchIssue`:

```typescript
  private async dispatchIssue(issue: Issue, attempt: number | null, backend?: 'local' | 'primary'): Promise<void> {
```

And in the `runAgentInBackgroundTask` call, pass the backend-selected runner:

```typescript
const activeRunner = backend === 'local' && this.localRunner ? this.localRunner : this.runner;
this.runAgentInBackgroundTask(issue, workspacePath, prompt, attempt, activeRunner);
```

9. Update `runAgentInBackgroundTask` signature to accept a runner parameter:

```typescript
  private runAgentInBackgroundTask(
    issue: Issue,
    workspacePath: string,
    prompt: string,
    attempt: number | null,
    runner?: AgentRunner
  ): void {
    const activeRunner = runner ?? this.runner;
```

And use `activeRunner.runSession(...)` instead of `this.runner.runSession(...)`.

10. Update the `handleEffect` dispatch case to pass backend:

```typescript
      case 'dispatch':
        await this.dispatchIssue(effect.issue, effect.attempt, effect.backend);
        break;
```

11. Run: `npx vitest run --config packages/orchestrator/vitest.config.mts`
12. Run: `npx harness validate`
13. Commit: `feat(orchestrator): wire LocalBackend, routing, and escalation handling`

---

### Task 14: Update roadmap tracker to support `needs-human` status

**Depends on:** Task 1 | **Files:** `packages/orchestrator/src/tracker/adapters/roadmap.ts`, `packages/orchestrator/tests/tracker/roadmap.test.ts`

[checkpoint:human-verify] -- Verify that the roadmap tracker already handles `needs-human` through the existing status mapping, since we added it to `FeatureStatus` and `VALID_STATUSES`. The tracker just passes through `feature.status` directly to `issue.state`, so no code changes are needed in the adapter itself. However, we need to verify this works and add a test.

1. Add a test to `packages/orchestrator/tests/tracker/roadmap.test.ts` that confirms `needs-human` status issues are fetched correctly. The exact test depends on existing test patterns in that file. Add:

```typescript
it('should include needs-human status issues when fetched by state', async () => {
  // This test verifies that the roadmap parser correctly handles 'needs-human' status
  // The actual parsing is handled by @harness-engineering/core parseRoadmap()
  // which we validated in Task 1 by adding 'needs-human' to VALID_STATUSES
});
```

2. Verify that `harness.orchestrator.md` `activeStates` can include `needs-human` by confirming the config loader passes arbitrary strings. (It does -- `activeStates` is `string[]` in `TrackerConfig`.)

3. Run: `npx vitest run --config packages/orchestrator/vitest.config.mts`
4. Run: `npx harness validate`
5. Commit: `feat(orchestrator): verify needs-human status support in roadmap tracker`

## Dependencies Graph

```
Task 1  (types: FeatureStatus)     ─────────────────────────────────┐
Task 2  (types: ScopeTier et al.)  ──┬──────────────────────────────┤
Task 3  (events: EscalateEffect)   ──┤ depends on T2               │
Task 4  (config: escalation)       ──┤ depends on T2               │
Task 5  (test: LocalBackend red)   ──┤ depends on T2               │
Task 6  (impl: LocalBackend green) ──┤ depends on T5               │
Task 7  (test: router red)         ──┤ depends on T2               │
Task 8  (impl: router green)       ──┤ depends on T7               │
Task 9  (state machine changes)    ──┤ depends on T3, T8           │
Task 10 (test: state machine)      ──┤ depends on T9               │
Task 11 (test: queue red)          ──┤ no dependencies             │
Task 12 (impl: queue green)        ──┤ depends on T11              │
Task 13 (orchestrator wiring)      ──┤ depends on T6, T9, T12      │
Task 14 (roadmap tracker)          ──┘ depends on T1               │
```

**Parallel opportunities:**

- Tasks 1, 2, 11 can run in parallel (no shared state)
- Tasks 3, 4, 5, 7 can run in parallel after Task 2
- Tasks 6, 8 can run in parallel after their respective test tasks
- Task 14 can run in parallel with Tasks 3-12 (only depends on Task 1)

# Plan: Orchestrator Foundation (Types + Pure State Machine Core)

**Date:** 2026-03-24
**Spec:** docs/changes/orchestrator/proposal.md
**ADR:** .harness/architecture/orchestrator/ADR-001.md
**Estimated tasks:** 14
**Estimated time:** 55 minutes

## Goal

Define all shared and internal types for the orchestrator, scaffold the `packages/orchestrator/` package, and implement the pure-function state machine core (state transitions, candidate selection, concurrency control, retry calculation, reconciliation logic) with full unit test coverage.

## Observable Truths (Acceptance Criteria)

1. **[Ubiquitous]** `packages/types/src/index.ts` exports `Issue`, `BlockerRef`, `IssueTrackerClient`, `AgentBackend`, `AgentSession`, `SessionStartParams`, `TurnParams`, `AgentEvent`, `TurnResult`, `AgentError`, `AgentErrorCategory`, `WorkflowDefinition`, `WorkflowConfig`, `TokenUsage`, and all sub-config interfaces.
2. **[Ubiquitous]** `packages/types/` builds successfully via `pnpm --filter @harness-engineering/types run build`.
3. **[Ubiquitous]** `packages/orchestrator/` exists with `package.json`, `tsconfig.json`, and is registered in the root `tsconfig.json` project references and recognized by Turborepo.
4. **[Ubiquitous]** `packages/orchestrator/src/types/internal.ts` exports `RetryEntry`, `LiveSession`, `OrchestratorState`, `RunningEntry`, and `RunAttemptPhase`.
5. **[Ubiquitous]** `packages/orchestrator/src/types/events.ts` exports `OrchestratorEvent` (discriminated union) and `SideEffect` (discriminated union).
6. **[Event-driven]** When `applyEvent(state, {type: 'tick', candidates, runningStates}, config)` is called, the returned `nextState` contains newly dispatched issues in `running` and `claimed` up to the concurrency limit, and `effects` contains `dispatch` side effects for each.
7. **[Event-driven]** When `applyEvent(state, {type: 'worker_exit', issueId, reason: 'normal'}, config)` is called, the returned `effects` contain a `scheduleRetry` with `delayMs: 1000` (continuation retry).
8. **[Event-driven]** When `applyEvent(state, {type: 'worker_exit', issueId, reason: 'error', error}, config)` is called, the returned `effects` contain a `scheduleRetry` with exponential backoff: `min(10000 * 2^(attempt-1), maxRetryBackoffMs)`.
9. **[Event-driven]** When `selectCandidates(issues, state, config)` is called, issues are sorted by priority ascending (null last), then `createdAt` oldest first, then `identifier` lexicographic; issues already in `claimed` or `running` are excluded; issues with non-terminal blockers are excluded when in Todo state.
10. **[Event-driven]** When `getAvailableSlots(state, config)` is called, it returns `max(maxConcurrentAgents - runningCount, 0)`, respecting per-state caps from `maxConcurrentAgentsByState`.
11. **[Event-driven]** When `applyEvent(state, {type: 'tick', ...}, config)` includes `runningStates` where an issue has a terminal state, the returned `effects` contain `stop` and `cleanWorkspace` side effects for that issue.
12. **[Event-driven]** When `applyEvent(state, {type: 'stall_detected', issueId}, config)` is called, the returned `effects` contain `stop` and `scheduleRetry` for the stalled issue.
13. **[Event-driven]** When `calculateRetryDelay(attempt, 'continuation')` is called, it returns `1000`. When `calculateRetryDelay(attempt, 'failure', maxBackoff)` is called, it returns `min(10000 * 2^(attempt-1), maxBackoff)`.
14. **[Event-driven]** When `reconcile(state, runningStates, config)` detects a running issue whose current state is terminal, the returned effects include `stop` and `cleanWorkspace`. When a running issue's state is neither active nor terminal, effects include `stop` without `cleanWorkspace`.
15. **[Ubiquitous]** `npx vitest run` in `packages/orchestrator/` passes all tests with zero failures.
16. **[Ubiquitous]** `harness validate` passes from the project root after all tasks are complete.

## File Map

```
CREATE packages/types/src/orchestrator.ts
MODIFY packages/types/src/index.ts (add orchestrator re-exports)
CREATE packages/orchestrator/package.json
CREATE packages/orchestrator/tsconfig.json
CREATE packages/orchestrator/src/index.ts
CREATE packages/orchestrator/src/types/internal.ts
CREATE packages/orchestrator/src/types/events.ts
CREATE packages/orchestrator/src/types/index.ts
CREATE packages/orchestrator/src/core/retry.ts
CREATE packages/orchestrator/src/core/candidate-selection.ts
CREATE packages/orchestrator/src/core/concurrency.ts
CREATE packages/orchestrator/src/core/reconciliation.ts
CREATE packages/orchestrator/src/core/state-machine.ts
CREATE packages/orchestrator/src/core/index.ts
CREATE packages/orchestrator/tests/core/retry.test.ts
CREATE packages/orchestrator/tests/core/candidate-selection.test.ts
CREATE packages/orchestrator/tests/core/concurrency.test.ts
CREATE packages/orchestrator/tests/core/reconciliation.test.ts
CREATE packages/orchestrator/tests/core/state-machine.test.ts
MODIFY tsconfig.json (add orchestrator project reference)
```

## Tasks

### Task 1: Add shared orchestrator types to packages/types

**Depends on:** none
**Files:** `packages/types/src/orchestrator.ts`, `packages/types/src/index.ts`

1. Create `packages/types/src/orchestrator.ts` with the following exact content:

```typescript
import type { Result } from './index';

// --- Token Usage ---

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

// --- Issue Model ---

export interface BlockerRef {
  id: string | null;
  identifier: string | null;
  state: string | null;
}

export interface Issue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  priority: number | null;
  state: string;
  branchName: string | null;
  url: string | null;
  labels: string[];
  blockedBy: BlockerRef[];
  createdAt: string | null;
  updatedAt: string | null;
}

// --- Agent Backend Protocol ---

export type AgentErrorCategory =
  | 'agent_not_found'
  | 'invalid_workspace_cwd'
  | 'response_timeout'
  | 'turn_timeout'
  | 'process_exit'
  | 'response_error'
  | 'turn_failed'
  | 'turn_cancelled'
  | 'turn_input_required';

export interface AgentError {
  category: AgentErrorCategory;
  message: string;
  details?: unknown;
}

export interface SessionStartParams {
  workspacePath: string;
  permissionMode: string;
  allowedTools?: string[];
  systemPrompt?: string;
}

export interface AgentSession {
  sessionId: string;
  workspacePath: string;
  backendName: string;
  startedAt: string;
}

export interface TurnParams {
  sessionId: string;
  prompt: string;
  isContinuation: boolean;
}

export interface AgentEvent {
  type: string;
  timestamp: string;
  subtype?: string;
  usage?: TokenUsage;
  content?: unknown;
  sessionId?: string;
}

export interface TurnResult {
  success: boolean;
  sessionId: string;
  usage: TokenUsage;
  error?: string;
}

export interface AgentBackend {
  readonly name: string;
  startSession(params: SessionStartParams): Promise<Result<AgentSession, AgentError>>;
  runTurn(session: AgentSession, params: TurnParams): AsyncGenerator<AgentEvent, TurnResult, void>;
  stopSession(session: AgentSession): Promise<Result<void, AgentError>>;
  healthCheck(): Promise<Result<void, AgentError>>;
}

// --- Issue Tracker Client ---

export interface IssueTrackerClient {
  fetchCandidateIssues(): Promise<Result<Issue[], Error>>;
  fetchIssuesByStates(stateNames: string[]): Promise<Result<Issue[], Error>>;
  fetchIssueStatesByIds(issueIds: string[]): Promise<Result<Map<string, Issue>, Error>>;
}

// --- Workflow Config ---

export interface TrackerConfig {
  kind: string;
  endpoint?: string;
  apiKey?: string;
  projectSlug?: string;
  filePath?: string;
  activeStates: string[];
  terminalStates: string[];
}

export interface PollingConfig {
  intervalMs: number;
}

export interface WorkspaceConfig {
  root: string;
}

export interface HooksConfig {
  afterCreate: string | null;
  beforeRun: string | null;
  afterRun: string | null;
  beforeRemove: string | null;
  timeoutMs: number;
}

export interface AgentConfig {
  backend: string;
  command?: string;
  model?: string;
  apiKey?: string;
  maxConcurrentAgents: number;
  maxTurns: number;
  maxRetryBackoffMs: number;
  maxConcurrentAgentsByState: Record<string, number>;
  approvalPolicy?: string;
  sandboxPolicy?: string;
  turnTimeoutMs: number;
  readTimeoutMs: number;
  stallTimeoutMs: number;
}

export interface ServerConfig {
  port: number | null;
}

export interface WorkflowConfig {
  tracker: TrackerConfig;
  polling: PollingConfig;
  workspace: WorkspaceConfig;
  hooks: HooksConfig;
  agent: AgentConfig;
  server: ServerConfig;
}

export interface WorkflowDefinition {
  config: WorkflowConfig;
  promptTemplate: string;
}
```

2. Add re-export to `packages/types/src/index.ts` by appending at the end of the file:

```typescript
// --- Orchestrator Types ---
export type {
  TokenUsage,
  BlockerRef,
  Issue,
  AgentErrorCategory,
  AgentError,
  SessionStartParams,
  AgentSession,
  TurnParams,
  AgentEvent,
  TurnResult,
  AgentBackend,
  IssueTrackerClient,
  TrackerConfig,
  PollingConfig,
  WorkspaceConfig,
  HooksConfig,
  AgentConfig,
  ServerConfig,
  WorkflowConfig,
  WorkflowDefinition,
} from './orchestrator';
```

3. Run: `cd packages/types && pnpm run build`
4. Observe: build succeeds with no errors.
5. Run: `harness validate`
6. Commit: `feat(types): add shared orchestrator types (Issue, AgentBackend, WorkflowConfig, etc.)`

---

### Task 2: Scaffold packages/orchestrator with package.json, tsconfig, and Turborepo registration

**Depends on:** Task 1
**Files:** `packages/orchestrator/package.json`, `packages/orchestrator/tsconfig.json`, `packages/orchestrator/src/index.ts`, `tsconfig.json`

1. Create directory structure:

   ```
   mkdir -p packages/orchestrator/src/types
   mkdir -p packages/orchestrator/src/core
   mkdir -p packages/orchestrator/tests/core
   ```

2. Create `packages/orchestrator/package.json`:

```json
{
  "name": "@harness-engineering/orchestrator",
  "version": "0.1.0",
  "description": "Orchestrator daemon for dispatching coding agents to issues",
  "main": "./dist/index.js",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.mjs",
      "require": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsup src/index.ts --format cjs,esm --dts",
    "dev": "tsup src/index.ts --format cjs,esm --dts --watch",
    "lint": "eslint src",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "clean": "node ../../scripts/clean.mjs dist"
  },
  "keywords": ["harness", "orchestrator", "agent", "daemon"],
  "files": ["dist", "README.md"],
  "license": "MIT",
  "publishConfig": {
    "access": "public"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/Intense-Visions/harness-engineering.git",
    "directory": "packages/orchestrator"
  },
  "dependencies": {
    "@harness-engineering/types": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@vitest/coverage-v8": "^4.0.18",
    "tsup": "^8.0.0",
    "vitest": "^4.0.18"
  }
}
```

3. Create `packages/orchestrator/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": true,
    "tsBuildInfoFile": "./dist/.tsbuildinfo"
  },
  "references": [{ "path": "../types" }],
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

4. Create `packages/orchestrator/src/index.ts`:

```typescript
/**
 * @harness-engineering/orchestrator
 *
 * Orchestrator daemon for dispatching coding agents to issues.
 */

export * from './types/index';
export * from './core/index';
```

5. Add project reference to root `tsconfig.json`. Add `{ "path": "./packages/orchestrator" }` to the `references` array.

6. Run: `pnpm install` (to link workspace dependency).
7. Run: `cd packages/types && pnpm run build` (ensure dependency builds first).
8. Run: `harness validate`
9. Commit: `feat(orchestrator): scaffold package with package.json, tsconfig, and turborepo registration`

---

### Task 3: Define internal types (OrchestratorState, LiveSession, RetryEntry, RunningEntry)

**Depends on:** Task 2
**Files:** `packages/orchestrator/src/types/internal.ts`, `packages/orchestrator/src/types/index.ts`

1. Create `packages/orchestrator/src/types/internal.ts`:

```typescript
import type { Issue, TokenUsage, AgentSession } from '@harness-engineering/types';

/**
 * Run attempt lifecycle phases (internal to orchestrator).
 * Tracks the current phase of a single run attempt.
 */
export type RunAttemptPhase =
  | 'PreparingWorkspace'
  | 'BuildingPrompt'
  | 'LaunchingAgent'
  | 'InitializingSession'
  | 'StreamingTurn'
  | 'Finishing'
  | 'Succeeded'
  | 'Failed'
  | 'TimedOut'
  | 'Stalled'
  | 'CanceledByReconciliation';

/**
 * Live session metadata tracked while an agent subprocess is running.
 */
export interface LiveSession {
  sessionId: string;
  backendName: string;
  agentPid: number | null;
  startedAt: string;
  lastEvent: string | null;
  lastTimestamp: string | null;
  lastMessage: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  lastReportedInputTokens: number;
  lastReportedOutputTokens: number;
  lastReportedTotalTokens: number;
  turnCount: number;
}

/**
 * Entry in the running map: one active worker.
 */
export interface RunningEntry {
  issueId: string;
  identifier: string;
  issue: Issue;
  attempt: number | null;
  workspacePath: string;
  startedAt: string;
  phase: RunAttemptPhase;
  session: LiveSession | null;
}

/**
 * Entry in the retry queue.
 */
export interface RetryEntry {
  issueId: string;
  identifier: string;
  attempt: number;
  dueAtMs: number;
  error: string | null;
}

/**
 * Token totals for observability.
 */
export interface TokenTotals {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  secondsRunning: number;
}

/**
 * Rate limit snapshot (populated by agent events).
 */
export interface RateLimitSnapshot {
  requestsRemaining: number | null;
  requestsLimit: number | null;
  tokensRemaining: number | null;
  tokensLimit: number | null;
}

/**
 * Single authoritative in-memory orchestrator state.
 */
export interface OrchestratorState {
  pollIntervalMs: number;
  maxConcurrentAgents: number;
  running: Map<string, RunningEntry>;
  claimed: Set<string>;
  retryAttempts: Map<string, RetryEntry>;
  completed: Set<string>;
  tokenTotals: TokenTotals;
  rateLimits: RateLimitSnapshot;
}
```

2. Create `packages/orchestrator/src/types/index.ts`:

```typescript
export type {
  RunAttemptPhase,
  LiveSession,
  RunningEntry,
  RetryEntry,
  TokenTotals,
  RateLimitSnapshot,
  OrchestratorState,
} from './internal';

export type {
  OrchestratorEvent,
  SideEffect,
  DispatchEffect,
  StopEffect,
  ScheduleRetryEffect,
  ReleaseClaimEffect,
  CleanWorkspaceEffect,
  UpdateTokensEffect,
  EmitLogEffect,
} from './events';
```

3. Note: `events.ts` does not exist yet; this barrel will compile after Task 4.

4. Run: `harness validate`
5. Commit: `feat(orchestrator): define internal types (OrchestratorState, LiveSession, RetryEntry)`

---

### Task 4: Define event and side-effect types

**Depends on:** Task 3
**Files:** `packages/orchestrator/src/types/events.ts`

1. Create `packages/orchestrator/src/types/events.ts`:

```typescript
import type { Issue, AgentEvent, TokenUsage } from '@harness-engineering/types';

/**
 * Discriminated union of events that drive the orchestrator state machine.
 * All events are data -- the caller constructs them from I/O results.
 */
export type OrchestratorEvent =
  | TickEvent
  | WorkerExitEvent
  | AgentUpdateEvent
  | RetryFiredEvent
  | StallDetectedEvent;

export interface TickEvent {
  type: 'tick';
  candidates: Issue[];
  runningStates: Map<string, Issue>;
}

export interface WorkerExitEvent {
  type: 'worker_exit';
  issueId: string;
  reason: 'normal' | 'error';
  error?: string;
  attempt: number | null;
}

export interface AgentUpdateEvent {
  type: 'agent_update';
  issueId: string;
  event: AgentEvent;
}

export interface RetryFiredEvent {
  type: 'retry_fired';
  issueId: string;
  candidates: Issue[];
}

export interface StallDetectedEvent {
  type: 'stall_detected';
  issueId: string;
}

/**
 * Discriminated union of side effects returned by the state machine.
 * These are data describing what to do -- the orchestrator loop executes them.
 */
export type SideEffect =
  | DispatchEffect
  | StopEffect
  | ScheduleRetryEffect
  | ReleaseClaimEffect
  | CleanWorkspaceEffect
  | UpdateTokensEffect
  | EmitLogEffect;

export interface DispatchEffect {
  type: 'dispatch';
  issue: Issue;
  attempt: number | null;
}

export interface StopEffect {
  type: 'stop';
  issueId: string;
  reason: string;
}

export interface ScheduleRetryEffect {
  type: 'scheduleRetry';
  issueId: string;
  identifier: string;
  attempt: number;
  delayMs: number;
  error: string | null;
}

export interface ReleaseClaimEffect {
  type: 'releaseClaim';
  issueId: string;
}

export interface CleanWorkspaceEffect {
  type: 'cleanWorkspace';
  issueId: string;
  identifier: string;
}

export interface UpdateTokensEffect {
  type: 'updateTokens';
  issueId: string;
  usage: TokenUsage;
}

export interface EmitLogEffect {
  type: 'emitLog';
  level: 'info' | 'warn' | 'error';
  message: string;
  context?: Record<string, unknown>;
}
```

2. Verify the barrel exports compile. Create a temporary check by running:

   ```
   cd packages/orchestrator && npx tsc --noEmit
   ```

   (This may fail if core/index.ts is not yet created; that is expected. The types themselves should have no errors.)

3. Run: `harness validate`
4. Commit: `feat(orchestrator): define OrchestratorEvent and SideEffect discriminated unions`

---

### Task 5: Implement retry calculation (TDD)

**Depends on:** Task 4
**Files:** `packages/orchestrator/src/core/retry.ts`, `packages/orchestrator/tests/core/retry.test.ts`

1. Create test file `packages/orchestrator/tests/core/retry.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { calculateRetryDelay } from '../../src/core/retry';

describe('calculateRetryDelay', () => {
  describe('continuation retries', () => {
    it('should return 1000ms for continuation regardless of attempt', () => {
      expect(calculateRetryDelay(1, 'continuation')).toBe(1000);
      expect(calculateRetryDelay(5, 'continuation')).toBe(1000);
      expect(calculateRetryDelay(100, 'continuation')).toBe(1000);
    });
  });

  describe('failure retries', () => {
    it('should calculate exponential backoff: 10000 * 2^(attempt-1)', () => {
      expect(calculateRetryDelay(1, 'failure', 300000)).toBe(10000);
      expect(calculateRetryDelay(2, 'failure', 300000)).toBe(20000);
      expect(calculateRetryDelay(3, 'failure', 300000)).toBe(40000);
      expect(calculateRetryDelay(4, 'failure', 300000)).toBe(80000);
      expect(calculateRetryDelay(5, 'failure', 300000)).toBe(160000);
    });

    it('should cap at maxRetryBackoffMs', () => {
      expect(calculateRetryDelay(6, 'failure', 300000)).toBe(300000);
      expect(calculateRetryDelay(10, 'failure', 300000)).toBe(300000);
    });

    it('should respect custom maxRetryBackoffMs', () => {
      expect(calculateRetryDelay(1, 'failure', 5000)).toBe(5000);
      expect(calculateRetryDelay(2, 'failure', 15000)).toBe(15000);
    });

    it('should use default maxRetryBackoffMs of 300000 when not provided', () => {
      expect(calculateRetryDelay(1, 'failure')).toBe(10000);
      expect(calculateRetryDelay(6, 'failure')).toBe(300000);
    });
  });
});
```

2. Run test: `cd packages/orchestrator && npx vitest run tests/core/retry.test.ts`
3. Observe failure: module not found.

4. Create implementation `packages/orchestrator/src/core/retry.ts`:

```typescript
const CONTINUATION_DELAY_MS = 1000;
const BASE_FAILURE_DELAY_MS = 10000;
const DEFAULT_MAX_RETRY_BACKOFF_MS = 300000;

/**
 * Calculate retry delay based on attempt number and retry type.
 *
 * Continuation retries: fixed 1000ms delay.
 * Failure retries: exponential backoff 10000 * 2^(attempt-1), capped at maxRetryBackoffMs.
 */
export function calculateRetryDelay(
  attempt: number,
  type: 'continuation' | 'failure',
  maxRetryBackoffMs: number = DEFAULT_MAX_RETRY_BACKOFF_MS
): number {
  if (type === 'continuation') {
    return CONTINUATION_DELAY_MS;
  }
  const delay = BASE_FAILURE_DELAY_MS * Math.pow(2, attempt - 1);
  return Math.min(delay, maxRetryBackoffMs);
}
```

5. Run test: `cd packages/orchestrator && npx vitest run tests/core/retry.test.ts`
6. Observe: all tests pass.
7. Run: `harness validate`
8. Commit: `feat(orchestrator): implement retry delay calculation with exponential backoff`

---

### Task 6: Implement candidate selection (TDD)

**Depends on:** Task 4
**Files:** `packages/orchestrator/src/core/candidate-selection.ts`, `packages/orchestrator/tests/core/candidate-selection.test.ts`

1. Create test file `packages/orchestrator/tests/core/candidate-selection.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { sortCandidates, isEligible, selectCandidates } from '../../src/core/candidate-selection';
import type { Issue } from '@harness-engineering/types';
import type { OrchestratorState } from '../../src/types/internal';

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

function makeState(overrides: Partial<OrchestratorState> = {}): OrchestratorState {
  return {
    pollIntervalMs: 30000,
    maxConcurrentAgents: 10,
    running: new Map(),
    claimed: new Set(),
    retryAttempts: new Map(),
    completed: new Set(),
    tokenTotals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, secondsRunning: 0 },
    rateLimits: {
      requestsRemaining: null,
      requestsLimit: null,
      tokensRemaining: null,
      tokensLimit: null,
    },
    ...overrides,
  };
}

describe('sortCandidates', () => {
  it('should sort by priority ascending (lower = higher priority)', () => {
    const issues = [
      makeIssue({ id: 'a', priority: 3 }),
      makeIssue({ id: 'b', priority: 1 }),
      makeIssue({ id: 'c', priority: 2 }),
    ];
    const sorted = sortCandidates(issues);
    expect(sorted.map((i) => i.id)).toEqual(['b', 'c', 'a']);
  });

  it('should sort null priority last', () => {
    const issues = [
      makeIssue({ id: 'a', priority: null }),
      makeIssue({ id: 'b', priority: 2 }),
      makeIssue({ id: 'c', priority: 1 }),
    ];
    const sorted = sortCandidates(issues);
    expect(sorted.map((i) => i.id)).toEqual(['c', 'b', 'a']);
  });

  it('should break ties by createdAt (oldest first)', () => {
    const issues = [
      makeIssue({ id: 'a', priority: 1, createdAt: '2026-03-01T00:00:00Z' }),
      makeIssue({ id: 'b', priority: 1, createdAt: '2026-01-01T00:00:00Z' }),
      makeIssue({ id: 'c', priority: 1, createdAt: '2026-02-01T00:00:00Z' }),
    ];
    const sorted = sortCandidates(issues);
    expect(sorted.map((i) => i.id)).toEqual(['b', 'c', 'a']);
  });

  it('should break further ties by identifier lexicographic', () => {
    const issues = [
      makeIssue({ id: 'a', identifier: 'ZZZ-1', priority: 1, createdAt: '2026-01-01T00:00:00Z' }),
      makeIssue({ id: 'b', identifier: 'AAA-1', priority: 1, createdAt: '2026-01-01T00:00:00Z' }),
    ];
    const sorted = sortCandidates(issues);
    expect(sorted.map((i) => i.id)).toEqual(['b', 'a']);
  });

  it('should handle null createdAt by sorting last within same priority', () => {
    const issues = [
      makeIssue({ id: 'a', priority: 1, createdAt: null }),
      makeIssue({ id: 'b', priority: 1, createdAt: '2026-01-01T00:00:00Z' }),
    ];
    const sorted = sortCandidates(issues);
    expect(sorted.map((i) => i.id)).toEqual(['b', 'a']);
  });
});

describe('isEligible', () => {
  it('should return true for valid unclaimed issue with required fields', () => {
    const issue = makeIssue();
    const state = makeState();
    const activeStates = ['todo'];
    const terminalStates = ['done', 'cancelled'];
    expect(isEligible(issue, state, activeStates, terminalStates)).toBe(true);
  });

  it('should return false if issue is already claimed', () => {
    const issue = makeIssue({ id: 'claimed-1' });
    const state = makeState({ claimed: new Set(['claimed-1']) });
    expect(isEligible(issue, state, ['todo'], ['done'])).toBe(false);
  });

  it('should return false if issue is already running', () => {
    const issue = makeIssue({ id: 'running-1' });
    const running = new Map([['running-1', {} as any]]);
    const state = makeState({ running });
    expect(isEligible(issue, state, ['todo'], ['done'])).toBe(false);
  });

  it('should return false if state is in terminal states', () => {
    const issue = makeIssue({ state: 'Done' });
    expect(isEligible(issue, makeState(), ['todo'], ['done'])).toBe(false);
  });

  it('should return false if state is not in active states', () => {
    const issue = makeIssue({ state: 'Backlog' });
    expect(isEligible(issue, makeState(), ['todo', 'in progress'], ['done'])).toBe(false);
  });

  it('should exclude Todo issues with non-terminal blockers', () => {
    const issue = makeIssue({
      state: 'Todo',
      blockedBy: [{ id: 'blocker-1', identifier: 'BLOCK-1', state: 'In Progress' }],
    });
    expect(isEligible(issue, makeState(), ['todo', 'in progress'], ['done'])).toBe(false);
  });

  it('should allow Todo issues where all blockers are terminal', () => {
    const issue = makeIssue({
      state: 'Todo',
      blockedBy: [{ id: 'blocker-1', identifier: 'BLOCK-1', state: 'Done' }],
    });
    expect(isEligible(issue, makeState(), ['todo', 'in progress'], ['done'])).toBe(true);
  });

  it('should allow non-Todo issues with non-terminal blockers', () => {
    const issue = makeIssue({
      state: 'In Progress',
      blockedBy: [{ id: 'blocker-1', identifier: 'BLOCK-1', state: 'Todo' }],
    });
    expect(isEligible(issue, makeState(), ['todo', 'in progress'], ['done'])).toBe(true);
  });
});

describe('selectCandidates', () => {
  it('should sort and filter eligible candidates', () => {
    const issues = [
      makeIssue({ id: '1', identifier: 'A-1', priority: 2 }),
      makeIssue({ id: '2', identifier: 'A-2', priority: 1 }),
      makeIssue({ id: '3', identifier: 'A-3', state: 'Done' }),
    ];
    const state = makeState();
    const result = selectCandidates(issues, state, ['todo'], ['done']);
    expect(result.map((i) => i.id)).toEqual(['2', '1']);
  });

  it('should return empty array when all issues are ineligible', () => {
    const issues = [makeIssue({ id: '1', state: 'Done' })];
    const result = selectCandidates(issues, makeState(), ['todo'], ['done']);
    expect(result).toEqual([]);
  });
});
```

2. Run test: `cd packages/orchestrator && npx vitest run tests/core/candidate-selection.test.ts`
3. Observe failure: module not found.

4. Create implementation `packages/orchestrator/src/core/candidate-selection.ts`:

```typescript
import type { Issue } from '@harness-engineering/types';
import type { OrchestratorState } from '../types/internal';

/**
 * Sort candidates by dispatch priority (stable sort).
 * 1. priority ascending (1..4 preferred; null sorts last)
 * 2. createdAt oldest first (null sorts last)
 * 3. identifier lexicographic tie-breaker
 */
export function sortCandidates(issues: readonly Issue[]): Issue[] {
  return [...issues].sort((a, b) => {
    // Priority: lower is higher priority, null sorts last
    const pa = a.priority ?? Number.MAX_SAFE_INTEGER;
    const pb = b.priority ?? Number.MAX_SAFE_INTEGER;
    if (pa !== pb) return pa - pb;

    // Created at: oldest first, null sorts last
    const ca = a.createdAt ?? '\uffff';
    const cb = b.createdAt ?? '\uffff';
    if (ca !== cb) return ca < cb ? -1 : 1;

    // Identifier: lexicographic tie-breaker
    return a.identifier.localeCompare(b.identifier);
  });
}

/**
 * Check if a single issue is dispatch-eligible.
 * State comparisons are case-insensitive.
 */
export function isEligible(
  issue: Issue,
  state: OrchestratorState,
  activeStates: string[],
  terminalStates: string[]
): boolean {
  // Must have required fields
  if (!issue.id || !issue.identifier || !issue.title || !issue.state) {
    return false;
  }

  const normalizedState = issue.state.toLowerCase();
  const normalizedActive = activeStates.map((s) => s.toLowerCase());
  const normalizedTerminal = terminalStates.map((s) => s.toLowerCase());

  // State must be active and not terminal
  if (!normalizedActive.includes(normalizedState)) {
    return false;
  }
  if (normalizedTerminal.includes(normalizedState)) {
    return false;
  }

  // Not already claimed or running
  if (state.claimed.has(issue.id)) {
    return false;
  }
  if (state.running.has(issue.id)) {
    return false;
  }

  // Blocker rule for Todo state: block if any blocker is non-terminal
  if (normalizedState === 'todo' && issue.blockedBy.length > 0) {
    const hasNonTerminalBlocker = issue.blockedBy.some((blocker) => {
      if (blocker.state === null) return true; // Unknown state = non-terminal
      return !normalizedTerminal.includes(blocker.state.toLowerCase());
    });
    if (hasNonTerminalBlocker) {
      return false;
    }
  }

  return true;
}

/**
 * Select and sort eligible candidates from a list of issues.
 */
export function selectCandidates(
  issues: readonly Issue[],
  state: OrchestratorState,
  activeStates: string[],
  terminalStates: string[]
): Issue[] {
  const sorted = sortCandidates(issues);
  return sorted.filter((issue) => isEligible(issue, state, activeStates, terminalStates));
}
```

5. Run test: `cd packages/orchestrator && npx vitest run tests/core/candidate-selection.test.ts`
6. Observe: all tests pass.
7. Run: `harness validate`
8. Commit: `feat(orchestrator): implement candidate selection with sort, eligibility, and blocker rules`

---

### Task 7: Implement concurrency control (TDD)

**Depends on:** Task 4
**Files:** `packages/orchestrator/src/core/concurrency.ts`, `packages/orchestrator/tests/core/concurrency.test.ts`

1. Create test file `packages/orchestrator/tests/core/concurrency.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getAvailableSlots, getPerStateCount, canDispatch } from '../../src/core/concurrency';
import type { OrchestratorState, RunningEntry } from '../../src/types/internal';
import type { WorkflowConfig } from '@harness-engineering/types';

function makeState(overrides: Partial<OrchestratorState> = {}): OrchestratorState {
  return {
    pollIntervalMs: 30000,
    maxConcurrentAgents: 10,
    running: new Map(),
    claimed: new Set(),
    retryAttempts: new Map(),
    completed: new Set(),
    tokenTotals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, secondsRunning: 0 },
    rateLimits: {
      requestsRemaining: null,
      requestsLimit: null,
      tokensRemaining: null,
      tokensLimit: null,
    },
    ...overrides,
  };
}

function makeRunningEntry(overrides: Partial<RunningEntry> = {}): RunningEntry {
  return {
    issueId: 'id-1',
    identifier: 'TEST-1',
    issue: {
      id: 'id-1',
      identifier: 'TEST-1',
      title: 'Test',
      description: null,
      priority: null,
      state: 'Todo',
      branchName: null,
      url: null,
      labels: [],
      blockedBy: [],
      createdAt: null,
      updatedAt: null,
    },
    attempt: null,
    workspacePath: '/tmp/ws/test-1',
    startedAt: '2026-01-01T00:00:00Z',
    phase: 'StreamingTurn',
    session: null,
    ...overrides,
  };
}

describe('getAvailableSlots', () => {
  it('should return max - running when running < max', () => {
    const state = makeState({ maxConcurrentAgents: 5 });
    expect(getAvailableSlots(state)).toBe(5);
  });

  it('should return 0 when running >= max', () => {
    const running = new Map([
      ['1', makeRunningEntry({ issueId: '1' })],
      ['2', makeRunningEntry({ issueId: '2' })],
    ]);
    const state = makeState({ maxConcurrentAgents: 2, running });
    expect(getAvailableSlots(state)).toBe(0);
  });

  it('should never return negative', () => {
    const running = new Map([
      ['1', makeRunningEntry({ issueId: '1' })],
      ['2', makeRunningEntry({ issueId: '2' })],
      ['3', makeRunningEntry({ issueId: '3' })],
    ]);
    const state = makeState({ maxConcurrentAgents: 1, running });
    expect(getAvailableSlots(state)).toBe(0);
  });
});

describe('getPerStateCount', () => {
  it('should count running entries by normalized state', () => {
    const running = new Map([
      [
        '1',
        makeRunningEntry({ issueId: '1', issue: { ...makeRunningEntry().issue, state: 'Todo' } }),
      ],
      [
        '2',
        makeRunningEntry({ issueId: '2', issue: { ...makeRunningEntry().issue, state: 'todo' } }),
      ],
      [
        '3',
        makeRunningEntry({
          issueId: '3',
          issue: { ...makeRunningEntry().issue, state: 'In Progress' },
        }),
      ],
    ]);
    const counts = getPerStateCount(running);
    expect(counts.get('todo')).toBe(2);
    expect(counts.get('in progress')).toBe(1);
  });
});

describe('canDispatch', () => {
  it('should return true when global and per-state slots available', () => {
    const state = makeState({ maxConcurrentAgents: 5 });
    expect(canDispatch(state, 'Todo', {})).toBe(true);
  });

  it('should return false when no global slots available', () => {
    const running = new Map([['1', makeRunningEntry()]]);
    const state = makeState({ maxConcurrentAgents: 1, running });
    expect(canDispatch(state, 'Todo', {})).toBe(false);
  });

  it('should respect per-state concurrency caps', () => {
    const running = new Map([
      [
        '1',
        makeRunningEntry({ issueId: '1', issue: { ...makeRunningEntry().issue, state: 'Todo' } }),
      ],
    ]);
    const state = makeState({ maxConcurrentAgents: 10, running });
    const byState = { todo: 1 };
    expect(canDispatch(state, 'Todo', byState)).toBe(false);
  });

  it('should use global limit when no per-state cap defined', () => {
    const running = new Map([
      [
        '1',
        makeRunningEntry({ issueId: '1', issue: { ...makeRunningEntry().issue, state: 'Todo' } }),
      ],
    ]);
    const state = makeState({ maxConcurrentAgents: 10, running });
    const byState = { 'in progress': 2 };
    expect(canDispatch(state, 'Todo', byState)).toBe(true);
  });
});
```

2. Run test: `cd packages/orchestrator && npx vitest run tests/core/concurrency.test.ts`
3. Observe failure: module not found.

4. Create implementation `packages/orchestrator/src/core/concurrency.ts`:

```typescript
import type { OrchestratorState, RunningEntry } from '../types/internal';

/**
 * Get the number of available global concurrency slots.
 */
export function getAvailableSlots(state: OrchestratorState): number {
  return Math.max(state.maxConcurrentAgents - state.running.size, 0);
}

/**
 * Count running entries by normalized (lowercase) issue state.
 */
export function getPerStateCount(running: ReadonlyMap<string, RunningEntry>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of running.values()) {
    const key = entry.issue.state.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * Check if dispatching an issue in the given state is allowed
 * by both global and per-state concurrency limits.
 */
export function canDispatch(
  state: OrchestratorState,
  issueState: string,
  maxConcurrentAgentsByState: Record<string, number>
): boolean {
  // Global slots check
  if (getAvailableSlots(state) <= 0) {
    return false;
  }

  // Per-state cap check
  const normalizedState = issueState.toLowerCase();
  const perStateCap = maxConcurrentAgentsByState[normalizedState];
  if (perStateCap !== undefined) {
    const perStateCounts = getPerStateCount(state.running);
    const currentCount = perStateCounts.get(normalizedState) ?? 0;
    if (currentCount >= perStateCap) {
      return false;
    }
  }

  return true;
}
```

5. Run test: `cd packages/orchestrator && npx vitest run tests/core/concurrency.test.ts`
6. Observe: all tests pass.
7. Run: `harness validate`
8. Commit: `feat(orchestrator): implement concurrency control with global and per-state limits`

---

### Task 8: Implement reconciliation logic (TDD)

**Depends on:** Task 4
**Files:** `packages/orchestrator/src/core/reconciliation.ts`, `packages/orchestrator/tests/core/reconciliation.test.ts`

1. Create test file `packages/orchestrator/tests/core/reconciliation.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { reconcile } from '../../src/core/reconciliation';
import type { Issue } from '@harness-engineering/types';
import type { OrchestratorState, RunningEntry } from '../../src/types/internal';
import type { SideEffect } from '../../src/types/events';

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
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

function makeRunningEntry(overrides: Partial<RunningEntry> = {}): RunningEntry {
  return {
    issueId: 'id-1',
    identifier: 'TEST-1',
    issue: makeIssue(),
    attempt: null,
    workspacePath: '/tmp/ws/test-1',
    startedAt: '2026-01-01T00:00:00Z',
    phase: 'StreamingTurn',
    session: null,
    ...overrides,
  };
}

function makeState(overrides: Partial<OrchestratorState> = {}): OrchestratorState {
  return {
    pollIntervalMs: 30000,
    maxConcurrentAgents: 10,
    running: new Map(),
    claimed: new Set(),
    retryAttempts: new Map(),
    completed: new Set(),
    tokenTotals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, secondsRunning: 0 },
    rateLimits: {
      requestsRemaining: null,
      requestsLimit: null,
      tokensRemaining: null,
      tokensLimit: null,
    },
    ...overrides,
  };
}

describe('reconcile', () => {
  it('should return no effects when all running issues are still active', () => {
    const running = new Map([
      ['id-1', makeRunningEntry({ issueId: 'id-1', identifier: 'TEST-1' })],
    ]);
    const state = makeState({ running });
    const runningStates = new Map([['id-1', makeIssue({ id: 'id-1', state: 'In Progress' })]]);
    const activeStates = ['todo', 'in progress'];
    const terminalStates = ['done', 'cancelled'];

    const effects = reconcile(state, runningStates, activeStates, terminalStates);
    expect(effects).toEqual([]);
  });

  it('should stop and clean workspace when running issue becomes terminal', () => {
    const running = new Map([
      ['id-1', makeRunningEntry({ issueId: 'id-1', identifier: 'TEST-1' })],
    ]);
    const state = makeState({ running });
    const runningStates = new Map([['id-1', makeIssue({ id: 'id-1', state: 'Done' })]]);
    const activeStates = ['todo', 'in progress'];
    const terminalStates = ['done', 'cancelled'];

    const effects = reconcile(state, runningStates, activeStates, terminalStates);
    expect(effects).toContainEqual({
      type: 'stop',
      issueId: 'id-1',
      reason: 'terminal_state: done',
    });
    expect(effects).toContainEqual({
      type: 'cleanWorkspace',
      issueId: 'id-1',
      identifier: 'TEST-1',
    });
    expect(effects).toContainEqual({ type: 'releaseClaim', issueId: 'id-1' });
  });

  it('should stop without cleaning workspace when running issue is neither active nor terminal', () => {
    const running = new Map([
      ['id-1', makeRunningEntry({ issueId: 'id-1', identifier: 'TEST-1' })],
    ]);
    const state = makeState({ running });
    const runningStates = new Map([['id-1', makeIssue({ id: 'id-1', state: 'Backlog' })]]);
    const activeStates = ['todo', 'in progress'];
    const terminalStates = ['done', 'cancelled'];

    const effects = reconcile(state, runningStates, activeStates, terminalStates);
    expect(effects).toContainEqual({
      type: 'stop',
      issueId: 'id-1',
      reason: 'non_active_state: backlog',
    });
    expect(effects).toContainEqual({ type: 'releaseClaim', issueId: 'id-1' });
    expect(effects.find((e) => e.type === 'cleanWorkspace')).toBeUndefined();
  });

  it('should handle multiple running issues with mixed states', () => {
    const running = new Map([
      ['id-1', makeRunningEntry({ issueId: 'id-1', identifier: 'TEST-1' })],
      ['id-2', makeRunningEntry({ issueId: 'id-2', identifier: 'TEST-2' })],
      ['id-3', makeRunningEntry({ issueId: 'id-3', identifier: 'TEST-3' })],
    ]);
    const state = makeState({ running });
    const runningStates = new Map([
      ['id-1', makeIssue({ id: 'id-1', state: 'Done' })],
      ['id-2', makeIssue({ id: 'id-2', state: 'In Progress' })],
      ['id-3', makeIssue({ id: 'id-3', state: 'Backlog' })],
    ]);
    const activeStates = ['todo', 'in progress'];
    const terminalStates = ['done', 'cancelled'];

    const effects = reconcile(state, runningStates, activeStates, terminalStates);
    // id-1: terminal -> stop + clean + release
    expect(effects.filter((e) => e.type === 'stop')).toHaveLength(2);
    expect(effects.filter((e) => e.type === 'cleanWorkspace')).toHaveLength(1);
    expect(effects.filter((e) => e.type === 'releaseClaim')).toHaveLength(2);
  });

  it('should skip issues not present in runningStates (state refresh failed for them)', () => {
    const running = new Map([
      ['id-1', makeRunningEntry({ issueId: 'id-1', identifier: 'TEST-1' })],
      ['id-2', makeRunningEntry({ issueId: 'id-2', identifier: 'TEST-2' })],
    ]);
    const state = makeState({ running });
    // Only id-1 returned from refresh; id-2 missing (keep running per spec)
    const runningStates = new Map([['id-1', makeIssue({ id: 'id-1', state: 'Done' })]]);
    const activeStates = ['todo', 'in progress'];
    const terminalStates = ['done', 'cancelled'];

    const effects = reconcile(state, runningStates, activeStates, terminalStates);
    // Only id-1 should have effects
    expect(effects.filter((e) => 'issueId' in e && e.issueId === 'id-2')).toHaveLength(0);
    expect(effects.filter((e) => 'issueId' in e && e.issueId === 'id-1').length).toBeGreaterThan(0);
  });
});
```

2. Run test: `cd packages/orchestrator && npx vitest run tests/core/reconciliation.test.ts`
3. Observe failure: module not found.

4. Create implementation `packages/orchestrator/src/core/reconciliation.ts`:

```typescript
import type { Issue } from '@harness-engineering/types';
import type { OrchestratorState } from '../types/internal';
import type { SideEffect } from '../types/events';

/**
 * Reconcile running issues against their current tracker states.
 *
 * For each running issue found in runningStates:
 * - Terminal state -> stop + cleanWorkspace + releaseClaim
 * - Neither active nor terminal -> stop + releaseClaim (no workspace cleanup)
 * - Still active -> no effects (keep running)
 *
 * Issues not found in runningStates are left running (state refresh may have
 * partially failed; retry next tick per spec).
 */
export function reconcile(
  state: OrchestratorState,
  runningStates: ReadonlyMap<string, Issue>,
  activeStates: string[],
  terminalStates: string[]
): SideEffect[] {
  const effects: SideEffect[] = [];
  const normalizedActive = activeStates.map((s) => s.toLowerCase());
  const normalizedTerminal = terminalStates.map((s) => s.toLowerCase());

  for (const [issueId, entry] of state.running) {
    const currentIssue = runningStates.get(issueId);
    if (!currentIssue) {
      // Not in refresh results -- keep running, retry next tick
      continue;
    }

    const normalizedState = currentIssue.state.toLowerCase();

    if (normalizedTerminal.includes(normalizedState)) {
      // Terminal: stop, clean workspace, release claim
      effects.push({ type: 'stop', issueId, reason: `terminal_state: ${normalizedState}` });
      effects.push({ type: 'cleanWorkspace', issueId, identifier: entry.identifier });
      effects.push({ type: 'releaseClaim', issueId });
    } else if (!normalizedActive.includes(normalizedState)) {
      // Neither active nor terminal: stop, release claim, but keep workspace
      effects.push({ type: 'stop', issueId, reason: `non_active_state: ${normalizedState}` });
      effects.push({ type: 'releaseClaim', issueId });
    }
    // Still active: no effects, keep running
  }

  return effects;
}
```

5. Run test: `cd packages/orchestrator && npx vitest run tests/core/reconciliation.test.ts`
6. Observe: all tests pass.
7. Run: `harness validate`
8. Commit: `feat(orchestrator): implement reconciliation logic for tracker state changes`

---

### Task 9: Implement createEmptyState helper

**Depends on:** Task 3
**Files:** `packages/orchestrator/src/core/state-helpers.ts` (new file, used by state-machine and tests)

This is a small utility task that extracts a reusable factory for `OrchestratorState` and is depended on by the state machine.

1. Create `packages/orchestrator/src/core/state-helpers.ts`:

```typescript
import type { OrchestratorState } from '../types/internal';
import type { WorkflowConfig } from '@harness-engineering/types';

/**
 * Create an empty OrchestratorState initialized from config.
 */
export function createEmptyState(config: WorkflowConfig): OrchestratorState {
  return {
    pollIntervalMs: config.polling.intervalMs,
    maxConcurrentAgents: config.agent.maxConcurrentAgents,
    running: new Map(),
    claimed: new Set(),
    retryAttempts: new Map(),
    completed: new Set(),
    tokenTotals: {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      secondsRunning: 0,
    },
    rateLimits: {
      requestsRemaining: null,
      requestsLimit: null,
      tokensRemaining: null,
      tokensLimit: null,
    },
  };
}
```

2. Run: `harness validate`
3. Commit: `feat(orchestrator): add createEmptyState helper`

---

### Task 10: Implement state machine applyEvent -- tick event (TDD)

**Depends on:** Tasks 5, 6, 7, 8, 9
**Files:** `packages/orchestrator/src/core/state-machine.ts`, `packages/orchestrator/tests/core/state-machine.test.ts`

This task implements the `applyEvent` function for `tick` events and starts the test file.

1. Create test file `packages/orchestrator/tests/core/state-machine.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { applyEvent } from '../../src/core/state-machine';
import { createEmptyState } from '../../src/core/state-helpers';
import type { Issue, WorkflowConfig } from '@harness-engineering/types';
import type { OrchestratorState, RunningEntry } from '../../src/types/internal';
import type { OrchestratorEvent, SideEffect } from '../../src/types/events';

function makeConfig(overrides: Partial<WorkflowConfig> = {}): WorkflowConfig {
  return {
    tracker: {
      kind: 'roadmap',
      activeStates: ['Todo', 'In Progress'],
      terminalStates: ['Done', 'Cancelled'],
    },
    polling: { intervalMs: 30000 },
    workspace: { root: '/tmp/ws' },
    hooks: {
      afterCreate: null,
      beforeRun: null,
      afterRun: null,
      beforeRemove: null,
      timeoutMs: 60000,
    },
    agent: {
      backend: 'mock',
      maxConcurrentAgents: 3,
      maxTurns: 20,
      maxRetryBackoffMs: 300000,
      maxConcurrentAgentsByState: {},
      turnTimeoutMs: 3600000,
      readTimeoutMs: 5000,
      stallTimeoutMs: 300000,
    },
    server: { port: null },
    ...overrides,
  };
}

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

describe('applyEvent - tick', () => {
  it('should dispatch eligible candidates up to concurrency limit', () => {
    const config = makeConfig();
    const state = createEmptyState(config);
    const candidates = [
      makeIssue({ id: '1', identifier: 'A-1', priority: 1 }),
      makeIssue({ id: '2', identifier: 'A-2', priority: 2 }),
      makeIssue({ id: '3', identifier: 'A-3', priority: 3 }),
      makeIssue({ id: '4', identifier: 'A-4', priority: 4 }),
    ];

    const event: OrchestratorEvent = {
      type: 'tick',
      candidates,
      runningStates: new Map(),
    };

    const { nextState, effects } = applyEvent(state, event, config);

    // Max concurrent is 3, so 3 dispatches
    const dispatches = effects.filter((e) => e.type === 'dispatch');
    expect(dispatches).toHaveLength(3);
    expect(nextState.claimed.size).toBe(3);
    expect(nextState.claimed.has('1')).toBe(true);
    expect(nextState.claimed.has('2')).toBe(true);
    expect(nextState.claimed.has('3')).toBe(true);
    expect(nextState.claimed.has('4')).toBe(false);
  });

  it('should not dispatch already-claimed issues', () => {
    const config = makeConfig();
    const state = createEmptyState(config);
    state.claimed.add('1');

    const candidates = [
      makeIssue({ id: '1', identifier: 'A-1', priority: 1 }),
      makeIssue({ id: '2', identifier: 'A-2', priority: 2 }),
    ];

    const event: OrchestratorEvent = {
      type: 'tick',
      candidates,
      runningStates: new Map(),
    };

    const { nextState, effects } = applyEvent(state, event, config);
    const dispatches = effects.filter((e) => e.type === 'dispatch');
    expect(dispatches).toHaveLength(1);
    expect(dispatches[0]!.type === 'dispatch' && dispatches[0].issue.id).toBe('2');
  });

  it('should reconcile before dispatching', () => {
    const config = makeConfig();
    const state = createEmptyState(config);
    // Simulate a running issue
    state.running.set('id-done', {
      issueId: 'id-done',
      identifier: 'DONE-1',
      issue: makeIssue({ id: 'id-done', identifier: 'DONE-1' }),
      attempt: null,
      workspacePath: '/tmp/ws/done-1',
      startedAt: '2026-01-01T00:00:00Z',
      phase: 'StreamingTurn',
      session: null,
    });
    state.claimed.add('id-done');

    const runningStates = new Map([['id-done', makeIssue({ id: 'id-done', state: 'Done' })]]);

    const event: OrchestratorEvent = {
      type: 'tick',
      candidates: [],
      runningStates,
    };

    const { effects } = applyEvent(state, event, config);
    const stops = effects.filter((e) => e.type === 'stop');
    expect(stops).toHaveLength(1);
    const cleans = effects.filter((e) => e.type === 'cleanWorkspace');
    expect(cleans).toHaveLength(1);
  });

  it('should dispatch with null attempt for fresh issues', () => {
    const config = makeConfig();
    const state = createEmptyState(config);
    const candidates = [makeIssue({ id: '1', identifier: 'A-1' })];

    const event: OrchestratorEvent = {
      type: 'tick',
      candidates,
      runningStates: new Map(),
    };

    const { effects } = applyEvent(state, event, config);
    const dispatch = effects.find((e) => e.type === 'dispatch');
    expect(dispatch).toBeDefined();
    if (dispatch && dispatch.type === 'dispatch') {
      expect(dispatch.attempt).toBeNull();
    }
  });

  it('should exclude terminal-state issues from candidates', () => {
    const config = makeConfig();
    const state = createEmptyState(config);
    const candidates = [
      makeIssue({ id: '1', identifier: 'A-1', state: 'Done' }),
      makeIssue({ id: '2', identifier: 'A-2', state: 'Todo' }),
    ];

    const event: OrchestratorEvent = {
      type: 'tick',
      candidates,
      runningStates: new Map(),
    };

    const { effects } = applyEvent(state, event, config);
    const dispatches = effects.filter((e) => e.type === 'dispatch');
    expect(dispatches).toHaveLength(1);
    if (dispatches[0] && dispatches[0].type === 'dispatch') {
      expect(dispatches[0].issue.id).toBe('2');
    }
  });
});
```

2. Run test: `cd packages/orchestrator && npx vitest run tests/core/state-machine.test.ts`
3. Observe failure: module not found.

4. Create implementation `packages/orchestrator/src/core/state-machine.ts`:

```typescript
import type { Issue, WorkflowConfig, TokenUsage } from '@harness-engineering/types';
import type { OrchestratorState } from '../types/internal';
import type { OrchestratorEvent, SideEffect } from '../types/events';
import { selectCandidates } from './candidate-selection';
import { canDispatch } from './concurrency';
import { reconcile } from './reconciliation';
import { calculateRetryDelay } from './retry';

export interface ApplyEventResult {
  nextState: OrchestratorState;
  effects: SideEffect[];
}

/**
 * Clone the state for immutable transitions.
 * Maps and Sets are shallow-cloned; entries within them are not deeply copied
 * since we only add/remove entries, not mutate them in place.
 */
function cloneState(state: OrchestratorState): OrchestratorState {
  return {
    ...state,
    running: new Map(state.running),
    claimed: new Set(state.claimed),
    retryAttempts: new Map(state.retryAttempts),
    completed: new Set(state.completed),
    tokenTotals: { ...state.tokenTotals },
    rateLimits: { ...state.rateLimits },
  };
}

function handleTick(
  state: OrchestratorState,
  candidates: Issue[],
  runningStates: ReadonlyMap<string, Issue>,
  config: WorkflowConfig
): ApplyEventResult {
  const next = cloneState(state);
  const effects: SideEffect[] = [];

  // Phase 1: Reconcile running issues against tracker state
  const reconcileEffects = reconcile(
    next,
    runningStates,
    config.tracker.activeStates,
    config.tracker.terminalStates
  );
  effects.push(...reconcileEffects);

  // Apply reconciliation to state: remove stopped issues from running and claimed
  for (const effect of reconcileEffects) {
    if (effect.type === 'stop') {
      next.running.delete(effect.issueId);
    }
    if (effect.type === 'releaseClaim') {
      next.claimed.delete(effect.issueId);
    }
  }

  // Phase 2: Select and dispatch eligible candidates
  const eligible = selectCandidates(
    candidates,
    next,
    config.tracker.activeStates,
    config.tracker.terminalStates
  );

  for (const issue of eligible) {
    if (!canDispatch(next, issue.state, config.agent.maxConcurrentAgentsByState)) {
      break; // No more slots available
    }

    next.claimed.add(issue.id);
    effects.push({
      type: 'dispatch',
      issue,
      attempt: null,
    });
  }

  return { nextState: next, effects };
}

function handleWorkerExit(
  state: OrchestratorState,
  issueId: string,
  reason: 'normal' | 'error',
  error: string | undefined,
  attempt: number | null,
  config: WorkflowConfig
): ApplyEventResult {
  const next = cloneState(state);
  const effects: SideEffect[] = [];

  const entry = next.running.get(issueId);
  next.running.delete(issueId);

  if (reason === 'normal') {
    next.completed.add(issueId);
    const delayMs = calculateRetryDelay(1, 'continuation');
    effects.push({
      type: 'scheduleRetry',
      issueId,
      identifier: entry?.identifier ?? issueId,
      attempt: 1,
      delayMs,
      error: null,
    });
  } else {
    const nextAttempt = (attempt ?? 0) + 1;
    const delayMs = calculateRetryDelay(nextAttempt, 'failure', config.agent.maxRetryBackoffMs);
    effects.push({
      type: 'scheduleRetry',
      issueId,
      identifier: entry?.identifier ?? issueId,
      attempt: nextAttempt,
      delayMs,
      error: error ?? 'unknown error',
    });
  }

  return { nextState: next, effects };
}

function handleAgentUpdate(
  state: OrchestratorState,
  issueId: string,
  event: import('@harness-engineering/types').AgentEvent
): ApplyEventResult {
  const next = cloneState(state);
  const effects: SideEffect[] = [];

  const entry = next.running.get(issueId);
  if (entry && entry.session) {
    const updatedSession = { ...entry.session };
    updatedSession.lastEvent = event.type;
    updatedSession.lastTimestamp = event.timestamp;

    if (event.usage) {
      updatedSession.inputTokens += event.usage.inputTokens;
      updatedSession.outputTokens += event.usage.outputTokens;
      updatedSession.totalTokens += event.usage.totalTokens;

      effects.push({
        type: 'updateTokens',
        issueId,
        usage: event.usage,
      });
    }

    if (event.sessionId) {
      updatedSession.sessionId = event.sessionId;
    }

    next.running.set(issueId, { ...entry, session: updatedSession });
  }

  return { nextState: next, effects };
}

function handleRetryFired(
  state: OrchestratorState,
  issueId: string,
  candidates: Issue[],
  config: WorkflowConfig
): ApplyEventResult {
  const next = cloneState(state);
  const effects: SideEffect[] = [];

  const retryEntry = next.retryAttempts.get(issueId);
  next.retryAttempts.delete(issueId);

  if (!retryEntry) {
    return { nextState: next, effects };
  }

  // Find the issue in candidates
  const issue = candidates.find((c) => c.id === issueId);
  if (!issue) {
    // Not found -> release claim
    next.claimed.delete(issueId);
    effects.push({ type: 'releaseClaim', issueId });
    return { nextState: next, effects };
  }

  // Check if still active
  const normalizedState = issue.state.toLowerCase();
  const normalizedActive = config.tracker.activeStates.map((s) => s.toLowerCase());
  if (!normalizedActive.includes(normalizedState)) {
    next.claimed.delete(issueId);
    effects.push({ type: 'releaseClaim', issueId });
    return { nextState: next, effects };
  }

  // Check slots
  if (!canDispatch(next, issue.state, config.agent.maxConcurrentAgentsByState)) {
    // Requeue with incremented attempt
    const nextAttempt = retryEntry.attempt + 1;
    const delayMs = calculateRetryDelay(nextAttempt, 'failure', config.agent.maxRetryBackoffMs);
    next.retryAttempts.set(issueId, {
      issueId,
      identifier: retryEntry.identifier,
      attempt: nextAttempt,
      dueAtMs: Date.now() + delayMs,
      error: 'no available orchestrator slots',
    });
    effects.push({
      type: 'scheduleRetry',
      issueId,
      identifier: retryEntry.identifier,
      attempt: nextAttempt,
      delayMs,
      error: 'no available orchestrator slots',
    });
    return { nextState: next, effects };
  }

  // Dispatch
  effects.push({
    type: 'dispatch',
    issue,
    attempt: retryEntry.attempt,
  });

  return { nextState: next, effects };
}

function handleStallDetected(
  state: OrchestratorState,
  issueId: string,
  config: WorkflowConfig
): ApplyEventResult {
  const next = cloneState(state);
  const effects: SideEffect[] = [];

  const entry = next.running.get(issueId);
  next.running.delete(issueId);

  const attempt = (entry?.attempt ?? 0) + 1;
  const delayMs = calculateRetryDelay(attempt, 'failure', config.agent.maxRetryBackoffMs);

  effects.push({
    type: 'stop',
    issueId,
    reason: 'stall_detected',
  });

  effects.push({
    type: 'scheduleRetry',
    issueId,
    identifier: entry?.identifier ?? issueId,
    attempt,
    delayMs,
    error: 'stall detected',
  });

  return { nextState: next, effects };
}

/**
 * Pure state machine transition function.
 *
 * Takes the current state, an event, and config.
 * Returns the next state and a list of side effects to execute.
 * No I/O is performed -- all side effects are returned as data.
 */
export function applyEvent(
  state: OrchestratorState,
  event: OrchestratorEvent,
  config: WorkflowConfig
): ApplyEventResult {
  switch (event.type) {
    case 'tick':
      return handleTick(state, event.candidates, event.runningStates, config);
    case 'worker_exit':
      return handleWorkerExit(
        state,
        event.issueId,
        event.reason,
        event.error,
        event.attempt,
        config
      );
    case 'agent_update':
      return handleAgentUpdate(state, event.issueId, event.event);
    case 'retry_fired':
      return handleRetryFired(state, event.issueId, event.candidates, config);
    case 'stall_detected':
      return handleStallDetected(state, event.issueId, config);
  }
}
```

5. Run test: `cd packages/orchestrator && npx vitest run tests/core/state-machine.test.ts`
6. Observe: all tests pass.
7. Run: `harness validate`
8. Commit: `feat(orchestrator): implement state machine applyEvent for tick events`

---

### Task 11: Add state machine tests for worker_exit events (TDD)

**Depends on:** Task 10
**Files:** `packages/orchestrator/tests/core/state-machine.test.ts` (append to existing)

1. Append the following test blocks to `packages/orchestrator/tests/core/state-machine.test.ts`:

```typescript
describe('applyEvent - worker_exit', () => {
  it('should schedule continuation retry (1000ms) on normal exit', () => {
    const config = makeConfig();
    const state = createEmptyState(config);
    const entry: RunningEntry = {
      issueId: 'id-1',
      identifier: 'TEST-1',
      issue: makeIssue({ id: 'id-1' }),
      attempt: null,
      workspacePath: '/tmp/ws/test-1',
      startedAt: '2026-01-01T00:00:00Z',
      phase: 'StreamingTurn',
      session: null,
    };
    state.running.set('id-1', entry);
    state.claimed.add('id-1');

    const event: OrchestratorEvent = {
      type: 'worker_exit',
      issueId: 'id-1',
      reason: 'normal',
      attempt: null,
    };

    const { nextState, effects } = applyEvent(state, event, config);

    expect(nextState.running.has('id-1')).toBe(false);
    expect(nextState.completed.has('id-1')).toBe(true);

    const retry = effects.find((e) => e.type === 'scheduleRetry');
    expect(retry).toBeDefined();
    if (retry && retry.type === 'scheduleRetry') {
      expect(retry.delayMs).toBe(1000);
      expect(retry.attempt).toBe(1);
      expect(retry.error).toBeNull();
    }
  });

  it('should schedule exponential backoff retry on error exit', () => {
    const config = makeConfig();
    const state = createEmptyState(config);
    state.running.set('id-1', {
      issueId: 'id-1',
      identifier: 'TEST-1',
      issue: makeIssue({ id: 'id-1' }),
      attempt: 2,
      workspacePath: '/tmp/ws/test-1',
      startedAt: '2026-01-01T00:00:00Z',
      phase: 'StreamingTurn',
      session: null,
    });
    state.claimed.add('id-1');

    const event: OrchestratorEvent = {
      type: 'worker_exit',
      issueId: 'id-1',
      reason: 'error',
      error: 'agent crashed',
      attempt: 2,
    };

    const { nextState, effects } = applyEvent(state, event, config);

    expect(nextState.running.has('id-1')).toBe(false);

    const retry = effects.find((e) => e.type === 'scheduleRetry');
    expect(retry).toBeDefined();
    if (retry && retry.type === 'scheduleRetry') {
      expect(retry.attempt).toBe(3);
      expect(retry.delayMs).toBe(40000); // 10000 * 2^(3-1) = 40000
      expect(retry.error).toBe('agent crashed');
    }
  });

  it('should remove issue from running map on any exit', () => {
    const config = makeConfig();
    const state = createEmptyState(config);
    state.running.set('id-1', {
      issueId: 'id-1',
      identifier: 'TEST-1',
      issue: makeIssue({ id: 'id-1' }),
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
      error: 'crash',
      attempt: null,
    };

    const { nextState } = applyEvent(state, event, config);
    expect(nextState.running.size).toBe(0);
  });
});
```

2. Add `RunningEntry` to the import at the top of the file (it is already imported from Task 10).

3. Run test: `cd packages/orchestrator && npx vitest run tests/core/state-machine.test.ts`
4. Observe: all tests pass (implementation already exists from Task 10).
5. Run: `harness validate`
6. Commit: `test(orchestrator): add state machine tests for worker_exit events`

---

### Task 12: Add state machine tests for retry_fired and stall_detected events (TDD)

**Depends on:** Task 10
**Files:** `packages/orchestrator/tests/core/state-machine.test.ts` (append to existing)

1. Append the following test blocks to `packages/orchestrator/tests/core/state-machine.test.ts`:

```typescript
describe('applyEvent - retry_fired', () => {
  it('should dispatch issue if found in candidates and slots available', () => {
    const config = makeConfig();
    const state = createEmptyState(config);
    state.claimed.add('id-1');
    state.retryAttempts.set('id-1', {
      issueId: 'id-1',
      identifier: 'TEST-1',
      attempt: 1,
      dueAtMs: Date.now(),
      error: null,
    });

    const candidates = [makeIssue({ id: 'id-1', identifier: 'TEST-1', state: 'Todo' })];
    const event: OrchestratorEvent = {
      type: 'retry_fired',
      issueId: 'id-1',
      candidates,
    };

    const { effects } = applyEvent(state, event, config);
    const dispatch = effects.find((e) => e.type === 'dispatch');
    expect(dispatch).toBeDefined();
    if (dispatch && dispatch.type === 'dispatch') {
      expect(dispatch.issue.id).toBe('id-1');
      expect(dispatch.attempt).toBe(1);
    }
  });

  it('should release claim if issue not found in candidates', () => {
    const config = makeConfig();
    const state = createEmptyState(config);
    state.claimed.add('id-1');
    state.retryAttempts.set('id-1', {
      issueId: 'id-1',
      identifier: 'TEST-1',
      attempt: 1,
      dueAtMs: Date.now(),
      error: null,
    });

    const event: OrchestratorEvent = {
      type: 'retry_fired',
      issueId: 'id-1',
      candidates: [], // not found
    };

    const { nextState, effects } = applyEvent(state, event, config);
    expect(nextState.claimed.has('id-1')).toBe(false);
    expect(effects).toContainEqual({ type: 'releaseClaim', issueId: 'id-1' });
  });

  it('should release claim if issue is no longer active', () => {
    const config = makeConfig();
    const state = createEmptyState(config);
    state.claimed.add('id-1');
    state.retryAttempts.set('id-1', {
      issueId: 'id-1',
      identifier: 'TEST-1',
      attempt: 1,
      dueAtMs: Date.now(),
      error: null,
    });

    const candidates = [makeIssue({ id: 'id-1', state: 'Backlog' })];
    const event: OrchestratorEvent = {
      type: 'retry_fired',
      issueId: 'id-1',
      candidates,
    };

    const { nextState, effects } = applyEvent(state, event, config);
    expect(nextState.claimed.has('id-1')).toBe(false);
    expect(effects).toContainEqual({ type: 'releaseClaim', issueId: 'id-1' });
  });

  it('should requeue with error when no slots available', () => {
    const config = makeConfig({
      agent: {
        ...makeConfig().agent,
        maxConcurrentAgents: 1,
      },
    });
    const state = createEmptyState(config);
    state.maxConcurrentAgents = 1;
    state.claimed.add('id-1');
    state.running.set('id-other', {
      issueId: 'id-other',
      identifier: 'OTHER-1',
      issue: makeIssue({ id: 'id-other', identifier: 'OTHER-1' }),
      attempt: null,
      workspacePath: '/tmp/ws/other',
      startedAt: '2026-01-01T00:00:00Z',
      phase: 'StreamingTurn',
      session: null,
    });
    state.retryAttempts.set('id-1', {
      issueId: 'id-1',
      identifier: 'TEST-1',
      attempt: 1,
      dueAtMs: Date.now(),
      error: null,
    });

    const candidates = [makeIssue({ id: 'id-1', state: 'Todo' })];
    const event: OrchestratorEvent = {
      type: 'retry_fired',
      issueId: 'id-1',
      candidates,
    };

    const { effects } = applyEvent(state, event, config);
    const retry = effects.find((e) => e.type === 'scheduleRetry');
    expect(retry).toBeDefined();
    if (retry && retry.type === 'scheduleRetry') {
      expect(retry.error).toBe('no available orchestrator slots');
      expect(retry.attempt).toBe(2);
    }
  });

  it('should do nothing if retry entry is missing', () => {
    const config = makeConfig();
    const state = createEmptyState(config);

    const event: OrchestratorEvent = {
      type: 'retry_fired',
      issueId: 'id-1',
      candidates: [],
    };

    const { effects } = applyEvent(state, event, config);
    expect(effects).toEqual([]);
  });
});

describe('applyEvent - stall_detected', () => {
  it('should stop the stalled issue and schedule retry', () => {
    const config = makeConfig();
    const state = createEmptyState(config);
    state.running.set('id-1', {
      issueId: 'id-1',
      identifier: 'TEST-1',
      issue: makeIssue({ id: 'id-1' }),
      attempt: 2,
      workspacePath: '/tmp/ws/test-1',
      startedAt: '2026-01-01T00:00:00Z',
      phase: 'StreamingTurn',
      session: null,
    });
    state.claimed.add('id-1');

    const event: OrchestratorEvent = {
      type: 'stall_detected',
      issueId: 'id-1',
    };

    const { nextState, effects } = applyEvent(state, event, config);

    expect(nextState.running.has('id-1')).toBe(false);

    const stop = effects.find((e) => e.type === 'stop');
    expect(stop).toBeDefined();
    if (stop && stop.type === 'stop') {
      expect(stop.reason).toBe('stall_detected');
    }

    const retry = effects.find((e) => e.type === 'scheduleRetry');
    expect(retry).toBeDefined();
    if (retry && retry.type === 'scheduleRetry') {
      expect(retry.error).toBe('stall detected');
      expect(retry.attempt).toBe(3); // previous attempt 2, so next = 3
    }
  });

  it('should handle stall when issue has no previous attempt', () => {
    const config = makeConfig();
    const state = createEmptyState(config);
    state.running.set('id-1', {
      issueId: 'id-1',
      identifier: 'TEST-1',
      issue: makeIssue({ id: 'id-1' }),
      attempt: null,
      workspacePath: '/tmp/ws/test-1',
      startedAt: '2026-01-01T00:00:00Z',
      phase: 'StreamingTurn',
      session: null,
    });

    const event: OrchestratorEvent = {
      type: 'stall_detected',
      issueId: 'id-1',
    };

    const { effects } = applyEvent(state, event, config);
    const retry = effects.find((e) => e.type === 'scheduleRetry');
    expect(retry).toBeDefined();
    if (retry && retry.type === 'scheduleRetry') {
      expect(retry.attempt).toBe(1);
    }
  });
});
```

2. Run test: `cd packages/orchestrator && npx vitest run tests/core/state-machine.test.ts`
3. Observe: all tests pass.
4. Run: `harness validate`
5. Commit: `test(orchestrator): add state machine tests for retry_fired and stall_detected events`

---

### Task 13: Add state machine tests for agent_update event (TDD)

**Depends on:** Task 10
**Files:** `packages/orchestrator/tests/core/state-machine.test.ts` (append to existing)

1. Append the following test block to `packages/orchestrator/tests/core/state-machine.test.ts`:

```typescript
describe('applyEvent - agent_update', () => {
  it('should update session token counters and emit updateTokens effect', () => {
    const config = makeConfig();
    const state = createEmptyState(config);
    state.running.set('id-1', {
      issueId: 'id-1',
      identifier: 'TEST-1',
      issue: makeIssue({ id: 'id-1' }),
      attempt: null,
      workspacePath: '/tmp/ws/test-1',
      startedAt: '2026-01-01T00:00:00Z',
      phase: 'StreamingTurn',
      session: {
        sessionId: 'sess-1',
        backendName: 'mock',
        agentPid: null,
        startedAt: '2026-01-01T00:00:00Z',
        lastEvent: null,
        lastTimestamp: null,
        lastMessage: null,
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        lastReportedInputTokens: 0,
        lastReportedOutputTokens: 0,
        lastReportedTotalTokens: 0,
        turnCount: 1,
      },
    });

    const event: OrchestratorEvent = {
      type: 'agent_update',
      issueId: 'id-1',
      event: {
        type: 'assistant',
        timestamp: '2026-01-01T00:01:00Z',
        usage: { inputTokens: 200, outputTokens: 100, totalTokens: 300 },
        sessionId: 'sess-1-updated',
      },
    };

    const { nextState, effects } = applyEvent(state, event, config);

    const entry = nextState.running.get('id-1');
    expect(entry).toBeDefined();
    expect(entry!.session!.inputTokens).toBe(300);
    expect(entry!.session!.outputTokens).toBe(150);
    expect(entry!.session!.totalTokens).toBe(450);
    expect(entry!.session!.lastEvent).toBe('assistant');
    expect(entry!.session!.lastTimestamp).toBe('2026-01-01T00:01:00Z');
    expect(entry!.session!.sessionId).toBe('sess-1-updated');

    const tokenEffect = effects.find((e) => e.type === 'updateTokens');
    expect(tokenEffect).toBeDefined();
  });

  it('should be a no-op when issue is not in running map', () => {
    const config = makeConfig();
    const state = createEmptyState(config);

    const event: OrchestratorEvent = {
      type: 'agent_update',
      issueId: 'nonexistent',
      event: { type: 'assistant', timestamp: '2026-01-01T00:01:00Z' },
    };

    const { nextState, effects } = applyEvent(state, event, config);
    expect(nextState.running.size).toBe(0);
    expect(effects).toEqual([]);
  });

  it('should be a no-op when running entry has no session', () => {
    const config = makeConfig();
    const state = createEmptyState(config);
    state.running.set('id-1', {
      issueId: 'id-1',
      identifier: 'TEST-1',
      issue: makeIssue({ id: 'id-1' }),
      attempt: null,
      workspacePath: '/tmp/ws/test-1',
      startedAt: '2026-01-01T00:00:00Z',
      phase: 'LaunchingAgent',
      session: null,
    });

    const event: OrchestratorEvent = {
      type: 'agent_update',
      issueId: 'id-1',
      event: {
        type: 'assistant',
        timestamp: '2026-01-01T00:01:00Z',
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      },
    };

    const { effects } = applyEvent(state, event, config);
    expect(effects).toEqual([]);
  });

  it('should update lastEvent without token effect when no usage present', () => {
    const config = makeConfig();
    const state = createEmptyState(config);
    state.running.set('id-1', {
      issueId: 'id-1',
      identifier: 'TEST-1',
      issue: makeIssue({ id: 'id-1' }),
      attempt: null,
      workspacePath: '/tmp/ws/test-1',
      startedAt: '2026-01-01T00:00:00Z',
      phase: 'StreamingTurn',
      session: {
        sessionId: 'sess-1',
        backendName: 'mock',
        agentPid: null,
        startedAt: '2026-01-01T00:00:00Z',
        lastEvent: null,
        lastTimestamp: null,
        lastMessage: null,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        lastReportedInputTokens: 0,
        lastReportedOutputTokens: 0,
        lastReportedTotalTokens: 0,
        turnCount: 1,
      },
    });

    const event: OrchestratorEvent = {
      type: 'agent_update',
      issueId: 'id-1',
      event: { type: 'system', timestamp: '2026-01-01T00:01:00Z' },
    };

    const { nextState, effects } = applyEvent(state, event, config);
    const entry = nextState.running.get('id-1');
    expect(entry!.session!.lastEvent).toBe('system');
    expect(entry!.session!.lastTimestamp).toBe('2026-01-01T00:01:00Z');
    expect(effects.filter((e) => e.type === 'updateTokens')).toHaveLength(0);
  });
});
```

2. Run test: `cd packages/orchestrator && npx vitest run tests/core/state-machine.test.ts`
3. Observe: all tests pass.
4. Run: `harness validate`
5. Commit: `test(orchestrator): add state machine tests for agent_update events`

---

### Task 14: Create core barrel exports and verify full build

**Depends on:** Tasks 5, 6, 7, 8, 9, 10
**Files:** `packages/orchestrator/src/core/index.ts`

[checkpoint:human-verify] -- Verify the full test suite passes and build is clean before finalizing.

1. Create `packages/orchestrator/src/core/index.ts`:

```typescript
export { calculateRetryDelay } from './retry';
export { sortCandidates, isEligible, selectCandidates } from './candidate-selection';
export { getAvailableSlots, getPerStateCount, canDispatch } from './concurrency';
export { reconcile } from './reconciliation';
export { applyEvent } from './state-machine';
export type { ApplyEventResult } from './state-machine';
export { createEmptyState } from './state-helpers';
```

2. Run full test suite: `cd packages/orchestrator && npx vitest run`
3. Observe: all tests pass with zero failures.
4. Run build: `cd packages/types && pnpm run build && cd ../orchestrator && pnpm run build`
5. Observe: builds succeed.
6. Run: `harness validate`
7. Commit: `feat(orchestrator): add core barrel exports and verify full build`

---

## Dependency Graph

```
Task 1 (shared types)
  └─> Task 2 (scaffold package)
        └─> Task 3 (internal types)
              └─> Task 4 (event types)
              │     ├─> Task 5 (retry) ────────────────────┐
              │     ├─> Task 6 (candidate selection) ──────┤
              │     ├─> Task 7 (concurrency) ──────────────┤
              │     └─> Task 8 (reconciliation) ───────────┤
              └─> Task 9 (state helpers) ──────────────────┤
                                                           ├─> Task 10 (state machine + tick tests)
                                                           │     ├─> Task 11 (worker_exit tests)
                                                           │     ├─> Task 12 (retry_fired + stall tests)
                                                           │     └─> Task 13 (agent_update tests)
                                                           └─> Task 14 (barrel + full build verify)
```

Tasks 5, 6, 7, 8 are parallelizable (they touch different files and have no mutual dependencies).
Tasks 11, 12, 13 are parallelizable (they append to the same test file but could be done in any order).

## Traceability Matrix

| Observable Truth                             | Delivered By    |
| -------------------------------------------- | --------------- |
| 1. Shared types exported from packages/types | Task 1          |
| 2. Types package builds                      | Task 1          |
| 3. Orchestrator package scaffolded           | Task 2          |
| 4. Internal types defined                    | Task 3          |
| 5. Event/effect types defined                | Task 4          |
| 6. Tick dispatches up to concurrency         | Task 10         |
| 7. Normal exit -> continuation retry 1000ms  | Task 11         |
| 8. Error exit -> exponential backoff         | Task 11         |
| 9. Candidate selection sort + eligibility    | Task 6          |
| 10. Concurrency slot calculation             | Task 7          |
| 11. Terminal reconciliation -> stop + clean  | Task 8, Task 10 |
| 12. Stall detection -> stop + retry          | Task 12         |
| 13. Retry delay calculation                  | Task 5          |
| 14. Reconciliation logic                     | Task 8          |
| 15. All tests pass                           | Task 14         |
| 16. harness validate passes                  | Task 14         |

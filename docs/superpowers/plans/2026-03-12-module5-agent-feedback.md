# Module 5: Agent Feedback Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Agent Feedback module with self-review workflows, peer review orchestration, telemetry integration, and agent action logging.

**Architecture:** Monolithic module at `packages/core/src/feedback/` with four subdirectories (review/, telemetry/, executor/, logging/) plus types.ts, config.ts, and index.ts. Uses Result<T, E> pattern, NoOp implementations for external integrations.

**Tech Stack:** TypeScript, Vitest, Node.js EventEmitter

**Spec:** `docs/superpowers/specs/2026-03-12-module5-agent-feedback-design.md`

---

## File Structure

```
packages/core/src/feedback/
├── types.ts                 # All type definitions (~300 lines)
├── config.ts                # Module configuration (~80 lines)
├── telemetry/
│   ├── adapter.ts           # TelemetryAdapter interface (~30 lines)
│   └── noop.ts              # NoOpTelemetryAdapter (~40 lines)
├── executor/
│   ├── interface.ts         # AgentExecutor interface (~30 lines)
│   └── noop.ts              # NoOpExecutor (~60 lines)
├── logging/
│   ├── emitter.ts           # AgentActionEmitter (~80 lines)
│   ├── sink.ts              # ActionSink interface (~20 lines)
│   ├── console-sink.ts      # ConsoleSink (~50 lines)
│   └── file-sink.ts         # FileSink (~80 lines)
├── review/
│   ├── diff-analyzer.ts     # parseDiff, analyzeDiff (~150 lines)
│   ├── checklist.ts         # ChecklistBuilder (~120 lines)
│   ├── self-review.ts       # createSelfReview (~100 lines)
│   └── peer-review.ts       # requestPeerReview (~80 lines)
└── index.ts                 # Public exports (~60 lines)

packages/core/tests/feedback/
├── types.test.ts
├── config.test.ts
├── telemetry/
│   └── noop.test.ts
├── executor/
│   └── noop.test.ts
├── logging/
│   ├── emitter.test.ts
│   ├── console-sink.test.ts
│   └── file-sink.test.ts
├── review/
│   ├── diff-analyzer.test.ts
│   ├── checklist.test.ts
│   ├── self-review.test.ts
│   └── peer-review.test.ts
└── integration/
    └── full-workflow.test.ts
```

---

## Chunk 1: Foundation (Types, Config, Errors)

### Task 1: Create feedback types.ts

**Files:**
- Create: `packages/core/src/feedback/types.ts`
- Test: `packages/core/tests/feedback/types.test.ts`

- [ ] **Step 1: Write test for type imports**

```typescript
// packages/core/tests/feedback/types.test.ts
import { describe, it, expect } from 'vitest';
import type {
  FeedbackError,
  ReviewItem,
  ReviewChecklist,
  CodeChanges,
  ChangedFile,
  AgentType,
  AgentConfig,
  AgentProcess,
  ReviewContext,
  PeerReview,
  ReviewComment,
  TimeRange,
  Metric,
  Span,
  SpanEvent,
  Trace,
  LogEntry,
  LogFilter,
  TelemetryHealth,
  ExecutorHealth,
  ActionType,
  AgentAction,
  ActionContext,
  ActionResult,
  ActionEventType,
  ActionEvent,
  SelfReviewConfig,
  CustomRule,
  CustomRuleResult,
  ForbiddenPattern,
  PeerReviewOptions,
} from '../../src/feedback/types';

describe('Feedback Types', () => {
  it('should export FeedbackError type', () => {
    const error: FeedbackError = {
      code: 'REVIEW_ERROR',
      message: 'Test error',
      details: {},
      suggestions: [],
    };
    expect(error.code).toBe('REVIEW_ERROR');
  });

  it('should export ReviewChecklist type', () => {
    const checklist: ReviewChecklist = {
      items: [],
      passed: true,
      summary: { total: 0, passed: 0, failed: 0, errors: 0, warnings: 0 },
      duration: 100,
    };
    expect(checklist.passed).toBe(true);
  });

  it('should export AgentAction type', () => {
    const action: AgentAction = {
      id: 'test-id',
      type: 'self-review',
      timestamp: new Date().toISOString(),
      status: 'completed',
      context: { trigger: 'manual' },
    };
    expect(action.type).toBe('self-review');
  });

  it('should export CodeChanges type', () => {
    const changes: CodeChanges = {
      diff: '',
      files: [{ path: 'test.ts', status: 'modified', additions: 10, deletions: 5 }],
    };
    expect(changes.files[0].status).toBe('modified');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/core && pnpm test tests/feedback/types.test.ts
```

Expected: FAIL - Cannot find module

- [ ] **Step 3: Create types.ts with all type definitions**

```typescript
// packages/core/src/feedback/types.ts
import type { BaseError } from '../shared/errors';

// ============ Error Types ============

export interface FeedbackError extends BaseError {
  code:
    | 'AGENT_SPAWN_ERROR'
    | 'AGENT_TIMEOUT'
    | 'TELEMETRY_ERROR'
    | 'TELEMETRY_UNAVAILABLE'
    | 'REVIEW_ERROR'
    | 'DIFF_PARSE_ERROR'
    | 'SINK_ERROR';
  details: {
    agentId?: string;
    service?: string;
    reason?: string;
    originalError?: Error;
  };
}

// ============ Review Types ============

export interface ReviewItem {
  id: string;
  category: 'harness' | 'custom' | 'diff';
  check: string;
  passed: boolean;
  severity: 'error' | 'warning' | 'info';
  details: string;
  suggestion?: string;
  file?: string;
  line?: number;
}

export interface ReviewChecklist {
  items: ReviewItem[];
  passed: boolean;
  summary: {
    total: number;
    passed: number;
    failed: number;
    errors: number;
    warnings: number;
  };
  duration: number;
}

export interface CodeChanges {
  diff: string;
  files: ChangedFile[];
  commitMessage?: string;
  branch?: string;
}

export interface ChangedFile {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
}

// ============ Self-Review Config ============

export interface SelfReviewConfig {
  harness?: {
    context?: boolean;
    constraints?: boolean;
    entropy?: boolean;
  };
  customRules?: CustomRule[];
  diffAnalysis?: {
    enabled: boolean;
    checkTestCoverage?: boolean;
    checkDocumentation?: boolean;
    maxFileSize?: number;
    maxChangedFiles?: number;
    forbiddenPatterns?: ForbiddenPattern[];
  };
  rootDir: string;
}

export interface CustomRule {
  id: string;
  name: string;
  description: string;
  severity: 'error' | 'warning' | 'info';
  check: (changes: CodeChanges, rootDir: string) => Promise<CustomRuleResult>;
}

export interface CustomRuleResult {
  passed: boolean;
  details: string;
  suggestion?: string;
  file?: string;
  line?: number;
}

export interface ForbiddenPattern {
  pattern: string | RegExp;
  message: string;
  severity: 'error' | 'warning';
  fileGlob?: string;
}

// ============ Agent Types ============

export type AgentType =
  | 'architecture-enforcer'
  | 'documentation-maintainer'
  | 'test-reviewer'
  | 'entropy-cleaner'
  | 'custom';

export interface AgentConfig {
  type: AgentType;
  customType?: string;
  context: ReviewContext;
  skills?: string[];
  timeout?: number;
}

export interface ReviewContext {
  files: string[];
  diff?: string;
  commitMessage?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentProcess {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'timeout';
  startedAt: string;
  config: AgentConfig;
}

export interface PeerReview {
  agentId: string;
  agentType: AgentType;
  approved: boolean;
  comments: ReviewComment[];
  suggestions: string[];
  duration: number;
  completedAt: string;
}

export interface ReviewComment {
  file: string;
  line?: number;
  severity: 'error' | 'warning' | 'suggestion';
  message: string;
  code?: string;
}

export interface PeerReviewOptions {
  skills?: string[];
  timeout?: number;
  wait?: boolean;
  customAgentType?: string;
}

// ============ Telemetry Types ============

export interface TimeRange {
  start: Date | string;
  end: Date | string;
}

export interface Metric {
  name: string;
  value: number;
  unit: string;
  timestamp: string;
  labels: Record<string, string>;
}

export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  service: string;
  startTime: string;
  endTime: string;
  duration: number;
  status: 'ok' | 'error';
  attributes: Record<string, unknown>;
  events: SpanEvent[];
}

export interface SpanEvent {
  name: string;
  timestamp: string;
  attributes: Record<string, unknown>;
}

export interface Trace {
  traceId: string;
  spans: Span[];
  rootSpan: Span;
  duration: number;
  service: string;
}

export interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  service: string;
  attributes: Record<string, unknown>;
  traceId?: string;
  spanId?: string;
}

export interface LogFilter {
  level?: LogEntry['level'] | LogEntry['level'][];
  search?: string;
  attributes?: Record<string, unknown>;
  limit?: number;
}

export interface TelemetryHealth {
  available: boolean;
  latency?: number;
  message?: string;
}

// ============ Executor Types ============

export interface ExecutorHealth {
  available: boolean;
  maxConcurrent?: number;
  activeProcesses?: number;
  message?: string;
}

// ============ Action Logging Types ============

export type ActionType =
  | 'self-review'
  | 'peer-review'
  | 'telemetry-query'
  | 'spawn-agent'
  | 'kill-agent'
  | 'fix-apply'
  | 'custom';

export interface AgentAction {
  id: string;
  type: ActionType;
  agentId?: string;
  timestamp: string;
  duration?: number;
  status: 'started' | 'completed' | 'failed';
  context: ActionContext;
  result?: ActionResult;
  error?: {
    code: string;
    message: string;
  };
}

export interface ActionContext {
  trigger: 'manual' | 'ci' | 'scheduled' | 'agent';
  files?: string[];
  commitSha?: string;
  prNumber?: number;
  branch?: string;
  metadata?: Record<string, unknown>;
}

export interface ActionResult {
  outcome: 'success' | 'partial' | 'failure';
  summary: string;
  data?: unknown;
}

export type ActionEventType =
  | 'action:started'
  | 'action:completed'
  | 'action:failed'
  | 'action:*';

export interface ActionEvent {
  type: ActionEventType;
  action: AgentAction;
  timestamp: string;
}

export type ActionEventHandler = (event: ActionEvent) => void | Promise<void>;

// ============ Interface Types (for adapters) ============

export interface TelemetryAdapter {
  readonly name: string;
  health(): Promise<import('../shared/result').Result<TelemetryHealth, FeedbackError>>;
  getMetrics(
    service: string,
    timeRange: TimeRange,
    metricNames?: string[]
  ): Promise<import('../shared/result').Result<Metric[], FeedbackError>>;
  getTraces(
    service: string,
    timeRange: TimeRange,
    traceId?: string
  ): Promise<import('../shared/result').Result<Trace[], FeedbackError>>;
  getLogs(
    service: string,
    timeRange: TimeRange,
    filter?: LogFilter
  ): Promise<import('../shared/result').Result<LogEntry[], FeedbackError>>;
}

export interface AgentExecutor {
  readonly name: string;
  health(): Promise<import('../shared/result').Result<ExecutorHealth, FeedbackError>>;
  spawn(config: AgentConfig): Promise<import('../shared/result').Result<AgentProcess, FeedbackError>>;
  status(processId: string): Promise<import('../shared/result').Result<AgentProcess, FeedbackError>>;
  wait(processId: string, timeout?: number): Promise<import('../shared/result').Result<PeerReview, FeedbackError>>;
  kill(processId: string): Promise<import('../shared/result').Result<void, FeedbackError>>;
}

export interface ActionSink {
  readonly name: string;
  write(action: AgentAction): Promise<import('../shared/result').Result<void, FeedbackError>>;
  flush?(): Promise<import('../shared/result').Result<void, FeedbackError>>;
  close?(): Promise<void>;
}

export interface ActionTracker {
  readonly action: AgentAction;
  complete(result: ActionResult): Promise<import('../shared/result').Result<AgentAction, FeedbackError>>;
  fail(error: { code: string; message: string }): Promise<import('../shared/result').Result<AgentAction, FeedbackError>>;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/core && pnpm test tests/feedback/types.test.ts
```

Expected: PASS

- [ ] **Step 5: Create test fixtures directory**

```bash
mkdir -p packages/core/tests/fixtures/feedback/temp
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/feedback/types.ts packages/core/tests/feedback/types.test.ts
git commit -m "feat(feedback): add type definitions for agent feedback module"
```

---

### Task 2: Create feedback config.ts

**Files:**
- Create: `packages/core/src/feedback/config.ts`
- Test: `packages/core/tests/feedback/config.test.ts`

- [ ] **Step 1: Write test for configuration**

```typescript
// packages/core/tests/feedback/config.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  configureFeedback,
  getFeedbackConfig,
  resetFeedbackConfig,
} from '../../src/feedback/config';

describe('Feedback Config', () => {
  beforeEach(() => {
    resetFeedbackConfig();
  });

  it('should have default configuration', () => {
    const config = getFeedbackConfig();
    expect(config.emitEvents).toBe(true);
    expect(config.defaultTimeout).toBe(300000);
    expect(config.telemetry).toBeDefined();
    expect(config.executor).toBeDefined();
    expect(config.sinks).toBeDefined();
    expect(config.sinks!.length).toBeGreaterThan(0);
  });

  it('should allow partial configuration updates', () => {
    configureFeedback({ defaultTimeout: 60000 });
    const config = getFeedbackConfig();
    expect(config.defaultTimeout).toBe(60000);
    expect(config.emitEvents).toBe(true); // unchanged
  });

  it('should reset to defaults', () => {
    configureFeedback({ defaultTimeout: 60000 });
    resetFeedbackConfig();
    const config = getFeedbackConfig();
    expect(config.defaultTimeout).toBe(300000);
  });

  it('should return frozen config object', () => {
    const config = getFeedbackConfig();
    expect(Object.isFrozen(config)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/core && pnpm test tests/feedback/config.test.ts
```

Expected: FAIL - Cannot find module

- [ ] **Step 3: Create config.ts**

```typescript
// packages/core/src/feedback/config.ts
import type {
  TelemetryAdapter,
  AgentExecutor,
  ActionSink,
} from './types';
// Direct imports - these are small NoOp classes, no circular dependency issue
import { NoOpTelemetryAdapter } from './telemetry/noop';
import { NoOpExecutor } from './executor/noop';
import { ConsoleSink } from './logging/console-sink';

export interface FeedbackConfig {
  telemetry?: TelemetryAdapter;
  executor?: AgentExecutor;
  sinks?: ActionSink[];
  emitEvents?: boolean;
  defaultTimeout?: number;
  rootDir?: string;
}

function getDefaults(): Required<FeedbackConfig> {
  return {
    telemetry: new NoOpTelemetryAdapter(),
    executor: new NoOpExecutor(),
    sinks: [new ConsoleSink()],
    emitEvents: true,
    defaultTimeout: 300000,
    rootDir: process.cwd(),
  };
}

let feedbackConfig: FeedbackConfig | null = null;

function ensureConfig(): FeedbackConfig {
  if (!feedbackConfig) {
    feedbackConfig = getDefaults();
  }
  return feedbackConfig;
}

export function configureFeedback(config: Partial<FeedbackConfig>): void {
  feedbackConfig = { ...ensureConfig(), ...config };
}

export function getFeedbackConfig(): Readonly<FeedbackConfig> {
  return Object.freeze({ ...ensureConfig() });
}

export function resetFeedbackConfig(): void {
  feedbackConfig = null;
}
```

- [ ] **Step 4: Create stub files for lazy imports**

Create minimal stubs so config.ts can load:

```typescript
// packages/core/src/feedback/telemetry/noop.ts
import { Ok } from '../../shared/result';
import type { TelemetryAdapter, TelemetryHealth, Metric, Trace, LogEntry, FeedbackError, TimeRange, LogFilter } from '../types';
import type { Result } from '../../shared/result';

export class NoOpTelemetryAdapter implements TelemetryAdapter {
  readonly name = 'noop';

  async health(): Promise<Result<TelemetryHealth, FeedbackError>> {
    return Ok({ available: true, message: 'NoOp adapter - no real telemetry' });
  }

  async getMetrics(): Promise<Result<Metric[], FeedbackError>> {
    return Ok([]);
  }

  async getTraces(): Promise<Result<Trace[], FeedbackError>> {
    return Ok([]);
  }

  async getLogs(): Promise<Result<LogEntry[], FeedbackError>> {
    return Ok([]);
  }
}
```

```typescript
// packages/core/src/feedback/executor/noop.ts
import { Ok, Err } from '../../shared/result';
import type { AgentExecutor, ExecutorHealth, AgentConfig, AgentProcess, PeerReview, FeedbackError } from '../types';
import type { Result } from '../../shared/result';

export class NoOpExecutor implements AgentExecutor {
  readonly name = 'noop';
  private processes = new Map<string, AgentProcess>();

  async health(): Promise<Result<ExecutorHealth, FeedbackError>> {
    return Ok({ available: true, message: 'NoOp executor - no real agent spawning' });
  }

  async spawn(config: AgentConfig): Promise<Result<AgentProcess, FeedbackError>> {
    const id = crypto.randomUUID();
    const process: AgentProcess = {
      id,
      status: 'completed',
      startedAt: new Date().toISOString(),
      config,
    };
    this.processes.set(id, process);
    return Ok(process);
  }

  async status(processId: string): Promise<Result<AgentProcess, FeedbackError>> {
    const process = this.processes.get(processId);
    if (!process) {
      return Err({
        code: 'AGENT_SPAWN_ERROR',
        message: 'Process not found',
        details: { agentId: processId },
        suggestions: ['Check if the process ID is correct'],
      });
    }
    return Ok(process);
  }

  async wait(processId: string): Promise<Result<PeerReview, FeedbackError>> {
    const process = this.processes.get(processId);
    if (!process) {
      return Err({
        code: 'AGENT_SPAWN_ERROR',
        message: 'Process not found',
        details: { agentId: processId },
        suggestions: ['Check if the process ID is correct'],
      });
    }
    return Ok({
      agentId: processId,
      agentType: process.config.type,
      approved: true,
      comments: [],
      suggestions: [],
      duration: 0,
      completedAt: new Date().toISOString(),
    });
  }

  async kill(processId: string): Promise<Result<void, FeedbackError>> {
    this.processes.delete(processId);
    return Ok(undefined);
  }
}
```

```typescript
// packages/core/src/feedback/logging/console-sink.ts
import { Ok } from '../../shared/result';
import type { ActionSink, AgentAction, FeedbackError } from '../types';
import type { Result } from '../../shared/result';

export interface ConsoleSinkOptions {
  level?: 'debug' | 'info' | 'warn' | 'error';
  format?: 'pretty' | 'json';
  verbose?: boolean;
}

export class ConsoleSink implements ActionSink {
  readonly name = 'console';
  private options: ConsoleSinkOptions;

  constructor(options: ConsoleSinkOptions = {}) {
    this.options = {
      level: options.level ?? 'info',
      format: options.format ?? 'pretty',
      verbose: options.verbose ?? false,
    };
  }

  async write(action: AgentAction): Promise<Result<void, FeedbackError>> {
    const output = this.options.format === 'json'
      ? JSON.stringify(action)
      : this.formatPretty(action);

    console.log(output);
    return Ok(undefined);
  }

  private formatPretty(action: AgentAction): string {
    const status = action.status === 'completed' ? '✓' : action.status === 'failed' ? '✗' : '→';
    const duration = action.duration ? ` (${action.duration}ms)` : '';
    return `[${status}] ${action.type}${duration}: ${action.result?.summary ?? action.status}`;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd packages/core && pnpm test tests/feedback/config.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/feedback/
git commit -m "feat(feedback): add module configuration and NoOp stubs"
```

---

### Task 3: Update shared/errors.ts with new FeedbackError codes

**Files:**
- Modify: `packages/core/src/shared/errors.ts`
- Test: `packages/core/tests/shared/errors.test.ts`

- [ ] **Step 1: Write test for new error codes**

```typescript
// Add to packages/core/tests/shared/errors.test.ts
import { describe, it, expect } from 'vitest';
import { createError } from '../../src/shared/errors';
import type { FeedbackError } from '../../src/shared/errors';

describe('FeedbackError', () => {
  it('should create AGENT_TIMEOUT error', () => {
    const error = createError<FeedbackError>(
      'AGENT_TIMEOUT',
      'Agent timed out',
      { agentId: 'test-123' },
      ['Increase timeout or check agent health']
    );
    expect(error.code).toBe('AGENT_TIMEOUT');
    expect(error.details.agentId).toBe('test-123');
  });

  it('should create DIFF_PARSE_ERROR', () => {
    const error = createError<FeedbackError>(
      'DIFF_PARSE_ERROR',
      'Failed to parse diff',
      { reason: 'Invalid format' },
      []
    );
    expect(error.code).toBe('DIFF_PARSE_ERROR');
  });

  it('should create SINK_ERROR', () => {
    const error = createError<FeedbackError>(
      'SINK_ERROR',
      'Failed to write to sink',
      {},
      []
    );
    expect(error.code).toBe('SINK_ERROR');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/core && pnpm test tests/shared/errors.test.ts
```

Expected: FAIL - Type errors for new codes

- [ ] **Step 3: Update errors.ts**

```typescript
// packages/core/src/shared/errors.ts - update FeedbackError interface
export interface FeedbackError extends BaseError {
  code:
    | 'AGENT_SPAWN_ERROR'
    | 'AGENT_TIMEOUT'
    | 'TELEMETRY_ERROR'
    | 'TELEMETRY_UNAVAILABLE'
    | 'REVIEW_ERROR'
    | 'DIFF_PARSE_ERROR'
    | 'SINK_ERROR';
  details: {
    agentId?: string;
    service?: string;
    reason?: string;
    originalError?: Error;
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/core && pnpm test tests/shared/errors.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/shared/errors.ts packages/core/tests/shared/errors.test.ts
git commit -m "feat(feedback): add FeedbackError codes to shared errors"
```

---

## Chunk 2: Telemetry & Executor

### Task 4: Implement NoOpTelemetryAdapter with full tests

**Files:**
- Modify: `packages/core/src/feedback/telemetry/noop.ts`
- Create: `packages/core/tests/feedback/telemetry/noop.test.ts`

- [ ] **Step 1: Write comprehensive tests**

```typescript
// packages/core/tests/feedback/telemetry/noop.test.ts
import { describe, it, expect } from 'vitest';
import { NoOpTelemetryAdapter } from '../../../src/feedback/telemetry/noop';

describe('NoOpTelemetryAdapter', () => {
  const adapter = new NoOpTelemetryAdapter();

  it('should have name "noop"', () => {
    expect(adapter.name).toBe('noop');
  });

  describe('health()', () => {
    it('should return available: true', async () => {
      const result = await adapter.health();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.available).toBe(true);
        expect(result.value.message).toContain('NoOp');
      }
    });
  });

  describe('getMetrics()', () => {
    it('should return empty array', async () => {
      const result = await adapter.getMetrics('test-service', {
        start: new Date(),
        end: new Date(),
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });
  });

  describe('getTraces()', () => {
    it('should return empty array', async () => {
      const result = await adapter.getTraces('test-service', {
        start: new Date(),
        end: new Date(),
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });
  });

  describe('getLogs()', () => {
    it('should return empty array', async () => {
      const result = await adapter.getLogs('test-service', {
        start: new Date(),
        end: new Date(),
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });

    it('should accept filter parameter', async () => {
      const result = await adapter.getLogs(
        'test-service',
        { start: new Date(), end: new Date() },
        { level: 'error', limit: 10 }
      );
      expect(result.ok).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run test**

```bash
cd packages/core && pnpm test tests/feedback/telemetry/noop.test.ts
```

Expected: PASS (stub already exists)

- [ ] **Step 3: Commit**

```bash
git add packages/core/tests/feedback/telemetry/noop.test.ts
git commit -m "test(feedback): add NoOpTelemetryAdapter tests"
```

---

### Task 5: Implement NoOpExecutor with full tests

**Files:**
- Modify: `packages/core/src/feedback/executor/noop.ts`
- Create: `packages/core/tests/feedback/executor/noop.test.ts`

- [ ] **Step 1: Write comprehensive tests**

```typescript
// packages/core/tests/feedback/executor/noop.test.ts
import { describe, it, expect } from 'vitest';
import { NoOpExecutor } from '../../../src/feedback/executor/noop';
import type { AgentConfig } from '../../../src/feedback/types';

describe('NoOpExecutor', () => {
  const executor = new NoOpExecutor();

  const testConfig: AgentConfig = {
    type: 'architecture-enforcer',
    context: {
      files: ['test.ts'],
      diff: 'test diff',
    },
  };

  it('should have name "noop"', () => {
    expect(executor.name).toBe('noop');
  });

  describe('health()', () => {
    it('should return available: true', async () => {
      const result = await executor.health();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.available).toBe(true);
      }
    });
  });

  describe('spawn()', () => {
    it('should create process with completed status', async () => {
      const result = await executor.spawn(testConfig);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBeDefined();
        expect(result.value.status).toBe('completed');
        expect(result.value.config).toEqual(testConfig);
      }
    });

    it('should generate unique IDs', async () => {
      const result1 = await executor.spawn(testConfig);
      const result2 = await executor.spawn(testConfig);
      expect(result1.ok && result2.ok).toBe(true);
      if (result1.ok && result2.ok) {
        expect(result1.value.id).not.toBe(result2.value.id);
      }
    });
  });

  describe('status()', () => {
    it('should return process status', async () => {
      const spawnResult = await executor.spawn(testConfig);
      expect(spawnResult.ok).toBe(true);
      if (spawnResult.ok) {
        const statusResult = await executor.status(spawnResult.value.id);
        expect(statusResult.ok).toBe(true);
        if (statusResult.ok) {
          expect(statusResult.value.id).toBe(spawnResult.value.id);
        }
      }
    });

    it('should return error for unknown process', async () => {
      const result = await executor.status('unknown-id');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('AGENT_SPAWN_ERROR');
      }
    });
  });

  describe('wait()', () => {
    it('should return approved review', async () => {
      const spawnResult = await executor.spawn(testConfig);
      expect(spawnResult.ok).toBe(true);
      if (spawnResult.ok) {
        const waitResult = await executor.wait(spawnResult.value.id);
        expect(waitResult.ok).toBe(true);
        if (waitResult.ok) {
          expect(waitResult.value.approved).toBe(true);
          expect(waitResult.value.agentType).toBe('architecture-enforcer');
        }
      }
    });

    it('should return error for unknown process', async () => {
      const result = await executor.wait('unknown-id');
      expect(result.ok).toBe(false);
    });
  });

  describe('kill()', () => {
    it('should remove process', async () => {
      const spawnResult = await executor.spawn(testConfig);
      expect(spawnResult.ok).toBe(true);
      if (spawnResult.ok) {
        const killResult = await executor.kill(spawnResult.value.id);
        expect(killResult.ok).toBe(true);

        const statusResult = await executor.status(spawnResult.value.id);
        expect(statusResult.ok).toBe(false);
      }
    });
  });
});
```

- [ ] **Step 2: Run test**

```bash
cd packages/core && pnpm test tests/feedback/executor/noop.test.ts
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/core/tests/feedback/executor/noop.test.ts
git commit -m "test(feedback): add NoOpExecutor tests"
```

---

## Chunk 3: Action Logging

### Task 6: Implement AgentActionEmitter

**Files:**
- Create: `packages/core/src/feedback/logging/emitter.ts`
- Create: `packages/core/tests/feedback/logging/emitter.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// packages/core/tests/feedback/logging/emitter.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AgentActionEmitter,
  logAgentAction,
  trackAction,
  getActionEmitter,
} from '../../../src/feedback/logging/emitter';
import { resetFeedbackConfig, configureFeedback } from '../../../src/feedback/config';
import { NoOpSink } from '../../../src/feedback/logging/sink';

describe('AgentActionEmitter', () => {
  let emitter: AgentActionEmitter;

  beforeEach(() => {
    emitter = new AgentActionEmitter();
  });

  describe('on() / emit()', () => {
    it('should call handler when event is emitted', () => {
      const handler = vi.fn();
      emitter.on('action:completed', handler);

      const event = {
        type: 'action:completed' as const,
        action: {
          id: 'test',
          type: 'self-review' as const,
          timestamp: new Date().toISOString(),
          status: 'completed' as const,
          context: { trigger: 'manual' as const },
        },
        timestamp: new Date().toISOString(),
      };

      emitter.emit(event);
      expect(handler).toHaveBeenCalledWith(event);
    });

    it('should support wildcard listener', () => {
      const handler = vi.fn();
      emitter.on('action:*', handler);

      emitter.emit({
        type: 'action:started',
        action: {
          id: 'test',
          type: 'self-review',
          timestamp: new Date().toISOString(),
          status: 'started',
          context: { trigger: 'manual' },
        },
        timestamp: new Date().toISOString(),
      });

      emitter.emit({
        type: 'action:completed',
        action: {
          id: 'test',
          type: 'self-review',
          timestamp: new Date().toISOString(),
          status: 'completed',
          context: { trigger: 'manual' },
        },
        timestamp: new Date().toISOString(),
      });

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('should return unsubscribe function', () => {
      const handler = vi.fn();
      const unsubscribe = emitter.on('action:completed', handler);

      unsubscribe();

      emitter.emit({
        type: 'action:completed',
        action: {
          id: 'test',
          type: 'self-review',
          timestamp: new Date().toISOString(),
          status: 'completed',
          context: { trigger: 'manual' },
        },
        timestamp: new Date().toISOString(),
      });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('once()', () => {
    it('should only call handler once', () => {
      const handler = vi.fn();
      emitter.once('action:completed', handler);

      const event = {
        type: 'action:completed' as const,
        action: {
          id: 'test',
          type: 'self-review' as const,
          timestamp: new Date().toISOString(),
          status: 'completed' as const,
          context: { trigger: 'manual' as const },
        },
        timestamp: new Date().toISOString(),
      };

      emitter.emit(event);
      emitter.emit(event);

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('listenerCount()', () => {
    it('should return correct count', () => {
      emitter.on('action:completed', () => {});
      emitter.on('action:completed', () => {});
      emitter.on('action:failed', () => {});

      expect(emitter.listenerCount('action:completed')).toBe(2);
      expect(emitter.listenerCount('action:failed')).toBe(1);
      expect(emitter.listenerCount('action:started')).toBe(0);
    });
  });

  describe('removeAllListeners()', () => {
    it('should remove all listeners', () => {
      emitter.on('action:completed', () => {});
      emitter.on('action:failed', () => {});

      emitter.removeAllListeners();

      expect(emitter.listenerCount('action:completed')).toBe(0);
      expect(emitter.listenerCount('action:failed')).toBe(0);
    });
  });
});

describe('logAgentAction()', () => {
  beforeEach(() => {
    resetFeedbackConfig();
    configureFeedback({ sinks: [new NoOpSink()] });
  });

  it('should create action with id and timestamp', async () => {
    const result = await logAgentAction({
      type: 'self-review',
      status: 'completed',
      context: { trigger: 'manual' },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id).toBeDefined();
      expect(result.value.timestamp).toBeDefined();
    }
  });
});

describe('trackAction()', () => {
  beforeEach(() => {
    resetFeedbackConfig();
    configureFeedback({ sinks: [new NoOpSink()] });
  });

  it('should track action lifecycle', async () => {
    const tracker = trackAction('self-review', { trigger: 'ci' });

    expect(tracker.action.status).toBe('started');

    const result = await tracker.complete({
      outcome: 'success',
      summary: 'All checks passed',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('completed');
      expect(result.value.duration).toBeDefined();
    }
  });

  it('should track failures', async () => {
    const tracker = trackAction('self-review', { trigger: 'manual' });

    const result = await tracker.fail({
      code: 'REVIEW_ERROR',
      message: 'Something went wrong',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('failed');
      expect(result.value.error?.code).toBe('REVIEW_ERROR');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/core && pnpm test tests/feedback/logging/emitter.test.ts
```

Expected: FAIL - Cannot find module

- [ ] **Step 3: Implement emitter.ts**

```typescript
// packages/core/src/feedback/logging/emitter.ts
import { Ok } from '../../shared/result';
import type { Result } from '../../shared/result';
import type {
  ActionType,
  AgentAction,
  ActionContext,
  ActionResult,
  ActionEventType,
  ActionEvent,
  ActionEventHandler,
  ActionTracker,
  FeedbackError,
} from '../types';
import { getFeedbackConfig } from '../config';

export class AgentActionEmitter {
  private listeners = new Map<ActionEventType, Set<ActionEventHandler>>();

  on(eventType: ActionEventType, handler: ActionEventHandler): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(handler);

    return () => this.off(eventType, handler);
  }

  once(eventType: ActionEventType, handler: ActionEventHandler): () => void {
    const wrappedHandler: ActionEventHandler = (event) => {
      this.off(eventType, wrappedHandler);
      return handler(event);
    };
    return this.on(eventType, wrappedHandler);
  }

  off(eventType: ActionEventType, handler: ActionEventHandler): void {
    this.listeners.get(eventType)?.delete(handler);
  }

  emit(event: ActionEvent): void {
    // Emit to specific listeners
    this.listeners.get(event.type)?.forEach((handler) => {
      try {
        handler(event);
      } catch (e) {
        console.error('Error in action event handler:', e);
      }
    });

    // Emit to wildcard listeners
    if (event.type !== 'action:*') {
      this.listeners.get('action:*')?.forEach((handler) => {
        try {
          handler(event);
        } catch (e) {
          console.error('Error in wildcard action event handler:', e);
        }
      });
    }
  }

  listenerCount(eventType: ActionEventType): number {
    return this.listeners.get(eventType)?.size ?? 0;
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }
}

// Global emitter instance
let globalEmitter: AgentActionEmitter | null = null;

export function getActionEmitter(): AgentActionEmitter {
  if (!globalEmitter) {
    globalEmitter = new AgentActionEmitter();
  }
  return globalEmitter;
}

export async function logAgentAction(
  action: Omit<AgentAction, 'id' | 'timestamp'>
): Promise<Result<AgentAction, FeedbackError>> {
  const fullAction: AgentAction = {
    ...action,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  };

  const config = getFeedbackConfig();

  // Emit event
  if (config.emitEvents) {
    const eventType: ActionEventType =
      action.status === 'completed'
        ? 'action:completed'
        : action.status === 'failed'
          ? 'action:failed'
          : 'action:started';

    getActionEmitter().emit({
      type: eventType,
      action: fullAction,
      timestamp: fullAction.timestamp,
    });
  }

  // Write to sinks
  if (config.sinks) {
    for (const sink of config.sinks) {
      await sink.write(fullAction);
    }
  }

  return Ok(fullAction);
}

export function trackAction(
  type: ActionType,
  context: ActionContext
): ActionTracker {
  const startTime = Date.now();
  const action: AgentAction = {
    id: crypto.randomUUID(),
    type,
    timestamp: new Date().toISOString(),
    status: 'started',
    context,
  };

  // Log start
  const config = getFeedbackConfig();
  if (config.emitEvents) {
    getActionEmitter().emit({
      type: 'action:started',
      action,
      timestamp: action.timestamp,
    });
  }

  return {
    get action() {
      return action;
    },

    async complete(result: ActionResult): Promise<Result<AgentAction, FeedbackError>> {
      action.status = 'completed';
      action.duration = Date.now() - startTime;
      action.result = result;

      return logAgentAction(action);
    },

    async fail(error: { code: string; message: string }): Promise<Result<AgentAction, FeedbackError>> {
      action.status = 'failed';
      action.duration = Date.now() - startTime;
      action.error = error;

      return logAgentAction(action);
    },
  };
}
```

- [ ] **Step 4: Create NoOpSink**

```typescript
// packages/core/src/feedback/logging/sink.ts
import { Ok } from '../../shared/result';
import type { Result } from '../../shared/result';
import type { ActionSink, AgentAction, FeedbackError } from '../types';

export class NoOpSink implements ActionSink {
  readonly name = 'noop';

  async write(): Promise<Result<void, FeedbackError>> {
    return Ok(undefined);
  }
}
```

- [ ] **Step 5: Run test**

```bash
cd packages/core && pnpm test tests/feedback/logging/emitter.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/feedback/logging/emitter.ts packages/core/src/feedback/logging/sink.ts packages/core/tests/feedback/logging/emitter.test.ts
git commit -m "feat(feedback): implement AgentActionEmitter and action tracking"
```

---

### Task 7: Implement ConsoleSink with tests

**Files:**
- Modify: `packages/core/src/feedback/logging/console-sink.ts`
- Create: `packages/core/tests/feedback/logging/console-sink.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// packages/core/tests/feedback/logging/console-sink.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConsoleSink } from '../../../src/feedback/logging/console-sink';
import type { AgentAction } from '../../../src/feedback/types';

describe('ConsoleSink', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  const testAction: AgentAction = {
    id: 'test-id',
    type: 'self-review',
    timestamp: '2026-03-12T10:00:00.000Z',
    status: 'completed',
    duration: 150,
    context: { trigger: 'manual' },
    result: { outcome: 'success', summary: 'All checks passed' },
  };

  it('should have name "console"', () => {
    const sink = new ConsoleSink();
    expect(sink.name).toBe('console');
  });

  describe('format: pretty', () => {
    it('should format completed action with checkmark', async () => {
      const sink = new ConsoleSink({ format: 'pretty' });
      await sink.write(testAction);

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0][0];
      expect(output).toContain('✓');
      expect(output).toContain('self-review');
      expect(output).toContain('150ms');
    });

    it('should format failed action with X', async () => {
      const sink = new ConsoleSink({ format: 'pretty' });
      await sink.write({ ...testAction, status: 'failed' });

      const output = consoleSpy.mock.calls[0][0];
      expect(output).toContain('✗');
    });

    it('should format started action with arrow', async () => {
      const sink = new ConsoleSink({ format: 'pretty' });
      await sink.write({ ...testAction, status: 'started', duration: undefined });

      const output = consoleSpy.mock.calls[0][0];
      expect(output).toContain('→');
    });
  });

  describe('format: json', () => {
    it('should output JSON', async () => {
      const sink = new ConsoleSink({ format: 'json' });
      await sink.write(testAction);

      const output = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.id).toBe('test-id');
      expect(parsed.type).toBe('self-review');
    });
  });

  it('should return Ok result', async () => {
    const sink = new ConsoleSink();
    const result = await sink.write(testAction);
    expect(result.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run test**

```bash
cd packages/core && pnpm test tests/feedback/logging/console-sink.test.ts
```

Expected: PASS (implementation exists)

- [ ] **Step 3: Commit**

```bash
git add packages/core/tests/feedback/logging/console-sink.test.ts
git commit -m "test(feedback): add ConsoleSink tests"
```

---

### Task 8: Implement FileSink

**Files:**
- Create: `packages/core/src/feedback/logging/file-sink.ts`
- Create: `packages/core/tests/feedback/logging/file-sink.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// packages/core/tests/feedback/logging/file-sink.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FileSink } from '../../../src/feedback/logging/file-sink';
import { existsSync, unlinkSync, readFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { AgentAction } from '../../../src/feedback/types';

describe('FileSink', () => {
  const testDir = join(__dirname, '../../../tests/fixtures/feedback/temp');
  const testFile = join(testDir, 'actions.jsonl');

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    if (existsSync(testFile)) {
      unlinkSync(testFile);
    }
  });

  afterEach(async () => {
    if (existsSync(testFile)) {
      unlinkSync(testFile);
    }
  });

  const testAction: AgentAction = {
    id: 'test-id',
    type: 'self-review',
    timestamp: '2026-03-12T10:00:00.000Z',
    status: 'completed',
    context: { trigger: 'manual' },
  };

  it('should have name "file"', () => {
    const sink = new FileSink(testFile);
    expect(sink.name).toBe('file');
  });

  it('should write action to file as JSON line', async () => {
    const sink = new FileSink(testFile);
    const result = await sink.write(testAction);
    await sink.close?.();

    expect(result.ok).toBe(true);
    expect(existsSync(testFile)).toBe(true);

    const content = readFileSync(testFile, 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines.length).toBe(1);

    const parsed = JSON.parse(lines[0]);
    expect(parsed.id).toBe('test-id');
  });

  it('should append multiple actions', async () => {
    const sink = new FileSink(testFile, { mode: 'append' });

    await sink.write(testAction);
    await sink.write({ ...testAction, id: 'test-id-2' });
    await sink.close?.();

    const content = readFileSync(testFile, 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines.length).toBe(2);
  });

  it('should flush buffered writes', async () => {
    const sink = new FileSink(testFile, { bufferSize: 10 });

    await sink.write(testAction);
    await sink.flush?.();

    expect(existsSync(testFile)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/core && pnpm test tests/feedback/logging/file-sink.test.ts
```

Expected: FAIL - Cannot find module

- [ ] **Step 3: Implement FileSink**

```typescript
// packages/core/src/feedback/logging/file-sink.ts
import { Ok, Err } from '../../shared/result';
import type { Result } from '../../shared/result';
import type { ActionSink, AgentAction, FeedbackError } from '../types';
import { appendFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export interface FileSinkOptions {
  mode?: 'append' | 'overwrite';
  bufferSize?: number;
  flushInterval?: number;
}

export class FileSink implements ActionSink {
  readonly name = 'file';
  private filePath: string;
  private options: FileSinkOptions;
  private buffer: string[] = [];
  private flushTimer?: NodeJS.Timeout;
  private initialized = false;

  constructor(filePath: string, options: FileSinkOptions = {}) {
    this.filePath = filePath;
    this.options = {
      mode: options.mode ?? 'append',
      bufferSize: options.bufferSize ?? 1,
      flushInterval: options.flushInterval,
    };

    if (this.options.flushInterval) {
      this.flushTimer = setInterval(() => {
        this.flush();
      }, this.options.flushInterval);
    }
  }

  private ensureDirectory(): void {
    if (!this.initialized) {
      const dir = dirname(this.filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      this.initialized = true;
    }
  }

  async write(action: AgentAction): Promise<Result<void, FeedbackError>> {
    try {
      const line = JSON.stringify(action) + '\n';
      this.buffer.push(line);

      if (this.buffer.length >= (this.options.bufferSize ?? 1)) {
        return this.flush();
      }

      return Ok(undefined);
    } catch (error) {
      return Err({
        code: 'SINK_ERROR',
        message: 'Failed to write action to file',
        details: { reason: String(error) },
        suggestions: ['Check file permissions', 'Verify disk space'],
      });
    }
  }

  async flush(): Promise<Result<void, FeedbackError>> {
    if (this.buffer.length === 0) {
      return Ok(undefined);
    }

    try {
      this.ensureDirectory();
      const content = this.buffer.join('');
      this.buffer = [];

      if (this.options.mode === 'overwrite' && !existsSync(this.filePath)) {
        writeFileSync(this.filePath, content);
      } else {
        appendFileSync(this.filePath, content);
      }

      return Ok(undefined);
    } catch (error) {
      return Err({
        code: 'SINK_ERROR',
        message: 'Failed to flush actions to file',
        details: { reason: String(error) },
        suggestions: ['Check file permissions', 'Verify disk space'],
      });
    }
  }

  async close(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    await this.flush();
  }
}
```

- [ ] **Step 4: Run test**

```bash
cd packages/core && pnpm test tests/feedback/logging/file-sink.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/feedback/logging/file-sink.ts packages/core/tests/feedback/logging/file-sink.test.ts
git commit -m "feat(feedback): implement FileSink for action logging"
```

---

## Chunk 4: Review System

### Task 9: Implement diff-analyzer

**Files:**
- Create: `packages/core/src/feedback/review/diff-analyzer.ts`
- Create: `packages/core/tests/feedback/review/diff-analyzer.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// packages/core/tests/feedback/review/diff-analyzer.test.ts
import { describe, it, expect } from 'vitest';
import { parseDiff, analyzeDiff } from '../../../src/feedback/review/diff-analyzer';

describe('parseDiff()', () => {
  const sampleDiff = `diff --git a/src/index.ts b/src/index.ts
index 1234567..abcdefg 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,5 +1,7 @@
 import { foo } from './foo';
+import { bar } from './bar';

 export function main() {
+  console.log('hello');
   foo();
+  bar();
 }`;

  it('should parse diff into CodeChanges', () => {
    const result = parseDiff(sampleDiff);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.diff).toBe(sampleDiff);
      expect(result.value.files.length).toBe(1);
      expect(result.value.files[0].path).toBe('src/index.ts');
      expect(result.value.files[0].status).toBe('modified');
      expect(result.value.files[0].additions).toBe(3);
      expect(result.value.files[0].deletions).toBe(0);
    }
  });

  it('should handle added files', () => {
    const addedDiff = `diff --git a/src/new.ts b/src/new.ts
new file mode 100644
index 0000000..1234567
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1,3 @@
+export function newFunc() {
+  return 42;
+}`;

    const result = parseDiff(addedDiff);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.files[0].status).toBe('added');
    }
  });

  it('should handle deleted files', () => {
    const deletedDiff = `diff --git a/src/old.ts b/src/old.ts
deleted file mode 100644
index 1234567..0000000
--- a/src/old.ts
+++ /dev/null
@@ -1,3 +0,0 @@
-export function oldFunc() {
-  return 42;
-}`;

    const result = parseDiff(deletedDiff);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.files[0].status).toBe('deleted');
    }
  });

  it('should handle empty diff', () => {
    const result = parseDiff('');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.files.length).toBe(0);
    }
  });
});

describe('analyzeDiff()', () => {
  it('should detect console.log as forbidden pattern', async () => {
    const changes = {
      diff: '+  console.log("debug");',
      files: [{ path: 'src/index.ts', status: 'modified' as const, additions: 1, deletions: 0 }],
    };

    const result = await analyzeDiff(changes, {
      enabled: true,
      forbiddenPatterns: [
        { pattern: 'console.log', message: 'Remove console.log', severity: 'warning' },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBeGreaterThan(0);
      expect(result.value.some(item => item.check.includes('console.log'))).toBe(true);
    }
  });

  it('should warn on large PRs', async () => {
    const changes = {
      diff: '',
      files: Array.from({ length: 20 }, (_, i) => ({
        path: `src/file${i}.ts`,
        status: 'modified' as const,
        additions: 50,
        deletions: 10,
      })),
    };

    const result = await analyzeDiff(changes, {
      enabled: true,
      maxChangedFiles: 10,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.some(item => item.check.includes('files'))).toBe(true);
    }
  });

  it('should return empty array when disabled', async () => {
    const changes = {
      diff: '+  console.log("test");',
      files: [{ path: 'src/index.ts', status: 'modified' as const, additions: 1, deletions: 0 }],
    };

    const result = await analyzeDiff(changes, { enabled: false });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/core && pnpm test tests/feedback/review/diff-analyzer.test.ts
```

Expected: FAIL - Cannot find module

- [ ] **Step 3: Implement diff-analyzer.ts**

```typescript
// packages/core/src/feedback/review/diff-analyzer.ts
import { Ok, Err } from '../../shared/result';
import type { Result } from '../../shared/result';
import type {
  CodeChanges,
  ChangedFile,
  ReviewItem,
  SelfReviewConfig,
  FeedbackError,
} from '../types';

export function parseDiff(diff: string): Result<CodeChanges, FeedbackError> {
  try {
    if (!diff.trim()) {
      return Ok({ diff, files: [] });
    }

    const files: ChangedFile[] = [];
    const diffRegex = /diff --git a\/(.+?) b\/(.+?)(?:\n|$)/g;
    const newFileRegex = /new file mode/;
    const deletedFileRegex = /deleted file mode/;
    const additionRegex = /^\+(?!\+\+)/gm;
    const deletionRegex = /^-(?!--)/gm;

    let match;
    const diffParts = diff.split(/(?=diff --git)/);

    for (const part of diffParts) {
      if (!part.trim()) continue;

      const headerMatch = /diff --git a\/(.+?) b\/(.+?)(?:\n|$)/.exec(part);
      if (!headerMatch) continue;

      const filePath = headerMatch[2];

      let status: ChangedFile['status'] = 'modified';
      if (newFileRegex.test(part)) {
        status = 'added';
      } else if (deletedFileRegex.test(part)) {
        status = 'deleted';
      } else if (part.includes('rename from')) {
        status = 'renamed';
      }

      const additions = (part.match(additionRegex) || []).length;
      const deletions = (part.match(deletionRegex) || []).length;

      files.push({
        path: filePath,
        status,
        additions,
        deletions,
      });
    }

    return Ok({ diff, files });
  } catch (error) {
    return Err({
      code: 'DIFF_PARSE_ERROR',
      message: 'Failed to parse git diff',
      details: { reason: String(error) },
      suggestions: ['Ensure diff is in valid git diff format'],
    });
  }
}

export async function analyzeDiff(
  changes: CodeChanges,
  options: SelfReviewConfig['diffAnalysis']
): Promise<Result<ReviewItem[], FeedbackError>> {
  if (!options?.enabled) {
    return Ok([]);
  }

  const items: ReviewItem[] = [];
  let itemId = 0;

  // Check forbidden patterns
  if (options.forbiddenPatterns) {
    for (const forbidden of options.forbiddenPatterns) {
      const pattern = typeof forbidden.pattern === 'string'
        ? new RegExp(forbidden.pattern, 'g')
        : forbidden.pattern;

      if (pattern.test(changes.diff)) {
        items.push({
          id: `diff-${++itemId}`,
          category: 'diff',
          check: `Forbidden pattern: ${forbidden.pattern}`,
          passed: false,
          severity: forbidden.severity,
          details: forbidden.message,
          suggestion: `Remove occurrences of ${forbidden.pattern}`,
        });
      }
    }
  }

  // Check max changed files
  if (options.maxChangedFiles && changes.files.length > options.maxChangedFiles) {
    items.push({
      id: `diff-${++itemId}`,
      category: 'diff',
      check: `PR size: ${changes.files.length} files changed`,
      passed: false,
      severity: 'warning',
      details: `This PR changes ${changes.files.length} files, which exceeds the recommended maximum of ${options.maxChangedFiles}`,
      suggestion: 'Consider breaking this into smaller PRs',
    });
  }

  // Check max file size
  if (options.maxFileSize) {
    for (const file of changes.files) {
      const totalLines = file.additions + file.deletions;
      if (totalLines > options.maxFileSize) {
        items.push({
          id: `diff-${++itemId}`,
          category: 'diff',
          check: `File size: ${file.path}`,
          passed: false,
          severity: 'warning',
          details: `File has ${totalLines} lines changed, exceeding limit of ${options.maxFileSize}`,
          file: file.path,
          suggestion: 'Consider splitting this file into smaller modules',
        });
      }
    }
  }

  // Check for test coverage (new .ts files without corresponding .test.ts)
  if (options.checkTestCoverage) {
    const addedSourceFiles = changes.files
      .filter(f => f.status === 'added' && f.path.endsWith('.ts') && !f.path.includes('.test.'));

    const testFiles = changes.files
      .filter(f => f.path.includes('.test.'));

    for (const sourceFile of addedSourceFiles) {
      const expectedTestPath = sourceFile.path.replace('.ts', '.test.ts');
      const hasTest = testFiles.some(t =>
        t.path.includes(expectedTestPath) ||
        t.path.includes(sourceFile.path.replace('.ts', ''))
      );

      if (!hasTest) {
        items.push({
          id: `diff-${++itemId}`,
          category: 'diff',
          check: `Test coverage: ${sourceFile.path}`,
          passed: false,
          severity: 'warning',
          details: 'New source file added without corresponding test file',
          file: sourceFile.path,
          suggestion: `Add tests in ${expectedTestPath}`,
        });
      }
    }
  }

  return Ok(items);
}
```

- [ ] **Step 4: Run test**

```bash
cd packages/core && pnpm test tests/feedback/review/diff-analyzer.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/feedback/review/diff-analyzer.ts packages/core/tests/feedback/review/diff-analyzer.test.ts
git commit -m "feat(feedback): implement diff parsing and analysis"
```

---

### Task 10: Implement ChecklistBuilder

**Files:**
- Create: `packages/core/src/feedback/review/checklist.ts`
- Create: `packages/core/tests/feedback/review/checklist.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// packages/core/tests/feedback/review/checklist.test.ts
import { describe, it, expect } from 'vitest';
import { ChecklistBuilder } from '../../../src/feedback/review/checklist';
import type { CodeChanges, CustomRule } from '../../../src/feedback/types';
import { join } from 'path';

describe('ChecklistBuilder', () => {
  const rootDir = join(__dirname, '../../fixtures/feedback');
  const changes: CodeChanges = {
    diff: '+console.log("test");',
    files: [{ path: 'src/index.ts', status: 'modified', additions: 1, deletions: 0 }],
  };

  it('should build and run empty checklist', async () => {
    const builder = new ChecklistBuilder(rootDir);
    const result = await builder.run(changes);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.items).toEqual([]);
      expect(result.value.passed).toBe(true);
    }
  });

  it('should add custom rules', async () => {
    const customRule: CustomRule = {
      id: 'no-console',
      name: 'No console.log',
      description: 'Disallow console.log',
      severity: 'warning',
      check: async (changes) => ({
        passed: !changes.diff.includes('console.log'),
        details: 'Found console.log in diff',
      }),
    };

    const builder = new ChecklistBuilder(rootDir).addRule(customRule);
    const result = await builder.run(changes);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.items.length).toBe(1);
      expect(result.value.items[0].passed).toBe(false);
      expect(result.value.passed).toBe(false);
    }
  });

  it('should add multiple rules', async () => {
    const rules: CustomRule[] = [
      {
        id: 'rule-1',
        name: 'Rule 1',
        description: 'Always passes',
        severity: 'info',
        check: async () => ({ passed: true, details: 'OK' }),
      },
      {
        id: 'rule-2',
        name: 'Rule 2',
        description: 'Always passes',
        severity: 'info',
        check: async () => ({ passed: true, details: 'OK' }),
      },
    ];

    const builder = new ChecklistBuilder(rootDir).addRules(rules);
    const result = await builder.run(changes);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.items.length).toBe(2);
    }
  });

  it('should include diff analysis', async () => {
    const builder = new ChecklistBuilder(rootDir)
      .withDiffAnalysis({
        enabled: true,
        forbiddenPatterns: [
          { pattern: 'console.log', message: 'No console.log', severity: 'warning' },
        ],
      });

    const result = await builder.run(changes);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.items.length).toBeGreaterThan(0);
    }
  });

  it('should calculate summary correctly', async () => {
    const rules: CustomRule[] = [
      {
        id: 'pass',
        name: 'Pass',
        description: 'Passes',
        severity: 'error',
        check: async () => ({ passed: true, details: 'OK' }),
      },
      {
        id: 'fail-error',
        name: 'Fail Error',
        description: 'Fails',
        severity: 'error',
        check: async () => ({ passed: false, details: 'Failed' }),
      },
      {
        id: 'fail-warning',
        name: 'Fail Warning',
        description: 'Warns',
        severity: 'warning',
        check: async () => ({ passed: false, details: 'Warning' }),
      },
    ];

    const builder = new ChecklistBuilder(rootDir).addRules(rules);
    const result = await builder.run(changes);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.summary.total).toBe(3);
      expect(result.value.summary.passed).toBe(1);
      expect(result.value.summary.failed).toBe(2);
      expect(result.value.summary.errors).toBe(1);
      expect(result.value.summary.warnings).toBe(1);
      expect(result.value.passed).toBe(false);
    }
  });

  it('should support method chaining', () => {
    const builder = new ChecklistBuilder(rootDir)
      .withHarnessChecks({ context: true })
      .withDiffAnalysis({ enabled: true })
      .addRule({
        id: 'test',
        name: 'Test',
        description: 'Test',
        severity: 'info',
        check: async () => ({ passed: true, details: 'OK' }),
      });

    expect(builder).toBeInstanceOf(ChecklistBuilder);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/core && pnpm test tests/feedback/review/checklist.test.ts
```

Expected: FAIL - Cannot find module

- [ ] **Step 3: Implement checklist.ts**

```typescript
// packages/core/src/feedback/review/checklist.ts
import { Ok } from '../../shared/result';
import type { Result } from '../../shared/result';
import type {
  CodeChanges,
  ReviewItem,
  ReviewChecklist,
  SelfReviewConfig,
  CustomRule,
  FeedbackError,
} from '../types';
import { analyzeDiff } from './diff-analyzer';

export class ChecklistBuilder {
  private rootDir: string;
  private harnessOptions?: SelfReviewConfig['harness'];
  private customRules: CustomRule[] = [];
  private diffOptions?: SelfReviewConfig['diffAnalysis'];

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  withHarnessChecks(options?: SelfReviewConfig['harness']): this {
    this.harnessOptions = options ?? { context: true, constraints: true, entropy: true };
    return this;
  }

  addRule(rule: CustomRule): this {
    this.customRules.push(rule);
    return this;
  }

  addRules(rules: CustomRule[]): this {
    this.customRules.push(...rules);
    return this;
  }

  withDiffAnalysis(options: SelfReviewConfig['diffAnalysis']): this {
    this.diffOptions = options;
    return this;
  }

  async run(changes: CodeChanges): Promise<Result<ReviewChecklist, FeedbackError>> {
    const startTime = Date.now();
    const items: ReviewItem[] = [];

    // Run harness checks
    // Note: Harness module integration is deferred to a follow-up task.
    // This adds placeholder items indicating which checks would run.
    if (this.harnessOptions) {
      if (this.harnessOptions.context) {
        items.push({
          id: 'harness-context',
          category: 'harness',
          check: 'Context Engineering (AGENTS.md, doc coverage)',
          passed: true,
          severity: 'info',
          details: 'Harness context validation not yet integrated. See Module 2 (context/).',
          suggestion: 'Integrate with validateAgentsMap(), checkDocCoverage() from context module',
        });
      }
      if (this.harnessOptions.constraints) {
        items.push({
          id: 'harness-constraints',
          category: 'harness',
          check: 'Architectural Constraints (dependencies, boundaries)',
          passed: true,
          severity: 'info',
          details: 'Harness constraints validation not yet integrated. See Module 3 (constraints/).',
          suggestion: 'Integrate with validateDependencies(), detectCircularDeps() from constraints module',
        });
      }
      if (this.harnessOptions.entropy) {
        items.push({
          id: 'harness-entropy',
          category: 'harness',
          check: 'Entropy Management (drift, dead code)',
          passed: true,
          severity: 'info',
          details: 'Harness entropy validation not yet integrated. See Module 4 (entropy/).',
          suggestion: 'Integrate with EntropyAnalyzer from entropy module',
        });
      }
    }

    // Run custom rules
    for (const rule of this.customRules) {
      try {
        const result = await rule.check(changes, this.rootDir);
        items.push({
          id: rule.id,
          category: 'custom',
          check: rule.name,
          passed: result.passed,
          severity: rule.severity,
          details: result.details,
          suggestion: result.suggestion,
          file: result.file,
          line: result.line,
        });
      } catch (error) {
        items.push({
          id: rule.id,
          category: 'custom',
          check: rule.name,
          passed: false,
          severity: 'error',
          details: `Rule execution failed: ${String(error)}`,
        });
      }
    }

    // Run diff analysis
    if (this.diffOptions) {
      const diffResult = await analyzeDiff(changes, this.diffOptions);
      if (diffResult.ok) {
        items.push(...diffResult.value);
      }
    }

    // Calculate summary
    const passed = items.filter(i => i.passed).length;
    const failed = items.filter(i => !i.passed).length;
    const errors = items.filter(i => !i.passed && i.severity === 'error').length;
    const warnings = items.filter(i => !i.passed && i.severity === 'warning').length;

    const checklist: ReviewChecklist = {
      items,
      passed: errors === 0, // Pass if no errors (warnings allowed)
      summary: {
        total: items.length,
        passed,
        failed,
        errors,
        warnings,
      },
      duration: Date.now() - startTime,
    };

    return Ok(checklist);
  }
}
```

- [ ] **Step 4: Run test**

```bash
cd packages/core && pnpm test tests/feedback/review/checklist.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/feedback/review/checklist.ts packages/core/tests/feedback/review/checklist.test.ts
git commit -m "feat(feedback): implement ChecklistBuilder for custom review rules"
```

---

### Task 11: Implement createSelfReview

**Files:**
- Create: `packages/core/src/feedback/review/self-review.ts`
- Create: `packages/core/tests/feedback/review/self-review.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// packages/core/tests/feedback/review/self-review.test.ts
import { describe, it, expect } from 'vitest';
import { createSelfReview } from '../../../src/feedback/review/self-review';
import type { CodeChanges } from '../../../src/feedback/types';
import { join } from 'path';

describe('createSelfReview()', () => {
  const rootDir = join(__dirname, '../../fixtures/feedback');
  const changes: CodeChanges = {
    diff: '+export function test() { return 42; }',
    files: [{ path: 'src/test.ts', status: 'added', additions: 1, deletions: 0 }],
  };

  it('should create review with empty config', async () => {
    const result = await createSelfReview(changes, { rootDir });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.items).toBeDefined();
      expect(result.value.summary).toBeDefined();
      expect(result.value.duration).toBeGreaterThanOrEqual(0);
    }
  });

  it('should include diff analysis when enabled', async () => {
    const changesWithConsole: CodeChanges = {
      diff: '+console.log("debug");',
      files: [{ path: 'src/index.ts', status: 'modified', additions: 1, deletions: 0 }],
    };

    const result = await createSelfReview(changesWithConsole, {
      rootDir,
      diffAnalysis: {
        enabled: true,
        forbiddenPatterns: [
          { pattern: 'console.log', message: 'Remove console.log', severity: 'warning' },
        ],
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.items.length).toBeGreaterThan(0);
    }
  });

  it('should include custom rules', async () => {
    const result = await createSelfReview(changes, {
      rootDir,
      customRules: [
        {
          id: 'custom-1',
          name: 'Custom Check',
          description: 'A custom check',
          severity: 'info',
          check: async () => ({ passed: true, details: 'All good' }),
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.items.some(i => i.id === 'custom-1')).toBe(true);
    }
  });

  it('should pass when no errors', async () => {
    const result = await createSelfReview(changes, {
      rootDir,
      customRules: [
        {
          id: 'pass',
          name: 'Passing Check',
          description: 'Always passes',
          severity: 'error',
          check: async () => ({ passed: true, details: 'OK' }),
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.passed).toBe(true);
    }
  });

  it('should fail when errors present', async () => {
    const result = await createSelfReview(changes, {
      rootDir,
      customRules: [
        {
          id: 'fail',
          name: 'Failing Check',
          description: 'Always fails',
          severity: 'error',
          check: async () => ({ passed: false, details: 'Failed' }),
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.passed).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/core && pnpm test tests/feedback/review/self-review.test.ts
```

Expected: FAIL - Cannot find module

- [ ] **Step 3: Implement self-review.ts**

```typescript
// packages/core/src/feedback/review/self-review.ts
import type { Result } from '../../shared/result';
import type {
  CodeChanges,
  ReviewChecklist,
  SelfReviewConfig,
  FeedbackError,
} from '../types';
import { ChecklistBuilder } from './checklist';

export async function createSelfReview(
  changes: CodeChanges,
  config: SelfReviewConfig
): Promise<Result<ReviewChecklist, FeedbackError>> {
  const builder = new ChecklistBuilder(config.rootDir);

  // Add harness checks if configured
  if (config.harness) {
    builder.withHarnessChecks(config.harness);
  }

  // Add custom rules
  if (config.customRules) {
    builder.addRules(config.customRules);
  }

  // Add diff analysis
  if (config.diffAnalysis) {
    builder.withDiffAnalysis(config.diffAnalysis);
  }

  return builder.run(changes);
}

// Re-export ChecklistBuilder for direct use
export { ChecklistBuilder } from './checklist';
```

- [ ] **Step 4: Run test**

```bash
cd packages/core && pnpm test tests/feedback/review/self-review.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/feedback/review/self-review.ts packages/core/tests/feedback/review/self-review.test.ts
git commit -m "feat(feedback): implement createSelfReview function"
```

---

### Task 12: Implement requestPeerReview

**Files:**
- Create: `packages/core/src/feedback/review/peer-review.ts`
- Create: `packages/core/tests/feedback/review/peer-review.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// packages/core/tests/feedback/review/peer-review.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { requestPeerReview, requestMultiplePeerReviews } from '../../../src/feedback/review/peer-review';
import { configureFeedback, resetFeedbackConfig } from '../../../src/feedback/config';
import { NoOpExecutor } from '../../../src/feedback/executor/noop';
import { NoOpSink } from '../../../src/feedback/logging/sink';

describe('requestPeerReview()', () => {
  beforeEach(() => {
    resetFeedbackConfig();
    configureFeedback({
      executor: new NoOpExecutor(),
      sinks: [new NoOpSink()],
    });
  });

  it('should request review from architecture-enforcer', async () => {
    const result = await requestPeerReview('architecture-enforcer', {
      files: ['src/index.ts'],
      diff: 'test diff',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.agentType).toBe('architecture-enforcer');
      expect(result.value.approved).toBe(true); // NoOp always approves
    }
  });

  it('should request review with options', async () => {
    const result = await requestPeerReview(
      'test-reviewer',
      { files: ['src/test.ts'] },
      { skills: ['test-skill'], timeout: 60000 }
    );

    expect(result.ok).toBe(true);
  });

  it('should handle custom agent type', async () => {
    const result = await requestPeerReview(
      'custom',
      { files: ['src/index.ts'] },
      { customAgentType: 'my-custom-agent' }
    );

    expect(result.ok).toBe(true);
  });
});

describe('requestMultiplePeerReviews()', () => {
  beforeEach(() => {
    resetFeedbackConfig();
    configureFeedback({
      executor: new NoOpExecutor(),
      sinks: [new NoOpSink()],
    });
  });

  it('should request multiple reviews in parallel', async () => {
    const result = await requestMultiplePeerReviews([
      { agentType: 'architecture-enforcer', context: { files: ['src/a.ts'] } },
      { agentType: 'test-reviewer', context: { files: ['src/b.ts'] } },
    ]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(2);
      expect(result.value[0].agentType).toBe('architecture-enforcer');
      expect(result.value[1].agentType).toBe('test-reviewer');
    }
  });

  it('should return empty array for empty requests', async () => {
    const result = await requestMultiplePeerReviews([]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/core && pnpm test tests/feedback/review/peer-review.test.ts
```

Expected: FAIL - Cannot find module

- [ ] **Step 3: Implement peer-review.ts**

```typescript
// packages/core/src/feedback/review/peer-review.ts
import { Ok, Err } from '../../shared/result';
import type { Result } from '../../shared/result';
import type {
  AgentType,
  ReviewContext,
  PeerReview,
  PeerReviewOptions,
  FeedbackError,
} from '../types';
import { getFeedbackConfig } from '../config';
import { trackAction } from '../logging/emitter';

export async function requestPeerReview(
  agentType: AgentType,
  context: ReviewContext,
  options?: PeerReviewOptions
): Promise<Result<PeerReview, FeedbackError>> {
  const config = getFeedbackConfig();
  const executor = config.executor;

  if (!executor) {
    return Err({
      code: 'AGENT_SPAWN_ERROR',
      message: 'No agent executor configured',
      details: {},
      suggestions: ['Configure an AgentExecutor via configureFeedback()'],
    });
  }

  const tracker = trackAction('peer-review', {
    trigger: 'agent',
    files: context.files,
  });

  try {
    // Spawn the agent
    const spawnResult = await executor.spawn({
      type: agentType,
      customType: options?.customAgentType,
      context,
      skills: options?.skills,
      timeout: options?.timeout ?? config.defaultTimeout,
    });

    if (!spawnResult.ok) {
      await tracker.fail({ code: spawnResult.error.code, message: spawnResult.error.message });
      return spawnResult as Result<PeerReview, FeedbackError>;
    }

    // Wait for completion (default behavior)
    if (options?.wait !== false) {
      const waitResult = await executor.wait(
        spawnResult.value.id,
        options?.timeout ?? config.defaultTimeout
      );

      if (!waitResult.ok) {
        await tracker.fail({ code: waitResult.error.code, message: waitResult.error.message });
        return waitResult;
      }

      await tracker.complete({
        outcome: waitResult.value.approved ? 'success' : 'failure',
        summary: waitResult.value.approved
          ? 'Review approved'
          : `Review rejected: ${waitResult.value.comments.length} comments`,
        data: waitResult.value,
      });

      return waitResult;
    }

    // Return immediately without waiting
    await tracker.complete({
      outcome: 'success',
      summary: `Agent spawned: ${spawnResult.value.id}`,
      data: { processId: spawnResult.value.id },
    });

    // Return a placeholder review for non-wait case
    return Ok({
      agentId: spawnResult.value.id,
      agentType,
      approved: false, // Unknown until wait
      comments: [],
      suggestions: [],
      duration: 0,
      completedAt: '',
    });
  } catch (error) {
    await tracker.fail({
      code: 'AGENT_SPAWN_ERROR',
      message: String(error),
    });

    return Err({
      code: 'AGENT_SPAWN_ERROR',
      message: 'Failed to request peer review',
      details: { reason: String(error) },
      suggestions: ['Check executor configuration', 'Verify agent availability'],
    });
  }
}

export async function requestMultiplePeerReviews(
  requests: Array<{
    agentType: AgentType;
    context: ReviewContext;
    options?: PeerReviewOptions;
  }>
): Promise<Result<PeerReview[], FeedbackError>> {
  if (requests.length === 0) {
    return Ok([]);
  }

  const results = await Promise.all(
    requests.map(({ agentType, context, options }) =>
      requestPeerReview(agentType, context, options)
    )
  );

  // Check if any failed
  const firstError = results.find(r => !r.ok);
  if (firstError && !firstError.ok) {
    return Err(firstError.error);
  }

  // All succeeded
  return Ok(results.map(r => (r as { ok: true; value: PeerReview }).value));
}
```

- [ ] **Step 4: Run test**

```bash
cd packages/core && pnpm test tests/feedback/review/peer-review.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/feedback/review/peer-review.ts packages/core/tests/feedback/review/peer-review.test.ts
git commit -m "feat(feedback): implement peer review orchestration"
```

---

## Chunk 5: Module Integration

### Task 13: Create feedback/index.ts exports

**Files:**
- Create: `packages/core/src/feedback/index.ts`

- [ ] **Step 1: Write test for exports**

```typescript
// packages/core/tests/feedback/index.test.ts
import { describe, it, expect } from 'vitest';
import * as feedback from '../../src/feedback';

describe('Feedback Module Exports', () => {
  it('should export configuration functions', () => {
    expect(feedback.configureFeedback).toBeDefined();
    expect(feedback.getFeedbackConfig).toBeDefined();
    expect(feedback.resetFeedbackConfig).toBeDefined();
  });

  it('should export review functions', () => {
    expect(feedback.createSelfReview).toBeDefined();
    expect(feedback.requestPeerReview).toBeDefined();
    expect(feedback.requestMultiplePeerReviews).toBeDefined();
    expect(feedback.ChecklistBuilder).toBeDefined();
  });

  it('should export diff analyzer functions', () => {
    expect(feedback.parseDiff).toBeDefined();
    expect(feedback.analyzeDiff).toBeDefined();
  });

  it('should export NoOp implementations', () => {
    expect(feedback.NoOpTelemetryAdapter).toBeDefined();
    expect(feedback.NoOpExecutor).toBeDefined();
    expect(feedback.NoOpSink).toBeDefined();
  });

  it('should export sinks', () => {
    expect(feedback.ConsoleSink).toBeDefined();
    expect(feedback.FileSink).toBeDefined();
  });

  it('should export logging utilities', () => {
    expect(feedback.logAgentAction).toBeDefined();
    expect(feedback.trackAction).toBeDefined();
    expect(feedback.getActionEmitter).toBeDefined();
    expect(feedback.AgentActionEmitter).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/core && pnpm test tests/feedback/index.test.ts
```

Expected: FAIL

- [ ] **Step 3: Create index.ts**

```typescript
// packages/core/src/feedback/index.ts

// Configuration
export { configureFeedback, getFeedbackConfig, resetFeedbackConfig } from './config';
export type { FeedbackConfig } from './config';

// Types
export type {
  // Error
  FeedbackError,

  // Review types
  ReviewItem,
  ReviewChecklist,
  CodeChanges,
  ChangedFile,
  SelfReviewConfig,
  CustomRule,
  CustomRuleResult,
  ForbiddenPattern,
  PeerReviewOptions,

  // Agent types
  AgentType,
  AgentConfig,
  AgentProcess,
  ReviewContext,
  PeerReview,
  ReviewComment,

  // Telemetry types
  TimeRange,
  Metric,
  Span,
  SpanEvent,
  Trace,
  LogEntry,
  LogFilter,
  TelemetryHealth,
  TelemetryAdapter,

  // Executor types
  ExecutorHealth,
  AgentExecutor,

  // Logging types
  ActionType,
  AgentAction,
  ActionContext,
  ActionResult,
  ActionEventType,
  ActionEvent,
  ActionEventHandler,
  ActionSink,
  ActionTracker,
} from './types';

// Self-review
export { createSelfReview, ChecklistBuilder } from './review/self-review';
export { parseDiff, analyzeDiff } from './review/diff-analyzer';

// Peer review
export { requestPeerReview, requestMultiplePeerReviews } from './review/peer-review';

// Telemetry
export { NoOpTelemetryAdapter } from './telemetry/noop';

// Executor
export { NoOpExecutor } from './executor/noop';

// Logging
export {
  logAgentAction,
  trackAction,
  getActionEmitter,
  AgentActionEmitter,
} from './logging/emitter';
export { ConsoleSink } from './logging/console-sink';
export { FileSink } from './logging/file-sink';
export { NoOpSink } from './logging/sink';
```

- [ ] **Step 4: Run test**

```bash
cd packages/core && pnpm test tests/feedback/index.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/feedback/index.ts packages/core/tests/feedback/index.test.ts
git commit -m "feat(feedback): add module index with all public exports"
```

---

### Task 14: Update main package index.ts

**Files:**
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write test for main exports**

```typescript
// Add to packages/core/tests/types.test.ts or create new test
import { describe, it, expect } from 'vitest';
import * as core from '../src';

describe('Core Package Exports', () => {
  it('should export feedback module', () => {
    expect(core.configureFeedback).toBeDefined();
    expect(core.createSelfReview).toBeDefined();
    expect(core.requestPeerReview).toBeDefined();
  });
});
```

- [ ] **Step 2: Update index.ts**

```typescript
// packages/core/src/index.ts - add after entropy export
// Feedback module
export * from './feedback';
```

- [ ] **Step 3: Run all tests**

```bash
cd packages/core && pnpm test
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/index.ts packages/core/tests/types.test.ts
git commit -m "feat(core): export feedback module from main package"
```

---

### Task 15: Create integration test

**Files:**
- Create: `packages/core/tests/feedback/integration/full-workflow.test.ts`

- [ ] **Step 1: Write integration test**

```typescript
// packages/core/tests/feedback/integration/full-workflow.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  configureFeedback,
  resetFeedbackConfig,
  createSelfReview,
  requestPeerReview,
  getActionEmitter,
  parseDiff,
  NoOpExecutor,
  NoOpSink,
} from '../../../src/feedback';

describe('Feedback Module Integration', () => {
  beforeEach(() => {
    resetFeedbackConfig();
    configureFeedback({
      executor: new NoOpExecutor(),
      sinks: [new NoOpSink()],
      emitEvents: true,
    });
  });

  it('should run complete self-review workflow', async () => {
    const eventHandler = vi.fn();
    const unsubscribe = getActionEmitter().on('action:*', eventHandler);

    // Parse diff
    const diffResult = parseDiff(`diff --git a/src/index.ts b/src/index.ts
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,3 +1,5 @@
+import { newFunc } from './new';
+
 export function main() {
+  newFunc();
 }`);

    expect(diffResult.ok).toBe(true);
    if (!diffResult.ok) return;

    // Run self-review with a custom rule that will always produce an item
    const reviewResult = await createSelfReview(diffResult.value, {
      rootDir: process.cwd(),
      diffAnalysis: {
        enabled: true,
        maxChangedFiles: 10,
      },
      customRules: [
        {
          id: 'has-commit-message',
          name: 'Commit message check',
          description: 'Ensure commit message is present',
          severity: 'info',
          check: async (changes) => ({
            passed: !!changes.commitMessage,
            details: changes.commitMessage ? 'Has commit message' : 'No commit message',
          }),
        },
      ],
    });

    expect(reviewResult.ok).toBe(true);
    if (reviewResult.ok) {
      // Custom rule always produces at least 1 item
      expect(reviewResult.value.items.length).toBeGreaterThanOrEqual(1);
      expect(reviewResult.value.summary).toBeDefined();
      // Verify our custom rule ran
      expect(reviewResult.value.items.some(i => i.id === 'has-commit-message')).toBe(true);
    }

    unsubscribe();
  });

  it('should run complete peer review workflow', async () => {
    const eventHandler = vi.fn();
    const unsubscribe = getActionEmitter().on('action:completed', eventHandler);

    const result = await requestPeerReview('architecture-enforcer', {
      files: ['src/index.ts'],
      diff: 'test diff',
      commitMessage: 'feat: add new feature',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.agentType).toBe('architecture-enforcer');
      expect(result.value.approved).toBeDefined();
    }

    // Events should have been emitted
    expect(eventHandler).toHaveBeenCalled();

    unsubscribe();
  });

  it('should combine self-review and peer review', async () => {
    const changes = {
      diff: '+export function test() {}',
      files: [{ path: 'src/test.ts', status: 'added' as const, additions: 1, deletions: 0 }],
      commitMessage: 'feat: add test function',
    };

    // Self-review first
    const selfReview = await createSelfReview(changes, {
      rootDir: process.cwd(),
    });

    expect(selfReview.ok).toBe(true);

    // Then peer review
    const peerReview = await requestPeerReview('test-reviewer', {
      files: changes.files.map(f => f.path),
      diff: changes.diff,
      commitMessage: changes.commitMessage,
    });

    expect(peerReview.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run integration test**

```bash
cd packages/core && pnpm test tests/feedback/integration/full-workflow.test.ts
```

Expected: PASS

- [ ] **Step 3: Run full test suite**

```bash
cd packages/core && pnpm test
```

Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add packages/core/tests/feedback/integration/full-workflow.test.ts
git commit -m "test(feedback): add integration tests for complete workflow"
```

---

### Task 16: Update package version

**Files:**
- Modify: `packages/core/package.json`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Bump version to 0.5.0**

Update `packages/core/package.json`:
```json
{
  "version": "0.5.0"
}
```

Update `packages/core/src/index.ts`:
```typescript
export const VERSION = '0.5.0';
```

- [ ] **Step 2: Run build**

```bash
cd packages/core && pnpm build
```

Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add packages/core/package.json packages/core/src/index.ts
git commit -m "chore(core): bump version to 0.5.0 for feedback module"
```

---

## Summary

This plan implements Module 5: Agent Feedback in 16 tasks across 5 chunks:

1. **Chunk 1: Foundation** - Types, config, error updates
2. **Chunk 2: Telemetry & Executor** - NoOp implementations with full tests
3. **Chunk 3: Action Logging** - Emitter, sinks, tracking
4. **Chunk 4: Review System** - Diff analysis, checklist, self/peer review
5. **Chunk 5: Integration** - Module exports, main package integration, integration tests

Each task follows TDD with:
- Write failing test
- Implement minimal code
- Verify test passes
- Commit

Total estimated tasks: 16
Total estimated commits: 16+

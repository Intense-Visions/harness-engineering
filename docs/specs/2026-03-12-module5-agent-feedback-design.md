# Module 5: Agent Feedback - Design Specification

**Date**: 2026-03-12
**Status**: Draft
**Module**: `packages/core/src/feedback/`

## Executive Summary

The Agent Feedback module provides APIs for agent self-review, peer review orchestration, telemetry integration, and agent action logging. It enables AI agents to operate in a self-correcting cycle of execution and review before human intervention.

**Primary consumers** (in priority order):

1. AI agents - structured, parseable APIs for autonomous operation
2. CI/CD pipelines - automation hooks for GitHub Actions, etc.
3. Human developers - CLI/library access to trigger reviews and view telemetry

## Design Decisions

### Approach: Monolithic Module

All four features reside in a single `feedback/` module with clear internal organization. This matches the existing module pattern (validation/, context/, constraints/, entropy/) and provides a single configuration point with a cohesive API.

### Key Design Choices

1. **Interface-only for external integrations** - `TelemetryAdapter` and `AgentExecutor` are interfaces with `NoOp` stubs. Users implement their own adapters for Claude Code, Gemini CLI, OpenTelemetry, etc. No external dependencies.

2. **Comprehensive self-review** - Combines three validation sources:
   - Harness principle validation (leverages existing modules)
   - User-configurable checklist rules
   - Intelligent git diff analysis

3. **Full telemetry triad** - `TelemetryAdapter` supports metrics, traces, and logs.

4. **Event emitter + pluggable sink** - Agent action logging uses both patterns for real-time notifications and flexible persistence.

---

## Module Structure

```
packages/core/src/feedback/
├── types.ts                 # All type definitions
├── review/
│   ├── self-review.ts       # createSelfReview() - checklist generation
│   ├── peer-review.ts       # requestPeerReview() - agent delegation
│   ├── checklist.ts         # ChecklistBuilder for configurable rules
│   └── diff-analyzer.ts     # Git diff analysis for contextual checks
├── telemetry/
│   ├── adapter.ts           # TelemetryAdapter interface
│   └── noop.ts              # NoOpTelemetryAdapter implementation
├── executor/
│   ├── interface.ts         # AgentExecutor interface
│   └── noop.ts              # NoOpExecutor implementation
├── logging/
│   ├── emitter.ts           # AgentActionEmitter (extends EventEmitter)
│   ├── sink.ts              # ActionSink interface
│   └── console-sink.ts      # Default ConsoleSink
├── config.ts                # configureFeedback() and FeedbackConfig
└── index.ts                 # Public API exports
```

---

## Type Definitions

### Error Types

```typescript
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

### Review Types

```typescript
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
```

### Agent Types

```typescript
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
```

---

## Telemetry Interface

### Types

```typescript
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
```

### TelemetryAdapter Interface

```typescript
export interface TelemetryAdapter {
  readonly name: string;

  health(): Promise<Result<TelemetryHealth, FeedbackError>>;

  getMetrics(
    service: string,
    timeRange: TimeRange,
    metricNames?: string[]
  ): Promise<Result<Metric[], FeedbackError>>;

  getTraces(
    service: string,
    timeRange: TimeRange,
    traceId?: string
  ): Promise<Result<Trace[], FeedbackError>>;

  getLogs(
    service: string,
    timeRange: TimeRange,
    filter?: LogFilter
  ): Promise<Result<LogEntry[], FeedbackError>>;
}
```

### NoOpTelemetryAdapter

Returns empty results and reports as "healthy". Used when no telemetry backend is configured.

```typescript
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

---

## Agent Executor Interface

### Types

```typescript
export interface ExecutorHealth {
  available: boolean;
  maxConcurrent?: number;
  activeProcesses?: number;
  message?: string;
}
```

### AgentExecutor Interface

```typescript
export interface AgentExecutor {
  readonly name: string;

  health(): Promise<Result<ExecutorHealth, FeedbackError>>;

  spawn(config: AgentConfig): Promise<Result<AgentProcess, FeedbackError>>;

  status(processId: string): Promise<Result<AgentProcess, FeedbackError>>;

  wait(processId: string, timeout?: number): Promise<Result<PeerReview, FeedbackError>>;

  kill(processId: string): Promise<Result<void, FeedbackError>>;
}
```

### NoOpExecutor

Immediately returns "completed" with an empty approval. Used for testing or when no real agent spawning is configured.

```typescript
export class NoOpExecutor implements AgentExecutor {
  readonly name = 'noop';
  private processes = new Map<string, AgentProcess>();

  async health(): Promise<Result<ExecutorHealth, FeedbackError>> {
    return Ok({ available: true, message: 'NoOp executor - no real agent spawning' });
  }

  async spawn(config: AgentConfig): Promise<Result<AgentProcess, FeedbackError>> {
    const process: AgentProcess = {
      id: crypto.randomUUID(),
      status: 'completed',
      startedAt: new Date().toISOString(),
      config,
    };
    this.processes.set(process.id, process);
    return Ok(process);
  }

  async status(processId: string): Promise<Result<AgentProcess, FeedbackError>> {
    const process = this.processes.get(processId);
    if (!process) {
      return Err({
        code: 'AGENT_SPAWN_ERROR',
        message: 'Process not found',
        details: {},
        suggestions: [],
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
        details: {},
        suggestions: [],
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

---

## Self-Review API

### Configuration

```typescript
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
```

### Functions

```typescript
export async function createSelfReview(
  changes: CodeChanges,
  config: SelfReviewConfig
): Promise<Result<ReviewChecklist, FeedbackError>>;
```

### ChecklistBuilder

```typescript
export class ChecklistBuilder {
  constructor(rootDir: string);

  withHarnessChecks(options?: SelfReviewConfig['harness']): this;
  addRule(rule: CustomRule): this;
  addRules(rules: CustomRule[]): this;
  withDiffAnalysis(options: SelfReviewConfig['diffAnalysis']): this;

  run(changes: CodeChanges): Promise<Result<ReviewChecklist, FeedbackError>>;
}
```

### Diff Analyzer

```typescript
export function parseDiff(diff: string): Result<CodeChanges, FeedbackError>;

export async function analyzeDiff(
  changes: CodeChanges,
  options: SelfReviewConfig['diffAnalysis']
): Promise<Result<ReviewItem[], FeedbackError>>;
```

Internal checks performed by `analyzeDiff`:

- Large PR detection (too many files/lines changed)
- Missing tests for new code
- Undocumented public exports
- Forbidden patterns (console.log, TODO, etc.)
- File size limits exceeded
- Potential security issues (hardcoded secrets patterns)

---

## Peer Review API

```typescript
export interface PeerReviewOptions {
  skills?: string[];
  timeout?: number;
  wait?: boolean;
  customAgentType?: string;
}

export async function requestPeerReview(
  agentType: AgentType,
  context: ReviewContext,
  options?: PeerReviewOptions
): Promise<Result<PeerReview, FeedbackError>>;

export async function requestMultiplePeerReviews(
  requests: Array<{ agentType: AgentType; context: ReviewContext; options?: PeerReviewOptions }>
): Promise<Result<PeerReview[], FeedbackError>>;
```

---

## Agent Action Logging

### Action Types

```typescript
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
```

### Event Emitter

```typescript
export type ActionEventType = 'action:started' | 'action:completed' | 'action:failed' | 'action:*';

export interface ActionEvent {
  type: ActionEventType;
  action: AgentAction;
  timestamp: string;
}

export type ActionEventHandler = (event: ActionEvent) => void | Promise<void>;

export class AgentActionEmitter {
  on(eventType: ActionEventType, handler: ActionEventHandler): () => void;
  once(eventType: ActionEventType, handler: ActionEventHandler): () => void;
  off(eventType: ActionEventType, handler: ActionEventHandler): void;
  emit(event: ActionEvent): void;
  listenerCount(eventType: ActionEventType): number;
  removeAllListeners(): void;
}
```

### Action Sink Interface

```typescript
export interface ActionSink {
  readonly name: string;

  write(action: AgentAction): Promise<Result<void, FeedbackError>>;
  flush?(): Promise<Result<void, FeedbackError>>;
  close?(): Promise<void>;
}
```

### Built-in Sinks

```typescript
export class ConsoleSink implements ActionSink {
  readonly name = 'console';
  constructor(options?: ConsoleSinkOptions);
  async write(action: AgentAction): Promise<Result<void, FeedbackError>>;
}

export interface ConsoleSinkOptions {
  level?: 'debug' | 'info' | 'warn' | 'error';
  format?: 'pretty' | 'json';
  verbose?: boolean;
}

export class FileSink implements ActionSink {
  readonly name = 'file';
  constructor(filePath: string, options?: FileSinkOptions);
  async write(action: AgentAction): Promise<Result<void, FeedbackError>>;
  async flush(): Promise<Result<void, FeedbackError>>;
  async close(): Promise<void>;
}

export interface FileSinkOptions {
  mode?: 'append' | 'overwrite';
  bufferSize?: number;
  flushInterval?: number;
}

export class NoOpSink implements ActionSink {
  readonly name = 'noop';
  async write(): Promise<Result<void, FeedbackError>> {
    return Ok(undefined);
  }
}
```

### Logging API

```typescript
export async function logAgentAction(
  action: Omit<AgentAction, 'id' | 'timestamp'>
): Promise<Result<AgentAction, FeedbackError>>;

export function trackAction(type: ActionType, context: ActionContext): ActionTracker;

export interface ActionTracker {
  readonly action: AgentAction;
  complete(result: ActionResult): Promise<Result<AgentAction, FeedbackError>>;
  fail(error: { code: string; message: string }): Promise<Result<AgentAction, FeedbackError>>;
}
```

---

## Configuration

```typescript
export interface FeedbackConfig {
  telemetry?: TelemetryAdapter;
  executor?: AgentExecutor;
  sinks?: ActionSink[];
  emitEvents?: boolean;
  defaultTimeout?: number;
  rootDir?: string;
}

export function configureFeedback(config: Partial<FeedbackConfig>): void;
export function getFeedbackConfig(): Readonly<FeedbackConfig>;
export function resetFeedbackConfig(): void;
export function getActionEmitter(): AgentActionEmitter;
```

Default configuration:

- `telemetry`: `NoOpTelemetryAdapter`
- `executor`: `NoOpExecutor`
- `sinks`: `[ConsoleSink]`
- `emitEvents`: `true`
- `defaultTimeout`: `300000` (5 minutes)
- `rootDir`: `process.cwd()`

---

## Public API Exports

```typescript
// Configuration
export { configureFeedback, getFeedbackConfig, resetFeedbackConfig } from './config';
export type { FeedbackConfig } from './config';

// Types (all exported)
export type { FeedbackError, ReviewItem, ReviewChecklist, CodeChanges, ... } from './types';

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
export { logAgentAction, trackAction, getActionEmitter, AgentActionEmitter } from './logging/emitter';
export { ConsoleSink } from './logging/console-sink';
export { FileSink } from './logging/file-sink';
export { NoOpSink } from './logging/sink';
```

---

## Example Usage

```typescript
import {
  configureFeedback,
  createSelfReview,
  requestPeerReview,
  ChecklistBuilder,
  trackAction,
  getActionEmitter,
  ConsoleSink,
  FileSink,
} from '@harness-engineering/core';

// 1. Configure at startup
configureFeedback({
  sinks: [new ConsoleSink({ format: 'pretty' }), new FileSink('./agent-actions.jsonl')],
});

// 2. Subscribe to events
getActionEmitter().on('action:completed', (event) => {
  if (event.action.type === 'self-review') {
    console.log('Self-review completed:', event.action.result?.summary);
  }
});

// 3. Run self-review
const changes: CodeChanges = {
  diff: gitDiffOutput,
  files: [{ path: 'src/api.ts', status: 'modified', additions: 50, deletions: 10 }],
  commitMessage: 'feat: add user endpoint',
};

const review = await createSelfReview(changes, {
  rootDir: './project',
  harness: { context: true, constraints: true },
  diffAnalysis: { enabled: true, checkTestCoverage: true },
});

if (review.ok && !review.value.passed) {
  console.log(
    'Self-review failed:',
    review.value.items.filter((i) => !i.passed)
  );
}

// 4. Request peer review
const peerReview = await requestPeerReview('architecture-enforcer', {
  files: ['src/api.ts'],
  diff: gitDiffOutput,
});

// 5. Track custom action
const tracker = trackAction('custom', {
  trigger: 'manual',
  metadata: { task: 'deploy' },
});
await tracker.complete({ outcome: 'success', summary: 'Deployed successfully' });
```

---

## Integration Notes

### Updating shared/errors.ts

Add new error codes to `FeedbackError`:

```typescript
export interface FeedbackError extends BaseError {
  code:
    | 'AGENT_SPAWN_ERROR'
    | 'AGENT_TIMEOUT'
    | 'TELEMETRY_ERROR'
    | 'TELEMETRY_UNAVAILABLE'
    | 'REVIEW_ERROR'
    | 'DIFF_PARSE_ERROR'
    | 'SINK_ERROR';
}
```

### Updating main index.ts

Add feedback module export:

```typescript
// Feedback module
export * from './feedback';
```

---

## Testing Strategy

1. **Unit tests** for each component:
   - `self-review.test.ts` - checklist generation, custom rules
   - `diff-analyzer.test.ts` - diff parsing, analysis checks
   - `peer-review.test.ts` - review orchestration
   - `emitter.test.ts` - event emission, subscriptions
   - `sinks.test.ts` - ConsoleSink, FileSink, NoOpSink

2. **Integration tests**:
   - Full self-review workflow with harness checks
   - Event + sink pipeline
   - Configuration changes

3. **Test fixtures**:
   - Sample git diffs
   - Mock telemetry data
   - Agent process states

---

## Success Criteria

- All public APIs return `Result<T, FeedbackError>`
- NoOp implementations allow usage without external dependencies
- ChecklistBuilder provides ergonomic custom rule definition
- Event emitter handles async handlers gracefully
- > 80% test coverage
- Documentation with examples for all public APIs

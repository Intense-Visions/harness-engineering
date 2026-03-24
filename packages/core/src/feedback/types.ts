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

export interface FeedbackAgentConfig {
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
  config: FeedbackAgentConfig;
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

export type ActionEventType = 'action:started' | 'action:completed' | 'action:failed' | 'action:*';

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
  spawn(
    config: FeedbackAgentConfig
  ): Promise<import('../shared/result').Result<AgentProcess, FeedbackError>>;
  status(
    processId: string
  ): Promise<import('../shared/result').Result<AgentProcess, FeedbackError>>;
  wait(
    processId: string,
    timeout?: number
  ): Promise<import('../shared/result').Result<PeerReview, FeedbackError>>;
  kill(processId: string): Promise<import('../shared/result').Result<void, FeedbackError>>;
}

export interface ActionSink {
  readonly name: string;
  write(action: AgentAction): Promise<import('../shared/result').Result<void, FeedbackError>>;
  flush?(): Promise<import('../shared/result').Result<void, FeedbackError>>;
  close?(): Promise<void>;
}

// ============ Graph-Enhanced Feedback Types ============

/**
 * Pre-computed impact data from graph — enriches diff analysis.
 */
export interface GraphImpactData {
  affectedTests: Array<{ testFile: string; coversFile: string }>;
  affectedDocs: Array<{ docFile: string; documentsFile: string }>;
  impactScope: number;
}

/**
 * Pre-computed harness check data from graph — replaces placeholders.
 */
export interface GraphHarnessCheckData {
  graphExists: boolean;
  nodeCount: number;
  edgeCount: number;
  constraintViolations: number;
  undocumentedFiles: number;
  unreachableNodes: number;
}

export interface ActionTracker {
  readonly action: AgentAction;
  complete(
    result: ActionResult
  ): Promise<import('../shared/result').Result<AgentAction, FeedbackError>>;
  fail(error: {
    code: string;
    message: string;
  }): Promise<import('../shared/result').Result<AgentAction, FeedbackError>>;
}

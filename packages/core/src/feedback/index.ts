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

  // Graph-enhanced types
  GraphImpactData,
  GraphHarnessCheckData,
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

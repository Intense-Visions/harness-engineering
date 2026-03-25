/**
 * Configuration and lifecycle management for the feedback module.
 */
export { configureFeedback, getFeedbackConfig, resetFeedbackConfig } from './config';
export type { FeedbackConfig } from './config';

/**
 * Type definitions for review processes, AI agents, telemetry, and logging.
 */
export type {
  FeedbackError,
  ReviewItem,
  ReviewChecklist,
  CodeChanges,
  ChangedFile,
  SelfReviewConfig,
  CustomRule,
  CustomRuleResult,
  ForbiddenPattern,
  PeerReviewOptions,
  AgentType,
  FeedbackAgentConfig,
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
  TelemetryAdapter,
  ExecutorHealth,
  AgentExecutor,
  ActionType,
  AgentAction,
  ActionContext,
  ActionResult,
  ActionEventType,
  ActionEvent,
  ActionEventHandler,
  ActionSink,
  ActionTracker,
  GraphImpactData,
  GraphHarnessCheckData,
} from './types';

/**
 * Self-review utilities for automated analysis of code changes.
 */
export { createSelfReview, ChecklistBuilder } from './review/self-review';

/**
 * Diff analysis and parsing for identifying impacted areas in the codebase.
 */
export { parseDiff, analyzeDiff } from './review/diff-analyzer';

/**
 * Peer review orchestration for requesting feedback from other agents or humans.
 */
export { requestPeerReview, requestMultiplePeerReviews } from './review/peer-review';

/**
 * Telemetry adapters for capturing metrics and traces.
 */
export { NoOpTelemetryAdapter } from './telemetry/noop';

/**
 * Agent executors for running AI models or local scripts.
 */
export { NoOpExecutor } from './executor/noop';

/**
 * Logging and event tracking for agent actions and feedback loops.
 */
export {
  logAgentAction,
  trackAction,
  getActionEmitter,
  AgentActionEmitter,
} from './logging/emitter';

/**
 * Standard output sinks for logging agent actions.
 */
export { ConsoleSink } from './logging/console-sink';
export { FileSink } from './logging/file-sink';
export { NoOpSink } from './logging/sink';

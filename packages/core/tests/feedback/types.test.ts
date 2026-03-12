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

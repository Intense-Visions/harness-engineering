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

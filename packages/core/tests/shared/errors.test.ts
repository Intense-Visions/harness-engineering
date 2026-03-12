import { describe, it, expect } from 'vitest';
import type { BaseError, ValidationError, FeedbackError } from '../../src/shared/errors';
import { createError } from '../../src/shared/errors';

describe('Error types', () => {
  it('should have required BaseError fields', () => {
    const error: BaseError = {
      code: 'TEST_ERROR',
      message: 'Test error message',
      details: { field: 'value' },
      suggestions: ['Try this', 'Or that'],
    };

    expect(error.code).toBe('TEST_ERROR');
    expect(error.message).toBe('Test error message');
    expect(error.details).toEqual({ field: 'value' });
    expect(error.suggestions).toHaveLength(2);
  });
});

describe('createError', () => {
  it('should create error with all fields', () => {
    const error = createError<ValidationError>(
      'INVALID_TYPE',
      'Value must be a string',
      { expected: 'string', received: 'number' },
      ['Check the type', 'Use string value']
    );

    expect(error.code).toBe('INVALID_TYPE');
    expect(error.message).toBe('Value must be a string');
    expect(error.details).toEqual({ expected: 'string', received: 'number' });
    expect(error.suggestions).toEqual(['Check the type', 'Use string value']);
  });

  it('should create error with default empty fields', () => {
    const error = createError<ValidationError>(
      'VALIDATION_FAILED',
      'Validation failed'
    );

    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.message).toBe('Validation failed');
    expect(error.details).toEqual({});
    expect(error.suggestions).toEqual([]);
  });
});

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

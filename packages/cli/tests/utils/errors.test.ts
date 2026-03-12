import { describe, it, expect } from 'vitest';
import { CLIError, ExitCode, formatError } from '../../src/utils/errors';

describe('CLIError', () => {
  it('creates error with message and exit code', () => {
    const error = new CLIError('Validation failed', ExitCode.VALIDATION_FAILED);
    expect(error.message).toBe('Validation failed');
    expect(error.exitCode).toBe(1);
    expect(error.name).toBe('CLIError');
  });

  it('defaults to ERROR exit code', () => {
    const error = new CLIError('Something went wrong');
    expect(error.exitCode).toBe(2);
  });
});

describe('ExitCode', () => {
  it('has correct values', () => {
    expect(ExitCode.SUCCESS).toBe(0);
    expect(ExitCode.VALIDATION_FAILED).toBe(1);
    expect(ExitCode.ERROR).toBe(2);
  });
});

describe('formatError', () => {
  it('formats CLIError with exit code', () => {
    const error = new CLIError('Config not found', ExitCode.ERROR);
    const result = formatError(error);
    expect(result).toContain('Config not found');
  });

  it('formats generic Error', () => {
    const error = new Error('Unknown error');
    const result = formatError(error);
    expect(result).toContain('Unknown error');
  });
});

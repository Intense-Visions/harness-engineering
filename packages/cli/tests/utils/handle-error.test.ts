import { describe, it, expect, vi, afterEach } from 'vitest';
import { handleError, CLIError, ExitCode, formatError } from '../../src/utils/errors';

describe('handleError', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs formatted message and exits with CLIError exit code', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const err = new CLIError('Config not found', ExitCode.VALIDATION_FAILED);
    handleError(err);

    expect(errorSpy).toHaveBeenCalledWith('Error: Config not found');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('exits with ExitCode.ERROR for generic Error', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    handleError(new Error('Something broke'));

    expect(errorSpy).toHaveBeenCalledWith('Error: Something broke');
    expect(exitSpy).toHaveBeenCalledWith(2);
  });

  it('exits with ExitCode.ERROR for non-Error values', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    handleError('string error');

    expect(errorSpy).toHaveBeenCalledWith('Error: string error');
    expect(exitSpy).toHaveBeenCalledWith(2);
  });
});

describe('formatError', () => {
  it('formats non-Error values as strings', () => {
    expect(formatError(42)).toBe('Error: 42');
    expect(formatError(null)).toBe('Error: null');
    expect(formatError(undefined)).toBe('Error: undefined');
  });
});

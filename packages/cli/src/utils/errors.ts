/**
 * Standard exit codes for the Harness CLI.
 */
export const ExitCode = {
  /** Command completed successfully */
  SUCCESS: 0,
  /** Command failed because of a validation error (e.g. check-docs found issues) */
  VALIDATION_FAILED: 1,
  /** Command failed because of an unexpected error or misconfiguration */
  ERROR: 2,
} as const;

/**
 * Type representing one of the supported exit codes.
 */
export type ExitCodeType = (typeof ExitCode)[keyof typeof ExitCode];

/**
 * Custom error class for CLI-specific failures.
 * Includes an exit code that should be used when terminating the process.
 */
export class CLIError extends Error {
  /** The exit code associated with this error */
  readonly exitCode: ExitCodeType;

  /**
   * Creates a new CLIError.
   *
   * @param message - Human-readable error message.
   * @param exitCode - Exit code to use when process terminates. Defaults to ExitCode.ERROR.
   */
  constructor(message: string, exitCode: ExitCodeType = ExitCode.ERROR) {
    super(message);
    this.name = 'CLIError';
    this.exitCode = exitCode;
  }
}

/**
 * Formats an unknown error into a human-readable string.
 *
 * @param error - The error to format.
 * @returns A formatted error message.
 */
export function formatError(error: unknown): string {
  if (error instanceof CLIError) {
    return `Error: ${error.message}`;
  }
  if (error instanceof Error) {
    return `Error: ${error.message}`;
  }
  return `Error: ${String(error)}`;
}

/**
 * Handles an error by logging it to stderr and exiting the process with the appropriate code.
 *
 * @param error - The error to handle.
 * @throws Never returns, as it terminates the process.
 */
export function handleError(error: unknown): never {
  const message = formatError(error);
  console.error(message);

  const exitCode = error instanceof CLIError ? error.exitCode : ExitCode.ERROR;
  process.exit(exitCode);
}

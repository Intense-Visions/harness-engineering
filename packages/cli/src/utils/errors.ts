/**
 * CLI Exit Codes
 */
export const ExitCode = {
  SUCCESS: 0,
  VALIDATION_FAILED: 1,
  ERROR: 2,
} as const;

export type ExitCodeType = (typeof ExitCode)[keyof typeof ExitCode];

/**
 * CLI-specific error with exit code
 */
export class CLIError extends Error {
  readonly exitCode: ExitCodeType;

  constructor(message: string, exitCode: ExitCodeType = ExitCode.ERROR) {
    super(message);
    this.name = 'CLIError';
    this.exitCode = exitCode;
  }
}

/**
 * Format error for display
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
 * Handle error and exit process
 */
export function handleError(error: unknown): never {
  const message = formatError(error);
  console.error(message);

  const exitCode = error instanceof CLIError ? error.exitCode : ExitCode.ERROR;
  process.exit(exitCode);
}

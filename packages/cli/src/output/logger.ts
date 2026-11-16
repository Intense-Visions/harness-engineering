import chalk from 'chalk';

/**
 * When true, the CLI is emitting a machine-readable document (`--json`) on
 * stdout, so every human-facing diagnostic must stay off that stream (#2519).
 * Set per invocation by the root program's `preAction` hook.
 */
let machineOutput = false;

/**
 * Route human-facing diagnostics (info/success/dim) to stderr while a
 * machine-readable document owns stdout. Warnings and errors always go to
 * stderr regardless of this flag; `raw` always goes to stdout.
 * @param enabled - true when the invoked command runs in `--json` mode.
 */
export function setMachineOutput(enabled: boolean): void {
  machineOutput = enabled;
}

/** Writes a human-facing line to stdout, or stderr in machine-output mode. */
function human(...parts: unknown[]): void {
  if (machineOutput) console.error(...parts);
  else console.log(...parts);
}

/**
 * Simple logger for CLI output with color-coded icons.
 *
 * Stream contract: stdout carries the command's RESULT (`raw` JSON, or the
 * human report); diagnostics (`warn`, `error`) always go to stderr so
 * `harness --json <cmd> | jq` never sees them (#2519).
 */
export const logger = {
  /**
   * Logs an informational message with a blue 'i' icon.
   * @param message - The message to log.
   */
  info: (message: string) => human(chalk.blue('i'), message),

  /**
   * Logs a success message with a green 'v' icon.
   * @param message - The message to log.
   */
  success: (message: string) => human(chalk.green('v'), message),

  /**
   * Logs a warning message with a yellow '!' icon to stderr.
   * @param message - The message to log.
   */
  warn: (message: string) => console.error(chalk.yellow('!'), message),

  /**
   * Logs an error message with a red 'x' icon to stderr.
   * @param message - The message to log.
   */
  error: (message: string) => console.error(chalk.red('x'), message),

  /**
   * Logs a dimmed message.
   * @param message - The message to log.
   */
  dim: (message: string) => human(chalk.dim(message)),

  /**
   * Logs raw data as a formatted JSON string.
   * Useful for JSON output mode.
   * @param data - The data to log.
   */
  raw: (data: unknown) => console.log(JSON.stringify(data, null, 2)),
};

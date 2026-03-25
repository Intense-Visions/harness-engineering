import chalk from 'chalk';

/**
 * Simple logger for CLI output with color-coded icons.
 */
export const logger = {
  /**
   * Logs an informational message with a blue 'i' icon.
   * @param message - The message to log.
   */
  info: (message: string) => console.log(chalk.blue('i'), message),

  /**
   * Logs a success message with a green 'v' icon.
   * @param message - The message to log.
   */
  success: (message: string) => console.log(chalk.green('v'), message),

  /**
   * Logs a warning message with a yellow '!' icon.
   * @param message - The message to log.
   */
  warn: (message: string) => console.log(chalk.yellow('!'), message),

  /**
   * Logs an error message with a red 'x' icon to stderr.
   * @param message - The message to log.
   */
  error: (message: string) => console.error(chalk.red('x'), message),

  /**
   * Logs a dimmed message.
   * @param message - The message to log.
   */
  dim: (message: string) => console.log(chalk.dim(message)),

  /**
   * Logs raw data as a formatted JSON string.
   * Useful for JSON output mode.
   * @param data - The data to log.
   */
  raw: (data: unknown) => console.log(JSON.stringify(data, null, 2)),
};

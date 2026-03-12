import chalk from 'chalk';

export const logger = {
  info: (message: string) => console.log(chalk.blue('i'), message),
  success: (message: string) => console.log(chalk.green('v'), message),
  warn: (message: string) => console.log(chalk.yellow('!'), message),
  error: (message: string) => console.error(chalk.red('x'), message),
  dim: (message: string) => console.log(chalk.dim(message)),

  // For JSON output mode
  raw: (data: unknown) => console.log(JSON.stringify(data, null, 2)),
};

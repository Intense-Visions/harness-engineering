import readline from 'node:readline';

/**
 * Prompts the user with a question on stdin/stdout and resolves with the
 * trimmed, lower-cased answer. Shared by the `update` and `install` commands.
 */
export function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

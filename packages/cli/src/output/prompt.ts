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

export interface PromptIO {
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
}

/**
 * Ask a yes/no question. Resolves true only on an explicit `y` / `yes`. EOF or a closed
 * input (Ctrl-D, a piped empty stdin) resolves false: a question nobody answered is a no,
 * and must never leave the promise pending (the process would then exit 0 silently).
 */
export function confirmYesNo(question: string, io: PromptIO = {}): Promise<boolean> {
  const rl = readline.createInterface({
    input: io.input ?? process.stdin,
    output: io.output ?? process.stdout,
  });
  return new Promise((resolve) => {
    let settled = false;
    const settle = (value: boolean) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    rl.on('close', () => settle(false));
    rl.question(question, (answer) => {
      const a = answer.trim().toLowerCase();
      settle(a === 'y' || a === 'yes');
      rl.close();
    });
  });
}

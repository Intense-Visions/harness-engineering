/**
 * Shared fixtures for exercising commander command trees end-to-end.
 *
 * CLI command modules are only observable through three side channels: what
 * they print, what exit code they hand the shell, and what they pass to the
 * runners underneath. These helpers capture the first two so a test can assert
 * on the *user-visible* contract instead of reaching into module internals.
 */
import { vi } from 'vitest';

// Built from a char code rather than a literal escape so the source stays free
// of control characters (and of an eslint `no-control-regex` suppression).
const ANSI_ESCAPE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

/** Strip SGR colour codes so assertions survive a colour-capable terminal. */
export function stripAnsi(value: string): string {
  return value.replace(ANSI_ESCAPE, '');
}

export interface ConsoleCapture {
  /** Each `console.log` call, ANSI-stripped and argument-joined. */
  readonly stdoutLines: string[];
  /** Each `console.error` / `console.warn` call, ANSI-stripped. */
  readonly stderrLines: string[];
  /** All stdout lines joined by newline — the text a user would read. */
  stdout(): string;
  /** All stderr lines joined by newline. */
  stderr(): string;
  restore(): void;
}

/**
 * Redirect console output into arrays. Callers must `restore()` (an
 * `afterEach` is the usual home) or later tests inherit the spies.
 */
export function captureConsole(): ConsoleCapture {
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  const render = (args: unknown[]): string =>
    stripAnsi(args.map((a) => (typeof a === 'string' ? a : String(a))).join(' '));

  const log = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    stdoutLines.push(render(args));
  });
  const error = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    stderrLines.push(render(args));
  });
  const warn = vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    stderrLines.push(render(args));
  });

  return {
    stdoutLines,
    stderrLines,
    stdout: () => stdoutLines.join('\n'),
    stderr: () => stderrLines.join('\n'),
    restore: () => {
      log.mockRestore();
      error.mockRestore();
      warn.mockRestore();
    },
  };
}

/**
 * Thrown by the stubbed `process.exit`. Throwing (rather than returning) is the
 * faithful stand-in: the real `process.exit` never returns, so a stub that
 * *does* return would let the command run code that could never execute in
 * production — e.g. dereferencing `result.value` after an error exit.
 */
export class ProcessExitSignal extends Error {
  constructor(readonly code: number) {
    super(`process.exit(${code})`);
    this.name = 'ProcessExitSignal';
  }
}

/** Replace `process.exit` with a throw so the test process survives. */
export function stubProcessExit(): { restore(): void } {
  const spy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new ProcessExitSignal(code ?? 0);
  }) as never);
  return { restore: () => spy.mockRestore() };
}

/**
 * Run a command and return the exit code it requested. Fails loudly if the
 * command returned without exiting — a command that forgets to exit is a bug,
 * not a silent pass.
 */
export async function runToExit(run: () => Promise<unknown>): Promise<number> {
  try {
    await run();
  } catch (err) {
    if (err instanceof ProcessExitSignal) return err.code;
    throw err;
  }
  throw new Error('Expected the command to call process.exit(), but it returned normally.');
}

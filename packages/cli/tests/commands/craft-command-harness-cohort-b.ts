/**
 * Driving harness for the craft CLI command layer (cohort B: api / code / docs
 * / knowledge / cli-ergonomics).
 *
 * Every craft command ends its action by calling `process.exit(...)` on both the
 * success and the failure path, so a test that drives one must replace
 * `process.exit` or it tears down the vitest worker. This harness swaps it for a
 * throw of a private sentinel, mounts the command under a parent that supplies
 * the global flags `optsWithGlobals()` reads (`--json`, `--quiet`, `--verbose`,
 * `--cwd`), captures the real rendered stdout/stderr, and hands back the exit
 * code the command chose.
 *
 * Only the driving machinery lives here. Output fixtures stay in each command's
 * own test file because the five engines emit structurally different findings
 * and summaries — sharing them would hide exactly the differences worth pinning.
 *
 * NOTE: sibling PR #1876 (`test/craft-commands-cohort-a`) adds a
 * `craft-command-harness.ts` for the other craft cohort. The two are deliberately
 * separate files so the PRs do not collide; consolidate them in a follow-up once
 * both have landed.
 */

import { Command } from 'commander';
import { vi } from 'vitest';

/** Thrown by the stubbed `process.exit` so the action unwinds instead of exiting. */
const EXIT_SENTINEL = Symbol('craft-command-harness:process.exit');

export interface CraftCommandRun {
  /** The code the command passed to `process.exit()`. */
  exitCode: number;
  /** Lines written to stdout through `console.log`, in emission order. */
  stdout: string[];
  /** Lines written to stderr through `console.error` (the logger's error channel). */
  stderr: string[];
  /** `stdout` joined with newlines, for substring/regex assertions. */
  stdoutText: string;
  /** `stderr` joined with newlines, for substring/regex assertions. */
  stderrText: string;
}

export interface RunCraftCommandOptions {
  /** Root-level flags, e.g. `['--json']` or `['--cwd', '/elsewhere']`. */
  globals?: string[];
  /** Value `process.cwd()` reports during the run. */
  cwd?: string;
}

/** The cwd a run reports unless the caller overrides it. */
export const DEFAULT_CWD = '/fixture/project';

/**
 * Parse `argv` through `factory()`'s command and return what the user would have
 * seen plus the exit code the command chose.
 *
 * Fails loudly if the command returns without exiting: "always terminates the
 * process" is part of these commands' contract, and a silent return would make
 * every `exitCode` assertion below vacuous.
 */
export async function runCraftCommand(
  factory: () => Command,
  argv: string[],
  options: RunCraftCommandOptions = {}
): Promise<CraftCommandRun> {
  const stdout: string[] = [];
  const stderr: string[] = [];

  const logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    stdout.push(args.map(String).join(' '));
  });
  const errorSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    stderr.push(args.map(String).join(' '));
  });
  const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(options.cwd ?? DEFAULT_CWD);

  let exitCode: number | undefined;
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    exitCode = code;
    throw EXIT_SENTINEL;
  }) as never);

  const parent = new Command();
  parent.exitOverride();
  parent
    .option('--json', 'JSON output')
    .option('--quiet', 'Quiet output')
    .option('--verbose', 'Verbose output')
    .option('--cwd <dir>', 'Project root');
  parent.addCommand(factory());

  try {
    await parent.parseAsync([...(options.globals ?? []), ...argv], { from: 'user' });
    throw new Error(
      'craft command returned without calling process.exit() — the exit contract is broken'
    );
  } catch (err) {
    if (err !== EXIT_SENTINEL) throw err;
  } finally {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    cwdSpy.mockRestore();
    exitSpy.mockRestore();
  }

  if (exitCode === undefined) {
    throw new Error('process.exit() was called without an exit code');
  }

  return {
    exitCode,
    stdout,
    stderr,
    stdoutText: stdout.join('\n'),
    stderrText: stderr.join('\n'),
  };
}

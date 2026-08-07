import { describe, it, expect } from 'vitest';
import { defaultCommandRunner, type CommandRunner } from '../src/command-runner';

// Widen the per-subprocess budget well past the 5s production default. These
// tests spawn a real `node -e` child; under a full-suite parallel run (many
// vitest workers each launching node) that launch can exceed 5s purely from
// host load and get killed, failing green code. A generous budget only tolerates
// a slow/loaded host — a genuine hang still fails at the vitest ceiling — so it
// cannot mask a real bug.
const SUBPROCESS_BUDGET_MS = 30_000;

describe('defaultCommandRunner', () => {
  it('runs a command and returns trimmed stdout', async () => {
    const out = await defaultCommandRunner(
      'node',
      ['-e', 'process.stdout.write("hi\\n")'],
      SUBPROCESS_BUDGET_MS
    );
    expect(out).toBe('hi');
  });
  it('rejects when the command exits non-zero', async () => {
    await expect(
      defaultCommandRunner('node', ['-e', 'process.exit(3)'], SUBPROCESS_BUDGET_MS)
    ).rejects.toBeInstanceOf(Error);
  });
  it('satisfies the CommandRunner type', () => {
    const r: CommandRunner = defaultCommandRunner;
    expect(typeof r).toBe('function');
  });
});

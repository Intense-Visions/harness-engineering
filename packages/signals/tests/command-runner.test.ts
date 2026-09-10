import { describe, it, expect } from 'vitest';
import {
  DEFAULT_COMMAND_TIMEOUT_MS,
  NETWORK_COMMAND_TIMEOUT_MS,
  defaultCommandRunner,
  type CommandRunner,
} from '../src/command-runner';

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
  it('rejects with a message that names the timeout when the child outlives its budget', async () => {
    // Regression: a killed-on-timeout child surfaced Node's bare
    // `Command failed: <argv>` message with an empty stderr tail, which callers
    // then misreported as "gh unavailable or not authenticated". The rejection
    // must say the budget was exceeded so a slow network call is not mistaken
    // for a broken/unauthenticated binary.
    await expect(
      defaultCommandRunner('node', ['-e', 'setTimeout(() => {}, 30000)'], 250)
    ).rejects.toThrow(/timed out after 250ms/);
  });

  it('budgets network commands well above the local-process default', () => {
    // `gh pr list --limit 500 --json ...,reviews` is a paginated network query
    // that measured ~10-14s against a real repo; the 5s local budget killed it.
    expect(NETWORK_COMMAND_TIMEOUT_MS).toBeGreaterThan(DEFAULT_COMMAND_TIMEOUT_MS);
    expect(NETWORK_COMMAND_TIMEOUT_MS).toBeGreaterThanOrEqual(30_000);
  });

  it('satisfies the CommandRunner type', () => {
    const r: CommandRunner = defaultCommandRunner;
    expect(typeof r).toBe('function');
  });
});

// The root program's preAction hook puts the logger into machine-output mode
// whenever the invoked command runs with `--json`, so `logger.info` and friends
// cannot corrupt the JSON document on stdout (#2519).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Command } from 'commander';
import { createProgram } from '../../src/index';
import { logger, setMachineOutput } from '../../src/output/logger';

function programWithProbe(): Command {
  const program = createProgram();
  program.exitOverride();
  const probe = new Command('json-mode-probe')
    .option('--json', 'subcommand-level json')
    .action(() => {
      logger.info('probe-info');
    });
  program.addCommand(probe);
  return program;
}

describe('root program --json routes logger diagnostics off stdout', () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const err = vi.spyOn(console, 'error').mockImplementation(() => {});

  afterEach(() => {
    setMachineOutput(false);
    log.mockClear();
    err.mockClear();
  });

  function stdoutHas(text: string): boolean {
    return log.mock.calls.some((c) => c.join(' ').includes(text));
  }
  function stderrHas(text: string): boolean {
    return err.mock.calls.some((c) => c.join(' ').includes(text));
  }

  it('global --json sends logger.info to stderr', async () => {
    await programWithProbe().parseAsync(['node', 'harness', '--json', 'json-mode-probe']);
    expect(stdoutHas('probe-info')).toBe(false);
    expect(stderrHas('probe-info')).toBe(true);
  });

  it('subcommand --json sends logger.info to stderr', async () => {
    await programWithProbe().parseAsync(['node', 'harness', 'json-mode-probe', '--json']);
    expect(stdoutHas('probe-info')).toBe(false);
    expect(stderrHas('probe-info')).toBe(true);
  });

  it('without --json logger.info stays on stdout', async () => {
    await programWithProbe().parseAsync(['node', 'harness', 'json-mode-probe']);
    expect(stdoutHas('probe-info')).toBe(true);
    expect(stderrHas('probe-info')).toBe(false);
  });
});

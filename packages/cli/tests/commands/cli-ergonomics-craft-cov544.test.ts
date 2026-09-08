import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { Command } from 'commander';

const runCliErgonomicsCraft = vi.fn();

vi.mock('../../src/cli-ergonomics-craft/index.js', () => ({
  runCliErgonomicsCraft: (...args: unknown[]) => runCliErgonomicsCraft(...args),
}));

import { createCliErgonomicsCraftCommand } from '../../src/commands/cli-ergonomics-craft';

function makeOutput(overrides: Record<string, unknown> = {}): any {
  return {
    findings: [],
    summary: {
      counts: { filesScanned: 2, filesSkipped: 1 },
      catalog: { rubricsApplied: ['r1'], exemplarsAvailable: 2 },
      llmCalls: { count: 1, costUsd: 0.2 },
      durationMs: 5,
    },
    ...overrides,
  };
}

const finding = (tier: string, overrides: Record<string, unknown> = {}): any => ({
  code: 'CLI-R001',
  tier,
  impact: 'high',
  confidence: 'high',
  target: { file: 'cmd.ts', relative: 'src/commands/cmd.ts', kind: 'command' },
  message: 'confusing flag',
  cite: { source: 'CLIG' },
  ...overrides,
});

let logOutput: string[];
let exitCode: number | undefined;
const logSpy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
  logOutput.push(a.map(String).join(' '));
});
const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
  exitCode = code;
  throw new Error('exit:' + code);
}) as never);

function run(args: string[]): Promise<void> {
  const parent = new Command();
  parent.option('--json').option('--verbose').option('--quiet').option('--cwd <path>');
  parent.addCommand(createCliErgonomicsCraftCommand());
  parent.exitOverride();
  return parent.parseAsync(['node', 'test', 'cli-ergonomics-craft', ...args]);
}

beforeEach(() => {
  vi.clearAllMocks();
  logOutput = [];
  exitCode = undefined;
});

afterAll(() => {
  logSpy.mockRestore();
  errSpy.mockRestore();
  exitSpy.mockRestore();
});

describe('cli-ergonomics-craft command (cov544)', () => {
  it('text empty prints "No CLI-ergonomics-craft findings." exit 0', async () => {
    runCliErgonomicsCraft.mockResolvedValue(makeOutput());
    await expect(run([])).rejects.toThrow('exit:0');
    expect(logOutput.join('\n')).toContain('No CLI-ergonomics-craft findings.');
  });

  it('populated grouped by file, exit 0', async () => {
    runCliErgonomicsCraft.mockResolvedValue(
      makeOutput({
        findings: [
          finding('advisory'),
          finding('advisory', {
            target: { file: 'c2.ts', relative: 'src/commands/c2.ts', kind: 'subcommand' },
          }),
        ],
      })
    );
    await expect(run([])).rejects.toThrow('exit:0');
    const out = logOutput.join('\n');
    expect(out).toContain('cmd.ts');
    expect(out).toContain('src/commands/cmd.ts (command)');
    expect(out).toContain('across 2 commands');
  });

  it('foundational drives exit 1', async () => {
    runCliErgonomicsCraft.mockResolvedValue(makeOutput({ findings: [finding('foundational')] }));
    await expect(run([])).rejects.toThrow('exit:1');
    expect(exitCode).toBe(1);
  });

  it('verbose prints source', async () => {
    runCliErgonomicsCraft.mockResolvedValue(makeOutput({ findings: [finding('advisory')] }));
    await expect(run(['--verbose'])).rejects.toThrow('exit:0');
    expect(logOutput.join('\n')).toContain('source: CLIG');
  });

  it('json stringifies exit 0', async () => {
    runCliErgonomicsCraft.mockResolvedValue(makeOutput({ findings: [finding('advisory')] }));
    await expect(run(['--json'])).rejects.toThrow('exit:0');
    expect(JSON.parse(logOutput[0]).findings).toHaveLength(1);
  });

  it('json error path exit 2', async () => {
    runCliErgonomicsCraft.mockRejectedValue(new Error('boom'));
    await expect(run(['--json'])).rejects.toThrow('exit:2');
    expect(JSON.parse(logOutput[0]).error).toBe('boom');
  });

  it('text error path exit 2', async () => {
    runCliErgonomicsCraft.mockRejectedValue(new Error('kaboom'));
    await expect(run([])).rejects.toThrow('exit:2');
    expect(exitCode).toBe(2);
  });

  it('non-Error rejection stringified', async () => {
    runCliErgonomicsCraft.mockRejectedValue('str-fail');
    await expect(run(['--json'])).rejects.toThrow('exit:2');
    expect(JSON.parse(logOutput[0]).error).toBe('str-fail');
  });

  it('all options forwarded incl parseInt --max-files', async () => {
    runCliErgonomicsCraft.mockResolvedValue(makeOutput());
    await expect(
      run([
        '--files',
        'a.ts',
        '--commands-dir',
        'src/commands',
        '--exclude-dirs',
        'gen',
        '--max-files',
        '6',
      ])
    ).rejects.toThrow('exit:0');
    const input = runCliErgonomicsCraft.mock.calls[0][0];
    expect(input.files).toEqual(['a.ts']);
    expect(input.commandsDir).toBe('src/commands');
    expect(input.excludeDirs).toEqual(['gen']);
    expect(input.maxFiles).toBe(6);
  });
});

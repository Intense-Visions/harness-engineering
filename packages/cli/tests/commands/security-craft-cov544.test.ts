import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { Command } from 'commander';

const runSecurityCraft = vi.fn();

vi.mock('../../src/security-craft/index.js', () => ({
  runSecurityCraft: (...args: unknown[]) => runSecurityCraft(...args),
}));

import { createSecurityCraftCommand } from '../../src/commands/security-craft';

function makeOutput(overrides: Record<string, unknown> = {}): any {
  return {
    findings: [],
    summary: {
      counts: { filesScanned: 3, filesSkippedNoSignal: 1, signalsDetected: 4 },
      catalog: { rubricsApplied: ['r1'] },
      llmCalls: { count: 1, costUsd: 0.2 },
      durationMs: 5,
    },
    ...overrides,
  };
}

const finding = (tier: string, overrides: Record<string, unknown> = {}): any => ({
  code: 'SEC-R001',
  tier,
  impact: 'high',
  confidence: 'low',
  target: { file: 'a.ts', signal: 'eval', line: 7 },
  message: 'dangerous',
  cite: { source: 'OWASP' },
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
  parent.addCommand(createSecurityCraftCommand());
  parent.exitOverride();
  return parent.parseAsync(['node', 'test', 'security-craft', ...args]);
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

describe('security-craft command (cov544)', () => {
  it('text empty prints "No security findings." exit 0', async () => {
    runSecurityCraft.mockResolvedValue(makeOutput());
    await expect(run([])).rejects.toThrow('exit:0');
    expect(logOutput.join('\n')).toContain('No security findings.');
  });

  it('populated grouped by file, exit 0', async () => {
    runSecurityCraft.mockResolvedValue(
      makeOutput({
        findings: [
          finding('advisory'),
          finding('advisory', { target: { file: 'b.ts', signal: 'exec', line: 2 } }),
        ],
      })
    );
    await expect(run([])).rejects.toThrow('exit:0');
    const out = logOutput.join('\n');
    expect(out).toContain('a.ts');
    expect(out).toContain('eval:7');
    expect(out).toContain('across 3 files');
  });

  it('foundational drives exit 1', async () => {
    runSecurityCraft.mockResolvedValue(makeOutput({ findings: [finding('foundational')] }));
    await expect(run([])).rejects.toThrow('exit:1');
    expect(exitCode).toBe(1);
  });

  it('verbose prints source', async () => {
    runSecurityCraft.mockResolvedValue(makeOutput({ findings: [finding('advisory')] }));
    await expect(run(['--verbose'])).rejects.toThrow('exit:0');
    expect(logOutput.join('\n')).toContain('source: OWASP');
  });

  it('scan tally: both counts zero => no-source skipReason branch', async () => {
    runSecurityCraft.mockResolvedValue(
      makeOutput({
        summary: {
          counts: { filesScanned: 0, filesSkippedNoSignal: 0, signalsDetected: 0 },
          catalog: { rubricsApplied: [] },
          llmCalls: { count: 0, costUsd: 0 },
          durationMs: 1,
        },
      })
    );
    await expect(run([])).rejects.toThrow('exit:0');
    expect(logOutput.join('\n')).toContain('No security findings.');
  });

  it('scan tally: filesScanned>0 with no skips (no skipReason branch)', async () => {
    runSecurityCraft.mockResolvedValue(
      makeOutput({
        summary: {
          counts: { filesScanned: 2, filesSkippedNoSignal: 0, signalsDetected: 1 },
          catalog: { rubricsApplied: ['r'] },
          llmCalls: { count: 1, costUsd: 0 },
          durationMs: 1,
        },
      })
    );
    await expect(run([])).rejects.toThrow('exit:0');
    expect(exitCode).toBe(0);
  });

  it('json stringifies exit 0', async () => {
    runSecurityCraft.mockResolvedValue(makeOutput({ findings: [finding('advisory')] }));
    await expect(run(['--json'])).rejects.toThrow('exit:0');
    expect(JSON.parse(logOutput[0]).findings).toHaveLength(1);
  });

  it('json error path exit 2', async () => {
    runSecurityCraft.mockRejectedValue(new Error('boom'));
    await expect(run(['--json'])).rejects.toThrow('exit:2');
    expect(JSON.parse(logOutput[0]).error).toBe('boom');
  });

  it('text error path exit 2', async () => {
    runSecurityCraft.mockRejectedValue(new Error('kaboom'));
    await expect(run([])).rejects.toThrow('exit:2');
    expect(exitCode).toBe(2);
  });

  it('non-Error rejection stringified', async () => {
    runSecurityCraft.mockRejectedValue('str-fail');
    await expect(run(['--json'])).rejects.toThrow('exit:2');
    expect(JSON.parse(logOutput[0]).error).toBe('str-fail');
  });

  it('all options forwarded incl parseInt caps', async () => {
    runSecurityCraft.mockResolvedValue(makeOutput());
    await expect(
      run([
        '--files',
        'a.ts',
        '--packages',
        'core',
        'cli',
        '--max-files',
        '9',
        '--max-signals-per-file',
        '2',
      ])
    ).rejects.toThrow('exit:0');
    const input = runSecurityCraft.mock.calls[0][0];
    expect(input.files).toEqual(['a.ts']);
    expect(input.packages).toEqual(['core', 'cli']);
    expect(input.maxFiles).toBe(9);
    expect(input.maxSignalsPerFile).toBe(2);
  });
});

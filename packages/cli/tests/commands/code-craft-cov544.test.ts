import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { Command } from 'commander';

const runCodeCraft = vi.fn();

vi.mock('../../src/code-craft/index.js', () => ({
  runCodeCraft: (...args: unknown[]) => runCodeCraft(...args),
}));

import { createCodeCraftCommand } from '../../src/commands/code-craft';

function makeOutput(overrides: Record<string, unknown> = {}): any {
  return {
    findings: [],
    summary: {
      counts: { filesScanned: 3, filesSkippedNoUnit: 1, unitsDetected: 5 },
      catalog: { rubricsApplied: ['r1'], exemplarsAvailable: 2 },
      llmCalls: { count: 1, costUsd: 0.2 },
      durationMs: 5,
    },
    ...overrides,
  };
}

const finding = (tier: string, overrides: Record<string, unknown> = {}): any => ({
  code: 'CODE-R001',
  tier,
  impact: 'high',
  confidence: 'high',
  target: { file: 'a.ts', kind: 'function', unit: 'foo', line: 4 },
  message: 'refactor',
  cite: { source: 'Beck' },
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
  parent.addCommand(createCodeCraftCommand());
  parent.exitOverride();
  return parent.parseAsync(['node', 'test', 'code-craft', ...args]);
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

describe('code-craft command (cov544)', () => {
  it('text empty prints "No code-craft findings." exit 0', async () => {
    runCodeCraft.mockResolvedValue(makeOutput());
    await expect(run([])).rejects.toThrow('exit:0');
    expect(logOutput.join('\n')).toContain('No code-craft findings.');
  });

  it('populated grouped by file, exit 0', async () => {
    runCodeCraft.mockResolvedValue(
      makeOutput({
        findings: [
          finding('advisory'),
          finding('advisory', { target: { file: 'b.ts', kind: 'class', unit: 'Bar', line: 1 } }),
        ],
      })
    );
    await expect(run([])).rejects.toThrow('exit:0');
    const out = logOutput.join('\n');
    expect(out).toContain('a.ts');
    expect(out).toContain('function foo:4');
    expect(out).toContain('across 3 files');
  });

  it('foundational drives exit 1', async () => {
    runCodeCraft.mockResolvedValue(makeOutput({ findings: [finding('foundational')] }));
    await expect(run([])).rejects.toThrow('exit:1');
    expect(exitCode).toBe(1);
  });

  it('verbose prints source', async () => {
    runCodeCraft.mockResolvedValue(makeOutput({ findings: [finding('advisory')] }));
    await expect(run(['--verbose'])).rejects.toThrow('exit:0');
    expect(logOutput.join('\n')).toContain('source: Beck');
  });

  it('json stringifies exit 0', async () => {
    runCodeCraft.mockResolvedValue(makeOutput({ findings: [finding('advisory')] }));
    await expect(run(['--json'])).rejects.toThrow('exit:0');
    expect(JSON.parse(logOutput[0]).findings).toHaveLength(1);
  });

  it('json error path exit 2', async () => {
    runCodeCraft.mockRejectedValue(new Error('boom'));
    await expect(run(['--json'])).rejects.toThrow('exit:2');
    expect(JSON.parse(logOutput[0]).error).toBe('boom');
  });

  it('text error path exit 2', async () => {
    runCodeCraft.mockRejectedValue(new Error('kaboom'));
    await expect(run([])).rejects.toThrow('exit:2');
    expect(exitCode).toBe(2);
  });

  it('non-Error rejection stringified', async () => {
    runCodeCraft.mockRejectedValue('str-fail');
    await expect(run(['--json'])).rejects.toThrow('exit:2');
    expect(JSON.parse(logOutput[0]).error).toBe('str-fail');
  });

  it('all options forwarded incl parseInt caps', async () => {
    runCodeCraft.mockResolvedValue(makeOutput());
    await expect(
      run([
        '--files',
        'a.ts',
        '--packages',
        'core',
        '--max-files',
        '6',
        '--max-units-per-file',
        '3',
      ])
    ).rejects.toThrow('exit:0');
    const input = runCodeCraft.mock.calls[0][0];
    expect(input.files).toEqual(['a.ts']);
    expect(input.packages).toEqual(['core']);
    expect(input.maxFiles).toBe(6);
    expect(input.maxUnitsPerFile).toBe(3);
  });
});

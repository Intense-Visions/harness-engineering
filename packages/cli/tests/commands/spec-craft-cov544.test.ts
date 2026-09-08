import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { Command } from 'commander';

const runSpecCraft = vi.fn();

vi.mock('../../src/spec-craft/index.js', () => ({
  runSpecCraft: (...args: unknown[]) => runSpecCraft(...args),
}));

import { createSpecCraftCommand } from '../../src/commands/spec-craft';

function makeOutput(overrides: Record<string, unknown> = {}): any {
  return {
    findings: [],
    summary: {
      docsScanned: 2,
      sectionsScanned: 5,
      catalog: { rubricsApplied: ['r1'] },
      llmCalls: { count: 1, costUsd: 0.3 },
      durationMs: 8,
    },
    ...overrides,
  };
}

const finding = (tier: string, overrides: Record<string, unknown> = {}): any => ({
  code: 'SPEC-R001',
  tier,
  impact: 'high',
  confidence: 'high',
  target: { file: 'proposal.md', section: 'Goals', line: 12 },
  message: 'sharpen it',
  cite: { source: 'Fowler' },
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
  parent.addCommand(createSpecCraftCommand());
  parent.exitOverride();
  return parent.parseAsync(['node', 'test', 'spec-craft', ...args]);
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

describe('spec-craft command (cov544)', () => {
  it('text empty prints "No spec findings." exit 0', async () => {
    runSpecCraft.mockResolvedValue(
      makeOutput({
        summary: {
          docsScanned: 0,
          sectionsScanned: 0,
          catalog: { rubricsApplied: [] },
          llmCalls: { count: 0, costUsd: 0 },
          durationMs: 1,
        },
      })
    );
    await expect(run([])).rejects.toThrow('exit:0');
    expect(logOutput.join('\n')).toContain('No spec findings.');
  });

  it('populated grouped by file, exit 0', async () => {
    runSpecCraft.mockResolvedValue(
      makeOutput({
        findings: [
          finding('advisory'),
          finding('advisory', { target: { file: 'adr.md', section: 'Decision', line: 3 } }),
        ],
      })
    );
    await expect(run([])).rejects.toThrow('exit:0');
    const out = logOutput.join('\n');
    expect(out).toContain('proposal.md');
    expect(out).toContain('## Goals:12');
    expect(out).toContain('across 2 docs');
  });

  it('foundational drives exit 1', async () => {
    runSpecCraft.mockResolvedValue(makeOutput({ findings: [finding('foundational')] }));
    await expect(run([])).rejects.toThrow('exit:1');
    expect(exitCode).toBe(1);
  });

  it('verbose prints source', async () => {
    runSpecCraft.mockResolvedValue(makeOutput({ findings: [finding('advisory')] }));
    await expect(run(['--verbose'])).rejects.toThrow('exit:0');
    expect(logOutput.join('\n')).toContain('source: Fowler');
  });

  it('json stringifies exit 0', async () => {
    runSpecCraft.mockResolvedValue(makeOutput({ findings: [finding('advisory')] }));
    await expect(run(['--json'])).rejects.toThrow('exit:0');
    expect(JSON.parse(logOutput[0]).findings).toHaveLength(1);
  });

  it('json error path exit 2', async () => {
    runSpecCraft.mockRejectedValue(new Error('boom'));
    await expect(run(['--json'])).rejects.toThrow('exit:2');
    expect(JSON.parse(logOutput[0]).error).toBe('boom');
  });

  it('text error path exit 2', async () => {
    runSpecCraft.mockRejectedValue(new Error('kaboom'));
    await expect(run([])).rejects.toThrow('exit:2');
    expect(exitCode).toBe(2);
  });

  it('non-Error rejection stringified', async () => {
    runSpecCraft.mockRejectedValue('str-fail');
    await expect(run(['--json'])).rejects.toThrow('exit:2');
    expect(JSON.parse(logOutput[0]).error).toBe('str-fail');
  });

  it('all options forwarded incl parseInt caps', async () => {
    runSpecCraft.mockResolvedValue(makeOutput());
    await expect(
      run([
        '--files',
        'a.md',
        '--kinds',
        'proposal',
        'adr',
        '--sections',
        'Goals',
        '--max-files',
        '4',
        '--max-sections-per-file',
        '6',
      ])
    ).rejects.toThrow('exit:0');
    const input = runSpecCraft.mock.calls[0][0];
    expect(input.files).toEqual(['a.md']);
    expect(input.kinds).toEqual(['proposal', 'adr']);
    expect(input.sections).toEqual(['Goals']);
    expect(input.maxFiles).toBe(4);
    expect(input.maxSectionsPerFile).toBe(6);
  });
});

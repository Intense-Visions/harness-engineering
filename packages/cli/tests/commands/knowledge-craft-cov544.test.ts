import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { Command } from 'commander';

const runKnowledgeCraft = vi.fn();

vi.mock('../../src/knowledge-craft/index.js', () => ({
  runKnowledgeCraft: (...args: unknown[]) => runKnowledgeCraft(...args),
}));

import { createKnowledgeCraftCommand } from '../../src/commands/knowledge-craft';

function makeOutput(overrides: Record<string, unknown> = {}): any {
  return {
    findings: [],
    summary: {
      counts: { filesScanned: 2, filesSkipped: 1 },
      catalog: { rubricsApplied: ['r1'] },
      llmCalls: { count: 1, costUsd: 0.2 },
      durationMs: 5,
    },
    ...overrides,
  };
}

const finding = (tier: string, overrides: Record<string, unknown> = {}): any => ({
  code: 'KNOW-R001',
  tier,
  impact: 'high',
  confidence: 'high',
  target: { file: 'k.md', relative: 'docs/knowledge/k.md' },
  message: 'load-bearing?',
  cite: { source: 'Graph' },
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
  parent.addCommand(createKnowledgeCraftCommand());
  parent.exitOverride();
  return parent.parseAsync(['node', 'test', 'knowledge-craft', ...args]);
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

describe('knowledge-craft command (cov544)', () => {
  it('text empty prints "No knowledge-entry findings." exit 0', async () => {
    runKnowledgeCraft.mockResolvedValue(makeOutput());
    await expect(run([])).rejects.toThrow('exit:0');
    expect(logOutput.join('\n')).toContain('No knowledge-entry findings.');
  });

  it('populated grouped by file, exit 0', async () => {
    runKnowledgeCraft.mockResolvedValue(
      makeOutput({
        findings: [
          finding('advisory'),
          finding('advisory', { target: { file: 'm.md', relative: 'docs/knowledge/m.md' } }),
        ],
      })
    );
    await expect(run([])).rejects.toThrow('exit:0');
    const out = logOutput.join('\n');
    expect(out).toContain('k.md');
    expect(out).toContain('docs/knowledge/k.md');
    expect(out).toContain('across 2 entries');
  });

  it('foundational drives exit 1', async () => {
    runKnowledgeCraft.mockResolvedValue(makeOutput({ findings: [finding('foundational')] }));
    await expect(run([])).rejects.toThrow('exit:1');
    expect(exitCode).toBe(1);
  });

  it('verbose prints source', async () => {
    runKnowledgeCraft.mockResolvedValue(makeOutput({ findings: [finding('advisory')] }));
    await expect(run(['--verbose'])).rejects.toThrow('exit:0');
    expect(logOutput.join('\n')).toContain('source: Graph');
  });

  it('json stringifies exit 0', async () => {
    runKnowledgeCraft.mockResolvedValue(makeOutput({ findings: [finding('advisory')] }));
    await expect(run(['--json'])).rejects.toThrow('exit:0');
    expect(JSON.parse(logOutput[0]).findings).toHaveLength(1);
  });

  it('json error path exit 2', async () => {
    runKnowledgeCraft.mockRejectedValue(new Error('boom'));
    await expect(run(['--json'])).rejects.toThrow('exit:2');
    expect(JSON.parse(logOutput[0]).error).toBe('boom');
  });

  it('text error path exit 2', async () => {
    runKnowledgeCraft.mockRejectedValue(new Error('kaboom'));
    await expect(run([])).rejects.toThrow('exit:2');
    expect(exitCode).toBe(2);
  });

  it('non-Error rejection stringified', async () => {
    runKnowledgeCraft.mockRejectedValue('str-fail');
    await expect(run(['--json'])).rejects.toThrow('exit:2');
    expect(JSON.parse(logOutput[0]).error).toBe('str-fail');
  });

  it('all options forwarded incl parseInt --max-files', async () => {
    runKnowledgeCraft.mockResolvedValue(makeOutput());
    await expect(
      run(['--files', 'a.md', '--exclude-dirs', 'archive', '--max-files', '5'])
    ).rejects.toThrow('exit:0');
    const input = runKnowledgeCraft.mock.calls[0][0];
    expect(input.files).toEqual(['a.md']);
    expect(input.excludeDirs).toEqual(['archive']);
    expect(input.maxFiles).toBe(5);
  });
});

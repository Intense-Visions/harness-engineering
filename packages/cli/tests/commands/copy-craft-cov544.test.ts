import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { Command } from 'commander';

const runCopyCraft = vi.fn();

vi.mock('../../src/copy-craft/index.js', () => ({
  runCopyCraft: (...args: unknown[]) => runCopyCraft(...args),
}));

import { createCopyCraftCommand } from '../../src/commands/copy-craft';

function makeOutput(overrides: Record<string, unknown> = {}): any {
  return {
    findings: [],
    summary: {
      counts: { error: 0, log: 0, cli: 0 },
      catalog: { rubricsApplied: ['r1'] },
      llmCalls: { count: 1, costUsd: 0.5 },
      durationMs: 10,
      skippedSurfaces: [],
    },
    ...overrides,
  };
}

const finding = (tier: string, overrides: Record<string, unknown> = {}): any => ({
  code: 'COPY-R001',
  tier,
  impact: 'high',
  confidence: 'med',
  target: { surface: 'error', file: 'a.ts', line: 3, snippet: 'x'.repeat(120) },
  message: 'improve it',
  cite: { source: 'Nielsen' },
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
  parent.addCommand(createCopyCraftCommand());
  parent.exitOverride();
  return parent.parseAsync(['node', 'test', 'copy-craft', ...args]);
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

describe('copy-craft command (cov544)', () => {
  it('text empty prints "No copy findings." and exits 0', async () => {
    runCopyCraft.mockResolvedValue(makeOutput());
    await expect(run([])).rejects.toThrow('exit:0');
    expect(logOutput.join('\n')).toContain('No copy findings.');
    expect(logOutput.join('\n')).toContain('no items');
  });

  it('populated findings grouped by surface, non-foundational exit 0; snippet truncated', async () => {
    runCopyCraft.mockResolvedValue(
      makeOutput({
        findings: [
          finding('advisory'),
          finding('advisory', { target: { surface: 'log', file: 'b.ts', snippet: 'short' } }),
        ],
        summary: {
          counts: { error: 1, log: 1 },
          catalog: { rubricsApplied: ['r1'] },
          llmCalls: { count: 1, costUsd: 0.5 },
          durationMs: 10,
          skippedSurfaces: [],
        },
      })
    );
    await expect(run([])).rejects.toThrow('exit:0');
    const out = logOutput.join('\n');
    expect(out).toContain('[error]');
    expect(out).toContain('[log]');
    expect(out).toContain('…');
    expect(out).toContain('error=1, log=1');
  });

  it('foundational drives exit 1', async () => {
    runCopyCraft.mockResolvedValue(makeOutput({ findings: [finding('foundational')] }));
    await expect(run([])).rejects.toThrow('exit:1');
    expect(exitCode).toBe(1);
  });

  it('verbose prints source', async () => {
    runCopyCraft.mockResolvedValue(makeOutput({ findings: [finding('advisory')] }));
    await expect(run(['--verbose'])).rejects.toThrow('exit:0');
    expect(logOutput.join('\n')).toContain('source: Nielsen');
  });

  it('finding without line omits :line', async () => {
    runCopyCraft.mockResolvedValue(
      makeOutput({
        findings: [
          finding('advisory', { target: { surface: 'error', file: 'c.ts', snippet: 'hi' } }),
        ],
      })
    );
    await expect(run([])).rejects.toThrow('exit:0');
    const l = logOutput.find((x) => x.includes('c.ts'));
    expect(l).toBeDefined();
  });

  it('skippedSurfaces block renders when present', async () => {
    runCopyCraft.mockResolvedValue(
      makeOutput({
        summary: {
          counts: {},
          catalog: { rubricsApplied: [] },
          llmCalls: { count: 0, costUsd: 0 },
          durationMs: 1,
          skippedSurfaces: [{ surface: 'pr-description', reason: 'no gh' }],
        },
      })
    );
    await expect(run([])).rejects.toThrow('exit:0');
    const out = logOutput.join('\n');
    expect(out).toContain('Skipped surfaces:');
    expect(out).toContain('pr-description: no gh');
  });

  it('json mode stringifies and exits 0', async () => {
    runCopyCraft.mockResolvedValue(makeOutput({ findings: [finding('advisory')] }));
    await expect(run(['--json'])).rejects.toThrow('exit:0');
    expect(JSON.parse(logOutput[0]).findings).toHaveLength(1);
  });

  it('json error path prints {error} exit 2', async () => {
    runCopyCraft.mockRejectedValue(new Error('boom'));
    await expect(run(['--json'])).rejects.toThrow('exit:2');
    expect(JSON.parse(logOutput[0]).error).toBe('boom');
  });

  it('text error path exits 2', async () => {
    runCopyCraft.mockRejectedValue(new Error('kaboom'));
    await expect(run([])).rejects.toThrow('exit:2');
    expect(exitCode).toBe(2);
  });

  it('non-Error rejection stringified', async () => {
    runCopyCraft.mockRejectedValue('str-fail');
    await expect(run(['--json'])).rejects.toThrow('exit:2');
    expect(JSON.parse(logOutput[0]).error).toBe('str-fail');
  });

  it('all options forwarded incl parseInt of numeric caps', async () => {
    runCopyCraft.mockResolvedValue(makeOutput());
    await expect(
      run([
        '--files',
        'a.ts',
        '--surfaces',
        'error',
        'log',
        '--max-files',
        '7',
        '--max-items-per-file',
        '9',
        '--commits-since',
        '2 weeks ago',
        '--pr-limit',
        '11',
      ])
    ).rejects.toThrow('exit:0');
    const input = runCopyCraft.mock.calls[0][0];
    expect(input.files).toEqual(['a.ts']);
    expect(input.surfaces).toEqual(['error', 'log']);
    expect(input.maxFiles).toBe(7);
    expect(input.maxItemsPerFile).toBe(9);
    expect(input.commitsSince).toBe('2 weeks ago');
    expect(input.prLimit).toBe(11);
  });
});

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { Command } from 'commander';

const runApiCraft = vi.fn();

vi.mock('../../src/api-craft/index.js', () => ({
  runApiCraft: (...args: unknown[]) => runApiCraft(...args),
}));

import { createApiCraftCommand } from '../../src/commands/api-craft';

function makeOutput(overrides: Record<string, unknown> = {}): any {
  return {
    findings: [],
    summary: {
      counts: { filesScanned: 2, filesSkipped: 1 },
      catalog: { rubricsApplied: ['r1'], exemplarsAvailable: 3 },
      llmCalls: { count: 1, costUsd: 0.2 },
      durationMs: 5,
    },
    ...overrides,
  };
}

const finding = (tier: string, overrides: Record<string, unknown> = {}): any => ({
  code: 'API-R001',
  tier,
  impact: 'high',
  confidence: 'high',
  target: { file: 'routes.ts', relative: 'src/routes.ts', kind: 'handler' },
  message: 'fix it',
  cite: { source: 'Fielding' },
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
  parent.addCommand(createApiCraftCommand());
  parent.exitOverride();
  return parent.parseAsync(['node', 'test', 'api-craft', ...args]);
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

describe('api-craft command (cov544)', () => {
  it('text empty prints "No API-craft findings." exit 0', async () => {
    runApiCraft.mockResolvedValue(makeOutput());
    await expect(run([])).rejects.toThrow('exit:0');
    expect(logOutput.join('\n')).toContain('No API-craft findings.');
  });

  it('populated grouped by file, exit 0', async () => {
    runApiCraft.mockResolvedValue(
      makeOutput({
        findings: [
          finding('advisory'),
          finding('advisory', { target: { file: 'x.ts', relative: 'src/x.ts', kind: 'spec' } }),
        ],
      })
    );
    await expect(run([])).rejects.toThrow('exit:0');
    const out = logOutput.join('\n');
    expect(out).toContain('routes.ts');
    expect(out).toContain('API-R001');
    expect(out).toContain('2 API surfaces');
  });

  it('foundational drives exit 1', async () => {
    runApiCraft.mockResolvedValue(makeOutput({ findings: [finding('foundational')] }));
    await expect(run([])).rejects.toThrow('exit:1');
    expect(exitCode).toBe(1);
  });

  it('verbose prints source', async () => {
    runApiCraft.mockResolvedValue(makeOutput({ findings: [finding('advisory')] }));
    await expect(run(['--verbose'])).rejects.toThrow('exit:0');
    expect(logOutput.join('\n')).toContain('source: Fielding');
  });

  it('json stringifies exit 0', async () => {
    runApiCraft.mockResolvedValue(makeOutput({ findings: [finding('advisory')] }));
    await expect(run(['--json'])).rejects.toThrow('exit:0');
    expect(JSON.parse(logOutput[0]).findings).toHaveLength(1);
  });

  it('json error path exit 2', async () => {
    runApiCraft.mockRejectedValue(new Error('boom'));
    await expect(run(['--json'])).rejects.toThrow('exit:2');
    expect(JSON.parse(logOutput[0]).error).toBe('boom');
  });

  it('text error path exit 2', async () => {
    runApiCraft.mockRejectedValue(new Error('kaboom'));
    await expect(run([])).rejects.toThrow('exit:2');
    expect(exitCode).toBe(2);
  });

  it('non-Error rejection stringified', async () => {
    runApiCraft.mockRejectedValue('str-fail');
    await expect(run(['--json'])).rejects.toThrow('exit:2');
    expect(JSON.parse(logOutput[0]).error).toBe('str-fail');
  });

  it('all options forwarded incl parseInt --max-files', async () => {
    runApiCraft.mockResolvedValue(makeOutput());
    await expect(
      run([
        '--files',
        'a.ts',
        '--routes-dir',
        'src/routes',
        '--spec-file',
        'openapi.yaml',
        '--exclude-dirs',
        'gen',
        'vendor',
        '--max-files',
        '8',
      ])
    ).rejects.toThrow('exit:0');
    const input = runApiCraft.mock.calls[0][0];
    expect(input.files).toEqual(['a.ts']);
    expect(input.routesDir).toBe('src/routes');
    expect(input.specFile).toBe('openapi.yaml');
    expect(input.excludeDirs).toEqual(['gen', 'vendor']);
    expect(input.maxFiles).toBe(8);
  });
});

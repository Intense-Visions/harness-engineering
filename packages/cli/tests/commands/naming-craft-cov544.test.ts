import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { Command } from 'commander';

const runNamingCraft = vi.fn();

vi.mock('../../src/naming-craft/index.js', () => ({
  runNamingCraft: (...args: unknown[]) => runNamingCraft(...args),
}));

import { createNamingCraftCommand } from '../../src/commands/naming-craft';

function makeOutput(overrides: Record<string, unknown> = {}): any {
  return {
    findings: [],
    summary: {
      filesScanned: 3,
      catalog: { rubricsApplied: ['r1', 'r2'] },
      llmCalls: { count: 4, costUsd: 0.1234 },
      durationMs: 42,
      convention: {
        variables: 'camelCase',
        functions: 'camelCase',
        types: 'PascalCase',
        files: 'kebab',
      },
    },
    ...overrides,
  };
}

const finding = (tier: string, overrides: Record<string, unknown> = {}): any => ({
  code: 'NAME-R001',
  tier,
  impact: 'high',
  confidence: 'high',
  target: { file: 'a.ts', line: 10, kind: 'variable', identifier: 'x' },
  message: 'rename it',
  cite: { source: 'Martin' },
  ...overrides,
});

let logOutput: string[];
let errOutput: string[];
let exitCode: number | undefined;
const logSpy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
  logOutput.push(a.map(String).join(' '));
});
const errSpy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
  errOutput.push(a.map(String).join(' '));
});
const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
  exitCode = code;
  throw new Error('exit:' + code);
}) as never);

function run(args: string[]): Promise<void> {
  const parent = new Command();
  parent.option('--json').option('--verbose').option('--quiet').option('--cwd <path>');
  parent.addCommand(createNamingCraftCommand());
  parent.exitOverride();
  return parent.parseAsync(['node', 'test', 'naming-craft', ...args]);
}

beforeEach(() => {
  vi.clearAllMocks();
  logOutput = [];
  errOutput = [];
  exitCode = undefined;
});

afterAll(() => {
  logSpy.mockRestore();
  errSpy.mockRestore();
  exitSpy.mockRestore();
});

describe('naming-craft command (cov544)', () => {
  it('text mode: empty findings prints "No naming findings." and exits 0', async () => {
    runNamingCraft.mockResolvedValue(makeOutput());
    await expect(run([])).rejects.toThrow('exit:0');
    expect(exitCode).toBe(0);
    expect(logOutput.join('\n')).toContain('No naming findings.');
    expect(logOutput.join('\n')).toContain('Convention: vars=camelCase');
  });

  it('text mode: populated findings render grouped by file, exit 0 for non-foundational', async () => {
    runNamingCraft.mockResolvedValue(
      makeOutput({
        findings: [
          finding('advisory'),
          finding('advisory', { target: { file: 'a.ts', kind: 'function', identifier: 'y' } }),
        ],
      })
    );
    await expect(run([])).rejects.toThrow('exit:0');
    expect(exitCode).toBe(0);
    const out = logOutput.join('\n');
    expect(out).toContain('a.ts');
    expect(out).toContain('NAME-R001');
    expect(out).toContain('rename it');
  });

  it('foundational finding drives exit code 1', async () => {
    runNamingCraft.mockResolvedValue(makeOutput({ findings: [finding('foundational')] }));
    await expect(run([])).rejects.toThrow('exit:1');
    expect(exitCode).toBe(1);
  });

  it('verbose mode prints source citation', async () => {
    runNamingCraft.mockResolvedValue(makeOutput({ findings: [finding('advisory')] }));
    await expect(run(['--verbose'])).rejects.toThrow('exit:0');
    expect(logOutput.join('\n')).toContain('source: Martin');
  });

  it('convention "?" fallback when undefined', async () => {
    runNamingCraft.mockResolvedValue(
      makeOutput({
        summary: {
          filesScanned: 0,
          catalog: { rubricsApplied: [] },
          llmCalls: { count: 0, costUsd: 0 },
          durationMs: 1,
          convention: {},
        },
      })
    );
    await expect(run([])).rejects.toThrow('exit:0');
    expect(logOutput.join('\n')).toContain('vars=?, funcs=?');
  });

  it('finding without line omits the :line suffix', async () => {
    runNamingCraft.mockResolvedValue(
      makeOutput({
        findings: [
          finding('advisory', { target: { file: 'b.ts', kind: 'type', identifier: 'Z' } }),
        ],
      })
    );
    await expect(run([])).rejects.toThrow('exit:0');
    const line = logOutput.find((l) => l.includes('type Z'));
    expect(line).toBeDefined();
    expect(line).not.toContain('Z:');
  });

  it('json mode stringifies the whole result and exits 0', async () => {
    runNamingCraft.mockResolvedValue(makeOutput({ findings: [finding('advisory')] }));
    await expect(run(['--json'])).rejects.toThrow('exit:0');
    const parsed = JSON.parse(logOutput[0]);
    expect(parsed.findings).toHaveLength(1);
  });

  it('json mode error path prints {error} and exits 2', async () => {
    runNamingCraft.mockRejectedValue(new Error('boom'));
    await expect(run(['--json'])).rejects.toThrow('exit:2');
    expect(exitCode).toBe(2);
    expect(JSON.parse(logOutput[0]).error).toBe('boom');
  });

  it('text mode error path logs via logger.error and exits 2', async () => {
    runNamingCraft.mockRejectedValue(new Error('kaboom'));
    await expect(run([])).rejects.toThrow('exit:2');
    expect(exitCode).toBe(2);
  });

  it('non-Error rejection is stringified', async () => {
    runNamingCraft.mockRejectedValue('str-fail');
    await expect(run(['--json'])).rejects.toThrow('exit:2');
    expect(JSON.parse(logOutput[0]).error).toBe('str-fail');
  });

  it('option parsing: --files, --kinds, --max-files, --max-identifiers-per-file forwarded to input', async () => {
    runNamingCraft.mockResolvedValue(makeOutput());
    await expect(
      run([
        '--files',
        'a.ts',
        'b.ts',
        '--kinds',
        'variable',
        '--max-files',
        '5',
        '--max-identifiers-per-file',
        '3',
      ])
    ).rejects.toThrow('exit:0');
    const input = runNamingCraft.mock.calls[0][0];
    expect(input.files).toEqual(['a.ts', 'b.ts']);
    expect(input.kinds).toEqual(['variable']);
    expect(input.maxFiles).toBe(5);
    expect(input.maxIdentifiersPerFile).toBe(3);
  });
});

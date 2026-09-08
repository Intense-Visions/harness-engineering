import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { Command } from 'commander';

const runTestCraft = vi.fn();

vi.mock('../../src/test-craft/index.js', () => ({
  runTestCraft: (...args: unknown[]) => runTestCraft(...args),
}));

import { createTestCraftCommand } from '../../src/commands/test-craft';

function makeSummary(overrides: Record<string, unknown> = {}): any {
  return {
    counts: {
      testsExtracted: 10,
      filesScanned: 3,
      sourcePaired: 2,
      critiqueErrors: 0,
      testsTruncated: 0,
    },
    frameworksDetected: { vitest: 5, jest: 0 },
    llmCalls: { count: 4, costUsd: 0.4 },
    durationMs: 9,
    ...overrides,
  };
}

function makeOutput(overrides: Record<string, unknown> = {}): any {
  return { findings: [], summary: makeSummary(), ...overrides };
}

const finding = (tier: string, overrides: Record<string, unknown> = {}): any => ({
  code: 'TEST-R001',
  tier,
  impact: 'high',
  confidence: 'high',
  target: {
    file: 'a.test.ts',
    framework: 'vitest',
    line: 5,
    nesting: ['describe'],
    testName: 'does x',
  },
  message: 'weak assertion',
  cite: { source: 'Meszaros' },
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
  parent.addCommand(createTestCraftCommand());
  parent.exitOverride();
  return parent.parseAsync(['node', 'test', 'test-craft', ...args]);
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

describe('test-craft command (cov544)', () => {
  it('empty + zero testsExtracted prints "No tests found to critique."', async () => {
    runTestCraft.mockResolvedValue(
      makeOutput({
        summary: makeSummary({
          counts: {
            testsExtracted: 0,
            filesScanned: 0,
            sourcePaired: 0,
            critiqueErrors: 0,
            testsTruncated: 0,
          },
        }),
      })
    );
    await expect(run([])).rejects.toThrow('exit:0');
    expect(logOutput.join('\n')).toContain('No tests found to critique.');
  });

  it('empty + tests extracted but 0 LLM calls prints ABSTAINED', async () => {
    runTestCraft.mockResolvedValue(
      makeOutput({
        summary: makeSummary({
          counts: {
            testsExtracted: 4,
            filesScanned: 1,
            sourcePaired: 1,
            critiqueErrors: 0,
            testsTruncated: 0,
          },
          llmCalls: { count: 0, costUsd: 0 },
        }),
      })
    );
    await expect(run([])).rejects.toThrow('exit:0');
    expect(logOutput.join('\n')).toContain('ABSTAINED');
  });

  it('empty + extracted + LLM ran prints "No test findings."', async () => {
    runTestCraft.mockResolvedValue(makeOutput());
    await expect(run([])).rejects.toThrow('exit:0');
    expect(logOutput.join('\n')).toContain('No test findings.');
  });

  it('populated grouped by file with nesting, exit 0', async () => {
    runTestCraft.mockResolvedValue(
      makeOutput({
        findings: [
          finding('advisory'),
          finding('advisory', {
            target: {
              file: 'b.test.ts',
              framework: 'jest',
              line: 1,
              nesting: [],
              testName: 'no nest',
            },
          }),
        ],
      })
    );
    await expect(run([])).rejects.toThrow('exit:0');
    const out = logOutput.join('\n');
    expect(out).toContain('a.test.ts');
    expect(out).toContain('describe > does x');
    expect(out).toContain('no nest');
    expect(out).toContain('frameworks: vitest=5');
  });

  it('foundational drives exit 1', async () => {
    runTestCraft.mockResolvedValue(makeOutput({ findings: [finding('foundational')] }));
    await expect(run([])).rejects.toThrow('exit:1');
    expect(exitCode).toBe(1);
  });

  it('verbose prints source', async () => {
    runTestCraft.mockResolvedValue(makeOutput({ findings: [finding('advisory')] }));
    await expect(run(['--verbose'])).rejects.toThrow('exit:0');
    expect(logOutput.join('\n')).toContain('source: Meszaros');
  });

  it('warning branches: critiqueErrors, testsTruncated, and no-source-pair NOTE', async () => {
    runTestCraft.mockResolvedValue(
      makeOutput({
        summary: makeSummary({
          counts: {
            testsExtracted: 8,
            filesScanned: 2,
            sourcePaired: 0,
            critiqueErrors: 2,
            testsTruncated: 3,
          },
          frameworksDetected: {},
        }),
      })
    );
    await expect(run([])).rejects.toThrow('exit:0');
    const out = logOutput.join('\n');
    expect(out).toContain('WARNING: 2 critique(s) failed');
    expect(out).toContain('WARNING: 3 test(s) dropped');
    expect(out).toContain('NOTE: no test file resolved');
    expect(out).toContain('frameworks: none');
  });

  it('json stringifies exit 0', async () => {
    runTestCraft.mockResolvedValue(makeOutput({ findings: [finding('advisory')] }));
    await expect(run(['--json'])).rejects.toThrow('exit:0');
    expect(JSON.parse(logOutput[0]).findings).toHaveLength(1);
  });

  it('json error path exit 2', async () => {
    runTestCraft.mockRejectedValue(new Error('boom'));
    await expect(run(['--json'])).rejects.toThrow('exit:2');
    expect(JSON.parse(logOutput[0]).error).toBe('boom');
  });

  it('text error path exit 2', async () => {
    runTestCraft.mockRejectedValue(new Error('kaboom'));
    await expect(run([])).rejects.toThrow('exit:2');
    expect(exitCode).toBe(2);
  });

  it('non-Error rejection stringified', async () => {
    runTestCraft.mockRejectedValue('str-fail');
    await expect(run(['--json'])).rejects.toThrow('exit:2');
    expect(JSON.parse(logOutput[0]).error).toBe('str-fail');
  });

  it('all options forwarded incl --no-source-pair and --emit and parseInt caps', async () => {
    runTestCraft.mockResolvedValue(makeOutput());
    await expect(
      run([
        '--files',
        'a.test.ts',
        '--frameworks',
        'vitest',
        'jest',
        '--max-files',
        '9',
        '--max-tests-per-file',
        '4',
        '--no-source-pair',
        '--emit',
        'out.json',
      ])
    ).rejects.toThrow('exit:0');
    const input = runTestCraft.mock.calls[0][0];
    expect(input.files).toEqual(['a.test.ts']);
    expect(input.frameworks).toEqual(['vitest', 'jest']);
    expect(input.maxFiles).toBe(9);
    expect(input.maxTestsPerFile).toBe(4);
    // `--no-source-pair` reaches the input as `sourcePair: false` since the
    // #1882 fix; before it, the source read `opts.noSourcePair` while Commander
    // stored the negatable flag under `sourcePair`, so the flag was inert.
    expect(input.sourcePair).toBe(false);
    expect(input.emitTo).toBe('out.json');
  });
});

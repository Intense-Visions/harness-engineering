import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { Command } from 'commander';

const runDocsCraft = vi.fn();

vi.mock('../../src/docs-craft/index.js', () => ({
  runDocsCraft: (...args: unknown[]) => runDocsCraft(...args),
}));

import { createDocsCraftCommand } from '../../src/commands/docs-craft';

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
  code: 'DOC-R001',
  tier,
  impact: 'high',
  confidence: 'high',
  target: { file: 'guide.md', relative: 'docs/guide.md', kind: 'guide' },
  message: 'teach better',
  cite: { source: 'Diataxis' },
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
  parent.addCommand(createDocsCraftCommand());
  parent.exitOverride();
  return parent.parseAsync(['node', 'test', 'docs-craft', ...args]);
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

describe('docs-craft command (cov544)', () => {
  it('text empty prints "No documentation-craft findings." exit 0', async () => {
    runDocsCraft.mockResolvedValue(makeOutput());
    await expect(run([])).rejects.toThrow('exit:0');
    expect(logOutput.join('\n')).toContain('No documentation-craft findings.');
  });

  it('populated grouped by file, exit 0', async () => {
    runDocsCraft.mockResolvedValue(
      makeOutput({
        findings: [
          finding('advisory'),
          finding('advisory', {
            target: { file: 'ref.md', relative: 'docs/ref.md', kind: 'reference' },
          }),
        ],
      })
    );
    await expect(run([])).rejects.toThrow('exit:0');
    const out = logOutput.join('\n');
    expect(out).toContain('guide.md');
    expect(out).toContain('docs/guide.md (guide)');
    expect(out).toContain('across 2 docs');
  });

  it('foundational drives exit 1', async () => {
    runDocsCraft.mockResolvedValue(makeOutput({ findings: [finding('foundational')] }));
    await expect(run([])).rejects.toThrow('exit:1');
    expect(exitCode).toBe(1);
  });

  it('verbose prints source', async () => {
    runDocsCraft.mockResolvedValue(makeOutput({ findings: [finding('advisory')] }));
    await expect(run(['--verbose'])).rejects.toThrow('exit:0');
    expect(logOutput.join('\n')).toContain('source: Diataxis');
  });

  it('json stringifies exit 0', async () => {
    runDocsCraft.mockResolvedValue(makeOutput({ findings: [finding('advisory')] }));
    await expect(run(['--json'])).rejects.toThrow('exit:0');
    expect(JSON.parse(logOutput[0]).findings).toHaveLength(1);
  });

  it('json error path exit 2', async () => {
    runDocsCraft.mockRejectedValue(new Error('boom'));
    await expect(run(['--json'])).rejects.toThrow('exit:2');
    expect(JSON.parse(logOutput[0]).error).toBe('boom');
  });

  it('text error path exit 2', async () => {
    runDocsCraft.mockRejectedValue(new Error('kaboom'));
    await expect(run([])).rejects.toThrow('exit:2');
    expect(exitCode).toBe(2);
  });

  it('non-Error rejection stringified', async () => {
    runDocsCraft.mockRejectedValue('str-fail');
    await expect(run(['--json'])).rejects.toThrow('exit:2');
    expect(JSON.parse(logOutput[0]).error).toBe('str-fail');
  });

  it('all options forwarded incl parseInt --max-files', async () => {
    runDocsCraft.mockResolvedValue(makeOutput());
    await expect(
      run(['--files', 'a.md', '--exclude-dirs', 'gen', '--max-files', '7'])
    ).rejects.toThrow('exit:0');
    const input = runDocsCraft.mock.calls[0][0];
    expect(input.files).toEqual(['a.md']);
    expect(input.excludeDirs).toEqual(['gen']);
    expect(input.maxFiles).toBe(7);
  });
});

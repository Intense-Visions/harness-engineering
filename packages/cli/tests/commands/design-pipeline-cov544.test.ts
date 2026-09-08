import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

const state = vi.hoisted(() => ({
  behavior: 'ok' as 'ok' | 'throw',
  result: {} as Record<string, unknown>,
  lastInput: undefined as unknown,
}));

vi.mock('../../src/design-pipeline/index.js', () => ({
  runDesignPipeline: async (input: unknown) => {
    state.lastInput = input;
    if (state.behavior === 'throw') throw new Error('boom');
    return state.result;
  },
}));

import { createDesignPipelineCommand } from '../../src/commands/design-pipeline';

function makeContext(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    verdict: 'pass',
    inputs: {
      designMdExists: true,
      tokensJsonExists: false,
      componentRegistryExists: true,
      brandRulesExist: false,
    },
    driftFindings: [{ code: 'DRIFT-T001' }],
    summary: {
      iterationsRun: 1,
      fixesApplied: 2,
      totalFindings: 3,
      bySeverity: { error: 1, warn: 1, info: 1 },
      durationMs: 12,
    },
    auditFindings: { anatomy: [], brand: [{ code: 'BRAND-V001' }] },
    bootstrapped: { designMd: true, tokensJson: false },
    craftSuggestions: 4,
    verifiersRun: ['detect-design-drift', 'align'],
    verifiersFailed: [{ name: 'audit-brand', error: 'crashed' }],
    exclusions: new Set(['a', 'b']),
    ...overrides,
  };
}

interface RunOutcome {
  exitCode: number | null;
  logs: string[];
}

async function run(args: string[], globalFlags: string[] = []): Promise<RunOutcome> {
  const program = new Command();
  program.option('--json');
  program.option('--quiet');
  program.option('--cwd <path>');
  program.addCommand(createDesignPipelineCommand());

  let exitCode: number | null = null;
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    exitCode = code ?? 0;
    throw new Error(`__exit__:${exitCode}`);
  }) as never);
  const logs: string[] = [];
  const logSpy = vi.spyOn(console, 'log').mockImplementation((m?: unknown) => {
    logs.push(String(m));
  });

  try {
    await program.parseAsync([...globalFlags, 'design-pipeline', ...args], { from: 'user' });
  } catch (err) {
    if (!(err instanceof Error) || !err.message.startsWith('__exit__')) throw err;
  } finally {
    exitSpy.mockRestore();
    logSpy.mockRestore();
  }
  return { exitCode, logs };
}

describe('design-pipeline command', () => {
  beforeEach(() => {
    state.behavior = 'ok';
    state.result = makeContext();
    state.lastInput = undefined;
  });

  it('prints a text report and exits SUCCESS on a pass verdict', async () => {
    const { exitCode, logs } = await run([]);
    expect(exitCode).toBe(0);
    const joined = logs.join('\n');
    expect(joined).toContain('Verdict: ✓ pass');
    expect(joined).toContain('drift findings: 1');
    expect(joined).toContain('Verifiers run: detect-design-drift, align');
    expect(joined).toContain('Verifiers failed (degraded):');
    expect(joined).toContain('audit-brand: crashed');
  });

  it('exits VALIDATION_FAILED on a fail verdict', async () => {
    state.result = makeContext({ verdict: 'fail' });
    const { exitCode, logs } = await run([]);
    expect(exitCode).toBe(1);
    expect(logs.join('\n')).toContain('✗ fail');
  });

  it('renders a warn verdict with no bootstrapped inputs and no failed verifiers', async () => {
    state.result = makeContext({
      verdict: 'warn',
      bootstrapped: { designMd: false, tokensJson: false },
      verifiersRun: [],
      verifiersFailed: [],
    });
    const { exitCode, logs } = await run([]);
    expect(exitCode).toBe(0);
    const joined = logs.join('\n');
    expect(joined).toContain('⚠ warn');
    expect(joined).toContain('bootstrapped: none');
    expect(joined).not.toContain('Verifiers run:');
    expect(joined).not.toContain('Verifiers failed');
  });

  it('emits JSON with exclusions serialized as an array', async () => {
    const { exitCode, logs } = await run([], ['--json']);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(logs.join('\n'));
    expect(Array.isArray(parsed.exclusions)).toBe(true);
    expect(parsed.exclusions).toEqual(['a', 'b']);
  });

  it('reports an orchestrator failure as text and exits ERROR', async () => {
    state.behavior = 'throw';
    const { exitCode } = await run([]);
    expect(exitCode).toBe(2);
  });

  it('reports an orchestrator failure as JSON when --json is set', async () => {
    state.behavior = 'throw';
    const { exitCode, logs } = await run([], ['--json']);
    expect(exitCode).toBe(2);
    expect(JSON.parse(logs.join('\n'))).toMatchObject({ error: 'boom' });
  });

  it('threads CLI options into the pipeline input', async () => {
    await run([
      '--fix',
      '--ci',
      '--files',
      'a.tsx',
      'b.tsx',
      '--mode',
      'full',
      '--design-strictness',
      'strict',
    ]);
    expect(state.lastInput).toMatchObject({
      fix: true,
      ci: true,
      files: ['a.tsx', 'b.tsx'],
      mode: 'full',
      designStrictness: 'strict',
    });
  });

  it('defaults optional flags off (fix/ci absent from input)', async () => {
    await run([]);
    const input = state.lastInput as Record<string, unknown>;
    expect(input.fix).toBeUndefined();
    expect(input.ci).toBeUndefined();
    // mode has a commander default of 'fast'
    expect(input.mode).toBe('fast');
  });
});

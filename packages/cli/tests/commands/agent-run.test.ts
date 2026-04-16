import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../../src/config/loader', () => ({
  resolveConfig: vi.fn(),
}));

vi.mock('@harness-engineering/core', () => ({
  Ok: (val: unknown) => ({ ok: true, value: val }),
  Err: (err: unknown) => ({ ok: false, error: err }),
  requestPeerReview: vi.fn(),
}));

vi.mock('../../src/output/logger', () => ({
  logger: {
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    dim: vi.fn(),
  },
}));

vi.mock('../../src/persona/loader', () => ({
  loadPersona: vi.fn(),
}));

vi.mock('../../src/persona/runner', () => ({
  runPersona: vi.fn(),
}));

vi.mock('../../src/persona/skill-executor', () => ({
  executeSkill: vi.fn(),
}));

vi.mock('../../src/persona/constants', () => ({
  ALLOWED_PERSONA_COMMANDS: new Set(['review', 'doc-review']),
}));

vi.mock('../../src/utils/paths', () => ({
  resolvePersonasDir: vi.fn(() => '/fake/personas'),
}));

// ── Imports after mocks ────────────────────────────────────────────────────

import { resolveConfig } from '../../src/config/loader';
import { requestPeerReview } from '@harness-engineering/core';
import { runAgentTask, createRunCommand } from '../../src/commands/agent/run';
import { CLIError, ExitCode } from '../../src/utils/errors';
import { loadPersona } from '../../src/persona/loader';
import { runPersona } from '../../src/persona/runner';

const mockedResolveConfig = vi.mocked(resolveConfig);
const mockedRequestPeerReview = vi.mocked(requestPeerReview);

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('createRunCommand', () => {
  it('creates a command named run', () => {
    const cmd = createRunCommand();
    expect(cmd.name()).toBe('run');
  });

  it('has --timeout, --persona, and --trigger options', () => {
    const cmd = createRunCommand();
    const longs = cmd.options.map((o) => o.long);
    expect(longs).toContain('--timeout');
    expect(longs).toContain('--persona');
    expect(longs).toContain('--trigger');
  });
});

describe('runAgentTask', () => {
  it('returns Err when config resolution fails', async () => {
    mockedResolveConfig.mockReturnValue({
      ok: false,
      error: new CLIError('No config', ExitCode.ERROR),
    } as never);

    const result = await runAgentTask('review', {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('No config');
    }
  });

  it('returns Err for unknown task', async () => {
    mockedResolveConfig.mockReturnValue({
      ok: true,
      value: { rootDir: '/project' },
    } as never);

    const result = await runAgentTask('nonexistent', {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Unknown task: nonexistent');
      expect(result.error.message).toContain('Available:');
    }
  });

  it('returns Ok with success=true when review is approved', async () => {
    mockedResolveConfig.mockReturnValue({
      ok: true,
      value: { rootDir: '/project' },
    } as never);
    mockedRequestPeerReview.mockResolvedValue({
      ok: true,
      value: {
        approved: true,
        comments: [],
      },
    } as never);

    const result = await runAgentTask('review', {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.success).toBe(true);
      expect(result.value.output).toContain('completed successfully');
    }
  });

  it('returns Ok with success=false when review is rejected', async () => {
    mockedResolveConfig.mockReturnValue({
      ok: true,
      value: { rootDir: '/project' },
    } as never);
    mockedRequestPeerReview.mockResolvedValue({
      ok: true,
      value: {
        approved: false,
        comments: [{ message: 'Missing tests' }, { message: 'Bad naming' }],
      },
    } as never);

    const result = await runAgentTask('review', {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.success).toBe(false);
      expect(result.value.output).toContain('found issues');
      expect(result.value.output).toContain('Missing tests');
      expect(result.value.output).toContain('Bad naming');
    }
  });

  it('returns Err when requestPeerReview fails', async () => {
    mockedResolveConfig.mockReturnValue({
      ok: true,
      value: { rootDir: '/project' },
    } as never);
    mockedRequestPeerReview.mockResolvedValue({
      ok: false,
      error: { message: 'Agent timeout' },
    } as never);

    const result = await runAgentTask('review', {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Agent task failed');
      expect(result.error.message).toContain('Agent timeout');
    }
  });

  it('maps doc-review to documentation-maintainer agent', async () => {
    mockedResolveConfig.mockReturnValue({
      ok: true,
      value: { rootDir: '/project' },
    } as never);
    mockedRequestPeerReview.mockResolvedValue({
      ok: true,
      value: { approved: true, comments: [] },
    } as never);

    await runAgentTask('doc-review', {});
    expect(mockedRequestPeerReview).toHaveBeenCalledWith(
      'documentation-maintainer',
      expect.any(Object),
      expect.any(Object)
    );
  });

  it('maps test-review to test-reviewer agent', async () => {
    mockedResolveConfig.mockReturnValue({
      ok: true,
      value: { rootDir: '/project' },
    } as never);
    mockedRequestPeerReview.mockResolvedValue({
      ok: true,
      value: { approved: true, comments: [] },
    } as never);

    await runAgentTask('test-review', {});
    expect(mockedRequestPeerReview).toHaveBeenCalledWith(
      'test-reviewer',
      expect.any(Object),
      expect.any(Object)
    );
  });

  it('uses custom timeout from options', async () => {
    mockedResolveConfig.mockReturnValue({
      ok: true,
      value: { rootDir: '/project' },
    } as never);
    mockedRequestPeerReview.mockResolvedValue({
      ok: true,
      value: { approved: true, comments: [] },
    } as never);

    await runAgentTask('review', { timeout: 60000 });
    expect(mockedRequestPeerReview).toHaveBeenCalledWith(
      'architecture-enforcer',
      expect.any(Object),
      expect.objectContaining({ timeout: 60000 })
    );
  });

  it('uses agent.timeout from config when no option given', async () => {
    mockedResolveConfig.mockReturnValue({
      ok: true,
      value: { rootDir: '/project', agent: { timeout: 120000 } },
    } as never);
    mockedRequestPeerReview.mockResolvedValue({
      ok: true,
      value: { approved: true, comments: [] },
    } as never);

    await runAgentTask('review', {});
    expect(mockedRequestPeerReview).toHaveBeenCalledWith(
      'architecture-enforcer',
      expect.any(Object),
      expect.objectContaining({ timeout: 120000 })
    );
  });
});

describe('action handler', () => {
  const exitError = new Error('process.exit');
  let mockExit: ReturnType<typeof vi.spyOn>;
  let mockConsoleLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockExit = vi.spyOn(process, 'exit').mockImplementation(((code: number) => {
      throw exitError;
    }) as never);
    mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    mockExit.mockRestore();
    mockConsoleLog.mockRestore();
  });

  async function safeParseAsync(program: any, args: string[]) {
    try {
      await program.parseAsync(args);
    } catch (e) {
      if (e !== exitError) throw e;
    }
  }

  function makeProgram() {
    const { Command } = require('commander');
    const program = new Command();
    program.option('--json', 'JSON output');
    program.option('--quiet', 'Quiet output');
    program.option('-c, --config <path>', 'Config');
    const agentCmd = new Command('agent');
    agentCmd.addCommand(createRunCommand());
    program.addCommand(agentCmd);
    return program;
  }

  it('exits with error when no task and no persona provided', async () => {
    const program = makeProgram();
    await safeParseAsync(program, ['node', 'test', 'agent', 'run']);

    expect(mockExit).toHaveBeenCalledWith(2);
  });

  it('runs task successfully and exits with SUCCESS', async () => {
    mockedResolveConfig.mockReturnValue({
      ok: true,
      value: { rootDir: '/project' },
    } as never);
    mockedRequestPeerReview.mockResolvedValue({
      ok: true,
      value: { approved: true, comments: [] },
    } as never);

    const program = makeProgram();
    await safeParseAsync(program, ['node', 'test', 'agent', 'run', 'review']);

    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('exits with error when task fails', async () => {
    mockedResolveConfig.mockReturnValue({
      ok: true,
      value: { rootDir: '/project' },
    } as never);
    mockedRequestPeerReview.mockResolvedValue({
      ok: false,
      error: { message: 'Agent timeout' },
    } as never);

    const program = makeProgram();
    await safeParseAsync(program, ['node', 'test', 'agent', 'run', 'review']);

    expect(mockExit).toHaveBeenCalledWith(2);
  });

  it('runs persona mode when --persona is provided', async () => {
    vi.mocked(loadPersona).mockReturnValue({
      ok: true,
      value: {
        name: 'test-persona',
        skills: [],
        triggers: ['manual'],
        steps: [],
      },
    });
    vi.mocked(runPersona).mockResolvedValue({
      persona: 'test-persona',
      status: 'pass',
      steps: [],
    });

    const program = makeProgram();
    await safeParseAsync(program, ['node', 'test', 'agent', 'run', '--persona', 'test-persona']);

    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('exits with error when persona loading fails', async () => {
    vi.mocked(loadPersona).mockReturnValue({
      ok: false,
      error: new Error('Persona not found'),
    });

    const program = makeProgram();
    await safeParseAsync(program, ['node', 'test', 'agent', 'run', '--persona', 'missing-persona']);

    expect(mockExit).toHaveBeenCalledWith(2);
  });

  it('exits with error when persona execution fails', async () => {
    vi.mocked(loadPersona).mockReturnValue({
      ok: true,
      value: {
        name: 'fail-persona',
        skills: [],
        triggers: ['manual'],
        steps: [],
      },
    });
    vi.mocked(runPersona).mockResolvedValue({
      persona: 'fail-persona',
      status: 'fail',
      steps: [
        {
          name: 'step1',
          type: 'command',
          status: 'fail',
          durationMs: 100,
        },
      ],
    });

    const program = makeProgram();
    await safeParseAsync(program, ['node', 'test', 'agent', 'run', '--persona', 'fail-persona']);

    expect(mockExit).toHaveBeenCalledWith(2);
  });

  it('prints persona step details with artifact paths', async () => {
    vi.mocked(loadPersona).mockReturnValue({
      ok: true,
      value: {
        name: 'detailed-persona',
        skills: [],
        triggers: ['manual'],
        steps: [],
      },
    });
    vi.mocked(runPersona).mockResolvedValue({
      persona: 'detailed-persona',
      status: 'pass',
      steps: [
        {
          name: 'step1',
          type: 'skill',
          status: 'pass',
          durationMs: 100,
          artifactPath: '/tmp/artifact.md',
        },
        {
          name: 'step2',
          type: 'command',
          status: 'skip',
          durationMs: 0,
        },
      ],
    });

    const program = makeProgram();
    await safeParseAsync(program, [
      'node',
      'test',
      'agent',
      'run',
      '--persona',
      'detailed-persona',
    ]);

    expect(mockExit).toHaveBeenCalledWith(0);
    expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('artifact'));
  });
});

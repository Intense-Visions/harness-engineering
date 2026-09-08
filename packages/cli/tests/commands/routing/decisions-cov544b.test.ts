import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { Command } from 'commander';

const getJson = vi.fn();
vi.mock('../../../src/commands/routing/http-client', () => ({
  getJson: (...a: unknown[]) => getJson(...a),
  orchestratorBase: () => 'http://127.0.0.1:8080',
}));

import { createDecisionsCommand } from '../../../src/commands/routing/decisions';

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

function run(args: string[]): Promise<unknown> {
  const parent = new Command();
  parent.addCommand(createDecisionsCommand());
  parent.exitOverride();
  return parent.parseAsync(['decisions', ...args], { from: 'user' });
}

function decision(useCase: unknown, backendName = 'claude'): unknown {
  return {
    timestamp: '2026-05-26T12:34:56.789Z',
    useCase,
    backendName,
    durationMs: 12.345,
  };
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

describe('routing decisions command (cov544b)', () => {
  it('prints the empty-buffer notice when there are no decisions', async () => {
    getJson.mockResolvedValue({ ok: true, status: 200, body: { decisions: [] } });
    await run([]);
    expect(logOutput.join('\n')).toContain('(no decisions in buffer)');
  });

  it('renders every use-case kind in the human table', async () => {
    getJson.mockResolvedValue({
      ok: true,
      status: 200,
      body: {
        decisions: [
          decision({ kind: 'skill', skillName: 'tdd', cognitiveMode: 'design' }),
          decision({ kind: 'skill', skillName: 'plan' }),
          decision({ kind: 'mode', cognitiveMode: 'exec' }),
          decision({ kind: 'tier', tier: 'fast' }),
          decision({ kind: 'intelligence', layer: 'L2' }),
          decision({ kind: 'isolation', tier: 'hi' }),
          decision({ kind: 'maintenance' }),
          decision({ kind: 'chat' }),
        ],
      },
    });
    await run([]);
    const out = logOutput.join('\n');
    expect(out).toContain('TIMESTAMP');
    expect(out).toContain('skill:tdd/design');
    expect(out).toContain('skill:plan');
    expect(out).toContain('mode:exec');
    expect(out).toContain('tier:fast');
    expect(out).toContain('intelligence:L2');
    expect(out).toContain('isolation:hi');
    expect(out).toContain('maintenance');
    expect(out).toContain('chat');
    expect(out).toContain('12.35 ms');
    // shortIso strips the date and trailing Z
    expect(out).toContain('12:34:56.789');
  });

  it('forwards --skill/--mode/--backend/--last as AND-combined query params', async () => {
    getJson.mockResolvedValue({ ok: true, status: 200, body: { decisions: [] } });
    await run(['--skill', 'tdd', '--mode', 'design', '--backend', 'claude', '--last', '5']);
    const path = getJson.mock.calls[0]![0] as string;
    expect(path).toContain('/api/v1/routing/decisions?');
    expect(path).toContain('skill=tdd');
    expect(path).toContain('mode=design');
    expect(path).toContain('backend=claude');
    expect(path).toContain('limit=5');
  });

  it('sends no query string when no filters are given', async () => {
    getJson.mockResolvedValue({ ok: true, status: 200, body: { decisions: [] } });
    await run([]);
    expect(getJson.mock.calls[0]![0]).toBe('/api/v1/routing/decisions');
  });

  it('emits raw JSON with --json', async () => {
    const body = { decisions: [decision({ kind: 'chat' })] };
    getJson.mockResolvedValue({ ok: true, status: 200, body });
    await run(['--json']);
    expect(JSON.parse(logOutput.join('\n'))).toEqual(body);
  });

  it('does nothing extra when body is null', async () => {
    getJson.mockResolvedValue({ ok: true, status: 200, body: null });
    await run([]);
    expect(logOutput.join('\n')).not.toContain('TIMESTAMP');
  });

  it('reports unreachable orchestrator (status 0) and exits ERROR', async () => {
    getJson.mockResolvedValue({ ok: false, status: 0, error: 'refused' });
    await expect(run([])).rejects.toThrow('exit:2');
    expect(errOutput.join('\n')).toContain('Failed to reach orchestrator');
  });

  it('reports the 503 legacy message', async () => {
    getJson.mockResolvedValue({ ok: false, status: 503 });
    await expect(run([])).rejects.toThrow('exit:2');
    expect(errOutput.join('\n')).toContain('no BackendRouter');
  });

  it('reports a generic failure otherwise', async () => {
    getJson.mockResolvedValue({ ok: false, status: 418, error: 'teapot' });
    await expect(run([])).rejects.toThrow('exit:2');
    expect(errOutput.join('\n')).toContain('Request failed (418)');
    expect(errOutput.join('\n')).toContain('teapot');
  });
});

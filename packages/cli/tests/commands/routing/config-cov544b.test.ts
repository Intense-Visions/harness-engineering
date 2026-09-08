import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { Command } from 'commander';

const getJson = vi.fn();
vi.mock('../../../src/commands/routing/http-client', () => ({
  getJson: (...a: unknown[]) => getJson(...a),
  orchestratorBase: () => 'http://127.0.0.1:8080',
}));

import { createConfigCommand } from '../../../src/commands/routing/config';

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
  parent.addCommand(createConfigCommand());
  parent.exitOverride();
  return parent.parseAsync(['config', ...args], { from: 'user' });
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

describe('routing config command (cov544b)', () => {
  it('renders human output with backends and resolved chains (exists + MISSING)', async () => {
    getJson.mockResolvedValue({
      ok: true,
      status: 200,
      body: {
        routing: {},
        backends: ['claude', 'ollama'],
        resolvedChains: {
          'skill:tdd': [
            { candidate: 'claude', exists: true },
            { candidate: 'ollama', exists: false },
          ],
        },
      },
    });
    await run([]);
    const out = logOutput.join('\n');
    expect(out).toContain('Backends:');
    expect(out).toContain('- claude');
    expect(out).toContain('- ollama');
    expect(out).toContain('Resolved Chains:');
    expect(out).toContain('skill:tdd: claude -> ollama(MISSING)');
  });

  it('renders (none) when there are no resolved chains', async () => {
    getJson.mockResolvedValue({
      ok: true,
      status: 200,
      body: { routing: {}, backends: ['claude'], resolvedChains: {} },
    });
    await run([]);
    expect(logOutput.join('\n')).toContain('(none)');
  });

  it('emits raw JSON when --json is passed', async () => {
    const body = { routing: { x: 1 }, backends: ['a'], resolvedChains: {} };
    getJson.mockResolvedValue({ ok: true, status: 200, body });
    await run(['--json']);
    const parsed = JSON.parse(logOutput.join('\n'));
    expect(parsed).toEqual(body);
  });

  it('does nothing extra when body is null in human mode', async () => {
    getJson.mockResolvedValue({ ok: true, status: 200, body: null });
    await run([]);
    expect(logOutput.join('\n')).not.toContain('Backends:');
  });

  it('reports unreachable orchestrator (status 0) and exits ERROR', async () => {
    getJson.mockResolvedValue({ ok: false, status: 0, error: 'ECONNREFUSED' });
    await expect(run([])).rejects.toThrow('exit:2');
    expect(exitCode).toBe(2);
    expect(errOutput.join('\n')).toContain('Failed to reach orchestrator');
    expect(errOutput.join('\n')).toContain('ECONNREFUSED');
  });

  it('reports the legacy single-backend 503 message', async () => {
    getJson.mockResolvedValue({ ok: false, status: 503, error: '' });
    await expect(run([])).rejects.toThrow('exit:2');
    expect(errOutput.join('\n')).toContain('no BackendRouter');
  });

  it('reports a generic failure for other non-2xx statuses', async () => {
    getJson.mockResolvedValue({ ok: false, status: 500, error: 'boom' });
    await expect(run([])).rejects.toThrow('exit:2');
    expect(errOutput.join('\n')).toContain('Request failed (500)');
    expect(errOutput.join('\n')).toContain('boom');
  });

  it('status 0 with no error string falls back to "unknown error"', async () => {
    getJson.mockResolvedValue({ ok: false, status: 0 });
    await expect(run([])).rejects.toThrow('exit:2');
    expect(errOutput.join('\n')).toContain('unknown error');
  });
});

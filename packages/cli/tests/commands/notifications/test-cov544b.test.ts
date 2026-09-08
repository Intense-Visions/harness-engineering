import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { Command } from 'commander';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createNotificationsTestSubcommand } from '../../../src/commands/notifications/test';

const SLACK_URL = 'https://hooks.slack.com/services/T/B/X';

let tmpDir: string;
let originalFetch: typeof fetch | undefined;
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

function writeConfig(content: unknown): void {
  fs.writeFileSync(path.join(tmpDir, 'harness.config.json'), JSON.stringify(content, null, 2));
}

function run(sinkId: string, flags: string[] = []): Promise<unknown> {
  const parent = new Command();
  parent.option('--json').option('--cwd <dir>');
  parent.addCommand(createNotificationsTestSubcommand());
  return parent.parseAsync(['test', sinkId, '--cwd', tmpDir, ...flags], { from: 'user' });
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-notif-cov544b-'));
  originalFetch = globalThis.fetch;
  logOutput = [];
  errOutput = [];
  exitCode = undefined;
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  if (originalFetch) globalThis.fetch = originalFetch;
  delete process.env['CLI_TEST_SLACK_URL'];
});

afterAll(() => {
  logSpy.mockRestore();
  errSpy.mockRestore();
  exitSpy.mockRestore();
});

describe('notifications test subcommand action (cov544b)', () => {
  it('logs success and exits SUCCESS when delivery works (unwrapped payload)', async () => {
    process.env['CLI_TEST_SLACK_URL'] = SLACK_URL;
    writeConfig({
      version: 1,
      notifications: {
        sinks: [
          {
            id: 'team',
            kind: 'slack',
            events: ['notification.*'],
            config: { webhookUrlEnv: 'CLI_TEST_SLACK_URL' },
          },
        ],
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(run('team')).rejects.toThrow('exit:0');
    expect(exitCode).toBe(0);
    expect(logOutput.join('\n')).toContain("Delivered to sink 'team'");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('logs an error and exits ERROR for an unknown sink', async () => {
    process.env['CLI_TEST_SLACK_URL'] = SLACK_URL;
    writeConfig({
      version: 1,
      notifications: {
        sinks: [
          {
            id: 'team',
            kind: 'slack',
            events: ['maintenance.*'],
            config: { webhookUrlEnv: 'CLI_TEST_SLACK_URL' },
          },
        ],
      },
    });
    await expect(run('nope')).rejects.toThrow('exit:2');
    expect(exitCode).toBe(2);
    expect(errOutput.join('\n')).toContain("No sink named 'nope'");
  });

  it('emits the JSON result object in --json mode', async () => {
    writeConfig({ version: 1 });
    await expect(run('any', ['--json'])).rejects.toThrow('exit:2');
    const parsed = JSON.parse(logOutput.join('\n'));
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain('No notification sinks');
  });

  it('reports a SinkConfigError (missing env var) via runNotificationsTest', async () => {
    writeConfig({
      version: 1,
      notifications: {
        sinks: [
          {
            id: 'team',
            kind: 'slack',
            events: ['maintenance.*'],
            config: { webhookUrlEnv: 'MISSING_FOR_TEST_COV544B' },
          },
        ],
      },
    });
    await expect(run('team')).rejects.toThrow('exit:2');
    expect(errOutput.join('\n')).toContain('MISSING_FOR_TEST_COV544B');
  });

  it('surfaces a failed delivery result as an error exit', async () => {
    process.env['CLI_TEST_SLACK_URL'] = SLACK_URL;
    writeConfig({
      version: 1,
      notifications: {
        sinks: [
          {
            id: 'team',
            kind: 'slack',
            events: ['notification.*'],
            config: { webhookUrlEnv: 'CLI_TEST_SLACK_URL' },
          },
        ],
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response('nope', { status: 500 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(run('team')).rejects.toThrow('exit:2');
    expect(exitCode).toBe(2);
    expect(errOutput.join('\n').length).toBeGreaterThan(0);
  });

  it('falls back to process.cwd() when no --cwd global option is set', async () => {
    process.env['CLI_TEST_SLACK_URL'] = SLACK_URL;
    writeConfig({
      version: 1,
      notifications: {
        sinks: [
          {
            id: 'team',
            kind: 'slack',
            events: ['notification.*'],
            config: { webhookUrlEnv: 'CLI_TEST_SLACK_URL' },
          },
        ],
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    try {
      const parent = new Command();
      parent.option('--json');
      parent.addCommand(createNotificationsTestSubcommand());
      await expect(parent.parseAsync(['test', 'team'], { from: 'user' })).rejects.toThrow('exit:0');
    } finally {
      cwdSpy.mockRestore();
    }
    expect(exitCode).toBe(0);
  });

  it('runNotificationsTest defaults projectRoot to process.cwd()', async () => {
    const { runNotificationsTest } = await import('../../../src/commands/notifications/test');
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    writeConfig({ version: 1 });
    try {
      // Called with only two args → third (projectRoot) uses its default.
      const result = await runNotificationsTest('any', {});
      expect(result.ok).toBe(false);
      expect(result.error).toContain('No notification sinks');
    } finally {
      cwdSpy.mockRestore();
    }
  });

  it('returns a Config error when harness.config.json is malformed', async () => {
    fs.writeFileSync(path.join(tmpDir, 'harness.config.json'), '{ not: valid json ');
    const { runNotificationsTest } = await import('../../../src/commands/notifications/test');
    const result = await runNotificationsTest('team', {}, tmpDir);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Config error:');
  });

  it('creates a subcommand named test', () => {
    const cmd = createNotificationsTestSubcommand();
    expect(cmd.name()).toBe('test');
  });
});

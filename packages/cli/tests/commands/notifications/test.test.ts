import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const SLACK_URL = 'https://hooks.slack.com/services/T/B/X';

let originalFetch: typeof fetch | undefined;
let tmpDir: string;

function writeConfig(content: unknown): void {
  fs.writeFileSync(path.join(tmpDir, 'harness.config.json'), JSON.stringify(content, null, 2));
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-notif-cli-'));
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  if (originalFetch) globalThis.fetch = originalFetch;
  delete process.env['CLI_TEST_SLACK_URL'];
});

describe('runNotificationsTest', () => {
  it('returns an error when no sinks are configured', async () => {
    writeConfig({ version: 1 });
    const { runNotificationsTest } = await import('../../../src/commands/notifications/test');
    const result = await runNotificationsTest('any', {}, tmpDir);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('No notification sinks');
  });

  it('returns an error when the sink id is unknown', async () => {
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
    const { runNotificationsTest } = await import('../../../src/commands/notifications/test');
    const result = await runNotificationsTest('does-not-exist', {}, tmpDir);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("No sink named 'does-not-exist'");
    expect(result.error).toContain('team');
  });

  it('returns an error when env var is missing', async () => {
    writeConfig({
      version: 1,
      notifications: {
        sinks: [
          {
            id: 'team',
            kind: 'slack',
            events: ['maintenance.*'],
            config: { webhookUrlEnv: 'MISSING_FOR_TEST' },
          },
        ],
      },
    });
    const { runNotificationsTest } = await import('../../../src/commands/notifications/test');
    const result = await runNotificationsTest('team', {}, tmpDir);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('MISSING_FOR_TEST');
  });

  it('delivers a test event when sink is configured', async () => {
    process.env['CLI_TEST_SLACK_URL'] = SLACK_URL;
    writeConfig({
      version: 1,
      notifications: {
        sinks: [
          {
            id: 'team',
            kind: 'slack',
            events: ['notification.*'],
            wrap_response: true,
            config: { webhookUrlEnv: 'CLI_TEST_SLACK_URL' },
          },
        ],
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { runNotificationsTest } = await import('../../../src/commands/notifications/test');
    const result = await runNotificationsTest('team', { message: 'custom' }, tmpDir);
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body) as { text: string };
    expect(body.text).toContain('Test');
  });
});

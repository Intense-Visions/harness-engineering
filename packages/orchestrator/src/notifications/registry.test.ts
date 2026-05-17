import { describe, it, expect, vi } from 'vitest';
import type { NotificationsConfig } from '@harness-engineering/types';
import { SinkConfigError, SinkRegistry } from './registry';

const SLACK_URL = 'https://hooks.slack.com/services/T/B/X';

function cfg(over: Partial<NotificationsConfig> = {}): NotificationsConfig {
  return {
    sinks: [],
    ...over,
  };
}

describe('SinkRegistry.fromConfig', () => {
  it('returns an empty registry when no sinks are configured', () => {
    const r = SinkRegistry.fromConfig(cfg(), { env: {} });
    expect(r.list()).toHaveLength(0);
    expect(r.ids()).toEqual([]);
  });

  it('builds a Slack sink from env-var-backed URL', () => {
    const r = SinkRegistry.fromConfig(
      cfg({
        sinks: [
          {
            id: 'team',
            kind: 'slack',
            events: ['maintenance.*'],
            wrap_response: true,
            config: { webhookUrlEnv: 'HARNESS_SLACK_TEST_URL' },
          },
        ],
      }),
      { env: { HARNESS_SLACK_TEST_URL: SLACK_URL } }
    );
    expect(r.list()).toHaveLength(1);
    const entry = r.get('team');
    expect(entry?.adapter.kind).toBe('slack');
    expect(entry?.adapter.id).toBe('team');
  });

  it('throws SinkConfigError when env var is missing', () => {
    expect(() =>
      SinkRegistry.fromConfig(
        cfg({
          sinks: [
            {
              id: 'team',
              kind: 'slack',
              events: ['x'],
              wrap_response: false,
              config: { webhookUrlEnv: 'NOPE' },
            },
          ],
        }),
        { env: {} }
      )
    ).toThrow(SinkConfigError);
  });

  it('rejects non-slack-hooks URLs', () => {
    expect(() =>
      SinkRegistry.fromConfig(
        cfg({
          sinks: [
            {
              id: 'team',
              kind: 'slack',
              events: ['x'],
              wrap_response: false,
              config: { webhookUrl: 'https://example.com/hook' },
            },
          ],
        }),
        { env: {} }
      )
    ).toThrow(SinkConfigError);
  });

  it('disposes each adapter on dispose()', async () => {
    const disposeSpy = vi.fn().mockResolvedValue(undefined);
    const r = SinkRegistry.fromConfig(
      cfg({
        sinks: [
          {
            id: 'team',
            kind: 'slack',
            events: ['x'],
            wrap_response: false,
            config: { webhookUrlEnv: 'HARNESS_SLACK_TEST_URL' },
          },
        ],
      }),
      { env: { HARNESS_SLACK_TEST_URL: SLACK_URL } }
    );
    // Inject dispose method on the live adapter
    (r.list()[0]!.adapter as unknown as { dispose: typeof disposeSpy }).dispose = disposeSpy;
    await r.dispose();
    expect(disposeSpy).toHaveBeenCalledTimes(1);
  });
});

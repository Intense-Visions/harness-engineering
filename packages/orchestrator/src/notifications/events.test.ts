import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { NotificationsConfig } from '@harness-engineering/types';
import { SinkRegistry } from './registry';
import { wireNotificationSinks } from './events';

const SLACK_URL = 'https://hooks.slack.com/services/T/B/X';

function okResp(): Response {
  return new Response('ok', { status: 200 });
}

function cfgWithSink(
  over: { events?: string[]; wrap_response?: boolean } = {}
): NotificationsConfig {
  return {
    sinks: [
      {
        id: 'team',
        kind: 'slack',
        events: over.events ?? ['maintenance.*'],
        wrap_response: over.wrap_response ?? false,
        config: { webhookUrlEnv: 'HARNESS_SLACK_TEST_URL' },
      },
    ],
  };
}

describe('wireNotificationSinks', () => {
  it('delivers a matching event to the configured sink', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResp());
    const registry = SinkRegistry.fromConfig(cfgWithSink(), {
      env: { HARNESS_SLACK_TEST_URL: SLACK_URL },
      fetchImpl,
    });
    const bus = new EventEmitter();
    wireNotificationSinks({ bus, registry });
    bus.emit('maintenance:completed', { taskId: 't1' });
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('ignores events that do not match the sink filter', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResp());
    const registry = SinkRegistry.fromConfig(cfgWithSink({ events: ['interaction.*'] }), {
      env: { HARNESS_SLACK_TEST_URL: SLACK_URL },
      fetchImpl,
    });
    const bus = new EventEmitter();
    wireNotificationSinks({ bus, registry });
    bus.emit('maintenance:completed', { taskId: 't1' });
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('wraps the payload when wrap_response is true', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResp());
    const registry = SinkRegistry.fromConfig(cfgWithSink({ wrap_response: true }), {
      env: { HARNESS_SLACK_TEST_URL: SLACK_URL },
      fetchImpl,
    });
    const bus = new EventEmitter();
    wireNotificationSinks({ bus, registry });
    bus.emit('maintenance:completed', { taskId: 'task-id' });
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchImpl.mock.calls[0]![1].body) as { text: string };
    expect(body.text).toContain('task-id');
  });

  it('returns an unsubscribe function that detaches all listeners', () => {
    const bus = new EventEmitter();
    const registry = SinkRegistry.fromConfig({ sinks: [] }, { env: {} });
    const before = bus.eventNames().length;
    const off = wireNotificationSinks({ bus, registry });
    expect(bus.eventNames().length).toBeGreaterThan(before);
    off();
    expect(bus.eventNames().length).toBe(before);
  });

  it('emits notification.delivery.failed when sink returns non-2xx', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('boom', { status: 500 }));
    const registry = SinkRegistry.fromConfig(cfgWithSink(), {
      env: { HARNESS_SLACK_TEST_URL: SLACK_URL },
      fetchImpl,
    });
    const bus = new EventEmitter();
    wireNotificationSinks({ bus, registry });
    const failed = vi.fn();
    bus.on('notification.delivery.failed', failed);
    bus.emit('maintenance:completed', { taskId: 't1' });
    await new Promise((r) => setTimeout(r, 30));
    expect(failed).toHaveBeenCalledTimes(1);
    expect(failed.mock.calls[0]![0].sinkId).toBe('team');
  });
});

import { describe, it, expect } from 'vitest';
import {
  NotificationEnvelopeSchema,
  NotificationSinkConfigSchema,
  NotificationsConfigSchema,
  NotificationDeliveryResultSchema,
} from '../src/notifications';

describe('NotificationEnvelopeSchema', () => {
  it('parses a minimal envelope', () => {
    const r = NotificationEnvelopeSchema.safeParse({
      title: 'Hello',
      summary: 'world',
      severity: 'info',
    });
    expect(r.success).toBe(true);
  });

  it('accepts optional fields', () => {
    const r = NotificationEnvelopeSchema.safeParse({
      title: 'Job done',
      summary: 'OK',
      severity: 'success',
      actions: [{ label: 'View', url: 'https://example.com/x' }],
      permalink: 'https://example.com/y',
      correlationId: 'corr_1',
    });
    expect(r.success).toBe(true);
  });

  it('rejects oversized title', () => {
    const r = NotificationEnvelopeSchema.safeParse({
      title: 'a'.repeat(281),
      summary: '',
      severity: 'info',
    });
    expect(r.success).toBe(false);
  });

  it('rejects an action without a valid URL', () => {
    const r = NotificationEnvelopeSchema.safeParse({
      title: 't',
      summary: 's',
      severity: 'info',
      actions: [{ label: 'X', url: 'not-a-url' }],
    });
    expect(r.success).toBe(false);
  });

  it('rejects unknown severity', () => {
    const r = NotificationEnvelopeSchema.safeParse({
      title: 't',
      summary: 's',
      severity: 'critical',
    });
    expect(r.success).toBe(false);
  });

  it('caps actions at 5', () => {
    const tooMany = Array.from({ length: 6 }, (_, i) => ({
      label: `a${i}`,
      url: 'https://example.com/',
    }));
    const r = NotificationEnvelopeSchema.safeParse({
      title: 't',
      summary: 's',
      severity: 'info',
      actions: tooMany,
    });
    expect(r.success).toBe(false);
  });
});

describe('NotificationSinkConfigSchema', () => {
  it('parses a Slack sink', () => {
    const r = NotificationSinkConfigSchema.safeParse({
      id: 'team-slack',
      kind: 'slack',
      events: ['maintenance.*'],
      wrap_response: true,
      config: { webhookUrlEnv: 'HARNESS_SLACK_WEBHOOK_URL' },
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.wrap_response).toBe(true);
    }
  });

  it('defaults wrap_response to false', () => {
    const r = NotificationSinkConfigSchema.parse({
      id: 'team-slack',
      kind: 'slack',
      events: ['maintenance.completed'],
    });
    expect(r.wrap_response).toBe(false);
    expect(r.config).toEqual({});
  });

  it('rejects unknown kind', () => {
    const r = NotificationSinkConfigSchema.safeParse({
      id: 'x',
      kind: 'discord',
      events: ['foo'],
    });
    expect(r.success).toBe(false);
  });

  it('rejects non-kebab id', () => {
    const r = NotificationSinkConfigSchema.safeParse({
      id: 'Team_Slack',
      kind: 'slack',
      events: ['foo'],
    });
    expect(r.success).toBe(false);
  });

  it('requires at least one event glob', () => {
    const r = NotificationSinkConfigSchema.safeParse({
      id: 'x',
      kind: 'slack',
      events: [],
    });
    expect(r.success).toBe(false);
  });
});

describe('NotificationsConfigSchema', () => {
  it('defaults sinks to []', () => {
    const r = NotificationsConfigSchema.parse({});
    expect(r.sinks).toEqual([]);
  });

  it('parses a list of sinks', () => {
    const r = NotificationsConfigSchema.parse({
      sinks: [
        { id: 's1', kind: 'slack', events: ['x'] },
        { id: 's2', kind: 'slack', events: ['y'] },
      ],
    });
    expect(r.sinks).toHaveLength(2);
  });
});

describe('NotificationDeliveryResultSchema', () => {
  it('parses an Ok result', () => {
    const r = NotificationDeliveryResultSchema.safeParse({
      ok: true,
      deliveredAt: 1700000000000,
    });
    expect(r.success).toBe(true);
  });

  it('parses an Err result with http status', () => {
    const r = NotificationDeliveryResultSchema.safeParse({
      ok: false,
      error: 'HTTP 429',
      httpStatus: 429,
    });
    expect(r.success).toBe(true);
  });

  it('rejects an Err result missing error', () => {
    const r = NotificationDeliveryResultSchema.safeParse({
      ok: false,
      httpStatus: 500,
    });
    expect(r.success).toBe(false);
  });
});

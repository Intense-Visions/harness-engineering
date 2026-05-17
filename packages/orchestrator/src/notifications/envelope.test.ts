import { describe, it, expect } from 'vitest';
import type { GatewayEvent } from '@harness-engineering/types';
import { wrapAsEnvelope } from './envelope';

function event(type: string, data: unknown, correlationId?: string): GatewayEvent {
  return {
    id: 'evt_test',
    type,
    timestamp: new Date().toISOString(),
    data,
    ...(correlationId ? { correlationId } : {}),
  };
}

describe('wrapAsEnvelope', () => {
  it('wraps maintenance.started with info severity', () => {
    const env = wrapAsEnvelope(event('maintenance.started', { taskId: 'sync-main' }));
    expect(env.severity).toBe('info');
    expect(env.title).toContain('sync-main');
  });

  it('wraps maintenance.completed with success severity', () => {
    const env = wrapAsEnvelope(event('maintenance.completed', { taskId: 'sync-main' }));
    expect(env.severity).toBe('success');
  });

  it('wraps maintenance.error with error severity and surfaces the error', () => {
    const env = wrapAsEnvelope(event('maintenance.error', { taskId: 'sync-main', error: 'oops' }));
    expect(env.severity).toBe('error');
    expect(env.summary).toContain('oops');
  });

  it('wraps interaction.created with warning severity', () => {
    const env = wrapAsEnvelope(event('interaction.created', { question: 'rebase?' }));
    expect(env.severity).toBe('warning');
    expect(env.title).toContain('rebase');
  });

  it('wraps notification.test', () => {
    const env = wrapAsEnvelope(event('notification.test', { message: 'hi' }));
    expect(env.severity).toBe('info');
    expect(env.summary).toBe('hi');
  });

  it('falls back to a generic envelope for unknown types', () => {
    const env = wrapAsEnvelope(event('custom.unknown', { foo: 'bar' }));
    expect(env.title).toBe('custom.unknown');
    expect(env.summary).toContain('foo');
    expect(env.summary).toContain('bar');
  });

  it('falls back severity is heuristic from type suffix', () => {
    expect(wrapAsEnvelope(event('foo.error', {})).severity).toBe('error');
    expect(wrapAsEnvelope(event('foo.completed', {})).severity).toBe('success');
    expect(wrapAsEnvelope(event('foo.bar', {})).severity).toBe('info');
  });

  it('carries correlationId through to the envelope', () => {
    const env = wrapAsEnvelope(event('maintenance.started', { taskId: 't' }, 'corr_42'));
    expect(env.correlationId).toBe('corr_42');
  });

  it('truncates an absurdly long title', () => {
    const env = wrapAsEnvelope(event('maintenance.started', { taskId: 'x'.repeat(500) }));
    expect(env.title.length).toBeLessThanOrEqual(280);
  });
});

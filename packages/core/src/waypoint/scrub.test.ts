import { describe, it, expect } from 'vitest';
import type { SdlcEvent } from '@harness-engineering/types';
import { bestEffortScrub, REDACTED } from './scrub';

function eventWith(data?: Readonly<Record<string, unknown>>): SdlcEvent {
  return {
    specversion: '1.0',
    id: '01J9F3ZK7QW5X8M2N4P6R8T0AB',
    source: 'harness://repo/test',
    type: 'sdlc.build.finished.v1',
    time: '2026-09-04T18:21:07.000Z',
    subject: 'item/example',
    actor: { kind: 'human', id: 'user://chad' },
    ...(data !== undefined ? { data } : {}),
  };
}

describe('waypoint/scrub', () => {
  it('passes through events without data untouched', () => {
    const event = eventWith();
    const outcome = bestEffortScrub(event);
    expect(outcome.event).toBe(event);
    expect(outcome.redactions).toBe(0);
  });

  it('passes through clean data untouched (same reference)', () => {
    const event = eventWith({ note: 'all clear' });
    const outcome = bestEffortScrub(event);
    expect(outcome.event).toBe(event);
    expect(outcome.redactions).toBe(0);
  });

  it('redacts secret-shaped strings anywhere in data', () => {
    const event = eventWith({
      aws: 'key AKIAABCDEFGHIJKLMNOP trailing',
      nested: { gh: 'ghp_' + 'a'.repeat(24) },
      list: ['Bearer abcdefghijklmnopqrstuv'],
      kv: 'password=hunter2hunter2',
    });
    const outcome = bestEffortScrub(event);
    expect(outcome.redactions).toBe(4);
    const data = outcome.event.data as Record<string, unknown>;
    expect(data.aws).toContain(REDACTED);
    expect((data.nested as Record<string, unknown>).gh).toBe(REDACTED);
    expect((data.list as string[])[0]).toBe(REDACTED);
    expect(data.kv).toBe(REDACTED);
  });

  it('does not mutate the original event', () => {
    const original = eventWith({ token: 'api_key: sk-' + 'x'.repeat(24) });
    const outcome = bestEffortScrub(original);
    expect(outcome.redactions).toBeGreaterThan(0);
    expect((original.data as Record<string, unknown>).token).toContain('sk-');
  });

  it('preserves non-string values', () => {
    const event = eventWith({ count: 3, flag: true, nothing: null });
    const outcome = bestEffortScrub(event);
    expect(outcome.event.data).toEqual({ count: 3, flag: true, nothing: null });
  });
});

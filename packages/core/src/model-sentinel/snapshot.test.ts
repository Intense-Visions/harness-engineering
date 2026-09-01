import { describe, it, expect } from 'vitest';
import { snapshotModelIdentities, fnv1aHex } from './snapshot';

const NOW = new Date('2026-08-31T12:00:00.000Z');

describe('snapshotModelIdentities', () => {
  it('normalises string and array models to sorted, de-duped lists', () => {
    const snap = snapshotModelIdentities(
      {
        primary: { type: 'anthropic', model: 'claude-opus-4-8' },
        local: { type: 'local', model: ['qwen3', 'qwen3', 'llama3'] },
      },
      NOW
    );
    expect(snap.backends).toEqual([
      { backend: 'local', type: 'local', models: ['llama3', 'qwen3'] },
      { backend: 'primary', type: 'anthropic', models: ['claude-opus-4-8'] },
    ]);
    expect(snap.takenAt).toBe(NOW.toISOString());
  });

  it('produces an identical digest for semantically identical configs', () => {
    const a = snapshotModelIdentities(
      { p: { type: 'anthropic', model: 'm1' }, l: { type: 'local', model: ['x', 'y'] } },
      NOW
    );
    const b = snapshotModelIdentities(
      { l: { type: 'local', model: ['y', 'x'] }, p: { type: 'anthropic', model: 'm1' } },
      new Date('2027-01-01T00:00:00.000Z')
    );
    expect(a.digest).toBe(b.digest);
  });

  it('produces a different digest when a model id changes', () => {
    const before = snapshotModelIdentities({ p: { type: 'anthropic', model: 'm1' } }, NOW);
    const after = snapshotModelIdentities({ p: { type: 'anthropic', model: 'm2' } }, NOW);
    expect(after.digest).not.toBe(before.digest);
  });

  it('handles missing/undefined backends without throwing', () => {
    expect(snapshotModelIdentities(undefined, NOW).backends).toEqual([]);
    expect(snapshotModelIdentities({}, NOW).backends).toEqual([]);
  });

  it('reads defensively: skips non-object defs and coerces bad model fields', () => {
    const snap = snapshotModelIdentities(
      {
        good: { type: 'anthropic', model: 'm1' },
        noType: { model: 'm2' },
        junkModel: { type: 'local', model: 42 },
        notObject: 'nope',
      } as Record<string, unknown>,
      NOW
    );
    const byName = Object.fromEntries(snap.backends.map((b) => [b.backend, b]));
    expect(byName['good']).toEqual({ backend: 'good', type: 'anthropic', models: ['m1'] });
    expect(byName['noType']).toEqual({ backend: 'noType', type: 'unknown', models: ['m2'] });
    expect(byName['junkModel']).toEqual({ backend: 'junkModel', type: 'local', models: [] });
    expect(byName['notObject']).toBeUndefined();
  });
});

describe('fnv1aHex', () => {
  it('is deterministic and 8 hex chars', () => {
    const h = fnv1aHex('hello');
    expect(h).toMatch(/^[0-9a-f]{8}$/);
    expect(fnv1aHex('hello')).toBe(h);
    expect(fnv1aHex('hellp')).not.toBe(h);
  });
});

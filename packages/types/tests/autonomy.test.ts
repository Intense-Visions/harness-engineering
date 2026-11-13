import { describe, it, expect } from 'vitest';
import { AUTONOMY_LEVELS, AUTONOMY_SOURCES, DEFAULT_AUTONOMY_AUDIT } from '../src/index';
import type { ResolvedAutonomy, AutonomySessionOverride } from '../src/index';

describe('autonomy contract', () => {
  it('defines exactly two levels', () => {
    expect(AUTONOMY_LEVELS).toEqual(['supervised', 'trusted']);
  });
  it('lists sources in precedence order (highest first)', () => {
    expect(AUTONOMY_SOURCES).toEqual(['flag', 'session', 'env', 'user-config', 'default']);
  });
  it('defaults audit on for trusted and off for supervised (D9)', () => {
    expect(DEFAULT_AUTONOMY_AUDIT).toEqual({ trusted: true, supervised: false });
  });
  it('ResolvedAutonomy and per-field override shapes compile', () => {
    const r: ResolvedAutonomy = {
      level: 'supervised',
      audit: false,
      source: { level: 'default', audit: 'default' },
      warnings: [],
    };
    const o: AutonomySessionOverride = {
      level: { value: 'trusted', setAt: '2026-01-01T00:00:00.000Z', origin: 'cli' },
    };
    expect(r.source.level).toBe('default');
    expect(o.level?.origin).toBe('cli');
  });
});

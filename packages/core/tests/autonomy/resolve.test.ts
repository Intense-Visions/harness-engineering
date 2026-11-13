import { describe, it, expect } from 'vitest';
import type { AutonomyLevel, AutonomySessionOverride } from '@harness-engineering/types';
import { resolveAutonomy, type ResolveAutonomyInput } from '../../src/autonomy/resolve';

const NO_FILE = () => undefined;
const cfg = (obj: unknown) => () => JSON.stringify(obj);
const T0 = '2026-01-01T00:00:00.000Z';
const sess = (level?: AutonomyLevel, audit?: boolean, setAt = T0): AutonomySessionOverride => ({
  ...(level !== undefined && { level: { value: level, setAt, origin: 'cli' as const } }),
  ...(audit !== undefined && { audit: { value: audit, setAt, origin: 'cli' as const } }),
});
const run = (input: ResolveAutonomyInput) =>
  resolveAutonomy({ env: {}, readFile: NO_FILE, ...input });

describe('resolveAutonomy precedence (SC6)', () => {
  it.each([
    { name: 'default', input: {}, exp: ['supervised', 'default', false, 'default'] },
    {
      name: 'user config level; audit defaults per level',
      input: { readFile: cfg({ autonomy: { level: 'trusted' } }) },
      exp: ['trusted', 'user-config', true, 'default'],
    },
    {
      name: 'user config per-level audit',
      input: { readFile: cfg({ autonomy: { level: 'trusted', audit: { trusted: false } } }) },
      exp: ['trusted', 'user-config', false, 'user-config'],
    },
    {
      name: 'env beats user config',
      input: {
        env: { HARNESS_AUTONOMY: 'supervised', HARNESS_AUTONOMY_AUDIT: 'on' },
        readFile: cfg({ autonomy: { level: 'trusted', audit: { supervised: false } } }),
      },
      exp: ['supervised', 'env', true, 'env'],
    },
    {
      name: 'session beats env',
      input: {
        sessionOverride: sess('trusted', false),
        env: { HARNESS_AUTONOMY: 'supervised', HARNESS_AUTONOMY_AUDIT: 'on' },
      },
      exp: ['trusted', 'session', false, 'session'],
    },
    {
      name: 'flag beats session',
      input: {
        flag: { level: 'supervised' as const, audit: true },
        sessionOverride: sess('trusted', false),
      },
      exp: ['supervised', 'flag', true, 'flag'],
    },
    {
      name: 'fields resolve independently',
      input: { flag: { audit: true }, env: { HARNESS_AUTONOMY: 'supervised' } },
      exp: ['supervised', 'env', true, 'flag'],
    },
  ])('$name', ({ input, exp }) => {
    const r = run(input as ResolveAutonomyInput);
    expect([r.level, r.source.level, r.audit, r.source.audit]).toEqual(exp);
    expect(r.warnings).toEqual([]);
  });
});

describe('resolveAutonomy fail-soft warnings', () => {
  it('malformed JSON user config → defaults + one warning', () => {
    const r = run({ readFile: () => '{not json' });
    expect([r.level, r.source.level]).toEqual(['supervised', 'default']);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatch(/malformed/i);
  });
  it('schema-invalid user config → defaults + one warning', () => {
    const r = run({ readFile: cfg({ autonomy: { level: 'yolo' } }) });
    expect(r.source.level).toBe('default');
    expect(r.warnings).toHaveLength(1);
  });
  it('unrecognised HARNESS_AUTONOMY falls through to user config with one warning', () => {
    const r = run({
      env: { HARNESS_AUTONOMY: 'yolo' },
      readFile: cfg({ autonomy: { level: 'trusted' } }),
    });
    expect([r.level, r.source.level]).toEqual(['trusted', 'user-config']);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain('HARNESS_AUTONOMY');
  });
  it('unrecognised HARNESS_AUTONOMY_AUDIT falls through to default with one warning', () => {
    const r = run({ env: { HARNESS_AUTONOMY_AUDIT: 'maybe' } });
    expect([r.audit, r.source.audit]).toEqual([false, 'default']);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain('HARNESS_AUTONOMY_AUDIT');
  });
  it.each(['ON', 'true', '1'])('accepts audit env value %s as on', (v) => {
    expect(run({ env: { HARNESS_AUTONOMY_AUDIT: v } }).audit).toBe(true);
  });
});

describe('resolveAutonomy flag-vs-session recency (D3)', () => {
  const T1 = '2026-01-01T01:00:00.000Z';
  it('a session override newer than the flag wins', () => {
    const r = run({
      flag: { level: 'supervised', at: T0 },
      sessionOverride: sess('trusted', undefined, T1),
    });
    expect([r.level, r.source.level]).toEqual(['trusted', 'session']);
  });
  it('a flag newer than the override wins', () => {
    const r = run({
      flag: { level: 'supervised', at: T1 },
      sessionOverride: sess('trusted', undefined, T0),
    });
    expect([r.level, r.source.level]).toEqual(['supervised', 'flag']);
  });
  it('recency is per field', () => {
    const override: AutonomySessionOverride = {
      level: { value: 'trusted', setAt: T1, origin: 'cli' },
      audit: { value: false, setAt: '2025-12-31T00:00:00.000Z', origin: 'cli' },
    };
    const r = run({
      flag: { level: 'supervised', audit: true, at: T0 },
      sessionOverride: override,
    });
    expect([r.source.level, r.source.audit]).toEqual(['session', 'flag']);
  });
  it('an unparseable flag.at falls back to flag precedence', () => {
    const r = run({
      flag: { level: 'supervised', at: 'nope' },
      sessionOverride: sess('trusted', undefined, T1),
    });
    expect(r.source.level).toBe('flag');
  });
});

/**
 * C1 / D13: the env tier is repo-reachable (`.env` via dotenv, `.mcp.json` / settings `env`
 * blocks), so it may only LOWER: supervised and audit on are honoured; a raising value is
 * ignored with a warning that names it, and resolution falls through to the next tier.
 */
describe('env tier is lower-only (D13)', () => {
  it('HARNESS_AUTONOMY=trusted + no user config → supervised (default), warning names it', () => {
    const r = run({ env: { HARNESS_AUTONOMY: 'trusted' } });
    expect([r.level, r.source.level]).toEqual(['supervised', 'default']);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain('HARNESS_AUTONOMY="trusted"');
    expect(r.warnings[0]).toMatch(/only lower/);
  });
  it('HARNESS_AUTONOMY=TRUSTED (any case) is ignored the same way', () => {
    const r = run({ env: { HARNESS_AUTONOMY: ' TRUSTED ' } });
    expect(r.level).toBe('supervised');
    expect(r.warnings).toHaveLength(1);
  });
  it('a raising env cannot override a user-config value either way: trusted config still applies', () => {
    const r = run({
      env: { HARNESS_AUTONOMY: 'trusted' },
      readFile: cfg({ autonomy: { level: 'trusted' } }),
    });
    expect([r.level, r.source.level]).toEqual(['trusted', 'user-config']);
  });
  it('HARNESS_AUTONOMY_AUDIT=off is ignored: trusted keeps its audit (default on), warning names it', () => {
    const r = run({
      env: { HARNESS_AUTONOMY_AUDIT: 'off' },
      readFile: cfg({ autonomy: { level: 'trusted' } }),
    });
    expect([r.audit, r.source.audit]).toEqual([true, 'default']);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain('HARNESS_AUTONOMY_AUDIT="off"');
  });
  it.each(['off', 'false', '0', 'OFF'])('audit env %s never turns audit off', (v) => {
    const r = run({
      env: { HARNESS_AUTONOMY_AUDIT: v },
      readFile: cfg({ autonomy: { audit: { supervised: true } } }),
    });
    expect([r.audit, r.source.audit]).toEqual([true, 'user-config']);
  });
  it('positive control: env supervised still LOWERS a trusted user config', () => {
    const r = run({
      env: { HARNESS_AUTONOMY: 'supervised' },
      readFile: cfg({ autonomy: { level: 'trusted' } }),
    });
    expect([r.level, r.source.level]).toEqual(['supervised', 'env']);
    expect(r.warnings).toEqual([]);
  });
  it('positive control: env audit on still turns audit ON over a user config off', () => {
    const r = run({
      env: { HARNESS_AUTONOMY_AUDIT: 'on' },
      readFile: cfg({ autonomy: { level: 'trusted', audit: { trusted: false } } }),
    });
    expect([r.audit, r.source.audit]).toEqual([true, 'env']);
  });
});

import { describe, it, expect } from 'vitest';
import { UserConfigSchema, parseUserConfig, parseSessionOverride } from '../../src/autonomy/schema';

describe('UserConfigSchema', () => {
  it('accepts the documented example', () => {
    const r = UserConfigSchema.safeParse({
      autonomy: { level: 'supervised', audit: { trusted: true, supervised: false } },
    });
    expect(r.success).toBe(true);
  });
  it('accepts an empty object and unknown top-level keys', () => {
    expect(UserConfigSchema.safeParse({}).success).toBe(true);
    expect(UserConfigSchema.safeParse({ somethingElse: 1 }).success).toBe(true);
  });
  it('rejects an unknown level and a non-boolean audit', () => {
    expect(UserConfigSchema.safeParse({ autonomy: { level: 'yolo' } }).success).toBe(false);
    expect(UserConfigSchema.safeParse({ autonomy: { audit: { trusted: 'yes' } } }).success).toBe(
      false
    );
  });
});

describe('parseUserConfig', () => {
  it('returns Err on invalid JSON', () => {
    const r = parseUserConfig('{not json');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/JSON/);
  });
  it('returns Err on schema violation', () => {
    expect(parseUserConfig(JSON.stringify({ autonomy: { level: 'yolo' } })).ok).toBe(false);
  });
  it('returns Ok on a valid document', () => {
    const r = parseUserConfig(JSON.stringify({ autonomy: { level: 'trusted' } }));
    expect(r.ok && r.value.autonomy?.level).toBe('trusted');
  });
});

describe('parseSessionOverride', () => {
  const field = { setAt: '2026-01-01T00:00:00.000Z', origin: 'cli' as const };
  it('accepts per-field entries', () => {
    const r = parseSessionOverride(
      JSON.stringify({
        level: { value: 'trusted', ...field },
        audit: { value: false, ...field },
      })
    );
    expect(r.ok).toBe(true);
  });
  it('rejects a bad origin or a non-date setAt', () => {
    expect(
      parseSessionOverride(
        JSON.stringify({ level: { value: 'trusted', setAt: field.setAt, origin: 'x' } })
      ).ok
    ).toBe(false);
    expect(
      parseSessionOverride(
        JSON.stringify({ level: { value: 'trusted', setAt: 'nope', origin: 'cli' } })
      ).ok
    ).toBe(false);
  });
});

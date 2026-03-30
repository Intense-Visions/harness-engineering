import { describe, it, expect } from 'vitest';
import { secretRules } from '../../../src/security/rules/secrets';

describe('New secret detection rules (SEC-SEC-006 through SEC-SEC-011)', () => {
  it('exports 11 total rules', () => {
    expect(secretRules).toHaveLength(11);
  });

  it('SEC-SEC-006: detects Anthropic API keys', () => {
    const rule = secretRules.find((r) => r.id === 'SEC-SEC-006');
    expect(rule).toBeDefined();
    expect(rule!.patterns.some((p) => p.test('key = "sk-ant-api03-abcdef1234567890abcd"'))).toBe(
      true
    );
    expect(rule!.patterns.some((p) => p.test('key = process.env.ANTHROPIC_KEY'))).toBe(false);
    expect(rule!.references).toContain('CWE-798');
  });

  it('SEC-SEC-007: detects OpenAI API keys', () => {
    const rule = secretRules.find((r) => r.id === 'SEC-SEC-007');
    expect(rule).toBeDefined();
    expect(
      rule!.patterns.some((p) => p.test('key = "sk-proj-abcdefghijklmnopqrstuvwxyz123456"'))
    ).toBe(true);
    expect(rule!.patterns.some((p) => p.test('key = "sk-proj-ab"'))).toBe(false); // too short
  });

  it('SEC-SEC-008: detects Google API keys', () => {
    const rule = secretRules.find((r) => r.id === 'SEC-SEC-008');
    expect(rule).toBeDefined();
    expect(
      rule!.patterns.some((p) => p.test('key = "AIzaSyA1234567890abcdefghijklmnopqrstuv"'))
    ).toBe(true);
    expect(rule!.patterns.some((p) => p.test('key = "AIza_short"'))).toBe(false); // too short
  });

  it('SEC-SEC-009: detects GitHub PATs', () => {
    const rule = secretRules.find((r) => r.id === 'SEC-SEC-009');
    expect(rule).toBeDefined();
    expect(
      rule!.patterns.some((p) => p.test('token = "ghp_abcdefghijklmnopqrstuvwxyz1234567890"'))
    ).toBe(true);
    expect(
      rule!.patterns.some((p) => p.test('token = "gho_abcdefghijklmnopqrstuvwxyz1234567890"'))
    ).toBe(true);
    expect(
      rule!.patterns.some((p) => p.test('token = "ghu_abcdefghijklmnopqrstuvwxyz1234567890"'))
    ).toBe(true);
    expect(
      rule!.patterns.some((p) => p.test('token = "ghs_abcdefghijklmnopqrstuvwxyz1234567890"'))
    ).toBe(true);
    expect(rule!.patterns.some((p) => p.test('token = "ghx_invalid"'))).toBe(false);
  });

  it('SEC-SEC-010: detects Stripe keys', () => {
    const rule = secretRules.find((r) => r.id === 'SEC-SEC-010');
    expect(rule).toBeDefined();
    const suffix = 'abc123def456ghi789jkl012';
    expect(rule!.patterns.some((p) => p.test(`key = "sk_live_${suffix}"`))).toBe(true);
    expect(rule!.patterns.some((p) => p.test(`key = "pk_live_${suffix}"`))).toBe(true);
    expect(rule!.patterns.some((p) => p.test(`key = "rk_live_${suffix}"`))).toBe(true);
    expect(rule!.patterns.some((p) => p.test('key = "sk_test_abc123"'))).toBe(false); // test key, not live
  });

  it('SEC-SEC-011: detects database connection strings with credentials', () => {
    const rule = secretRules.find((r) => r.id === 'SEC-SEC-011');
    expect(rule).toBeDefined();
    expect(
      rule!.patterns.some((p) => p.test('url = "postgres://admin:secret@db.host.com/mydb"'))
    ).toBe(true);
    expect(rule!.patterns.some((p) => p.test('url = "mongodb://user:p4ss@mongo.host:27017"'))).toBe(
      true
    );
    expect(rule!.patterns.some((p) => p.test('url = "postgres://localhost/mydb"'))).toBe(false); // no creds
  });

  it('all new rules have category secrets and severity error', () => {
    const newRules = secretRules.filter((r) => parseInt(r.id.split('-')[2]) >= 6);
    expect(newRules).toHaveLength(6);
    for (const rule of newRules) {
      expect(rule.category).toBe('secrets');
      expect(rule.severity).toBe('error');
      expect(rule.confidence).toBe('high');
    }
  });
});

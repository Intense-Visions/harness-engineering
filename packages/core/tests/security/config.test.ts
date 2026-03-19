import { describe, it, expect } from 'vitest';
import {
  SecurityConfigSchema,
  parseSecurityConfig,
  resolveRuleSeverity,
} from '../../src/security/config';

describe('SecurityConfigSchema', () => {
  it('validates a minimal config', () => {
    const result = SecurityConfigSchema.safeParse({ enabled: true, strict: false });
    expect(result.success).toBe(true);
  });

  it('applies defaults for missing fields', () => {
    const result = SecurityConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enabled).toBe(true);
      expect(result.data.strict).toBe(false);
    }
  });

  it('accepts rule overrides', () => {
    const result = SecurityConfigSchema.safeParse({
      rules: { 'SEC-NET-001': 'off', 'SEC-INJ-*': 'error' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid rule override values', () => {
    const result = SecurityConfigSchema.safeParse({
      rules: { 'SEC-NET-001': 'invalid' },
    });
    expect(result.success).toBe(false);
  });
});

describe('parseSecurityConfig', () => {
  it('returns default config when input is undefined', () => {
    const config = parseSecurityConfig(undefined);
    expect(config.enabled).toBe(true);
    expect(config.strict).toBe(false);
  });

  it('merges partial config with defaults', () => {
    const config = parseSecurityConfig({ strict: true });
    expect(config.strict).toBe(true);
    expect(config.enabled).toBe(true);
  });
});

describe('resolveRuleSeverity', () => {
  it('returns rule default when no override exists', () => {
    const severity = resolveRuleSeverity('SEC-INJ-001', 'error', {}, false);
    expect(severity).toBe('error');
  });

  it('returns off when rule is disabled', () => {
    const severity = resolveRuleSeverity('SEC-NET-001', 'warning', { 'SEC-NET-001': 'off' }, false);
    expect(severity).toBe('off');
  });

  it('matches wildcard overrides', () => {
    const severity = resolveRuleSeverity('SEC-INJ-001', 'warning', { 'SEC-INJ-*': 'error' }, false);
    expect(severity).toBe('error');
  });

  it('promotes warnings to errors in strict mode', () => {
    const severity = resolveRuleSeverity('SEC-NET-001', 'warning', {}, true);
    expect(severity).toBe('error');
  });

  it('does not demote errors in strict mode', () => {
    const severity = resolveRuleSeverity('SEC-INJ-001', 'error', {}, true);
    expect(severity).toBe('error');
  });
});

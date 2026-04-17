import { describe, it, expect } from 'vitest';
import { insecureDefaultsRules } from '../../../src/security/rules/insecure-defaults';

function findRule(id: string) {
  const rule = insecureDefaultsRules.find((r) => r.id === id);
  expect(rule).toBeDefined();
  return rule!;
}

function matches(id: string, input: string): boolean {
  return findRule(id).patterns.some((p) => p.test(input));
}

describe('Insecure-defaults rules', () => {
  // --- SEC-DEF-001: Security-Sensitive Fallback ---
  describe('SEC-DEF-001 — Security-Sensitive Fallback to Hardcoded Default', () => {
    it('detects SECRET fallback with ||', () => {
      expect(matches('SEC-DEF-001', `const secret = process.env.SECRET || 'hardcoded123'`)).toBe(
        true
      );
    });

    it('detects KEY fallback with ??', () => {
      expect(matches('SEC-DEF-001', `const key = process.env.ENCRYPTION_KEY ?? 'default-key'`)).toBe(
        true
      );
    });

    it('detects TOKEN fallback', () => {
      expect(matches('SEC-DEF-001', `const token = env.JWT_TOKEN || "fallback"`)).toBe(true);
    });

    it('detects PASSWORD fallback', () => {
      expect(matches('SEC-DEF-001', `const pw = process.env.DB_PASSWORD ?? "admin"`)).toBe(true);
    });

    it('detects SALT fallback', () => {
      expect(matches('SEC-DEF-001', `const salt = config.SALT || "fixed-salt"`)).toBe(true);
    });

    it('detects SESSION fallback', () => {
      expect(matches('SEC-DEF-001', `const sess = process.env.SESSION_SECRET || 'abc'`)).toBe(
        true
      );
    });

    it('detects AUTH fallback', () => {
      expect(matches('SEC-DEF-001', `const auth = env.AUTH_KEY ?? "default"`)).toBe(true);
    });

    it('is case-insensitive', () => {
      expect(matches('SEC-DEF-001', `const s = env.secret_key || "val"`)).toBe(true);
    });

    it('does not flag non-security env vars', () => {
      expect(matches('SEC-DEF-001', `const port = process.env.PORT || '3000'`)).toBe(false);
    });

    it('does not flag without fallback operator', () => {
      expect(matches('SEC-DEF-001', `const secret = process.env.SECRET`)).toBe(false);
    });

    it('has correct metadata', () => {
      const rule = findRule('SEC-DEF-001');
      expect(rule.severity).toBe('warning');
      expect(rule.confidence).toBe('medium');
      expect(rule.references).toContain('CWE-1188');
    });
  });

  // --- SEC-DEF-002: TLS/SSL Disabled by Default ---
  describe('SEC-DEF-002 — TLS/SSL Disabled by Default', () => {
    it('detects tls = false', () => {
      expect(matches('SEC-DEF-002', 'tls = false')).toBe(true);
    });

    it('detects ssl: false', () => {
      expect(matches('SEC-DEF-002', 'ssl: false')).toBe(true);
    });

    it('detects https = false', () => {
      expect(matches('SEC-DEF-002', 'https = false')).toBe(true);
    });

    it('detects secure: false', () => {
      expect(matches('SEC-DEF-002', 'secure: false')).toBe(true);
    });

    it('detects tls with config fallback to false', () => {
      expect(matches('SEC-DEF-002', 'tls = config?.enabled ?? false')).toBe(true);
    });

    it('detects secure with config fallback to false', () => {
      expect(matches('SEC-DEF-002', 'secure: config?.value || false')).toBe(true);
    });

    it('does not flag tls = true', () => {
      expect(matches('SEC-DEF-002', 'tls = true')).toBe(false);
    });

    it('does not flag unrelated assignments', () => {
      expect(matches('SEC-DEF-002', 'debug = false')).toBe(false);
    });

    it('has correct metadata', () => {
      const rule = findRule('SEC-DEF-002');
      expect(rule.severity).toBe('warning');
      expect(rule.confidence).toBe('medium');
      expect(rule.references).toContain('CWE-1188');
    });
  });

  // --- SEC-DEF-003: Swallowed Auth Error ---
  describe('SEC-DEF-003 — Swallowed Authentication/Authorization Error', () => {
    it('detects empty catch block', () => {
      expect(matches('SEC-DEF-003', 'catch(e) { }')).toBe(true);
    });

    it('detects catch with ignore comment', () => {
      expect(matches('SEC-DEF-003', 'catch(err) { // ignore }')).toBe(true);
    });

    it('detects catch with noop comment', () => {
      expect(matches('SEC-DEF-003', 'catch(e) { // noop }')).toBe(true);
    });

    it('detects catch with skip comment', () => {
      expect(matches('SEC-DEF-003', 'catch(error) { // skip }')).toBe(true);
    });

    it('detects catch with todo comment', () => {
      expect(matches('SEC-DEF-003', 'catch(e) { // todo handle this }')).toBe(true);
    });

    it('does not flag catch with actual handler', () => {
      expect(matches('SEC-DEF-003', 'catch(e) { logger.error(e) }')).toBe(false);
    });

    it('has auth-related file glob', () => {
      const rule = findRule('SEC-DEF-003');
      expect(rule.fileGlob).toContain('*auth*');
      expect(rule.fileGlob).toContain('*session*');
      expect(rule.fileGlob).toContain('*token*');
    });

    it('has correct metadata', () => {
      const rule = findRule('SEC-DEF-003');
      expect(rule.severity).toBe('warning');
      expect(rule.confidence).toBe('low');
      expect(rule.references).toContain('CWE-754');
      expect(rule.references).toContain('CWE-390');
    });
  });

  // --- SEC-DEF-004: Permissive CORS Fallback ---
  describe('SEC-DEF-004 — Permissive CORS Fallback', () => {
    it('detects origin fallback to * with ??', () => {
      expect(matches('SEC-DEF-004', `const origin = config?.origin ?? '*'`)).toBe(true);
    });

    it('detects origin fallback to * with ||', () => {
      expect(matches('SEC-DEF-004', `const origin = options.origin || '*'`)).toBe(true);
    });

    it('detects cors fallback to *', () => {
      expect(matches('SEC-DEF-004', `const cors = env.corsOrigin ?? '*'`)).toBe(true);
    });

    it('does not flag specific origin', () => {
      expect(
        matches('SEC-DEF-004', `const origin = config?.origin ?? 'https://example.com'`)
      ).toBe(false);
    });

    it('has correct metadata', () => {
      const rule = findRule('SEC-DEF-004');
      expect(rule.severity).toBe('warning');
      expect(rule.confidence).toBe('medium');
      expect(rule.references).toContain('CWE-942');
    });
  });

  // --- SEC-DEF-005: Rate Limiting Disabled by Default ---
  describe('SEC-DEF-005 — Rate Limiting Disabled by Default', () => {
    it('detects rateLimit fallback to false', () => {
      expect(matches('SEC-DEF-005', 'rateLimit = config?.rateLimit ?? false')).toBe(true);
    });

    it('detects rateLimiting fallback to 0', () => {
      expect(matches('SEC-DEF-005', 'rateLimiting = options.rateLimiting || 0')).toBe(true);
    });

    it('detects throttle fallback to null', () => {
      expect(matches('SEC-DEF-005', 'throttle = config?.throttle ?? null')).toBe(true);
    });

    it('detects fallback to undefined', () => {
      expect(matches('SEC-DEF-005', 'rateLimit = env.rateLimit || undefined')).toBe(true);
    });

    it('does not flag rateLimit set to a number', () => {
      expect(matches('SEC-DEF-005', 'rateLimit = config?.rateLimit ?? 100')).toBe(false);
    });

    it('has correct metadata', () => {
      const rule = findRule('SEC-DEF-005');
      expect(rule.severity).toBe('info');
      expect(rule.confidence).toBe('low');
      expect(rule.references).toContain('CWE-770');
    });
  });

  // --- Structural checks ---
  describe('structural', () => {
    it('exports all 5 rules', () => {
      expect(insecureDefaultsRules).toHaveLength(5);
    });

    it('all rules have unique IDs', () => {
      const ids = insecureDefaultsRules.map((r) => r.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('all rules have category "insecure-defaults"', () => {
      for (const rule of insecureDefaultsRules) {
        expect(rule.category).toBe('insecure-defaults');
      }
    });

    it('all rules have at least one pattern', () => {
      for (const rule of insecureDefaultsRules) {
        expect(rule.patterns.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('all rules have CWE references', () => {
      for (const rule of insecureDefaultsRules) {
        expect(rule.references).toBeDefined();
        expect(rule.references!.length).toBeGreaterThanOrEqual(1);
      }
    });
  });
});

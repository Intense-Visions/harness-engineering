import { describe, it, expect } from 'vitest';
import { networkRules } from '../../../src/security/rules/network';
import { SecurityScanner } from '../../../src/security/scanner';

describe('Network rules', () => {
  it('exports 4 rules in the network category', () => {
    expect(networkRules).toHaveLength(4);
    for (const rule of networkRules) {
      expect(rule.category).toBe('network');
      expect(rule.id).toMatch(/^SEC-NET-/);
    }
  });

  describe('SEC-NET-001 — CORS Wildcard Origin', () => {
    const rule = networkRules.find((r) => r.id === 'SEC-NET-001')!;

    it('has correct metadata', () => {
      expect(rule.severity).toBe('warning');
      expect(rule.confidence).toBe('medium');
      expect(rule.references).toContain('CWE-942');
    });

    it('detects origin: "*" (double quotes)', () => {
      expect(rule.patterns.some((p) => p.test('origin: "*"'))).toBe(true);
    });

    it("detects origin: '*' (single quotes)", () => {
      expect(rule.patterns.some((p) => p.test("origin: '*'"))).toBe(true);
    });

    it('detects origin with extra whitespace', () => {
      expect(rule.patterns.some((p) => p.test('origin :  "*"'))).toBe(true);
    });

    it('does not flag a specific origin', () => {
      expect(rule.patterns.some((p) => p.test('origin: "https://example.com"'))).toBe(false);
    });

    it('does not flag origin: true', () => {
      expect(rule.patterns.some((p) => p.test('origin: true'))).toBe(false);
    });
  });

  describe('SEC-NET-002 — Disabled TLS Verification', () => {
    const rule = networkRules.find((r) => r.id === 'SEC-NET-002')!;

    it('has correct metadata', () => {
      expect(rule.severity).toBe('warning');
      expect(rule.confidence).toBe('high');
      expect(rule.references).toContain('CWE-295');
    });

    it('detects rejectUnauthorized: false', () => {
      expect(rule.patterns.some((p) => p.test('rejectUnauthorized: false'))).toBe(true);
    });

    it('detects rejectUnauthorized with extra whitespace', () => {
      expect(rule.patterns.some((p) => p.test('rejectUnauthorized :  false'))).toBe(true);
    });

    it('does not flag rejectUnauthorized: true', () => {
      expect(rule.patterns.some((p) => p.test('rejectUnauthorized: true'))).toBe(false);
    });
  });

  describe('SEC-NET-004 — Disabled TLS Verification (Rust, #2375)', () => {
    const rule = networkRules.find((r) => r.id === 'SEC-NET-004')!;
    const hit = (line: string) => rule.patterns.some((p) => p.test(line));

    it('has correct metadata and is scoped to Rust sources', () => {
      expect(rule.severity).toBe('warning');
      expect(rule.confidence).toBe('high');
      expect(rule.references).toContain('CWE-295');
      expect(rule.fileGlob).toBe('**/*.rs');
    });

    it('detects danger_accept_invalid_certs(true)', () => {
      expect(hit('Client::builder().danger_accept_invalid_certs(true).build()')).toBe(true);
    });

    it('detects danger_accept_invalid_hostnames( true )', () => {
      expect(hit('    .danger_accept_invalid_hostnames( true )')).toBe(true);
    });

    it('does not flag the verified (false) or config-driven forms', () => {
      expect(hit('.danger_accept_invalid_certs(false)')).toBe(false);
      expect(hit('.danger_accept_invalid_certs(cfg.insecure)')).toBe(false);
    });

    it('does not fire on a non-Rust file that mentions the API', () => {
      const scanner = new SecurityScanner({ enabled: true, strict: false });
      const line = '// never call .danger_accept_invalid_certs(true) in production';
      expect(scanner.scanFileContent(line, 'docs/notes.ts').map((f) => f.ruleId)).not.toContain(
        'SEC-NET-004'
      );
      expect(scanner.scanFileContent(line, 'src/client.rs').map((f) => f.ruleId)).toContain(
        'SEC-NET-004'
      );
    });
  });

  describe('SEC-NET-003 — Hardcoded HTTP URL', () => {
    const rule = networkRules.find((r) => r.id === 'SEC-NET-003')!;

    it('has correct metadata', () => {
      expect(rule.severity).toBe('info');
      expect(rule.confidence).toBe('low');
      expect(rule.references).toContain('CWE-319');
    });

    it('detects http:// URL to external host', () => {
      expect(rule.patterns.some((p) => p.test('"http://api.example.com/data"'))).toBe(true);
    });

    it('detects http:// URL with single quotes', () => {
      expect(rule.patterns.some((p) => p.test("'http://cdn.example.com/file'"))).toBe(true);
    });

    it('does not flag http://localhost', () => {
      expect(rule.patterns.some((p) => p.test('"http://localhost:3000"'))).toBe(false);
    });

    it('does not flag http://127.0.0.1', () => {
      expect(rule.patterns.some((p) => p.test('"http://127.0.0.1:8080"'))).toBe(false);
    });

    it('does not flag http://0.0.0.0', () => {
      expect(rule.patterns.some((p) => p.test('"http://0.0.0.0:5000"'))).toBe(false);
    });

    it('does not flag https:// URLs', () => {
      expect(rule.patterns.some((p) => p.test('"https://api.example.com"'))).toBe(false);
    });
  });
});

import { describe, it, expect } from 'vitest';
import { sharpEdgesRules } from '../../../src/security/rules/sharp-edges';

function findRule(id: string) {
  const rule = sharpEdgesRules.find((r) => r.id === id);
  expect(rule).toBeDefined();
  return rule!;
}

function matches(id: string, input: string): boolean {
  return findRule(id).patterns.some((p) => p.test(input));
}

describe('Sharp-edges rules', () => {
  // --- SEC-EDGE-001: Deprecated createCipher API ---
  describe('SEC-EDGE-001 — Deprecated createCipher', () => {
    it('detects crypto.createCipher()', () => {
      expect(matches('SEC-EDGE-001', "crypto.createCipher('aes192', key)")).toBe(true);
    });

    it('detects crypto.createCipher with whitespace', () => {
      expect(matches('SEC-EDGE-001', 'crypto.createCipher  (')).toBe(true);
    });

    it('does not flag createCipheriv', () => {
      expect(matches('SEC-EDGE-001', "crypto.createCipheriv('aes-256-gcm', key, iv)")).toBe(false);
    });

    it('has correct metadata', () => {
      const rule = findRule('SEC-EDGE-001');
      expect(rule.severity).toBe('error');
      expect(rule.confidence).toBe('high');
      expect(rule.references).toContain('CWE-327');
    });
  });

  // --- SEC-EDGE-002: Deprecated createDecipher API ---
  describe('SEC-EDGE-002 — Deprecated createDecipher', () => {
    it('detects crypto.createDecipher()', () => {
      expect(matches('SEC-EDGE-002', "crypto.createDecipher('aes192', key)")).toBe(true);
    });

    it('does not flag createDecipheriv', () => {
      expect(matches('SEC-EDGE-002', "crypto.createDecipheriv('aes-256-gcm', key, iv)")).toBe(
        false
      );
    });

    it('has correct metadata', () => {
      const rule = findRule('SEC-EDGE-002');
      expect(rule.severity).toBe('error');
      expect(rule.confidence).toBe('high');
    });
  });

  // --- SEC-EDGE-003: ECB Mode ---
  describe('SEC-EDGE-003 — ECB Mode Selection', () => {
    it('detects aes-128-ecb', () => {
      expect(matches('SEC-EDGE-003', `createCipheriv('aes-128-ecb', key, '')`)).toBe(true);
    });

    it('detects des-ecb', () => {
      expect(matches('SEC-EDGE-003', `algorithm = "des-ecb"`)).toBe(true);
    });

    it('does not flag aes-256-gcm', () => {
      expect(matches('SEC-EDGE-003', `createCipheriv('aes-256-gcm', key, iv)`)).toBe(false);
    });

    it('does not flag aes-256-cbc', () => {
      expect(matches('SEC-EDGE-003', `createCipheriv('aes-256-cbc', key, iv)`)).toBe(false);
    });

    it('has correct metadata', () => {
      const rule = findRule('SEC-EDGE-003');
      expect(rule.severity).toBe('warning');
      expect(rule.confidence).toBe('high');
    });
  });

  // --- SEC-EDGE-004: yaml.load Without Safe Loader ---
  describe('SEC-EDGE-004 — yaml.load Without Safe Loader', () => {
    it('detects yaml.load()', () => {
      expect(matches('SEC-EDGE-004', 'data = yaml.load(file_content)')).toBe(true);
    });

    it('detects yaml.load with whitespace', () => {
      expect(matches('SEC-EDGE-004', 'yaml.load  (stream)')).toBe(true);
    });

    it('has Python file glob', () => {
      const rule = findRule('SEC-EDGE-004');
      expect(rule.fileGlob).toBe('**/*.py');
    });

    it('has correct metadata', () => {
      const rule = findRule('SEC-EDGE-004');
      expect(rule.severity).toBe('error');
      expect(rule.confidence).toBe('high');
      expect(rule.references).toContain('CWE-502');
    });
  });

  // --- SEC-EDGE-005: Pickle/Marshal Deserialization ---
  describe('SEC-EDGE-005 — Pickle/Marshal Deserialization', () => {
    it('detects pickle.load()', () => {
      expect(matches('SEC-EDGE-005', 'obj = pickle.load(f)')).toBe(true);
    });

    it('detects pickle.loads()', () => {
      expect(matches('SEC-EDGE-005', 'obj = pickle.loads(data)')).toBe(true);
    });

    it('detects marshal.load()', () => {
      expect(matches('SEC-EDGE-005', 'obj = marshal.load(f)')).toBe(true);
    });

    it('detects marshal.loads()', () => {
      expect(matches('SEC-EDGE-005', 'obj = marshal.loads(data)')).toBe(true);
    });

    it('does not flag json.loads()', () => {
      expect(matches('SEC-EDGE-005', 'obj = json.loads(data)')).toBe(false);
    });

    it('has Python file glob', () => {
      expect(findRule('SEC-EDGE-005').fileGlob).toBe('**/*.py');
    });
  });

  // --- SEC-EDGE-006: TOCTOU Sync ---
  describe('SEC-EDGE-006 — Check-Then-Act (Sync)', () => {
    it('detects existsSync followed by readFileSync', () => {
      expect(matches('SEC-EDGE-006', 'if (existsSync(p)) { readFileSync(p) }')).toBe(true);
    });

    it('detects accessSync followed by writeFileSync', () => {
      expect(matches('SEC-EDGE-006', 'accessSync(file); writeFileSync(file, data)')).toBe(true);
    });

    it('detects statSync followed by unlinkSync', () => {
      expect(matches('SEC-EDGE-006', 'statSync(p); unlinkSync(p)')).toBe(true);
    });

    it('does not flag standalone readFileSync', () => {
      expect(matches('SEC-EDGE-006', 'readFileSync(p)')).toBe(false);
    });

    it('has correct metadata', () => {
      const rule = findRule('SEC-EDGE-006');
      expect(rule.severity).toBe('warning');
      expect(rule.confidence).toBe('medium');
      expect(rule.references).toContain('CWE-367');
    });
  });

  // --- SEC-EDGE-007: TOCTOU Async ---
  describe('SEC-EDGE-007 — Check-Then-Act (Async)', () => {
    it('detects access followed by readFile', () => {
      expect(matches('SEC-EDGE-007', 'access(p).then(() => readFile(p))')).toBe(true);
    });

    it('detects stat followed by writeFile', () => {
      expect(matches('SEC-EDGE-007', 'await stat(file); await writeFile(file, data)')).toBe(true);
    });

    it('does not flag standalone writeFile', () => {
      expect(matches('SEC-EDGE-007', 'await writeFile(p, data)')).toBe(false);
    });

    it('has correct metadata', () => {
      const rule = findRule('SEC-EDGE-007');
      expect(rule.severity).toBe('warning');
      expect(rule.confidence).toBe('medium');
      expect(rule.references).toContain('CWE-367');
    });
  });

  // --- SEC-EDGE-008: JWT Algorithm "none" ---
  describe('SEC-EDGE-008 — JWT Algorithm "none"', () => {
    it('detects algorithms: ["none"]', () => {
      expect(matches('SEC-EDGE-008', `algorithms: ["none"]`)).toBe(true);
    });

    it('detects algorithm: "none"', () => {
      expect(matches('SEC-EDGE-008', `algorithm: "none"`)).toBe(true);
    });

    it("detects algorithm = 'none'", () => {
      expect(matches('SEC-EDGE-008', `algorithm = 'none'`)).toBe(true);
    });

    it("detects alg: 'none'", () => {
      expect(matches('SEC-EDGE-008', `alg: 'none'`)).toBe(true);
    });

    it('does not flag algorithm: "HS256"', () => {
      expect(matches('SEC-EDGE-008', `algorithm: "HS256"`)).toBe(false);
    });

    it('has correct metadata', () => {
      const rule = findRule('SEC-EDGE-008');
      expect(rule.severity).toBe('error');
      expect(rule.confidence).toBe('high');
      expect(rule.references).toContain('CWE-345');
    });
  });

  // --- SEC-EDGE-009: DES/RC4 Algorithm Selection ---
  describe('SEC-EDGE-009 — DES/RC4 Algorithm Selection', () => {
    it('detects "des"', () => {
      expect(matches('SEC-EDGE-009', `cipher = "des"`)).toBe(true);
    });

    it('detects "des-ede3"', () => {
      expect(matches('SEC-EDGE-009', `algorithm: "des-ede3"`)).toBe(true);
    });

    it('detects "rc4"', () => {
      expect(matches('SEC-EDGE-009', `cipher = 'rc4'`)).toBe(true);
    });

    it('detects "blowfish"', () => {
      expect(matches('SEC-EDGE-009', `algorithm: "blowfish"`)).toBe(true);
    });

    it('detects "rc2"', () => {
      expect(matches('SEC-EDGE-009', `cipher = "rc2"`)).toBe(true);
    });

    it('does not flag "aes-256-gcm"', () => {
      expect(matches('SEC-EDGE-009', `cipher = "aes-256-gcm"`)).toBe(false);
    });

    it('has correct metadata', () => {
      const rule = findRule('SEC-EDGE-009');
      expect(rule.severity).toBe('error');
      expect(rule.confidence).toBe('high');
      expect(rule.references).toContain('CWE-327');
    });
  });

  // --- Structural checks ---
  describe('structural', () => {
    it('exports all 9 rules', () => {
      expect(sharpEdgesRules).toHaveLength(9);
    });

    it('all rules have unique IDs', () => {
      const ids = sharpEdgesRules.map((r) => r.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('all rules have category "sharp-edges"', () => {
      for (const rule of sharpEdgesRules) {
        expect(rule.category).toBe('sharp-edges');
      }
    });

    it('all rules have at least one pattern', () => {
      for (const rule of sharpEdgesRules) {
        expect(rule.patterns.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('all rules have CWE references', () => {
      for (const rule of sharpEdgesRules) {
        expect(rule.references).toBeDefined();
        expect(rule.references!.length).toBeGreaterThanOrEqual(1);
        expect(rule.references!.every((r) => r.startsWith('CWE-'))).toBe(true);
      }
    });
  });
});

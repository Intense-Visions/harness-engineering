import { describe, it, expect } from 'vitest';
import { cryptoRules } from '../../../src/security/rules/crypto';

describe('Crypto rules', () => {
  describe('SEC-CRY-001 — Weak Hash Algorithm', () => {
    const rule = cryptoRules.find((r) => r.id === 'SEC-CRY-001')!;

    it('exists with correct metadata', () => {
      expect(rule).toBeDefined();
      expect(rule.category).toBe('crypto');
      expect(rule.severity).toBe('error');
      expect(rule.confidence).toBe('high');
      expect(rule.references).toContain('CWE-328');
    });

    it('detects createHash with md5', () => {
      expect(rule.patterns.some((p) => p.test("createHash('md5')"))).toBe(true);
    });

    it('detects createHash with sha1', () => {
      expect(rule.patterns.some((p) => p.test("createHash('sha1')"))).toBe(true);
    });

    it('detects createHash with md4', () => {
      expect(rule.patterns.some((p) => p.test("createHash('md4')"))).toBe(true);
    });

    it('detects createHash with ripemd160', () => {
      expect(rule.patterns.some((p) => p.test("createHash('ripemd160')"))).toBe(true);
    });

    it('detects createHash with double quotes', () => {
      expect(rule.patterns.some((p) => p.test('createHash("md5")'))).toBe(true);
    });

    it('detects createHash with whitespace around arg', () => {
      expect(rule.patterns.some((p) => p.test("createHash( 'md5' )"))).toBe(true);
    });

    it('does not flag sha256', () => {
      expect(rule.patterns.some((p) => p.test("createHash('sha256')"))).toBe(false);
    });

    it('does not flag sha512', () => {
      expect(rule.patterns.some((p) => p.test("createHash('sha512')"))).toBe(false);
    });

    it('does not flag sha384', () => {
      expect(rule.patterns.some((p) => p.test("createHash('sha384')"))).toBe(false);
    });
  });

  describe('SEC-CRY-002 — Hardcoded Encryption Key', () => {
    const rule = cryptoRules.find((r) => r.id === 'SEC-CRY-002')!;

    it('exists with correct metadata', () => {
      expect(rule).toBeDefined();
      expect(rule.category).toBe('crypto');
      expect(rule.severity).toBe('error');
      expect(rule.confidence).toBe('high');
      expect(rule.references).toContain('CWE-321');
    });

    it('detects encryption_key with equals', () => {
      expect(rule.patterns.some((p) => p.test('encryption_key = "hardcoded123"'))).toBe(true);
    });

    it('detects cipher_key with equals', () => {
      expect(rule.patterns.some((p) => p.test('cipher_key = "mysecretkey!"'))).toBe(true);
    });

    it('detects aes_key with equals', () => {
      expect(rule.patterns.some((p) => p.test('aes_key = "0123456789abcdef"'))).toBe(true);
    });

    it('detects secret_key with equals', () => {
      expect(rule.patterns.some((p) => p.test('secret_key = "supersecret!"'))).toBe(true);
    });

    it('detects encryptionKey (camelCase via hyphen variant)', () => {
      expect(rule.patterns.some((p) => p.test('encryptionKey = "hardcoded123"'))).toBe(true);
    });

    it('detects key assigned with colon (object literal)', () => {
      expect(rule.patterns.some((p) => p.test('encryption_key: "hardcoded123"'))).toBe(true);
    });

    it('is case insensitive', () => {
      expect(rule.patterns.some((p) => p.test('ENCRYPTION_KEY = "hardcoded123"'))).toBe(true);
    });

    it('does not flag keys shorter than 4 chars', () => {
      expect(rule.patterns.some((p) => p.test('encryption_key = "abc"'))).toBe(false);
    });

    it('does not flag environment variable references', () => {
      expect(rule.patterns.some((p) => p.test('const key = process.env.ENCRYPTION_KEY'))).toBe(
        false
      );
    });

    it('does not flag unrelated variable names', () => {
      expect(rule.patterns.some((p) => p.test('myVariable = "some_value_here"'))).toBe(false);
    });
  });
});

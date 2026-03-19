import { describe, it, expect } from 'vitest';
import { xssRules } from '../../../src/security/rules/xss';
import { cryptoRules } from '../../../src/security/rules/crypto';

describe('XSS rules', () => {
  it('detects innerHTML assignment', () => {
    const rule = xssRules.find((r) => r.id === 'SEC-XSS-001');
    expect(rule).toBeDefined();
    expect(rule!.patterns.some((p) => p.test('element.innerHTML = userInput'))).toBe(true);
  });

  it('detects dangerouslySetInnerHTML', () => {
    const rule = xssRules.find((r) => r.id === 'SEC-XSS-002');
    expect(rule).toBeDefined();
    expect(rule!.patterns.some((p) => p.test('dangerouslySetInnerHTML={{ __html: data }}'))).toBe(
      true
    );
  });

  it('detects document.write', () => {
    const rule = xssRules.find((r) => r.id === 'SEC-XSS-003');
    expect(rule).toBeDefined();
    expect(rule!.patterns.some((p) => p.test('document.write(html)'))).toBe(true);
  });
});

describe('Crypto rules', () => {
  it('detects MD5 usage', () => {
    const rule = cryptoRules.find((r) => r.id === 'SEC-CRY-001');
    expect(rule).toBeDefined();
    expect(rule!.patterns.some((p) => p.test("createHash('md5')"))).toBe(true);
  });

  it('detects SHA1 usage', () => {
    const rule = cryptoRules.find((r) => r.id === 'SEC-CRY-001');
    expect(rule!.patterns.some((p) => p.test("createHash('sha1')"))).toBe(true);
  });

  it('does not flag SHA256', () => {
    const rule = cryptoRules.find((r) => r.id === 'SEC-CRY-001');
    expect(rule!.patterns.some((p) => p.test("createHash('sha256')"))).toBe(false);
  });

  it('detects hardcoded encryption keys', () => {
    const rule = cryptoRules.find((r) => r.id === 'SEC-CRY-002');
    expect(rule).toBeDefined();
    expect(rule!.patterns.some((p) => p.test('encryption_key = "hardcoded123"'))).toBe(true);
  });
});

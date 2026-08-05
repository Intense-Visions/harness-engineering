import { describe, it, expect } from 'vitest';
import { injectionRules } from '../../../src/security/rules/injection';

describe('Injection detection rules', () => {
  it('exports multiple rules', () => {
    expect(injectionRules.length).toBeGreaterThan(0);
    for (const rule of injectionRules) {
      expect(rule.id).toMatch(/^SEC-INJ-/);
      expect(rule.category).toBe('injection');
    }
  });

  it('detects eval usage', () => {
    const rule = injectionRules.find((r) => r.id === 'SEC-INJ-001');
    expect(rule).toBeDefined();
    expect(rule!.severity).toBe('error');
    expect(rule!.patterns.some((p) => p.test('eval(userInput)'))).toBe(true);
    expect(rule!.patterns.some((p) => p.test('new Function(code)'))).toBe(true);
  });

  it('detects SQL string concatenation', () => {
    const rule = injectionRules.find((r) => r.id === 'SEC-INJ-002');
    expect(rule).toBeDefined();
    const testLine = 'query("SELECT * FROM users WHERE id=" + id)';
    expect(rule!.patterns.some((p) => p.test(testLine))).toBe(true);
  });

  it('detects child_process.exec with string arg', () => {
    const rule = injectionRules.find((r) => r.id === 'SEC-INJ-003');
    expect(rule).toBeDefined();
    const testLine = 'exec("rm -rf " + userInput)';
    expect(rule!.patterns.some((p) => p.test(testLine))).toBe(true);
  });

  describe('SEC-INJ-004 — Prisma raw query injection', () => {
    const rule = injectionRules.find((r) => r.id === 'SEC-INJ-004')!;

    it('is a high-confidence error', () => {
      expect(rule).toBeDefined();
      expect(rule.severity).toBe('error');
      expect(rule.confidence).toBe('high');
      expect(rule.references).toContain('CWE-89');
    });

    it('flags $queryRawUnsafe with an interpolated template literal', () => {
      const line =
        'const rows = await prisma.$queryRawUnsafe(`SELECT * FROM users WHERE id = ${id}`);';
      expect(rule.patterns.some((p) => p.test(line))).toBe(true);
    });

    it('flags $executeRawUnsafe with string concatenation', () => {
      const line = 'await prisma.$executeRawUnsafe("DELETE FROM logs WHERE owner = " + userId);';
      expect(rule.patterns.some((p) => p.test(line))).toBe(true);
    });

    it('does NOT flag the safe tagged-template $queryRaw form', () => {
      const line = 'const rows = await prisma.$queryRaw`SELECT * FROM users WHERE id = ${id}`;';
      expect(rule.patterns.some((p) => p.test(line))).toBe(false);
    });

    it('does NOT flag $queryRawUnsafe with a fully static string (no injection vector)', () => {
      const line = 'await prisma.$queryRawUnsafe("SELECT 1");';
      expect(rule.patterns.some((p) => p.test(line))).toBe(false);
    });

    it('does NOT flag the parameterized $queryRawUnsafe positional form', () => {
      const line = 'await prisma.$queryRawUnsafe("SELECT * FROM users WHERE id = $1", id);';
      expect(rule.patterns.some((p) => p.test(line))).toBe(false);
    });
  });
});

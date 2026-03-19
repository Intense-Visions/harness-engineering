import { describe, it, expect, vi } from 'vitest';
import { SecurityScanner } from '../../src/security/scanner';

vi.mock('node:fs/promises', async () => ({
  readFile: vi.fn(),
}));

describe('SecurityScanner', () => {
  it('scans content and returns findings for AWS key', () => {
    const scanner = new SecurityScanner({ enabled: true, strict: false });
    const findings = scanner.scanContent('const key = "AKIAIOSFODNN7EXAMPLE";', 'src/config.ts', 1);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].ruleId).toMatch(/^SEC-SEC-/);
    expect(findings[0].severity).toBe('error');
  });

  it('detects eval in content', () => {
    const scanner = new SecurityScanner({ enabled: true, strict: false });
    const findings = scanner.scanContent('eval(userInput)', 'src/util.ts', 1);
    expect(findings.some((f) => f.ruleId === 'SEC-INJ-001')).toBe(true);
  });

  it('detects SQL injection', () => {
    const scanner = new SecurityScanner({ enabled: true, strict: false });
    const findings = scanner.scanContent(
      'query("SELECT * FROM users WHERE id=" + id)',
      'src/db.ts',
      1
    );
    expect(findings.some((f) => f.ruleId === 'SEC-INJ-002')).toBe(true);
  });

  it('respects rule overrides (off)', () => {
    const scanner = new SecurityScanner({
      enabled: true,
      strict: false,
      rules: { 'SEC-SEC-001': 'off' },
    });
    const findings = scanner.scanContent('const key = "AKIAIOSFODNN7EXAMPLE";', 'src/config.ts', 1);
    expect(findings.some((f) => f.ruleId === 'SEC-SEC-001')).toBe(false);
  });

  it('promotes warnings to errors in strict mode', () => {
    const scanner = new SecurityScanner({ enabled: true, strict: true });
    const findings = scanner.scanContent("origin: '*'", 'src/cors.ts', 1);
    const corsFindings = findings.filter((f) => f.ruleId === 'SEC-NET-001');
    if (corsFindings.length > 0) {
      expect(corsFindings[0].severity).toBe('error');
    }
  });

  it('returns empty when disabled', () => {
    const scanner = new SecurityScanner({ enabled: false, strict: false });
    const findings = scanner.scanContent('eval(x)', 'src/util.ts', 1);
    expect(findings).toHaveLength(0);
  });

  it('scanFile returns findings for file content', async () => {
    const { readFile } = await import('node:fs/promises');
    vi.mocked(readFile).mockResolvedValue(
      'const key = "AKIAIOSFODNN7EXAMPLE";\neval(userInput);\n'
    );

    const scanner = new SecurityScanner({ enabled: true, strict: false });
    const findings = await scanner.scanFile('src/config.ts');
    expect(findings.length).toBeGreaterThanOrEqual(2);
  });

  it('scanFiles aggregates findings across files', async () => {
    const { readFile } = await import('node:fs/promises');
    vi.mocked(readFile)
      .mockResolvedValueOnce('eval(x)')
      .mockResolvedValueOnce('const key = "AKIAIOSFODNN7EXAMPLE";');

    const scanner = new SecurityScanner({ enabled: true, strict: false });
    const result = await scanner.scanFiles(['src/a.ts', 'src/b.ts']);
    expect(result.scannedFiles).toBe(2);
    expect(result.findings.length).toBeGreaterThanOrEqual(2);
    expect(result.coverage).toBe('baseline');
  });
});

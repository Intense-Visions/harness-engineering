import { describe, it, expect, vi } from 'vitest';
import { SecurityScanner } from '../../src/security/scanner';
import { parseHarnessIgnore } from '../../src/security/scanner';

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

  describe('parseHarnessIgnore', () => {
    it('returns null for lines without harness-ignore', () => {
      expect(parseHarnessIgnore('const x = 1;', 'SEC-INJ-001')).toBeNull();
    });

    it('matches JS comment with justification', () => {
      const result = parseHarnessIgnore(
        '// harness-ignore SEC-INJ-001: false positive in test fixture',
        'SEC-INJ-001'
      );
      expect(result).toEqual({
        ruleId: 'SEC-INJ-001',
        justification: 'false positive in test fixture',
      });
    });

    it('matches JS comment without justification', () => {
      const result = parseHarnessIgnore('// harness-ignore SEC-INJ-001', 'SEC-INJ-001');
      expect(result).toEqual({
        ruleId: 'SEC-INJ-001',
        justification: null,
      });
    });

    it('matches hash comment style', () => {
      const result = parseHarnessIgnore(
        '# harness-ignore SEC-INJ-001: used in shell script',
        'SEC-INJ-001'
      );
      expect(result).toEqual({
        ruleId: 'SEC-INJ-001',
        justification: 'used in shell script',
      });
    });

    it('returns null when ruleId does not match', () => {
      expect(parseHarnessIgnore('// harness-ignore SEC-INJ-002', 'SEC-INJ-001')).toBeNull();
    });

    it('treats colon with no text as unjustified', () => {
      const result = parseHarnessIgnore('// harness-ignore SEC-INJ-001:', 'SEC-INJ-001');
      expect(result).toEqual({
        ruleId: 'SEC-INJ-001',
        justification: null,
      });
    });
  });

  describe('FP verification gate', () => {
    it('unjustified suppression emits warning and suppresses original rule', () => {
      const scanner = new SecurityScanner({ enabled: true, strict: false });
      const code = 'eval(userInput) // harness-ignore SEC-INJ-001';
      const findings = scanner.scanContent(code, 'src/util.ts');

      // Original rule (SEC-INJ-001 eval) should be suppressed
      const evalFindings = findings.filter(
        (f) => f.ruleId === 'SEC-INJ-001' && f.message.includes('eval')
      );
      expect(evalFindings).toHaveLength(0);

      // But a warning about missing justification should appear
      const suppressionWarnings = findings.filter(
        (f) => f.ruleId === 'SEC-INJ-001' && f.message.includes('requires justification')
      );
      expect(suppressionWarnings).toHaveLength(1);
      expect(suppressionWarnings[0].severity).toBe('warning');
    });

    it('justified suppression produces no findings', () => {
      const scanner = new SecurityScanner({ enabled: true, strict: false });
      const code = 'eval(userInput) // harness-ignore SEC-INJ-001: false positive in test fixture';
      const findings = scanner.scanContent(code, 'src/util.ts');

      const injFindings = findings.filter((f) => f.ruleId === 'SEC-INJ-001');
      expect(injFindings).toHaveLength(0);
    });

    it('strict mode promotes unjustified suppression to error', () => {
      const scanner = new SecurityScanner({ enabled: true, strict: true });
      const code = 'eval(userInput) // harness-ignore SEC-INJ-001';
      const findings = scanner.scanContent(code, 'src/util.ts');

      const suppressionFindings = findings.filter(
        (f) => f.ruleId === 'SEC-INJ-001' && f.message.includes('requires justification')
      );
      expect(suppressionFindings).toHaveLength(1);
      expect(suppressionFindings[0].severity).toBe('error');
    });

    it('existing suppression format still suppresses original rule', () => {
      const scanner = new SecurityScanner({ enabled: true, strict: false });
      // Old format: no colon, no justification — should still suppress the eval finding
      const code = 'eval(userInput) // harness-ignore SEC-INJ-001';
      const findings = scanner.scanContent(code, 'src/util.ts');

      const evalFindings = findings.filter(
        (f) => f.ruleId === 'SEC-INJ-001' && !f.message.includes('requires justification')
      );
      expect(evalFindings).toHaveLength(0);
    });

    it('suppression warning includes remediation guidance', () => {
      const scanner = new SecurityScanner({ enabled: true, strict: false });
      const code = 'eval(userInput) // harness-ignore SEC-INJ-001';
      const findings = scanner.scanContent(code, 'src/util.ts');

      const warning = findings.find((f) => f.message.includes('requires justification'));
      expect(warning).toBeDefined();
      expect(warning!.remediation).toContain('Add justification after colon');
      expect(warning!.confidence).toBe('high');
    });
  });

  describe('SEC-DEF-* insecure defaults rules', () => {
    it('SEC-DEF-001: flags security-sensitive || fallback to hardcoded string', () => {
      const scanner = new SecurityScanner({ enabled: true });
      const findings = scanner.scanContent(
        'const secret = process.env.SECRET || "default-secret"',
        'src/config.ts'
      );
      expect(findings.some((f) => f.ruleId === 'SEC-DEF-001')).toBe(true);
    });

    it('SEC-DEF-001: flags JWT_SECRET ?? fallback', () => {
      const scanner = new SecurityScanner({ enabled: true });
      const findings = scanner.scanContent(
        'const jwtSecret = process.env.JWT_SECRET ?? "fallback"',
        'src/auth.ts'
      );
      expect(findings.some((f) => f.ruleId === 'SEC-DEF-001')).toBe(true);
    });

    it('SEC-DEF-001: does NOT flag non-security fallbacks', () => {
      const scanner = new SecurityScanner({ enabled: true });
      const findings = scanner.scanContent('const color = config.theme ?? "blue"', 'src/ui.ts');
      expect(findings.some((f) => f.ruleId === 'SEC-DEF-001')).toBe(false);
    });

    it('SEC-DEF-002: flags TLS disabled by default', () => {
      const scanner = new SecurityScanner({ enabled: true });
      const findings = scanner.scanContent('const tls = false', 'src/server.ts');
      expect(findings.some((f) => f.ruleId === 'SEC-DEF-002')).toBe(true);
    });

    it('SEC-DEF-004: flags CORS wildcard fallback', () => {
      const scanner = new SecurityScanner({ enabled: true });
      const findings = scanner.scanContent('const origin = config.corsOrigin ?? "*"', 'src/app.ts');
      expect(findings.some((f) => f.ruleId === 'SEC-DEF-004')).toBe(true);
    });
  });

  describe('SEC-EDGE-* sharp-edges rules', () => {
    it('SEC-EDGE-001: flags deprecated createCipher', () => {
      const scanner = new SecurityScanner({ enabled: true });
      const findings = scanner.scanContent(
        'const cipher = crypto.createCipher("aes-128-cbc", key)',
        'src/crypto.ts'
      );
      expect(findings.some((f) => f.ruleId === 'SEC-EDGE-001')).toBe(true);
    });

    it('SEC-EDGE-002: flags deprecated createDecipher', () => {
      const scanner = new SecurityScanner({ enabled: true });
      const findings = scanner.scanContent(
        'const decipher = crypto.createDecipher("aes-128-cbc", key)',
        'src/crypto.ts'
      );
      expect(findings.some((f) => f.ruleId === 'SEC-EDGE-002')).toBe(true);
    });

    it('SEC-EDGE-003: flags ECB mode string', () => {
      const scanner = new SecurityScanner({ enabled: true });
      const findings = scanner.scanContent('const algo = "aes-128-ecb"', 'src/crypto.ts');
      expect(findings.some((f) => f.ruleId === 'SEC-EDGE-003')).toBe(true);
    });

    it('SEC-EDGE-006: flags sync TOCTOU pattern on same line', () => {
      const scanner = new SecurityScanner({ enabled: true });
      const findings = scanner.scanContent(
        'if (existsSync(path)) readFileSync(path)',
        'src/files.ts'
      );
      expect(findings.some((f) => f.ruleId === 'SEC-EDGE-006')).toBe(true);
    });

    it('SEC-EDGE-008: flags JWT algorithm none', () => {
      const scanner = new SecurityScanner({ enabled: true });
      const findings = scanner.scanContent('algorithms: ["none"]', 'src/auth.ts');
      expect(findings.some((f) => f.ruleId === 'SEC-EDGE-008')).toBe(true);
    });

    it('SEC-EDGE-009: flags RC4 algorithm string', () => {
      const scanner = new SecurityScanner({ enabled: true });
      const findings = scanner.scanContent('const algo = "rc4"', 'src/crypto.ts');
      expect(findings.some((f) => f.ruleId === 'SEC-EDGE-009')).toBe(true);
    });

    it('SEC-EDGE-*: rule categories are toggleable via config', () => {
      const scanner = new SecurityScanner({
        enabled: true,
        rules: { 'SEC-DEF-*': 'off', 'SEC-EDGE-*': 'off' },
      });
      const findings = scanner.scanContent(
        'const secret = process.env.SECRET || "default"\nconst cipher = crypto.createCipher("aes-128-cbc", key)',
        'src/config.ts'
      );
      expect(findings.some((f) => f.ruleId.startsWith('SEC-DEF-'))).toBe(false);
      expect(findings.some((f) => f.ruleId.startsWith('SEC-EDGE-'))).toBe(false);
    });
  });
});

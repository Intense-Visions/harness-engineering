import { describe, it, expect } from 'vitest';
import { secretRules } from '../../../src/security/rules/secrets';
import { SecurityScanner } from '../../../src/security/scanner';

describe('Secret detection rules', () => {
  it('exports multiple rules', () => {
    expect(secretRules.length).toBeGreaterThan(0);
    for (const rule of secretRules) {
      expect(rule.id).toMatch(/^SEC-SEC-/);
      expect(rule.category).toBe('secrets');
      expect(rule.confidence).toBe('high');
      expect(rule.severity).toBe('error');
    }
  });

  it('detects AWS access key patterns', () => {
    const rule = secretRules.find((r) => r.id === 'SEC-SEC-001');
    expect(rule).toBeDefined();
    const testLine = 'const key = "AKIAIOSFODNN7EXAMPLE";';
    expect(rule!.patterns.some((p) => p.test(testLine))).toBe(true);
  });

  it('detects generic API key assignments', () => {
    const rule = secretRules.find((r) => r.id === 'SEC-SEC-002');
    expect(rule).toBeDefined();
    const testLine = 'const API_KEY = "sk-live-abc123def456";';
    expect(rule!.patterns.some((p) => p.test(testLine))).toBe(true);
  });

  it('detects private key headers', () => {
    const rule = secretRules.find((r) => r.id === 'SEC-SEC-003');
    expect(rule).toBeDefined();
    const testLine = '"-----BEGIN RSA PRIVATE KEY-----"';
    expect(rule!.patterns.some((p) => p.test(testLine))).toBe(true);
  });

  it('does not flag env variable reads', () => {
    const rule = secretRules.find((r) => r.id === 'SEC-SEC-002');
    const envRead = 'const key = process.env.API_KEY;';
    expect(rule!.patterns.some((p) => p.test(envRead))).toBe(false);
  });
});

// The scanner suppresses secret findings whose value is a variable/expression
// reference rather than a literal — the SEC-SEC-002 pattern still matches the
// assignment shape, but a runtime-resolved reference is not a hardcoded leak.
describe('SecurityScanner secret reference suppression', () => {
  const scanner = new SecurityScanner();

  function scan(line: string, file = 'deploy/run.sh') {
    return scanner.scanContent(line, file).filter((f) => f.category === 'secrets');
  }

  it('does not flag a CI expression assigned to a token', () => {
    expect(scan('TOKEN: "${{ secrets.BASELINE_AUTOAPPROVE_PAT }}"')).toHaveLength(0);
  });

  it('does not flag a shell $VAR assigned to a token', () => {
    expect(scan('GH_TOKEN="$AUTOAPPROVE_PAT" gh pr review --approve')).toHaveLength(0);
  });

  it('does not flag a ${VAR} brace reference assigned to a token', () => {
    expect(scan('export API_KEY="${DEPLOY_API_KEY}"')).toHaveLength(0);
  });

  it('STILL flags a genuine hardcoded literal', () => {
    expect(scan('const API_KEY = "sk-live-abc123def456ghi789";').length).toBeGreaterThan(0);
  });

  it('STILL flags a literal with a variable-only prefix', () => {
    expect(scan('export API_KEY="${PREFIX}sk-live-abc123def456"').length).toBeGreaterThan(0);
  });

  // capwell#3311: a NAME= inside an already-open string (a grep pattern) is
  // followed by that string's CLOSING quote, not a value's opening one.
  it.each([
    ["KEY=$(grep '^API_KEY=' apps/mobile/.env.local | cut -d= -f2)", 'scripts/key.sh'],
    [" * `grep '^API_KEY=' .env`, the quote after `=` is that string's CLOSE, not a", 'src/a.ts'],
    ['TOKEN=$(grep "^ACCESS_TOKEN=" .env | cut -d= -f2-)', 'scripts/key.sh'],
  ])('does not flag a NAME= inside a quoted grep pattern: %s', (line, file) => {
    expect(scan(line, file)).toHaveLength(0);
  });

  it('STILL flags a literal nested in a string of the other quote type', () => {
    expect(scan(`echo "API_KEY='sk-live-abc123def456'" >> .env`).length).toBeGreaterThan(0);
  });

  it('STILL flags a later literal on a line whose first match is a grep pattern', () => {
    expect(
      scan(`grep '^API_KEY=' .env; export ACCESS_TOKEN="sk-live-abc123def456"`).length
    ).toBeGreaterThan(0);
  });
});

/**
 * #2375: SEC-SEC-004 required the literal to follow the name directly
 * (`password = "..."`), so a type annotation between them hid the credential:
 * `const password: string = "..."` (TS) and `const DB_PASSWORD: &str = "..."`
 * (Rust). The annotation is now allowed; non-literal right-hand sides, type-only
 * declarations and prompt/label names must stay quiet.
 */
describe('SEC-SEC-004 typed declarations (#2375)', () => {
  const scanner = new SecurityScanner({ enabled: true, strict: false });
  const ids = (content: string, file: string) =>
    scanner.scanFileContent(content, file).map((f) => f.ruleId);

  const flagged: Array<[string, string]> = [
    ['TS const with string annotation', 'const password: string = "hunter2-secret";'],
    ['TS class field with annotation', "  private readonly dbPassword: string = 'hunter2';"],
    ['TS default parameter', "function login(password: string = 'changeme') {}"],
    ['Python annotated assignment', 'PASSWORD: str = "hunter2-secret"'],
  ];
  for (const [label, line] of flagged) {
    it(`flags ${label}`, () => {
      expect(ids(line, 'src/config.ts')).toContain('SEC-SEC-004');
    });
  }

  const quiet: Array<[string, string]> = [
    ['interface member', '  password: string;'],
    ['env-sourced value', 'const password: string = process.env.DB_PASSWORD ?? "";'],
    ['label/prompt name', 'const passwordLabel: string = "Enter your password";'],
    ['prompt constant', 'const PASSWORD_PROMPT: string = "Password: ";'],
    ['comparison, not assignment', 'const ok = { password: input === "abcd1234" };'],
    ['short literal', 'const pwd: string = "";'],
    ['reference-only value', 'const password: string = "${DB_PASSWORD}";'],
  ];
  for (const [label, line] of quiet) {
    it(`stays quiet on ${label}`, () => {
      expect(ids(line, 'src/config.ts')).not.toContain('SEC-SEC-004');
    });
  }
});

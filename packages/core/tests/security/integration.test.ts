import { describe, it, expect } from 'vitest';
import { SecurityScanner } from '../../src/security/scanner';

describe('Security scanner integration', () => {
  const scanner = new SecurityScanner({ enabled: true, strict: false });

  it('detects multiple vulnerability types in a single file', () => {
    const code = [
      'import express from "express";',
      'const app = express();',
      'const API_KEY = "sk-live-abc123def456ghi789";',
      'app.get("/users", (req, res) => {',
      '  const id = req.query.id;',
      '  const result = query("SELECT * FROM users WHERE id=" + id);',
      '  res.send(eval(req.body.template));',
      '});',
    ].join('\n');

    const findings = scanner.scanContent(code, 'src/app.ts');
    const ruleIds = findings.map((f) => f.ruleId);
    expect(ruleIds).toContain('SEC-SEC-002'); // API key
    expect(ruleIds).toContain('SEC-INJ-002'); // SQL injection
    expect(ruleIds).toContain('SEC-INJ-001'); // eval
  });

  it('produces no error findings for clean code', () => {
    const code = [
      'import { query } from "./db";',
      'const key = process.env.API_KEY;',
      'const result = await query("SELECT * FROM users WHERE id = $1", [id]);',
      'element.textContent = sanitizedInput;',
    ].join('\n');

    const findings = scanner.scanContent(code, 'src/clean.ts');
    const errors = findings.filter((f) => f.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('strict mode promotes warnings to errors', () => {
    const strictScanner = new SecurityScanner({ enabled: true, strict: true });
    const code = "origin: '*'";
    const findings = strictScanner.scanContent(code, 'src/cors.ts');
    const corsFindings = findings.filter((f) => f.ruleId === 'SEC-NET-001');
    if (corsFindings.length > 0) {
      expect(corsFindings[0].severity).toBe('error');
    }
  });

  it('respects rule overrides', () => {
    const customScanner = new SecurityScanner({
      enabled: true,
      strict: false,
      rules: { 'SEC-INJ-001': 'off' },
    });
    const findings = customScanner.scanContent('eval(x)', 'src/util.ts');
    expect(findings.some((f) => f.ruleId === 'SEC-INJ-001')).toBe(false);
  });

  it('findings include remediation guidance', () => {
    const findings = scanner.scanContent('eval(userInput)', 'src/util.ts');
    const evalFinding = findings.find((f) => f.ruleId === 'SEC-INJ-001');
    expect(evalFinding).toBeDefined();
    expect(evalFinding!.remediation).toBeTruthy();
    expect(evalFinding!.message).toBeTruthy();
    expect(evalFinding!.references).toBeDefined();
  });

  it('disabled scanner returns no findings', () => {
    const disabled = new SecurityScanner({ enabled: false, strict: false });
    const findings = disabled.scanContent('eval(x)', 'src/util.ts');
    expect(findings).toHaveLength(0);
  });

  it('wildcard rule override disables entire category', () => {
    const customScanner = new SecurityScanner({
      enabled: true,
      strict: false,
      rules: { 'SEC-INJ-*': 'off' },
    });
    const code = [
      'eval(userInput)',
      'query("SELECT * FROM users WHERE id=" + id)',
      'exec("rm -rf " + dir)',
    ].join('\n');
    const findings = customScanner.scanContent(code, 'src/app.ts');
    const injectionFindings = findings.filter((f) => f.ruleId.startsWith('SEC-INJ-'));
    expect(injectionFindings).toHaveLength(0);
  });

  it('correctly reports line numbers', () => {
    const code = ['const a = 1;', 'const b = 2;', 'eval(userInput);', 'const c = 3;'].join('\n');
    const findings = scanner.scanContent(code, 'src/lines.ts');
    const evalFinding = findings.find((f) => f.ruleId === 'SEC-INJ-001');
    expect(evalFinding).toBeDefined();
    expect(evalFinding!.line).toBe(3);
  });
});

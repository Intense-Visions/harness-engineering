import { describe, it, expect } from 'vitest';
import { runSecurityAgent, SECURITY_DESCRIPTOR } from '../../../src/review/agents/security-agent';
import type { ContextBundle } from '../../../src/review/types';

function makeBundle(overrides: Partial<ContextBundle> = {}): ContextBundle {
  return {
    domain: 'security',
    changeType: 'feature',
    changedFiles: [
      {
        path: 'src/api/auth.ts',
        content: 'export function login(user: string, pass: string) { return true; }',
        reason: 'changed',
        lines: 1,
      },
    ],
    contextFiles: [],
    commitHistory: [],
    diffLines: 10,
    contextLines: 0,
    ...overrides,
  };
}

describe('SECURITY_DESCRIPTOR', () => {
  it('has domain security and tier strong', () => {
    expect(SECURITY_DESCRIPTOR.domain).toBe('security');
    expect(SECURITY_DESCRIPTOR.tier).toBe('strong');
  });

  it('has a displayName', () => {
    expect(SECURITY_DESCRIPTOR.displayName).toBe('Security');
  });
});

describe('runSecurityAgent()', () => {
  it('returns ReviewFinding[] with domain security', () => {
    const findings = runSecurityAgent(makeBundle());
    expect(Array.isArray(findings)).toBe(true);
    for (const f of findings) {
      expect(f.domain).toBe('security');
    }
  });

  it('all findings have validatedBy heuristic', () => {
    const findings = runSecurityAgent(makeBundle());
    for (const f of findings) {
      expect(f.validatedBy).toBe('heuristic');
    }
  });

  it('detects eval usage', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'src/eval-usage.ts',
          content: 'const result = eval(userInput);',
          reason: 'changed',
          lines: 1,
        },
      ],
    });
    const findings = runSecurityAgent(bundle);
    expect(findings.some((f) => f.title.toLowerCase().includes('eval'))).toBe(true);
    expect(findings.some((f) => f.severity === 'critical')).toBe(true);
  });

  it('detects hardcoded secrets', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'src/config.ts',
          content: 'const API_KEY = "sk-1234567890abcdef";',
          reason: 'changed',
          lines: 1,
        },
      ],
    });
    const findings = runSecurityAgent(bundle);
    expect(
      findings.some(
        (f) =>
          f.title.toLowerCase().includes('secret') || f.title.toLowerCase().includes('hardcoded')
      )
    ).toBe(true);
  });

  it('detects SQL injection risk from string concatenation', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'src/db.ts',
          content: 'const query = "SELECT * FROM users WHERE id = " + userId;',
          reason: 'changed',
          lines: 1,
        },
      ],
    });
    const findings = runSecurityAgent(bundle);
    expect(findings.some((f) => f.title.toLowerCase().includes('sql'))).toBe(true);
  });

  it('detects shell command injection risk', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'src/exec.ts',
          content: 'import { exec } from "child_process";\nexec(`rm -rf ${userDir}`);',
          reason: 'changed',
          lines: 2,
        },
      ],
    });
    const findings = runSecurityAgent(bundle);
    expect(
      findings.some(
        (f) =>
          f.title.toLowerCase().includes('command') ||
          f.title.toLowerCase().includes('injection') ||
          f.title.toLowerCase().includes('exec')
      )
    ).toBe(true);
  });

  it('generates unique ids', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'src/multi.ts',
          content: 'eval(x);\nconst key = "secret123";',
          reason: 'changed',
          lines: 2,
        },
      ],
    });
    const findings = runSecurityAgent(bundle);
    const ids = findings.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('returns empty findings for safe code', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'src/safe.ts',
          content: 'export function add(a: number, b: number): number { return a + b; }',
          reason: 'changed',
          lines: 1,
        },
      ],
    });
    const findings = runSecurityAgent(bundle);
    expect(findings.length).toBe(0);
  });
});

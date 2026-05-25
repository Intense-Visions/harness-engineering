import { describe, it, expect } from 'vitest';
import { runReport } from '../../../src/design-pipeline/phases/report';
import { newContext } from '../../../src/design-pipeline/context';
import type { DriftFinding } from '../../../src/drift/findings/finding';
import type { BrandFinding } from '../../../src/brand/findings/finding';

function drift(severity: 'error' | 'warn' | 'info', code: string): DriftFinding {
  return {
    code: `DRIFT-${code}` as DriftFinding['code'],
    severity,
    file: 'a.ts',
    line: 1,
    message: 'msg',
    evidence: { snippet: '' },
    rule: { id: code, category: 'token-bypass' },
    fix: { kind: 'manual', description: '' },
  };
}

function brand(severity: 'error' | 'warn' | 'info', code: string): BrandFinding {
  return {
    code: `BRAND-${code}` as BrandFinding['code'],
    severity,
    file: 'a.ts',
    line: 1,
    message: 'msg',
    evidence: { snippet: '' },
    rule: { id: code, category: 'token-misuse' },
    fix: { kind: 'manual', description: '' },
  };
}

describe('runReport', () => {
  it('verdict=pass when zero findings + no suggestions + no bootstrap', () => {
    const ctx = newContext();
    runReport({ context: ctx });
    expect(ctx.verdict).toBe('pass');
    expect(ctx.summary.totalFindings).toBe(0);
  });

  it('verdict=warn when only warn-severity findings present', () => {
    const ctx = newContext();
    ctx.driftFindings.push(drift('warn', 'T003'));
    runReport({ context: ctx });
    expect(ctx.verdict).toBe('warn');
    expect(ctx.summary.bySeverity.warn).toBe(1);
  });

  it('verdict=warn when only craft suggestions present', () => {
    const ctx = newContext();
    ctx.craftSuggestions = 3;
    runReport({ context: ctx });
    expect(ctx.verdict).toBe('warn');
  });

  it('verdict=warn when bootstrap occurred (even with no findings)', () => {
    const ctx = newContext();
    ctx.bootstrapped.designMd = true;
    runReport({ context: ctx });
    expect(ctx.verdict).toBe('warn');
  });

  it('verdict=fail when any error-severity finding present', () => {
    const ctx = newContext();
    ctx.driftFindings.push(drift('error', 'T001'));
    runReport({ context: ctx });
    expect(ctx.verdict).toBe('fail');
  });

  it('aggregates bySeverity and byCode across drift + anatomy + brand', () => {
    const ctx = newContext();
    ctx.driftFindings.push(drift('error', 'T001'));
    ctx.auditFindings.brand.push(brand('warn', 'V001'));
    runReport({ context: ctx });
    expect(ctx.summary.bySeverity.error).toBe(1);
    expect(ctx.summary.bySeverity.warn).toBe(1);
    expect(ctx.summary.byCode['DRIFT-T001']).toBe(1);
    expect(ctx.summary.byCode['BRAND-V001']).toBe(1);
    expect(ctx.summary.totalFindings).toBe(2);
  });

  it('fixes applied count comes from fixesApplied[].kind === applied only', () => {
    const ctx = newContext();
    ctx.fixesApplied.push(
      {
        kind: 'applied',
        finding: drift('error', 'T001'),
        diff: { file: 'a.ts', before: '', after: '', line: 1 },
      },
      {
        kind: 'suggestion',
        finding: drift('warn', 'T002'),
        suggestion: { description: '', preview: '' },
      },
      { kind: 'skipped-unsafe', finding: drift('error', 'T001'), reason: '' }
    );
    runReport({ context: ctx });
    expect(ctx.summary.fixesApplied).toBe(1);
  });
});

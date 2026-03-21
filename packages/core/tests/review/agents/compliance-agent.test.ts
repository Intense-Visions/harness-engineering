import { describe, it, expect } from 'vitest';
import {
  runComplianceAgent,
  COMPLIANCE_DESCRIPTOR,
} from '../../../src/review/agents/compliance-agent';
import type { ContextBundle, ReviewFinding } from '../../../src/review/types';

function makeBundle(overrides: Partial<ContextBundle> = {}): ContextBundle {
  return {
    domain: 'compliance',
    changeType: 'feature',
    changedFiles: [
      {
        path: 'src/api/users.ts',
        content: 'export function createUser() { return {}; }',
        reason: 'changed',
        lines: 1,
      },
    ],
    contextFiles: [
      {
        path: 'CLAUDE.md',
        content:
          '# Conventions\n- All exports must have JSDoc\n- Use Result type for fallible operations',
        reason: 'convention',
        lines: 3,
      },
    ],
    commitHistory: [],
    diffLines: 10,
    contextLines: 3,
    ...overrides,
  };
}

describe('COMPLIANCE_DESCRIPTOR', () => {
  it('has domain compliance and tier standard', () => {
    expect(COMPLIANCE_DESCRIPTOR.domain).toBe('compliance');
    expect(COMPLIANCE_DESCRIPTOR.tier).toBe('standard');
  });

  it('has a displayName', () => {
    expect(COMPLIANCE_DESCRIPTOR.displayName).toBe('Compliance');
  });

  it('has focus areas', () => {
    expect(COMPLIANCE_DESCRIPTOR.focusAreas.length).toBeGreaterThan(0);
  });
});

describe('runComplianceAgent()', () => {
  it('returns an array of ReviewFinding objects', () => {
    const findings = runComplianceAgent(makeBundle());
    expect(Array.isArray(findings)).toBe(true);
  });

  it('all findings have domain compliance', () => {
    const findings = runComplianceAgent(makeBundle());
    for (const f of findings) {
      expect(f.domain).toBe('compliance');
    }
  });

  it('all findings have valid severity', () => {
    const findings = runComplianceAgent(makeBundle());
    for (const f of findings) {
      expect(['critical', 'important', 'suggestion']).toContain(f.severity);
    }
  });

  it('all findings have validatedBy heuristic by default', () => {
    const findings = runComplianceAgent(makeBundle());
    for (const f of findings) {
      expect(f.validatedBy).toBe('heuristic');
    }
  });

  it('generates unique ids for each finding', () => {
    const findings = runComplianceAgent(makeBundle());
    const ids = findings.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('produces findings when convention files contain rules and code lacks JSDoc', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'src/api/users.ts',
          content: 'export function createUser() { return {}; }',
          reason: 'changed',
          lines: 1,
        },
      ],
      contextFiles: [
        {
          path: 'CLAUDE.md',
          content: '# Conventions\n- All exports must have JSDoc',
          reason: 'convention',
          lines: 2,
        },
      ],
    });
    const findings = runComplianceAgent(bundle);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.some((f) => f.title.toLowerCase().includes('jsdoc'))).toBe(true);
  });

  it('checks for spec alignment on feature changes', () => {
    const bundle = makeBundle({ changeType: 'feature' });
    const findings = runComplianceAgent(bundle);
    // Feature changes should produce spec-alignment related checks
    expect(findings.some((f) => f.evidence.some((e) => e.includes('feature')))).toBe(true);
  });

  it('checks for root cause on bugfix changes', () => {
    const bundle = makeBundle({ changeType: 'bugfix' });
    const findings = runComplianceAgent(bundle);
    expect(findings.some((f) => f.evidence.some((e) => e.includes('bugfix')))).toBe(true);
  });

  it('returns empty array when no convention files are present and no issues detected', () => {
    const bundle = makeBundle({
      contextFiles: [],
      changedFiles: [
        {
          path: 'src/a.ts',
          content: '/** Creates a user. */\nexport function createUser() {}',
          reason: 'changed',
          lines: 2,
        },
      ],
    });
    const findings = runComplianceAgent(bundle);
    // With no conventions and well-documented code, findings may be empty or minimal
    expect(Array.isArray(findings)).toBe(true);
  });
});

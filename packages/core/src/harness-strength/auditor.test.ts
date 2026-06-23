import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessStrengthAuditor } from './auditor';
import { isOk } from '../shared/result';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'hs-auditor-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function writeHusky(text: string): void {
  mkdirSync(join(root, '.husky'), { recursive: true });
  writeFileSync(join(root, '.husky', 'pre-commit'), text);
}

describe('HarnessStrengthAuditor.audit', () => {
  it('returns Ok with a clean result for a bare directory', () => {
    const result = new HarnessStrengthAuditor().audit(root, {});
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    const v = result.value;
    expect(v.mode).toBe('adopter');
    expect(v.findings).toEqual([]);
    expect(v.score).toBe(100);
    expect(v.tier).toBe('solid');
    // Bare dir: every rule's required input is absent => none evaluable.
    expect(v.summary.rulesRun).toBe(0);
    expect(v.summary.rulesPassing).toBe(0);
  });

  it('detects STRENGTH-001 at default severity (error)', () => {
    writeHusky('#!/bin/sh\n# never blocks\nexit 0\n');
    const result = new HarnessStrengthAuditor().audit(root, {});
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    const v = result.value;
    const ids = v.findings.map((f) => f.id);
    expect(ids).toContain('STRENGTH-001');
    const s001 = v.findings.find((f) => f.id === 'STRENGTH-001')!;
    expect(s001.severity).toBe('error');
    expect(v.summary.errors).toBeGreaterThanOrEqual(1);
    expect(v.score).toBeLessThan(100);
  });

  it('applies a config severity override to a finding', () => {
    writeHusky('#!/bin/sh\n# never blocks\nexit 0\n');
    writeFileSync(
      join(root, 'harness.config.json'),
      JSON.stringify({ audit: { harnessStrength: { severities: { 'STRENGTH-001': 'warning' } } } })
    );
    const result = new HarnessStrengthAuditor().audit(root, {});
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    const v = result.value;
    const s001 = v.findings.find((f) => f.id === 'STRENGTH-001')!;
    expect(s001.severity).toBe('warning');
    expect(v.summary.warnings).toBeGreaterThanOrEqual(1);
  });
});

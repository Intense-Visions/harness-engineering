import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessStrengthAuditor } from './auditor';
import { scoreWithCoverage } from './scoring';
import { isOk } from '../shared/result';

/**
 * Regression for #1761 (follow-up to #1013): `check-harness-strength` still
 * awarded a bare 100/100 when most of the registry never ran. #1013 fixed the
 * disclosure (the `incomplete` tier + a coverage line) but left the score
 * itself computed as `100 - sum(findings)`, with no coverage term — so
 * abstention deducted nothing and the headline number stayed 100.
 *
 * These tests reproduce the limiting case the issue names — a clean project
 * where only some patterns are evaluable — and pin that the SCORE, not merely
 * the tier, drops below 100. Each FAILS on the pre-fix code (score === 100) and
 * PASSES after coverage scaling.
 */

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

// A near-empty project: a populated, clean harness.config.json makes only the
// config-sourced patterns (STRENGTH-004/005) evaluable; the hook-, workflow-,
// and snapshot-based patterns abstain. Nothing is wrong with what ran — the
// coverage is simply partial, exactly the case in the issue's reproduction.
function buildPartialCleanProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'hs-1761-'));
  dirs.push(dir);
  writeFileSync(
    join(dir, 'harness.config.json'),
    JSON.stringify({
      version: 1,
      layers: [{ name: 'a' }],
      architecture: { thresholds: { maxFanIn: 12 } },
    })
  );
  return dir;
}

describe('check-harness-strength score reflects coverage (#1761)', () => {
  it('does not award a bare 100 when a clean audit evaluated only some patterns', () => {
    const dir = buildPartialCleanProject();
    const result = new HarnessStrengthAuditor().audit(dir, {});
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    const v = result.value;

    // Preconditions: the run is genuinely clean but genuinely partial.
    expect(v.findings).toEqual([]);
    expect(v.summary.skipped.length).toBeGreaterThan(0);
    expect(v.summary.rulesRun).toBeLessThan(v.summary.rulesApplicable);

    // The bug: the headline number was 100 despite the partial denominator.
    // Post-fix, the score carries the coverage term and drops below 100.
    expect(v.score).toBeLessThan(100);

    // And it tracks the coverage ratio: rounded (100 * rulesRun / rulesApplicable).
    const expected = Math.round((100 * v.summary.rulesRun) / v.summary.rulesApplicable);
    expect(v.score).toBe(expected);
  });

  it('scores 0, not 100, when every applicable pattern abstains (the #1013 limiting case)', () => {
    // A bare directory: no config, no hooks, no workflows, no snapshot — every
    // pattern abstains. "We could not audit anything" must not read as 100/100.
    const dir = mkdtempSync(join(tmpdir(), 'hs-1761-bare-'));
    dirs.push(dir);
    const result = new HarnessStrengthAuditor().audit(dir, {});
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    const v = result.value;
    expect(v.findings).toEqual([]);
    expect(v.summary.rulesRun).toBe(0);
    expect(v.score).toBe(0);
  });

  it('scoreWithCoverage: partial coverage penalizes, full coverage is the identity', () => {
    // 2 of 7 patterns clean => ~29, not 100.
    expect(scoreWithCoverage(100, 2, 7)).toBe(29);
    // Full coverage leaves a clean score untouched.
    expect(scoreWithCoverage(100, 7, 7)).toBe(100);
    // Zero coverage floors to 0.
    expect(scoreWithCoverage(100, 0, 7)).toBe(0);
    // Vacuous denominator is a safe passthrough (no divide-by-zero).
    expect(scoreWithCoverage(100, 0, 0)).toBe(100);
  });
});

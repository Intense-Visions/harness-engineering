import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { computeRulesProvenance, formatProvenanceReport } from './provenance';

describe('harness rules provenance', () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'rules-prov-'));
  });

  afterEach(async () => {
    await fs.rm(cwd, { recursive: true, force: true });
  });

  it('reports every registered rule as unexplained when no solution links exist', async () => {
    const report = await computeRulesProvenance(cwd);
    expect(report.totalRules).toBeGreaterThan(0);
    expect(report.unexplained).toHaveLength(report.totalRules);
    expect(report.explainedRules).toBe(0);
    expect(report.deadRuleCandidates).toEqual([]);
  });

  it('marks a rule explained when a solution enforces it', async () => {
    const file = path.join(cwd, 'docs', 'solutions', 'bug-track', 'logic-errors', 's.md');
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, '---\nmodule: core\nenforces:\n  - STRENGTH-002\n---\n\nbody\n');

    const report = await computeRulesProvenance(cwd);
    expect(report.unexplained.some((u) => u.ruleId === 'STRENGTH-002')).toBe(false);
    expect(report.totalSolutions).toBe(1);
  });

  it('flags a solution enforcing an unknown STRENGTH id as a candidate dead rule', async () => {
    const file = path.join(cwd, 'docs', 'solutions', 'bug-track', 'logic-errors', 'dead.md');
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, '---\nmodule: core\nenforces:\n  - STRENGTH-404\n---\n\nbody\n');

    const report = await computeRulesProvenance(cwd);
    expect(report.deadRuleCandidates).toContainEqual(
      expect.objectContaining({ reason: 'enforced-rule-missing', ruleId: 'STRENGTH-404' })
    );
  });

  it('formats a human-readable advisory report', async () => {
    const report = await computeRulesProvenance(cwd);
    const text = formatProvenanceReport(report);
    expect(text).toContain('Rule-to-failure provenance (advisory — ADR 0100)');
    expect(text).toContain('Unexplained constraints');
    expect(text).toContain('Candidate dead rules');
  });
});

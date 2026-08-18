import { describe, it, expect } from 'vitest';
import { runSecurityAgent } from '../../src/review/agents/security-agent';
import { validateFindings } from '../../src/review/validate-findings';
import { buildExclusionSet } from '../../src/review/exclusion-set';
import type { ContextBundle, ContextFile, ReviewFinding } from '../../src/review/types';

/**
 * Regression for #1302 — the heuristic review path must honor `// harness-ignore
 * SEC-XXX-NNN` annotations exactly as the mechanical/SecurityScanner path does.
 *
 * Scenario: the workspace already reviewed and justified a security finding with
 * a `harness-ignore` annotation. The mechanical SecurityScanner drops it (so it
 * is absent from the ExclusionSet — modelled here by an empty exclusion set).
 * The heuristic security agent re-scans the raw pattern and must NOT re-report
 * the annotated finding, while an un-annotated finding on another line survives.
 */

const projectRoot = '/project';

// Line 3 (safe) carries a prior-line harness-ignore for SEC-INJ-002 (SQL concat).
// Line 4 (unsafe) has the identical injection shape but no annotation.
const FILE_PATH = 'src/db.ts';
const FILE_CONTENT = [
  /* 1 */ 'export function buildQueries(userName: string, adminName: string) {',
  /* 2 */ '  // harness-ignore SEC-INJ-002: values are parameterized upstream, reviewed 2026-08',
  /* 3 */ '  const safe = query("SELECT id FROM users WHERE name = " + userName);',
  /* 4 */ '  const unsafe = query("SELECT id FROM admins WHERE name = " + adminName);',
  /* 5 */ '  return [safe, unsafe];',
  /* 6 */ '}',
  '',
].join('\n');

function makeBundle(): ContextBundle {
  const changed: ContextFile = {
    path: FILE_PATH,
    content: FILE_CONTENT,
    reason: 'changed',
    lines: FILE_CONTENT.split('\n').length,
  };
  return {
    domain: 'security',
    changeType: 'feature',
    changedFiles: [changed],
    contextFiles: [],
    commitHistory: [],
    diffLines: changed.lines,
    contextLines: 0,
  };
}

describe('#1302 heuristic path honors harness-ignore', () => {
  it('the security agent detects both SQL-injection lines at base', () => {
    const findings = runSecurityAgent(makeBundle());
    const sql = findings.filter((f) => f.cweId === 'CWE-89');
    // Sanity: the heuristic detector fires on both concat lines (3 and 4).
    expect(sql.map((f) => f.lineRange[0]).sort()).toEqual([3, 4]);
  });

  it('drops the annotated finding but keeps the un-annotated one through VALIDATE', async () => {
    const rawFindings: ReviewFinding[] = runSecurityAgent(makeBundle());

    const changedFileContents = new Map<string, string>([[FILE_PATH, FILE_CONTENT]]);

    const validated = await validateFindings({
      findings: rawFindings,
      // Mechanical path already suppressed SEC-INJ-002 via the annotation, so it
      // is NOT present in the exclusion set — this is the exact bug condition.
      exclusionSet: buildExclusionSet([]),
      projectRoot,
      changedFileContents,
    });

    const sqlLines = validated.filter((f) => f.cweId === 'CWE-89').map((f) => f.lineRange[0]);

    // Annotated line 3 must be suppressed; un-annotated line 4 must survive.
    expect(sqlLines).not.toContain(3);
    expect(sqlLines).toContain(4);
  });
});

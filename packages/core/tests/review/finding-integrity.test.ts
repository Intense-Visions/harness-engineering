import { describe, it, expect } from 'vitest';
import {
  enforceFindingIntegrity,
  checkEvidenceClassConsistency,
  claimsVulnerabilityClass,
  confidenceCeiling,
  emptyIntegrityReport,
  mergeIntegrityReports,
  formatIntegritySummary,
} from '../../src/review/finding-integrity';
import type { ReviewFinding } from '../../src/review/types';

/** Minimal well-formed finding; specs override only what they are testing. */
const finding = (over: Partial<ReviewFinding> = {}): ReviewFinding => ({
  id: 'f1',
  file: 'src/x.ts',
  lineRange: [1, 1],
  domain: 'bug',
  severity: 'important',
  title: 'A finding',
  rationale: 'Because.',
  evidence: ['Line 1: const a = 1;'],
  validatedBy: 'heuristic',
  ...over,
});

/**
 * The finding from issue #984, verbatim. Metadata from a SQL-injection finding
 * fused onto the evidence of a file-length finding; it blocked PR #983.
 */
const FABRICATED_984_FINDING: ReviewFinding = {
  id: 'typescript-strict-packages-cli-src-commands-roadmap-sync-ts-409-PotentialSQLinjectio',
  file: 'packages/cli/src/commands/roadmap/sync.ts',
  lineRange: [409, 409],
  domain: 'security',
  severity: 'critical',
  title: '[architecture, security] Potential SQL injection via string concatenation',
  rationale:
    'Past 400 lines a single TypeScript file typically encodes more than one responsibility. Adding to it compounds the burden on future readers and reviewers.',
  suggestion:
    'Identify two responsibilities and split the larger one into a new module. A new file with a clear name reads better than a longer file with vague boundaries.',
  evidence: [
    'File has 442 lines (threshold: 300)',
    'File length: 442 lines',
    "Line 409: 'never create a ticket for a row lacking an externalId (report the skip instead) — ' +",
  ],
  validatedBy: 'heuristic',
  cweId: 'CWE-89',
  owaspCategory: 'A03:2021 Injection',
  confidence: 'high',
  trustScore: 56,
  subagent: 'typescript-strict',
  remediation:
    'Use parameterized queries or a query builder (e.g., Knex, Prisma) instead of string concatenation.',
};

/** A genuine CWE-89 finding of the shape the security agent actually emits. */
const LEGITIMATE_SQL_FINDING: ReviewFinding = {
  id: 'security-src-repo-ts-88-SQLinjectionCWE89',
  file: 'src/repo.ts',
  lineRange: [88, 88],
  domain: 'security',
  severity: 'critical',
  title: 'Potential SQL injection via string concatenation',
  rationale:
    'Building SQL queries with string concatenation or template literals allows attackers to inject malicious SQL (CWE-89).',
  evidence: ['Line 88: const rows = await db.query("SELECT * FROM users WHERE id = " + userId);'],
  validatedBy: 'heuristic',
  cweId: 'CWE-89',
  owaspCategory: 'A03:2021 Injection',
  confidence: 'medium',
  trustScore: 49,
};

// ---------------------------------------------------------------------------
// Invariant 1 — evidence/class consistency (both directions)
// ---------------------------------------------------------------------------

describe('invariant 1: evidence must be consistent with the claimed vulnerability class', () => {
  it('DOWNGRADES the fabricated #984 CWE-89-on-a-file-length finding to non-blocking', () => {
    const { findings, report } = enforceFindingIntegrity([FABRICATED_984_FINDING]);

    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.severity).toBe('suggestion'); // was 'critical' — no longer blocks
    expect(f.confidence).toBe('low'); // was 'high'
    expect(report.altered).toBe(1);
    expect(report.downgraded).toBe(1);
    expect(report.dropped).toBe(0);

    const mismatch = f.integrityViolations?.find(
      (v) => v.invariant === 'evidence-class-consistency'
    );
    expect(mismatch).toBeDefined();
    expect(mismatch?.action).toBe('downgraded');
    expect(mismatch?.originalSeverity).toBe('critical');
    expect(mismatch?.reason).toContain('CWE-89');
    expect(mismatch?.reason).toContain('SQL query or query-API call');
  });

  it('PASSES a legitimate CWE-89 finding UNTOUCHED', () => {
    const { findings, report } = enforceFindingIntegrity([LEGITIMATE_SQL_FINDING]);

    expect(findings).toEqual([LEGITIMATE_SQL_FINDING]);
    expect(findings[0]!.severity).toBe('critical'); // still blocks
    expect(findings[0]!.integrityViolations).toBeUndefined();
    expect(report.examined).toBe(1);
    expect(report.vulnerabilityClaimsExamined).toBe(1);
    expect(report.altered).toBe(0);
  });

  it('DROPS instead of downgrading under onEvidenceMismatch: "drop"', () => {
    const { findings, report } = enforceFindingIntegrity([FABRICATED_984_FINDING], {
      onEvidenceMismatch: 'drop',
    });

    expect(findings).toHaveLength(0);
    expect(report.dropped).toBe(1);
    expect(report.downgraded).toBe(0);
    expect(report.violations[0]!.action).toBe('dropped');
  });

  it('catches the universal metric-only guard even with an unregistered CWE', () => {
    const reason = checkEvidenceClassConsistency(
      finding({
        domain: 'security',
        severity: 'critical',
        cweId: 'CWE-99999',
        evidence: ['File has 442 lines (threshold: 300)', 'File length: 442 lines'],
      })
    );
    expect(reason).toContain('every evidence entry is a code metric');
  });

  it('catches a vulnerability claim with no evidence at all', () => {
    const reason = checkEvidenceClassConsistency(
      finding({ domain: 'security', severity: 'critical', evidence: [] })
    );
    expect(reason).toContain('carries no evidence');
  });

  it('does not punish an unregistered CWE that carries substantive evidence', () => {
    expect(
      checkEvidenceClassConsistency(
        finding({
          domain: 'security',
          severity: 'critical',
          cweId: 'CWE-1004',
          evidence: ['Line 12: res.cookie("sid", id, { httpOnly: false })'],
        })
      )
    ).toBeUndefined();
  });

  it('requires a SQL keyword PAIR, not a bare keyword (the #984 prose trap)', () => {
    // "never CREATE a ticket…" must not satisfy CWE-89's requirement.
    expect(
      checkEvidenceClassConsistency(
        finding({ cweId: 'CWE-89', evidence: ['Line 9: create a ticket for the row'] })
      )
    ).toContain('CWE-89');
    // A real query does.
    expect(
      checkEvidenceClassConsistency(
        finding({ cweId: 'CWE-89', evidence: ['Line 9: `DELETE FROM audit WHERE id=${id}`'] })
      )
    ).toBeUndefined();
  });

  it('ignores findings that claim no vulnerability class', () => {
    const fileLength = finding({
      domain: 'architecture',
      severity: 'important',
      evidence: ['File has 442 lines (threshold: 300)'],
    });
    expect(claimsVulnerabilityClass(fileLength)).toBe(false);
    const { findings, report } = enforceFindingIntegrity([fileLength]);
    expect(findings).toEqual([fileLength]);
    expect(report.vulnerabilityClaimsExamined).toBe(0);
    expect(report.altered).toBe(0);
  });

  it('falls back to the OWASP category spec when the CWE is unregistered', () => {
    expect(
      checkEvidenceClassConsistency(
        finding({
          cweId: 'CWE-564',
          owaspCategory: 'A03:2021 Injection',
          evidence: ['File has 300 lines', 'Line 4: return renderTemplate(name)'],
        })
      )
    ).toContain('injection (OWASP A03)');
  });
});

// ---------------------------------------------------------------------------
// Invariant 2 — confidence vs validatedBy / trustScore (both directions)
// ---------------------------------------------------------------------------

describe('invariant 2: confidence must reconcile with validatedBy / trustScore', () => {
  it("RECONCILES 'high' confidence on a heuristic finding with trustScore 56 down to 'medium'", () => {
    // Same contradiction as #984, isolated onto an otherwise-valid CWE-94 finding.
    const overconfident = finding({
      id: 'security-eval-1',
      domain: 'security',
      severity: 'critical',
      cweId: 'CWE-94',
      confidence: 'high',
      trustScore: 56,
      validatedBy: 'heuristic',
      evidence: ['Line 7: const out = eval(userInput);'],
    });

    const { findings, report } = enforceFindingIntegrity([overconfident]);

    const f = findings[0]!;
    expect(f.confidence).toBe('medium');
    expect(f.severity).toBe('critical'); // detection is NOT weakened
    expect(report.confidenceReconciled).toBe(1);
    expect(report.confidenceClaimsExamined).toBe(1);

    const v = f.integrityViolations?.find((x) => x.invariant === 'confidence-reconciliation');
    expect(v?.action).toBe('confidence-reconciled');
    expect(v?.originalConfidence).toBe('high');
    expect(v?.reason).toContain("validatedBy 'heuristic'");
    expect(v?.reason).toContain('trustScore 56');
  });

  it("PASSES a mechanically-validated 'high' finding with a supporting trustScore UNTOUCHED", () => {
    const supported = finding({
      id: 'security-secret-1',
      domain: 'security',
      severity: 'critical',
      cweId: 'CWE-798',
      confidence: 'high',
      trustScore: 88,
      validatedBy: 'mechanical',
      evidence: ['Line 3: [secret detected — value redacted]'],
    });

    const { findings, report } = enforceFindingIntegrity([supported]);

    expect(findings).toEqual([supported]);
    expect(findings[0]!.confidence).toBe('high');
    expect(findings[0]!.integrityViolations).toBeUndefined();
    expect(report.confidenceClaimsExamined).toBe(1);
    expect(report.confidenceReconciled).toBe(0);
  });

  it('preserves the numeric confidence shape when reconciling', () => {
    const { findings } = enforceFindingIntegrity([
      finding({ confidence: 100, validatedBy: 'heuristic', trustScore: 30 }),
    ]);
    expect(findings[0]!.confidence).toBe(25); // trustScore 30 → 'low' band → numeric 25
  });

  it('leaves a finding with no declared confidence alone', () => {
    const noConf = finding({ validatedBy: 'heuristic', trustScore: 10 });
    const { findings, report } = enforceFindingIntegrity([noConf]);
    expect(findings).toEqual([noConf]);
    expect(report.confidenceClaimsExamined).toBe(0);
  });

  it('takes the stricter of the validation ceiling and the trust-score ceiling', () => {
    expect(confidenceCeiling(finding({ validatedBy: 'heuristic' }))).toBe('medium');
    expect(confidenceCeiling(finding({ validatedBy: 'graph' }))).toBe('high');
    expect(confidenceCeiling(finding({ validatedBy: 'graph', trustScore: 20 }))).toBe('low');
    expect(confidenceCeiling(finding({ validatedBy: 'mechanical', trustScore: 95 }))).toBe('high');
  });

  it('records BOTH invariants when a finding violates both (the #984 case)', () => {
    const { report } = enforceFindingIntegrity([FABRICATED_984_FINDING]);
    const kinds = report.violations.map((v) => v.invariant).sort();
    expect(kinds).toEqual(['confidence-reconciliation', 'evidence-class-consistency']);
    expect(report.altered).toBe(1); // one finding, counted once
  });

  it('capHeuristicSeverity is OFF by default and caps critical when enabled', () => {
    const heuristicCritical = finding({
      domain: 'security',
      severity: 'critical',
      cweId: 'CWE-94',
      evidence: ['Line 7: eval(userInput)'],
      validatedBy: 'heuristic',
    });

    expect(enforceFindingIntegrity([heuristicCritical]).findings[0]!.severity).toBe('critical');
    expect(
      enforceFindingIntegrity([heuristicCritical], { capHeuristicSeverity: true }).findings[0]!
        .severity
    ).toBe('important');
  });
});

// ---------------------------------------------------------------------------
// Denominator reporting
// ---------------------------------------------------------------------------

describe('finding-integrity denominators', () => {
  it('reports zero-examined as ABSTAINED, never as a pass', () => {
    const { report } = enforceFindingIntegrity([]);
    expect(report.examined).toBe(0);
    expect(report.abstained).toBe(true);
    expect(formatIntegritySummary(report)).toContain('ABSTAINED');
    expect(formatIntegritySummary(report)).toContain('nothing was verified');
  });

  it('reports per-invariant denominators alongside the alteration count', () => {
    const { report } = enforceFindingIntegrity([
      FABRICATED_984_FINDING,
      LEGITIMATE_SQL_FINDING,
      finding({ id: 'plain', evidence: ['Line 1: ok'] }),
    ]);

    expect(report.examined).toBe(3);
    expect(report.vulnerabilityClaimsExamined).toBe(2);
    expect(report.confidenceClaimsExamined).toBe(2);
    expect(report.altered).toBe(1);
    expect(report.abstained).toBe(false);

    const summary = formatIntegritySummary(report);
    expect(summary).toContain('examined 3 finding(s)');
    expect(summary).toContain('2 vulnerability-class');
    expect(summary).toContain('altered 1');
  });

  it('never mutates the input findings', () => {
    const input = structuredClone(FABRICATED_984_FINDING);
    enforceFindingIntegrity([input]);
    expect(input).toEqual(FABRICATED_984_FINDING);
  });

  it('mergeIntegrityReports sums denominators and clears abstained', () => {
    const a = enforceFindingIntegrity([FABRICATED_984_FINDING]).report;
    const b = enforceFindingIntegrity([]).report;
    const merged = mergeIntegrityReports(a, b, undefined);

    expect(merged.examined).toBe(1);
    expect(merged.altered).toBe(1);
    expect(merged.abstained).toBe(false);
    expect(merged.violations).toHaveLength(a.violations.length);
  });

  it('mergeIntegrityReports of nothing abstains', () => {
    expect(mergeIntegrityReports(undefined, undefined)).toEqual(emptyIntegrityReport());
    expect(emptyIntegrityReport().abstained).toBe(true);
  });
});

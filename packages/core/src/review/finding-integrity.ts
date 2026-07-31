import type {
  FindingIntegrityViolation,
  FindingSeverity,
  ReviewConfidence,
  ReviewFinding,
} from './types';
import { getTrustLevel } from './trust-score';

/**
 * Finding-integrity layer (issue #984).
 *
 * Two structural invariants enforced at the single point where findings are
 * aggregated for emission, rather than inside each agent. The motivating
 * failure: `harness review-ci`'s floor tier published one object whose metadata
 * (`CWE-89`, `domain: security`, `severity: critical`, `confidence: high`) came
 * from a SQL-injection finding while its evidence (`"File has 442 lines
 * (threshold: 300)"`) came from a file-length finding. It blocked a PR on a
 * fabricated critical, and `trustScore: 56` / `validatedBy: 'heuristic'` were
 * the only — buried — hints that it was spurious.
 *
 * Both invariants are deliberately CONSERVATIVE: they only fire on evidence
 * that positively fails a class's own declared requirement, and the default
 * action is a non-blocking downgrade with the mismatch recorded, never a silent
 * drop. A legitimate finding must survive this layer untouched.
 */

// ---------------------------------------------------------------------------
// Invariant 1 — evidence must be consistent with the claimed vulnerability class
// ---------------------------------------------------------------------------

/**
 * What a vulnerability class requires its evidence to reference.
 *
 * `requires` is a positive requirement: at least one evidence entry must match
 * it. The patterns are intentionally broad (a superset of how the floor's own
 * heuristics phrase evidence, plus the vocabulary an LLM tier would use) so the
 * check catches metadata/evidence mismatch, not stylistic variation.
 */
export interface VulnerabilityClassSpec {
  /** Human-readable class name used in the recorded reason. */
  label: string;
  /** Evidence must contain at least one entry matching this. */
  requires: RegExp;
  /** What the evidence is expected to show, quoted in the recorded reason. */
  expectation: string;
}

/**
 * SQL query shape. Requires a keyword *pair* (`SELECT … FROM`, `UPDATE … SET`)
 * or a query-API token — never a bare keyword. A bare-keyword requirement would
 * be satisfied by the very prose that caused #984: the cited line "never
 * **create** a ticket for a row lacking an externalId" contains `create`.
 */
const SQL_QUERY_SHAPE = new RegExp(
  [
    '\\bSELECT\\b[\\s\\S]{0,200}?\\bFROM\\b',
    '\\bINSERT\\b[\\s\\S]{0,80}?\\bINTO\\b',
    '\\bUPDATE\\b[\\s\\S]{0,120}?\\bSET\\b',
    '\\bDELETE\\b[\\s\\S]{0,80}?\\bFROM\\b',
    '\\bDROP\\s+(?:TABLE|DATABASE|SCHEMA|INDEX|VIEW)\\b',
    '\\bALTER\\s+TABLE\\b',
    '\\bCREATE\\s+(?:TABLE|DATABASE|SCHEMA|INDEX|VIEW|TEMP)\\b',
    '\\bTRUNCATE\\s+TABLE\\b',
    '\\bUNION\\s+(?:ALL\\s+)?SELECT\\b',
    // query APIs / ORM raw-query escape hatches
    '\\.(?:query|raw|queryRaw|executeRaw|execute)\\s*\\(',
    '\\b(?:knex|sequelize|prisma|typeorm|mysql|pg|sqlite3|cursor)\\b',
    '\\bcreateQueryBuilder\\b',
    '\\bsql`',
    '\\bSQL\\s+(?:query|statement|injection)\\b',
  ].join('|'),
  'i'
);

const COMMAND_SHAPE =
  /\b(?:exec|execSync|execFile|execFileSync|spawn|spawnSync|child_process|shell|sh\s+-c|bash\s+-c|os\.system|subprocess|popen|Runtime\.getRuntime|shell_exec)\b/i;

const CODE_EVAL_SHAPE =
  /\b(?:eval|new\s+Function|Function\s*\(|vm\.run|vm2|setTimeout\s*\(\s*['"`]|require\s*\(|import\s*\(|deserializ\w*|unserialize|pickle\.loads|yaml\.load|ObjectInputStream)\b/i;

const SECRET_SHAPE =
  /\b(?:api[_-]?key|apikey|secret|password|passwd|passphrase|token|credential\w*|private[_-]?key|bearer|redacted|hardcoded)\b/i;

/**
 * Assembled from fragments rather than written as one literal so the annotation
 * below can sit directly above the token that harness's own security scanner
 * flags. This file is a registry of detection vocabulary, so several of its
 * strings are, by construction, the strings other scanners look for.
 */
const XSS_SHAPE = new RegExp(
  [
    '\\b(?:innerHTML|outerHTML|insertAdjacentHTML|document\\.write|v-html',
    // harness-ignore SEC-XSS-002: definitional — this IS the XSS-sink detection vocabulary, not a React render path
    '|dangerouslySetInnerHTML',
    '|unescaped?|sanitiz\\w*|escapeHtml|<script|href\\s*=|markup)\\b',
  ].join(''),
  'i'
);

const PATH_TRAVERSAL_SHAPE =
  /(?:\.\.[\\/])|\b(?:path\.(?:join|resolve|normalize)|readFile\w*|writeFile\w*|createReadStream|createWriteStream|sendFile|basename|traversal|__dirname|filepath|filename)\b/i;

const WEAK_CRYPTO_SHAPE =
  /\b(?:md5|sha-?1|createHash|createCipher|createDecipher|DES|RC4|ECB|Math\.random|randomBytes|crypto|hash\w*|cipher\w*|iv\b)\b/i;

const AUTHZ_SHAPE =
  /\b(?:auth\w*|permission\w*|role\w*|acl|scope\w*|isAdmin|owner\w*|tenant\w*|req\.user|session|jwt|claims?|guard|middleware)\b/i;

const SSRF_SHAPE =
  /\b(?:fetch|axios|got|request|http\.get|https\.get|urlopen|url|uri|hostname|host|endpoint|localhost|127\.0\.0\.1|169\.254|metadata)\b/i;

const PROTOTYPE_POLLUTION_SHAPE = new RegExp(
  [
    // harness-ignore SEC-NODE-001: definitional — this IS the prototype-pollution detection vocabulary; no untrusted input is merged here
    '(?:__proto__|\\bprototype\\b|\\bconstructor\\b|Object\\.assign',
    '|\\bmerge\\b|deepMerge|hasOwnProperty|\\bsetIn\\b)',
  ].join(''),
  'i'
);

const TRANSPORT_SHAPE =
  /\b(?:http:\/\/|ws:\/\/|tls|ssl|https|encrypt\w*|cleartext|plaintext|cert\w*|rejectUnauthorized)\b/i;

/**
 * Vulnerability-class registry keyed by normalized CWE id.
 *
 * A class NOT in this registry has no positive requirement — only the universal
 * guards below apply. That asymmetry is the conservatism: an unrecognized CWE is
 * never punished for being unrecognized.
 */
export const VULNERABILITY_CLASS_SPECS: Readonly<Record<string, VulnerabilityClassSpec>> = {
  'CWE-22': {
    label: 'path traversal',
    requires: PATH_TRAVERSAL_SHAPE,
    expectation: 'a filesystem path or path-building call',
  },
  'CWE-78': {
    label: 'OS command injection',
    requires: COMMAND_SHAPE,
    expectation: 'a shell/process-execution call',
  },
  'CWE-79': {
    label: 'cross-site scripting',
    requires: XSS_SHAPE,
    expectation: 'an HTML sink or unescaped-output site',
  },
  'CWE-89': {
    label: 'SQL injection',
    requires: SQL_QUERY_SHAPE,
    expectation: 'a SQL query or query-API call',
  },
  'CWE-94': {
    label: 'code injection',
    requires: CODE_EVAL_SHAPE,
    expectation: 'a dynamic code-evaluation call',
  },
  'CWE-284': {
    label: 'improper access control',
    requires: AUTHZ_SHAPE,
    expectation: 'an authentication/authorization construct',
  },
  'CWE-327': {
    label: 'broken or risky crypto',
    requires: WEAK_CRYPTO_SHAPE,
    expectation: 'a cryptographic primitive or hash/cipher call',
  },
  'CWE-338': {
    label: 'weak PRNG',
    requires: WEAK_CRYPTO_SHAPE,
    expectation: 'a random-number generator call',
  },
  'CWE-319': {
    label: 'cleartext transmission',
    requires: TRANSPORT_SHAPE,
    expectation: 'a transport URL or TLS setting',
  },
  'CWE-502': {
    label: 'unsafe deserialization',
    requires: CODE_EVAL_SHAPE,
    expectation: 'a deserialization call',
  },
  'CWE-798': {
    label: 'hardcoded credentials',
    requires: SECRET_SHAPE,
    expectation: 'a credential-shaped identifier or a redaction marker',
  },
  'CWE-862': {
    label: 'missing authorization',
    requires: AUTHZ_SHAPE,
    expectation: 'an authentication/authorization construct',
  },
  'CWE-863': {
    label: 'incorrect authorization',
    requires: AUTHZ_SHAPE,
    expectation: 'an authentication/authorization construct',
  },
  'CWE-918': {
    label: 'server-side request forgery',
    requires: SSRF_SHAPE,
    expectation: 'an outbound-request call or a URL/host value',
  },
  'CWE-1321': {
    label: 'prototype pollution',
    requires: PROTOTYPE_POLLUTION_SHAPE,
    expectation: 'a prototype/merge construct',
  },
};

/**
 * OWASP-category fallback, consulted only when the finding has no `cweId` (or
 * its CWE is unregistered). Broader than the CWE specs by design — a category
 * spans several concrete classes.
 */
const OWASP_CATEGORY_SPECS: Readonly<Record<string, VulnerabilityClassSpec>> = {
  A03: {
    label: 'injection (OWASP A03)',
    requires: new RegExp(
      [SQL_QUERY_SHAPE.source, COMMAND_SHAPE.source, CODE_EVAL_SHAPE.source, XSS_SHAPE.source].join(
        '|'
      ),
      'i'
    ),
    expectation: 'an injection sink (query, shell, dynamic eval, or HTML)',
  },
  A01: {
    label: 'broken access control (OWASP A01)',
    requires: new RegExp([AUTHZ_SHAPE.source, PATH_TRAVERSAL_SHAPE.source].join('|'), 'i'),
    expectation: 'an access-control construct or a traversable path',
  },
  A02: {
    label: 'cryptographic failure (OWASP A02)',
    requires: new RegExp([WEAK_CRYPTO_SHAPE.source, TRANSPORT_SHAPE.source].join('|'), 'i'),
    expectation: 'a cryptographic primitive or transport setting',
  },
  A07: {
    label: 'identification/authentication failure (OWASP A07)',
    requires: new RegExp([AUTHZ_SHAPE.source, SECRET_SHAPE.source].join('|'), 'i'),
    expectation: 'an authentication construct or a credential-shaped identifier',
  },
  A10: {
    label: 'server-side request forgery (OWASP A10)',
    requires: SSRF_SHAPE,
    expectation: 'an outbound-request call or a URL/host value',
  },
};

/**
 * Evidence entries that are pure code-metric measurements. These are legitimate
 * evidence for a file-length or complexity finding and NEVER sufficient for a
 * vulnerability class — measuring a file cannot demonstrate an injection.
 */
const METRIC_EVIDENCE_PATTERNS: readonly RegExp[] = [
  /^\s*file\s+(?:has|length|size)\b/i,
  /^\s*(?:line|statement|branch|function)\s+count\b/i,
  /^\s*(?:cyclomatic\s+)?complexity\b/i,
  /^\s*(?:nesting\s+depth|function\s+length|parameter\s+count)\b/i,
  /^\s*\d+\s+lines?\b/i,
  /^\s*(?:coverage|churn|fan-?in|fan-?out|maintainability)\b/i,
  /\bthreshold:\s*\d+/i,
];

/** True when an evidence entry is nothing but a code metric. */
function isMetricEvidence(entry: string): boolean {
  return METRIC_EVIDENCE_PATTERNS.some((p) => p.test(entry));
}

/** Normalize `cwe-89`, `CWE89`, `CWE-89: SQL injection` → `CWE-89`. */
function normalizeCweId(cweId: string): string {
  const m = cweId.match(/cwe[-_\s]?(\d+)/i);
  return m ? `CWE-${m[1]}` : cweId.trim().toUpperCase();
}

/** Normalize `A03:2021 Injection` / `a03` → `A03`. */
function normalizeOwaspCategory(category: string): string {
  const m = category.match(/\bA(\d{1,2})\b/i);
  return m ? `A${m[1]!.padStart(2, '0')}` : category.trim().toUpperCase();
}

/**
 * True when a finding asserts a vulnerability class — the trigger condition for
 * invariant 1. Matches issue #984's definition: a CWE id, an OWASP category, or
 * the strongest signal the tool can emit (`domain: 'security'` + `critical`).
 */
export function claimsVulnerabilityClass(finding: ReviewFinding): boolean {
  return (
    finding.cweId != null ||
    finding.owaspCategory != null ||
    (finding.domain === 'security' && finding.severity === 'critical')
  );
}

/** Resolve the declared class spec for a finding, if any is registered. */
function resolveClassSpec(finding: ReviewFinding): VulnerabilityClassSpec | undefined {
  if (finding.cweId != null) {
    const spec = VULNERABILITY_CLASS_SPECS[normalizeCweId(finding.cweId)];
    if (spec) return spec;
  }
  if (finding.owaspCategory != null) {
    return OWASP_CATEGORY_SPECS[normalizeOwaspCategory(finding.owaspCategory)];
  }
  return undefined;
}

/**
 * Check invariant 1. Returns a failure reason, or `undefined` when the finding's
 * evidence is consistent with its claimed class (or no class is claimed).
 */
export function checkEvidenceClassConsistency(finding: ReviewFinding): string | undefined {
  if (!claimsVulnerabilityClass(finding)) return undefined;

  const claimed = finding.cweId ?? finding.owaspCategory ?? `${finding.domain}/${finding.severity}`;

  // Universal guard A — a vulnerability claim with no evidence is unfalsifiable.
  if (finding.evidence.length === 0) {
    return `claims ${claimed} but carries no evidence — a vulnerability claim with nothing to check cannot be adjudicated by a reviewer`;
  }

  // Universal guard B — the #984 signature: evidence is entirely code metrics.
  if (finding.evidence.every(isMetricEvidence)) {
    return `claims ${claimed} but every evidence entry is a code metric (${finding.evidence.length}/${finding.evidence.length}: e.g. ${JSON.stringify(finding.evidence[0])}) — measuring a file cannot demonstrate a vulnerability`;
  }

  // Class-specific guard — only for classes that declare a requirement.
  const spec = resolveClassSpec(finding);
  if (spec && !finding.evidence.some((e) => spec.requires.test(e))) {
    return `claims ${claimed} (${spec.label}) but no evidence entry references ${spec.expectation}`;
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Invariant 2 — confidence must reconcile with validatedBy / trustScore
// ---------------------------------------------------------------------------

/** Coarse confidence band, shared by the string and numeric confidence shapes. */
export type ConfidenceBand = 'low' | 'medium' | 'high';

const BAND_RANK: Record<ConfidenceBand, number> = { low: 1, medium: 2, high: 3 };

/**
 * Highest confidence band each validation method can support on its own.
 *
 * `heuristic` is capped at `medium`: a pattern match is by construction not a
 * confirmation, so a heuristic-only finding claiming `high` is asserting more
 * than its own provenance allows (#984: `confidence: 'high'` beside
 * `validatedBy: 'heuristic'`).
 */
export const CONFIDENCE_CEILING_BY_VALIDATION: Readonly<
  Record<ReviewFinding['validatedBy'], ConfidenceBand>
> = {
  mechanical: 'high',
  graph: 'high',
  heuristic: 'medium',
};

/** Map either confidence shape onto a band. */
export function confidenceBand(c: NonNullable<ReviewFinding['confidence']>): ConfidenceBand {
  if (typeof c === 'number') return c >= 75 ? 'high' : c >= 50 ? 'medium' : 'low';
  return c;
}

/** Numeric anchor for a band, used when the finding declared numeric confidence. */
const BAND_TO_NUMERIC: Record<ConfidenceBand, ReviewConfidence> = {
  low: 25,
  medium: 50,
  high: 75,
};

/**
 * The ceiling a finding's confidence may not exceed: the stricter of what its
 * validation method supports and what its trust score supports. `trustScore` is
 * only consulted when present (the LLM tier's findings arrive unscored).
 */
export function confidenceCeiling(finding: ReviewFinding): ConfidenceBand {
  const fromValidation = CONFIDENCE_CEILING_BY_VALIDATION[finding.validatedBy];
  if (finding.trustScore == null) return fromValidation;
  const fromTrust = getTrustLevel(finding.trustScore);
  return BAND_RANK[fromTrust] < BAND_RANK[fromValidation] ? fromTrust : fromValidation;
}

// ---------------------------------------------------------------------------
// Enforcement
// ---------------------------------------------------------------------------

/** What to do with a finding that fails invariant 1. */
export type EvidenceMismatchAction = 'downgrade' | 'drop';

/** Non-blocking severity a downgraded finding lands on. */
const NON_BLOCKING_SEVERITY: FindingSeverity = 'suggestion';

export interface EnforceFindingIntegrityOptions {
  /**
   * Action for an evidence/class mismatch. Default `'downgrade'` — the finding
   * survives at a non-blocking severity with the mismatch recorded, so a real
   * vulnerability described in unusual language is never silently deleted.
   * `'drop'` removes it entirely (quieter output, but unrecoverable).
   */
  onEvidenceMismatch?: EvidenceMismatchAction;
  /**
   * Also cap a heuristic-only finding's SEVERITY at `important` (never
   * `critical`) — issue #984's stronger suggestion. Default `false`, because the
   * entire floor-tier security surface is heuristic and enabling this by default
   * would stop the floor blocking on genuine hardcoded secrets and dynamic
   * code-evaluation calls.
   * Opt in when an LLM tier is guaranteed to run.
   */
  capHeuristicSeverity?: boolean;
}

/**
 * Denominator-bearing report from the integrity layer.
 *
 * `examined` is the denominator that matters: a layer which examined zero
 * findings has ABSTAINED, not passed, and `abstained` says so explicitly so no
 * consumer can read an empty run as verification.
 */
export interface FindingIntegrityReport {
  /** Findings the layer inspected. The denominator. */
  examined: number;
  /** Findings that claimed a vulnerability class (invariant 1's denominator). */
  vulnerabilityClaimsExamined: number;
  /** Findings carrying a confidence label (invariant 2's denominator). */
  confidenceClaimsExamined: number;
  /** Distinct findings the layer changed or removed. */
  altered: number;
  /** Findings removed outright. */
  dropped: number;
  /** Findings whose severity was lowered. */
  downgraded: number;
  /** Findings whose confidence label was lowered. */
  confidenceReconciled: number;
  /** True when `examined === 0` — the layer verified nothing. */
  abstained: boolean;
  /** Every recorded failure, in input order. */
  violations: FindingIntegrityViolation[];
}

/** An empty report. Distinguishable from a passing one by `abstained: true`. */
export function emptyIntegrityReport(): FindingIntegrityReport {
  return {
    examined: 0,
    vulnerabilityClaimsExamined: 0,
    confidenceClaimsExamined: 0,
    altered: 0,
    dropped: 0,
    downgraded: 0,
    confidenceReconciled: 0,
    abstained: true,
    violations: [],
  };
}

export interface EnforceFindingIntegrityResult {
  /** Findings cleared for emission (mismatches dropped or downgraded). */
  findings: ReviewFinding[];
  /** Denominators + the audit trail. */
  report: FindingIntegrityReport;
}

/** Rewrite a confidence value to `band`, preserving the declared shape. */
function toBand(
  declared: NonNullable<ReviewFinding['confidence']>,
  band: ConfidenceBand
): NonNullable<ReviewFinding['confidence']> {
  return typeof declared === 'number' ? BAND_TO_NUMERIC[band] : band;
}

/**
 * Downgrade a finding that failed invariant 1 to a non-blocking severity, with
 * its confidence pinned to `low` and the mismatch recorded on the finding.
 */
function downgradeForEvidenceMismatch(
  finding: ReviewFinding,
  reason: string,
  violations: FindingIntegrityViolation[]
): ReviewFinding {
  const violation: FindingIntegrityViolation = {
    findingId: finding.id,
    invariant: 'evidence-class-consistency',
    action: 'downgraded',
    reason,
    originalSeverity: finding.severity,
    ...(finding.confidence != null ? { originalConfidence: finding.confidence } : {}),
  };
  violations.push(violation);

  return {
    ...finding,
    severity: NON_BLOCKING_SEVERITY,
    ...(finding.confidence != null ? { confidence: toBand(finding.confidence, 'low') } : {}),
    integrityViolations: [...(finding.integrityViolations ?? []), violation],
  };
}

/** Apply invariant 2 to one finding. Never drops. */
function applyConfidenceInvariant(
  finding: ReviewFinding,
  capSeverity: boolean,
  violations: FindingIntegrityViolation[]
): ReviewFinding {
  const added: FindingIntegrityViolation[] = [];
  let next = finding;

  const declared = finding.confidence;
  if (declared != null) {
    const ceiling = confidenceCeiling(finding);
    if (BAND_RANK[confidenceBand(declared)] > BAND_RANK[ceiling]) {
      const trustNote = finding.trustScore != null ? ` and trustScore ${finding.trustScore}` : '';
      const violation: FindingIntegrityViolation = {
        findingId: finding.id,
        invariant: 'confidence-reconciliation',
        action: 'confidence-reconciled',
        reason: `confidence '${declared}' exceeds the '${ceiling}' ceiling implied by validatedBy '${finding.validatedBy}'${trustNote}`,
        originalConfidence: declared,
      };
      added.push(violation);
      next = { ...next, confidence: toBand(declared, ceiling) };
    }
  }

  if (capSeverity && finding.validatedBy === 'heuristic' && next.severity === 'critical') {
    const violation: FindingIntegrityViolation = {
      findingId: finding.id,
      invariant: 'confidence-reconciliation',
      action: 'downgraded',
      reason: `severity 'critical' is not available to a heuristic-only finding without confirmation from the LLM tier`,
      originalSeverity: finding.severity,
    };
    added.push(violation);
    next = { ...next, severity: 'important' };
  }

  if (added.length === 0) return finding;
  violations.push(...added);
  return { ...next, integrityViolations: [...(finding.integrityViolations ?? []), ...added] };
}

/**
 * Enforce both emission invariants over an aggregated finding set.
 *
 * Pure: returns new finding objects and never mutates the input (the #984 bug
 * was itself consistent with shared-object mutation, so this layer must not add
 * another aliasing hazard).
 */
export function enforceFindingIntegrity(
  findings: ReviewFinding[],
  options?: EnforceFindingIntegrityOptions
): EnforceFindingIntegrityResult {
  const action = options?.onEvidenceMismatch ?? 'downgrade';
  const capSeverity = options?.capHeuristicSeverity ?? false;
  const violations: FindingIntegrityViolation[] = [];
  const kept: ReviewFinding[] = [];

  let vulnerabilityClaimsExamined = 0;
  let confidenceClaimsExamined = 0;
  let altered = 0;
  let dropped = 0;
  let downgraded = 0;
  let confidenceReconciled = 0;

  for (const finding of findings) {
    if (claimsVulnerabilityClass(finding)) vulnerabilityClaimsExamined++;
    if (finding.confidence != null) confidenceClaimsExamined++;

    const evidenceReason = checkEvidenceClassConsistency(finding);

    // Drop mode short-circuits: a dropped finding gets exactly one recorded
    // reason (the drop), never a confidence note about an object that is gone.
    if (evidenceReason !== undefined && action === 'drop') {
      violations.push({
        findingId: finding.id,
        invariant: 'evidence-class-consistency',
        action: 'dropped',
        reason: evidenceReason,
        originalSeverity: finding.severity,
      });
      dropped++;
      altered++;
      continue;
    }

    const before = violations.length;
    // Confidence is reconciled against the finding as the agent emitted it, so a
    // finding failing BOTH invariants records both — the #984 finding was wrong
    // about its evidence AND overstated its confidence, and the report says so.
    let final = applyConfidenceInvariant(finding, capSeverity, violations);
    if (evidenceReason !== undefined) {
      final = downgradeForEvidenceMismatch(final, evidenceReason, violations);
    }
    const added = violations.slice(before);
    if (added.length > 0) {
      altered++;
      if (added.some((v) => v.action === 'downgraded')) downgraded++;
      if (added.some((v) => v.action === 'confidence-reconciled')) confidenceReconciled++;
    }
    kept.push(final);
  }

  return {
    findings: kept,
    report: {
      examined: findings.length,
      vulnerabilityClaimsExamined,
      confidenceClaimsExamined,
      altered,
      dropped,
      downgraded,
      confidenceReconciled,
      abstained: findings.length === 0,
      violations,
    },
  };
}

/**
 * Combine reports from several enforcement passes (e.g. the CI orchestrator's
 * floor pass plus its LLM-tier pass) into one denominator. `abstained` stays
 * true only when every pass examined nothing.
 */
export function mergeIntegrityReports(
  ...reports: Array<FindingIntegrityReport | undefined>
): FindingIntegrityReport {
  const present = reports.filter((r): r is FindingIntegrityReport => r != null);
  if (present.length === 0) return emptyIntegrityReport();

  const sum = (pick: (r: FindingIntegrityReport) => number): number =>
    present.reduce((acc, r) => acc + pick(r), 0);

  const examined = sum((r) => r.examined);
  return {
    examined,
    vulnerabilityClaimsExamined: sum((r) => r.vulnerabilityClaimsExamined),
    confidenceClaimsExamined: sum((r) => r.confidenceClaimsExamined),
    altered: sum((r) => r.altered),
    dropped: sum((r) => r.dropped),
    downgraded: sum((r) => r.downgraded),
    confidenceReconciled: sum((r) => r.confidenceReconciled),
    abstained: examined === 0,
    violations: present.flatMap((r) => r.violations),
  };
}

/** One-line denominator summary. Never reads as success when nothing was checked. */
export function formatIntegritySummary(report: FindingIntegrityReport): string {
  if (report.abstained) {
    return 'finding integrity: ABSTAINED — 0 findings examined (nothing was verified)';
  }
  return (
    `finding integrity: examined ${report.examined} finding(s) ` +
    `(${report.vulnerabilityClaimsExamined} vulnerability-class, ${report.confidenceClaimsExamined} with confidence); ` +
    `altered ${report.altered} (${report.dropped} dropped, ${report.downgraded} downgraded, ` +
    `${report.confidenceReconciled} confidence-reconciled)`
  );
}

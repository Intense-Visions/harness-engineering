import type { ContextBundle, ReviewFinding, ReviewAgentDescriptor } from '../types';
import { makeFindingId } from '../constants';

export const SECURITY_DESCRIPTOR: ReviewAgentDescriptor = {
  domain: 'security',
  tier: 'strong',
  displayName: 'Security',
  focusAreas: [
    'Input validation — user input flowing to dangerous sinks (SQL, shell, HTML)',
    'Authorization — missing auth checks on new/modified endpoints',
    'Data exposure — sensitive data in logs, error messages, API responses',
    'Authentication bypass — paths introduced by the change',
    'Insecure defaults — new configuration options with unsafe defaults',
    'Node.js specific — prototype pollution, ReDoS, path traversal',
  ],
};

/** Patterns that indicate dangerous eval/Function usage. */
const EVAL_PATTERN = /\beval\s*\(|new\s+Function\s*\(/;

/** Patterns that indicate hardcoded secrets. */
const SECRET_PATTERNS = [
  /(?:api[_-]?key|secret|password|token|private[_-]?key)\s*=\s*["'][^"']{8,}/i,
  /["'](?:sk|pk|api|key|secret|token|password)[-_][a-zA-Z0-9]{10,}["']/i,
];

/**
 * Pattern for SQL string concatenation.
 *
 * The SQL keyword must sit **inside a quoted string literal or template literal**
 * that is actually being concatenated or interpolated — not merely appear as a
 * bare token somewhere on the line. A bare-keyword pattern (the original
 * `KEYWORD … + word`) matched arithmetic-style prose such as the markdown heading
 * `UPDATE (medium + large tiers)`, producing a `critical` CWE-89 false positive
 * that hard-blocked unrelated PRs (issue #657).
 *
 * The string-boundary fix for #657 was not enough on its own, because the match
 * is **case-insensitive**: an ordinary English sentence inside a concatenated
 * string literal still fired whenever it used a SQL keyword as a normal word.
 * A `commander` help string —
 * `'never create a ticket for a row lacking an externalId … ' +` — was reported
 * as a critical CWE-89 SQL injection purely because "create" whole-word-matches
 * `CREATE` and the literal is followed by `+`. (Whole-word matching already
 * spared inflected forms like "created"/"updated"; the bare stem was the hole.)
 *
 * So a keyword alone is not evidence of SQL. Real queries pair a statement
 * keyword with a **structural companion** token (`SELECT … FROM`,
 * `INSERT INTO`, `UPDATE … SET`, `DELETE FROM`, `CREATE/ALTER/DROP TABLE`,
 * `… JOIN`, `… VALUES`), whereas prose essentially never does. Requiring both
 * inside the same literal keeps every genuine injection shape firing and drops
 * the prose class of false positives.
 *
 * Alternatives:
 *  1. A quoted string literal containing a SQL keyword AND a companion token,
 *     immediately followed by `+` concatenation
 *     (`"SELECT … WHERE id = " + userId`, `'DELETE FROM t WHERE id = ' + id`).
 *  2. A template literal containing an `${…}` interpolation, a SQL keyword, and
 *     a companion token, in any order.
 *
 * Known limitation (pre-dates the companion-token change): the `[^"']` class
 * cannot span a nested quote, so a query that embeds the opposite quote
 * character — `"INSERT INTO t VALUES ('" + name + "')"` — is not matched. This
 * heuristic is a floor, not a proof of absence; the LLM review tier is what
 * catches the shapes it misses.
 */
const SQL_KEYWORDS = 'SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER';
const SQL_TEMPLATE_KEYWORDS = 'SELECT|INSERT|UPDATE|DELETE|WHERE';
/**
 * Structural tokens that co-occur with a statement keyword in real SQL but not
 * in prose. Requiring one alongside the keyword is what separates a query from
 * an English sentence that happens to say "create" or "update".
 */
const SQL_COMPANIONS = 'FROM|INTO|WHERE|VALUES|SET|TABLE|JOIN';
const SQL_CONCAT_PATTERN = new RegExp(
  // 1. quoted string literal holding a SQL keyword AND a companion, then a `+`
  `["'](?=[^"']*\\b(?:${SQL_KEYWORDS})\\b)(?=[^"']*\\b(?:${SQL_COMPANIONS})\\b)[^"']*["']\\s*\\+` +
    '|' +
    // 2. template literal holding an interpolation, a SQL keyword, AND a companion
    `\`(?=[^\`]*\\$\\{)(?=[^\`]*\\b(?:${SQL_TEMPLATE_KEYWORDS})\\b)` +
    `(?=[^\`]*\\b(?:${SQL_COMPANIONS})\\b)[^\`]*\``,
  'i'
);

/** Pattern for dangerous shell execution with interpolation. */
const SHELL_EXEC_PATTERN = /(?:exec|execSync|spawn|spawnSync)\s*\(\s*`[^`]*\$\{/;

/**
 * Extensions the source-pattern detectors (SQL/command/eval injection) apply to.
 * These match code constructs, so scanning docs/config produces false positives
 * — e.g. a Markdown table with the word "updated" reading as a SQL query.
 */
const CODE_FILE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts'];

/**
 * Test files, which the source-pattern detectors deliberately skip.
 *
 * Same reasoning as the docs/config exclusion above, one step further: a test
 * that proves a detector FIRES must contain the vulnerable shape as **data**.
 * This file's own suite necessarily holds `"SELECT * FROM users WHERE id = " +
 * userId` and `const API_KEY = "sk-1234…"` as fixtures — scanning them reports
 * `critical` findings for strings that are the test's whole point, and any PR
 * touching a security test self-flags.
 *
 * The trade-off is explicit and bounded: test code is not part of the shipped
 * attack surface (it is not published, not deployed, and takes no untrusted
 * input), so a concatenated query or a fake key inside a `*.test.ts` fixture is
 * not a vulnerability. Real sinks live in `src/`, which is still scanned. This
 * narrows PRECISION-losing noise, not coverage of production code.
 */
const TEST_FILE_MARKERS = ['.test.', '.spec.', '/__tests__/', '/__fixtures__/'];

/** True when `path` is test code, whose fixtures hold vulnerable shapes as data. */
function isTestFile(path: string): boolean {
  const normalized = path.replace(/\\/g, '/');
  return TEST_FILE_MARKERS.some((marker) => normalized.includes(marker));
}

/** True when `path` is a code file the source-pattern heuristics should scan. */
function isCodeFile(path: string): boolean {
  if (!CODE_FILE_EXTENSIONS.some((ext) => path.endsWith(ext))) return false;
  return !isTestFile(path);
}

/**
 * True when `line` is a comment rather than executable code.
 *
 * A SQL string inside a `//` line comment or a `*` JSDoc body is documentation —
 * it cannot reach a database. The rule's own JSDoc, which documents the genuine
 * injection shape it detects (`"SELECT … WHERE id = " + userId`), was itself
 * reported as a `critical` CWE-89 finding. Skipping comment lines costs no
 * coverage of executable code.
 *
 * Line-oriented like the detectors it serves: it recognizes `//`, `/*`, `*` and
 * `*\/` openers, so a SQL literal on a continuation line of a block comment that
 * does not start with `*` is still scanned. That is the conservative direction —
 * it can only over-scan, never under-scan.
 */
function isCommentLine(line: string): boolean {
  return /^\s*(?:\/\/|\/\*|\*\/|\*)/.test(line);
}

function makeEvalFinding(file: string, lineNum: number, line: string): ReviewFinding {
  return {
    id: makeFindingId('security', file, lineNum, 'eval usage CWE-94'),
    file,
    lineRange: [lineNum, lineNum],
    domain: 'security',
    severity: 'critical',
    title: `Dangerous ${'eval'}() or new ${'Function'}() usage`,
    rationale: `${'eval'}() and new ${'Function'}() execute arbitrary code. If user input reaches these calls, it enables Remote Code Execution (CWE-94).`,
    suggestion:
      'Replace eval/Function with a safe alternative (JSON.parse for data, a sandboxed evaluator for expressions).',
    evidence: [`Line ${lineNum}: ${line.trim()}`],
    validatedBy: 'heuristic',
    cweId: 'CWE-94',
    owaspCategory: 'A03:2021 Injection',
    confidence: 'high',
    remediation:
      'Replace eval/Function with a safe alternative (JSON.parse for data, a sandboxed evaluator for expressions).',
    references: [
      'https://cwe.mitre.org/data/definitions/94.html',
      'https://owasp.org/Top10/A03_2021-Injection/',
    ],
  };
}

function makeSecretFinding(file: string, lineNum: number): ReviewFinding {
  return {
    id: makeFindingId('security', file, lineNum, 'hardcoded secret CWE-798'),
    file,
    lineRange: [lineNum, lineNum],
    domain: 'security',
    severity: 'critical',
    title: 'Hardcoded secret or API key detected',
    rationale:
      'Hardcoded secrets in source code can be extracted from version history even after removal. Use environment variables or a secrets manager (CWE-798).',
    suggestion: 'Move the secret to an environment variable and access it via process.env.',
    evidence: [`Line ${lineNum}: [secret detected — value redacted]`],
    validatedBy: 'heuristic',
    cweId: 'CWE-798',
    owaspCategory: 'A07:2021 Identification and Authentication Failures',
    confidence: 'high',
    remediation: 'Move the secret to an environment variable and access it via process.env.',
    references: [
      'https://cwe.mitre.org/data/definitions/798.html',
      'https://owasp.org/Top10/A07_2021-Identification_and_Authentication_Failures/',
    ],
  };
}

function makeSqlFinding(file: string, lineNum: number, line: string): ReviewFinding {
  return {
    id: makeFindingId('security', file, lineNum, 'SQL injection CWE-89'),
    file,
    lineRange: [lineNum, lineNum],
    domain: 'security',
    severity: 'critical',
    title: 'Potential SQL injection via string concatenation',
    rationale:
      'Building SQL queries with string concatenation or template literals allows attackers to inject malicious SQL (CWE-89).',
    suggestion:
      'Use parameterized queries or a query builder (e.g., Knex, Prisma) instead of string concatenation.',
    evidence: [`Line ${lineNum}: ${line.trim()}`],
    validatedBy: 'heuristic',
    cweId: 'CWE-89',
    owaspCategory: 'A03:2021 Injection',
    confidence: 'high',
    remediation:
      'Use parameterized queries or a query builder (e.g., Knex, Prisma) instead of string concatenation.',
    references: [
      'https://cwe.mitre.org/data/definitions/89.html',
      'https://owasp.org/Top10/A03_2021-Injection/',
    ],
  };
}

function makeCommandFinding(file: string, lineNum: number, line: string): ReviewFinding {
  return {
    id: makeFindingId('security', file, lineNum, 'command injection CWE-78'),
    file,
    lineRange: [lineNum, lineNum],
    domain: 'security',
    severity: 'critical',
    title: 'Potential command injection via shell exec with interpolation',
    rationale:
      'Using exec/spawn with template literal interpolation allows attackers to inject shell commands (CWE-78).',
    suggestion:
      'Use execFile or spawn with an arguments array instead of shell string interpolation.',
    evidence: [`Line ${lineNum}: ${line.trim()}`],
    validatedBy: 'heuristic',
    cweId: 'CWE-78',
    owaspCategory: 'A03:2021 Injection',
    confidence: 'high',
    remediation:
      'Use execFile or spawn with an arguments array instead of shell string interpolation.',
    references: [
      'https://cwe.mitre.org/data/definitions/78.html',
      'https://owasp.org/Top10/A03_2021-Injection/',
    ],
  };
}

function detectEvalUsage(bundle: ContextBundle): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  for (const cf of bundle.changedFiles) {
    if (!isCodeFile(cf.path)) continue;
    const lines = cf.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (isCommentLine(line)) continue;
      if (!EVAL_PATTERN.test(line)) continue;
      findings.push(makeEvalFinding(cf.path, i + 1, line));
    }
  }
  return findings;
}

/**
 * Secret detection deliberately keeps a WIDER file scope than the three
 * source-pattern detectors: it does not gate on `isCodeFile`. A hardcoded key in
 * a `.env.example`, a shell script or any other non-`.ts` file is a genuine leak,
 * so restricting this detector to `.ts`/`.js` would lose real coverage rather
 * than noise. The asymmetry is the point — `eval(`, backtick-`exec(` and SQL
 * concatenation are code constructs; a leaked credential is not.
 *
 * Scope caveat, measured rather than assumed: `SECRET_PATTERNS` key off an
 * assignment shape (`<name> = "<value>"`), so a dotenv/shell line IS matched
 * while a YAML mapping (`apiKey: "..."`) is NOT. The wider file scope is
 * therefore real but narrower than "all config files" — do not read this comment
 * as a claim that YAML secrets are covered. Tests pin both directions.
 *
 * What it does share with them is the two precision guards: test fixtures hold
 * fake keys as data, and a documented example key in a JSDoc body is not a
 * secret. Both are skipped.
 */
function detectHardcodedSecrets(bundle: ContextBundle): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  for (const cf of bundle.changedFiles) {
    if (isTestFile(cf.path)) continue;
    const lines = cf.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      // `isCommentLine` catches whole-line and JSDoc-body comments; the
      // `codePart` slice additionally strips a trailing `//` comment from an
      // otherwise-executable line.
      if (isCommentLine(line)) continue;
      const codePart = line.includes('//') ? line.slice(0, line.indexOf('//')) : line;
      const matched = SECRET_PATTERNS.some((p) => p.test(codePart));
      if (!matched) continue;
      findings.push(makeSecretFinding(cf.path, i + 1));
    }
  }
  return findings;
}

function detectSqlInjection(bundle: ContextBundle): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  for (const cf of bundle.changedFiles) {
    if (!isCodeFile(cf.path)) continue;
    const lines = cf.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (isCommentLine(line)) continue;
      if (!SQL_CONCAT_PATTERN.test(line)) continue;
      findings.push(makeSqlFinding(cf.path, i + 1, line));
    }
  }
  return findings;
}

function detectCommandInjection(bundle: ContextBundle): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  for (const cf of bundle.changedFiles) {
    if (!isCodeFile(cf.path)) continue;
    const lines = cf.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (isCommentLine(line)) continue;
      if (!SHELL_EXEC_PATTERN.test(line)) continue;
      findings.push(makeCommandFinding(cf.path, i + 1, line));
    }
  }
  return findings;
}

/**
 * Run the security review agent.
 *
 * Analyzes the context bundle for security vulnerabilities using pattern-based
 * heuristics. Produces ReviewFinding[] with domain 'security'.
 */
export function runSecurityAgent(bundle: ContextBundle): ReviewFinding[] {
  const findings: ReviewFinding[] = [];

  findings.push(...detectEvalUsage(bundle));
  findings.push(...detectHardcodedSecrets(bundle));
  findings.push(...detectSqlInjection(bundle));
  findings.push(...detectCommandInjection(bundle));

  return findings;
}

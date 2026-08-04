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
 * So a keyword alone is not evidence of SQL. Real queries carry an **ordered
 * statement shape** (`SELECT … FROM`, `INSERT INTO`, `UPDATE … SET`,
 * `DELETE FROM`, `CREATE/ALTER/DROP TABLE`, `UNION SELECT`), whereas prose
 * essentially never does. The shape vocabulary deliberately mirrors
 * `SQL_QUERY_SHAPE` in `finding-integrity.ts` so that every finding this
 * detector emits carries evidence the integrity invariant accepts — an
 * unordered keyword-pair match here would produce findings (e.g. bare
 * `SELECT … WHERE` with no `FROM`) that Phase 5.75 immediately downgrades.
 *
 * Alternatives:
 *  1. A quoted string literal containing an ordered statement shape,
 *     immediately followed by `+` concatenation
 *     (`"SELECT … FROM t WHERE id = " + userId`, `'DELETE FROM t WHERE id = ' + id`).
 *  2. A template literal containing an `${…}` interpolation and an ordered
 *     statement shape. No closing backtick is required, so the opening line of
 *     a multi-line template query still fires.
 *
 * Known limitations (documented, pinned by must-miss tests, and caught by the
 * LLM review tier above this floor — a heuristic floor is not a proof of absence):
 *  - Nested quotes: the `[^"']` class cannot span the opposite quote character,
 *    so `"INSERT INTO t VALUES ('" + name + "')"` is not matched (pre-existing).
 *  - Split literals: a query whose shape spans multiple concatenated literals
 *    (`"SELECT " + cols + " FROM users"`) or multiple lines does not fire.
 *    Loosening the shape to line level would resurrect the prose class this
 *    change exists to kill (concatenated CLI help strings).
 *  - Query fragments: a lone clause in a template (`` `WHERE id = ${id}` ``)
 *    no longer fires; the integrity invariant downgraded those anyway unless a
 *    query API appeared on the same line.
 */
const sqlStatementShapes = (gap: string): string =>
  [
    `\\bSELECT\\b${gap}\\bFROM\\b`,
    `\\bINSERT\\s+INTO\\b`,
    `\\bUPDATE\\b${gap}\\bSET\\b`,
    `\\bDELETE\\s+FROM\\b`,
    `\\bDROP\\s+(?:TABLE|DATABASE|SCHEMA|INDEX|VIEW)\\b`,
    `\\bALTER\\s+TABLE\\b`,
    `\\bCREATE\\s+(?:TABLE|DATABASE|SCHEMA|INDEX|VIEW|TEMP)\\b`,
    `\\bUNION\\s+(?:ALL\\s+)?SELECT\\b`,
  ].join('|');
const SQL_CONCAT_PATTERN = new RegExp(
  // 1. quoted string literal holding an ordered statement shape, then a `+`
  `["'][^"']*(?:${sqlStatementShapes('[^"\']*?')})[^"']*["']\\s*\\+` +
    '|' +
    // 2. template literal holding an interpolation and an ordered statement
    //    shape (closing backtick optional: multi-line queries open here)
    `\`(?=[^\`]*\\$\\{)[^\`]*(?:${sqlStatementShapes('[^`]*?')})`,
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
 * This file's own suite necessarily holds concatenated `SELECT … FROM` query
 * strings and `sk-…`-style fixture keys — scanning them reports `critical`
 * findings for strings that are the test's whole point, and any PR touching a
 * security test self-flags.
 *
 * The trade-off is explicit and bounded: test code is not part of the shipped
 * attack surface (it is not published, not deployed, and takes no untrusted
 * input), so a concatenated query or a fake key inside a `*.test.ts` fixture is
 * not a vulnerability. Real sinks live in `src/`, which is still scanned. This
 * narrows PRECISION-losing noise, not coverage of production code.
 */
const TEST_FILE_MARKERS = ['.test.', '.spec.', '/__tests__/', '/__fixtures__/'];

/**
 * True when `path` is test code, whose fixtures hold vulnerable shapes as data.
 *
 * The markers are substrings, so this is only meaningful for paths that already
 * passed `hasCodeExtension` — a bare substring check would also swallow
 * `.env.test.local` or `config.test.json`, which are live config files whose
 * secrets are exactly what the secrets detector exists to catch.
 */
function isTestFile(path: string): boolean {
  const normalized = path.replace(/\\/g, '/');
  return TEST_FILE_MARKERS.some((marker) => normalized.includes(marker));
}

/** True when `path` has a JS/TS source extension. */
function hasCodeExtension(path: string): boolean {
  return CODE_FILE_EXTENSIONS.some((ext) => path.endsWith(ext));
}

/**
 * True when `path` is non-test source code the source-pattern heuristics scan.
 *
 * Named for what it means, not what it checks: the sibling `bug-agent.ts` has
 * an `isCodeFile` helper with extension-only semantics, and reusing that name
 * here (with a test-file exclusion baked in) invited silent divergence when
 * detector patterns get copied between the agent files.
 */
function isScannableSourceFile(path: string): boolean {
  return hasCodeExtension(path) && !isTestFile(path);
}

/**
 * True when `line` is comment-only — nothing executable can be on it.
 *
 * A SQL string inside a `//` line comment or a `*` JSDoc body is documentation —
 * it cannot reach a database. The rule's own JSDoc, which documents the genuine
 * injection shape it detects (`"SELECT … FROM t WHERE id = " + userId`), was
 * itself reported as a `critical` CWE-89 finding.
 *
 * A comment PREFIX is not enough: an eval call behind a `/**\/` or `*\/`
 * prefix (the line closing a block comment), and generator members
 * (`*run() { … }`), all begin with comment-ish tokens yet execute. So a line
 * counts as a comment only when
 * (a) it opens with `//`, or (b) it opens with `/*`, `*\/`, or a JSDoc-body `*`
 * followed by whitespace/EOL, AND nothing but whitespace follows the block
 * close (if any) on the same line.
 *
 * Residual over-skip, deliberately accepted: a rare expression-continuation
 * line shaped like `* factor;` reads as a JSDoc body and is skipped. That can
 * in principle under-scan, so the guard is a strong floor, not a guarantee —
 * the LLM tier scans whole files, comments included.
 */
function isCommentLine(line: string): boolean {
  const t = line.trimStart();
  if (t.startsWith('//')) return true;
  const opensComment = t.startsWith('/*') || t.startsWith('*/') || /^\*(?:\s|$)/.test(t);
  if (!opensComment) return false;
  const close = t.indexOf('*/', t.startsWith('/*') ? 2 : 0);
  if (close === -1) return true; // the whole line stays inside the comment
  return t.slice(close + 2).trim() === ''; // code after the close ⇒ executable
}

/**
 * Strip a trailing `//` line comment so its text is not scanned as code.
 *
 * The naive `indexOf('//')` truncated at the `//` inside `https://`-style URLs,
 * silently hiding anything after a URL on the same line from the secrets
 * detector (`const url = "https://…"; const password = "…"` never fired).
 * A `//` preceded by `:` is a protocol separator, not a comment opener.
 */
function stripTrailingLineComment(line: string): string {
  const m = /(?<!:)\/\//.exec(line);
  return m ? line.slice(0, m.index) : line;
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
    if (!isScannableSourceFile(cf.path)) continue;
    const lines = cf.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (isCommentLine(line)) continue;
      if (!EVAL_PATTERN.test(stripTrailingLineComment(line))) continue;
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
 * than noise. The asymmetry is the point — eval, backtick-exec and SQL
 * concatenation are code constructs; a leaked credential is not.
 *
 * Scope caveat, measured rather than assumed: `SECRET_PATTERNS` key off an
 * assignment shape (`<name> = "<value>"`), so a dotenv/shell line IS matched
 * while a YAML mapping (`apiKey: "..."`) is NOT. The wider file scope is
 * therefore real but narrower than "all config files" — do not read this comment
 * as a claim that YAML secrets are covered. Tests pin both directions.
 *
 * What it does share with them is the two precision guards — test fixtures hold
 * fake keys as data, and a documented example key in a JSDoc body is not a
 * secret — but ONLY for files with a code extension. `.test.`/`.spec.` are
 * code-naming conventions and `//`/`*` are JS comment syntax; applied to the
 * detector's wider file scope they would skip `.env.test.local` (live staging
 * creds by convention) and a key pasted into a Markdown `*` bullet.
 *
 * Residual, deliberately accepted: a REAL credential pasted into a `*.test.ts`
 * is skipped along with the fixtures. The git-history exposure is identical to
 * one in `src/`, but there is no mechanical way to tell it from the fake keys
 * that security tests must contain — that judgment belongs to the LLM tier.
 */
function detectHardcodedSecrets(bundle: ContextBundle): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  for (const cf of bundle.changedFiles) {
    const codeFile = hasCodeExtension(cf.path);
    if (codeFile && isTestFile(cf.path)) continue;
    const lines = cf.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (codeFile && isCommentLine(line)) continue;
      const codePart = codeFile ? stripTrailingLineComment(line) : line;
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
    if (!isScannableSourceFile(cf.path)) continue;
    const lines = cf.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (isCommentLine(line)) continue;
      if (!SQL_CONCAT_PATTERN.test(stripTrailingLineComment(line))) continue;
      findings.push(makeSqlFinding(cf.path, i + 1, line));
    }
  }
  return findings;
}

function detectCommandInjection(bundle: ContextBundle): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  for (const cf of bundle.changedFiles) {
    if (!isScannableSourceFile(cf.path)) continue;
    const lines = cf.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (isCommentLine(line)) continue;
      if (!SHELL_EXEC_PATTERN.test(stripTrailingLineComment(line))) continue;
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

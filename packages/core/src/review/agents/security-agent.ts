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

/** Pattern for SQL string concatenation. */
const SQL_CONCAT_PATTERN =
  /(?:SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER)\s+.*?\+\s*\w+|`[^`]*\$\{[^}]*\}[^`]*(?:SELECT|INSERT|UPDATE|DELETE|WHERE)/i;

/** Pattern for dangerous shell execution with interpolation. */
const SHELL_EXEC_PATTERN = /(?:exec|execSync|spawn|spawnSync)\s*\(\s*`[^`]*\$\{/;

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
    const lines = cf.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (!EVAL_PATTERN.test(line)) continue;
      findings.push(makeEvalFinding(cf.path, i + 1, line));
    }
  }
  return findings;
}

function detectHardcodedSecrets(bundle: ContextBundle): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  for (const cf of bundle.changedFiles) {
    const lines = cf.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
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
    const lines = cf.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (!SQL_CONCAT_PATTERN.test(line)) continue;
      findings.push(makeSqlFinding(cf.path, i + 1, line));
    }
  }
  return findings;
}

function detectCommandInjection(bundle: ContextBundle): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  for (const cf of bundle.changedFiles) {
    const lines = cf.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
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

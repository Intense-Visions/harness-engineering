import type { ContextBundle, ReviewFinding, ReviewAgentDescriptor } from '../types';

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

function makeFindingId(file: string, line: number, title: string): string {
  const hash = title.slice(0, 20).replace(/[^a-zA-Z0-9]/g, '');
  return `security-${file.replace(/[^a-zA-Z0-9]/g, '-')}-${line}-${hash}`;
}

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

function detectEvalUsage(bundle: ContextBundle): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  for (const cf of bundle.changedFiles) {
    const lines = cf.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (EVAL_PATTERN.test(line)) {
        findings.push({
          id: makeFindingId(cf.path, i + 1, 'eval usage CWE-94'),
          file: cf.path,
          lineRange: [i + 1, i + 1],
          domain: 'security',
          severity: 'critical',
          title: 'Dangerous eval() or new Function() usage',
          rationale:
            'eval() and new Function() execute arbitrary code. If user input reaches these calls, it enables Remote Code Execution (CWE-94).',
          suggestion:
            'Replace eval/Function with a safe alternative (JSON.parse for data, a sandboxed evaluator for expressions).',
          evidence: [`Line ${i + 1}: ${line.trim()}`],
          validatedBy: 'heuristic',
        });
      }
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
      if (line.includes('//') && line.indexOf('//') < line.indexOf('=')) continue;
      for (const pattern of SECRET_PATTERNS) {
        if (pattern.test(line)) {
          findings.push({
            id: makeFindingId(cf.path, i + 1, 'hardcoded secret CWE-798'),
            file: cf.path,
            lineRange: [i + 1, i + 1],
            domain: 'security',
            severity: 'critical',
            title: 'Hardcoded secret or API key detected',
            rationale:
              'Hardcoded secrets in source code can be extracted from version history even after removal. Use environment variables or a secrets manager (CWE-798).',
            suggestion: 'Move the secret to an environment variable and access it via process.env.',
            evidence: [`Line ${i + 1}: ${line.trim().slice(0, 80)}...`],
            validatedBy: 'heuristic',
          });
          break; // One finding per line
        }
      }
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
      if (SQL_CONCAT_PATTERN.test(line)) {
        findings.push({
          id: makeFindingId(cf.path, i + 1, 'SQL injection CWE-89'),
          file: cf.path,
          lineRange: [i + 1, i + 1],
          domain: 'security',
          severity: 'critical',
          title: 'Potential SQL injection via string concatenation',
          rationale:
            'Building SQL queries with string concatenation or template literals allows attackers to inject malicious SQL (CWE-89).',
          suggestion:
            'Use parameterized queries or a query builder (e.g., Knex, Prisma) instead of string concatenation.',
          evidence: [`Line ${i + 1}: ${line.trim()}`],
          validatedBy: 'heuristic',
        });
      }
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
      if (SHELL_EXEC_PATTERN.test(line)) {
        findings.push({
          id: makeFindingId(cf.path, i + 1, 'command injection CWE-78'),
          file: cf.path,
          lineRange: [i + 1, i + 1],
          domain: 'security',
          severity: 'critical',
          title: 'Potential command injection via shell exec with interpolation',
          rationale:
            'Using exec/spawn with template literal interpolation allows attackers to inject shell commands (CWE-78).',
          suggestion:
            'Use execFile or spawn with an arguments array instead of shell string interpolation.',
          evidence: [`Line ${i + 1}: ${line.trim()}`],
          validatedBy: 'heuristic',
        });
      }
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

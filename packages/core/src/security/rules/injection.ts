import type { SecurityRule } from '../types';

export const injectionRules: SecurityRule[] = [
  {
    id: 'SEC-INJ-001',
    name: 'eval/Function Constructor',
    category: 'injection',
    severity: 'error',
    confidence: 'high',
    patterns: [/\beval\s*\(/, /new\s+Function\s*\(/],
    message: 'eval() and Function constructor allow arbitrary code execution',
    remediation: 'Use JSON.parse() for data, or a sandboxed interpreter for dynamic code',
    references: ['CWE-95'],
  },
  {
    id: 'SEC-INJ-002',
    name: 'SQL String Concatenation',
    category: 'injection',
    severity: 'error',
    confidence: 'high',
    patterns: [
      /(?:query|execute|prepare)\s*\(\s*['"][^'"]*['"]\s*\+/,
      /(?:query|execute|prepare)\s*\(\s*`[^`]*\$\{/,
    ],
    message: 'SQL query built with string concatenation or template literals with interpolation',
    remediation: 'Use parameterized queries: query("SELECT * FROM users WHERE id = $1", [id])',
    references: ['CWE-89'],
  },
  {
    id: 'SEC-INJ-003',
    name: 'Command Injection',
    category: 'injection',
    severity: 'error',
    confidence: 'high',
    patterns: [
      /\bexec\s*\(\s*['"][^'"]*['"]\s*\+/,
      /\bexec\s*\(\s*`[^`]*\$\{/,
      /\bexecSync\s*\(\s*['"][^'"]*['"]\s*\+/,
      /\bexecSync\s*\(\s*`[^`]*\$\{/,
    ],
    message: 'Shell command built with string concatenation',
    remediation: 'Use execFile() with argument array instead of exec() with string',
    references: ['CWE-78'],
  },
  {
    // Load-bearing check for the `owasp-injection-prevention` domain skill.
    // Closes the concrete gap its "ORMs do NOT automatically protect you"
    // section names: Prisma's `$queryRawUnsafe` / `$executeRawUnsafe` escape
    // hatches never parameterize interpolated values (the name says so). We
    // only fire on an interpolated argument (template `${…}` or `+` concat),
    // so a fully-static Unsafe call — which carries no injection vector — does
    // not match. This keeps false positives near zero: the tagged-template
    // form `prisma.$queryRaw`…`` and the `Prisma.sql` helper never match.
    id: 'SEC-INJ-004',
    name: 'Prisma Raw Query Injection',
    category: 'injection',
    severity: 'error',
    confidence: 'high',
    patterns: [
      /\$(?:queryRawUnsafe|executeRawUnsafe)\s*\(\s*`[^`]*\$\{/,
      /\$(?:queryRawUnsafe|executeRawUnsafe)\s*\([^)]*\+/,
    ],
    message:
      'Prisma $queryRawUnsafe/$executeRawUnsafe called with an interpolated or concatenated string — user input is injected directly into SQL',
    remediation:
      'Use the tagged-template form (prisma.$queryRaw`...${value}`) or pass parameters positionally: prisma.$queryRawUnsafe("... WHERE id = $1", value)',
    references: ['CWE-89'],
  },
];

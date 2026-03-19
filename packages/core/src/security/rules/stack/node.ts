import type { SecurityRule } from '../../types';

export const nodeRules: SecurityRule[] = [
  {
    id: 'SEC-NODE-001',
    name: 'Prototype Pollution',
    category: 'injection',
    severity: 'warning',
    confidence: 'medium',
    patterns: [
      /__proto__/,
      /\bconstructor\s*\[/,
      /\bprototype\s*\[/,
      /Object\.assign\s*\(\s*\w+\s*,\s*(?:req|request|body|input|params|query)\b/,
    ],
    stack: ['node'],
    message:
      'Potential prototype pollution via __proto__, constructor, or Object.assign with untrusted input',
    remediation:
      'Validate keys against a whitelist, use Object.create(null), or use Map instead of plain objects',
    references: ['CWE-1321'],
  },
  {
    id: 'SEC-NODE-002',
    name: 'NoSQL Injection',
    category: 'injection',
    severity: 'warning',
    confidence: 'medium',
    patterns: [
      /\.find\s*\(\s*\{[^}]*\$(?:gt|gte|lt|lte|ne|in|nin|regex|where|exists)/,
      /\.find\s*\(\s*(?:req|request)\.(?:body|query|params)/,
    ],
    stack: ['node'],
    message: 'Potential NoSQL injection: MongoDB query operators in user input',
    remediation: 'Sanitize input by stripping keys starting with $ before using in queries',
    references: ['CWE-943'],
  },
];

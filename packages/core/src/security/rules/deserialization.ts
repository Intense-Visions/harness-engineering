import type { SecurityRule } from '../types';

export const deserializationRules: SecurityRule[] = [
  {
    id: 'SEC-DES-001',
    name: 'Unvalidated JSON Parse',
    category: 'deserialization',
    severity: 'warning',
    confidence: 'medium',
    patterns: [
      /JSON\.parse\s*\(\s*(?:req|request)\.body/,
      /JSON\.parse\s*\(\s*(?:event|data|payload|input|body)\b/,
    ],
    message: 'JSON.parse on potentially untrusted input without schema validation',
    remediation: 'Validate parsed data with Zod, ajv, or joi before use',
    references: ['CWE-502'],
  },
];

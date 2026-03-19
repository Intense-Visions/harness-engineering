import type { SecurityRule } from '../../types';

export const expressRules: SecurityRule[] = [
  {
    id: 'SEC-EXPRESS-001',
    name: 'Missing Helmet',
    category: 'network',
    severity: 'info',
    confidence: 'low',
    patterns: [/app\s*=\s*express\s*\(\)/],
    stack: ['express'],
    fileGlob: '**/app.{ts,js}',
    message:
      'Express app initialization detected — ensure helmet middleware is applied for security headers',
    remediation: 'Add helmet middleware: app.use(helmet())',
    references: ['CWE-693'],
  },
  {
    id: 'SEC-EXPRESS-002',
    name: 'Unprotected Route with Body Parsing',
    category: 'network',
    severity: 'info',
    confidence: 'low',
    patterns: [/app\.(?:post|put|patch)\s*\([^)]*,\s*(?:req|request)\s*(?:,|\))/],
    stack: ['express'],
    message:
      'Express route accepts request body — ensure input validation and rate limiting are applied',
    remediation: 'Add express-rate-limit and validate request body with Zod/joi',
    references: ['CWE-770'],
  },
];

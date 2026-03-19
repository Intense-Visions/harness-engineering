import type { SecurityRule } from '../../types';

export const reactRules: SecurityRule[] = [
  {
    id: 'SEC-REACT-001',
    name: 'Sensitive Data in Client Storage',
    category: 'secrets',
    severity: 'warning',
    confidence: 'medium',
    patterns: [
      /localStorage\.setItem\s*\(\s*['"](?:token|jwt|auth|session|password|secret|key|credential)/i,
      /sessionStorage\.setItem\s*\(\s*['"](?:token|jwt|auth|session|password|secret|key|credential)/i,
    ],
    stack: ['react'],
    message: 'Storing sensitive data in browser storage is accessible to XSS attacks',
    remediation: 'Use httpOnly cookies for auth tokens instead of localStorage',
    references: ['CWE-922'],
  },
];

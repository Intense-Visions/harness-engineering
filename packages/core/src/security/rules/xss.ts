import type { SecurityRule } from '../types';

export const xssRules: SecurityRule[] = [
  {
    id: 'SEC-XSS-001',
    name: 'innerHTML Assignment',
    category: 'xss',
    severity: 'error',
    confidence: 'high',
    patterns: [/\.innerHTML\s*=/],
    message: 'Direct innerHTML assignment can lead to XSS',
    remediation: 'Use textContent for text, or a sanitizer like DOMPurify for HTML',
    references: ['CWE-79'],
  },
  {
    id: 'SEC-XSS-002',
    name: 'dangerouslySetInnerHTML',
    category: 'xss',
    severity: 'error',
    confidence: 'high',
    patterns: [/dangerouslySetInnerHTML/],
    message: 'dangerouslySetInnerHTML bypasses React XSS protections',
    remediation: 'Sanitize HTML with DOMPurify before passing to dangerouslySetInnerHTML',
    references: ['CWE-79'],
  },
  {
    id: 'SEC-XSS-003',
    name: 'document.write',
    category: 'xss',
    severity: 'error',
    confidence: 'high',
    patterns: [/document\.write\s*\(/, /document\.writeln\s*\(/],
    message: 'document.write can lead to XSS and is a legacy API',
    remediation: 'Use DOM APIs: createElement, appendChild, textContent',
    references: ['CWE-79'],
  },
];

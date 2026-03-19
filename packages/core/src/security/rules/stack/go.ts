import type { SecurityRule } from '../../types';

export const goRules: SecurityRule[] = [
  {
    id: 'SEC-GO-001',
    name: 'Unsafe Pointer Usage',
    category: 'injection',
    severity: 'warning',
    confidence: 'medium',
    patterns: [/unsafe\.Pointer/],
    stack: ['go'],
    message: 'unsafe.Pointer bypasses Go type safety',
    remediation: 'Avoid unsafe.Pointer unless absolutely necessary; document justification',
    references: ['CWE-119'],
  },
  {
    id: 'SEC-GO-002',
    name: 'Format String Injection',
    category: 'injection',
    severity: 'warning',
    confidence: 'medium',
    patterns: [/fmt\.Sprintf\s*\(\s*\w+[^,)]*\)/],
    stack: ['go'],
    message: 'Format string may come from user input',
    remediation: 'Use fmt.Sprintf with a literal format string: fmt.Sprintf("%s", userInput)',
    references: ['CWE-134'],
  },
];

import type { SecurityRule } from '../types';

export const pathTraversalRules: SecurityRule[] = [
  {
    id: 'SEC-PTH-001',
    name: 'Path Traversal Pattern',
    category: 'path-traversal',
    severity: 'warning',
    confidence: 'medium',
    patterns: [
      /(?:readFile|readFileSync|writeFile|writeFileSync|createReadStream|createWriteStream|access|stat|unlink|rmdir|mkdir)\s*\([^)]*\.{2}[/\\]/,
      /(?:readFile|readFileSync|writeFile|writeFileSync)\s*\([^)]*\+/,
    ],
    message: 'Potential path traversal: file operation with ../ or string concatenation',
    remediation:
      'Use path.resolve() and validate the resolved path stays within the expected directory',
    references: ['CWE-22'],
  },
];

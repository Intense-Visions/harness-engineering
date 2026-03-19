import type { SecurityRule } from '../types';

export const cryptoRules: SecurityRule[] = [
  {
    id: 'SEC-CRY-001',
    name: 'Weak Hash Algorithm',
    category: 'crypto',
    severity: 'error',
    confidence: 'high',
    patterns: [/createHash\s*\(\s*['"](?:md5|sha1|md4|ripemd160)['"]\s*\)/],
    message: 'MD5 and SHA1 are cryptographically broken for security use',
    remediation: 'Use SHA-256 or higher: createHash("sha256")',
    references: ['CWE-328'],
  },
  {
    id: 'SEC-CRY-002',
    name: 'Hardcoded Encryption Key',
    category: 'crypto',
    severity: 'error',
    confidence: 'high',
    patterns: [
      /(?:encryption[_-]?key|cipher[_-]?key|aes[_-]?key|secret[_-]?key)\s*[:=]\s*['"][^'"]{4,}['"]/i,
    ],
    message: 'Hardcoded encryption key detected',
    remediation: 'Load encryption keys from environment variables or a key management service',
    references: ['CWE-321'],
  },
];

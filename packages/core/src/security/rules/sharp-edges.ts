import type { SecurityRule } from '../types';

export const sharpEdgesRules: SecurityRule[] = [
  // --- Deprecated Crypto APIs ---
  {
    id: 'SEC-EDGE-001',
    name: 'Deprecated createCipher API',
    category: 'sharp-edges',
    severity: 'error',
    confidence: 'high',
    patterns: [/crypto\.createCipher\s*\(/],
    fileGlob: '**/*.{ts,js,mjs,cjs}',
    message: 'crypto.createCipher is deprecated — uses weak key derivation (no IV)',
    remediation:
      'Use crypto.createCipheriv with a random IV and proper key derivation (scrypt/pbkdf2)',
    references: ['CWE-327'],
  },
  {
    id: 'SEC-EDGE-002',
    name: 'Deprecated createDecipher API',
    category: 'sharp-edges',
    severity: 'error',
    confidence: 'high',
    patterns: [/crypto\.createDecipher\s*\(/],
    fileGlob: '**/*.{ts,js,mjs,cjs}',
    message: 'crypto.createDecipher is deprecated — uses weak key derivation (no IV)',
    remediation: 'Use crypto.createDecipheriv with the same IV used for encryption',
    references: ['CWE-327'],
  },
  {
    id: 'SEC-EDGE-003',
    name: 'ECB Mode Selection',
    category: 'sharp-edges',
    severity: 'warning',
    confidence: 'high',
    patterns: [/-ecb['"]/],
    fileGlob: '**/*.{ts,js,mjs,cjs,go,py}',
    message:
      'ECB mode does not provide semantic security — identical plaintext blocks produce identical ciphertext',
    remediation: 'Use CBC, CTR, or GCM mode instead of ECB',
    references: ['CWE-327'],
  },

  // --- Unsafe Deserialization ---
  {
    id: 'SEC-EDGE-004',
    name: 'yaml.load Without Safe Loader',
    category: 'sharp-edges',
    severity: 'error',
    confidence: 'high',
    patterns: [
      /yaml\.load\s*\(/, // Python: yaml.load() without SafeLoader
    ],
    fileGlob: '**/*.py',
    message: 'yaml.load() executes arbitrary Python objects — use yaml.safe_load() instead',
    remediation:
      'Replace yaml.load() with yaml.safe_load() or yaml.load(data, Loader=SafeLoader). Note: this rule will flag yaml.load(data, Loader=SafeLoader) — suppress with // harness-ignore SEC-EDGE-004: safe usage with SafeLoader',
    references: ['CWE-502'],
  },
  {
    id: 'SEC-EDGE-005',
    name: 'Pickle/Marshal Deserialization',
    category: 'sharp-edges',
    severity: 'error',
    confidence: 'high',
    patterns: [/pickle\.loads?\s*\(/, /marshal\.loads?\s*\(/],
    fileGlob: '**/*.py',
    message: 'pickle/marshal deserialization executes arbitrary code — never use on untrusted data',
    remediation: 'Use JSON, MessagePack, or Protocol Buffers for untrusted data serialization',
    references: ['CWE-502'],
  },

  // --- TOCTOU (Time-of-Check to Time-of-Use) ---
  {
    id: 'SEC-EDGE-006',
    name: 'Check-Then-Act File Operation',
    category: 'sharp-edges',
    severity: 'warning',
    confidence: 'medium',
    patterns: [
      /(?:existsSync|accessSync|statSync)\s*\([^)]+\)[\s\S]{0,50}(?:readFileSync|writeFileSync|unlinkSync|mkdirSync)\s*\(/,
    ],
    fileGlob: '**/*.{ts,js,mjs,cjs}',
    message: 'Check-then-act pattern on filesystem is vulnerable to TOCTOU race conditions',
    remediation:
      'Use the operation directly and handle ENOENT/EEXIST errors instead of checking first',
    references: ['CWE-367'],
  },
  {
    id: 'SEC-EDGE-007',
    name: 'Check-Then-Act File Operation (Async)',
    category: 'sharp-edges',
    severity: 'warning',
    confidence: 'medium',
    patterns: [/(?:access|stat)\s*\([^)]+\)[\s\S]{0,80}(?:readFile|writeFile|unlink|mkdir)\s*\(/],
    fileGlob: '**/*.{ts,js,mjs,cjs}',
    message: 'Async check-then-act pattern on filesystem is vulnerable to TOCTOU race conditions',
    remediation: 'Use the operation directly with try/catch instead of checking existence first',
    references: ['CWE-367'],
  },

  // --- Stringly-Typed Security ---
  {
    id: 'SEC-EDGE-008',
    name: 'JWT Algorithm "none"',
    category: 'sharp-edges',
    severity: 'error',
    confidence: 'high',
    patterns: [
      /algorithm[s]?\s*[:=]\s*\[?\s*['"]none['"]/i,
      /alg(?:orithm)?\s*[:=]\s*['"]none['"]/i,
    ],
    fileGlob: '**/*.{ts,js,mjs,cjs}',
    message: 'JWT "none" algorithm disables signature verification entirely',
    remediation:
      'Specify an explicit algorithm (e.g., "HS256", "RS256") and set algorithms allowlist in verify options',
    references: ['CWE-345'],
  },
  {
    id: 'SEC-EDGE-009',
    name: 'DES/RC4 Algorithm Selection',
    category: 'sharp-edges',
    severity: 'error',
    confidence: 'high',
    patterns: [/['"]\s*(?:des|des-ede|des-ede3|des3|rc4|rc2|blowfish)\s*['"]/i],
    fileGlob: '**/*.{ts,js,mjs,cjs,go,py}',
    message:
      'Weak/deprecated cipher algorithm selected — DES, RC4, RC2, and Blowfish are broken or deprecated',
    remediation: 'Use AES-256-GCM or ChaCha20-Poly1305',
    references: ['CWE-327'],
  },
];

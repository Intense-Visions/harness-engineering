import type { SecurityRule } from '../types';

export const insecureDefaultsRules: SecurityRule[] = [
  {
    id: 'SEC-DEF-001',
    name: 'Security-Sensitive Fallback to Hardcoded Default',
    category: 'insecure-defaults',
    severity: 'warning',
    confidence: 'medium',
    patterns: [
      /(?:SECRET|KEY|TOKEN|PASSWORD|SALT|PEPPER|SIGNING|ENCRYPTION|AUTH|JWT|SESSION).*(?:\|\||\?\?)\s*['"][^'"]+['"]/i,
    ],
    fileGlob: '**/*.{ts,js,mjs,cjs}',
    message:
      'Security-sensitive variable falls back to a hardcoded default when env var is missing',
    remediation:
      'Throw an error if the env var is missing instead of falling back to a default. Use a startup validation check.',
    references: ['CWE-1188'],
  },
  {
    id: 'SEC-DEF-002',
    name: 'TLS/SSL Disabled by Default',
    category: 'insecure-defaults',
    severity: 'warning',
    confidence: 'medium',
    patterns: [
      /(?:tls|ssl|https|secure)\s*(?:=|:)\s*(?:false|config\??\.\w+\s*(?:\?\?|&&|\|\|)\s*false)/i,
    ],
    fileGlob: '**/*.{ts,js,mjs,cjs,go,py}',
    message:
      'Security feature defaults to disabled; missing configuration degrades to insecure mode',
    remediation:
      'Default security features to enabled (true). Require explicit opt-out, not opt-in.',
    references: ['CWE-1188'],
  },
  {
    id: 'SEC-DEF-003',
    name: 'Swallowed Authentication/Authorization Error',
    category: 'insecure-defaults',
    severity: 'warning',
    confidence: 'low',
    patterns: [
      // Matches single-line empty catch: catch(e) { } or catch(e) { // ignore }
      // Note: multi-line catch blocks are handled by AI review, not this rule
      /catch\s*\([^)]*\)\s*\{\s*(?:\/\/\s*(?:ignore|skip|noop|todo)\b.*)?\s*\}/,
    ],
    fileGlob: '**/*auth*.{ts,js,mjs,cjs},**/*session*.{ts,js,mjs,cjs},**/*token*.{ts,js,mjs,cjs}',
    message:
      'Single-line empty catch block in authentication/authorization code may silently allow unauthorized access. Note: multi-line empty catch blocks are detected by AI review, not this mechanical rule.',
    remediation:
      'Re-throw the error or return an explicit denial. Never silently swallow auth errors.',
    references: ['CWE-754', 'CWE-390'],
  },
  {
    id: 'SEC-DEF-004',
    name: 'Permissive CORS Fallback',
    category: 'insecure-defaults',
    severity: 'warning',
    confidence: 'medium',
    patterns: [
      /(?:origin|cors)\s*(?:=|:)\s*(?:config|options|env)\??\.\w+\s*(?:\?\?|\|\|)\s*['"]\*/,
    ],
    fileGlob: '**/*.{ts,js,mjs,cjs}',
    message: 'CORS origin falls back to wildcard (*) when configuration is missing',
    remediation:
      'Default to a restrictive origin list. Require explicit configuration for permissive CORS.',
    references: ['CWE-942'],
  },
  {
    id: 'SEC-DEF-005',
    name: 'Rate Limiting Disabled by Default',
    category: 'insecure-defaults',
    severity: 'info',
    confidence: 'low',
    patterns: [
      /(?:rateLimit|rateLimiting|throttle)\s*(?:=|:)\s*(?:config|options|env)\??\.\w+\s*(?:\?\?|\|\|)\s*(?:false|0|null|undefined)/i,
    ],
    fileGlob: '**/*.{ts,js,mjs,cjs}',
    message: 'Rate limiting defaults to disabled when configuration is missing',
    remediation: 'Default to a sensible rate limit. Require explicit opt-out for disabling.',
    references: ['CWE-770'],
  },
];

import type { SecurityRule } from '../types';

export const networkRules: SecurityRule[] = [
  {
    id: 'SEC-NET-001',
    name: 'CORS Wildcard Origin',
    category: 'network',
    severity: 'warning',
    confidence: 'medium',
    patterns: [/origin\s*:\s*['"][*]['"]/],
    message: 'CORS wildcard origin allows any website to make requests',
    remediation: 'Restrict CORS to specific trusted origins',
    references: ['CWE-942'],
  },
  {
    id: 'SEC-NET-002',
    name: 'Disabled TLS Verification',
    category: 'network',
    severity: 'warning',
    confidence: 'high',
    patterns: [/rejectUnauthorized\s*:\s*false/],
    message: 'TLS certificate verification is disabled, enabling MITM attacks',
    remediation: 'Remove rejectUnauthorized: false, or use a proper CA bundle',
    references: ['CWE-295'],
  },
  {
    id: 'SEC-NET-004',
    name: 'Disabled TLS Verification (Rust)',
    category: 'network',
    severity: 'warning',
    confidence: 'high',
    // reqwest / native-tls builder switches (#2375). The method names are the
    // crates' own "danger" API, so a `(true)` argument is unambiguous.
    patterns: [/\.danger_accept_invalid_(?:certs|hostnames)\s*\(\s*true\s*\)/],
    fileGlob: '**/*.rs',
    message: 'TLS certificate or hostname verification is disabled, enabling MITM attacks',
    remediation:
      'Remove danger_accept_invalid_certs(true) / danger_accept_invalid_hostnames(true); trust a custom CA with add_root_certificate instead',
    references: ['CWE-295'],
  },
  {
    id: 'SEC-NET-003',
    name: 'Hardcoded HTTP URL',
    category: 'network',
    severity: 'info',
    confidence: 'low',
    patterns: [/['"]http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0)[^'"]+['"]/],
    message: 'Non-TLS HTTP URL detected (excluding localhost)',
    remediation: 'Use HTTPS for all non-local connections',
    references: ['CWE-319'],
  },
];

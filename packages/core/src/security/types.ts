export type SecurityCategory =
  | 'secrets'
  | 'injection'
  | 'xss'
  | 'crypto'
  | 'network'
  | 'deserialization'
  | 'path-traversal';

export type SecuritySeverity = 'error' | 'warning' | 'info';
export type SecurityConfidence = 'high' | 'medium' | 'low';

export interface SecurityRule {
  id: string;
  name: string;
  category: SecurityCategory;
  severity: SecuritySeverity;
  confidence: SecurityConfidence;
  patterns: RegExp[];
  fileGlob?: string;
  stack?: string[];
  message: string;
  remediation: string;
  references?: string[];
}

export interface SecurityFinding {
  ruleId: string;
  ruleName: string;
  category: SecurityCategory;
  severity: SecuritySeverity;
  confidence: SecurityConfidence;
  file: string;
  line: number;
  column?: number;
  match: string;
  context: string;
  message: string;
  remediation: string;
  references?: string[];
}

export interface ScanResult {
  findings: SecurityFinding[];
  scannedFiles: number;
  rulesApplied: number;
  externalToolsUsed: string[];
  coverage: 'baseline' | 'enhanced';
}

export type RuleOverride = 'off' | SecuritySeverity;

export interface SecurityConfig {
  enabled: boolean;
  strict: boolean;
  rules?: Record<string, RuleOverride>;
  exclude?: string[];
  external?: {
    semgrep?: { enabled: 'auto' | boolean; rulesets?: string[] };
    gitleaks?: { enabled: 'auto' | boolean };
  };
}

export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  enabled: true,
  strict: false,
  rules: {},
  exclude: ['**/node_modules/**', '**/dist/**', '**/*.test.ts', '**/fixtures/**'],
};

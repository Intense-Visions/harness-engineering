// packages/core/src/entropy/types/pattern-config.ts
// Extracted from pattern.ts to break circular dependency:
// snapshot.ts -> config.ts -> pattern.ts -> snapshot.ts
// This file contains config-level pattern types that do NOT depend on snapshot types.

export interface ConfigPattern {
  name: string;
  description: string;
  severity: 'error' | 'warning';
  files: string[];
  rule:
    | { type: 'must-export'; names: string[] }
    | { type: 'must-export-default'; kind?: 'class' | 'function' | 'object' }
    | { type: 'no-export'; names: string[] }
    | { type: 'must-import'; from: string; names?: string[] }
    | { type: 'no-import'; from: string }
    | {
        type: 'naming';
        match: string;
        convention: 'camelCase' | 'PascalCase' | 'UPPER_SNAKE' | 'kebab-case';
      }
    | { type: 'max-exports'; count: number }
    | { type: 'max-lines'; count: number }
    | { type: 'require-jsdoc'; for: ('function' | 'class' | 'export')[] };
  message?: string;
}

export interface PatternMatch {
  line: number;
  column?: number;
  message: string;
  suggestion?: string;
}

export interface PatternConfig {
  patterns: ConfigPattern[];
  customPatterns?: Array<{
    name: string;
    description: string;
    severity: 'error' | 'warning';
    check: (...args: unknown[]) => PatternMatch[];
  }>;
  ignoreFiles?: string[];
}

export interface PatternViolation {
  pattern: string;
  file: string;
  line: number;
  column?: number;
  severity: 'error' | 'warning';
  message: string;
  suggestion?: string;
}

export interface PatternReport {
  violations: PatternViolation[];
  stats: {
    filesChecked: number;
    patternsApplied: number;
    violationCount: number;
    errorCount: number;
    warningCount: number;
  };
  passRate: number;
}

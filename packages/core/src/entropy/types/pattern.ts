// packages/core/src/entropy/types/pattern.ts
import type { SourceFile, CodebaseSnapshot } from './snapshot';

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

export interface CodePattern {
  name: string;
  description: string;
  severity: 'error' | 'warning';
  check: (file: SourceFile, snapshot: CodebaseSnapshot) => PatternMatch[];
}

export interface PatternMatch {
  line: number;
  column?: number;
  message: string;
  suggestion?: string;
}

export interface PatternConfig {
  patterns: ConfigPattern[];
  customPatterns?: CodePattern[];
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

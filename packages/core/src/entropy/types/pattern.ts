// packages/core/src/entropy/types/pattern.ts
import type { SourceFile, CodebaseSnapshot } from './snapshot';
import type { PatternMatch } from './pattern-config';

// Re-export config-level types for backwards compatibility
export type {
  ConfigPattern,
  PatternMatch,
  PatternConfig,
  PatternViolation,
  PatternReport,
} from './pattern-config';

export interface CodePattern {
  name: string;
  description: string;
  severity: 'error' | 'warning';
  check: (file: SourceFile, snapshot: CodebaseSnapshot) => PatternMatch[];
}

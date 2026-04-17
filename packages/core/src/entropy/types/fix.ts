// packages/core/src/entropy/types/fix.ts

import type { ProtectedRegionMap } from '../../annotations';

// ============ Fix Types ============

export type FixType =
  | 'unused-imports'
  | 'dead-files'
  | 'dead-exports'
  | 'commented-code'
  | 'orphaned-deps'
  | 'forbidden-import-replacement'
  | 'import-ordering'
  | 'trailing-whitespace'
  | 'broken-links'
  | 'sort-imports';

export interface FixConfig {
  dryRun: boolean;
  fixTypes: FixType[];
  createBackup: boolean;
  backupDir?: string;
  /** When provided, fixes targeting lines within protected regions are skipped. */
  protectedRegions?: ProtectedRegionMap;
}

export interface Fix {
  type: FixType;
  file: string;
  description: string;
  action: 'delete-file' | 'delete-lines' | 'replace' | 'insert';
  line?: number;
  oldContent?: string;
  newContent?: string;
  safe: true;
  reversible: boolean;
}

export interface FixResult {
  applied: Fix[];
  skipped: Fix[];
  errors: { fix: Fix; error: string }[];
  stats: {
    filesModified: number;
    filesDeleted: number;
    linesRemoved: number;
    backupPath?: string;
  };
}

// ============ Cleanup Finding Types ============

export type SafetyLevel = 'safe' | 'probably-safe' | 'unsafe';

export interface CleanupFinding {
  id: string;
  concern: 'dead-code' | 'architecture';
  file: string;
  line?: number;
  type: string;
  description: string;
  safety: SafetyLevel;
  safetyReason: string;
  hotspotDowngraded: boolean;
  fixAction?: string;
  suggestion: string;
}

export interface HotspotContext {
  churnMap: Map<string, number>;
  topPercentileThreshold: number;
}

// ============ Suggestion Types ============

export interface Suggestion {
  type:
    | 'rename'
    | 'move'
    | 'merge'
    | 'split'
    | 'delete'
    | 'update-docs'
    | 'add-export'
    | 'refactor';
  priority: 'high' | 'medium' | 'low';
  source: 'drift' | 'dead-code' | 'pattern';
  relatedIssues: string[];
  title: string;
  description: string;
  files: string[];
  steps: string[];
  preview?: {
    file: string;
    diff: string;
  };
  whyManual: string;
}

export interface SuggestionReport {
  suggestions: Suggestion[];
  byPriority: {
    high: Suggestion[];
    medium: Suggestion[];
    low: Suggestion[];
  };
  estimatedEffort: 'trivial' | 'small' | 'medium' | 'large';
}

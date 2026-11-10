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
  /**
   * Where deleted files are backed up. A relative path is resolved against
   * `projectRoot`, never against `process.cwd()`; an absolute path is used as-is.
   */
  backupDir?: string;
  /**
   * Root of the project being fixed. A relative `backupDir` resolves against it
   * so backups land in the same tree as the files they protect (#2294).
   * Defaults to `process.cwd()` only when the caller supplies no root.
   */
  projectRoot?: string;
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

export type SafetyLevel = 'safe' | 'probably-safe' | 'unsafe' | 'protected';

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
    | 'refactor'
    // Non-destructive remediation for an unreferenced build entry point: declare
    // it in `entropy.entryPoints` rather than delete it (issue #1325).
    | 'configure-entrypoint';
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

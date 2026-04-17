// packages/core/src/entropy/index.ts

/**
 * Main entropy analyzer orchestrator.
 */
export { EntropyAnalyzer } from './analyzer';

/**
 * Snapshot building utility for codebase analysis.
 */
export { buildSnapshot } from './snapshot';

/**
 * Detectors for various types of codebase entropy and quality issues.
 */
export { detectDocDrift } from './detectors/drift';
export { detectDeadCode } from './detectors/dead-code';
export { detectPatternViolations } from './detectors/patterns';
export { detectComplexityViolations } from './detectors/complexity';
export type { GraphComplexityData } from './detectors/complexity';
export { detectCouplingViolations } from './detectors/coupling';
export type { GraphCouplingData } from './detectors/coupling';
export { detectSizeBudgetViolations, parseSize } from './detectors/size-budget';

/**
 * Annotation-based protected regions for code that must not be modified.
 */
export {
  parseProtectedRegions,
  parseFileRegions,
  createRegionMap,
  VALID_SCOPES,
} from '../annotations';
export type {
  ProtectionScope,
  ProtectedRegion,
  ProtectedRegionMap,
  AnnotationIssue,
  AnnotationIssueType,
} from '../annotations';

/**
 * Fixers for automated remediation of detected issues.
 */
export {
  createFixes,
  applyFixes,
  previewFix,
  createCommentedCodeFixes,
  createOrphanedDepFixes,
} from './fixers/safe-fixes';
export type { CommentedCodeBlock, OrphanedDep } from './fixers/safe-fixes';
export { generateSuggestions } from './fixers/suggestions';
export { createForbiddenImportFixes } from './fixers/architecture-fixes';
export type { ForbiddenImportViolation } from './fixers/architecture-fixes';
export {
  classifyFinding,
  applyHotspotDowngrade,
  deduplicateCleanupFindings,
} from './fixers/cleanup-finding';

/**
 * Configuration schemas and validation for entropy analysis.
 */
export { validatePatternConfig, PatternConfigSchema, EntropyConfigSchema } from './config/schema';

/**
 * Comprehensive type definitions for entropy analysis, snapshots, drift, and remediation.
 */
export type {
  EntropyError,
  InternalSymbol,
  JSDocComment,
  CodeBlock,
  InlineReference,
  SourceFile,
  DocumentationFile,
  CodeReference,
  ExportMap,
  CodebaseSnapshot,
  DriftConfig,
  DeadCodeConfig,
  EntropyConfig,
  DocumentationDrift,
  DriftReport,
  DeadExport,
  DeadFile,
  DeadInternal,
  UnusedImport,
  ReachabilityNode,
  DeadCodeReport,
  ComplexityThresholds,
  ComplexityConfig,
  ComplexityViolation,
  ComplexityReport,
  CouplingThresholds,
  CouplingConfig,
  CouplingViolation,
  CouplingReport,
  SizeBudgetConfig,
  SizeBudgetViolation,
  SizeBudgetReport,
  ConfigPattern,
  CodePattern,
  PatternMatch,
  PatternConfig,
  PatternViolation,
  PatternReport,
  FixType,
  FixConfig,
  Fix,
  FixResult,
  SafetyLevel,
  CleanupFinding,
  HotspotContext,
  Suggestion,
  SuggestionReport,
  EntropyReport,
} from './types';

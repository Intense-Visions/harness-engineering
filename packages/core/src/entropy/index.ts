// packages/core/src/entropy/index.ts

// Main analyzer
export { EntropyAnalyzer } from './analyzer';

// Snapshot
export { buildSnapshot } from './snapshot';

// Detectors
export { detectDocDrift } from './detectors/drift';
export { detectDeadCode } from './detectors/dead-code';
export { detectPatternViolations } from './detectors/patterns';
export { detectComplexityViolations } from './detectors/complexity';
export type { GraphComplexityData } from './detectors/complexity';
export { detectCouplingViolations } from './detectors/coupling';
export type { GraphCouplingData } from './detectors/coupling';
export { detectSizeBudgetViolations, parseSize } from './detectors/size-budget';

// Fixers
export { createFixes, applyFixes, previewFix } from './fixers/safe-fixes';
export { generateSuggestions } from './fixers/suggestions';

// Config
export { validatePatternConfig, PatternConfigSchema, EntropyConfigSchema } from './config/schema';

// Types
export type {
  // Error types
  EntropyError,

  // Snapshot types
  InternalSymbol,
  JSDocComment,
  CodeBlock,
  InlineReference,
  SourceFile,
  DocumentationFile,
  CodeReference,
  ExportMap,
  CodebaseSnapshot,

  // Config types
  DriftConfig,
  DeadCodeConfig,
  EntropyConfig,

  // Drift types
  DocumentationDrift,
  DriftReport,

  // Dead code types
  DeadExport,
  DeadFile,
  DeadInternal,
  UnusedImport,
  ReachabilityNode,
  DeadCodeReport,

  // Complexity types
  ComplexityThresholds,
  ComplexityConfig,
  ComplexityViolation,
  ComplexityReport,

  // Coupling types
  CouplingThresholds,
  CouplingConfig,
  CouplingViolation,
  CouplingReport,

  // Size budget types
  SizeBudgetConfig,
  SizeBudgetViolation,
  SizeBudgetReport,

  // Pattern types
  ConfigPattern,
  CodePattern,
  PatternMatch,
  PatternConfig,
  PatternViolation,
  PatternReport,

  // Fix types
  FixType,
  FixConfig,
  Fix,
  FixResult,

  // Suggestion types
  Suggestion,
  SuggestionReport,

  // Report types
  EntropyReport,
} from './types';

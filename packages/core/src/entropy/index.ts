// packages/core/src/entropy/index.ts

// Main analyzer
export { EntropyAnalyzer } from './analyzer';

// Snapshot
export { buildSnapshot, resolveEntryPoints, parseDocumentationFile } from './snapshot';

// Detectors
export { detectDocDrift, findPossibleMatches, levenshteinDistance } from './detectors/drift';
export { detectDeadCode, buildReachabilityMap } from './detectors/dead-code';
export { detectPatternViolations, checkConfigPattern } from './detectors/patterns';

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

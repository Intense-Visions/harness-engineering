// packages/core/src/entropy/types.ts
import type { EntropyError } from '../shared/errors';
import type { AST, Import, Export, LanguageParser } from '../shared/parsers';
import type { DependencyGraph } from '../constraints/types';

// Re-export EntropyError from shared/errors (canonical definition)
export type { EntropyError };

// ============ Snapshot Types ============

export interface InternalSymbol {
  name: string;
  type: 'function' | 'class' | 'variable' | 'type';
  line: number;
  references: number;
  calledBy: string[];
}

export interface JSDocComment {
  content: string;
  line: number;
  associatedSymbol?: string;
}

export interface CodeBlock {
  language: string;
  content: string;
  line: number;
}

export interface InlineReference {
  reference: string;
  line: number;
  column: number;
}

export interface SourceFile {
  path: string;
  ast: AST;
  imports: Import[];
  exports: Export[];
  internalSymbols: InternalSymbol[];
  jsDocComments: JSDocComment[];
}

export interface DocumentationFile {
  path: string;
  type: 'markdown' | 'jsdoc' | 'typedoc' | 'text';
  content: string;
  codeBlocks: CodeBlock[];
  inlineRefs: InlineReference[];
}

export interface CodeReference {
  docFile: string;
  line: number;
  column: number;
  reference: string;
  context: 'code-block' | 'inline' | 'link' | 'jsdoc';
  resolvedTo?: string;
}

export interface ExportMap {
  byFile: Map<string, Export[]>;
  byName: Map<string, { file: string; export: Export }[]>;
}

export interface CodebaseSnapshot {
  files: SourceFile[];
  dependencyGraph: DependencyGraph;
  exportMap: ExportMap;
  docs: DocumentationFile[];
  codeReferences: CodeReference[];
  entryPoints: string[];
  rootDir: string;
  config: EntropyConfig;
  buildTime: number;
}

// ============ Config Types ============

export interface DriftConfig {
  docPaths: string[];
  checkApiSignatures: boolean;
  checkExamples: boolean;
  checkStructure: boolean;
  ignorePatterns: string[];
}

export interface DeadCodeConfig {
  entryPoints?: string[];
  includeTypes: boolean;
  includeInternals: boolean;
  ignorePatterns: string[];
  treatDynamicImportsAs: 'used' | 'unknown';
}

export interface EntropyConfig {
  rootDir: string;
  parser?: LanguageParser;
  entryPoints?: string[];
  analyze: {
    drift?: boolean | Partial<DriftConfig>;
    deadCode?: boolean | Partial<DeadCodeConfig>;
    patterns?: boolean | PatternConfig;
    complexity?: boolean | Partial<ComplexityConfig>;
    coupling?: boolean | Partial<CouplingConfig>;
    sizeBudget?: boolean | Partial<SizeBudgetConfig>;
  };
  include?: string[];
  exclude?: string[];
  docPaths?: string[];
}

// ============ Drift Types ============

export interface DocumentationDrift {
  type: 'api-signature' | 'example-code' | 'structure';
  docFile: string;
  line: number;
  reference: string;
  context: string;
  issue: 'NOT_FOUND' | 'RENAMED' | 'SIGNATURE_CHANGED' | 'SYNTAX_ERROR' | 'IMPORT_ERROR';
  details: string;
  suggestion?: string;
  possibleMatches?: string[];
  confidence: 'high' | 'medium' | 'low';
}

export interface DriftReport {
  drifts: DocumentationDrift[];
  stats: {
    docsScanned: number;
    referencesChecked: number;
    driftsFound: number;
    byType: { api: number; example: number; structure: number };
  };
  severity: 'high' | 'medium' | 'low' | 'none';
}

// ============ Dead Code Types ============

export interface DeadExport {
  file: string;
  name: string;
  line: number;
  type: 'function' | 'class' | 'variable' | 'type' | 'interface' | 'enum';
  isDefault: boolean;
  reason: 'NO_IMPORTERS' | 'IMPORTERS_ALSO_DEAD';
}

export interface DeadFile {
  path: string;
  reason: 'NO_IMPORTERS' | 'NOT_ENTRY_POINT' | 'ALL_EXPORTS_DEAD';
  exportCount: number;
  lineCount: number;
}

export interface DeadInternal {
  file: string;
  name: string;
  line: number;
  type: 'function' | 'class' | 'variable';
  reason: 'NEVER_CALLED' | 'ONLY_CALLED_BY_DEAD';
}

export interface UnusedImport {
  file: string;
  line: number;
  source: string;
  specifiers: string[];
  isFullyUnused: boolean;
}

export interface ReachabilityNode {
  file: string;
  reachable: boolean;
  importedBy: string[];
  imports: string[];
}

export interface DeadCodeReport {
  deadExports: DeadExport[];
  deadFiles: DeadFile[];
  deadInternals: DeadInternal[];
  unusedImports: UnusedImport[];
  stats: {
    filesAnalyzed: number;
    entryPointsUsed: string[];
    totalExports: number;
    deadExportCount: number;
    totalFiles: number;
    deadFileCount: number;
    estimatedDeadLines: number;
  };
  reachabilityTree?: ReachabilityNode;
}

// ============ Pattern Types ============

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

// ============ Complexity Types ============

export interface ComplexityThresholds {
  cyclomaticComplexity?: { error?: number; warn?: number };
  nestingDepth?: { warn?: number };
  functionLength?: { warn?: number };
  parameterCount?: { warn?: number };
  fileLength?: { info?: number };
  hotspotPercentile?: { error?: number };
}

export interface ComplexityConfig {
  enabled?: boolean;
  thresholds?: ComplexityThresholds;
}

export interface ComplexityViolation {
  file: string;
  function: string;
  line: number;
  metric:
    | 'cyclomaticComplexity'
    | 'nestingDepth'
    | 'functionLength'
    | 'parameterCount'
    | 'fileLength'
    | 'hotspotScore';
  value: number;
  threshold: number;
  tier: 1 | 2 | 3;
  severity: 'error' | 'warning' | 'info';
  message?: string;
}

export interface ComplexityReport {
  violations: ComplexityViolation[];
  stats: {
    filesAnalyzed: number;
    functionsAnalyzed: number;
    violationCount: number;
    errorCount: number;
    warningCount: number;
    infoCount: number;
  };
}

// ============ Coupling Types ============

export interface CouplingThresholds {
  fanOut?: { warn?: number };
  fanIn?: { info?: number };
  couplingRatio?: { warn?: number };
  transitiveDependencyDepth?: { info?: number };
}

export interface CouplingConfig {
  enabled?: boolean;
  thresholds?: CouplingThresholds;
}

export interface CouplingViolation {
  file: string;
  metric: 'fanOut' | 'fanIn' | 'couplingRatio' | 'transitiveDependencyDepth';
  value: number;
  threshold: number;
  tier: 1 | 2 | 3;
  severity: 'error' | 'warning' | 'info';
  message?: string;
}

export interface CouplingReport {
  violations: CouplingViolation[];
  stats: {
    filesAnalyzed: number;
    violationCount: number;
    warningCount: number;
    infoCount: number;
  };
}

// ============ Size Budget Types ============

export interface SizeBudgetConfig {
  enabled?: boolean;
  budgets: Record<string, { warn?: string }>;
  dependencyWeight?: { info?: string };
}

export interface SizeBudgetViolation {
  package: string;
  currentSize: number;
  budgetSize: number;
  unit: 'bytes';
  tier: 2 | 3;
  severity: 'warning' | 'info';
}

export interface SizeBudgetReport {
  violations: SizeBudgetViolation[];
  stats: {
    packagesChecked: number;
    violationCount: number;
    warningCount: number;
    infoCount: number;
  };
}

// ============ Fix Types ============

export type FixType =
  | 'unused-imports'
  | 'dead-files'
  | 'trailing-whitespace'
  | 'broken-links'
  | 'sort-imports';

export interface FixConfig {
  dryRun: boolean;
  fixTypes: FixType[];
  createBackup: boolean;
  backupDir?: string;
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

// ============ Report Types ============

export interface AnalysisError {
  analyzer: 'drift' | 'deadCode' | 'patterns' | 'complexity' | 'coupling' | 'sizeBudget';
  error: EntropyError;
}

export interface EntropyReport {
  snapshot: CodebaseSnapshot;
  drift?: DriftReport;
  deadCode?: DeadCodeReport;
  patterns?: PatternReport;
  complexity?: ComplexityReport;
  coupling?: CouplingReport;
  sizeBudget?: SizeBudgetReport;
  analysisErrors: AnalysisError[];
  summary: {
    totalIssues: number;
    errors: number;
    warnings: number;
    fixableCount: number;
    suggestionCount: number;
  };
  timestamp: string;
  duration: number;
}

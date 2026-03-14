# Module 4: Entropy Management - Design Specification

**Date**: 2026-03-12
**Status**: Approved Design
**Author**: AI Harness Engineering Team
**Module**: Phase 2, Module 4 - Entropy Management
**Estimated Complexity**: High (3-4 weeks)

---

## Summary

Module 4 provides entropy management capabilities for TypeScript codebases. It detects documentation drift, dead code, and pattern violations, then offers safe automated fixes plus actionable suggestions for risky changes.

**Key capabilities:**
- Documentation drift detection - Docs that don't match implementation
- Dead code detection - Unused files, exports, imports via tree-shaking analysis
- Pattern violation detection - Code that deviates from standards (config + code patterns)
- Auto-fix utilities - Safe automated fixes with suggestions for risky changes

**Architecture decision:**
Unified Analysis Engine with shared `CodebaseSnapshot`. Parse once, analyze many. All detectors consume a pre-built snapshot containing ASTs, dependency graph, and documentation index.

**Snapshot caching:** The `EntropyAnalyzer` class builds the snapshot once on first analysis. Subsequent calls to `detectDrift()`, `detectDeadCode()`, or `detectPatterns()` reuse the cached snapshot. Call `buildSnapshot()` explicitly to force a rebuild.

---

## Error Types

```typescript
// types.ts - Extends BaseError from shared/errors.ts

export interface EntropyError extends BaseError {
  code:
    | 'SNAPSHOT_BUILD_FAILED'
    | 'PARSE_ERROR'
    | 'ENTRY_POINT_NOT_FOUND'
    | 'INVALID_CONFIG'
    | 'FIX_FAILED'
    | 'BACKUP_FAILED';
  details: {
    file?: string;
    reason?: string;
    originalError?: Error;
  };
}
```

---

## File Structure

```
packages/core/src/entropy/
├── index.ts                 # Public exports
├── types.ts                 # All entropy-specific types
├── analyzer.ts              # EntropyAnalyzer orchestrator
├── snapshot.ts              # CodebaseSnapshot builder
├── shared.ts                # Shared utilities for Context module integration
├── detectors/
│   ├── index.ts             # Detector exports
│   ├── drift.ts             # Documentation drift detection
│   ├── dead-code.ts         # Unused code detection
│   └── patterns.ts          # Pattern violation detection
├── fixers/
│   ├── index.ts             # Fixer exports
│   ├── safe-fixes.ts        # Auto-applicable fixes
│   └── suggestions.ts       # Suggestion generator
└── config/
    ├── index.ts             # Config exports
    ├── schema.ts            # Zod schemas for config
    └── patterns.ts          # Built-in pattern definitions

packages/core/tests/entropy/
├── analyzer.test.ts
├── snapshot.test.ts
├── detectors/
│   ├── drift.test.ts
│   ├── dead-code.test.ts
│   └── patterns.test.ts
├── fixers/
│   ├── safe-fixes.test.ts
│   └── suggestions.test.ts
├── integration/
│   ├── full-analysis.test.ts
│   └── context-integration.test.ts
└── fixtures/
    ├── drift-samples/
    ├── dead-code-samples/
    ├── pattern-samples/
    └── valid-project/
```

---

## CodebaseSnapshot

The shared analysis context built once and consumed by all detectors.

```typescript
// snapshot.ts

export interface CodebaseSnapshot {
  // Source code analysis
  files: SourceFile[];
  dependencyGraph: DependencyGraph;
  exportMap: ExportMap;

  // Documentation analysis
  docs: DocumentationFile[];
  codeReferences: CodeReference[];

  // Entry points for reachability
  entryPoints: string[];

  // Metadata
  rootDir: string;
  config: EntropyConfig;
  buildTime: number;
}

export interface SourceFile {
  path: string;
  ast: AST;
  imports: Import[];
  exports: Export[];
  internalSymbols: InternalSymbol[];
  jsDocComments: JSDocComment[];
}

export interface InternalSymbol {
  name: string;
  type: 'function' | 'class' | 'variable' | 'type';
  line: number;
  references: number;           // Call count within file
  calledBy: string[];           // Names of other symbols that call this
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

export async function buildSnapshot(
  config: EntropyConfig,
  parser: LanguageParser
): Promise<Result<CodebaseSnapshot, EntropyError>>
```

**Key decisions:**
- Reuses `DependencyGraph` from constraints module
- `CodeReference` tracks where docs mention code, enabling drift detection
- `ExportMap` indexed both ways for fast lookups
- `internalSymbols` captured for full dead code analysis

---

## Documentation Drift Detection

Detects three types of drift: API signatures, example code, and structural references.

```typescript
// detectors/drift.ts

export interface DriftConfig {
  docPaths: string[];
  checkApiSignatures: boolean;
  checkExamples: boolean;
  checkStructure: boolean;
  ignorePatterns: string[];
}

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

export function detectDocDrift(
  snapshot: CodebaseSnapshot,
  config?: Partial<DriftConfig>
): Result<DriftReport, EntropyError>
```

**Detection strategies:**

| Drift Type | How It Works |
|------------|--------------|
| API Signature | Extract backtick refs and code block symbols, look up in ExportMap, fuzzy match if not found |
| Example Code | Parse code blocks with TypeScript parser, check imports resolve, report syntax/import errors |
| Structure | Extract file paths and links, verify via fs.existsSync |

**Fuzzy matching for renames:**
- Levenshtein distance for typos
- Prefix/suffix matching
- Case-insensitive matching

**Documentation sources scanned:**
- Markdown files (`.md`)
- JSDoc comments in source files
- TypeDoc output
- Text files and code comments referencing APIs

---

## Dead Code Detection

Full tree-shaking analysis tracing reachability from entry points.

```typescript
// detectors/dead-code.ts

export interface DeadCodeConfig {
  entryPoints?: string[];
  includeTypes: boolean;
  includeInternals: boolean;
  ignorePatterns: string[];
  treatDynamicImportsAs: 'used' | 'unknown';
}

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

export interface ReachabilityNode {
  file: string;
  reachable: boolean;
  importedBy: string[];
  imports: string[];
}

export async function detectDeadCode(
  snapshot: CodebaseSnapshot,
  config?: Partial<DeadCodeConfig>
): Promise<Result<DeadCodeReport, EntropyError>>

export async function resolveEntryPoints(
  rootDir: string,
  explicitEntries?: string[]
): Promise<Result<string[], EntropyError>>
```

**Entry point resolution order:**
1. Explicit config (`config.entryPoints`)
2. `package.json` fields: `exports`, `main`, `bin`
3. Convention patterns: `src/index.ts`, `src/main.ts`, `index.ts`
4. Error if none found

**Reachability algorithm:**
1. Start with entry points as "reachable"
2. BFS/DFS through import graph, marking reachable files
3. Within reachable files, trace internal call graph
4. Anything not marked = dead

**Edge cases handled:**
- Re-exports (`export * from './x'`) - follow chain
- Dynamic imports - configurable (default: assume used)
- Side-effect imports (`import './polyfill'`) - mark file as reachable
- Circular imports - handled via visited set

---

## Pattern Violation Detection

Both declarative config patterns and programmatic code patterns.

```typescript
// detectors/patterns.ts

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
    | { type: 'naming'; match: string; convention: 'camelCase' | 'PascalCase' | 'UPPER_SNAKE' | 'kebab-case' }
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

export function detectPatternViolations(
  snapshot: CodebaseSnapshot,
  config: PatternConfig
): Result<PatternReport, EntropyError>
```

**Built-in patterns:**

```typescript
// config/patterns.ts

export const builtInPatterns: ConfigPattern[] = [
  {
    name: 'service-default-export',
    description: 'Service files must export a default object',
    severity: 'error',
    files: ['**/services/**/*.ts'],
    rule: { type: 'must-export-default', kind: 'object' }
  },
  {
    name: 'no-barrel-reexport-all',
    description: 'Index files should not use export * (prefer named)',
    severity: 'warning',
    files: ['**/index.ts'],
    rule: { type: 'no-export', names: ['*'] }
  },
  {
    name: 'test-file-naming',
    description: 'Test files must follow naming convention',
    severity: 'warning',
    files: ['**/tests/**/*.ts', '**/__tests__/**/*.ts'],
    rule: { type: 'naming', match: '**/*.ts', convention: 'kebab-case' }
  }
];
```

---

## Auto-Fix and Suggestions

Safe automated fixes plus actionable suggestions for risky changes.

```typescript
// fixers/safe-fixes.ts

export interface FixConfig {
  dryRun: boolean;
  fixTypes: FixType[];
  createBackup: boolean;
  backupDir?: string;
}

export type FixType =
  | 'unused-imports'
  | 'dead-files'
  | 'trailing-whitespace'
  | 'broken-links'
  | 'sort-imports';

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

export async function applyFixes(
  report: EntropyReport,
  config?: Partial<FixConfig>
): Promise<Result<FixResult, EntropyError>>

export function planFixes(
  report: EntropyReport,
  fixTypes?: FixType[]
): Fix[]
```

```typescript
// fixers/suggestions.ts

export interface Suggestion {
  type: 'rename' | 'move' | 'merge' | 'split' | 'delete' | 'update-docs' | 'add-export' | 'refactor';
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

export function generateSuggestions(
  report: EntropyReport
): Result<SuggestionReport, EntropyError>
```

**Safe fix criteria:**

| Fix Type | Why Safe |
|----------|----------|
| `unused-imports` | Removing unused code can't break runtime behavior |
| `dead-files` | File has zero importers, deletion can't break anything |
| `trailing-whitespace` | Cosmetic, no behavior change |
| `broken-links` | Fixing links in docs doesn't affect code |
| `sort-imports` | Order doesn't affect behavior |

**Risky (suggestion only):**

| Scenario | Why Risky |
|----------|-----------|
| Rename symbol to match docs | External consumers may depend on old name |
| Delete "dead" export | May be used dynamically or by external packages |
| Update example code in docs | Requires understanding intent |
| Merge similar files | Architectural decision |

---

## Public API

```typescript
// analyzer.ts

export interface EntropyConfig {
  rootDir: string;
  parser?: LanguageParser;
  entryPoints?: string[];
  analyze: {
    drift?: boolean | Partial<DriftConfig>;
    deadCode?: boolean | Partial<DeadCodeConfig>;
    patterns?: boolean | PatternConfig;
  };
  include?: string[];
  exclude?: string[];
  docPaths?: string[];
}

export interface EntropyReport {
  snapshot: CodebaseSnapshot;
  drift?: DriftReport;
  deadCode?: DeadCodeReport;
  patterns?: PatternReport;
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

export class EntropyAnalyzer {
  constructor(config: EntropyConfig);
  async buildSnapshot(): Promise<Result<CodebaseSnapshot, EntropyError>>;
  async analyze(): Promise<Result<EntropyReport, EntropyError>>;
  async detectDrift(config?: Partial<DriftConfig>): Promise<Result<DriftReport, EntropyError>>;
  async detectDeadCode(config?: Partial<DeadCodeConfig>): Promise<Result<DeadCodeReport, EntropyError>>;
  async detectPatterns(config: PatternConfig): Promise<Result<PatternReport, EntropyError>>;
  async applyFixes(config?: Partial<FixConfig>): Promise<Result<FixResult, EntropyError>>;
  generateSuggestions(): Result<SuggestionReport, EntropyError>;
}

export async function analyzeEntropy(
  config: EntropyConfig
): Promise<Result<EntropyReport, EntropyError>>
```

**Module exports:**

```typescript
// index.ts

// Main API
export { EntropyAnalyzer, analyzeEntropy } from './analyzer';
export { buildSnapshot } from './snapshot';

// Detectors
export { detectDocDrift } from './detectors/drift';
export { detectDeadCode, resolveEntryPoints } from './detectors/dead-code';
export { detectPatternViolations } from './detectors/patterns';

// Fixers
export { applyFixes, planFixes } from './fixers/safe-fixes';
export { generateSuggestions } from './fixers/suggestions';

// Built-in patterns
export { builtInPatterns } from './config/patterns';

// Config helper
export { defineEntropyConfig } from './config/schema';

// Types (all exported)
export type { ... } from './types';
```

---

## Context Module Integration

Bidirectional integration where Entropy provides the detection engine.

```typescript
// entropy/shared.ts

export interface LinkValidationResult {
  link: string;
  file: string;
  line: number;
  valid: boolean;
  reason?: 'NOT_FOUND' | 'WRONG_EXTENSION' | 'OUTSIDE_ROOT';
  suggestion?: string;
}

export interface StructureValidationResult {
  referencedPath: string;
  docFile: string;
  line: number;
  exists: boolean;
  type?: 'file' | 'directory';
  suggestion?: string;
}

export function validateLinks(
  content: string,
  filePath: string,
  rootDir: string
): LinkValidationResult[]

export function validateStructureReferences(
  snapshot: CodebaseSnapshot
): StructureValidationResult[]

export function extractCodeReferences(
  content: string,
  filePath: string
): CodeReference[]
```

**Integration points:**

| Context Module Function | How It Uses Entropy |
|------------------------|---------------------|
| `validateKnowledgeMap()` | Calls `validateLinks()` + `validateStructureReferences()` |
| `checkDocCoverage()` | Uses `CodeReference` extraction |
| `generateAgentsMap()` | Could use `ExportMap` to list public API |

**Backwards compatibility:**
- Context module's existing public API unchanged
- Internal implementation delegates to Entropy
- Users can use either module independently

---

## Testing Strategy

| Component | Strategy | Key Test Cases |
|-----------|----------|----------------|
| Snapshot | Build from fixtures, verify structure | All import types parsed, docs indexed, entry points resolved |
| Drift | Fixture projects with known drift | API rename detected, broken example found, missing file caught |
| Dead Code | Fixture with known dead code | Unused export found, orphan file found, transitive death detected |
| Patterns | Config + code patterns | Config rules trigger, custom patterns run, violations reported |
| Safe Fixes | Apply to temp copy, verify result | Unused import removed, dead file deleted, backup created |
| Suggestions | Generate from reports | Correct priority, actionable steps, preview diff accurate |

**Test fixtures:**

```
fixtures/drift-samples/outdated-readme/
├── package.json
├── src/
│   └── user.ts              # export function findUserById()
├── README.md                # Documents getUserById() - DRIFT!
└── expected.json            # Expected DriftReport for assertions
```

**Coverage requirements:**
- Unit tests: >80% line coverage per file
- Branch coverage: >70% for complex logic
- Integration tests: Full analysis flow on fixture projects

---

## Dependencies

**Existing dependencies used:**
- `@typescript-eslint/typescript-estree` - AST parsing (from constraints module)
- `zod` - Config validation
- `glob` - File pattern matching

**No new dependencies required.**

---

## Success Criteria

Module 4 is complete when:

- [ ] All APIs implemented and exported
- [ ] CodebaseSnapshot building works correctly
- [ ] Drift detection catches API, example, and structure drift
- [ ] Dead code detection performs full tree-shaking analysis
- [ ] Pattern detection supports both config and code patterns
- [ ] Safe fixes apply correctly with backup
- [ ] Suggestions generated with correct priority
- [ ] Context module integration working
- [ ] Test coverage >80% for all files
- [ ] All tests passing in CI
- [ ] TypeScript compiles without errors
- [ ] README updated with usage examples
- [ ] CHANGELOG documents all changes
- [ ] Version set to 0.4.0
- [ ] Release tagged: `@harness-engineering/core@0.4.0`

---

## Usage Example

```typescript
import { EntropyAnalyzer, builtInPatterns } from '@harness-engineering/core';

const analyzer = new EntropyAnalyzer({
  rootDir: './src',
  analyze: {
    drift: true,
    deadCode: { includeInternals: true },
    patterns: { patterns: builtInPatterns }
  }
});

const result = await analyzer.analyze();
if (result.ok) {
  console.log(`Found ${result.value.summary.totalIssues} issues`);

  // Apply safe fixes
  const fixes = await analyzer.applyFixes({ dryRun: false });

  // Get suggestions for remaining issues
  const suggestions = analyzer.generateSuggestions();
}
```

---

_Last Updated: 2026-03-12_

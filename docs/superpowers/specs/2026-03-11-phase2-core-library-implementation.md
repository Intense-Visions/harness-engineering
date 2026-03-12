# Phase 2: Core Library Implementation - Design Specification

**Date**: 2026-03-11
**Status**: Approved Design
**Author**: AI Harness Engineering Team
**Phase**: Phase 2 - Core Library Implementation

---

## Executive Summary

This specification defines the implementation approach for Phase 2 of the Harness Engineering Library: building the five core runtime modules in the `@harness-engineering/core` TypeScript package.

**Implementation Strategy**: Vertical Slices (Depth-First)
- Build each module to 100% completion before starting the next
- Each module includes: types, implementation, tests (>80% coverage), documentation
- Release incrementally: v0.1.0 per module

**Module Implementation Order**:
1. **Validation** - Foundation (no dependencies)
2. **Context Engineering** - AGENTS.md validation, doc coverage
3. **Architectural Constraints** - Layer enforcement, circular dependency detection
4. **Entropy Management** - Doc drift, dead code, pattern violations
5. **Agent Feedback** - Self-review, peer review, telemetry integration

**Timeline**: 8-12 weeks (2-3 weeks per module × 5 modules)

---

## Table of Contents

1. [Package Structure & Organization](#1-package-structure--organization)
2. [Foundational Patterns & Types](#2-foundational-patterns--types)
3. [Module 1: Validation](#3-module-1-validation)
4. [Module 2: Context Engineering](#4-module-2-context-engineering)
5. [Module 3: Architectural Constraints](#5-module-3-architectural-constraints)
6. [Module 4: Entropy Management](#6-module-4-entropy-management)
7. [Module 5: Agent Feedback](#7-module-5-agent-feedback)
8. [Integration & Release Strategy](#8-integration--release-strategy)
9. [Testing Strategy](#9-testing-strategy)
10. [Dependencies](#10-dependencies)

---

## 1. Package Structure & Organization

### Directory Structure

```
packages/core/
├── src/
│   ├── validation/              # Module 1 (implement first)
│   │   ├── index.ts             # Public exports
│   │   ├── file-structure.ts    # File structure validation
│   │   ├── config.ts            # Config validation (Zod)
│   │   ├── commit-message.ts    # Commit message validation
│   │   └── types.ts             # Validation-specific types
│   ├── context/                 # Module 2 (implement second)
│   │   ├── index.ts
│   │   ├── agents-map.ts        # AGENTS.md validation
│   │   ├── doc-coverage.ts      # Documentation coverage
│   │   ├── knowledge-map.ts     # Knowledge map integrity
│   │   ├── generate.ts          # AGENTS.md generation
│   │   └── types.ts
│   ├── constraints/             # Module 3 (implement third)
│   │   ├── index.ts
│   │   ├── layers.ts            # Layer definitions
│   │   ├── dependencies.ts      # Dependency validation
│   │   ├── boundary.ts          # Boundary parsing
│   │   ├── circular-deps.ts     # Circular dependency detection
│   │   └── types.ts
│   ├── entropy/                 # Module 4 (implement fourth)
│   │   ├── index.ts
│   │   ├── doc-drift.ts         # Documentation drift detection
│   │   ├── patterns.ts          # Pattern violations
│   │   ├── dead-code.ts         # Dead code detection
│   │   ├── auto-fix.ts          # Auto-fix utilities
│   │   └── types.ts
│   ├── feedback/                # Module 5 (implement fifth)
│   │   ├── index.ts
│   │   ├── self-review.ts       # Self-review workflows
│   │   ├── peer-review.ts       # Peer review (agent spawning)
│   │   ├── telemetry.ts         # Telemetry integration
│   │   ├── logging.ts           # Agent action logging
│   │   └── types.ts
│   ├── shared/                  # Shared utilities (across modules)
│   │   ├── result.ts            # Result<T, E> type
│   │   ├── errors.ts            # Base error types
│   │   ├── fs-utils.ts          # File system helpers
│   │   └── parsers/             # Language parsers (abstraction)
│   │       ├── index.ts
│   │       ├── base.ts          # LanguageParser interface
│   │       ├── typescript.ts    # TypeScript parser
│   │       ├── python.ts        # Python parser (future)
│   │       └── go.ts            # Go parser (future)
│   └── index.ts                 # Main entry point (exports all modules)
├── tests/
│   ├── validation/              # Tests mirror src structure
│   ├── context/
│   ├── constraints/
│   ├── entropy/
│   ├── feedback/
│   └── fixtures/                # Test fixtures (sample files, configs)
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

### Key Design Decisions

1. **One directory per module** - Clear separation, matches design spec
2. **Shared utilities in `shared/`** - Result types, errors, parsers used by all modules
3. **Tests mirror source structure** - Easy to find tests for any module
4. **Each module has `types.ts`** - Module-specific types live with the module
5. **Main `index.ts` exports all** - Single import point: `import { validateAgentsMap } from '@harness-engineering/core'`

---

## 2. Foundational Patterns & Types

### Result<T, E> Pattern

All operations return a discriminated union for type-safe error handling:

```typescript
// src/shared/result.ts
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

// Helper constructors
export const Ok = <T>(value: T): Result<T, never> => ({
  ok: true,
  value,
});

export const Err = <E>(error: E): Result<never, E> => ({
  ok: false,
  error,
});

// Utilities
export function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok === true;
}

export function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
  return result.ok === false;
}
```

**Usage example:**
```typescript
const result = validateAgentsMap('./AGENTS.md');
if (result.ok) {
  console.log('Valid!', result.value);
} else {
  console.error('Error:', result.error.message);
}
```

### Error Type Hierarchy

```typescript
// src/shared/errors.ts
export type ErrorCode = string; // e.g., 'PARSE_ERROR', 'VALIDATION_FAILED'

export interface BaseError {
  code: ErrorCode;
  message: string;
  details: Record<string, unknown>;
  suggestions: string[];
}

// Module-specific error types
export interface ValidationError extends BaseError {
  code: 'INVALID_TYPE' | 'MISSING_FIELD' | 'VALIDATION_FAILED' | 'PARSE_ERROR';
}

export interface ContextError extends BaseError {
  code: 'PARSE_ERROR' | 'SCHEMA_VIOLATION' | 'MISSING_SECTION' | 'BROKEN_LINK';
}

export interface ConstraintError extends BaseError {
  code: 'WRONG_LAYER' | 'CIRCULAR_DEP' | 'FORBIDDEN_IMPORT' | 'BOUNDARY_ERROR';
}

export interface EntropyError extends BaseError {
  code: 'DOC_DRIFT' | 'PATTERN_VIOLATION' | 'DEAD_CODE_FOUND';
}

export interface FeedbackError extends BaseError {
  code: 'AGENT_SPAWN_ERROR' | 'TELEMETRY_ERROR' | 'REVIEW_ERROR';
}

// Error factory helpers
export function createError<T extends BaseError>(
  code: T['code'],
  message: string,
  details: Record<string, unknown> = {},
  suggestions: string[] = []
): T {
  return { code, message, details, suggestions } as T;
}
```

### File System Utilities

```typescript
// src/shared/fs-utils.ts
import { readFile, access, readdir } from 'fs/promises';
import { constants } from 'fs';
import { glob } from 'glob';
import type { Result } from './result';

export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function readFileContent(path: string): Promise<Result<string, Error>> {
  try {
    const content = await readFile(path, 'utf-8');
    return { ok: true, value: content };
  } catch (error) {
    return { ok: false, error: error as Error };
  }
}

export async function findFiles(pattern: string, cwd: string = process.cwd()): Promise<string[]> {
  return glob(pattern, { cwd, absolute: true });
}
```

### Module Boundaries

Each module will:
1. **Export only through `index.ts`** - Internal files are implementation details
2. **Accept only plain objects** - No complex class instances across boundaries
3. **Return Result types** - Never throw errors from public APIs
4. **Use Zod for input validation** - Runtime type safety at boundaries
5. **Document all exports** - JSDoc comments for IDE hints

---

## 3. Module 1: Validation

**Purpose**: Provide cross-cutting validation utilities used by all other modules.

### Core Features

1. **File Structure Validation** - Verify project follows conventions
2. **Config Validation** - Type-safe config parsing with Zod
3. **Commit Message Validation** - Support conventional commits

### API Design

#### File Structure Validation

```typescript
// src/validation/file-structure.ts
import { z } from 'zod';

export interface Convention {
  pattern: string;        // Glob pattern, e.g., "docs/**/*.md"
  required: boolean;      // Must files exist matching this pattern?
  description: string;    // Human-readable description
  examples: string[];     // Example valid paths
}

export interface StructureValidation {
  valid: boolean;
  missing: string[];      // Required files/patterns that don't exist
  unexpected: string[];   // Files that violate conventions
  conformance: number;    // 0-100%
}

export async function validateFileStructure(
  conventions: Convention[],
  rootDir: string = process.cwd()
): Promise<Result<StructureValidation, ValidationError>>
```

**Implementation approach:**
- Use `glob` to check if files exist matching patterns
- For required conventions, verify at least one file matches
- Calculate conformance as `(matched / total) * 100`

#### Config Validation

```typescript
// src/validation/config.ts
import { z } from 'zod';

export interface ConfigError extends ValidationError {
  code: 'INVALID_TYPE' | 'MISSING_FIELD' | 'VALIDATION_FAILED';
  details: {
    zodError?: z.ZodError;  // Include Zod's detailed error
    path?: string[];         // Path to invalid field
  };
}

export function validateConfig<T>(
  config: unknown,
  schema: z.ZodSchema<T>
): Result<T, ConfigError>
```

**Implementation approach:**
- Thin wrapper around Zod's `safeParse()`
- Convert Zod errors to our ConfigError format
- Extract helpful suggestions from Zod error details

**Example usage:**
```typescript
const HarnessConfigSchema = z.object({
  version: z.number(),
  layers: z.array(z.object({
    name: z.string(),
    allowedDependencies: z.array(z.string()),
  })),
});

const result = validateConfig(userConfig, HarnessConfigSchema);
if (!result.ok) {
  console.error(result.error.suggestions); // ["version must be a number", ...]
}
```

#### Commit Message Validation

```typescript
// src/validation/commit-message.ts

export type CommitFormat = 'conventional' | 'angular' | 'custom';

export interface CommitValidation {
  valid: boolean;
  type?: string;          // e.g., 'feat', 'fix', 'docs'
  scope?: string;         // e.g., 'core', 'validation'
  breaking: boolean;      // Does commit contain breaking changes?
  issues: string[];       // What's wrong (if invalid)
}

export function validateCommitMessage(
  message: string,
  format: CommitFormat = 'conventional'
): Result<CommitValidation, ValidationError>
```

**Implementation approach:**
- Regex-based parsing for conventional commits: `^(feat|fix|docs|...)(\(.+\))?!?: .+`
- Check for `BREAKING CHANGE:` in body
- Return structured validation with helpful issues array

### Testing Strategy

Each function gets:
- **Happy path tests** - Valid inputs return expected results
- **Edge case tests** - Empty strings, missing files, malformed configs
- **Error path tests** - Invalid inputs return appropriate errors
- **Fixtures** - Use `tests/fixtures/` for sample files

---

## 4. Module 2: Context Engineering

**Purpose**: Validate repository-as-documentation patterns, focusing on AGENTS.md and documentation coverage.

### Core Features

1. **AGENTS.md Validation** - Parse and validate knowledge map structure
2. **Documentation Coverage** - Check which files/domains are documented
3. **Knowledge Map Integrity** - Verify all links resolve to actual files
4. **AGENTS.md Generation** - Auto-generate knowledge map from codebase

### API Design

#### AGENTS.md Validation

```typescript
// src/context/agents-map.ts
import { z } from 'zod';

export interface AgentMapSection {
  title: string;           // Section heading
  links: AgentMapLink[];   // Links in this section
  description?: string;    // Optional description text
}

export interface AgentMapLink {
  text: string;           // Link text
  path: string;           // File path (relative or absolute)
  exists: boolean;        // Does the file exist?
  line?: number;          // Line number in AGENTS.md
}

export interface ValidationSuccess {
  valid: true;
  sections: AgentMapSection[];
  linkCount: number;
  brokenLinks: number;
}

export async function validateAgentsMap(
  path: string = './AGENTS.md'
): Promise<Result<ValidationSuccess, ContextError>>
```

**Implementation approach:**
- Read AGENTS.md as plain text
- Parse markdown (simple regex for links: `[text](path)`)
- Group links by section (identified by `##` headers)
- Check each link path exists using `fileExists()` from shared utils
- Return structured validation with broken links highlighted

**Required sections for harness-engineering projects:**
- 'About This Project'
- 'Core Documentation'
- 'Code Structure'

#### Documentation Coverage

```typescript
// src/context/doc-coverage.ts

export interface DocumentationGap {
  file: string;           // Undocumented file path
  suggestedSection: string; // Where it should be documented
  importance: 'high' | 'medium' | 'low'; // Based on file type/location
}

export interface CoverageReport {
  domain: string;         // e.g., 'services', 'core', 'ui'
  documented: string[];   // Files mentioned in docs
  undocumented: string[]; // Files not mentioned
  coveragePercentage: number;
  gaps: DocumentationGap[];
}

export async function checkDocCoverage(
  domain: string,
  options?: {
    docsDir?: string;     // Default: './docs'
    sourceDir?: string;   // Default: './src'
    excludePatterns?: string[]; // Files to ignore
  }
): Promise<Result<CoverageReport, ContextError>>
```

#### Knowledge Map Integrity

```typescript
// src/context/knowledge-map.ts

export interface BrokenLink {
  text: string;
  path: string;
  line: number;
  section: string;
  reason: 'NOT_FOUND' | 'PERMISSION_DENIED' | 'INVALID_PATH';
  suggestion: string; // Suggested fix
}

export interface IntegrityReport {
  totalLinks: number;
  brokenLinks: BrokenLink[];
  validLinks: number;
  integrity: number;    // 0-100%
}

export async function validateKnowledgeMap(
  rootDir: string = process.cwd()
): Promise<Result<IntegrityReport, ContextError>>
```

#### AGENTS.md Generation

```typescript
// src/context/generate.ts

export interface AgentsMapConfig {
  rootDir: string;
  includePaths: string[];    // Glob patterns to include
  excludePaths: string[];    // Glob patterns to exclude
  template?: string;         // Custom template path
  sections?: {
    name: string;
    pattern: string;         // What files to include
    description: string;
  }[];
}

export async function generateAgentsMap(
  config: AgentsMapConfig
): Promise<Result<string, ContextError>>
```

---

## 5. Module 3: Architectural Constraints

**Purpose**: Enforce layered dependencies and boundary validation.

### Core Features

1. **Layer Definitions** - Define architectural layers with dependencies
2. **Dependency Validation** - Check imports respect layer rules
3. **Circular Dependency Detection** - Detect dependency cycles
4. **Boundary Parsing** - Zod-based validation at module edges

### API Design

```typescript
// src/constraints/layers.ts
export interface Layer {
  name: string;
  allowedDependencies: string[];  // Other layer names
  modules: string[];              // File paths in this layer
}

export async function defineLayer(
  name: string,
  dependencies: string[]
): Promise<Result<Layer, ConstraintError>>

// src/constraints/dependencies.ts
export interface DependencyViolation {
  file: string;
  imports: string;
  reason: 'WRONG_LAYER' | 'CIRCULAR_DEP' | 'FORBIDDEN_IMPORT';
  suggestion: string;
}

export interface DependencyGraph {
  nodes: string[];          // Module paths
  edges: DependencyEdge[];  // Import relationships
}

export interface DependencyEdge {
  from: string;             // Importer file path
  to: string;               // Imported file path
  type: 'import' | 'require' | 'dynamic'; // Import mechanism
}

export interface DependencyValidation {
  valid: boolean;
  violations: DependencyViolation[];
  graph?: DependencyGraph;  // Optional: empty if parser unavailable and skipped
  skipped?: boolean;        // If parser unavailable and fallback: 'skip'
  reason?: string;          // Why skipped
}

export interface LayerConfig {
  layers: Layer[];
  rootDir: string;
  parser: LanguageParser;  // Abstraction for multi-language support
  fallbackBehavior?: 'skip' | 'error' | 'warn'; // Default: 'error'
}

export async function validateDependencies(
  config: LayerConfig
): Promise<Result<DependencyValidation, ConstraintError>>

// src/constraints/circular-deps.ts
export interface CircularDependency {
  cycle: string[];  // Path of the cycle
  severity: 'error' | 'warning';
}

export async function detectCircularDeps(
  modules: string[],
  parser: LanguageParser
): Promise<Result<CircularDependency[], ConstraintError>>

// src/constraints/boundary.ts
export interface BoundaryParser<T> {
  parse: (input: unknown) => Result<T, ConstraintError>;
  validate: (input: unknown) => Result<boolean, ConstraintError>;
}

export function createBoundarySchema<T>(
  schema: z.ZodSchema<T>
): BoundaryParser<T>
```

### Language Parser Abstraction

```typescript
// src/shared/parsers/base.ts

// Generic AST wrapper - language-agnostic structure
export interface AST {
  type: string;           // AST node type
  body: unknown;          // AST body (language-specific structure)
  raw?: unknown;          // Original language-specific AST
  language: string;       // Source language ('typescript', 'python', etc.)
}

export interface Location {
  file: string;
  line: number;
  column: number;
}

export interface Import {
  source: string;         // Import path (e.g., './module', '@pkg/lib')
  specifiers: string[];   // Named imports (e.g., ['foo', 'bar'])
  default?: string;       // Default import name (e.g., 'React')
  namespace?: string;     // Namespace import (e.g., 'fs' in import * as fs)
  location: Location;     // Where in file
}

export interface Export {
  name: string;           // Export name
  type: 'named' | 'default' | 'namespace';
  location: Location;
  isReExport?: boolean;   // Re-exported from another module
  source?: string;        // Source module if re-export
}

export interface ParseError extends BaseError {
  code: 'TIMEOUT' | 'SUBPROCESS_FAILED' | 'SYNTAX_ERROR' | 'NOT_FOUND' | 'PARSER_UNAVAILABLE';
  details: {
    exitCode?: number;
    stderr?: string;
    stdout?: string;
    path?: string;        // Optional when error is about parser availability
    parser?: string;      // Parser name when unavailable
  };
}

export interface LanguageParser {
  name: string;
  parseFile(path: string): Promise<Result<AST, ParseError>>;
  extractImports(ast: AST): Result<Import[], ParseError>;
  extractExports(ast: AST): Result<Export[], ParseError>;
  health(): Promise<Result<{ available: boolean; version?: string; message?: string }, ParseError>>;
}

// src/shared/parsers/typescript.ts
export class TypeScriptParser implements LanguageParser {
  name = 'typescript';
  // Uses @typescript-eslint/parser (in-process, fast)

  async health(): Promise<Result<{ available: true; version: string }, ParseError>> {
    // TypeScript parser is always available (in-process)
    return Ok({ available: true, version: '7.0.0' });
  }
}
```

### Health Check and Fallback Behavior

Language parsers may not be available in all environments (e.g., Python/Go parsers require runtime binaries). The health check pattern handles this gracefully:

```typescript
// Pattern: Check parser health before operations
export interface LayerConfig {
  layers: Layer[];
  rootDir: string;
  parser: LanguageParser;
  fallbackBehavior?: 'skip' | 'error' | 'warn'; // Default: 'error'
}

export async function validateDependencies(
  config: LayerConfig
): Promise<Result<DependencyValidation, ConstraintError>> {
  // Check parser availability first
  const health = await config.parser.health();

  if (!health.ok || !health.value.available) {
    const fallback = config.fallbackBehavior ?? 'error';

    if (fallback === 'skip') {
      // Skip validation, return success with note
      return Ok({
        valid: true,
        violations: [],
        skipped: true,
        reason: health.value?.message || 'Parser unavailable',
      });
    }

    if (fallback === 'warn') {
      // Log warning, return success
      console.warn(`Parser ${config.parser.name} unavailable, skipping validation`);
      return Ok({ valid: true, violations: [], skipped: true });
    }

    // Default: error
    return Err(createError(
      'PARSER_UNAVAILABLE',
      `Parser ${config.parser.name} is not available`,
      { parser: config.parser.name, reason: health.value?.message },
      ['Install required runtime', 'Use different parser', 'Set fallbackBehavior: "skip"']
    ));
  }

  // Parser available, proceed with validation
  // ... rest of implementation
}
```

**When to use each fallback behavior:**
- `error` (default): Fail fast if parser unavailable - ensures nothing is missed
- `skip`: CI environments where language runtime may not be installed
- `warn`: Development environments where partial validation is acceptable

---

## 6. Module 4: Entropy Management

**Purpose**: Detect documentation drift, dead code, and pattern violations.

### Core Features

1. **Documentation Drift Detection** - Docs that don't match implementation
2. **Pattern Violations** - Code that deviates from standards
3. **Dead Code Detection** - Unused files, exports, imports
4. **Auto-fix Utilities** - Automated fixes for common issues

### API Design

```typescript
// src/entropy/doc-drift.ts
export interface DocumentationDrift {
  file: string;
  docPath: string;
  issue: 'OUTDATED' | 'MISSING' | 'INCORRECT';
  details: string;
}

export interface DriftConfig {
  docsDir: string;
  codeDir: string;
  parser: LanguageParser;
}

export async function detectDocDrift(
  config: DriftConfig
): Promise<Result<{ drifts: DocumentationDrift[]; severity: 'high' | 'medium' | 'low' }, EntropyError>>

// src/entropy/patterns.ts
export interface Pattern {
  name: string;
  matcher: (file: string, ast: AST) => boolean;
  description: string;
  severity: 'error' | 'warning';
}

export interface PatternViolation {
  file: string;
  pattern: string;
  line?: number;
  details: string;
}

export async function findPatternViolations(
  rules: Pattern[],
  files: string[]
): Promise<Result<{ violations: PatternViolation[]; passRate: number }, EntropyError>>

// src/entropy/dead-code.ts
export interface DeadCodeConfig {
  entryPoints: string[];  // Starting points for analysis
  rootDir: string;
  parser: LanguageParser;
}

export async function detectDeadCode(
  config: DeadCodeConfig
): Promise<Result<{
  unusedFiles: string[];
  unusedExports: Export[];
  estimatedImpact: number;  // Lines of code
}, EntropyError>>

// src/entropy/types.ts
export interface EntropyReport {
  drift?: DriftReport;                        // Documentation drift findings
  patterns?: PatternViolationReport;          // Pattern violations
  deadCode?: DeadCodeReport;                  // Dead code findings
  overall: {
    severity: 'high' | 'medium' | 'low';
    issueCount: number;
    autoFixable: number;                      // How many issues can be auto-fixed
  };
}

// src/entropy/auto-fix.ts
export interface FixOptions {
  dryRun: boolean;
  autoCommit: boolean;
  fixTypes: ('unused-imports' | 'format-drift' | 'doc-sync')[];
}

export interface FixResult {
  filesChanged: string[];
  issuesFixed: number;
  remainingIssues: number;
}

export async function autoFixEntropy(
  report: EntropyReport,
  options: FixOptions
): Promise<Result<FixResult, EntropyError>>
```

**Implementation notes:**
- Doc drift: Compare AST exports to documented APIs
- Dead code: Build dependency graph from entry points, mark unreachable
- Auto-fix: Use AST transformations (simple fixes only)

---

## 7. Module 5: Agent Feedback

**Purpose**: Self-review, peer review, and telemetry integration.

### Core Features

1. **Self-Review Workflows** - Agent self-checks before human review
2. **Peer Review** - Request review from specialized agents
3. **Telemetry Integration** - Access metrics, traces, logs
4. **Agent Action Logging** - Observability for agent operations

### API Design

```typescript
// src/feedback/self-review.ts
export interface ReviewItem {
  check: string;
  passed: boolean;
  details: string;
  suggestion?: string;
}

export interface ReviewChecklist {
  items: ReviewItem[];
  passCount: number;
  failCount: number;
  warnings: string[];
}

export async function createSelfReview(
  changes: { files: string[]; diff: string }
): Promise<Result<ReviewChecklist, FeedbackError>>

// src/feedback/peer-review.ts
export interface AgentConfig {
  type: 'architecture-enforcer' | 'documentation-maintainer' | 'test-reviewer';
  context: ReviewContext;
  skills?: string[];        // Skills to load
  timeout?: number;         // Milliseconds, default 300000 (5 min)
  workingDir?: string;      // Working directory, default cwd
}

export interface AgentProcess {
  id: string;               // Unique process ID
  pid?: number;             // OS process ID if subprocess
  startTime: string;        // ISO 8601 timestamp
  config: AgentConfig;
}

export interface AgentStatus {
  id: string;
  state: 'running' | 'completed' | 'failed' | 'killed';
  progress?: number;        // 0-100
  currentTask?: string;     // Description of current task
  error?: string;           // Error message if failed
}

export interface ReviewContext {
  files: string[];
  diff: string;
  commitMessage: string;
  metadata: Record<string, unknown>;
}

export interface Review {
  approved: boolean;
  comments: ReviewComment[];
  suggestions: string[];
  agentId: string;
  duration: number;         // Milliseconds
}

export interface ReviewComment {
  file: string;
  line?: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
  suggestion?: string;
}

export interface AgentExecutor {
  spawn(config: AgentConfig): Promise<Result<AgentProcess, FeedbackError>>;
  status(processId: string): Promise<Result<AgentStatus, FeedbackError>>;
  kill(processId: string): Promise<Result<void, FeedbackError>>;
}

export async function requestPeerReview(
  agentType: 'architecture-enforcer' | 'documentation-maintainer' | 'test-reviewer',
  context: ReviewContext,
  executor: AgentExecutor
): Promise<Result<Review, FeedbackError>>

// src/feedback/telemetry.ts
export interface TimeRange {
  start: Date | string;     // ISO 8601 string or Date object
  end: Date | string;
}

export interface TelemetryFilter {
  level?: 'debug' | 'info' | 'warn' | 'error';
  labels?: Record<string, string>;
  query?: string;           // Query string (format depends on adapter)
}

export interface Metric {
  name: string;
  value: number;
  timestamp: string;        // ISO 8601
  labels: Record<string, string>;
  unit?: string;            // e.g., 'ms', 'bytes', 'count'
}

export interface Trace {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  service: string;
  operation: string;
  duration: number;         // Milliseconds
  timestamp: string;        // ISO 8601
  tags: Record<string, string>;
  status?: 'ok' | 'error';
}

export interface LogEntry {
  timestamp: string;        // ISO 8601
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  service: string;
  metadata: Record<string, unknown>;
}

export interface TelemetryAdapter {
  getMetrics(service: string, timeRange: TimeRange): Promise<Result<Metric[], FeedbackError>>;
  getTraces(service: string, traceId?: string): Promise<Result<Trace[], FeedbackError>>;
  getLogs(service: string, filter: TelemetryFilter): Promise<Result<LogEntry[], FeedbackError>>;
}

// Configuration pattern
let globalTelemetryAdapter: TelemetryAdapter | null = null;

export function configureTelemetry(adapter: TelemetryAdapter): void {
  globalTelemetryAdapter = adapter;
}

export function getTelemetryAdapter(): TelemetryAdapter {
  if (!globalTelemetryAdapter) {
    throw new Error('Telemetry not configured. Call configureTelemetry() first or use NoOpAdapter');
  }
  return globalTelemetryAdapter;
}

// src/feedback/logging.ts
export interface AgentAction {
  type: 'review' | 'enforce' | 'cleanup' | 'generate';
  agentId: string;
  timestamp: string;
  context: object;
  result: 'success' | 'failure' | 'partial';
  duration: number;
}

export function logAgentAction(action: AgentAction): Result<void, FeedbackError>
```

### Plugin Architecture

- `AgentExecutor`: Pluggable (SubprocessExecutor, CloudExecutor, NoOpExecutor)
- `TelemetryAdapter`: Pluggable (OpenTelemetryAdapter, NoOpAdapter, custom)
- Default implementations provided, users can provide custom

---

## 8. Integration & Release Strategy

### Module Integration

Each module exports through main `index.ts`:

```typescript
// src/index.ts
export * from './validation';
export * from './context';
export * from './constraints';
export * from './entropy';
export * from './feedback';
export * from './shared/result';
export * from './shared/errors';

// Re-export commonly used types
export type { Result, Ok, Err } from './shared/result';
export type { BaseError } from './shared/errors';
```

### Release Strategy (Semantic Versioning)

- **v0.1.0** - Validation module complete
- **v0.2.0** - Context module complete
- **v0.3.0** - Constraints module complete
- **v0.4.0** - Entropy module complete
- **v0.5.0** - Feedback module complete (Phase 2 done)
- **v1.0.0** - Production-ready (after battle-testing v0.5.0)

Each release includes:
- ✅ All tests passing (>80% coverage)
- ✅ Updated README with new APIs
- ✅ Examples in `/examples`
- ✅ Changelog entry

---

## 9. Testing Strategy

### Coverage Requirements

- **Unit tests:** >80% line coverage per module
- **Integration tests:** Test cross-module usage
- **Fixtures:** Real-world examples in `tests/fixtures/`
- **CI:** All tests run on every commit

### Test Structure

```typescript
// Example: tests/validation/file-structure.test.ts
describe('validateFileStructure', () => {
  it('should validate required files exist', async () => {
    const conventions: Convention[] = [
      {
        pattern: 'README.md',
        required: true,
        description: 'Project README',
        examples: ['README.md'],
      },
    ];

    const result = await validateFileStructure(conventions, './tests/fixtures/valid-project');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.valid).toBe(true);
      expect(result.value.conformance).toBe(100);
    }
  });

  it('should detect missing required files', async () => {
    const conventions: Convention[] = [
      {
        pattern: 'AGENTS.md',
        required: true,
        description: 'Knowledge map',
        examples: ['AGENTS.md'],
      },
    ];

    const result = await validateFileStructure(conventions, './tests/fixtures/missing-agents');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.valid).toBe(false);
      expect(result.value.missing).toContain('AGENTS.md');
    }
  });
});
```

---

## 10. Dependencies

### Core Dependencies

```json
{
  "dependencies": {
    "@harness-engineering/types": "workspace:*",
    "zod": "^3.22.0",
    "glob": "^10.3.0",
    "@typescript-eslint/parser": "^7.0.0",
    "@typescript-eslint/typescript-estree": "^7.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@vitest/coverage-v8": "^4.0.18",
    "@vitest/ui": "^4.0.18",
    "tsup": "^8.0.0",
    "vitest": "^4.0.18"
  }
}
```

### Module-Specific Dependencies

**Context Module:**
- No additional dependencies required for MVP (uses regex-based parsing)
- **Future consideration**: `remark-parse` and `unified` for robust markdown parsing if regex proves insufficient

**Constraints Module:**
- Uses `@typescript-eslint/parser` and `@typescript-eslint/typescript-estree` (listed in core dependencies)

**Entropy Module:**
- No additional dependencies (uses AST parsers from Constraints module)

**Feedback Module:**
- No additional dependencies (pluggable adapters have their own dependencies)

**All modules use shared dependencies** from `packages/types` and built-in Node.js APIs.

---

## Success Criteria

### Per-Module Completion Criteria

Each module is complete when:
1. ✅ All APIs implemented and exported
2. ✅ Test coverage >80% line coverage
3. ✅ All tests passing in CI
4. ✅ README updated with usage examples
5. ✅ Types fully documented (JSDoc comments)
6. ✅ No `any` types in public APIs
7. ✅ Version released to npm (0.X.0)

### Phase 2 Completion Criteria

Phase 2 is complete when:
1. ✅ All 5 modules meet individual completion criteria
2. ✅ Integration tests pass (modules work together)
3. ✅ Documentation site updated
4. ✅ At least one complete example using all modules
5. ✅ v0.5.0 released and stable for 2+ weeks

---

## Timeline Estimate

**Module-by-module breakdown** (assuming 1 developer, full-time):

| Module | Complexity | Estimated Time |
|--------|-----------|----------------|
| Validation | Low | 1-2 weeks |
| Context | Medium | 2-3 weeks |
| Constraints | High | 3-4 weeks |
| Entropy | High | 3-4 weeks |
| Feedback | Medium | 2-3 weeks |
| **Total** | | **11-16 weeks** |

**Optimistic scenario:** 8-10 weeks (if implementations go smoothly)
**Realistic scenario:** 12-14 weeks (accounting for unexpected issues)
**Conservative scenario:** 16-20 weeks (with significant learning/debugging)

---

## Next Steps

After this spec is approved:

1. **Create implementation plan** - Invoke `superpowers:writing-plans` to create detailed implementation plan
2. **Set up development environment** - Ensure all tools and dependencies are ready
3. **Begin Module 1 (Validation)** - Start with foundational utilities
4. **Release v0.1.0** - Ship first module, gather feedback
5. **Iterate through remaining modules** - Follow vertical slices approach

---

## Appendix: Design Rationale

### Why Vertical Slices?

1. **Aligns with harness engineering principles** - Depth-first, one feature to 100%
2. **Lower risk** - Each module is battle-tested before moving forward
3. **Incremental value** - Can release after each module
4. **Better for TDD** - Test-driven development works best with complete features
5. **Clearer progress tracking** - "Module 3 of 5" vs "80% done"

### Why Result<T, E> Pattern?

1. **Type-safe error handling** - No exceptions thrown from public APIs
2. **Explicit error cases** - Forces consumers to handle errors
3. **Better for agents** - Structured errors with suggestions
4. **Composable** - Easy to chain operations

### Why Pluggable Architecture for Feedback?

1. **Flexibility** - Teams can bring their own telemetry/agent systems
2. **No-op defaults** - Works out-of-box without external services
3. **Testing** - Easy to mock in tests
4. **Future-proof** - Can support new agent platforms without breaking changes

---

_Last Updated: 2026-03-11_

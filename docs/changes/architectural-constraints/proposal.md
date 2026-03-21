# Module 3: Architectural Constraints - Design Specification

**Date**: 2026-03-12
**Status**: Approved Design
**Author**: AI Harness Engineering Team
**Module**: Phase 2, Module 3 - Architectural Constraints

---

## Summary

Module 3 provides architectural constraint enforcement for TypeScript codebases. It validates layered architecture rules, detects circular dependencies, and provides runtime boundary validation using Zod schemas.

**Key capabilities:**

- Layer validation - Define allowed dependencies between architectural layers
- Dependency graph analysis - Build and analyze import relationships
- Circular dependency detection - Find cycles using Tarjan's SCC algorithm
- Boundary parsing - Runtime data validation at module boundaries

**Design decisions:**

- Full AST parsing using `@typescript-eslint/typescript-estree` for accurate import extraction
- Parser abstraction layer ready for future multi-language support
- Parser lives in `shared/parsers/` for reuse by Entropy module

---

## File Structure

```
packages/core/src/
├── shared/parsers/
│   ├── index.ts           # Parser exports
│   ├── base.ts            # LanguageParser interface + types
│   └── typescript.ts      # TypeScript parser implementation
└── constraints/
    ├── index.ts           # Public exports
    ├── types.ts           # Constraint-specific types
    ├── layers.ts          # Layer definitions
    ├── dependencies.ts    # Dependency graph + validation
    ├── circular-deps.ts   # Cycle detection
    └── boundary.ts        # Boundary schema validation

packages/core/tests/
└── constraints/
    ├── typescript-parser.test.ts
    ├── dependencies.test.ts
    ├── circular-deps.test.ts
    └── boundary.test.ts
```

---

## Parser Abstraction

### Interface (`shared/parsers/base.ts`)

```typescript
export interface AST {
  type: string;
  body: unknown;
  language: string;
}

export interface Location {
  file: string;
  line: number;
  column: number;
}

export interface Import {
  source: string; // './module' or '@pkg/lib'
  specifiers: string[]; // Named imports
  default?: string; // Default import name
  namespace?: string; // import * as X
  location: Location;
  kind: 'value' | 'type'; // Distinguish type-only imports
}

export interface Export {
  name: string;
  type: 'named' | 'default' | 'namespace';
  location: Location;
  isReExport: boolean;
  source?: string; // Re-export source
}

export interface ParseError extends BaseError {
  code: 'TIMEOUT' | 'SUBPROCESS_FAILED' | 'SYNTAX_ERROR' | 'NOT_FOUND' | 'PARSER_UNAVAILABLE';
  details: {
    exitCode?: number;
    stderr?: string;
    path?: string;
    parser?: string;
  };
}

export interface LanguageParser {
  name: string;
  extensions: string[]; // ['.ts', '.tsx']
  parseFile(path: string): Promise<Result<AST, ParseError>>;
  extractImports(ast: AST): Result<Import[], ParseError>;
  extractExports(ast: AST): Result<Export[], ParseError>;
  health(): Promise<Result<{ available: boolean; version?: string }, ParseError>>;
}
```

### TypeScript Parser (`shared/parsers/typescript.ts`)

```typescript
import { parse } from '@typescript-eslint/typescript-estree';

export class TypeScriptParser implements LanguageParser {
  name = 'typescript';
  extensions = ['.ts', '.tsx', '.mts', '.cts'];

  async parseFile(path: string): Promise<Result<AST, ParseError>> {
    const content = await readFileContent(path);
    if (!content.ok) return Err(createParseError('NOT_FOUND', path));

    try {
      const ast = parse(content.value, {
        loc: true,
        range: true,
        jsx: path.endsWith('.tsx'),
        errorOnUnknownASTType: false,
      });

      return Ok({ type: 'Program', body: ast, language: 'typescript' });
    } catch (e) {
      return Err(createParseError('SYNTAX_ERROR', path, e));
    }
  }

  extractImports(ast: AST): Result<Import[], ParseError> {
    // Walk AST for ImportDeclaration nodes
    // Handle: import X, { a, b }, * as ns from 'source'
    // Handle: import type { T } from 'source'
    // Handle: dynamic import('source')
  }

  extractExports(ast: AST): Result<Export[], ParseError> {
    // Walk AST for ExportNamedDeclaration, ExportDefaultDeclaration
    // Handle: export { a, b }, export default X
    // Handle: export * from 'source' (re-exports)
  }

  async health(): Promise<Result<{ available: boolean; version?: string }, ParseError>> {
    return Ok({ available: true, version: '7.0.0' });
  }
}
```

**AST walking strategy:**

```typescript
function walk(node: unknown, visitor: (node: TSESTree.Node) => void): void {
  if (!node || typeof node !== 'object') return;
  if ('type' in node) visitor(node as TSESTree.Node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach((v) => walk(v, visitor));
    else walk(value, visitor);
  }
}
```

**Import types handled:**

- `import x from 'y'` - default import
- `import { a, b } from 'y'` - named imports
- `import * as x from 'y'` - namespace import
- `import type { T } from 'y'` - type-only import (kind: 'type')
- `const x = await import('y')` - dynamic import

---

## Layer Definitions & Dependency Validation

### Types (`constraints/types.ts`)

```typescript
export interface Layer {
  name: string;
  patterns: string[]; // Glob patterns: ['src/services/**']
  allowedDependencies: string[]; // Layer names this layer can import from
}

export interface LayerConfig {
  layers: Layer[];
  rootDir: string;
  parser: LanguageParser;
  fallbackBehavior?: 'skip' | 'error' | 'warn'; // Default: 'error'
}

export interface DependencyEdge {
  from: string; // Importer file path
  to: string; // Imported file/module
  importType: 'static' | 'dynamic' | 'type-only';
  line: number;
}

export interface DependencyGraph {
  nodes: string[]; // All file paths
  edges: DependencyEdge[]; // Import relationships
}

export interface DependencyViolation {
  file: string;
  imports: string;
  fromLayer: string;
  toLayer: string;
  reason: 'WRONG_LAYER' | 'CIRCULAR_DEP' | 'FORBIDDEN_IMPORT';
  line: number;
  suggestion: string;
}

export interface DependencyValidation {
  valid: boolean;
  violations: DependencyViolation[];
  graph: DependencyGraph;
  skipped?: boolean;
  reason?: string;
}
```

### API (`constraints/dependencies.ts`)

```typescript
/**
 * Validate dependencies against layer rules
 */
export async function validateDependencies(
  config: LayerConfig
): Promise<Result<DependencyValidation, ConstraintError>>;

/**
 * Define a layer (convenience function)
 */
export function defineLayer(name: string, patterns: string[], allowedDependencies: string[]): Layer;

// Internal helpers:
function resolveFileToLayer(file: string, layers: Layer[]): Layer | undefined;
function buildDependencyGraph(files: string[], parser: LanguageParser): Promise<DependencyGraph>;
function checkLayerViolations(graph: DependencyGraph, layers: Layer[]): DependencyViolation[];
```

### Usage Example

```typescript
import { validateDependencies, defineLayer, TypeScriptParser } from '@harness-engineering/core';

const result = await validateDependencies({
  layers: [
    defineLayer('domain', ['src/domain/**'], []),
    defineLayer('services', ['src/services/**'], ['domain']),
    defineLayer('api', ['src/api/**'], ['services', 'domain']),
  ],
  rootDir: './src',
  parser: new TypeScriptParser(),
});

if (result.ok && !result.value.valid) {
  for (const violation of result.value.violations) {
    console.log(`${violation.file}:${violation.line} - ${violation.reason}`);
    console.log(`  ${violation.fromLayer} cannot import from ${violation.toLayer}`);
    console.log(`  Suggestion: ${violation.suggestion}`);
  }
}
```

---

## Circular Dependency Detection

### Algorithm

Uses Tarjan's Strongly Connected Components (SCC) algorithm - O(V+E) complexity. Any SCC with more than one node represents a circular dependency.

### Types

```typescript
export interface CircularDependency {
  cycle: string[]; // File paths forming the cycle
  severity: 'error' | 'warning';
  size: number; // Number of files in cycle
}

export interface CircularDepsResult {
  hasCycles: boolean;
  cycles: CircularDependency[];
  largestCycle: number; // Size of biggest cycle (0 if none)
}
```

### API (`constraints/circular-deps.ts`)

```typescript
/**
 * Detect circular dependencies in a dependency graph
 * Uses Tarjan's SCC algorithm for O(V+E) detection
 */
export function detectCircularDeps(
  graph: DependencyGraph
): Result<CircularDepsResult, ConstraintError>;

/**
 * Standalone detection from file list
 */
export async function detectCircularDepsInFiles(
  files: string[],
  parser: LanguageParser
): Promise<Result<CircularDepsResult, ConstraintError>>;
```

### Integration

The main `validateDependencies` function will:

1. Build the dependency graph
2. Check layer violations
3. Run circular dependency detection
4. Return combined violations (cycles appear as `reason: 'CIRCULAR_DEP'`)

### Example Output

```typescript
{
  hasCycles: true,
  cycles: [
    {
      cycle: ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/a.ts'],
      severity: 'error',
      size: 3
    }
  ],
  largestCycle: 3
}
```

---

## Boundary Parsing

### Purpose

Validate data at module boundaries using Zod schemas. Ensures data crossing layer boundaries conforms to expected types at runtime.

### Types

```typescript
export interface BoundaryDefinition {
  name: string; // e.g., 'UserService.createUser'
  layer: string; // Which layer this boundary belongs to
  schema: z.ZodSchema<unknown>; // Zod schema for validation
  direction: 'input' | 'output'; // Validate inputs or outputs
}

export interface BoundaryViolation {
  boundary: string;
  direction: 'input' | 'output';
  error: z.ZodError;
  data: unknown;
}

export interface BoundaryValidation {
  valid: boolean;
  violations: BoundaryViolation[];
}

export interface BoundaryValidator<T> {
  name: string;
  parse(input: unknown): Result<T, ConstraintError>;
  validate(input: unknown): Result<boolean, ConstraintError>;
  schema: z.ZodSchema<T>;
}
```

### API (`constraints/boundary.ts`)

```typescript
/**
 * Create a boundary validator from a Zod schema
 */
export function createBoundaryValidator<T>(
  schema: z.ZodSchema<T>,
  name: string
): BoundaryValidator<T>;

/**
 * Validate multiple boundaries at once
 */
export function validateBoundaries(
  boundaries: BoundaryDefinition[],
  data: Map<string, unknown>
): Result<BoundaryValidation, ConstraintError>;
```

### Usage Example

```typescript
import { z } from 'zod';
import { createBoundaryValidator } from '@harness-engineering/core';

const UserInputSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
});

const userValidator = createBoundaryValidator(UserInputSchema, 'UserService.createUser');

// At runtime:
const result = userValidator.parse(requestBody);
if (result.ok) {
  // result.value is typed as { email: string; name: string }
  createUser(result.value);
} else {
  // result.error has Zod details + suggestions
  console.error(result.error.suggestions);
}
```

---

## Public API

### Exports (`constraints/index.ts`)

```typescript
// Layer validation
export { defineLayer, validateDependencies } from './dependencies';

// Circular dependency detection
export { detectCircularDeps, detectCircularDepsInFiles } from './circular-deps';

// Boundary validation
export { createBoundaryValidator, validateBoundaries } from './boundary';

// Types
export type {
  Layer,
  LayerConfig,
  DependencyEdge,
  DependencyGraph,
  DependencyViolation,
  DependencyValidation,
  CircularDependency,
  CircularDepsResult,
  BoundaryDefinition,
  BoundaryValidator,
  BoundaryViolation,
  BoundaryValidation,
} from './types';
```

### Main Entry Point Update

```typescript
// src/index.ts additions:

// Constraints module
export * from './constraints';

// Parsers (for users who need direct parser access)
export { TypeScriptParser } from './shared/parsers';
export type { LanguageParser, AST, Import, Export } from './shared/parsers';

// Package version
export const VERSION = '0.3.0';
```

---

## Testing Strategy

| Component           | Test Approach                                        |
| ------------------- | ---------------------------------------------------- |
| TypeScript Parser   | Parse fixture files, verify import/export extraction |
| Layer Validation    | Mock parser, test violation detection logic          |
| Circular Deps       | Graph fixtures with known cycles, verify detection   |
| Boundary Validation | Zod schema tests, valid/invalid data                 |

### Test Fixtures

```
tests/fixtures/
├── layer-violations/        # Files with cross-layer imports
├── circular-deps/           # A→B→C→A cycle
├── valid-layers/            # Clean layered architecture
└── typescript-samples/      # Various import/export patterns
```

### Coverage Requirements

- Unit tests: >80% line coverage per file
- Integration tests: Cross-component validation flows
- All tests run in CI on every commit

---

## Dependencies

**New dependencies:**

- `@typescript-eslint/typescript-estree` ^7.0.0 - TypeScript AST parsing

**Existing dependencies used:**

- `zod` ^3.22.0 - Boundary schema validation
- `glob` ^10.3.0 - File pattern matching

---

## Success Criteria

Module 3 is complete when:

- [ ] All APIs implemented and exported
- [ ] Test coverage >80% for all files
- [ ] All tests passing in CI
- [ ] TypeScript compiles without errors
- [ ] README updated with usage examples
- [ ] CHANGELOG documents all changes
- [ ] Version set to 0.3.0
- [ ] Release tagged: `@harness-engineering/core@0.3.0`

---

## Spec Deviations from Phase 2 Design

These are intentional improvements discovered during detailed design:

1. **Parser in `shared/`** - Moved from `constraints/` to `shared/parsers/` for reuse by Entropy module
2. **`extensions` field on parser** - Added to help file discovery
3. **`kind` field on Import** - Added to distinguish type-only imports
4. **`importType` on DependencyEdge** - Added to track static vs dynamic imports
5. **Standalone `detectCircularDepsInFiles`** - Added convenience function

---

_Last Updated: 2026-03-12_

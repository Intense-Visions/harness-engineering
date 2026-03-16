# Module 3: Architectural Constraints - Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Architectural Constraints module providing layer validation, dependency graph analysis, circular dependency detection, and boundary parsing.

**Architecture:** Third module building on validation and context foundations. Introduces a parser abstraction layer in `shared/parsers/` for reuse by future modules. Uses `@typescript-eslint/typescript-estree` for AST parsing. Tarjan's SCC algorithm for cycle detection. All operations return `Result<T, ConstraintError>` using the established pattern.

**Tech Stack:** TypeScript 5+, Vitest 4+, @typescript-eslint/typescript-estree ^7.0.0, zod ^3.22.0, glob ^10.3.0

---

## File Structure Overview

This plan creates/modifies these files:

**Parser Abstraction (shared/parsers/):**

- `packages/core/src/shared/parsers/base.ts` - LanguageParser interface and types
- `packages/core/src/shared/parsers/typescript.ts` - TypeScript parser implementation
- `packages/core/src/shared/parsers/index.ts` - Parser exports

**Constraints Module:**

- `packages/core/src/constraints/types.ts` - Constraint-specific types
- `packages/core/src/constraints/layers.ts` - Layer definitions
- `packages/core/src/constraints/dependencies.ts` - Dependency graph + validation
- `packages/core/src/constraints/circular-deps.ts` - Cycle detection
- `packages/core/src/constraints/boundary.ts` - Boundary schema validation
- `packages/core/src/constraints/index.ts` - Public exports

**Tests:**

- `packages/core/tests/shared/parsers/typescript-parser.test.ts` (deviation from spec: tests mirror source structure)
- `packages/core/tests/constraints/layers.test.ts`
- `packages/core/tests/constraints/dependencies.test.ts`
- `packages/core/tests/constraints/circular-deps.test.ts`
- `packages/core/tests/constraints/boundary.test.ts`

**Test Fixtures:**

- `packages/core/tests/fixtures/typescript-samples/` - Various import/export patterns
- `packages/core/tests/fixtures/layer-violations/` - Cross-layer import violations
- `packages/core/tests/fixtures/circular-deps/` - A→B→C→A cycle
- `packages/core/tests/fixtures/valid-layers/` - Clean layered architecture

---

## Chunk 1: Parser Abstraction Layer

### Task 1: Parser Base Types

**Files:**

- Create: `packages/core/src/shared/parsers/base.ts`

- [ ] **Step 1: Create parser types file**

```typescript
// packages/core/src/shared/parsers/base.ts
import type { Result } from '../result';
import type { BaseError } from '../errors';

/**
 * Generic AST wrapper - language-agnostic structure
 */
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

export interface HealthCheckResult {
  available: boolean;
  version?: string;
  message?: string;
}

export interface LanguageParser {
  name: string;
  extensions: string[];
  parseFile(path: string): Promise<Result<AST, ParseError>>;
  extractImports(ast: AST): Result<Import[], ParseError>;
  extractExports(ast: AST): Result<Export[], ParseError>;
  health(): Promise<Result<HealthCheckResult, ParseError>>;
}

/**
 * Create a ParseError with standard structure
 */
export function createParseError(
  code: ParseError['code'],
  message: string,
  details: ParseError['details'] = {},
  suggestions: string[] = []
): ParseError {
  return { code, message, details, suggestions };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd packages/core && pnpm typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/shared/parsers/base.ts
git commit -m "feat(core): add parser abstraction types"
```

---

### Task 2: TypeScript Parser - File Parsing

**Files:**

- Create: `packages/core/src/shared/parsers/typescript.ts`
- Create: `packages/core/tests/shared/parsers/typescript-parser.test.ts`
- Create: `packages/core/tests/fixtures/typescript-samples/simple.ts`

- [ ] **Step 1: Install typescript-estree dependency**

Run: `cd packages/core && pnpm add @typescript-eslint/typescript-estree@^7.0.0`
Expected: Package added to package.json

- [ ] **Step 2: Create test fixture**

```bash
mkdir -p packages/core/tests/fixtures/typescript-samples
```

```typescript
// packages/core/tests/fixtures/typescript-samples/simple.ts
import fs from 'fs';
import { join, resolve } from 'path';
import type { Stats } from 'fs';

export const VERSION = '1.0.0';
export function helper() {
  return true;
}
export default function main() {
  return 'main';
}
```

- [ ] **Step 3: Write failing test for parseFile**

```typescript
// packages/core/tests/shared/parsers/typescript-parser.test.ts
import { describe, it, expect } from 'vitest';
import { TypeScriptParser } from '../../../src/shared/parsers/typescript';
import { join } from 'path';

describe('TypeScriptParser', () => {
  const parser = new TypeScriptParser();
  const fixturesDir = join(__dirname, '../../fixtures/typescript-samples');

  describe('parseFile', () => {
    it('should parse a valid TypeScript file', async () => {
      const path = join(fixturesDir, 'simple.ts');
      const result = await parser.parseFile(path);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.type).toBe('Program');
        expect(result.value.language).toBe('typescript');
        expect(result.value.body).toBeDefined();
      }
    });

    it('should return error for non-existent file', async () => {
      const path = join(fixturesDir, 'does-not-exist.ts');
      const result = await parser.parseFile(path);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('health', () => {
    it('should report parser as available', async () => {
      const result = await parser.health();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.available).toBe(true);
      }
    });
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd packages/core && pnpm test typescript-parser.test.ts`
Expected: FAIL - "Cannot find module '../../../src/shared/parsers/typescript'"

- [ ] **Step 5: Implement TypeScriptParser parseFile and health**

```typescript
// packages/core/src/shared/parsers/typescript.ts
import { parse } from '@typescript-eslint/typescript-estree';
import type { Result } from '../result';
import { Ok, Err } from '../result';
import { readFileContent } from '../fs-utils';
import type { AST, Import, Export, ParseError, LanguageParser, HealthCheckResult } from './base';
import { createParseError } from './base';

export class TypeScriptParser implements LanguageParser {
  name = 'typescript';
  extensions = ['.ts', '.tsx', '.mts', '.cts'];

  async parseFile(path: string): Promise<Result<AST, ParseError>> {
    const contentResult = await readFileContent(path);
    if (!contentResult.ok) {
      return Err(
        createParseError('NOT_FOUND', `File not found: ${path}`, { path }, [
          'Check that the file exists',
          'Verify the path is correct',
        ])
      );
    }

    try {
      const ast = parse(contentResult.value, {
        loc: true,
        range: true,
        jsx: path.endsWith('.tsx'),
        errorOnUnknownASTType: false,
      });

      return Ok({
        type: 'Program',
        body: ast,
        language: 'typescript',
      });
    } catch (e) {
      const error = e as Error;
      return Err(
        createParseError('SYNTAX_ERROR', `Failed to parse ${path}: ${error.message}`, { path }, [
          'Check for syntax errors in the file',
          'Ensure valid TypeScript syntax',
        ])
      );
    }
  }

  extractImports(_ast: AST): Result<Import[], ParseError> {
    // Placeholder - will implement in next task
    return Ok([]);
  }

  extractExports(_ast: AST): Result<Export[], ParseError> {
    // Placeholder - will implement in next task
    return Ok([]);
  }

  async health(): Promise<Result<HealthCheckResult, ParseError>> {
    return Ok({ available: true, version: '7.0.0' });
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd packages/core && pnpm test typescript-parser.test.ts`
Expected: PASS - 3 tests passed

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/shared/parsers/typescript.ts packages/core/tests/shared/parsers/typescript-parser.test.ts packages/core/tests/fixtures/typescript-samples/
git commit -m "feat(core): implement TypeScript parser file parsing"
```

---

### Task 3: TypeScript Parser - Import Extraction

**Files:**

- Modify: `packages/core/src/shared/parsers/typescript.ts`
- Modify: `packages/core/tests/shared/parsers/typescript-parser.test.ts`
- Create: `packages/core/tests/fixtures/typescript-samples/imports.ts`

- [ ] **Step 1: Create import test fixture**

```typescript
// packages/core/tests/fixtures/typescript-samples/imports.ts
// Default import
import fs from 'fs';

// Named imports
import { join, resolve } from 'path';

// Namespace import
import * as os from 'os';

// Type-only import
import type { Stats } from 'fs';

// Mixed import (default + named)
import React, { useState, useEffect } from 'react';

// Side-effect import
import './styles.css';

// Dynamic import (in function)
async function loadModule() {
  const mod = await import('./dynamic-module');
  return mod;
}

export {};
```

- [ ] **Step 2: Write failing tests for extractImports**

```typescript
// Add to packages/core/tests/shared/parsers/typescript-parser.test.ts

describe('extractImports', () => {
  it('should extract default imports', async () => {
    const path = join(fixturesDir, 'imports.ts');
    const parseResult = await parser.parseFile(path);
    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;

    const result = parser.extractImports(parseResult.value);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const fsImport = result.value.find((i) => i.source === 'fs');
    expect(fsImport).toBeDefined();
    expect(fsImport?.default).toBe('fs');
    expect(fsImport?.kind).toBe('value');
  });

  it('should extract named imports', async () => {
    const path = join(fixturesDir, 'imports.ts');
    const parseResult = await parser.parseFile(path);
    if (!parseResult.ok) return;

    const result = parser.extractImports(parseResult.value);
    if (!result.ok) return;

    const pathImport = result.value.find((i) => i.source === 'path');
    expect(pathImport).toBeDefined();
    expect(pathImport?.specifiers).toContain('join');
    expect(pathImport?.specifiers).toContain('resolve');
  });

  it('should extract namespace imports', async () => {
    const path = join(fixturesDir, 'imports.ts');
    const parseResult = await parser.parseFile(path);
    if (!parseResult.ok) return;

    const result = parser.extractImports(parseResult.value);
    if (!result.ok) return;

    const osImport = result.value.find((i) => i.source === 'os');
    expect(osImport).toBeDefined();
    expect(osImport?.namespace).toBe('os');
  });

  it('should identify type-only imports', async () => {
    const path = join(fixturesDir, 'imports.ts');
    const parseResult = await parser.parseFile(path);
    if (!parseResult.ok) return;

    const result = parser.extractImports(parseResult.value);
    if (!result.ok) return;

    const typeImports = result.value.filter((i) => i.kind === 'type');
    expect(typeImports.length).toBeGreaterThan(0);
    expect(typeImports.some((i) => i.specifiers.includes('Stats'))).toBe(true);
  });

  it('should include location information', async () => {
    const path = join(fixturesDir, 'imports.ts');
    const parseResult = await parser.parseFile(path);
    if (!parseResult.ok) return;

    const result = parser.extractImports(parseResult.value);
    if (!result.ok) return;

    const firstImport = result.value[0];
    expect(firstImport.location.line).toBeGreaterThan(0);
    expect(firstImport.location.column).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd packages/core && pnpm test typescript-parser.test.ts`
Expected: FAIL - extractImports returns empty array

- [ ] **Step 4: Implement extractImports with AST walking**

```typescript
// Update packages/core/src/shared/parsers/typescript.ts
// Add at top of file after imports:
import type { TSESTree } from '@typescript-eslint/typescript-estree';

// Add helper function before class:
function walk(node: unknown, visitor: (node: TSESTree.Node) => void): void {
  if (!node || typeof node !== 'object') return;
  if ('type' in node) {
    visitor(node as TSESTree.Node);
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      value.forEach(v => walk(v, visitor));
    } else {
      walk(value, visitor);
    }
  }
}

// Replace extractImports method in TypeScriptParser class:
extractImports(ast: AST): Result<Import[], ParseError> {
  const imports: Import[] = [];
  const program = ast.body as TSESTree.Program;

  walk(program, (node) => {
    if (node.type === 'ImportDeclaration') {
      const importDecl = node as TSESTree.ImportDeclaration;
      const imp: Import = {
        source: importDecl.source.value as string,
        specifiers: [],
        location: {
          file: '',
          line: importDecl.loc?.start.line ?? 0,
          column: importDecl.loc?.start.column ?? 0,
        },
        kind: importDecl.importKind === 'type' ? 'type' : 'value',
      };

      for (const spec of importDecl.specifiers) {
        if (spec.type === 'ImportDefaultSpecifier') {
          imp.default = spec.local.name;
        } else if (spec.type === 'ImportNamespaceSpecifier') {
          imp.namespace = spec.local.name;
        } else if (spec.type === 'ImportSpecifier') {
          imp.specifiers.push(spec.local.name);
          // Check if this specific import is type-only
          if (spec.importKind === 'type') {
            imp.kind = 'type';
          }
        }
      }

      imports.push(imp);
    }

    // Handle dynamic imports
    if (node.type === 'ImportExpression') {
      const importExpr = node as TSESTree.ImportExpression;
      if (importExpr.source.type === 'Literal' && typeof importExpr.source.value === 'string') {
        imports.push({
          source: importExpr.source.value,
          specifiers: [],
          location: {
            file: '',
            line: importExpr.loc?.start.line ?? 0,
            column: importExpr.loc?.start.column ?? 0,
          },
          kind: 'value',
        });
      }
    }
  });

  return Ok(imports);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/core && pnpm test typescript-parser.test.ts`
Expected: PASS - All tests passed

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/shared/parsers/typescript.ts packages/core/tests/shared/parsers/typescript-parser.test.ts packages/core/tests/fixtures/typescript-samples/imports.ts
git commit -m "feat(core): implement TypeScript import extraction"
```

---

### Task 4: TypeScript Parser - Export Extraction

**Files:**

- Modify: `packages/core/src/shared/parsers/typescript.ts`
- Modify: `packages/core/tests/shared/parsers/typescript-parser.test.ts`
- Create: `packages/core/tests/fixtures/typescript-samples/exports.ts`

- [ ] **Step 1: Create export test fixture**

```typescript
// packages/core/tests/fixtures/typescript-samples/exports.ts
// Named exports
export const VERSION = '1.0.0';
export function helper() {
  return true;
}
export class Service {}

// Default export
export default function main() {
  return 'main';
}

// Re-exports
export { join, resolve } from 'path';
export * from 'fs';
export * as utils from './utils';

// Export list
const a = 1;
const b = 2;
export { a, b };
```

- [ ] **Step 2: Write failing tests for extractExports**

```typescript
// Add to packages/core/tests/shared/parsers/typescript-parser.test.ts

describe('extractExports', () => {
  it('should extract named exports', async () => {
    const path = join(fixturesDir, 'exports.ts');
    const parseResult = await parser.parseFile(path);
    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;

    const result = parser.extractExports(parseResult.value);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const namedExports = result.value.filter((e) => e.type === 'named');
    expect(namedExports.some((e) => e.name === 'VERSION')).toBe(true);
    expect(namedExports.some((e) => e.name === 'helper')).toBe(true);
    expect(namedExports.some((e) => e.name === 'Service')).toBe(true);
  });

  it('should extract default export', async () => {
    const path = join(fixturesDir, 'exports.ts');
    const parseResult = await parser.parseFile(path);
    if (!parseResult.ok) return;

    const result = parser.extractExports(parseResult.value);
    if (!result.ok) return;

    const defaultExport = result.value.find((e) => e.type === 'default');
    expect(defaultExport).toBeDefined();
  });

  it('should identify re-exports', async () => {
    const path = join(fixturesDir, 'exports.ts');
    const parseResult = await parser.parseFile(path);
    if (!parseResult.ok) return;

    const result = parser.extractExports(parseResult.value);
    if (!result.ok) return;

    const reExports = result.value.filter((e) => e.isReExport);
    expect(reExports.length).toBeGreaterThan(0);
    expect(reExports.some((e) => e.source === 'path')).toBe(true);
  });

  it('should extract namespace re-exports', async () => {
    const path = join(fixturesDir, 'exports.ts');
    const parseResult = await parser.parseFile(path);
    if (!parseResult.ok) return;

    const result = parser.extractExports(parseResult.value);
    if (!result.ok) return;

    const namespaceExports = result.value.filter((e) => e.type === 'namespace');
    expect(namespaceExports.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd packages/core && pnpm test typescript-parser.test.ts`
Expected: FAIL - extractExports returns empty array

- [ ] **Step 4: Implement extractExports**

```typescript
// Replace extractExports method in packages/core/src/shared/parsers/typescript.ts

extractExports(ast: AST): Result<Export[], ParseError> {
  const exports: Export[] = [];
  const program = ast.body as TSESTree.Program;

  walk(program, (node) => {
    // Named export declarations: export const x = ...
    if (node.type === 'ExportNamedDeclaration') {
      const exportDecl = node as TSESTree.ExportNamedDeclaration;

      // Re-export: export { a, b } from 'source'
      if (exportDecl.source) {
        for (const spec of exportDecl.specifiers) {
          if (spec.type === 'ExportSpecifier') {
            exports.push({
              name: spec.exported.type === 'Identifier' ? spec.exported.name : String(spec.exported.value),
              type: 'named',
              location: {
                file: '',
                line: exportDecl.loc?.start.line ?? 0,
                column: exportDecl.loc?.start.column ?? 0,
              },
              isReExport: true,
              source: exportDecl.source.value as string,
            });
          }
        }
        return;
      }

      // Direct declaration: export const x = ...
      if (exportDecl.declaration) {
        const decl = exportDecl.declaration;
        if (decl.type === 'VariableDeclaration') {
          for (const declarator of decl.declarations) {
            if (declarator.id.type === 'Identifier') {
              exports.push({
                name: declarator.id.name,
                type: 'named',
                location: {
                  file: '',
                  line: decl.loc?.start.line ?? 0,
                  column: decl.loc?.start.column ?? 0,
                },
                isReExport: false,
              });
            }
          }
        } else if (decl.type === 'FunctionDeclaration' || decl.type === 'ClassDeclaration') {
          if (decl.id) {
            exports.push({
              name: decl.id.name,
              type: 'named',
              location: {
                file: '',
                line: decl.loc?.start.line ?? 0,
                column: decl.loc?.start.column ?? 0,
              },
              isReExport: false,
            });
          }
        }
      }

      // Export list: export { a, b }
      for (const spec of exportDecl.specifiers) {
        if (spec.type === 'ExportSpecifier') {
          exports.push({
            name: spec.exported.type === 'Identifier' ? spec.exported.name : String(spec.exported.value),
            type: 'named',
            location: {
              file: '',
              line: exportDecl.loc?.start.line ?? 0,
              column: exportDecl.loc?.start.column ?? 0,
            },
            isReExport: false,
          });
        }
      }
    }

    // Default export: export default ...
    if (node.type === 'ExportDefaultDeclaration') {
      const exportDecl = node as TSESTree.ExportDefaultDeclaration;
      exports.push({
        name: 'default',
        type: 'default',
        location: {
          file: '',
          line: exportDecl.loc?.start.line ?? 0,
          column: exportDecl.loc?.start.column ?? 0,
        },
        isReExport: false,
      });
    }

    // Namespace re-export: export * from 'source' or export * as name from 'source'
    if (node.type === 'ExportAllDeclaration') {
      const exportDecl = node as TSESTree.ExportAllDeclaration;
      exports.push({
        name: exportDecl.exported?.name ?? '*',
        type: 'namespace',
        location: {
          file: '',
          line: exportDecl.loc?.start.line ?? 0,
          column: exportDecl.loc?.start.column ?? 0,
        },
        isReExport: true,
        source: exportDecl.source.value as string,
      });
    }
  });

  return Ok(exports);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/core && pnpm test typescript-parser.test.ts`
Expected: PASS - All tests passed

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/shared/parsers/typescript.ts packages/core/tests/shared/parsers/typescript-parser.test.ts packages/core/tests/fixtures/typescript-samples/exports.ts
git commit -m "feat(core): implement TypeScript export extraction"
```

---

### Task 5: Parser Module Exports

**Files:**

- Create: `packages/core/src/shared/parsers/index.ts`

- [ ] **Step 1: Create parser index file**

```typescript
// packages/core/src/shared/parsers/index.ts
export { TypeScriptParser } from './typescript';
export type {
  AST,
  Location,
  Import,
  Export,
  ParseError,
  HealthCheckResult,
  LanguageParser,
} from './base';
export { createParseError } from './base';
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd packages/core && pnpm typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/shared/parsers/index.ts
git commit -m "feat(core): add parser module exports"
```

---

## Chunk 2: Constraints Types and Layer Definitions

### Task 6: Constraints Module Types

**Files:**

- Create: `packages/core/src/constraints/types.ts`

- [ ] **Step 1: Create constraints types file**

```typescript
// packages/core/src/constraints/types.ts
import type { z } from 'zod';
import type { LanguageParser } from '../shared/parsers';

// Layer Types
export interface Layer {
  name: string;
  patterns: string[];
  allowedDependencies: string[];
}

export interface LayerConfig {
  layers: Layer[];
  rootDir: string;
  parser: LanguageParser;
  fallbackBehavior?: 'skip' | 'error' | 'warn';
}

// Dependency Graph Types
export interface DependencyEdge {
  from: string;
  to: string;
  importType: 'static' | 'dynamic' | 'type-only';
  line: number;
}

export interface DependencyGraph {
  nodes: string[];
  edges: DependencyEdge[];
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

// Circular Dependency Types
export interface CircularDependency {
  cycle: string[];
  severity: 'error' | 'warning';
  size: number;
}

export interface CircularDepsResult {
  hasCycles: boolean;
  cycles: CircularDependency[];
  largestCycle: number;
}

// Boundary Types
export interface BoundaryDefinition {
  name: string;
  layer: string;
  schema: z.ZodSchema<unknown>;
  direction: 'input' | 'output';
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
  parse(
    input: unknown
  ): import('../shared/result').Result<T, import('../shared/errors').ConstraintError>;
  validate(
    input: unknown
  ): import('../shared/result').Result<boolean, import('../shared/errors').ConstraintError>;
  schema: z.ZodSchema<T>;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd packages/core && pnpm typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/constraints/types.ts
git commit -m "feat(core): add constraints module types"
```

---

### Task 7: Layer Definitions

**Files:**

- Create: `packages/core/src/constraints/layers.ts`
- Create: `packages/core/tests/constraints/layers.test.ts`

- [ ] **Step 1: Write failing test for defineLayer**

```typescript
// packages/core/tests/constraints/layers.test.ts
import { describe, it, expect } from 'vitest';
import { defineLayer, resolveFileToLayer } from '../../src/constraints/layers';
import type { Layer } from '../../src/constraints/types';

describe('defineLayer', () => {
  it('should create a layer with all properties', () => {
    const layer = defineLayer('domain', ['src/domain/**'], []);

    expect(layer.name).toBe('domain');
    expect(layer.patterns).toEqual(['src/domain/**']);
    expect(layer.allowedDependencies).toEqual([]);
  });

  it('should create a layer with dependencies', () => {
    const layer = defineLayer('services', ['src/services/**'], ['domain']);

    expect(layer.allowedDependencies).toEqual(['domain']);
  });
});

describe('resolveFileToLayer', () => {
  const layers: Layer[] = [
    { name: 'domain', patterns: ['src/domain/**'], allowedDependencies: [] },
    { name: 'services', patterns: ['src/services/**'], allowedDependencies: ['domain'] },
    { name: 'api', patterns: ['src/api/**'], allowedDependencies: ['services', 'domain'] },
  ];

  it('should resolve file to correct layer', () => {
    const layer = resolveFileToLayer('src/domain/user.ts', layers);
    expect(layer?.name).toBe('domain');
  });

  it('should resolve nested file to correct layer', () => {
    const layer = resolveFileToLayer('src/services/auth/login.ts', layers);
    expect(layer?.name).toBe('services');
  });

  it('should return undefined for file not in any layer', () => {
    const layer = resolveFileToLayer('src/utils/helpers.ts', layers);
    expect(layer).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm test layers.test.ts`
Expected: FAIL - "Cannot find module '../../src/constraints/layers'"

- [ ] **Step 3: Implement defineLayer and resolveFileToLayer**

```typescript
// packages/core/src/constraints/layers.ts
import { minimatch } from 'glob';
import type { Layer } from './types';

/**
 * Create a layer definition
 */
export function defineLayer(
  name: string,
  patterns: string[],
  allowedDependencies: string[]
): Layer {
  return {
    name,
    patterns,
    allowedDependencies,
  };
}

/**
 * Resolve a file path to its layer
 */
export function resolveFileToLayer(file: string, layers: Layer[]): Layer | undefined {
  for (const layer of layers) {
    for (const pattern of layer.patterns) {
      if (minimatch(file, pattern)) {
        return layer;
      }
    }
  }
  return undefined;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && pnpm test layers.test.ts`
Expected: PASS - All tests passed

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/constraints/layers.ts packages/core/tests/constraints/layers.test.ts
git commit -m "feat(core): implement layer definitions"
```

---

## Chunk 3: Dependency Graph and Validation

### Task 8: Dependency Graph Building

**Files:**

- Create: `packages/core/src/constraints/dependencies.ts`
- Create: `packages/core/tests/constraints/dependencies.test.ts`
- Create: `packages/core/tests/fixtures/valid-layers/`

- [ ] **Step 1: Create valid-layers test fixture**

```bash
mkdir -p packages/core/tests/fixtures/valid-layers/domain
mkdir -p packages/core/tests/fixtures/valid-layers/services
mkdir -p packages/core/tests/fixtures/valid-layers/api
```

```typescript
// packages/core/tests/fixtures/valid-layers/domain/user.ts
export interface User {
  id: string;
  name: string;
}

export function createUser(name: string): User {
  return { id: '1', name };
}
```

```typescript
// packages/core/tests/fixtures/valid-layers/services/user-service.ts
import { createUser } from '../domain/user';
import type { User } from '../domain/user';

export function registerUser(name: string): User {
  return createUser(name);
}
```

```typescript
// packages/core/tests/fixtures/valid-layers/api/user-handler.ts
import { registerUser } from '../services/user-service';

export function handleCreateUser(req: { name: string }) {
  return registerUser(req.name);
}
```

- [ ] **Step 2: Write failing test for buildDependencyGraph**

```typescript
// packages/core/tests/constraints/dependencies.test.ts
import { describe, it, expect } from 'vitest';
import { buildDependencyGraph, validateDependencies } from '../../src/constraints/dependencies';
import { defineLayer } from '../../src/constraints/layers';
import { TypeScriptParser } from '../../src/shared/parsers';
import { join } from 'path';

describe('buildDependencyGraph', () => {
  const parser = new TypeScriptParser();
  const fixturesDir = join(__dirname, '../fixtures/valid-layers');

  it('should build graph from files', async () => {
    const files = [
      join(fixturesDir, 'domain/user.ts'),
      join(fixturesDir, 'services/user-service.ts'),
      join(fixturesDir, 'api/user-handler.ts'),
    ];

    const result = await buildDependencyGraph(files, parser);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.nodes).toHaveLength(3);
      expect(result.value.edges.length).toBeGreaterThan(0);
    }
  });

  it('should track import types', async () => {
    const files = [
      join(fixturesDir, 'domain/user.ts'),
      join(fixturesDir, 'services/user-service.ts'),
    ];

    const result = await buildDependencyGraph(files, parser);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const edge = result.value.edges.find((e) => e.to.includes('domain/user'));
      expect(edge).toBeDefined();
      expect(edge?.importType).toBe('static');
    }
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd packages/core && pnpm test dependencies.test.ts`
Expected: FAIL - "Cannot find module '../../src/constraints/dependencies'"

- [ ] **Step 4: Implement buildDependencyGraph**

```typescript
// packages/core/src/constraints/dependencies.ts
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import type { ConstraintError } from '../shared/errors';
import { createError } from '../shared/errors';
import type { LanguageParser, Import } from '../shared/parsers';
import type {
  Layer,
  LayerConfig,
  DependencyEdge,
  DependencyGraph,
  DependencyViolation,
  DependencyValidation,
} from './types';
import { resolveFileToLayer } from './layers';
import { findFiles } from '../shared/fs-utils';
import { dirname, join, resolve, relative } from 'path';

export { defineLayer } from './layers';

/**
 * Resolve an import source to an absolute file path
 */
function resolveImportPath(importSource: string, fromFile: string, rootDir: string): string | null {
  // Skip external packages
  if (!importSource.startsWith('.') && !importSource.startsWith('/')) {
    return null;
  }

  const fromDir = dirname(fromFile);
  let resolved = resolve(fromDir, importSource);

  // Add .ts extension if not present
  if (!resolved.endsWith('.ts') && !resolved.endsWith('.tsx')) {
    resolved = resolved + '.ts';
  }

  return resolved;
}

/**
 * Determine import type from Import data
 */
function getImportType(imp: Import): 'static' | 'dynamic' | 'type-only' {
  if (imp.kind === 'type') return 'type-only';
  return 'static';
}

/**
 * Build a dependency graph from a list of files
 */
export async function buildDependencyGraph(
  files: string[],
  parser: LanguageParser
): Promise<Result<DependencyGraph, ConstraintError>> {
  const nodes = [...files];
  const edges: DependencyEdge[] = [];

  for (const file of files) {
    const parseResult = await parser.parseFile(file);
    if (!parseResult.ok) {
      // Skip files that can't be parsed
      continue;
    }

    const importsResult = parser.extractImports(parseResult.value);
    if (!importsResult.ok) {
      continue;
    }

    for (const imp of importsResult.value) {
      const resolvedPath = resolveImportPath(imp.source, file, '');
      if (resolvedPath) {
        edges.push({
          from: file,
          to: resolvedPath,
          importType: getImportType(imp),
          line: imp.location.line,
        });
      }
    }
  }

  return Ok({ nodes, edges });
}

/**
 * Check for layer violations in a dependency graph
 */
function checkLayerViolations(
  graph: DependencyGraph,
  layers: Layer[],
  rootDir: string
): DependencyViolation[] {
  const violations: DependencyViolation[] = [];

  for (const edge of graph.edges) {
    const fromRelative = relative(rootDir, edge.from);
    const toRelative = relative(rootDir, edge.to);

    const fromLayer = resolveFileToLayer(fromRelative, layers);
    const toLayer = resolveFileToLayer(toRelative, layers);

    // Skip if either file is not in a defined layer
    if (!fromLayer || !toLayer) continue;

    // Skip if importing from same layer
    if (fromLayer.name === toLayer.name) continue;

    // Check if the import is allowed
    if (!fromLayer.allowedDependencies.includes(toLayer.name)) {
      violations.push({
        file: edge.from,
        imports: edge.to,
        fromLayer: fromLayer.name,
        toLayer: toLayer.name,
        reason: 'WRONG_LAYER',
        line: edge.line,
        suggestion: `Move the dependency to an allowed layer (${fromLayer.allowedDependencies.join(', ') || 'none'}) or update layer rules`,
      });
    }
  }

  return violations;
}

/**
 * Validate dependencies against layer rules
 */
export async function validateDependencies(
  config: LayerConfig
): Promise<Result<DependencyValidation, ConstraintError>> {
  const { layers, rootDir, parser, fallbackBehavior = 'error' } = config;

  // Check parser health
  const healthResult = await parser.health();
  if (!healthResult.ok || !healthResult.value.available) {
    if (fallbackBehavior === 'skip') {
      return Ok({
        valid: true,
        violations: [],
        graph: { nodes: [], edges: [] },
        skipped: true,
        reason: 'Parser unavailable',
      });
    }
    if (fallbackBehavior === 'warn') {
      console.warn(`Parser ${parser.name} unavailable, skipping validation`);
      return Ok({
        valid: true,
        violations: [],
        graph: { nodes: [], edges: [] },
        skipped: true,
        reason: 'Parser unavailable',
      });
    }
    return Err(
      createError<ConstraintError>(
        'PARSER_UNAVAILABLE',
        `Parser ${parser.name} is not available`,
        { parser: parser.name },
        ['Install required runtime', 'Use different parser', 'Set fallbackBehavior: "skip"']
      )
    );
  }

  // Collect all files from layer patterns
  const allFiles: string[] = [];
  for (const layer of layers) {
    for (const pattern of layer.patterns) {
      const files = await findFiles(pattern, rootDir);
      allFiles.push(...files);
    }
  }

  // Deduplicate
  const uniqueFiles = [...new Set(allFiles)];

  // Build dependency graph
  const graphResult = await buildDependencyGraph(uniqueFiles, parser);
  if (!graphResult.ok) {
    return Err(graphResult.error);
  }

  // Check for violations
  const violations = checkLayerViolations(graphResult.value, layers, rootDir);

  return Ok({
    valid: violations.length === 0,
    violations,
    graph: graphResult.value,
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/core && pnpm test dependencies.test.ts`
Expected: PASS - All tests passed

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/constraints/dependencies.ts packages/core/tests/constraints/dependencies.test.ts packages/core/tests/fixtures/valid-layers/
git commit -m "feat(core): implement dependency graph building"
```

---

### Task 9: Layer Violation Detection

**Files:**

- Modify: `packages/core/tests/constraints/dependencies.test.ts`
- Create: `packages/core/tests/fixtures/layer-violations/`

- [ ] **Step 1: Create layer-violations test fixture**

```bash
mkdir -p packages/core/tests/fixtures/layer-violations/domain
mkdir -p packages/core/tests/fixtures/layer-violations/services
mkdir -p packages/core/tests/fixtures/layer-violations/api
```

```typescript
// packages/core/tests/fixtures/layer-violations/domain/user.ts
// VIOLATION: domain imports from services (not allowed)
import { validateUser } from '../services/validation';

export interface User {
  id: string;
  name: string;
}

export function createUser(name: string): User {
  validateUser(name);
  return { id: '1', name };
}
```

```typescript
// packages/core/tests/fixtures/layer-violations/services/validation.ts
export function validateUser(name: string): boolean {
  return name.length > 0;
}
```

```typescript
// packages/core/tests/fixtures/layer-violations/api/handler.ts
// VIOLATION: api imports directly from domain (allowed) but also has complex dep
import { createUser } from '../domain/user';

export function handle() {
  return createUser('test');
}
```

- [ ] **Step 2: Write test for validateDependencies with violations**

```typescript
// Add to packages/core/tests/constraints/dependencies.test.ts
// Add these imports at the top of the file:
import { Ok } from '../../src/shared/result';
import type { LanguageParser } from '../../src/shared/parsers';

describe('validateDependencies', () => {
  const parser = new TypeScriptParser();

  it('should pass for valid layer dependencies', async () => {
    const fixturesDir = join(__dirname, '../fixtures/valid-layers');
    const result = await validateDependencies({
      layers: [
        defineLayer('domain', ['domain/**'], []),
        defineLayer('services', ['services/**'], ['domain']),
        defineLayer('api', ['api/**'], ['services', 'domain']),
      ],
      rootDir: fixturesDir,
      parser,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.valid).toBe(true);
      expect(result.value.violations).toHaveLength(0);
    }
  });

  it('should detect layer violations', async () => {
    const fixturesDir = join(__dirname, '../fixtures/layer-violations');
    const result = await validateDependencies({
      layers: [
        defineLayer('domain', ['domain/**'], []),
        defineLayer('services', ['services/**'], ['domain']),
        defineLayer('api', ['api/**'], ['services', 'domain']),
      ],
      rootDir: fixturesDir,
      parser,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.valid).toBe(false);
      expect(result.value.violations.length).toBeGreaterThan(0);

      const violation = result.value.violations[0];
      expect(violation.reason).toBe('WRONG_LAYER');
      expect(violation.fromLayer).toBe('domain');
      expect(violation.toLayer).toBe('services');
    }
  });

  it('should skip validation when parser unavailable and fallbackBehavior is skip', async () => {
    const mockParser = {
      name: 'mock',
      extensions: ['.ts'],
      parseFile: async () => Ok({ type: 'Program', body: {}, language: 'mock' }),
      extractImports: () => Ok([]),
      extractExports: () => Ok([]),
      health: async () => Ok({ available: false, message: 'Not installed' }),
    } as unknown as LanguageParser;

    const result = await validateDependencies({
      layers: [],
      rootDir: '.',
      parser: mockParser,
      fallbackBehavior: 'skip',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.skipped).toBe(true);
    }
  });
});
```

- [ ] **Step 3: Run test to verify it passes**

Run: `cd packages/core && pnpm test dependencies.test.ts`
Expected: PASS - All tests passed

- [ ] **Step 4: Commit**

```bash
git add packages/core/tests/constraints/dependencies.test.ts packages/core/tests/fixtures/layer-violations/
git commit -m "feat(core): implement layer violation detection"
```

---

## Chunk 4: Circular Dependency Detection

### Task 10: Tarjan's SCC Algorithm

**Files:**

- Create: `packages/core/src/constraints/circular-deps.ts`
- Create: `packages/core/tests/constraints/circular-deps.test.ts`
- Create: `packages/core/tests/fixtures/circular-deps/`

- [ ] **Step 1: Create circular-deps test fixture**

```bash
mkdir -p packages/core/tests/fixtures/circular-deps
```

```typescript
// packages/core/tests/fixtures/circular-deps/a.ts
import { b } from './b';
export const a = () => b() + 'a';
```

```typescript
// packages/core/tests/fixtures/circular-deps/b.ts
import { c } from './c';
export const b = () => c() + 'b';
```

```typescript
// packages/core/tests/fixtures/circular-deps/c.ts
import { a } from './a';
export const c = () => a() + 'c';
```

- [ ] **Step 2: Write failing test for detectCircularDeps**

```typescript
// packages/core/tests/constraints/circular-deps.test.ts
import { describe, it, expect } from 'vitest';
import { detectCircularDeps, detectCircularDepsInFiles } from '../../src/constraints/circular-deps';
import { TypeScriptParser } from '../../src/shared/parsers';
import type { DependencyGraph } from '../../src/constraints/types';
import { join } from 'path';

describe('detectCircularDeps', () => {
  it('should detect cycles in dependency graph', () => {
    const graph: DependencyGraph = {
      nodes: ['a.ts', 'b.ts', 'c.ts'],
      edges: [
        { from: 'a.ts', to: 'b.ts', importType: 'static', line: 1 },
        { from: 'b.ts', to: 'c.ts', importType: 'static', line: 1 },
        { from: 'c.ts', to: 'a.ts', importType: 'static', line: 1 },
      ],
    };

    const result = detectCircularDeps(graph);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.hasCycles).toBe(true);
      expect(result.value.cycles.length).toBeGreaterThan(0);
      expect(result.value.largestCycle).toBe(3);
    }
  });

  it('should return no cycles for acyclic graph', () => {
    const graph: DependencyGraph = {
      nodes: ['a.ts', 'b.ts', 'c.ts'],
      edges: [
        { from: 'a.ts', to: 'b.ts', importType: 'static', line: 1 },
        { from: 'b.ts', to: 'c.ts', importType: 'static', line: 1 },
      ],
    };

    const result = detectCircularDeps(graph);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.hasCycles).toBe(false);
      expect(result.value.cycles).toHaveLength(0);
      expect(result.value.largestCycle).toBe(0);
    }
  });

  it('should detect self-referential cycle', () => {
    const graph: DependencyGraph = {
      nodes: ['a.ts'],
      edges: [{ from: 'a.ts', to: 'a.ts', importType: 'static', line: 1 }],
    };

    const result = detectCircularDeps(graph);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.hasCycles).toBe(true);
    }
  });

  it('should handle disconnected nodes', () => {
    const graph: DependencyGraph = {
      nodes: ['a.ts', 'b.ts', 'c.ts', 'd.ts'], // d.ts has no edges
      edges: [
        { from: 'a.ts', to: 'b.ts', importType: 'static', line: 1 },
        { from: 'b.ts', to: 'c.ts', importType: 'static', line: 1 },
      ],
    };

    const result = detectCircularDeps(graph);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.hasCycles).toBe(false);
    }
  });
});

describe('detectCircularDepsInFiles', () => {
  const parser = new TypeScriptParser();
  const fixturesDir = join(__dirname, '../fixtures/circular-deps');

  it('should detect cycles from actual files', async () => {
    const files = [join(fixturesDir, 'a.ts'), join(fixturesDir, 'b.ts'), join(fixturesDir, 'c.ts')];

    const result = await detectCircularDepsInFiles(files, parser);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.hasCycles).toBe(true);
      expect(result.value.cycles.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd packages/core && pnpm test circular-deps.test.ts`
Expected: FAIL - "Cannot find module '../../src/constraints/circular-deps'"

- [ ] **Step 4: Implement Tarjan's SCC algorithm**

```typescript
// packages/core/src/constraints/circular-deps.ts
import type { Result } from '../shared/result';
import { Ok } from '../shared/result';
import type { ConstraintError } from '../shared/errors';
import type { LanguageParser } from '../shared/parsers';
import type { DependencyGraph, CircularDependency, CircularDepsResult } from './types';
import { buildDependencyGraph } from './dependencies';

interface TarjanNode {
  index: number;
  lowlink: number;
  onStack: boolean;
}

/**
 * Tarjan's Strongly Connected Components algorithm
 * Returns all SCCs with more than one node (cycles)
 */
function tarjanSCC(graph: DependencyGraph): string[][] {
  const nodeMap = new Map<string, TarjanNode>();
  const stack: string[] = [];
  const sccs: string[][] = [];
  let index = 0;

  // Build adjacency list
  const adjacency = new Map<string, string[]>();
  for (const node of graph.nodes) {
    adjacency.set(node, []);
  }
  for (const edge of graph.edges) {
    const neighbors = adjacency.get(edge.from);
    if (neighbors && graph.nodes.includes(edge.to)) {
      neighbors.push(edge.to);
    }
  }

  function strongConnect(node: string): void {
    nodeMap.set(node, {
      index: index,
      lowlink: index,
      onStack: true,
    });
    index++;
    stack.push(node);

    const neighbors = adjacency.get(node) ?? [];
    for (const neighbor of neighbors) {
      const neighborData = nodeMap.get(neighbor);
      if (!neighborData) {
        // Neighbor not yet visited
        strongConnect(neighbor);
        const nodeData = nodeMap.get(node)!;
        const updatedNeighborData = nodeMap.get(neighbor)!;
        nodeData.lowlink = Math.min(nodeData.lowlink, updatedNeighborData.lowlink);
      } else if (neighborData.onStack) {
        // Neighbor is on stack, so it's in current SCC
        const nodeData = nodeMap.get(node)!;
        nodeData.lowlink = Math.min(nodeData.lowlink, neighborData.index);
      }
    }

    // If node is root of SCC
    const nodeData = nodeMap.get(node)!;
    if (nodeData.lowlink === nodeData.index) {
      const scc: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        nodeMap.get(w)!.onStack = false;
        scc.push(w);
      } while (w !== node);

      // Only include SCCs with more than one node (actual cycles)
      // or self-referential cycles
      if (scc.length > 1) {
        sccs.push(scc);
      } else if (scc.length === 1) {
        // Check for self-reference
        const selfNode = scc[0];
        const selfNeighbors = adjacency.get(selfNode) ?? [];
        if (selfNeighbors.includes(selfNode)) {
          sccs.push(scc);
        }
      }
    }
  }

  // Run algorithm for all nodes
  for (const node of graph.nodes) {
    if (!nodeMap.has(node)) {
      strongConnect(node);
    }
  }

  return sccs;
}

/**
 * Detect circular dependencies in a dependency graph
 */
export function detectCircularDeps(
  graph: DependencyGraph
): Result<CircularDepsResult, ConstraintError> {
  const sccs = tarjanSCC(graph);

  const cycles: CircularDependency[] = sccs.map((scc) => {
    // Add first node at end to show cycle completion
    const cycle = [...scc.reverse(), scc[scc.length - 1]];
    return {
      cycle,
      severity: 'error' as const,
      size: scc.length,
    };
  });

  const largestCycle = cycles.reduce((max, c) => Math.max(max, c.size), 0);

  return Ok({
    hasCycles: cycles.length > 0,
    cycles,
    largestCycle,
  });
}

/**
 * Detect circular dependencies from a list of files
 */
export async function detectCircularDepsInFiles(
  files: string[],
  parser: LanguageParser
): Promise<Result<CircularDepsResult, ConstraintError>> {
  const graphResult = await buildDependencyGraph(files, parser);
  if (!graphResult.ok) {
    return graphResult as Result<CircularDepsResult, ConstraintError>;
  }

  return detectCircularDeps(graphResult.value);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/core && pnpm test circular-deps.test.ts`
Expected: PASS - All tests passed

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/constraints/circular-deps.ts packages/core/tests/constraints/circular-deps.test.ts packages/core/tests/fixtures/circular-deps/
git commit -m "feat(core): implement circular dependency detection"
```

---

## Chunk 5: Boundary Validation

### Task 11: Boundary Validator

**Files:**

- Create: `packages/core/src/constraints/boundary.ts`
- Create: `packages/core/tests/constraints/boundary.test.ts`

- [ ] **Step 1: Write failing test for createBoundaryValidator**

```typescript
// packages/core/tests/constraints/boundary.test.ts
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createBoundaryValidator, validateBoundaries } from '../../src/constraints/boundary';

describe('createBoundaryValidator', () => {
  const UserSchema = z.object({
    email: z.string().email(),
    name: z.string().min(1),
  });

  it('should parse valid data', () => {
    const validator = createBoundaryValidator(UserSchema, 'User.create');

    const result = validator.parse({ email: 'test@example.com', name: 'John' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.email).toBe('test@example.com');
      expect(result.value.name).toBe('John');
    }
  });

  it('should return error for invalid data', () => {
    const validator = createBoundaryValidator(UserSchema, 'User.create');

    const result = validator.parse({ email: 'invalid', name: '' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('BOUNDARY_ERROR');
      expect(result.error.suggestions.length).toBeGreaterThan(0);
    }
  });

  it('should validate without parsing', () => {
    const validator = createBoundaryValidator(UserSchema, 'User.create');

    const validResult = validator.validate({ email: 'test@example.com', name: 'John' });
    expect(validResult.ok).toBe(true);
    if (validResult.ok) {
      expect(validResult.value).toBe(true);
    }

    const invalidResult = validator.validate({ email: 'invalid', name: '' });
    expect(invalidResult.ok).toBe(true);
    if (invalidResult.ok) {
      expect(invalidResult.value).toBe(false);
    }
  });

  it('should expose schema and name', () => {
    const validator = createBoundaryValidator(UserSchema, 'User.create');

    expect(validator.name).toBe('User.create');
    expect(validator.schema).toBe(UserSchema);
  });
});

describe('validateBoundaries', () => {
  const UserSchema = z.object({
    email: z.string().email(),
    name: z.string().min(1),
  });

  it('should validate multiple boundaries', () => {
    const boundaries = [
      { name: 'User.create', layer: 'api', schema: UserSchema, direction: 'input' as const },
    ];

    const data = new Map([['User.create', { email: 'test@example.com', name: 'John' }]]);

    const result = validateBoundaries(boundaries, data);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.valid).toBe(true);
      expect(result.value.violations).toHaveLength(0);
    }
  });

  it('should collect violations', () => {
    const boundaries = [
      { name: 'User.create', layer: 'api', schema: UserSchema, direction: 'input' as const },
    ];

    const data = new Map([['User.create', { email: 'invalid', name: '' }]]);

    const result = validateBoundaries(boundaries, data);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.valid).toBe(false);
      expect(result.value.violations.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm test boundary.test.ts`
Expected: FAIL - "Cannot find module '../../src/constraints/boundary'"

- [ ] **Step 3: Implement createBoundaryValidator and validateBoundaries**

```typescript
// packages/core/src/constraints/boundary.ts
import { z } from 'zod';
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import type { ConstraintError } from '../shared/errors';
import { createError } from '../shared/errors';
import type {
  BoundaryDefinition,
  BoundaryViolation,
  BoundaryValidation,
  BoundaryValidator,
} from './types';

/**
 * Create a boundary validator from a Zod schema
 */
export function createBoundaryValidator<T>(
  schema: z.ZodSchema<T>,
  name: string
): BoundaryValidator<T> {
  return {
    name,
    schema,

    parse(input: unknown): Result<T, ConstraintError> {
      const result = schema.safeParse(input);

      if (result.success) {
        return Ok(result.data);
      }

      const suggestions = result.error.issues.map((issue) => {
        const path = issue.path.join('.');
        return path ? `${path}: ${issue.message}` : issue.message;
      });

      return Err(
        createError<ConstraintError>(
          'BOUNDARY_ERROR',
          `Boundary validation failed for ${name}`,
          {
            boundary: name,
            zodError: result.error,
            input,
          },
          suggestions
        )
      );
    },

    validate(input: unknown): Result<boolean, ConstraintError> {
      const result = schema.safeParse(input);
      return Ok(result.success);
    },
  };
}

/**
 * Validate multiple boundaries at once
 */
export function validateBoundaries(
  boundaries: BoundaryDefinition[],
  data: Map<string, unknown>
): Result<BoundaryValidation, ConstraintError> {
  const violations: BoundaryViolation[] = [];

  for (const boundary of boundaries) {
    const input = data.get(boundary.name);
    if (input === undefined) {
      continue;
    }

    const result = boundary.schema.safeParse(input);
    if (!result.success) {
      violations.push({
        boundary: boundary.name,
        direction: boundary.direction,
        error: result.error,
        data: input,
      });
    }
  }

  return Ok({
    valid: violations.length === 0,
    violations,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && pnpm test boundary.test.ts`
Expected: PASS - All tests passed

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/constraints/boundary.ts packages/core/tests/constraints/boundary.test.ts
git commit -m "feat(core): implement boundary validation"
```

---

## Chunk 6: Module Integration and Release

### Task 12: Constraints Module Exports

**Files:**

- Create: `packages/core/src/constraints/index.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Create constraints module index**

```typescript
// packages/core/src/constraints/index.ts
// Layer validation
// Note: buildDependencyGraph is exported as an addition beyond spec for advanced use cases
export { defineLayer, validateDependencies, buildDependencyGraph } from './dependencies';
export { resolveFileToLayer } from './layers';

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

- [ ] **Step 2: Update main entry point**

```typescript
// packages/core/src/index.ts
/**
 * @harness-engineering/core
 *
 * Core library for Harness Engineering toolkit
 */

export * from '@harness-engineering/types';

// Result type and helpers
export type { Result } from './shared/result';
export { Ok, Err, isOk, isErr } from './shared/result';

// Error types and helpers
export type {
  BaseError,
  ValidationError,
  ContextError,
  ConstraintError,
  EntropyError,
  FeedbackError,
} from './shared/errors';
export { createError } from './shared/errors';

// Validation module
export * from './validation';

// Context module
export * from './context';

// Constraints module
export * from './constraints';

// Parsers
export { TypeScriptParser } from './shared/parsers';
export type {
  LanguageParser,
  AST,
  Import,
  Export,
  ParseError,
  HealthCheckResult,
} from './shared/parsers';
export { createParseError } from './shared/parsers';

// Package version
export const VERSION = '0.3.0';
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd packages/core && pnpm typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/constraints/index.ts packages/core/src/index.ts
git commit -m "feat(core): add constraints module exports"
```

---

### Task 13: Coverage and Final Testing

- [ ] **Step 1: Run all tests**

Run: `cd packages/core && pnpm test`
Expected: All tests pass

- [ ] **Step 2: Check test coverage**

Run: `cd packages/core && pnpm test:coverage`
Expected: Coverage >80% for all files

- [ ] **Step 3: If coverage is below 80%, identify and add missing tests**

Common gaps to check:

- Error handling branches in parser
- Edge cases in Tarjan's algorithm (empty graph, disconnected nodes)
- Boundary validation with missing data

- [ ] **Step 4: Run linter**

Run: `cd packages/core && pnpm lint`
Expected: No linting errors

- [ ] **Step 5: Build the package**

Run: `cd packages/core && pnpm build`
Expected: Build succeeds

- [ ] **Step 6: Commit if any fixes were needed**

```bash
git add .
git commit -m "test(core): ensure >80% coverage for constraints module"
```

---

### Task 14: Update Documentation

**Files:**

- Modify: `packages/core/README.md`
- Modify: `packages/core/CHANGELOG.md`

- [ ] **Step 1: Add constraints module section to README**

Add after the Context Engineering Module section in `packages/core/README.md`:

```markdown
### Architectural Constraints Module

Tools for enforcing layered architecture and detecting dependency issues.

#### Layer Validation

Define and validate architectural layers:

\`\`\`typescript
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
console.log(\`\${violation.file}:\${violation.line} - \${violation.reason}\`);
console.log(\` \${violation.fromLayer} cannot import from \${violation.toLayer}\`);
}
}
\`\`\`

#### Circular Dependency Detection

Find cycles in your dependency graph:

\`\`\`typescript
import { detectCircularDepsInFiles, TypeScriptParser } from '@harness-engineering/core';

const result = await detectCircularDepsInFiles(
['src/a.ts', 'src/b.ts', 'src/c.ts'],
new TypeScriptParser()
);

if (result.ok && result.value.hasCycles) {
for (const cycle of result.value.cycles) {
console.log('Cycle found:', cycle.cycle.join(' -> '));
}
}
\`\`\`

#### Boundary Validation

Validate data at module boundaries:

\`\`\`typescript
import { z } from 'zod';
import { createBoundaryValidator } from '@harness-engineering/core';

const UserSchema = z.object({
email: z.string().email(),
name: z.string().min(1),
});

const validator = createBoundaryValidator(UserSchema, 'UserService.createUser');

const result = validator.parse(requestBody);
if (result.ok) {
// result.value is typed as { email: string; name: string }
createUser(result.value);
} else {
console.error(result.error.suggestions);
}
\`\`\`
```

- [ ] **Step 2: Update CHANGELOG**

Add to `packages/core/CHANGELOG.md`:

```markdown
## [0.3.0] - YYYY-MM-DD

### Added

- **Architectural Constraints Module** - Tools for enforcing layered architecture
  - `defineLayer()` - Create layer definitions with dependency rules
  - `validateDependencies()` - Validate imports respect layer boundaries
  - `detectCircularDeps()` - Detect cycles using Tarjan's SCC algorithm
  - `detectCircularDepsInFiles()` - Standalone cycle detection from files
  - `createBoundaryValidator()` - Create Zod-based boundary validators
  - `validateBoundaries()` - Validate multiple boundaries at once
- **Parser Abstraction Layer** - Reusable AST parsing infrastructure
  - `TypeScriptParser` - Full AST parsing for TypeScript files
  - `LanguageParser` interface for multi-language support
  - Import/export extraction with type-only import detection
- Parser health checks with configurable fallback behavior

### Changed

- Updated VERSION to 0.3.0
```

- [ ] **Step 3: Commit documentation**

```bash
git add packages/core/README.md packages/core/CHANGELOG.md
git commit -m "docs(core): add constraints module usage examples"
```

---

### Task 15: Version and Release

- [ ] **Step 1: Update version to 0.3.0**

Update `packages/core/package.json`:

```json
{
  "version": "0.3.0"
}
```

- [ ] **Step 2: Build and verify final package**

Run: `cd packages/core && pnpm build && pnpm test`
Expected: All tests pass, build succeeds

- [ ] **Step 3: Commit version update**

```bash
git add packages/core/package.json
git commit -m "chore(core): prepare v0.3.0 release"
```

- [ ] **Step 4: Tag release**

```bash
git tag @harness-engineering/core@0.3.0
```

---

## Success Criteria

Module 3 (Architectural Constraints) is complete when:

- [ ] All tests passing (run: `cd packages/core && pnpm test`)
- [ ] Test coverage >80% (run: `cd packages/core && pnpm test:coverage`)
- [ ] No linting errors (run: `cd packages/core && pnpm lint`)
- [ ] TypeScript compiles without errors (run: `cd packages/core && pnpm typecheck`)
- [ ] Build succeeds (run: `cd packages/core && pnpm build`)
- [ ] README includes usage examples for all APIs
- [ ] CHANGELOG documents all changes
- [ ] Version set to 0.3.0
- [ ] All changes committed to git
- [ ] Release tagged: `@harness-engineering/core@0.3.0`

---

## Next Steps

After Module 3 is complete:

1. **Publish v0.3.0** (optional) - `pnpm publish --access public`
2. **Create implementation plan for Module 4 (Entropy Management)**
3. **Begin Module 4 implementation** following same TDD approach

---

_Last Updated: 2026-03-12_

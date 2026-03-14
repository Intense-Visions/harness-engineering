# Module 1: Validation - Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Validation module providing cross-cutting validation utilities: file structure validation, config validation with Zod, and commit message validation.

**Architecture:** Foundation module with no dependencies on other harness-engineering modules. Uses Result<T, E> pattern for error handling. Three main components: file-structure (glob-based), config (Zod wrapper), commit-message (regex-based parsing). All operations return structured errors with suggestions.

**Tech Stack:** TypeScript 5+, Zod 3.22+, glob 10+, Vitest 4+

---

## File Structure Overview

This plan creates/modifies these files:

**Core Implementation:**
- `packages/core/src/shared/result.ts` - Result<T, E> type and utilities
- `packages/core/src/shared/errors.ts` - Base error types and factory
- `packages/core/src/shared/fs-utils.ts` - File system helpers
- `packages/core/src/validation/types.ts` - Validation-specific types
- `packages/core/src/validation/file-structure.ts` - File structure validation
- `packages/core/src/validation/config.ts` - Config validation (Zod)
- `packages/core/src/validation/commit-message.ts` - Commit message validation
- `packages/core/src/validation/index.ts` - Public exports
- `packages/core/src/index.ts` - Main entry point (update)

**Tests:**
- `packages/core/tests/shared/result.test.ts` - Result type tests
- `packages/core/tests/shared/errors.test.ts` - Error factory tests
- `packages/core/tests/shared/fs-utils.test.ts` - File system utils tests
- `packages/core/tests/validation/file-structure.test.ts` - File structure tests
- `packages/core/tests/validation/config.test.ts` - Config validation tests
- `packages/core/tests/validation/commit-message.test.ts` - Commit message tests

**Test Fixtures:**
- `packages/core/tests/fixtures/valid-project/` - Sample valid project
- `packages/core/tests/fixtures/invalid-project/` - Sample invalid project

**Configuration:**
- `packages/core/vitest.config.ts` - Test configuration
- `packages/core/package.json` - Update dependencies

---

## Chunk 1: Foundation (Result, Errors, FS Utils)

### Task 1: Set Up Testing Infrastructure

**Files:**
- Create: `packages/core/vitest.config.ts`
- Modify: `packages/core/package.json` (add test scripts)

- [ ] **Step 1: Create vitest config**

```typescript
// packages/core/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.test.ts',
        '**/*.config.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
```

- [ ] **Step 2: Add test scripts to package.json**

Add to `packages/core/package.json` scripts section:
```json
"scripts": {
  "test": "vitest",
  "test:coverage": "vitest --coverage",
  "typecheck": "tsc --noEmit"
}
```

- [ ] **Step 3: Verify vitest is installed**

Run: `cd packages/core && pnpm list vitest`
Expected: `vitest 4.0.18` (or similar)

- [ ] **Step 4: Run test to verify setup works**

Run: `cd packages/core && pnpm test`
Expected: "No test files found" (this is correct - we haven't written tests yet)

- [ ] **Step 5: Commit**

```bash
git add packages/core/vitest.config.ts packages/core/package.json
git commit -m "test(core): add vitest configuration and test scripts"
```

---

### Task 2: Result<T, E> Type

**Files:**
- Create: `packages/core/src/shared/result.ts`
- Create: `packages/core/tests/shared/result.test.ts`

- [ ] **Step 1: Write failing test for Ok() constructor**

```typescript
// packages/core/tests/shared/result.test.ts
import { describe, it, expect } from 'vitest';
import { Ok, isOk } from '../../src/shared/result';

describe('Result', () => {
  describe('Ok', () => {
    it('should create a successful result', () => {
      const result = Ok('success');

      expect(result.ok).toBe(true);
      expect(isOk(result)).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('success');
      }
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm test result.test.ts`
Expected: FAIL - "Cannot find module '../../src/shared/result'"

- [ ] **Step 3: Implement Result type and Ok constructor**

```typescript
// packages/core/src/shared/result.ts
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export const Ok = <T>(value: T): Result<T, never> => ({
  ok: true,
  value,
});

export function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok === true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && pnpm test result.test.ts`
Expected: PASS - 1 test passed

- [ ] **Step 5: Write failing test for Err() constructor**

```typescript
// Add to packages/core/tests/shared/result.test.ts
import { Err, isErr } from '../../src/shared/result';

describe('Err', () => {
  it('should create an error result', () => {
    const error = new Error('failed');
    const result = Err(error);

    expect(result.ok).toBe(false);
    expect(isErr(result)).toBe(true);
    if (!result.ok) {
      expect(result.error).toBe(error);
    }
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd packages/core && pnpm test result.test.ts`
Expected: FAIL - "Cannot find module 'Err'"

- [ ] **Step 7: Implement Err constructor and isErr**

```typescript
// Add to packages/core/src/shared/result.ts
export const Err = <E>(error: E): Result<never, E> => ({
  ok: false,
  error,
});

export function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
  return result.ok === false;
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd packages/core && pnpm test result.test.ts`
Expected: PASS - 2 tests passed

- [ ] **Step 9: Write test for type narrowing**

```typescript
// Add to packages/core/tests/shared/result.test.ts
describe('Type narrowing', () => {
  it('should narrow types correctly with isOk', () => {
    const result: Result<string, Error> = Ok('value');

    if (isOk(result)) {
      // TypeScript should know result.value is string
      const value: string = result.value;
      expect(value).toBe('value');
    }
  });

  it('should narrow types correctly with isErr', () => {
    const error = new Error('failed');
    const result: Result<string, Error> = Err(error);

    if (isErr(result)) {
      // TypeScript should know result.error is Error
      const err: Error = result.error;
      expect(err).toBe(error);
    }
  });
});
```

- [ ] **Step 10: Run test to verify it passes**

Run: `cd packages/core && pnpm test result.test.ts`
Expected: PASS - 4 tests passed

- [ ] **Step 11: Commit**

```bash
git add packages/core/src/shared/result.ts packages/core/tests/shared/result.test.ts
git commit -m "feat(core): add Result<T, E> type with Ok/Err constructors"
```

---

### Task 3: Error Types and Factory

**Files:**
- Create: `packages/core/src/shared/errors.ts`
- Create: `packages/core/tests/shared/errors.test.ts`

- [ ] **Step 1: Write failing test for BaseError interface**

```typescript
// packages/core/tests/shared/errors.test.ts
import { describe, it, expect } from 'vitest';
import type { BaseError, ValidationError } from '../../src/shared/errors';

describe('Error types', () => {
  it('should have required BaseError fields', () => {
    const error: BaseError = {
      code: 'TEST_ERROR',
      message: 'Test error message',
      details: { field: 'value' },
      suggestions: ['Try this', 'Or that'],
    };

    expect(error.code).toBe('TEST_ERROR');
    expect(error.message).toBe('Test error message');
    expect(error.details).toEqual({ field: 'value' });
    expect(error.suggestions).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm test errors.test.ts`
Expected: FAIL - "Cannot find module '../../src/shared/errors'"

- [ ] **Step 3: Implement base error types**

```typescript
// packages/core/src/shared/errors.ts
export type ErrorCode = string;

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
  code: 'WRONG_LAYER' | 'CIRCULAR_DEP' | 'FORBIDDEN_IMPORT' | 'BOUNDARY_ERROR' | 'PARSER_UNAVAILABLE';
}

export interface EntropyError extends BaseError {
  code: 'DOC_DRIFT' | 'PATTERN_VIOLATION' | 'DEAD_CODE_FOUND';
}

export interface FeedbackError extends BaseError {
  code: 'AGENT_SPAWN_ERROR' | 'TELEMETRY_ERROR' | 'REVIEW_ERROR';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && pnpm test errors.test.ts`
Expected: PASS - 1 test passed

- [ ] **Step 5: Write failing test for createError factory**

```typescript
// Add to packages/core/tests/shared/errors.test.ts
import { createError } from '../../src/shared/errors';

describe('createError', () => {
  it('should create error with all fields', () => {
    const error = createError<ValidationError>(
      'INVALID_TYPE',
      'Value must be a string',
      { expected: 'string', received: 'number' },
      ['Check the type', 'Use string value']
    );

    expect(error.code).toBe('INVALID_TYPE');
    expect(error.message).toBe('Value must be a string');
    expect(error.details).toEqual({ expected: 'string', received: 'number' });
    expect(error.suggestions).toEqual(['Check the type', 'Use string value']);
  });

  it('should create error with default empty fields', () => {
    const error = createError<ValidationError>(
      'VALIDATION_FAILED',
      'Validation failed'
    );

    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.message).toBe('Validation failed');
    expect(error.details).toEqual({});
    expect(error.suggestions).toEqual([]);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd packages/core && pnpm test errors.test.ts`
Expected: FAIL - "Cannot find module 'createError'"

- [ ] **Step 7: Implement createError factory**

```typescript
// Add to packages/core/src/shared/errors.ts
export function createError<T extends BaseError>(
  code: T['code'],
  message: string,
  details: Record<string, unknown> = {},
  suggestions: string[] = []
): T {
  return { code, message, details, suggestions } as T;
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd packages/core && pnpm test errors.test.ts`
Expected: PASS - 3 tests passed

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/shared/errors.ts packages/core/tests/shared/errors.test.ts
git commit -m "feat(core): add error types and createError factory"
```

---

### Task 4: File System Utilities

**Files:**
- Create: `packages/core/src/shared/fs-utils.ts`
- Create: `packages/core/tests/shared/fs-utils.test.ts`
- Create: `packages/core/tests/fixtures/sample.txt`

- [ ] **Step 1: Create test fixture**

```bash
mkdir -p packages/core/tests/fixtures
echo "Sample content" > packages/core/tests/fixtures/sample.txt
```

- [ ] **Step 2: Write failing test for fileExists**

```typescript
// packages/core/tests/shared/fs-utils.test.ts
import { describe, it, expect } from 'vitest';
import { fileExists } from '../../src/shared/fs-utils';
import { join } from 'path';

describe('fileExists', () => {
  it('should return true for existing file', async () => {
    const path = join(__dirname, '../fixtures/sample.txt');
    const exists = await fileExists(path);

    expect(exists).toBe(true);
  });

  it('should return false for non-existent file', async () => {
    const path = join(__dirname, '../fixtures/does-not-exist.txt');
    const exists = await fileExists(path);

    expect(exists).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd packages/core && pnpm test fs-utils.test.ts`
Expected: FAIL - "Cannot find module '../../src/shared/fs-utils'"

- [ ] **Step 4: Implement fileExists**

```typescript
// packages/core/src/shared/fs-utils.ts
import { access, constants } from 'fs';
import { promisify } from 'util';

const accessAsync = promisify(access);

export async function fileExists(path: string): Promise<boolean> {
  try {
    await accessAsync(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/core && pnpm test fs-utils.test.ts`
Expected: PASS - 2 tests passed

- [ ] **Step 6: Write failing test for readFileContent**

```typescript
// Add to packages/core/tests/shared/fs-utils.test.ts
import { readFileContent } from '../../src/shared/fs-utils';
import { isOk, isErr } from '../../src/shared/result';

describe('readFileContent', () => {
  it('should read file content successfully', async () => {
    const path = join(__dirname, '../fixtures/sample.txt');
    const result = await readFileContent(path);

    expect(isOk(result)).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('Sample content\n');
    }
  });

  it('should return error for non-existent file', async () => {
    const path = join(__dirname, '../fixtures/does-not-exist.txt');
    const result = await readFileContent(path);

    expect(isErr(result)).toBe(true);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(Error);
    }
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `cd packages/core && pnpm test fs-utils.test.ts`
Expected: FAIL - "Cannot find module 'readFileContent'"

- [ ] **Step 8: Implement readFileContent**

```typescript
// Add to packages/core/src/shared/fs-utils.ts
import { readFile } from 'fs';
import { promisify } from 'util';
import type { Result } from './result';
import { Ok, Err } from './result';

const readFileAsync = promisify(readFile);

export async function readFileContent(path: string): Promise<Result<string, Error>> {
  try {
    const content = await readFileAsync(path, 'utf-8');
    return Ok(content);
  } catch (error) {
    return Err(error as Error);
  }
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `cd packages/core && pnpm test fs-utils.test.ts`
Expected: PASS - 4 tests passed

- [ ] **Step 10: Write failing test for findFiles**

```typescript
// Add to packages/core/tests/shared/fs-utils.test.ts
import { findFiles } from '../../src/shared/fs-utils';

describe('findFiles', () => {
  it('should find files matching pattern', async () => {
    const cwd = join(__dirname, '../fixtures');
    const files = await findFiles('*.txt', cwd);

    expect(files).toHaveLength(1);
    expect(files[0]).toContain('sample.txt');
  });

  it('should return empty array for non-matching pattern', async () => {
    const cwd = join(__dirname, '../fixtures');
    const files = await findFiles('*.nonexistent', cwd);

    expect(files).toHaveLength(0);
  });
});
```

- [ ] **Step 11: Run test to verify it fails**

Run: `cd packages/core && pnpm test fs-utils.test.ts`
Expected: FAIL - "Cannot find module 'findFiles'"

- [ ] **Step 12: Install glob dependency**

Run: `cd packages/core && pnpm add glob@^10.3.0`
Expected: "dependencies: +glob 10.3.x"

- [ ] **Step 13: Implement findFiles**

```typescript
// Add to packages/core/src/shared/fs-utils.ts
import { glob } from 'glob';

export async function findFiles(pattern: string, cwd: string = process.cwd()): Promise<string[]> {
  return glob(pattern, { cwd, absolute: true });
}
```

- [ ] **Step 14: Run test to verify it passes**

Run: `cd packages/core && pnpm test fs-utils.test.ts`
Expected: PASS - 6 tests passed

- [ ] **Step 15: Commit**

```bash
git add packages/core/src/shared/fs-utils.ts packages/core/tests/shared/fs-utils.test.ts packages/core/tests/fixtures/sample.txt packages/core/package.json pnpm-lock.yaml
git commit -m "feat(core): add file system utilities (fileExists, readFileContent, findFiles)"
```

---

## Chunk 2: Validation Module - File Structure

### Task 5: Validation Types

**Files:**
- Create: `packages/core/src/validation/types.ts`

- [ ] **Step 1: Create validation types file**

```typescript
// packages/core/src/validation/types.ts
import type { ValidationError } from '../shared/errors';

// File Structure Validation
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

// Config Validation
export interface ConfigError extends ValidationError {
  code: 'INVALID_TYPE' | 'MISSING_FIELD' | 'VALIDATION_FAILED';
  details: {
    zodError?: unknown;     // Zod's detailed error (avoid importing zod types here)
    path?: string[];        // Path to invalid field
  };
}

// Commit Message Validation
export type CommitFormat = 'conventional' | 'angular' | 'custom';

export interface CommitValidation {
  valid: boolean;
  type?: string;          // e.g., 'feat', 'fix', 'docs'
  scope?: string;         // e.g., 'core', 'validation'
  breaking: boolean;      // Does commit contain breaking changes?
  issues: string[];       // What's wrong (if invalid)
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd packages/core && pnpm typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/validation/types.ts
git commit -m "feat(core): add validation module types"
```

---

### Task 6: File Structure Validation

**Files:**
- Create: `packages/core/src/validation/file-structure.ts`
- Create: `packages/core/tests/validation/file-structure.test.ts`
- Create: `packages/core/tests/fixtures/valid-project/README.md`
- Create: `packages/core/tests/fixtures/valid-project/AGENTS.md`
- Create: `packages/core/tests/fixtures/invalid-project/README.md`

- [ ] **Step 1: Create test fixtures**

```bash
mkdir -p packages/core/tests/fixtures/valid-project
echo "# Valid Project" > packages/core/tests/fixtures/valid-project/README.md
echo "# AGENTS.md" > packages/core/tests/fixtures/valid-project/AGENTS.md

mkdir -p packages/core/tests/fixtures/invalid-project
echo "# Invalid Project" > packages/core/tests/fixtures/invalid-project/README.md
# Note: no AGENTS.md in invalid-project
```

- [ ] **Step 2: Write failing test for required file exists**

```typescript
// packages/core/tests/validation/file-structure.test.ts
import { describe, it, expect } from 'vitest';
import { validateFileStructure } from '../../src/validation/file-structure';
import { join } from 'path';
import type { Convention } from '../../src/validation/types';

describe('validateFileStructure', () => {
  it('should validate when required files exist', async () => {
    const conventions: Convention[] = [
      {
        pattern: 'README.md',
        required: true,
        description: 'Project README',
        examples: ['README.md'],
      },
      {
        pattern: 'AGENTS.md',
        required: true,
        description: 'Knowledge map',
        examples: ['AGENTS.md'],
      },
    ];

    const rootDir = join(__dirname, '../fixtures/valid-project');
    const result = await validateFileStructure(conventions, rootDir);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.valid).toBe(true);
      expect(result.value.missing).toHaveLength(0);
      expect(result.value.conformance).toBe(100);
    }
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd packages/core && pnpm test file-structure.test.ts`
Expected: FAIL - "Cannot find module '../../src/validation/file-structure'"

- [ ] **Step 4: Implement validateFileStructure (minimal)**

```typescript
// packages/core/src/validation/file-structure.ts
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import type { ValidationError } from '../shared/errors';
import { createError } from '../shared/errors';
import type { Convention, StructureValidation } from './types';
import { findFiles } from '../shared/fs-utils';

export async function validateFileStructure(
  conventions: Convention[],
  rootDir: string = process.cwd()
): Promise<Result<StructureValidation, ValidationError>> {
  const missing: string[] = [];
  const unexpected: string[] = [];

  let totalRequired = 0;
  let foundRequired = 0;

  for (const convention of conventions) {
    const files = await findFiles(convention.pattern, rootDir);

    if (convention.required) {
      totalRequired++;
      if (files.length > 0) {
        foundRequired++;
      } else {
        missing.push(convention.pattern);
      }
    }
  }

  const conformance = totalRequired > 0 ? Math.round((foundRequired / totalRequired) * 100) : 100;
  const valid = missing.length === 0 && unexpected.length === 0;

  return Ok({
    valid,
    missing,
    unexpected,
    conformance,
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/core && pnpm test file-structure.test.ts`
Expected: PASS - 1 test passed

- [ ] **Step 6: Write test for missing required files**

```typescript
// Add to packages/core/tests/validation/file-structure.test.ts
it('should detect missing required files', async () => {
  const conventions: Convention[] = [
    {
      pattern: 'README.md',
      required: true,
      description: 'Project README',
      examples: ['README.md'],
    },
    {
      pattern: 'AGENTS.md',
      required: true,
      description: 'Knowledge map',
      examples: ['AGENTS.md'],
    },
  ];

  const rootDir = join(__dirname, '../fixtures/invalid-project');
  const result = await validateFileStructure(conventions, rootDir);

  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.value.valid).toBe(false);
    expect(result.value.missing).toContain('AGENTS.md');
    expect(result.value.conformance).toBe(50); // 1 of 2 found
  }
});
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd packages/core && pnpm test file-structure.test.ts`
Expected: PASS - 2 tests passed

- [ ] **Step 8: Write test for optional files**

```typescript
// Add to packages/core/tests/validation/file-structure.test.ts
it('should not fail when optional files are missing', async () => {
  const conventions: Convention[] = [
    {
      pattern: 'README.md',
      required: true,
      description: 'Project README',
      examples: ['README.md'],
    },
    {
      pattern: 'CHANGELOG.md',
      required: false,
      description: 'Changelog',
      examples: ['CHANGELOG.md'],
    },
  ];

  const rootDir = join(__dirname, '../fixtures/valid-project');
  const result = await validateFileStructure(conventions, rootDir);

  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.value.valid).toBe(true);
    expect(result.value.conformance).toBe(100); // Only required files count
  }
});
```

- [ ] **Step 9: Run test to verify it passes**

Run: `cd packages/core && pnpm test file-structure.test.ts`
Expected: PASS - 3 tests passed

- [ ] **Step 10: Write test for glob patterns**

```typescript
// Add to packages/core/tests/validation/file-structure.test.ts
it('should support glob patterns', async () => {
  const conventions: Convention[] = [
    {
      pattern: '*.md',
      required: true,
      description: 'Markdown files',
      examples: ['README.md', 'AGENTS.md'],
    },
  ];

  const rootDir = join(__dirname, '../fixtures/valid-project');
  const result = await validateFileStructure(conventions, rootDir);

  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.value.valid).toBe(true);
    expect(result.value.conformance).toBe(100);
  }
});
```

- [ ] **Step 11: Run test to verify it passes**

Run: `cd packages/core && pnpm test file-structure.test.ts`
Expected: PASS - 4 tests passed

- [ ] **Step 12: Commit**

```bash
git add packages/core/src/validation/file-structure.ts packages/core/tests/validation/file-structure.test.ts packages/core/tests/fixtures/
git commit -m "feat(core): implement file structure validation with glob patterns"
```

---

## Chunk 3: Validation Module - Config and Commit Message

### Task 7: Config Validation with Zod

**Files:**
- Create: `packages/core/src/validation/config.ts`
- Create: `packages/core/tests/validation/config.test.ts`

- [ ] **Step 1: Install Zod**

Run: `cd packages/core && pnpm add zod@^3.22.0`
Expected: "dependencies: +zod 3.22.x"

- [ ] **Step 2: Write failing test for valid config**

```typescript
// packages/core/tests/validation/config.test.ts
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { validateConfig } from '../../src/validation/config';

describe('validateConfig', () => {
  it('should validate correct config', () => {
    const schema = z.object({
      name: z.string(),
      version: z.number(),
      enabled: z.boolean(),
    });

    const config = {
      name: 'test',
      version: 1,
      enabled: true,
    };

    const result = validateConfig(config, schema);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(config);
    }
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd packages/core && pnpm test config.test.ts`
Expected: FAIL - "Cannot find module '../../src/validation/config'"

- [ ] **Step 4: Implement validateConfig**

```typescript
// packages/core/src/validation/config.ts
import type { z } from 'zod';
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import type { ConfigError } from './types';
import { createError } from '../shared/errors';

export function validateConfig<T>(
  config: unknown,
  schema: z.ZodSchema<T>
): Result<T, ConfigError> {
  const result = schema.safeParse(config);

  if (result.success) {
    return Ok(result.data);
  }

  // Convert Zod error to ConfigError
  const zodError = result.error;
  const firstIssue = zodError.issues[0];

  return Err(
    createError<ConfigError>(
      'VALIDATION_FAILED',
      firstIssue?.message || 'Validation failed',
      {
        zodError: zodError.format(),
        path: firstIssue?.path,
      },
      zodError.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    )
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/core && pnpm test config.test.ts`
Expected: PASS - 1 test passed

- [ ] **Step 6: Write test for invalid type**

```typescript
// Add to packages/core/tests/validation/config.test.ts
it('should return error for invalid type', () => {
  const schema = z.object({
    name: z.string(),
    version: z.number(),
  });

  const config = {
    name: 'test',
    version: 'not-a-number', // Invalid
  };

  const result = validateConfig(config, schema);

  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error.code).toBe('VALIDATION_FAILED');
    expect(result.error.suggestions.length).toBeGreaterThan(0);
  }
});
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd packages/core && pnpm test config.test.ts`
Expected: PASS - 2 tests passed

- [ ] **Step 8: Write test for missing field**

```typescript
// Add to packages/core/tests/validation/config.test.ts
it('should return error for missing required field', () => {
  const schema = z.object({
    name: z.string(),
    version: z.number(),
  });

  const config = {
    name: 'test',
    // version is missing
  };

  const result = validateConfig(config, schema);

  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error.code).toBe('VALIDATION_FAILED');
    expect(result.error.message).toContain('Required');
  }
});
```

- [ ] **Step 9: Run test to verify it passes**

Run: `cd packages/core && pnpm test config.test.ts`
Expected: PASS - 3 tests passed

- [ ] **Step 10: Write test for nested objects**

```typescript
// Add to packages/core/tests/validation/config.test.ts
it('should validate nested objects', () => {
  const schema = z.object({
    server: z.object({
      host: z.string(),
      port: z.number(),
    }),
  });

  const validConfig = {
    server: {
      host: 'localhost',
      port: 3000,
    },
  };

  const result = validateConfig(validConfig, schema);

  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.value.server.host).toBe('localhost');
    expect(result.value.server.port).toBe(3000);
  }
});
```

- [ ] **Step 11: Run test to verify it passes**

Run: `cd packages/core && pnpm test config.test.ts`
Expected: PASS - 4 tests passed

- [ ] **Step 12: Commit**

```bash
git add packages/core/src/validation/config.ts packages/core/tests/validation/config.test.ts packages/core/package.json pnpm-lock.yaml
git commit -m "feat(core): implement config validation with Zod"
```

---

### Task 8: Commit Message Validation

**Files:**
- Create: `packages/core/src/validation/commit-message.ts`
- Create: `packages/core/tests/validation/commit-message.test.ts`

- [ ] **Step 1: Write failing test for valid conventional commit**

```typescript
// packages/core/tests/validation/commit-message.test.ts
import { describe, it, expect } from 'vitest';
import { validateCommitMessage } from '../../src/validation/commit-message';

describe('validateCommitMessage', () => {
  describe('conventional format', () => {
    it('should validate feat commit', () => {
      const message = 'feat: add new feature';
      const result = validateCommitMessage(message, 'conventional');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.valid).toBe(true);
        expect(result.value.type).toBe('feat');
        expect(result.value.breaking).toBe(false);
        expect(result.value.issues).toHaveLength(0);
      }
    });

    it('should validate fix commit', () => {
      const message = 'fix: resolve bug';
      const result = validateCommitMessage(message, 'conventional');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.valid).toBe(true);
        expect(result.value.type).toBe('fix');
      }
    });

    it('should validate commit with scope', () => {
      const message = 'feat(core): add validation module';
      const result = validateCommitMessage(message, 'conventional');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.valid).toBe(true);
        expect(result.value.type).toBe('feat');
        expect(result.value.scope).toBe('core');
      }
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm test commit-message.test.ts`
Expected: FAIL - "Cannot find module '../../src/validation/commit-message'"

- [ ] **Step 3: Implement validateCommitMessage**

```typescript
// packages/core/src/validation/commit-message.ts
import type { Result } from '../shared/result';
import { Ok } from '../shared/result';
import type { ValidationError } from '../shared/errors';
import type { CommitFormat, CommitValidation } from './types';

const CONVENTIONAL_TYPES = [
  'feat',
  'fix',
  'docs',
  'style',
  'refactor',
  'perf',
  'test',
  'build',
  'ci',
  'chore',
  'revert',
];

export function validateCommitMessage(
  message: string,
  format: CommitFormat = 'conventional'
): Result<CommitValidation, ValidationError> {
  if (format === 'conventional') {
    return validateConventionalCommit(message);
  }

  // For now, only conventional format is supported
  return validateConventionalCommit(message);
}

function validateConventionalCommit(message: string): Result<CommitValidation, ValidationError> {
  const issues: string[] = [];

  // Pattern: type(scope)!: subject
  // Examples: feat: add feature, fix(core): fix bug, feat!: breaking change
  const pattern = /^(\w+)(\(([^)]+)\))?(!)?: (.+)$/;
  const match = message.match(pattern);

  if (!match) {
    issues.push('Commit message does not follow conventional format');
    return Ok({
      valid: false,
      breaking: false,
      issues,
    });
  }

  const [, type, , scope, breakingMarker, subject] = match;

  // Validate type
  if (!CONVENTIONAL_TYPES.includes(type)) {
    issues.push(`Invalid commit type: ${type}. Must be one of: ${CONVENTIONAL_TYPES.join(', ')}`);
  }

  // Validate subject
  if (subject.length === 0) {
    issues.push('Commit subject cannot be empty');
  }

  const breaking = breakingMarker === '!' || message.includes('BREAKING CHANGE:');

  return Ok({
    valid: issues.length === 0,
    type,
    scope,
    breaking,
    issues,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && pnpm test commit-message.test.ts`
Expected: PASS - 3 tests passed

- [ ] **Step 5: Write test for breaking changes**

```typescript
// Add to packages/core/tests/validation/commit-message.test.ts
it('should detect breaking change with !', () => {
  const message = 'feat!: breaking change';
  const result = validateCommitMessage(message, 'conventional');

  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.value.valid).toBe(true);
    expect(result.value.breaking).toBe(true);
  }
});

it('should detect breaking change in body', () => {
  const message = 'feat: add feature\n\nBREAKING CHANGE: API changed';
  const result = validateCommitMessage(message, 'conventional');

  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.value.breaking).toBe(true);
  }
});
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd packages/core && pnpm test commit-message.test.ts`
Expected: PASS - 5 tests passed

- [ ] **Step 7: Write test for invalid format**

```typescript
// Add to packages/core/tests/validation/commit-message.test.ts
it('should reject invalid format', () => {
  const message = 'add new feature'; // Missing type
  const result = validateCommitMessage(message, 'conventional');

  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.value.valid).toBe(false);
    expect(result.value.issues.length).toBeGreaterThan(0);
  }
});

it('should reject invalid type', () => {
  const message = 'invalid: add feature';
  const result = validateCommitMessage(message, 'conventional');

  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.value.valid).toBe(false);
    expect(result.value.issues).toContain(
      expect.stringContaining('Invalid commit type')
    );
  }
});
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd packages/core && pnpm test commit-message.test.ts`
Expected: PASS - 7 tests passed

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/validation/commit-message.ts packages/core/tests/validation/commit-message.test.ts
git commit -m "feat(core): implement commit message validation (conventional format)"
```

---

## Chunk 4: Module Integration and Documentation

### Task 9: Validation Module Exports

**Files:**
- Create: `packages/core/src/validation/index.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Create validation module index**

```typescript
// packages/core/src/validation/index.ts
export { validateFileStructure } from './file-structure';
export { validateConfig } from './config';
export { validateCommitMessage } from './commit-message';

export type {
  Convention,
  StructureValidation,
  ConfigError,
  CommitFormat,
  CommitValidation,
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

// Shared utilities
export type { Result } from './shared/result';
export { Ok, Err, isOk, isErr } from './shared/result';
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

export const VERSION = '0.1.0';
```

- [ ] **Step 3: Add tsx for testing exports**

Run: `cd packages/core && pnpm add -D tsx@^4.7.0`
Expected: "devDependencies: +tsx 4.7.x"

- [ ] **Step 4: Verify exports work**

```typescript
// Create temporary test file: packages/core/test-exports.ts
import {
  validateFileStructure,
  validateConfig,
  validateCommitMessage,
  Ok,
  Err,
  type Result,
  type Convention,
} from './src/index';

console.log('Exports work!');
```

Run: `cd packages/core && npx tsx test-exports.ts`
Expected: "Exports work!"

- [ ] **Step 5: Remove temporary test file**

Run: `cd packages/core && rm test-exports.ts`

- [ ] **Step 6: Verify TypeScript compiles**

Run: `cd packages/core && pnpm typecheck`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/validation/index.ts packages/core/src/index.ts packages/core/package.json pnpm-lock.yaml
git commit -m "feat(core): export validation module APIs"
```

---

### Task 10: Coverage and Final Testing

**Files:**
- None (running existing tests)

- [ ] **Step 1: Run all tests**

Run: `cd packages/core && pnpm test`
Expected: All tests pass

- [ ] **Step 2: Check test coverage**

Run: `cd packages/core && pnpm test:coverage`
Expected: Coverage >80% for all metrics

- [ ] **Step 3: If coverage is below 80%, identify and fix gaps**

Check: Coverage report in `packages/core/coverage/index.html`

If any file shows <80% coverage:
1. Open coverage report in browser
2. Click on file name to see uncovered lines (highlighted in red)
3. For each uncovered line/branch:
   - Write test case that executes that code path
   - Example: If error handling branch is uncovered, write test that triggers the error
4. Re-run: `cd packages/core && pnpm test:coverage`
5. Repeat until all files show ≥80%

Common gaps to check:
- Error handling branches (try/catch blocks)
- Edge cases (empty inputs, null values)
- Type guard else branches
- Early returns in conditional logic

- [ ] **Step 4: Run linter**

Run: `cd packages/core && pnpm lint`
Expected: No linting errors

- [ ] **Step 5: Build the package**

Run: `cd packages/core && pnpm build`
Expected: Build succeeds, dist/ folder created

- [ ] **Step 6: Verify build artifacts**

Run: `cd packages/core && ls -la dist/`
Expected: See index.js, index.mjs, index.d.ts, and module subdirectories

- [ ] **Step 7: Commit if any fixes were needed**

```bash
git add .
git commit -m "test(core): ensure >80% coverage for validation module"
```

---

### Task 11: Update README and Documentation

**Files:**
- Modify: `packages/core/README.md`

- [ ] **Step 1: Write README with usage examples**

```markdown
# @harness-engineering/core

Core library for Harness Engineering toolkit - provides runtime APIs for context engineering, architectural constraints, agent feedback, and entropy management.

## Installation

\`\`\`bash
pnpm add @harness-engineering/core
\`\`\`

## Modules

### Validation Module

Cross-cutting validation utilities used by all other modules.

#### File Structure Validation

Verify project follows file structure conventions:

\`\`\`typescript
import { validateFileStructure, type Convention } from '@harness-engineering/core';

const conventions: Convention[] = [
  {
    pattern: 'README.md',
    required: true,
    description: 'Project README',
    examples: ['README.md'],
  },
  {
    pattern: 'AGENTS.md',
    required: true,
    description: 'Knowledge map',
    examples: ['AGENTS.md'],
  },
];

const result = await validateFileStructure(conventions, './my-project');

if (result.ok) {
  console.log('Valid:', result.value.valid);
  console.log('Conformance:', result.value.conformance + '%');
  console.log('Missing:', result.value.missing);
} else {
  console.error('Error:', result.error.message);
}
\`\`\`

#### Config Validation

Type-safe configuration validation with Zod:

\`\`\`typescript
import { validateConfig } from '@harness-engineering/core';
import { z } from 'zod';

const ConfigSchema = z.object({
  version: z.number(),
  layers: z.array(z.object({
    name: z.string(),
    allowedDependencies: z.array(z.string()),
  })),
});

const result = validateConfig(userConfig, ConfigSchema);

if (result.ok) {
  // TypeScript knows result.value matches ConfigSchema
  console.log('Config version:', result.value.version);
} else {
  console.error('Validation failed:', result.error.message);
  console.error('Suggestions:', result.error.suggestions);
}
\`\`\`

#### Commit Message Validation

Validate commit messages follow conventional format:

\`\`\`typescript
import { validateCommitMessage } from '@harness-engineering/core';

const result = validateCommitMessage('feat(core): add validation module', 'conventional');

if (result.ok) {
  if (result.value.valid) {
    console.log('Type:', result.value.type);      // 'feat'
    console.log('Scope:', result.value.scope);    // 'core'
    console.log('Breaking:', result.value.breaking); // false
  } else {
    console.log('Issues:', result.value.issues);
  }
}
\`\`\`

## Error Handling

All APIs use the `Result<T, E>` pattern for type-safe error handling:

\`\`\`typescript
import { type Result, Ok, Err } from '@harness-engineering/core';

const result: Result<string, Error> = Ok('success');

if (result.ok) {
  console.log(result.value); // TypeScript knows this is string
} else {
  console.error(result.error); // TypeScript knows this is Error
}
\`\`\`

## Development

\`\`\`bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Type checking
pnpm typecheck

# Build
pnpm build

# Lint
pnpm lint
\`\`\`

## License

MIT
```

- [ ] **Step 2: Commit README**

```bash
git add packages/core/README.md
git commit -m "docs(core): add README with validation module usage examples"
```

---

### Task 12: Version and Release Preparation

**Files:**
- Modify: `packages/core/package.json`
- Create: `packages/core/CHANGELOG.md`

- [ ] **Step 1: Verify package.json configuration**

Ensure `packages/core/package.json` has correct fields:

```json
{
  "name": "@harness-engineering/core",
  "version": "0.0.0",
  "main": "./dist/index.js",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "files": [
    "dist/",
    "README.md",
    "CHANGELOG.md"
  ],
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.mjs",
      "require": "./dist/index.js"
    }
  }
}
```

- [ ] **Step 2: Simulate npm publish (dry run)**

Run: `cd packages/core && pnpm pack --dry-run`
Expected: Shows list of files that would be published, verify dist/ folder included

- [ ] **Step 3: Update version to 0.1.0**

Update `packages/core/package.json`:
```json
{
  "version": "0.1.0"
}
```

- [ ] **Step 4: Create CHANGELOG**

```markdown
# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0] - YYYY-MM-DD

_Replace YYYY-MM-DD with actual implementation date_

### Added

- **Validation Module** - Foundation module providing cross-cutting validation utilities
  - File structure validation with glob pattern support
  - Config validation with Zod integration
  - Commit message validation (conventional format)
- **Shared Utilities**
  - Result<T, E> type for type-safe error handling
  - Base error types with structured suggestions
  - File system utilities (fileExists, readFileContent, findFiles)
- Test coverage >80% for all validation module code
- Complete API documentation in README

### Dependencies

- Added: `zod@^3.22.0` for runtime validation
- Added: `glob@^10.3.0` for file pattern matching
```

- [ ] **Step 5: Commit version and changelog**

```bash
git add packages/core/package.json packages/core/CHANGELOG.md
git commit -m "chore(core): prepare v0.1.0 release"
```

- [ ] **Step 6: Tag release**

```bash
git tag @harness-engineering/core@0.1.0
```

- [ ] **Step 7: Build and verify final package**

Run: `cd packages/core && pnpm build && pnpm test`
Expected: All tests pass, build succeeds

- [ ] **Step 8: Verify packaged files**

Run: `cd packages/core && pnpm pack`
Expected: Creates `harness-engineering-core-0.1.0.tgz` file

Run: `tar -tzf harness-engineering-core-0.1.0.tgz | head -20`
Expected: See package/ prefix with dist/, README.md, CHANGELOG.md, package.json

- [ ] **Step 9: Clean up tarball**

Run: `cd packages/core && rm harness-engineering-core-0.1.0.tgz`

- [ ] **Step 10: (Optional) Publish to npm**

**Only run this if you want to publish to npm registry:**

Run: `cd packages/core && pnpm publish --access public`
Expected: Package published to https://www.npmjs.com/package/@harness-engineering/core

**Note**: This step requires npm authentication (`npm login` first)

---

## Success Criteria

Module 1 (Validation) is complete when:

- [ ] All tests passing (run: `cd packages/core && pnpm test`)
- [ ] Test coverage >80% (run: `cd packages/core && pnpm test:coverage`)
- [ ] No linting errors (run: `cd packages/core && pnpm lint`)
- [ ] TypeScript compiles without errors (run: `cd packages/core && pnpm typecheck`)
- [ ] Build succeeds (run: `cd packages/core && pnpm build`)
- [ ] README includes usage examples for all APIs
- [ ] CHANGELOG documents all changes
- [ ] Version set to 0.1.0
- [ ] All changes committed to git
- [ ] Release tagged: `@harness-engineering/core@0.1.0`

---

## Next Steps

After Module 1 is complete:

1. **Publish v0.1.0** (optional) - `pnpm publish --access public`
2. **Create implementation plan for Module 2 (Context Engineering)**
3. **Begin Module 2 implementation** following same TDD approach

---

_Last Updated: 2026-03-11_

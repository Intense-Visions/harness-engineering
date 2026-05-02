# ESLint Plugin Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@harness-engineering/eslint-plugin` with 5 rules enforcing architectural constraints at lint time.

**Architecture:** Standalone ESLint plugin that duplicates the config schema from CLI to avoid circular dependencies. Rules use `@typescript-eslint/utils` for AST traversal. Config-dependent rules become no-ops when no `harness.config.json` is found.

**Tech Stack:** TypeScript, ESLint 8/9, @typescript-eslint/utils, Zod, Vitest, minimatch

**Spec:** [2026-03-13-eslint-plugin-design.md](../specs/2026-03-13-eslint-plugin-design.md)

---

## File Structure

```
packages/eslint-plugin/
├── src/
│   ├── index.ts                    # Plugin entry, exports rules + configs
│   ├── rules/
│   │   ├── index.ts                # Re-exports all rules
│   │   ├── no-layer-violation.ts   # Layer boundary enforcement
│   │   ├── no-circular-deps.ts     # Circular dependency detection
│   │   ├── no-forbidden-imports.ts # Forbidden import patterns
│   │   ├── require-boundary-schema.ts # Zod validation at boundaries
│   │   └── enforce-doc-exports.ts  # JSDoc on exports
│   ├── configs/
│   │   ├── index.ts                # Re-exports configs
│   │   ├── recommended.ts          # Errors for arch, warnings for docs
│   │   └── strict.ts               # All errors
│   └── utils/
│       ├── schema.ts               # Zod schema (duplicated from CLI)
│       ├── config-loader.ts        # Find and load harness.config.json
│       ├── path-utils.ts           # Import path resolution
│       └── ast-helpers.ts          # JSDoc detection, Zod pattern matching
├── tests/
│   ├── rules/
│   │   ├── no-layer-violation.test.ts
│   │   ├── no-circular-deps.test.ts
│   │   ├── no-forbidden-imports.test.ts
│   │   ├── require-boundary-schema.test.ts
│   │   └── enforce-doc-exports.test.ts
│   ├── utils/
│   │   ├── config-loader.test.ts
│   │   └── path-utils.test.ts
│   └── fixtures/
│       └── harness.config.json
├── package.json
├── tsconfig.json
├── vitest.config.mts
└── README.md
```

---

## Chunk 1: Package Setup + Utilities

### Task 1: Initialize Package

**Files:**

- Create: `packages/eslint-plugin/package.json`
- Create: `packages/eslint-plugin/tsconfig.json`
- Create: `packages/eslint-plugin/vitest.config.mts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@harness-engineering/eslint-plugin",
  "version": "0.1.0",
  "description": "ESLint plugin for harness engineering architectural constraints",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src tests",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@typescript-eslint/utils": "^8.0.0",
    "minimatch": "^9.0.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@typescript-eslint/rule-tester": "^8.0.0",
    "@types/node": "^20.0.0",
    "eslint": "^9.0.0",
    "typescript": "^5.0.0",
    "vitest": "^2.0.0"
  },
  "peerDependencies": {
    "eslint": "^8.0.0 || ^9.0.0",
    "typescript": "^5.0.0"
  },
  "keywords": ["eslint", "eslint-plugin", "harness", "architecture", "layers"],
  "license": "MIT"
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Create vitest.config.mts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
    },
  },
});
```

- [ ] **Step 4: Install dependencies**

Run: `cd packages/eslint-plugin && pnpm install`

- [ ] **Step 5: Commit**

```bash
git add packages/eslint-plugin/package.json packages/eslint-plugin/tsconfig.json packages/eslint-plugin/vitest.config.mts
git commit -m "chore(eslint-plugin): initialize package with dependencies"
```

---

### Task 2: Config Schema

**Files:**

- Create: `packages/eslint-plugin/src/utils/schema.ts`
- Create: `packages/eslint-plugin/tests/utils/schema.test.ts`

- [ ] **Step 1: Write schema test**

```typescript
// tests/utils/schema.test.ts
import { describe, it, expect } from 'vitest';
import { HarnessConfigSchema } from '../../src/utils/schema';

describe('HarnessConfigSchema', () => {
  it('validates minimal config', () => {
    const result = HarnessConfigSchema.safeParse({ version: 1 });
    expect(result.success).toBe(true);
  });

  it('validates config with layers', () => {
    const config = {
      version: 1,
      layers: [
        { name: 'types', pattern: 'src/types/**', allowedDependencies: [] },
        { name: 'domain', pattern: 'src/domain/**', allowedDependencies: ['types'] },
      ],
    };
    const result = HarnessConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('validates config with forbiddenImports', () => {
    const config = {
      version: 1,
      forbiddenImports: [{ from: 'src/services/**', disallow: ['react'] }],
    };
    const result = HarnessConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('validates config with boundaries', () => {
    const config = {
      version: 1,
      boundaries: { requireSchema: ['src/api/**/*.ts'] },
    };
    const result = HarnessConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('rejects invalid version', () => {
    const result = HarnessConfigSchema.safeParse({ version: 2 });
    expect(result.success).toBe(false);
  });

  it('rejects layer without required fields', () => {
    const config = {
      version: 1,
      layers: [{ name: 'types' }], // missing pattern and allowedDependencies
    };
    const result = HarnessConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/eslint-plugin && pnpm test -- tests/utils/schema.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement schema**

```typescript
// src/utils/schema.ts
import { z } from 'zod';

/**
 * Layer definition for architectural boundaries
 */
export const LayerSchema = z.object({
  name: z.string(),
  pattern: z.string(),
  allowedDependencies: z.array(z.string()),
});

/**
 * Forbidden import rule
 */
export const ForbiddenImportSchema = z.object({
  from: z.string(),
  disallow: z.array(z.string()),
  message: z.string().optional(),
});

/**
 * Boundary validation config
 */
export const BoundaryConfigSchema = z.object({
  requireSchema: z.array(z.string()),
});

/**
 * Complete harness.config.json schema
 * Duplicated from @harness-engineering/cli to avoid circular dependency
 */
export const HarnessConfigSchema = z.object({
  version: z.literal(1),
  layers: z.array(LayerSchema).optional(),
  forbiddenImports: z.array(ForbiddenImportSchema).optional(),
  boundaries: BoundaryConfigSchema.optional(),
});

export type HarnessConfig = z.infer<typeof HarnessConfigSchema>;
export type Layer = z.infer<typeof LayerSchema>;
export type ForbiddenImport = z.infer<typeof ForbiddenImportSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/eslint-plugin && pnpm test -- tests/utils/schema.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/eslint-plugin/src/utils/schema.ts packages/eslint-plugin/tests/utils/schema.test.ts
git commit -m "feat(eslint-plugin): add config schema with Zod validation"
```

---

### Task 3: Config Loader

**Files:**

- Create: `packages/eslint-plugin/src/utils/config-loader.ts`
- Create: `packages/eslint-plugin/tests/utils/config-loader.test.ts`
- Create: `packages/eslint-plugin/tests/fixtures/harness.config.json`

- [ ] **Step 1: Create test fixture**

```json
// tests/fixtures/harness.config.json
{
  "version": 1,
  "layers": [
    { "name": "types", "pattern": "src/types/**", "allowedDependencies": [] },
    { "name": "domain", "pattern": "src/domain/**", "allowedDependencies": ["types"] },
    {
      "name": "services",
      "pattern": "src/services/**",
      "allowedDependencies": ["types", "domain"]
    },
    {
      "name": "api",
      "pattern": "src/api/**",
      "allowedDependencies": ["types", "domain", "services"]
    }
  ],
  "forbiddenImports": [
    {
      "from": "src/services/**",
      "disallow": ["react", "src/ui/**"],
      "message": "Services cannot import UI code"
    }
  ],
  "boundaries": {
    "requireSchema": ["src/api/**/*.ts"]
  }
}
```

- [ ] **Step 2: Write config loader tests**

```typescript
// tests/utils/config-loader.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { getConfig, clearConfigCache } from '../../src/utils/config-loader';

describe('config-loader', () => {
  const fixturesDir = path.join(__dirname, '../fixtures');
  let tempDir: string;

  beforeEach(() => {
    clearConfigCache();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eslint-plugin-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('finds config in same directory', () => {
    const filePath = path.join(fixturesDir, 'src/file.ts');
    // Copy fixture to temp and test from there
    const config = getConfig(path.join(fixturesDir, 'harness.config.json'));
    expect(config).not.toBeNull();
    expect(config?.version).toBe(1);
  });

  it('finds config in parent directory', () => {
    // Create nested structure
    const nestedDir = path.join(tempDir, 'src', 'deep', 'nested');
    fs.mkdirSync(nestedDir, { recursive: true });
    fs.copyFileSync(
      path.join(fixturesDir, 'harness.config.json'),
      path.join(tempDir, 'harness.config.json')
    );

    const config = getConfig(path.join(nestedDir, 'file.ts'));
    expect(config).not.toBeNull();
    expect(config?.layers).toHaveLength(4);
  });

  it('returns null when no config found', () => {
    const config = getConfig(path.join(tempDir, 'no-config', 'file.ts'));
    expect(config).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    fs.writeFileSync(path.join(tempDir, 'harness.config.json'), 'not json');
    const config = getConfig(path.join(tempDir, 'file.ts'));
    expect(config).toBeNull();
  });

  it('returns null for invalid schema', () => {
    fs.writeFileSync(path.join(tempDir, 'harness.config.json'), JSON.stringify({ version: 99 }));
    const config = getConfig(path.join(tempDir, 'file.ts'));
    expect(config).toBeNull();
  });

  it('caches config for same path', () => {
    fs.copyFileSync(
      path.join(fixturesDir, 'harness.config.json'),
      path.join(tempDir, 'harness.config.json')
    );

    const config1 = getConfig(path.join(tempDir, 'file1.ts'));
    const config2 = getConfig(path.join(tempDir, 'file2.ts'));
    expect(config1).toBe(config2); // Same object reference
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd packages/eslint-plugin && pnpm test -- tests/utils/config-loader.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 4: Implement config loader**

```typescript
// src/utils/config-loader.ts
import * as fs from 'fs';
import * as path from 'path';
import { HarnessConfigSchema, type HarnessConfig } from './schema';

const CONFIG_FILENAME = 'harness.config.json';

let cachedConfig: HarnessConfig | null = null;
let cachedConfigPath: string | null = null;

/**
 * Find harness.config.json by walking up from the given directory
 */
function findConfigFile(startDir: string): string | null {
  let currentDir = path.resolve(startDir);
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    const configPath = path.join(currentDir, CONFIG_FILENAME);
    if (fs.existsSync(configPath)) {
      return configPath;
    }
    currentDir = path.dirname(currentDir);
  }
  return null;
}

/**
 * Load and validate config, with caching
 */
export function getConfig(filePath: string): HarnessConfig | null {
  const configPath = findConfigFile(path.dirname(filePath));
  if (!configPath) {
    return null;
  }

  // Return cached config if same path
  if (cachedConfigPath === configPath && cachedConfig) {
    return cachedConfig;
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const parsed = HarnessConfigSchema.safeParse(JSON.parse(content));
    if (!parsed.success) {
      return null;
    }
    cachedConfig = parsed.data;
    cachedConfigPath = configPath;
    return cachedConfig;
  } catch {
    return null;
  }
}

/**
 * Clear the config cache (for testing)
 */
export function clearConfigCache(): void {
  cachedConfig = null;
  cachedConfigPath = null;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/eslint-plugin && pnpm test -- tests/utils/config-loader.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add packages/eslint-plugin/src/utils/config-loader.ts packages/eslint-plugin/tests/utils/config-loader.test.ts packages/eslint-plugin/tests/fixtures/harness.config.json
git commit -m "feat(eslint-plugin): add config loader with caching"
```

---

### Task 4: Path Utilities

**Files:**

- Create: `packages/eslint-plugin/src/utils/path-utils.ts`
- Create: `packages/eslint-plugin/tests/utils/path-utils.test.ts`

- [ ] **Step 1: Write path utils tests**

```typescript
// tests/utils/path-utils.test.ts
import { describe, it, expect } from 'vitest';
import {
  resolveImportPath,
  matchesPattern,
  getLayerForFile,
  normalizePath,
} from '../../src/utils/path-utils';
import type { Layer } from '../../src/utils/schema';

describe('path-utils', () => {
  describe('resolveImportPath', () => {
    it('resolves relative imports', () => {
      const result = resolveImportPath('../types/user', '/project/src/domain/service.ts');
      expect(result).toBe('src/types/user');
    });

    it('keeps absolute imports unchanged', () => {
      const result = resolveImportPath('lodash', '/project/src/file.ts');
      expect(result).toBe('lodash');
    });

    it('resolves ./ imports', () => {
      const result = resolveImportPath('./helper', '/project/src/domain/service.ts');
      expect(result).toBe('src/domain/helper');
    });
  });

  describe('matchesPattern', () => {
    it('matches glob patterns', () => {
      expect(matchesPattern('src/types/user.ts', 'src/types/**')).toBe(true);
      expect(matchesPattern('src/domain/user.ts', 'src/types/**')).toBe(false);
    });

    it('matches nested paths', () => {
      expect(matchesPattern('src/api/v1/users/handler.ts', 'src/api/**')).toBe(true);
    });

    it('matches exact patterns', () => {
      expect(matchesPattern('src/index.ts', 'src/index.ts')).toBe(true);
    });
  });

  describe('getLayerForFile', () => {
    const layers: Layer[] = [
      { name: 'types', pattern: 'src/types/**', allowedDependencies: [] },
      { name: 'domain', pattern: 'src/domain/**', allowedDependencies: ['types'] },
      { name: 'services', pattern: 'src/services/**', allowedDependencies: ['types', 'domain'] },
    ];

    it('finds layer for matching file', () => {
      expect(getLayerForFile('src/types/user.ts', layers)).toBe('types');
      expect(getLayerForFile('src/domain/user.ts', layers)).toBe('domain');
    });

    it('returns null for non-matching file', () => {
      expect(getLayerForFile('src/other/file.ts', layers)).toBeNull();
    });

    it('returns first matching layer', () => {
      const overlapping: Layer[] = [
        { name: 'first', pattern: 'src/**', allowedDependencies: [] },
        { name: 'second', pattern: 'src/types/**', allowedDependencies: [] },
      ];
      expect(getLayerForFile('src/types/user.ts', overlapping)).toBe('first');
    });
  });

  describe('normalizePath', () => {
    it('extracts path from /project/src/...', () => {
      expect(normalizePath('/project/src/domain/user.ts')).toBe('src/domain/user.ts');
    });

    it('handles deeply nested paths', () => {
      expect(normalizePath('/Users/dev/projects/myapp/src/api/v1/handler.ts')).toBe(
        'src/api/v1/handler.ts'
      );
    });

    it('returns path unchanged if no /src/ found', () => {
      expect(normalizePath('/other/path/file.ts')).toBe('/other/path/file.ts');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/eslint-plugin && pnpm test -- tests/utils/path-utils.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement path utilities**

```typescript
// src/utils/path-utils.ts
import * as path from 'path';
import { minimatch } from 'minimatch';
import type { Layer } from './schema';

/**
 * Resolve an import path relative to the importing file
 * Returns path relative to project root (assumes /project/ prefix)
 */
export function resolveImportPath(importPath: string, importingFile: string): string {
  // External/absolute imports stay as-is
  if (!importPath.startsWith('.')) {
    return importPath;
  }

  // Resolve relative to importing file's directory
  const importingDir = path.dirname(importingFile);
  const resolved = path.resolve(importingDir, importPath);

  // Extract path relative to project root
  // Assumes paths like /project/src/... or /path/to/project/src/...
  const srcIndex = resolved.indexOf('/src/');
  if (srcIndex !== -1) {
    return resolved.slice(srcIndex + 1); // Remove leading /
  }

  // Fallback: return as-is if no src/ found
  return importPath;
}

/**
 * Check if a file path matches a glob pattern
 */
export function matchesPattern(filePath: string, pattern: string): boolean {
  // Normalize path separators
  const normalizedPath = filePath.replace(/\\/g, '/');
  const normalizedPattern = pattern.replace(/\\/g, '/');

  return minimatch(normalizedPath, normalizedPattern, { matchBase: false });
}

/**
 * Find which layer a file belongs to
 */
export function getLayerForFile(filePath: string, layers: Layer[]): string | null {
  for (const layer of layers) {
    if (matchesPattern(filePath, layer.pattern)) {
      return layer.name;
    }
  }
  return null;
}

/**
 * Get layer definition by name
 */
export function getLayerByName(name: string, layers: Layer[]): Layer | undefined {
  return layers.find((l) => l.name === name);
}

/**
 * Normalize a file path to project-relative format
 * Extracts path from /any/path/src/... to src/...
 */
export function normalizePath(filePath: string): string {
  const srcIndex = filePath.indexOf('/src/');
  if (srcIndex !== -1) {
    return filePath.slice(srcIndex + 1);
  }
  return filePath;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/eslint-plugin && pnpm test -- tests/utils/path-utils.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/eslint-plugin/src/utils/path-utils.ts packages/eslint-plugin/tests/utils/path-utils.test.ts
git commit -m "feat(eslint-plugin): add path utilities for import resolution"
```

---

### Task 5: AST Helpers

**Files:**

- Create: `packages/eslint-plugin/src/utils/ast-helpers.ts`
- Create: `packages/eslint-plugin/tests/utils/ast-helpers.test.ts`

- [ ] **Step 1: Write AST helper tests**

```typescript
// tests/utils/ast-helpers.test.ts
import { describe, it, expect } from 'vitest';
import { hasJSDocComment, hasZodValidation } from '../../src/utils/ast-helpers';
import { parse } from '@typescript-eslint/parser';
import type { TSESTree } from '@typescript-eslint/utils';

function parseCode(code: string): TSESTree.Program {
  return parse(code, {
    ecmaVersion: 2020,
    sourceType: 'module',
    range: true,
    comment: true,
  }) as TSESTree.Program;
}

describe('ast-helpers', () => {
  describe('hasJSDocComment', () => {
    it('detects JSDoc comment', () => {
      const code = `
/** This is JSDoc */
export function foo() {}
`;
      const ast = parseCode(code);
      const exportDecl = ast.body[0] as TSESTree.ExportNamedDeclaration;
      expect(hasJSDocComment(exportDecl, code)).toBe(true);
    });

    it('returns false for regular comment', () => {
      const code = `
// Not JSDoc
export function foo() {}
`;
      const ast = parseCode(code);
      const exportDecl = ast.body[0] as TSESTree.ExportNamedDeclaration;
      expect(hasJSDocComment(exportDecl, code)).toBe(false);
    });

    it('returns false for no comment', () => {
      const code = `export function foo() {}`;
      const ast = parseCode(code);
      const exportDecl = ast.body[0] as TSESTree.ExportNamedDeclaration;
      expect(hasJSDocComment(exportDecl, code)).toBe(false);
    });
  });

  describe('hasZodValidation', () => {
    it('detects schema.parse() call', () => {
      const code = `
export function handler(input: unknown) {
  const data = schema.parse(input);
  return data;
}
`;
      const ast = parseCode(code);
      const exportDecl = ast.body[0] as TSESTree.ExportNamedDeclaration;
      const funcDecl = exportDecl.declaration as TSESTree.FunctionDeclaration;
      expect(hasZodValidation(funcDecl.body!)).toBe(true);
    });

    it('detects z.object().parse() call', () => {
      const code = `
export function handler(input: unknown) {
  const data = z.object({ name: z.string() }).parse(input);
  return data;
}
`;
      const ast = parseCode(code);
      const exportDecl = ast.body[0] as TSESTree.ExportNamedDeclaration;
      const funcDecl = exportDecl.declaration as TSESTree.FunctionDeclaration;
      expect(hasZodValidation(funcDecl.body!)).toBe(true);
    });

    it('detects safeParse() call', () => {
      const code = `
export function handler(input: unknown) {
  const result = schema.safeParse(input);
  return result;
}
`;
      const ast = parseCode(code);
      const exportDecl = ast.body[0] as TSESTree.ExportNamedDeclaration;
      const funcDecl = exportDecl.declaration as TSESTree.FunctionDeclaration;
      expect(hasZodValidation(funcDecl.body!)).toBe(true);
    });

    it('returns false when no validation', () => {
      const code = `
export function handler(input: unknown) {
  return input;
}
`;
      const ast = parseCode(code);
      const exportDecl = ast.body[0] as TSESTree.ExportNamedDeclaration;
      const funcDecl = exportDecl.declaration as TSESTree.FunctionDeclaration;
      expect(hasZodValidation(funcDecl.body!)).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/eslint-plugin && pnpm test -- tests/utils/ast-helpers.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement AST helpers**

```typescript
// src/utils/ast-helpers.ts
import type { TSESTree } from '@typescript-eslint/utils';

/**
 * Check if a node has a preceding JSDoc comment
 */
export function hasJSDocComment(node: TSESTree.Node, sourceCode: string): boolean {
  if (!node.range) return false;

  // Get text before the node
  const textBefore = sourceCode.slice(0, node.range[0]);
  const lines = textBefore.split('\n');

  // Look backwards for /** ... */
  let foundJSDoc = false;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();

    // Empty line or whitespace - keep looking
    if (line === '') continue;

    // Found JSDoc end
    if (line.endsWith('*/')) {
      // Check if it's JSDoc (starts with /**)
      const startIdx = textBefore.lastIndexOf('/**');
      const endIdx = textBefore.lastIndexOf('*/');
      if (startIdx !== -1 && endIdx > startIdx) {
        foundJSDoc = true;
      }
      break;
    }

    // Found something else - no JSDoc
    break;
  }

  return foundJSDoc;
}

/**
 * Check if a function body contains Zod validation (.parse or .safeParse)
 */
export function hasZodValidation(body: TSESTree.BlockStatement): boolean {
  let found = false;

  function visit(node: TSESTree.Node): void {
    if (found) return;

    if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression') {
      const prop = node.callee.property;
      if (prop.type === 'Identifier' && (prop.name === 'parse' || prop.name === 'safeParse')) {
        found = true;
        return;
      }
    }

    // Recursively visit children
    for (const key of Object.keys(node)) {
      const value = (node as Record<string, unknown>)[key];
      if (value && typeof value === 'object') {
        if (Array.isArray(value)) {
          for (const item of value) {
            if (item && typeof item === 'object' && 'type' in item) {
              visit(item as TSESTree.Node);
            }
          }
        } else if ('type' in value) {
          visit(value as TSESTree.Node);
        }
      }
    }
  }

  visit(body);
  return found;
}

/**
 * Check if a node is marked with @internal
 */
export function isMarkedInternal(node: TSESTree.Node, sourceCode: string): boolean {
  if (!node.range) return false;

  const textBefore = sourceCode.slice(0, node.range[0]);
  const lastComment = textBefore.lastIndexOf('/**');
  if (lastComment === -1) return false;

  const commentEnd = textBefore.lastIndexOf('*/');
  if (commentEnd === -1 || commentEnd < lastComment) return false;

  const comment = textBefore.slice(lastComment, commentEnd + 2);
  return comment.includes('@internal');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/eslint-plugin && pnpm test -- tests/utils/ast-helpers.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/eslint-plugin/src/utils/ast-helpers.ts packages/eslint-plugin/tests/utils/ast-helpers.test.ts
git commit -m "feat(eslint-plugin): add AST helpers for JSDoc and Zod detection"
```

---

### Task 6: Utils Index

**Files:**

- Create: `packages/eslint-plugin/src/utils/index.ts`

- [ ] **Step 1: Create utils index**

```typescript
// src/utils/index.ts
export * from './schema';
export * from './config-loader';
export * from './path-utils';
export * from './ast-helpers';
```

- [ ] **Step 2: Run all utils tests**

Run: `cd packages/eslint-plugin && pnpm test -- tests/utils/`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add packages/eslint-plugin/src/utils/index.ts
git commit -m "feat(eslint-plugin): add utils index re-exports"
```

---

## Chunk 2: Rules (Part 1)

### Task 7: enforce-doc-exports Rule

**Files:**

- Create: `packages/eslint-plugin/src/rules/enforce-doc-exports.ts`
- Create: `packages/eslint-plugin/tests/rules/enforce-doc-exports.test.ts`

- [ ] **Step 1: Write rule tests**

```typescript
// tests/rules/enforce-doc-exports.test.ts
import { RuleTester } from '@typescript-eslint/rule-tester';
import { describe, it, afterAll } from 'vitest';
import rule from '../../src/rules/enforce-doc-exports';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester();

ruleTester.run('enforce-doc-exports', rule, {
  valid: [
    // Function with JSDoc
    {
      code: `
/** Does something */
export function foo() {}
`,
    },
    // Class with JSDoc
    {
      code: `
/** A class */
export class Foo {}
`,
    },
    // Const with JSDoc
    {
      code: `
/** A constant */
export const FOO = 1;
`,
    },
    // Internal export (default ignoreInternal: true)
    {
      code: `
/** @internal */
export function internal() {}
`,
    },
    // Non-exported function (no JSDoc needed)
    {
      code: `function notExported() {}`,
    },
  ],
  invalid: [
    // Missing JSDoc on function
    {
      code: `export function foo() {}`,
      errors: [{ messageId: 'missingJSDoc' }],
    },
    // Missing JSDoc on class
    {
      code: `export class Foo {}`,
      errors: [{ messageId: 'missingJSDoc' }],
    },
    // Missing JSDoc on const
    {
      code: `export const FOO = 1;`,
      errors: [{ messageId: 'missingJSDoc' }],
    },
    // Regular comment doesn't count
    {
      code: `
// Not JSDoc
export function foo() {}
`,
      errors: [{ messageId: 'missingJSDoc' }],
    },
  ],
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/eslint-plugin && pnpm test -- tests/rules/enforce-doc-exports.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement rule**

```typescript
// src/rules/enforce-doc-exports.ts
import { ESLintUtils } from '@typescript-eslint/utils';
import { hasJSDocComment, isMarkedInternal } from '../utils/ast-helpers';

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/harness-engineering/eslint-plugin/blob/main/docs/rules/${name}.md`
);

type Options = [
  {
    ignoreTypes?: boolean;
    ignoreInternal?: boolean;
  },
];

type MessageIds = 'missingJSDoc';

export default createRule<Options, MessageIds>({
  name: 'enforce-doc-exports',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Require JSDoc comments on public exports',
    },
    messages: {
      missingJSDoc: 'Exported {{kind}} "{{name}}" is missing JSDoc documentation',
    },
    schema: [
      {
        type: 'object',
        properties: {
          ignoreTypes: { type: 'boolean', default: false },
          ignoreInternal: { type: 'boolean', default: true },
        },
        additionalProperties: false,
      },
    ],
  },
  defaultOptions: [{ ignoreTypes: false, ignoreInternal: true }],
  create(context, [options]) {
    const sourceCode = context.sourceCode.getText();

    function checkExport(node: Parameters<typeof hasJSDocComment>[0], kind: string, name: string) {
      // Skip if marked @internal and ignoreInternal is true
      if (options.ignoreInternal && isMarkedInternal(node, sourceCode)) {
        return;
      }

      if (!hasJSDocComment(node, sourceCode)) {
        context.report({
          node,
          messageId: 'missingJSDoc',
          data: { kind, name },
        });
      }
    }

    return {
      ExportNamedDeclaration(node) {
        const decl = node.declaration;
        if (!decl) return;

        if (decl.type === 'FunctionDeclaration' && decl.id) {
          checkExport(node, 'function', decl.id.name);
        } else if (decl.type === 'ClassDeclaration' && decl.id) {
          checkExport(node, 'class', decl.id.name);
        } else if (decl.type === 'VariableDeclaration') {
          for (const declarator of decl.declarations) {
            if (declarator.id.type === 'Identifier') {
              checkExport(node, 'variable', declarator.id.name);
            }
          }
        } else if (decl.type === 'TSTypeAliasDeclaration' && !options.ignoreTypes) {
          checkExport(node, 'type', decl.id.name);
        } else if (decl.type === 'TSInterfaceDeclaration' && !options.ignoreTypes) {
          checkExport(node, 'interface', decl.id.name);
        }
      },
    };
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/eslint-plugin && pnpm test -- tests/rules/enforce-doc-exports.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/eslint-plugin/src/rules/enforce-doc-exports.ts packages/eslint-plugin/tests/rules/enforce-doc-exports.test.ts
git commit -m "feat(eslint-plugin): add enforce-doc-exports rule"
```

---

### Task 8: no-circular-deps Rule

**Files:**

- Create: `packages/eslint-plugin/src/rules/no-circular-deps.ts`
- Create: `packages/eslint-plugin/tests/rules/no-circular-deps.test.ts`

- [ ] **Step 1: Write rule tests**

```typescript
// tests/rules/no-circular-deps.test.ts
import { RuleTester } from '@typescript-eslint/rule-tester';
import { describe, it, afterAll, beforeEach } from 'vitest';
import rule, { clearImportGraph } from '../../src/rules/no-circular-deps';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester();

// Clear graph before each test
beforeEach(() => {
  clearImportGraph();
});

ruleTester.run('no-circular-deps', rule, {
  valid: [
    // No circular dependency
    {
      code: `import { foo } from './foo';`,
      filename: '/project/src/bar.ts',
    },
    // External import
    {
      code: `import lodash from 'lodash';`,
      filename: '/project/src/utils.ts',
    },
  ],
  invalid: [],
});

// Additional tests for cycle detection logic
describe('cycle detection', () => {
  beforeEach(() => {
    clearImportGraph();
  });

  it('detects direct cycle A→B→A', () => {
    // Simulate: a.ts imports b.ts, then b.ts imports a.ts
    const { detectCycle, addEdge } = require('../../src/rules/no-circular-deps');

    addEdge('src/a.ts', 'src/b.ts');
    const cycle = detectCycle('src/b.ts', 'src/a.ts');

    expect(cycle).not.toBeNull();
    expect(cycle).toContain('src/a.ts');
    expect(cycle).toContain('src/b.ts');
  });

  it('detects indirect cycle A→B→C→A', () => {
    const { detectCycle, addEdge } = require('../../src/rules/no-circular-deps');

    addEdge('src/a.ts', 'src/b.ts');
    addEdge('src/b.ts', 'src/c.ts');
    const cycle = detectCycle('src/c.ts', 'src/a.ts');

    expect(cycle).not.toBeNull();
    expect(cycle.length).toBeGreaterThanOrEqual(3);
  });

  it('returns null when no cycle', () => {
    const { detectCycle, addEdge } = require('../../src/rules/no-circular-deps');

    addEdge('src/a.ts', 'src/b.ts');
    addEdge('src/b.ts', 'src/c.ts');
    const cycle = detectCycle('src/a.ts', 'src/d.ts');

    expect(cycle).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify structure works**

Run: `cd packages/eslint-plugin && pnpm test -- tests/rules/no-circular-deps.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement rule**

```typescript
// src/rules/no-circular-deps.ts
import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';
import * as path from 'path';

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/harness-engineering/eslint-plugin/blob/main/docs/rules/${name}.md`
);

// Module-level import graph (persists per lint run)
const importGraph = new Map<string, Set<string>>();

/**
 * Clear the import graph (for testing)
 */
export function clearImportGraph(): void {
  importGraph.clear();
}

/**
 * Add an edge to the import graph (exported for testing)
 */
export function addEdge(from: string, to: string): void {
  if (!importGraph.has(from)) {
    importGraph.set(from, new Set());
  }
  importGraph.get(from)!.add(to);
}

/**
 * Check if adding edge from -> to creates a cycle
 * Returns the cycle path if found, null otherwise
 * Exported for testing
 */
export function detectCycle(from: string, to: string): string[] | null {
  // DFS from 'to' back to 'from'
  const visited = new Set<string>();
  const path: string[] = [to];

  function dfs(current: string): boolean {
    if (current === from) {
      return true; // Found cycle
    }
    if (visited.has(current)) {
      return false;
    }
    visited.add(current);

    const deps = importGraph.get(current);
    if (deps) {
      for (const dep of deps) {
        path.push(dep);
        if (dfs(dep)) {
          return true;
        }
        path.pop();
      }
    }
    return false;
  }

  if (dfs(to)) {
    return [from, ...path];
  }
  return null;
}

/**
 * Normalize file path to project-relative
 */
function normalizePath(filePath: string): string {
  // Extract path from /project/src/... or similar
  const srcIndex = filePath.indexOf('/src/');
  if (srcIndex !== -1) {
    return filePath.slice(srcIndex + 1);
  }
  return path.basename(filePath);
}

type MessageIds = 'circularDep';

export default createRule<[], MessageIds>({
  name: 'no-circular-deps',
  meta: {
    type: 'problem',
    docs: {
      description: 'Detect circular import dependencies',
    },
    messages: {
      circularDep: 'Circular dependency detected: {{cycle}}',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const currentFile = normalizePath(context.filename);

    return {
      ImportDeclaration(node: TSESTree.ImportDeclaration) {
        const importPath = node.source.value;

        // Skip external imports
        if (!importPath.startsWith('.')) {
          return;
        }

        // Resolve import to normalized path
        const importingDir = path.dirname(context.filename);
        const resolvedPath = path.resolve(importingDir, importPath);
        const normalizedImport = normalizePath(resolvedPath);

        // Check for cycle before adding edge
        const cycle = detectCycle(currentFile, normalizedImport);
        if (cycle) {
          context.report({
            node,
            messageId: 'circularDep',
            data: {
              cycle: cycle.map((f) => path.basename(f)).join(' → '),
            },
          });
        }

        // Add edge to graph
        if (!importGraph.has(currentFile)) {
          importGraph.set(currentFile, new Set());
        }
        importGraph.get(currentFile)!.add(normalizedImport);
      },
    };
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/eslint-plugin && pnpm test -- tests/rules/no-circular-deps.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/eslint-plugin/src/rules/no-circular-deps.ts packages/eslint-plugin/tests/rules/no-circular-deps.test.ts
git commit -m "feat(eslint-plugin): add no-circular-deps rule"
```

---

### Task 9: no-forbidden-imports Rule

**Files:**

- Create: `packages/eslint-plugin/src/rules/no-forbidden-imports.ts`
- Create: `packages/eslint-plugin/tests/rules/no-forbidden-imports.test.ts`

- [ ] **Step 1: Write rule tests**

```typescript
// tests/rules/no-forbidden-imports.test.ts
import { RuleTester } from '@typescript-eslint/rule-tester';
import { describe, it, afterAll, beforeEach } from 'vitest';
import * as path from 'path';
import rule from '../../src/rules/no-forbidden-imports';
import { clearConfigCache } from '../../src/utils/config-loader';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester();
const fixturesDir = path.join(__dirname, '../fixtures');

beforeEach(() => {
  clearConfigCache();
});

ruleTester.run('no-forbidden-imports', rule, {
  valid: [
    // Allowed import (domain can import types)
    {
      code: `import { User } from '../types/user';`,
      filename: path.join(fixturesDir, 'src/domain/service.ts'),
    },
    // File not matching any 'from' pattern
    {
      code: `import React from 'react';`,
      filename: path.join(fixturesDir, 'src/ui/component.ts'),
    },
    // No config found - rule is no-op
    {
      code: `import anything from 'anywhere';`,
      filename: '/no-config-here/file.ts',
    },
  ],
  invalid: [
    // Services importing react (forbidden)
    {
      code: `import React from 'react';`,
      filename: path.join(fixturesDir, 'src/services/auth.ts'),
      errors: [{ messageId: 'forbiddenImport' }],
    },
    // Services importing from ui (forbidden)
    {
      code: `import { Button } from '../ui/button';`,
      filename: path.join(fixturesDir, 'src/services/user.ts'),
      errors: [{ messageId: 'forbiddenImport' }],
    },
  ],
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/eslint-plugin && pnpm test -- tests/rules/no-forbidden-imports.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement rule**

```typescript
// src/rules/no-forbidden-imports.ts
import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';
import * as path from 'path';
import { getConfig } from '../utils/config-loader';
import { matchesPattern, resolveImportPath } from '../utils/path-utils';

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/harness-engineering/eslint-plugin/blob/main/docs/rules/${name}.md`
);

type MessageIds = 'forbiddenImport';

export default createRule<[], MessageIds>({
  name: 'no-forbidden-imports',
  meta: {
    type: 'problem',
    docs: {
      description: 'Block forbidden imports based on configurable patterns',
    },
    messages: {
      forbiddenImport: '{{message}}',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const config = getConfig(context.filename);
    if (!config?.forbiddenImports?.length) {
      return {}; // No-op if no config
    }

    // Get file path relative to project
    const filePath = normalizePath(context.filename);

    // Find matching rules for this file
    const applicableRules = config.forbiddenImports.filter((rule) =>
      matchesPattern(filePath, rule.from)
    );

    if (applicableRules.length === 0) {
      return {}; // No rules apply to this file
    }

    return {
      ImportDeclaration(node: TSESTree.ImportDeclaration) {
        const importPath = node.source.value;
        const resolvedImport = resolveImportPath(importPath, context.filename);

        for (const rule of applicableRules) {
          for (const disallowed of rule.disallow) {
            // Check if import matches disallow pattern
            const isMatch =
              importPath === disallowed ||
              matchesPattern(resolvedImport, disallowed) ||
              matchesPattern(importPath, disallowed);

            if (isMatch) {
              context.report({
                node,
                messageId: 'forbiddenImport',
                data: {
                  message:
                    rule.message ||
                    `Import "${importPath}" is forbidden in files matching "${rule.from}"`,
                },
              });
              return; // Report once per import
            }
          }
        }
      },
    };
  },
});

function normalizePath(filePath: string): string {
  const srcIndex = filePath.indexOf('/src/');
  if (srcIndex !== -1) {
    return filePath.slice(srcIndex + 1);
  }
  return filePath;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/eslint-plugin && pnpm test -- tests/rules/no-forbidden-imports.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/eslint-plugin/src/rules/no-forbidden-imports.ts packages/eslint-plugin/tests/rules/no-forbidden-imports.test.ts
git commit -m "feat(eslint-plugin): add no-forbidden-imports rule"
```

---

## Chunk 3: Rules (Part 2) + Configs

### Task 10: no-layer-violation Rule

**Files:**

- Create: `packages/eslint-plugin/src/rules/no-layer-violation.ts`
- Create: `packages/eslint-plugin/tests/rules/no-layer-violation.test.ts`

- [ ] **Step 1: Write rule tests**

```typescript
// tests/rules/no-layer-violation.test.ts
import { RuleTester } from '@typescript-eslint/rule-tester';
import { describe, it, afterAll, beforeEach } from 'vitest';
import * as path from 'path';
import rule from '../../src/rules/no-layer-violation';
import { clearConfigCache } from '../../src/utils/config-loader';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester();
const fixturesDir = path.join(__dirname, '../fixtures');

beforeEach(() => {
  clearConfigCache();
});

ruleTester.run('no-layer-violation', rule, {
  valid: [
    // Domain can import from types
    {
      code: `import { User } from '../types/user';`,
      filename: path.join(fixturesDir, 'src/domain/service.ts'),
    },
    // Services can import from domain
    {
      code: `import { processUser } from '../domain/user';`,
      filename: path.join(fixturesDir, 'src/services/auth.ts'),
    },
    // Services can import from types
    {
      code: `import { Config } from '../types/config';`,
      filename: path.join(fixturesDir, 'src/services/config.ts'),
    },
    // API can import from services
    {
      code: `import { authService } from '../services/auth';`,
      filename: path.join(fixturesDir, 'src/api/routes.ts'),
    },
    // External imports are always allowed
    {
      code: `import lodash from 'lodash';`,
      filename: path.join(fixturesDir, 'src/types/utils.ts'),
    },
    // No config - rule is no-op
    {
      code: `import anything from './anywhere';`,
      filename: '/no-config/file.ts',
    },
  ],
  invalid: [
    // Types cannot import from domain
    {
      code: `import { handler } from '../domain/handler';`,
      filename: path.join(fixturesDir, 'src/types/user.ts'),
      errors: [{ messageId: 'layerViolation' }],
    },
    // Types cannot import from services
    {
      code: `import { authService } from '../services/auth';`,
      filename: path.join(fixturesDir, 'src/types/user.ts'),
      errors: [{ messageId: 'layerViolation' }],
    },
    // Domain cannot import from services
    {
      code: `import { authService } from '../services/auth';`,
      filename: path.join(fixturesDir, 'src/domain/user.ts'),
      errors: [{ messageId: 'layerViolation' }],
    },
    // Domain cannot import from api
    {
      code: `import { router } from '../api/routes';`,
      filename: path.join(fixturesDir, 'src/domain/user.ts'),
      errors: [{ messageId: 'layerViolation' }],
    },
  ],
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/eslint-plugin && pnpm test -- tests/rules/no-layer-violation.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement rule**

```typescript
// src/rules/no-layer-violation.ts
import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';
import { getConfig } from '../utils/config-loader';
import { resolveImportPath, getLayerForFile, getLayerByName } from '../utils/path-utils';

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/harness-engineering/eslint-plugin/blob/main/docs/rules/${name}.md`
);

type MessageIds = 'layerViolation';

export default createRule<[], MessageIds>({
  name: 'no-layer-violation',
  meta: {
    type: 'problem',
    docs: {
      description: 'Enforce layer boundary imports',
    },
    messages: {
      layerViolation: 'Layer "{{fromLayer}}" cannot import from layer "{{toLayer}}"',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const config = getConfig(context.filename);
    if (!config?.layers?.length) {
      return {}; // No-op if no layers configured
    }

    const filePath = normalizePath(context.filename);
    const currentLayer = getLayerForFile(filePath, config.layers);

    if (!currentLayer) {
      return {}; // File not in any layer
    }

    const currentLayerDef = getLayerByName(currentLayer, config.layers);
    if (!currentLayerDef) {
      return {};
    }

    return {
      ImportDeclaration(node: TSESTree.ImportDeclaration) {
        const importPath = node.source.value;

        // Skip external imports
        if (!importPath.startsWith('.')) {
          return;
        }

        const resolvedImport = resolveImportPath(importPath, context.filename);
        const importLayer = getLayerForFile(resolvedImport, config.layers!);

        // Skip if import is not in any layer
        if (!importLayer) {
          return;
        }

        // Check if import is allowed
        if (
          importLayer !== currentLayer &&
          !currentLayerDef.allowedDependencies.includes(importLayer)
        ) {
          context.report({
            node,
            messageId: 'layerViolation',
            data: {
              fromLayer: currentLayer,
              toLayer: importLayer,
            },
          });
        }
      },
    };
  },
});

function normalizePath(filePath: string): string {
  const srcIndex = filePath.indexOf('/src/');
  if (srcIndex !== -1) {
    return filePath.slice(srcIndex + 1);
  }
  return filePath;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/eslint-plugin && pnpm test -- tests/rules/no-layer-violation.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/eslint-plugin/src/rules/no-layer-violation.ts packages/eslint-plugin/tests/rules/no-layer-violation.test.ts
git commit -m "feat(eslint-plugin): add no-layer-violation rule"
```

---

### Task 11: require-boundary-schema Rule

**Files:**

- Create: `packages/eslint-plugin/src/rules/require-boundary-schema.ts`
- Create: `packages/eslint-plugin/tests/rules/require-boundary-schema.test.ts`

- [ ] **Step 1: Write rule tests**

```typescript
// tests/rules/require-boundary-schema.test.ts
import { RuleTester } from '@typescript-eslint/rule-tester';
import { describe, it, afterAll, beforeEach } from 'vitest';
import * as path from 'path';
import rule from '../../src/rules/require-boundary-schema';
import { clearConfigCache } from '../../src/utils/config-loader';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester();
const fixturesDir = path.join(__dirname, '../fixtures');

beforeEach(() => {
  clearConfigCache();
});

ruleTester.run('require-boundary-schema', rule, {
  valid: [
    // Has schema.parse()
    {
      code: `
export function handler(input: unknown) {
  const data = schema.parse(input);
  return data;
}
`,
      filename: path.join(fixturesDir, 'src/api/users.ts'),
    },
    // Has z.object().parse()
    {
      code: `
export function handler(input: unknown) {
  const data = z.object({ name: z.string() }).parse(input);
  return data;
}
`,
      filename: path.join(fixturesDir, 'src/api/users.ts'),
    },
    // Has safeParse()
    {
      code: `
export function handler(input: unknown) {
  const result = UserSchema.safeParse(input);
  if (!result.success) throw new Error('Invalid');
  return result.data;
}
`,
      filename: path.join(fixturesDir, 'src/api/users.ts'),
    },
    // Non-API file - not checked
    {
      code: `export function helper() { return 1; }`,
      filename: path.join(fixturesDir, 'src/utils/helper.ts'),
    },
    // No config - rule is no-op
    {
      code: `export function anything() {}`,
      filename: '/no-config/file.ts',
    },
  ],
  invalid: [
    // Missing validation
    {
      code: `
export function handler(input: unknown) {
  return input;
}
`,
      filename: path.join(fixturesDir, 'src/api/users.ts'),
      errors: [{ messageId: 'missingSchema' }],
    },
    // Has Zod import but doesn't use it
    {
      code: `
import { z } from 'zod';
export function handler(input: unknown) {
  return input;
}
`,
      filename: path.join(fixturesDir, 'src/api/users.ts'),
      errors: [{ messageId: 'missingSchema' }],
    },
  ],
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/eslint-plugin && pnpm test -- tests/rules/require-boundary-schema.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement rule**

```typescript
// src/rules/require-boundary-schema.ts
import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';
import { getConfig } from '../utils/config-loader';
import { matchesPattern } from '../utils/path-utils';
import { hasZodValidation } from '../utils/ast-helpers';

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/harness-engineering/eslint-plugin/blob/main/docs/rules/${name}.md`
);

type MessageIds = 'missingSchema';

export default createRule<[], MessageIds>({
  name: 'require-boundary-schema',
  meta: {
    type: 'problem',
    docs: {
      description: 'Require Zod schema validation at API boundaries',
    },
    messages: {
      missingSchema:
        'Exported function "{{name}}" at API boundary must validate input with Zod schema',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const config = getConfig(context.filename);
    if (!config?.boundaries?.requireSchema?.length) {
      return {}; // No-op if no boundaries configured
    }

    const filePath = normalizePath(context.filename);

    // Check if file matches any boundary pattern
    const isBoundaryFile = config.boundaries.requireSchema.some((pattern) =>
      matchesPattern(filePath, pattern)
    );

    if (!isBoundaryFile) {
      return {}; // Not a boundary file
    }

    return {
      ExportNamedDeclaration(node: TSESTree.ExportNamedDeclaration) {
        const decl = node.declaration;

        // Only check function declarations
        if (decl?.type !== 'FunctionDeclaration' || !decl.id || !decl.body) {
          return;
        }

        // Check if function has Zod validation
        if (!hasZodValidation(decl.body)) {
          context.report({
            node: decl,
            messageId: 'missingSchema',
            data: { name: decl.id.name },
          });
        }
      },
    };
  },
});

function normalizePath(filePath: string): string {
  const srcIndex = filePath.indexOf('/src/');
  if (srcIndex !== -1) {
    return filePath.slice(srcIndex + 1);
  }
  return filePath;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/eslint-plugin && pnpm test -- tests/rules/require-boundary-schema.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/eslint-plugin/src/rules/require-boundary-schema.ts packages/eslint-plugin/tests/rules/require-boundary-schema.test.ts
git commit -m "feat(eslint-plugin): add require-boundary-schema rule"
```

---

### Task 12: Rules Index

**Files:**

- Create: `packages/eslint-plugin/src/rules/index.ts`

- [ ] **Step 1: Create rules index**

```typescript
// src/rules/index.ts
import enforceDocExports from './enforce-doc-exports';
import noCircularDeps from './no-circular-deps';
import noForbiddenImports from './no-forbidden-imports';
import noLayerViolation from './no-layer-violation';
import requireBoundarySchema from './require-boundary-schema';

export const rules = {
  'enforce-doc-exports': enforceDocExports,
  'no-circular-deps': noCircularDeps,
  'no-forbidden-imports': noForbiddenImports,
  'no-layer-violation': noLayerViolation,
  'require-boundary-schema': requireBoundarySchema,
};
```

- [ ] **Step 2: Run all rule tests**

Run: `cd packages/eslint-plugin && pnpm test -- tests/rules/`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add packages/eslint-plugin/src/rules/index.ts
git commit -m "feat(eslint-plugin): add rules index"
```

---

### Task 13: Configs

**Files:**

- Create: `packages/eslint-plugin/src/configs/recommended.ts`
- Create: `packages/eslint-plugin/src/configs/strict.ts`
- Create: `packages/eslint-plugin/src/configs/index.ts`

- [ ] **Step 1: Create recommended config**

```typescript
// src/configs/recommended.ts
import type { TSESLint } from '@typescript-eslint/utils';

const config: TSESLint.FlatConfig.Config = {
  plugins: {
    '@harness-engineering': {
      rules: {}, // Will be populated by index.ts
    } as TSESLint.FlatConfig.Plugin,
  },
  rules: {
    '@harness-engineering/no-layer-violation': 'error',
    '@harness-engineering/no-circular-deps': 'error',
    '@harness-engineering/no-forbidden-imports': 'error',
    '@harness-engineering/require-boundary-schema': 'warn',
    '@harness-engineering/enforce-doc-exports': 'warn',
  },
};

export default config;
```

- [ ] **Step 2: Create strict config**

```typescript
// src/configs/strict.ts
import type { TSESLint } from '@typescript-eslint/utils';

const config: TSESLint.FlatConfig.Config = {
  plugins: {
    '@harness-engineering': {
      rules: {}, // Will be populated by index.ts
    } as TSESLint.FlatConfig.Plugin,
  },
  rules: {
    '@harness-engineering/no-layer-violation': 'error',
    '@harness-engineering/no-circular-deps': 'error',
    '@harness-engineering/no-forbidden-imports': 'error',
    '@harness-engineering/require-boundary-schema': 'error',
    '@harness-engineering/enforce-doc-exports': 'error',
  },
};

export default config;
```

- [ ] **Step 3: Create configs index**

```typescript
// src/configs/index.ts
import recommended from './recommended';
import strict from './strict';

export const configs = {
  recommended,
  strict,
};
```

- [ ] **Step 4: Commit**

```bash
git add packages/eslint-plugin/src/configs/
git commit -m "feat(eslint-plugin): add recommended and strict configs"
```

---

## Chunk 4: Plugin Entry + README

### Task 14: Plugin Entry Point

**Files:**

- Create: `packages/eslint-plugin/src/index.ts`

- [ ] **Step 1: Create plugin entry**

```typescript
// src/index.ts
import { rules } from './rules';

// Define the plugin object
const plugin = {
  meta: {
    name: '@harness-engineering/eslint-plugin',
    version: '0.1.0',
  },
  rules,
  configs: {
    recommended: {
      plugins: {
        get '@harness-engineering'() {
          return plugin;
        },
      },
      rules: {
        '@harness-engineering/no-layer-violation': 'error',
        '@harness-engineering/no-circular-deps': 'error',
        '@harness-engineering/no-forbidden-imports': 'error',
        '@harness-engineering/require-boundary-schema': 'warn',
        '@harness-engineering/enforce-doc-exports': 'warn',
      },
    },
    strict: {
      plugins: {
        get '@harness-engineering'() {
          return plugin;
        },
      },
      rules: {
        '@harness-engineering/no-layer-violation': 'error',
        '@harness-engineering/no-circular-deps': 'error',
        '@harness-engineering/no-forbidden-imports': 'error',
        '@harness-engineering/require-boundary-schema': 'error',
        '@harness-engineering/enforce-doc-exports': 'error',
      },
    },
  },
};

// ESM default export
export default plugin;

// Named exports for flexibility
export { rules };
export const configs = plugin.configs;
```

- [ ] **Step 2: Build the package**

Run: `cd packages/eslint-plugin && pnpm build`
Expected: Build succeeds, dist/ created

- [ ] **Step 3: Run all tests**

Run: `cd packages/eslint-plugin && pnpm test`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add packages/eslint-plugin/src/index.ts
git commit -m "feat(eslint-plugin): add plugin entry point with exports"
```

---

### Task 15: README

**Files:**

- Create: `packages/eslint-plugin/README.md`

- [ ] **Step 1: Create README**

````markdown
# @harness-engineering/eslint-plugin

ESLint plugin for enforcing harness engineering architectural constraints.

## Installation

```bash
npm install -D @harness-engineering/eslint-plugin
```
````

## Usage

### ESLint 9.x (Flat Config)

```js
// eslint.config.js
import harness from '@harness-engineering/eslint-plugin';

export default [harness.configs.recommended];
```

### ESLint 8.x (Legacy Config)

```js
// .eslintrc.js
module.exports = {
  plugins: ['@harness-engineering'],
  extends: ['plugin:@harness-engineering/recommended'],
};
```

## Configuration

Create `harness.config.json` in your project root:

```json
{
  "version": 1,
  "layers": [
    { "name": "types", "pattern": "src/types/**", "allowedDependencies": [] },
    { "name": "domain", "pattern": "src/domain/**", "allowedDependencies": ["types"] },
    {
      "name": "services",
      "pattern": "src/services/**",
      "allowedDependencies": ["types", "domain"]
    },
    {
      "name": "api",
      "pattern": "src/api/**",
      "allowedDependencies": ["types", "domain", "services"]
    }
  ],
  "forbiddenImports": [
    { "from": "src/services/**", "disallow": ["react"], "message": "Services cannot import React" }
  ],
  "boundaries": {
    "requireSchema": ["src/api/**/*.ts"]
  }
}
```

## Rules

### Architecture Rules

| Rule                   | Description                     | Default |
| ---------------------- | ------------------------------- | ------- |
| `no-layer-violation`   | Enforce layer boundary imports  | error   |
| `no-circular-deps`     | Detect circular dependencies    | error   |
| `no-forbidden-imports` | Block forbidden import patterns | error   |

### Boundary Rules

| Rule                      | Description                              | Default |
| ------------------------- | ---------------------------------------- | ------- |
| `require-boundary-schema` | Require Zod validation at API boundaries | warn    |

### Documentation Rules

| Rule                  | Description              | Default |
| --------------------- | ------------------------ | ------- |
| `enforce-doc-exports` | Require JSDoc on exports | warn    |

## Configs

- **recommended**: Architecture rules as errors, others as warnings
- **strict**: All rules as errors

## License

MIT

````

- [ ] **Step 2: Commit**

```bash
git add packages/eslint-plugin/README.md
git commit -m "docs(eslint-plugin): add README with usage examples"
````

---

### Task 16: Final Integration Test

**Files:**

- Create: `packages/eslint-plugin/tests/integration/plugin.test.ts`

- [ ] **Step 1: Create integration test**

```typescript
// tests/integration/plugin.test.ts
import { describe, it, expect } from 'vitest';
import plugin from '../../src/index';

describe('plugin exports', () => {
  it('exports all 5 rules', () => {
    expect(Object.keys(plugin.rules)).toHaveLength(5);
    expect(plugin.rules['no-layer-violation']).toBeDefined();
    expect(plugin.rules['no-circular-deps']).toBeDefined();
    expect(plugin.rules['no-forbidden-imports']).toBeDefined();
    expect(plugin.rules['require-boundary-schema']).toBeDefined();
    expect(plugin.rules['enforce-doc-exports']).toBeDefined();
  });

  it('exports recommended config', () => {
    expect(plugin.configs.recommended).toBeDefined();
    expect(plugin.configs.recommended.rules).toBeDefined();
  });

  it('exports strict config', () => {
    expect(plugin.configs.strict).toBeDefined();
    expect(plugin.configs.strict.rules).toBeDefined();
  });

  it('configs reference the plugin', () => {
    const recommended = plugin.configs.recommended;
    expect(recommended.plugins?.['@harness-engineering']).toBe(plugin);
  });
});
```

- [ ] **Step 2: Run full test suite**

Run: `cd packages/eslint-plugin && pnpm test`
Expected: All tests PASS (including integration tests)

- [ ] **Step 3: Run build**

Run: `cd packages/eslint-plugin && pnpm build`
Expected: Build succeeds, `dist/` created with `.js` and `.d.ts` files

- [ ] **Step 4: Verify workspace registration**

Run: `pnpm list --filter @harness-engineering/eslint-plugin`
Expected: Package is listed in workspace. If not found, verify `packages/eslint-plugin` is in `pnpm-workspace.yaml` packages array.

- [ ] **Step 5: Run monorepo tests**

Run: `pnpm test`
Expected: All packages pass

- [ ] **Step 6: Verify plugin loads in ESLint**

Create temporary test file and run:

```bash
cd packages/eslint-plugin
echo 'import plugin from "./dist/index.js"; console.log("Rules:", Object.keys(plugin.rules)); console.log("Configs:", Object.keys(plugin.configs));' > /tmp/test-plugin.mjs
node /tmp/test-plugin.mjs
```

Expected output:

```
Rules: [ 'enforce-doc-exports', 'no-circular-deps', 'no-forbidden-imports', 'no-layer-violation', 'require-boundary-schema' ]
Configs: [ 'recommended', 'strict' ]
```

- [ ] **Step 7: Final commit**

```bash
git add .
git commit -m "feat(eslint-plugin): complete ESLint plugin implementation

- 5 rules: no-layer-violation, no-circular-deps, no-forbidden-imports,
  require-boundary-schema, enforce-doc-exports
- 2 configs: recommended, strict
- Full test coverage with integration tests
- ESLint 9.x flat config support"
```

---

## Summary

| Chunk | Tasks | Description                                                                   |
| ----- | ----- | ----------------------------------------------------------------------------- |
| 1     | 1-6   | Package setup + utilities (schema, loader, paths, AST)                        |
| 2     | 7-9   | Rules part 1 (enforce-doc-exports, no-circular-deps, no-forbidden-imports)    |
| 3     | 10-13 | Rules part 2 + configs (no-layer-violation, require-boundary-schema, configs) |
| 4     | 14-16 | Plugin entry + README + integration                                           |

**Total:** 16 tasks, ~80 steps, estimated 2-3 hours for implementation.

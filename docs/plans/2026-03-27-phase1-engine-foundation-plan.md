# Plan: Phase 1 — Multi-Language Engine Foundation

**Date:** 2026-03-27
**Spec:** docs/changes/multi-language-templates/proposal.md
**Estimated tasks:** 8
**Estimated time:** 30 minutes

## Goal

Expand the template engine, schema, and CLI to support multi-language templates with language-aware resolution, framework auto-detection, and existing-project overlay logic that skips non-JSON package configs.

## Observable Truths (Acceptance Criteria)

1. When `TemplateMetadataSchema` parses a template.json with `language`, `tooling`, and `detect` fields, the parse succeeds and all fields are accessible on the result type.
2. When `TemplateMetadataSchema` parses an existing template.json without `language`/`tooling`/`detect`, the parse succeeds (backward compatible — all new fields are optional).
3. When `resolveTemplate(undefined, 'fastapi', 'python')` is called with a python-base and fastapi mock template, the system shall return files from `python-base` merged with `fastapi` overlay (no JS base/level involved).
4. When `resolveTemplate('basic', 'nextjs')` is called (existing JS/TS path), the system shall return the same result as before — no regression.
5. When `resolveTemplate(undefined, undefined, 'python')` is called (bare language scaffold), the system shall return files from `python-base` only.
6. When `detectFramework(targetDir)` is called on a directory containing `requirements.txt` with "fastapi" in it, the system shall return a candidate list including `fastapi`.
7. When `detectFramework(targetDir)` is called on an empty directory, the system shall return an empty candidate list.
8. When `harness init --language python` is invoked, the CLI passes `language: 'python'` to `runInit`.
9. When `harness init --framework fastapi --language go` is invoked (conflict), the system shall return an error before scaffolding.
10. When writing files for a non-JS language to an existing project, the system shall skip package config files (`pyproject.toml`, `go.mod`, `Cargo.toml`, `pom.xml`) and log a message listing dependencies to add manually.
11. When writing files for a JS/TS language to an existing project, the system shall merge `package.json` using existing `mergePackageJson()` (existing behavior preserved).
12. The `HarnessConfigSchema` template field accepts `language` and `tooling` subfields.
13. The `TemplateContext` interface includes `language` and language-specific variables (`goModulePath`, `pythonMinVersion`, `javaGroupId`, `rustEdition`).
14. The MCP `init_project` tool schema accepts a `language` parameter and passes it through.
15. `cd packages/cli && npx vitest run tests/templates/` passes with all new and existing tests.

## File Map

```
MODIFY packages/cli/src/templates/schema.ts          (add language, tooling, detect Zod schemas)
MODIFY packages/cli/tests/templates/schema.test.ts   (add tests for new schema fields)
MODIFY packages/cli/src/templates/engine.ts           (TemplateContext, resolveTemplate signature, detectFramework, write skip logic)
MODIFY packages/cli/tests/templates/engine.test.ts    (add tests for language resolution, detection, skip logic)
CREATE packages/cli/tests/templates/fixtures/mock-templates/python-base/template.json
CREATE packages/cli/tests/templates/fixtures/mock-templates/python-base/pyproject.toml.hbs
CREATE packages/cli/tests/templates/fixtures/mock-templates/python-base/src/__init__.py
CREATE packages/cli/tests/templates/fixtures/mock-templates/fastapi-overlay/template.json
CREATE packages/cli/tests/templates/fixtures/mock-templates/fastapi-overlay/src/main.py
MODIFY packages/cli/src/config/schema.ts              (add language + tooling to template field)
MODIFY packages/cli/src/commands/init.ts              (add --language flag, conflict validation, skip logic, log message)
MODIFY packages/cli/src/mcp/tools/init.ts             (add language param)
```

## Tasks

### Task 1: Expand TemplateMetadataSchema with language, tooling, detect fields (TDD)

**Depends on:** none
**Files:** `packages/cli/tests/templates/schema.test.ts`, `packages/cli/src/templates/schema.ts`

1. Add tests to `packages/cli/tests/templates/schema.test.ts`:

```typescript
it('validates a template with language and tooling fields', () => {
  const result = TemplateMetadataSchema.safeParse({
    name: 'fastapi',
    description: 'FastAPI scaffold',
    version: 1,
    language: 'python',
    framework: 'fastapi',
    extends: 'python-base',
    tooling: {
      packageManager: 'pip',
      linter: 'ruff',
      formatter: 'ruff',
      buildTool: 'setuptools',
      testRunner: 'pytest',
      lockFile: 'requirements.txt',
    },
    detect: [
      { file: 'requirements.txt', contains: 'fastapi' },
      { file: 'pyproject.toml', contains: 'fastapi' },
    ],
  });
  expect(result.success).toBe(true);
  if (!result.success) return;
  expect(result.data.language).toBe('python');
  expect(result.data.tooling?.packageManager).toBe('pip');
  expect(result.data.detect).toHaveLength(2);
});

it('accepts template without new fields (backward compatible)', () => {
  const result = TemplateMetadataSchema.safeParse({
    name: 'basic',
    description: 'Level 1',
    version: 1,
  });
  expect(result.success).toBe(true);
  if (!result.success) return;
  expect(result.data.language).toBeUndefined();
  expect(result.data.tooling).toBeUndefined();
  expect(result.data.detect).toBeUndefined();
});

it('rejects invalid language value', () => {
  const result = TemplateMetadataSchema.safeParse({
    name: 'test',
    description: 'Test',
    version: 1,
    language: 'cobol',
  });
  expect(result.success).toBe(false);
});

it('rejects detect entry missing file field', () => {
  const result = TemplateMetadataSchema.safeParse({
    name: 'test',
    description: 'Test',
    version: 1,
    detect: [{ contains: 'fastapi' }],
  });
  expect(result.success).toBe(false);
});
```

2. Run: `cd packages/cli && npx vitest run tests/templates/schema.test.ts` -- observe failures (language, tooling, detect not in schema).

3. Update `packages/cli/src/templates/schema.ts` -- add new schemas:

```typescript
import { z } from 'zod';

export const LanguageEnum = z.enum(['typescript', 'python', 'go', 'rust', 'java']);

export const ToolingSchema = z.object({
  packageManager: z.string().optional(),
  linter: z.string().optional(),
  formatter: z.string().optional(),
  buildTool: z.string().optional(),
  testRunner: z.string().optional(),
  lockFile: z.string().optional(),
});

export const DetectPatternSchema = z.object({
  file: z.string(),
  contains: z.string().optional(),
});

export const MergeStrategySchema = z.object({
  json: z.enum(['deep-merge', 'overlay-wins']).default('deep-merge'),
  files: z.literal('overlay-wins').default('overlay-wins'),
});

export const TemplateMetadataSchema = z.object({
  name: z.string(),
  description: z.string(),
  level: z.enum(['basic', 'intermediate', 'advanced']).optional(),
  framework: z.string().optional(),
  extends: z.string().optional(),
  mergeStrategy: MergeStrategySchema.default({}),
  version: z.literal(1),
  language: LanguageEnum.optional(),
  tooling: ToolingSchema.optional(),
  detect: z.array(DetectPatternSchema).optional(),
});

export type TemplateMetadata = z.infer<typeof TemplateMetadataSchema>;
export type MergeStrategy = z.infer<typeof MergeStrategySchema>;
export type Tooling = z.infer<typeof ToolingSchema>;
export type DetectPattern = z.infer<typeof DetectPatternSchema>;
export type Language = z.infer<typeof LanguageEnum>;
```

4. Run: `cd packages/cli && npx vitest run tests/templates/schema.test.ts` -- all tests pass.
5. Commit: `feat(templates): expand schema with language, tooling, and detect fields`

---

### Task 2: Update HarnessConfigSchema template field with language and tooling

**Depends on:** Task 1
**Files:** `packages/cli/src/config/schema.ts`, `packages/cli/tests/templates/schema.test.ts`

1. Add tests to `packages/cli/tests/templates/schema.test.ts` in the `HarnessConfigSchema template field` describe block:

```typescript
it('accepts config with language and tooling in template', () => {
  const result = HarnessConfigSchema.safeParse({
    version: 1,
    template: {
      level: 'basic',
      language: 'python',
      framework: 'fastapi',
      version: 1,
      tooling: {
        packageManager: 'pip',
        linter: 'ruff',
      },
    },
  });
  expect(result.success).toBe(true);
});

it('accepts config with language but no level (non-JS template)', () => {
  const result = HarnessConfigSchema.safeParse({
    version: 1,
    template: {
      language: 'go',
      framework: 'gin',
      version: 1,
    },
  });
  expect(result.success).toBe(true);
});
```

2. Run tests -- observe failures (language/tooling not in HarnessConfigSchema template).

3. Modify `packages/cli/src/config/schema.ts` -- update the `template` field in `HarnessConfigSchema`:

Replace the existing template field:

```typescript
template: z
  .object({
    level: z.enum(['basic', 'intermediate', 'advanced']).optional(),
    language: z.enum(['typescript', 'python', 'go', 'rust', 'java']).optional(),
    framework: z.string().optional(),
    version: z.number(),
    tooling: z.object({
      packageManager: z.string().optional(),
      linter: z.string().optional(),
      formatter: z.string().optional(),
      buildTool: z.string().optional(),
      testRunner: z.string().optional(),
      lockFile: z.string().optional(),
    }).optional(),
  })
  .optional(),
```

Note: `level` changes from required to optional since non-JS templates do not use levels.

4. Run: `cd packages/cli && npx vitest run tests/templates/schema.test.ts` -- all tests pass.
5. Commit: `feat(config): add language and tooling to HarnessConfigSchema template field`

---

### Task 3: Create mock template fixtures for python-base and fastapi

**Depends on:** Task 1
**Files:** `packages/cli/tests/templates/fixtures/mock-templates/python-base/template.json`, `packages/cli/tests/templates/fixtures/mock-templates/python-base/pyproject.toml.hbs`, `packages/cli/tests/templates/fixtures/mock-templates/python-base/src/__init__.py`, `packages/cli/tests/templates/fixtures/mock-templates/fastapi-overlay/template.json`, `packages/cli/tests/templates/fixtures/mock-templates/fastapi-overlay/src/main.py`

1. Create `packages/cli/tests/templates/fixtures/mock-templates/python-base/template.json`:

```json
{
  "name": "python-base",
  "description": "Python language base",
  "version": 1,
  "language": "python",
  "tooling": {
    "packageManager": "pip",
    "linter": "ruff",
    "testRunner": "pytest"
  }
}
```

2. Create `packages/cli/tests/templates/fixtures/mock-templates/python-base/pyproject.toml.hbs`:

```
[project]
name = "{{projectName}}"
requires-python = ">={{pythonMinVersion}}"
```

3. Create `packages/cli/tests/templates/fixtures/mock-templates/python-base/src/__init__.py`:

```python
# {{projectName}} package
```

Note: This is a plain file (not .hbs), so it will be copied as-is.

4. Create `packages/cli/tests/templates/fixtures/mock-templates/fastapi-overlay/template.json`:

```json
{
  "name": "fastapi",
  "description": "FastAPI overlay",
  "version": 1,
  "language": "python",
  "framework": "fastapi",
  "extends": "python-base",
  "detect": [
    { "file": "requirements.txt", "contains": "fastapi" },
    { "file": "pyproject.toml", "contains": "fastapi" }
  ]
}
```

5. Create `packages/cli/tests/templates/fixtures/mock-templates/fastapi-overlay/src/main.py`:

```python
from fastapi import FastAPI
app = FastAPI()
```

6. Run: `cd packages/cli && npx vitest run tests/templates/schema.test.ts` -- existing tests still pass (fixtures are inert until engine tests reference them).
7. Commit: `test(templates): add python-base and fastapi mock fixtures`

---

### Task 4: Expand TemplateContext and update resolveTemplate signature for language-aware resolution (TDD)

**Depends on:** Task 1, Task 3
**Files:** `packages/cli/tests/templates/engine.test.ts`, `packages/cli/src/templates/engine.ts`

1. Add tests to `packages/cli/tests/templates/engine.test.ts`:

```typescript
describe('language-aware resolution', () => {
  it('resolves non-JS framework: language-base -> framework overlay', () => {
    const result = engine.resolveTemplate(undefined, 'fastapi', 'python');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const paths = result.value.files.map((f) => f.relativePath);
    // Should include python-base file
    expect(paths).toContain('src/__init__.py');
    // Should include fastapi overlay file
    expect(paths).toContain('src/main.py');
    // Should NOT include JS base files
    expect(paths).not.toContain('shared.txt');
  });

  it('resolves bare language scaffold (language only, no framework)', () => {
    const result = engine.resolveTemplate(undefined, undefined, 'python');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const paths = result.value.files.map((f) => f.relativePath);
    expect(paths).toContain('src/__init__.py');
    // No framework overlay files
    expect(paths).not.toContain('src/main.py');
  });

  it('existing JS/TS resolution is unchanged (level + framework)', () => {
    const result = engine.resolveTemplate('basic', 'nextjs');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const paths = result.value.files.map((f) => f.relativePath);
    expect(paths).toContain('src/app/page.tsx');
    expect(paths).toContain('src/index.ts');
  });

  it('existing JS/TS resolution is unchanged (level only)', () => {
    const result = engine.resolveTemplate('basic');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const paths = result.value.files.map((f) => f.relativePath);
    expect(paths).toContain('shared.txt');
    expect(paths).toContain('package.json.hbs');
  });

  it('returns error for unknown language-base template', () => {
    const result = engine.resolveTemplate(undefined, undefined, 'rust');
    expect(result.ok).toBe(false);
  });
});
```

2. Run: `cd packages/cli && npx vitest run tests/templates/engine.test.ts` -- observe failures.

3. Update `packages/cli/src/templates/engine.ts`:

   a. Update `TemplateContext` interface:

   ```typescript
   export interface TemplateContext {
     projectName: string;
     level?: string;
     framework?: string;
     language?: string;
     goModulePath?: string;
     pythonMinVersion?: string;
     javaGroupId?: string;
     rustEdition?: string;
   }
   ```

   b. Update `resolveTemplate` signature and body:

   ```typescript
   resolveTemplate(level?: string, framework?: string, language?: string): Result<ResolvedTemplate, Error> {
     // Non-JS language path: language-base -> optional framework overlay
     if (language && language !== 'typescript') {
       return this.resolveLanguageTemplate(language, framework);
     }

     // Existing JS/TS path: requires level
     if (!level) {
       return Err(new Error('Level is required for TypeScript/JavaScript templates'));
     }

     const levelDir = this.findTemplateDir(level, 'level');
     if (!levelDir) return Err(new Error(`Template not found for level: ${level}`));

     // ... rest of existing code unchanged ...
   }
   ```

   c. Add `resolveLanguageTemplate` private method:

   ```typescript
   private resolveLanguageTemplate(language: string, framework?: string): Result<ResolvedTemplate, Error> {
     const baseName = `${language}-base`;
     const baseDir = this.findTemplateDir(baseName, 'name');
     if (!baseDir) return Err(new Error(`Language base template not found: ${baseName}`));

     const metaPath = path.join(baseDir, 'template.json');
     const metaRaw = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
     const metaResult = TemplateMetadataSchema.safeParse(metaRaw);
     if (!metaResult.success)
       return Err(new Error(`Invalid template.json in ${baseName}: ${metaResult.error.message}`));

     const metadata = metaResult.data;
     let files = this.collectFiles(baseDir, baseName);

     let overlayMetadata: TemplateMetadata | undefined;
     if (framework) {
       const frameworkDir = this.findTemplateDir(framework, 'framework');
       if (!frameworkDir) return Err(new Error(`Framework template not found: ${framework}`));
       const fMetaPath = path.join(frameworkDir, 'template.json');
       const fMetaRaw = JSON.parse(fs.readFileSync(fMetaPath, 'utf-8'));
       const fMetaResult = TemplateMetadataSchema.safeParse(fMetaRaw);
       if (fMetaResult.success) overlayMetadata = fMetaResult.data;
       const frameworkFiles = this.collectFiles(frameworkDir, framework);
       files = this.mergeFileLists(files, frameworkFiles);
     }

     files = files.filter((f) => f.relativePath !== 'template.json');
     const resolved: ResolvedTemplate = { metadata, files };
     if (overlayMetadata !== undefined) resolved.overlayMetadata = overlayMetadata;
     return Ok(resolved);
   }
   ```

   d. Update `findTemplateDir` to support `'name'` type for direct name lookup:

   ```typescript
   private findTemplateDir(name: string, type: 'level' | 'framework' | 'name'): string | null {
     const entries = fs.readdirSync(this.templatesDir, { withFileTypes: true });
     for (const entry of entries) {
       if (!entry.isDirectory()) continue;
       const metaPath = path.join(this.templatesDir, entry.name, 'template.json');
       if (!fs.existsSync(metaPath)) continue;
       const raw = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
       const parsed = TemplateMetadataSchema.safeParse(raw);
       if (!parsed.success) continue;
       if (type === 'level' && parsed.data.level === name)
         return path.join(this.templatesDir, entry.name);
       if (type === 'framework' && parsed.data.framework === name)
         return path.join(this.templatesDir, entry.name);
       if (type === 'name' && parsed.data.name === name)
         return path.join(this.templatesDir, entry.name);
       if (parsed.data.name === name) return path.join(this.templatesDir, entry.name);
     }
     return null;
   }
   ```

4. Run: `cd packages/cli && npx vitest run tests/templates/engine.test.ts` -- all tests pass.
5. Run: `cd packages/cli && npx vitest run tests/templates/` -- full suite passes (no regressions).
6. Commit: `feat(templates): add language-aware resolution to TemplateEngine`

---

### Task 5: Add detectFramework function (TDD)

**Depends on:** Task 1, Task 3
**Files:** `packages/cli/tests/templates/engine.test.ts`, `packages/cli/src/templates/engine.ts`

1. Add tests to `packages/cli/tests/templates/engine.test.ts`:

```typescript
describe('detectFramework', () => {
  it('detects fastapi from requirements.txt content', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-detect-'));
    fs.writeFileSync(path.join(tmpDir, 'requirements.txt'), 'fastapi==0.100.0\nuvicorn\n');

    const result = engine.detectFramework(tmpDir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBeGreaterThan(0);
    expect(result.value[0].framework).toBe('fastapi');

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('returns empty array when no frameworks detected', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-detect-'));

    const result = engine.detectFramework(tmpDir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([]);

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('scores candidates by number of matching patterns', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-detect-'));
    fs.writeFileSync(path.join(tmpDir, 'requirements.txt'), 'fastapi==0.100.0\n');
    fs.writeFileSync(
      path.join(tmpDir, 'pyproject.toml'),
      '[project]\ndependencies = ["fastapi"]\n'
    );

    const result = engine.detectFramework(tmpDir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBeGreaterThan(0);
    // Two patterns matched = score of 2
    expect(result.value[0].score).toBe(2);

    fs.rmSync(tmpDir, { recursive: true });
  });
});
```

2. Run tests -- observe failures.

3. Add `DetectedFramework` interface and `detectFramework` method to `packages/cli/src/templates/engine.ts`:

```typescript
export interface DetectedFramework {
  framework: string;
  language: string;
  score: number;
  templateName: string;
}
```

Add method to `TemplateEngine`:

```typescript
detectFramework(targetDir: string): Result<DetectedFramework[], Error> {
  try {
    const templatesResult = this.listTemplates();
    if (!templatesResult.ok) return Err(templatesResult.error);

    const candidates: DetectedFramework[] = [];

    for (const meta of templatesResult.value) {
      if (!meta.detect || meta.detect.length === 0) continue;
      if (!meta.framework || !meta.language) continue;

      let score = 0;
      for (const pattern of meta.detect) {
        const filePath = path.join(targetDir, pattern.file);
        if (!fs.existsSync(filePath)) continue;
        if (pattern.contains) {
          const content = fs.readFileSync(filePath, 'utf-8');
          if (content.includes(pattern.contains)) score++;
        } else {
          score++;
        }
      }

      if (score > 0) {
        candidates.push({
          framework: meta.framework,
          language: meta.language,
          score,
          templateName: meta.name,
        });
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    return Ok(candidates);
  } catch (error) {
    return Err(
      new Error(`Framework detection failed: ${error instanceof Error ? error.message : String(error)}`)
    );
  }
}
```

4. Run: `cd packages/cli && npx vitest run tests/templates/engine.test.ts` -- all tests pass.
5. Commit: `feat(templates): add detectFramework for auto-detection`

---

### Task 6: Add existing-project package config skip logic to write method (TDD)

**Depends on:** Task 4
**Files:** `packages/cli/tests/templates/engine.test.ts`, `packages/cli/src/templates/engine.ts`

1. Add tests to `packages/cli/tests/templates/engine.test.ts`:

```typescript
describe('write with existing project skip logic', () => {
  it('skips non-JSON package config files in existing projects', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-write-'));
    // Pre-existing pyproject.toml
    fs.writeFileSync(path.join(tmpDir, 'pyproject.toml'), '[project]\nname = "existing"\n');

    const files = {
      files: [
        { relativePath: 'pyproject.toml', content: '[project]\nname = "new"\n' },
        { relativePath: 'src/main.py', content: 'print("hello")' },
      ],
    };

    const result = engine.write(files, tmpDir, { overwrite: false, language: 'python' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // pyproject.toml should be skipped (not in written list)
    expect(result.value.written).not.toContain('pyproject.toml');
    // src/main.py should be written
    expect(result.value.written).toContain('src/main.py');
    // pyproject.toml content should be unchanged
    const content = fs.readFileSync(path.join(tmpDir, 'pyproject.toml'), 'utf-8');
    expect(content).toContain('existing');
    // skippedConfigs should list pyproject.toml
    expect(result.value.skippedConfigs).toContain('pyproject.toml');

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('merges package.json for JS/TS in existing projects (existing behavior)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-write-'));

    const files = {
      files: [
        { relativePath: 'package.json', content: '{"name":"test","version":"1.0.0"}' },
        { relativePath: 'src/index.ts', content: 'console.log("hi")' },
      ],
    };

    const result = engine.write(files, tmpDir, { overwrite: false });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.written).toContain('package.json');

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('does not skip non-JSON config files when overwrite is true', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-write-'));
    fs.writeFileSync(path.join(tmpDir, 'pyproject.toml'), '[project]\nname = "existing"\n');

    const files = {
      files: [{ relativePath: 'pyproject.toml', content: '[project]\nname = "new"\n' }],
    };

    const result = engine.write(files, tmpDir, { overwrite: true, language: 'python' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.written).toContain('pyproject.toml');

    fs.rmSync(tmpDir, { recursive: true });
  });
});
```

2. Run tests -- observe failures.

3. Update `packages/cli/src/templates/engine.ts`:

   a. Update `WriteOptions` and `write` return type:

   ```typescript
   interface WriteOptions {
     overwrite: boolean;
     language?: string;
   }

   export interface WriteResult {
     written: string[];
     skippedConfigs: string[];
   }
   ```

   b. Add constant for non-JSON package config files:

   ```typescript
   const NON_JSON_PACKAGE_CONFIGS = new Set(['pyproject.toml', 'go.mod', 'Cargo.toml', 'pom.xml']);
   ```

   c. Update `write` method:

   ```typescript
   write(files: RenderedFiles, targetDir: string, options: WriteOptions): Result<WriteResult, Error> {
     try {
       const written: string[] = [];
       const skippedConfigs: string[] = [];
       const isNonJsLanguage = options.language && options.language !== 'typescript';

       for (const file of files.files) {
         const targetPath = path.join(targetDir, file.relativePath);
         const dir = path.dirname(targetPath);

         // Skip non-JSON package configs for non-JS languages when file already exists
         if (!options.overwrite && isNonJsLanguage &&
             NON_JSON_PACKAGE_CONFIGS.has(file.relativePath) &&
             fs.existsSync(targetPath)) {
           skippedConfigs.push(file.relativePath);
           continue;
         }

         if (!options.overwrite && fs.existsSync(targetPath)) continue;
         fs.mkdirSync(dir, { recursive: true });
         fs.writeFileSync(targetPath, file.content);
         written.push(file.relativePath);
       }
       return Ok({ written, skippedConfigs });
     } catch (error) {
       return Err(
         new Error(`Failed to write files: ${error instanceof Error ? error.message : String(error)}`)
       );
     }
   }
   ```

   **IMPORTANT:** This changes the return type from `Result<string[], Error>` to `Result<WriteResult, Error>`. All callers that access `writeResult.value` as an array need to be updated to `writeResult.value.written`. This affects `init.ts` and `mcp/tools/init.ts`.

4. Update callers (minimal — just swap `.value` to `.value.written` where needed):
   - In `packages/cli/src/commands/init.ts`: `writeResult.value` -> `writeResult.value.written` and `result.value.filesCreated` keeps using `written`.
   - In `packages/cli/src/mcp/tools/init.ts`: the `resultToMcpResponse` call wraps the whole result, so it works as-is (the MCP response just changes shape).

5. Run: `cd packages/cli && npx vitest run tests/templates/engine.test.ts` -- all tests pass.
6. Run: `cd packages/cli && npx vitest run tests/templates/` -- full suite passes.
7. Commit: `feat(templates): add package config skip logic for non-JS existing projects`

---

### Task 7: Add --language CLI flag to harness init with conflict validation

**Depends on:** Task 4, Task 6
**Files:** `packages/cli/src/commands/init.ts`

1. Update `packages/cli/src/commands/init.ts`:

   a. Add `language` to `InitOptions`:

   ```typescript
   interface InitOptions {
     cwd?: string;
     name?: string;
     level?: string;
     framework?: string;
     language?: string;
     force?: boolean;
   }
   ```

   b. Add `InitResult` update to include `skippedConfigs`:

   ```typescript
   interface InitResult {
     filesCreated: string[];
     skippedConfigs: string[];
   }
   ```

   c. Update `runInit` to validate framework/language conflict and pass language through:

   ```typescript
   export async function runInit(options: InitOptions): Promise<Result<InitResult, CLIError>> {
     const cwd = options.cwd ?? process.cwd();
     const name = options.name ?? path.basename(cwd);
     const force = options.force ?? false;

     const configPath = path.join(cwd, 'harness.config.json');
     if (!force && fs.existsSync(configPath)) {
       return Err(
         new CLIError('Project already initialized. Use --force to overwrite.', ExitCode.ERROR)
       );
     }

     const templatesDir = resolveTemplatesDir();
     const engine = new TemplateEngine(templatesDir);

     // Validate --framework / --language conflict
     if (options.framework && options.language) {
       // Look up the framework template to get its declared language
       const templates = engine.listTemplates();
       if (templates.ok) {
         const fwTemplate = templates.value.find((t) => t.framework === options.framework);
         if (fwTemplate?.language && fwTemplate.language !== options.language) {
           return Err(
             new CLIError(
               `Framework "${options.framework}" is a ${fwTemplate.language} framework, but --language ${options.language} was specified. Remove --language or use --language ${fwTemplate.language}.`,
               ExitCode.ERROR
             )
           );
         }
       }
     }

     // Determine language: explicit, inferred from framework, or default typescript
     let language = options.language;
     if (!language && options.framework) {
       const templates = engine.listTemplates();
       if (templates.ok) {
         const fwTemplate = templates.value.find((t) => t.framework === options.framework);
         if (fwTemplate?.language) language = fwTemplate.language;
       }
     }

     // Level is required for JS/TS, optional for other languages
     const isNonJs = language && language !== 'typescript';
     const level = isNonJs ? undefined : (options.level ?? 'basic');

     const resolveResult = engine.resolveTemplate(level, options.framework, language);
     if (!resolveResult.ok) {
       return Err(new CLIError(resolveResult.error.message, ExitCode.ERROR));
     }

     const renderResult = engine.render(resolveResult.value, {
       projectName: name,
       level: level ?? '',
       ...(options.framework !== undefined && { framework: options.framework }),
       ...(language !== undefined && { language }),
     });
     if (!renderResult.ok) {
       return Err(new CLIError(renderResult.error.message, ExitCode.ERROR));
     }

     const writeResult = engine.write(renderResult.value, cwd, { overwrite: force, language });
     if (!writeResult.ok) {
       return Err(new CLIError(writeResult.error.message, ExitCode.ERROR));
     }

     // Log skipped config files
     if (writeResult.value.skippedConfigs.length > 0) {
       logger.warn('Skipped existing package config files:');
       for (const file of writeResult.value.skippedConfigs) {
         logger.info(`  - ${file} (add harness dependencies manually)`);
       }
     }

     return Ok({
       filesCreated: writeResult.value.written,
       skippedConfigs: writeResult.value.skippedConfigs,
     });
   }
   ```

   d. Update `createInitCommand` to add `--language` option:

   ```typescript
   .option('--language <language>', 'Target language (typescript, python, go, rust, java)')
   ```

   And pass it in the action:

   ```typescript
   language: opts.language,
   ```

2. Run: `cd packages/cli && npx vitest run tests/templates/` -- all tests pass.
3. Commit: `feat(cli): add --language flag to harness init with conflict validation`

---

### Task 8: Update MCP init_project tool with language parameter

**Depends on:** Task 4, Task 6
**Files:** `packages/cli/src/mcp/tools/init.ts`

1. Update `packages/cli/src/mcp/tools/init.ts`:

   a. Add `language` to the input schema:

   ```typescript
   export const initProjectDefinition = {
     name: 'init_project',
     description: 'Scaffold a new harness engineering project from a template',
     inputSchema: {
       type: 'object' as const,
       properties: {
         path: { type: 'string', description: 'Target directory' },
         name: { type: 'string', description: 'Project name' },
         level: {
           type: 'string',
           enum: ['basic', 'intermediate', 'advanced'],
           description: 'Adoption level (JS/TS only)',
         },
         framework: {
           type: 'string',
           description: 'Framework overlay (e.g., nextjs, fastapi, gin)',
         },
         language: {
           type: 'string',
           enum: ['typescript', 'python', 'go', 'rust', 'java'],
           description: 'Target language',
         },
       },
       required: ['path'],
     },
   };
   ```

   b. Update handler signature and logic:

   ```typescript
   export async function handleInitProject(input: {
     path: string;
     name?: string;
     level?: string;
     framework?: string;
     language?: string;
   }) {
     try {
       const { TemplateEngine } = await import('../../templates/engine.js');
       const templatesDir = resolveTemplatesDir();
       const engine = new TemplateEngine(templatesDir);

       const language = input.language;
       const isNonJs = language && language !== 'typescript';
       const level = isNonJs ? undefined : (input.level ?? 'basic');

       const resolveResult = engine.resolveTemplate(level, input.framework, language);
       if (!resolveResult.ok) return resultToMcpResponse(resolveResult);

       const safePath = sanitizePath(input.path);
       const renderResult = engine.render(resolveResult.value, {
         projectName: input.name ?? path.basename(safePath),
         level: level ?? '',
         ...(input.framework !== undefined && { framework: input.framework }),
         ...(language !== undefined && { language }),
       });
       if (!renderResult.ok) return resultToMcpResponse(renderResult);

       const writeResult = engine.write(renderResult.value, safePath, {
         overwrite: false,
         language,
       });

       if (writeResult.ok && writeResult.value.skippedConfigs.length > 0) {
         const skippedMsg = writeResult.value.skippedConfigs
           .map((f: string) => `  - ${f}`)
           .join('\n');
         return {
           content: [
             {
               type: 'text' as const,
               text: `Files written: ${writeResult.value.written.join(', ')}\n\nSkipped existing config files (add harness dependencies manually):\n${skippedMsg}`,
             },
           ],
           isError: false,
         };
       }

       return resultToMcpResponse(writeResult);
     } catch (error) {
       return {
         content: [
           {
             type: 'text' as const,
             text: `Init failed: ${error instanceof Error ? error.message : String(error)}`,
           },
         ],
         isError: true,
       };
     }
   }
   ```

2. Run: `cd packages/cli && npx vitest run tests/templates/` -- all tests pass.
3. Commit: `feat(mcp): add language parameter to init_project tool`

---

## Traceability Matrix

| Observable Truth                                 | Delivered by Task(s) |
| ------------------------------------------------ | -------------------- |
| 1. Schema parses language/tooling/detect         | Task 1               |
| 2. Backward compatible schema                    | Task 1               |
| 3. Non-JS framework resolution                   | Task 4               |
| 4. JS/TS resolution unchanged                    | Task 4               |
| 5. Bare language scaffold                        | Task 4               |
| 6. detectFramework finds fastapi                 | Task 5               |
| 7. detectFramework empty on empty dir            | Task 5               |
| 8. --language flag passes through                | Task 7               |
| 9. --framework/--language conflict error         | Task 7               |
| 10. Skip non-JSON configs, log message           | Task 6, Task 7       |
| 11. JS/TS package.json merge preserved           | Task 6               |
| 12. HarnessConfigSchema accepts language/tooling | Task 2               |
| 13. TemplateContext includes language vars       | Task 4               |
| 14. MCP init_project accepts language            | Task 8               |
| 15. Full test suite passes                       | All tasks            |

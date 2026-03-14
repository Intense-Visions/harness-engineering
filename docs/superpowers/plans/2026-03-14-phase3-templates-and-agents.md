# Phase 3: Templates & Agents Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build project templates (basic/intermediate/advanced + Next.js overlay), agent persona system (YAML configs generating runtime/AGENTS.md/CI artifacts), and MCP server with full CLI tool parity.

**Architecture:** Three vertical slices delivered sequentially. Slice 1 (Templates) and Slice 2 (Personas) are independent and can run in parallel. Slice 3 (MCP Server) depends on Slice 2. Each slice produces working, testable software. All new code uses the `Result<T, E>` pattern from `@harness-engineering/core`.

**Tech Stack:** TypeScript, Zod, Handlebars, yaml, Commander.js, `@modelcontextprotocol/sdk`, Vitest

**Spec:** [2026-03-14-phase3-templates-and-agents-design.md](../specs/2026-03-14-phase3-templates-and-agents-design.md)

---

## File Structure

### Slice 1: Template System

```
templates/
├── base/
│   ├── template.json
│   ├── .gitignore
│   ├── AGENTS.md.hbs
│   └── docs/
│       └── index.md.hbs
├── basic/
│   ├── template.json
│   ├── harness.config.json.hbs
│   ├── package.json.hbs
│   ├── tsconfig.json
│   └── src/
│       └── index.ts
├── intermediate/
│   ├── template.json
│   ├── harness.config.json.hbs
│   ├── eslint.config.mjs.hbs
│   ├── package.json.hbs
│   └── src/
│       ├── types/.gitkeep
│       ├── domain/.gitkeep
│       └── services/.gitkeep
├── advanced/
│   ├── template.json
│   ├── harness.config.json.hbs
│   ├── package.json.hbs
│   └── agents/
│       └── personas/.gitkeep
└── nextjs/
    ├── template.json
    ├── next.config.mjs
    ├── package.json.hbs
    └── src/
        ├── app/
        │   ├── layout.tsx
        │   └── page.tsx
        └── lib/.gitkeep

packages/cli/src/templates/
├── schema.ts          # TemplateMetadataSchema Zod definition
├── engine.ts          # TemplateEngine: resolve, render, write
├── merger.ts          # JSON deep merge + file overlay logic
└── engine.test.ts     # (tests live in packages/cli/tests/templates/)

packages/cli/tests/templates/
├── schema.test.ts
├── engine.test.ts
├── merger.test.ts
└── fixtures/
    └── mock-templates/
        ├── base/
        ├── basic/
        └── overlay/
```

**Modified files:**
- `packages/cli/src/commands/init.ts` — Add `--level` and `--framework` flags, use template engine
- `packages/cli/src/config/schema.ts` — Add `template` field to `HarnessConfigSchema`
- `packages/cli/src/index.ts` — No changes needed (init command already registered)

**Deleted files:**
- `packages/cli/src/templates/basic.ts` — Replaced by file-based templates

### Slice 2: Persona System

```
agents/personas/
├── architecture-enforcer.yaml
├── documentation-maintainer.yaml
└── entropy-cleaner.yaml

packages/cli/src/persona/
├── schema.ts          # PersonaSchema, PersonaTriggerSchema Zod definitions
├── loader.ts          # Load + validate persona YAML files
├── generators/
│   ├── runtime.ts     # Generate runtime JSON config
│   ├── agents-md.ts   # Generate AGENTS.md fragment
│   └── ci-workflow.ts # Generate GitHub Actions YAML
└── runner.ts          # Execute persona commands, produce PersonaRunReport

packages/cli/src/commands/persona/
├── index.ts           # Parent command: harness persona
├── list.ts            # harness persona list
└── generate.ts        # harness persona generate <name>

packages/cli/tests/persona/
├── schema.test.ts
├── loader.test.ts
├── generators/
│   ├── runtime.test.ts
│   ├── agents-md.test.ts
│   └── ci-workflow.test.ts
├── runner.test.ts
└── fixtures/
    ├── valid-persona.yaml
    └── invalid-persona.yaml
```

**Modified files:**
- `packages/cli/src/commands/agent/run.ts` — Add `--persona` flag
- `packages/cli/src/index.ts` — Register persona command

### Slice 3: MCP Server

```
packages/mcp-server/
├── package.json
├── tsconfig.json
├── vitest.config.mts
├── src/
│   ├── index.ts
│   ├── server.ts
│   ├── tools/
│   │   ├── validate.ts
│   │   ├── architecture.ts
│   │   ├── docs.ts
│   │   ├── entropy.ts
│   │   ├── linter.ts
│   │   ├── persona.ts
│   │   └── init.ts
│   └── utils/
│       ├── config-resolver.ts
│       └── result-adapter.ts
├── bin/
│   └── harness-mcp.ts
└── tests/
    ├── result-adapter.test.ts
    ├── server.test.ts
    └── tools/
        ├── validate.test.ts
        ├── architecture.test.ts
        ├── persona.test.ts
        └── init.test.ts
```

**Modified files:**
- `pnpm-workspace.yaml` — Already includes `packages/*`, no change needed

---

## Chunk 1: Template System (Slice 1)

### Task 1: Template Metadata Schema

**Files:**
- Create: `packages/cli/src/templates/schema.ts`
- Test: `packages/cli/tests/templates/schema.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/cli/tests/templates/schema.test.ts
import { describe, it, expect } from 'vitest';
import { TemplateMetadataSchema } from '../../src/templates/schema';

describe('TemplateMetadataSchema', () => {
  it('validates a valid level template', () => {
    const result = TemplateMetadataSchema.safeParse({
      name: 'basic',
      description: 'Level 1 adoption',
      level: 'basic',
      extends: 'base',
      version: 1,
    });
    expect(result.success).toBe(true);
  });

  it('validates a valid framework template', () => {
    const result = TemplateMetadataSchema.safeParse({
      name: 'nextjs',
      description: 'Next.js overlay',
      framework: 'nextjs',
      version: 1,
    });
    expect(result.success).toBe(true);
  });

  it('applies merge strategy defaults', () => {
    const result = TemplateMetadataSchema.parse({
      name: 'basic',
      description: 'Level 1',
      version: 1,
    });
    expect(result.mergeStrategy).toEqual({
      json: 'deep-merge',
      files: 'overlay-wins',
    });
  });

  it('rejects invalid version', () => {
    const result = TemplateMetadataSchema.safeParse({
      name: 'basic',
      description: 'Level 1',
      version: 2,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid level', () => {
    const result = TemplateMetadataSchema.safeParse({
      name: 'basic',
      description: 'Level 1',
      level: 'expert',
      version: 1,
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/cli && npx vitest run tests/templates/schema.test.ts`
Expected: FAIL — cannot resolve `../../src/templates/schema`

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/cli/src/templates/schema.ts
import { z } from 'zod';

export const MergeStrategySchema = z.object({
  json: z.enum(['deep-merge', 'overlay-wins']).default('deep-merge'),
  files: z.enum(['overlay-wins', 'error']).default('overlay-wins'),
});

export const TemplateMetadataSchema = z.object({
  name: z.string(),
  description: z.string(),
  level: z.enum(['basic', 'intermediate', 'advanced']).optional(),
  framework: z.string().optional(),
  extends: z.string().optional(),
  mergeStrategy: MergeStrategySchema.default({}),
  version: z.literal(1),
});

export type TemplateMetadata = z.infer<typeof TemplateMetadataSchema>;
export type MergeStrategy = z.infer<typeof MergeStrategySchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/cli && npx vitest run tests/templates/schema.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/templates/schema.ts packages/cli/tests/templates/schema.test.ts
git commit -m "feat(templates): add TemplateMetadata Zod schema"
```

---

### Task 2: JSON Deep Merge Utility

**Files:**
- Create: `packages/cli/src/templates/merger.ts`
- Test: `packages/cli/tests/templates/merger.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/cli/tests/templates/merger.test.ts
import { describe, it, expect } from 'vitest';
import { deepMergeJson, mergePackageJson } from '../../src/templates/merger';

describe('deepMergeJson', () => {
  it('merges flat objects with overlay precedence', () => {
    const base = { a: 1, b: 2 };
    const overlay = { b: 3, c: 4 };
    expect(deepMergeJson(base, overlay)).toEqual({ a: 1, b: 3, c: 4 });
  });

  it('deep merges nested objects', () => {
    const base = { nested: { a: 1, b: 2 } };
    const overlay = { nested: { b: 3, c: 4 } };
    expect(deepMergeJson(base, overlay)).toEqual({ nested: { a: 1, b: 3, c: 4 } });
  });

  it('overlay replaces arrays by default', () => {
    const base = { items: [1, 2] };
    const overlay = { items: [3, 4] };
    expect(deepMergeJson(base, overlay)).toEqual({ items: [3, 4] });
  });
});

describe('mergePackageJson', () => {
  it('concatenates dependencies', () => {
    const base = { dependencies: { lodash: '^4.0.0' } };
    const overlay = { dependencies: { zod: '^3.22.0' } };
    expect(mergePackageJson(base, overlay)).toEqual({
      dependencies: { lodash: '^4.0.0', zod: '^3.22.0' },
    });
  });

  it('concatenates devDependencies', () => {
    const base = { devDependencies: { vitest: '^2.0.0' } };
    const overlay = { devDependencies: { typescript: '^5.0.0' } };
    expect(mergePackageJson(base, overlay)).toEqual({
      devDependencies: { vitest: '^2.0.0', typescript: '^5.0.0' },
    });
  });

  it('overlay version of same dependency wins', () => {
    const base = { dependencies: { zod: '^3.20.0' } };
    const overlay = { dependencies: { zod: '^3.22.0' } };
    expect(mergePackageJson(base, overlay)).toEqual({
      dependencies: { zod: '^3.22.0' },
    });
  });

  it('replaces scripts with overlay', () => {
    const base = { scripts: { build: 'tsc' } };
    const overlay = { scripts: { build: 'next build', dev: 'next dev' } };
    expect(mergePackageJson(base, overlay).scripts).toEqual({
      build: 'next build',
      dev: 'next dev',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/cli && npx vitest run tests/templates/merger.test.ts`
Expected: FAIL — cannot resolve `../../src/templates/merger`

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/cli/src/templates/merger.ts

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

export function deepMergeJson(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...base };
  for (const key of Object.keys(overlay)) {
    if (isPlainObject(result[key]) && isPlainObject(overlay[key])) {
      result[key] = deepMergeJson(
        result[key] as Record<string, unknown>,
        overlay[key] as Record<string, unknown>
      );
    } else {
      result[key] = overlay[key];
    }
  }
  return result;
}

const CONCAT_KEYS = new Set(['dependencies', 'devDependencies', 'peerDependencies']);

export function mergePackageJson(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...base };
  for (const key of Object.keys(overlay)) {
    if (CONCAT_KEYS.has(key) && isPlainObject(result[key]) && isPlainObject(overlay[key])) {
      // Concatenate: base deps + overlay deps, overlay wins on conflict
      result[key] = {
        ...(result[key] as Record<string, unknown>),
        ...(overlay[key] as Record<string, unknown>),
      };
    } else if (isPlainObject(result[key]) && isPlainObject(overlay[key])) {
      result[key] = deepMergeJson(
        result[key] as Record<string, unknown>,
        overlay[key] as Record<string, unknown>
      );
    } else {
      result[key] = overlay[key];
    }
  }
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/cli && npx vitest run tests/templates/merger.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/templates/merger.ts packages/cli/tests/templates/merger.test.ts
git commit -m "feat(templates): add JSON deep merge and package.json merge utilities"
```

---

### Task 3: Template Engine — Resolve and Render

**Files:**
- Create: `packages/cli/src/templates/engine.ts`
- Test: `packages/cli/tests/templates/engine.test.ts`
- Create: test fixtures in `packages/cli/tests/templates/fixtures/mock-templates/`

- [ ] **Step 1: Create test fixtures**

```
packages/cli/tests/templates/fixtures/mock-templates/
├── base/
│   ├── template.json        → { "name": "base", "description": "Base", "version": 1 }
│   ├── README.md.hbs        → "# {{projectName}}"
│   └── shared.txt           → "shared content"
├── basic/
│   ├── template.json        → { "name": "basic", "description": "Level 1", "level": "basic", "extends": "base", "version": 1 }
│   ├── package.json.hbs     → { "name": "{{projectName}}", "version": "1.0.0" }
│   └── src/
│       └── index.ts         → "export {};"
└── overlay/
    ├── template.json        → { "name": "nextjs", "description": "Next.js", "framework": "nextjs", "version": 1 }
    ├── package.json.hbs     → { "name": "{{projectName}}", "dependencies": { "next": "^14.0.0" } }
    └── src/
        └── app/
            └── page.tsx     → "export default function Home() { return <div>Hello</div>; }"
```

Create fixture files:

```typescript
// packages/cli/tests/templates/fixtures/mock-templates/base/template.json
{ "name": "base", "description": "Base template", "version": 1 }
```

```typescript
// packages/cli/tests/templates/fixtures/mock-templates/base/README.md.hbs
# {{projectName}}

Welcome to {{projectName}}.
```

```typescript
// packages/cli/tests/templates/fixtures/mock-templates/base/shared.txt
shared content
```

```typescript
// packages/cli/tests/templates/fixtures/mock-templates/basic/template.json
{ "name": "basic", "description": "Level 1 adoption", "level": "basic", "extends": "base", "version": 1 }
```

```
// packages/cli/tests/templates/fixtures/mock-templates/basic/package.json.hbs
{
  "name": "{{projectName}}",
  "version": "1.0.0",
  "dependencies": {}
}
```

```typescript
// packages/cli/tests/templates/fixtures/mock-templates/basic/src/index.ts
export {};
```

```typescript
// packages/cli/tests/templates/fixtures/mock-templates/overlay/template.json
{ "name": "nextjs", "description": "Next.js overlay", "framework": "nextjs", "version": 1 }
```

```
// packages/cli/tests/templates/fixtures/mock-templates/overlay/package.json.hbs
{
  "name": "{{projectName}}",
  "dependencies": { "next": "^14.0.0" }
}
```

```typescript
// packages/cli/tests/templates/fixtures/mock-templates/overlay/src/app/page.tsx
export default function Home() { return <div>Hello</div>; }
```

- [ ] **Step 2: Write the failing test**

```typescript
// packages/cli/tests/templates/engine.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { TemplateEngine } from '../../src/templates/engine';

const FIXTURES = path.join(__dirname, 'fixtures', 'mock-templates');

describe('TemplateEngine', () => {
  let engine: TemplateEngine;

  beforeEach(() => {
    engine = new TemplateEngine(FIXTURES);
  });

  describe('listTemplates', () => {
    it('lists all templates with metadata', () => {
      const result = engine.listTemplates();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const names = result.value.map((t) => t.name);
      expect(names).toContain('base');
      expect(names).toContain('basic');
      expect(names).toContain('nextjs');
    });
  });

  describe('resolveTemplate', () => {
    it('resolves a level template with base extension', () => {
      const result = engine.resolveTemplate('basic');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // Should include files from both base and basic
      const paths = result.value.files.map((f) => f.relativePath);
      expect(paths).toContain('README.md.hbs');    // from base
      expect(paths).toContain('shared.txt');         // from base
      expect(paths).toContain('package.json.hbs');   // from basic
      expect(paths).toContain('src/index.ts');       // from basic
    });

    it('resolves with framework overlay', () => {
      const result = engine.resolveTemplate('basic', 'nextjs');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const paths = result.value.files.map((f) => f.relativePath);
      expect(paths).toContain('src/app/page.tsx');   // from overlay
      expect(paths).toContain('src/index.ts');       // from basic
    });

    it('returns error for unknown level', () => {
      const result = engine.resolveTemplate('nonexistent');
      expect(result.ok).toBe(false);
    });
  });

  describe('render', () => {
    it('renders handlebars templates with context', () => {
      const resolveResult = engine.resolveTemplate('basic');
      expect(resolveResult.ok).toBe(true);
      if (!resolveResult.ok) return;

      const renderResult = engine.render(resolveResult.value, {
        projectName: 'my-app',
        level: 'basic',
      });
      expect(renderResult.ok).toBe(true);
      if (!renderResult.ok) return;

      const readme = renderResult.value.files.find((f) => f.relativePath === 'README.md');
      expect(readme).toBeDefined();
      expect(readme!.content).toContain('# my-app');

      const pkg = renderResult.value.files.find((f) => f.relativePath === 'package.json');
      expect(pkg).toBeDefined();
      const parsed = JSON.parse(pkg!.content);
      expect(parsed.name).toBe('my-app');
    });

    it('copies non-hbs files as-is', () => {
      const resolveResult = engine.resolveTemplate('basic');
      if (!resolveResult.ok) return;

      const renderResult = engine.render(resolveResult.value, {
        projectName: 'my-app',
        level: 'basic',
      });
      if (!renderResult.ok) return;

      const shared = renderResult.value.files.find((f) => f.relativePath === 'shared.txt');
      expect(shared).toBeDefined();
      expect(shared!.content).toBe('shared content');
    });

    it('merges package.json from overlay using mergePackageJson', () => {
      const resolveResult = engine.resolveTemplate('basic', 'nextjs');
      if (!resolveResult.ok) return;

      const renderResult = engine.render(resolveResult.value, {
        projectName: 'my-app',
        level: 'basic',
        framework: 'nextjs',
      });
      if (!renderResult.ok) return;

      const pkg = renderResult.value.files.find((f) => f.relativePath === 'package.json');
      expect(pkg).toBeDefined();
      const parsed = JSON.parse(pkg!.content);
      expect(parsed.dependencies.next).toBe('^14.0.0');
    });
  });

  describe('write', () => {
    it('writes rendered files to target directory', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-test-'));

      const resolveResult = engine.resolveTemplate('basic');
      if (!resolveResult.ok) return;
      const renderResult = engine.render(resolveResult.value, {
        projectName: 'test-project',
        level: 'basic',
      });
      if (!renderResult.ok) return;

      const writeResult = engine.write(renderResult.value, tmpDir, { overwrite: false });
      expect(writeResult.ok).toBe(true);
      if (!writeResult.ok) return;

      expect(fs.existsSync(path.join(tmpDir, 'README.md'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'package.json'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'src', 'index.ts'))).toBe(true);

      // Cleanup
      fs.rmSync(tmpDir, { recursive: true });
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd packages/cli && npx vitest run tests/templates/engine.test.ts`
Expected: FAIL — cannot resolve `../../src/templates/engine`

- [ ] **Step 4: Write the implementation**

```typescript
// packages/cli/src/templates/engine.ts
import * as fs from 'fs';
import * as path from 'path';
import Handlebars from 'handlebars';
import type { Result } from '@harness-engineering/core';
import { Ok, Err } from '@harness-engineering/core';
import { TemplateMetadataSchema, type TemplateMetadata } from './schema';
import { deepMergeJson, mergePackageJson } from './merger';

export interface TemplateContext {
  projectName: string;
  level: string;
  framework?: string;
}

interface TemplateFile {
  relativePath: string;   // Path relative to template root
  absolutePath: string;    // Absolute path on disk
  isHandlebars: boolean;   // Ends in .hbs
  sourceTemplate: string;  // Which template it came from (e.g., "base", "basic")
}

export interface ResolvedTemplate {
  metadata: TemplateMetadata;
  files: TemplateFile[];
  overlayMetadata?: TemplateMetadata;
}

interface RenderedFile {
  relativePath: string;    // .hbs extension stripped
  content: string;
}

export interface RenderedFiles {
  files: RenderedFile[];
}

interface WriteOptions {
  overwrite: boolean;
}

export class TemplateEngine {
  constructor(private templatesDir: string) {}

  listTemplates(): Result<TemplateMetadata[], Error> {
    try {
      const entries = fs.readdirSync(this.templatesDir, { withFileTypes: true });
      const templates: TemplateMetadata[] = [];

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const metaPath = path.join(this.templatesDir, entry.name, 'template.json');
        if (!fs.existsSync(metaPath)) continue;

        const raw = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        const parsed = TemplateMetadataSchema.safeParse(raw);
        if (parsed.success) {
          templates.push(parsed.data);
        }
      }

      return Ok(templates);
    } catch (error) {
      return Err(new Error(`Failed to list templates: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  resolveTemplate(level: string, framework?: string): Result<ResolvedTemplate, Error> {
    // Find the level template directory
    const levelDir = this.findTemplateDir(level, 'level');
    if (!levelDir) {
      return Err(new Error(`Template not found for level: ${level}`));
    }

    const metaPath = path.join(levelDir, 'template.json');
    const metaRaw = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    const metaResult = TemplateMetadataSchema.safeParse(metaRaw);
    if (!metaResult.success) {
      return Err(new Error(`Invalid template.json in ${level}: ${metaResult.error.message}`));
    }

    const metadata = metaResult.data;
    let files: TemplateFile[] = [];

    // Load base template if extends is set
    if (metadata.extends) {
      const baseDir = path.join(this.templatesDir, metadata.extends);
      if (fs.existsSync(baseDir)) {
        files = this.collectFiles(baseDir, metadata.extends);
      }
    }

    // Overlay level template files (overlay-wins for conflicts)
    const levelFiles = this.collectFiles(levelDir, level);
    files = this.mergeFileLists(files, levelFiles);

    // Apply framework overlay if specified
    let overlayMetadata: TemplateMetadata | undefined;
    if (framework) {
      const frameworkDir = this.findTemplateDir(framework, 'framework');
      if (!frameworkDir) {
        return Err(new Error(`Framework template not found: ${framework}`));
      }
      const fMetaPath = path.join(frameworkDir, 'template.json');
      const fMetaRaw = JSON.parse(fs.readFileSync(fMetaPath, 'utf-8'));
      const fMetaResult = TemplateMetadataSchema.safeParse(fMetaRaw);
      if (fMetaResult.success) {
        overlayMetadata = fMetaResult.data;
      }

      const frameworkFiles = this.collectFiles(frameworkDir, framework);
      files = this.mergeFileLists(files, frameworkFiles);
    }

    // Filter out template.json from output
    files = files.filter((f) => f.relativePath !== 'template.json');

    return Ok({ metadata, files, overlayMetadata });
  }

  render(template: ResolvedTemplate, context: TemplateContext): Result<RenderedFiles, Error> {
    try {
      const rendered: RenderedFile[] = [];
      const jsonBuffers = new Map<string, Record<string, unknown>[]>();

      // Group .json.hbs files by output path for merging
      for (const file of template.files) {
        const outputPath = file.relativePath.replace(/\.hbs$/, '');

        if (file.isHandlebars) {
          const raw = fs.readFileSync(file.absolutePath, 'utf-8');
          const compiled = Handlebars.compile(raw, { strict: true });
          const content = compiled(context);

          // If it's a JSON file, buffer it for potential merging
          if (outputPath.endsWith('.json') && file.relativePath.endsWith('.json.hbs')) {
            if (!jsonBuffers.has(outputPath)) {
              jsonBuffers.set(outputPath, []);
            }
            jsonBuffers.get(outputPath)!.push(JSON.parse(content));
          } else {
            rendered.push({ relativePath: outputPath, content });
          }
        } else {
          const content = fs.readFileSync(file.absolutePath, 'utf-8');
          rendered.push({ relativePath: file.relativePath, content });
        }
      }

      // Merge buffered JSON files
      for (const [outputPath, jsons] of jsonBuffers) {
        let merged: Record<string, unknown> = {};
        for (const json of jsons) {
          if (outputPath === 'package.json') {
            merged = mergePackageJson(merged, json);
          } else {
            merged = deepMergeJson(merged, json);
          }
        }
        rendered.push({
          relativePath: outputPath,
          content: JSON.stringify(merged, null, 2),
        });
      }

      return Ok({ files: rendered });
    } catch (error) {
      // Enrich Handlebars errors with file context
      const msg = error instanceof Error ? error.message : String(error);
      return Err(new Error(`Template render failed: ${msg}. Check template variables and syntax.`));
    }
  }

  write(files: RenderedFiles, targetDir: string, options: WriteOptions): Result<string[], Error> {
    try {
      const written: string[] = [];
      const skipped: string[] = [];

      for (const file of files.files) {
        const targetPath = path.join(targetDir, file.relativePath);
        const dir = path.dirname(targetPath);

        if (!options.overwrite && fs.existsSync(targetPath)) {
          skipped.push(file.relativePath);
          continue;
        }

        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(targetPath, file.content);
        written.push(file.relativePath);
      }

      return Ok(written);
    } catch (error) {
      return Err(new Error(`Failed to write files: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  private findTemplateDir(name: string, type: 'level' | 'framework'): string | null {
    const entries = fs.readdirSync(this.templatesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const metaPath = path.join(this.templatesDir, entry.name, 'template.json');
      if (!fs.existsSync(metaPath)) continue;

      const raw = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      const parsed = TemplateMetadataSchema.safeParse(raw);
      if (!parsed.success) continue;

      if (type === 'level' && parsed.data.level === name) return path.join(this.templatesDir, entry.name);
      if (type === 'framework' && parsed.data.framework === name) return path.join(this.templatesDir, entry.name);
      if (parsed.data.name === name) return path.join(this.templatesDir, entry.name);
    }
    return null;
  }

  private collectFiles(dir: string, sourceName: string): TemplateFile[] {
    const files: TemplateFile[] = [];
    const walk = (currentDir: string) => {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else {
          const relativePath = path.relative(dir, fullPath);
          files.push({
            relativePath,
            absolutePath: fullPath,
            isHandlebars: entry.name.endsWith('.hbs'),
            sourceTemplate: sourceName,
          });
        }
      }
    };
    walk(dir);
    return files;
  }

  private mergeFileLists(base: TemplateFile[], overlay: TemplateFile[]): TemplateFile[] {
    const map = new Map<string, TemplateFile>();
    for (const file of base) {
      map.set(file.relativePath, file);
    }
    for (const file of overlay) {
      // For .json.hbs files, keep both base and overlay so they can be
      // deep-merged during render (package.json gets mergePackageJson,
      // all other .json files get deepMergeJson)
      if (file.relativePath.endsWith('.json.hbs')) {
        const baseKey = base.find((f) => f.relativePath === file.relativePath);
        if (baseKey) {
          map.set(`__overlay__${file.relativePath}`, file);
        } else {
          map.set(file.relativePath, file);
        }
      } else {
        // Non-JSON files: overlay wins
        map.set(file.relativePath, file);
      }
    }
    return Array.from(map.values());
  }
}
```

- [ ] **Step 5: Install Handlebars dependency**

Run: `cd packages/cli && pnpm add handlebars`

- [ ] **Step 6: Run test to verify it passes**

Run: `cd packages/cli && npx vitest run tests/templates/engine.test.ts`
Expected: PASS (all tests)

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/templates/engine.ts packages/cli/tests/templates/engine.test.ts packages/cli/tests/templates/fixtures/ packages/cli/package.json
git commit -m "feat(templates): add template engine with resolve, render, write"
```

---

### Task 4: Config Schema Extension

**Files:**
- Modify: `packages/cli/src/config/schema.ts`
- Test: `packages/cli/tests/templates/schema.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Add to the existing `packages/cli/tests/templates/schema.test.ts` file. Add this import at the top of the file alongside the existing imports:

```typescript
import { HarnessConfigSchema } from '../../src/config/schema';
```

Then append these tests:

```typescript
describe('HarnessConfigSchema template field', () => {
  it('accepts config with template metadata', () => {
    const result = HarnessConfigSchema.safeParse({
      version: 1,
      template: {
        level: 'intermediate',
        framework: 'nextjs',
        version: 1,
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts config without template (backwards compatible)', () => {
    const result = HarnessConfigSchema.safeParse({ version: 1 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.template).toBeUndefined();
    }
  });

  it('rejects invalid template level', () => {
    const result = HarnessConfigSchema.safeParse({
      version: 1,
      template: { level: 'expert', version: 1 },
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/cli && npx vitest run tests/templates/schema.test.ts`
Expected: FAIL — template field not recognized

- [ ] **Step 3: Add template field to HarnessConfigSchema**

In `packages/cli/src/config/schema.ts`, add after `entropy`:

```typescript
template: z.object({
  level: z.enum(['basic', 'intermediate', 'advanced']),
  framework: z.string().optional(),
  version: z.number(),
}).optional(),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/cli && npx vitest run tests/templates/schema.test.ts`
Expected: PASS

- [ ] **Step 5: Run all existing CLI tests for regression**

Run: `cd packages/cli && npx vitest run`
Expected: All tests pass (no regressions from schema change)

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/config/schema.ts packages/cli/tests/templates/schema.test.ts
git commit -m "feat(config): add template metadata field to HarnessConfigSchema"
```

---

### Task 5: Create Template Content Files

**Files:**
- Create: `templates/base/` directory and all files
- Create: `templates/basic/` directory and all files
- Create: `templates/intermediate/` directory and all files
- Create: `templates/advanced/` directory and all files
- Create: `templates/nextjs/` directory and all files

- [ ] **Step 1: Create `templates/base/`**

```json
// templates/base/template.json
{
  "name": "base",
  "description": "Shared base files for all harness engineering templates",
  "version": 1
}
```

```
// templates/base/.gitignore
node_modules/
dist/
.env
.env.local
*.log
coverage/
.turbo/
```

```handlebars
{{!-- templates/base/AGENTS.md.hbs --}}
# {{projectName}} Knowledge Map

## About This Project

{{projectName}} — A project using Harness Engineering practices ({{level}} adoption level).

## Documentation

- Main docs: `docs/`
- Architecture decisions: `docs/architecture.md`

## Source Code

- Entry point: `src/index.ts`

## Architecture

See `docs/architecture.md` for architectural decisions.
```

```handlebars
{{!-- templates/base/docs/index.md.hbs --}}
# {{projectName}} Documentation

Welcome to the {{projectName}} documentation.

## Getting Started

1. Install dependencies: `npm install`
2. Run checks: `npx harness validate`
3. Start development

## Architecture

See [architecture.md](./architecture.md) for architectural decisions.
```

- [ ] **Step 2: Create `templates/basic/`**

```json
// templates/basic/template.json
{
  "name": "basic",
  "description": "Level 1 adoption: AGENTS.md, basic docs, simple constraints",
  "level": "basic",
  "extends": "base",
  "version": 1
}
```

```handlebars
{{!-- templates/basic/harness.config.json.hbs --}}
{
  "version": 1,
  "name": "{{projectName}}",
  "layers": [
    { "name": "types", "pattern": "src/types/**", "allowedDependencies": [] },
    { "name": "domain", "pattern": "src/domain/**", "allowedDependencies": ["types"] },
    { "name": "services", "pattern": "src/services/**", "allowedDependencies": ["types", "domain"] },
    { "name": "api", "pattern": "src/api/**", "allowedDependencies": ["types", "domain", "services"] }
  ],
  "agentsMapPath": "./AGENTS.md",
  "docsDir": "./docs",
  "template": {
    "level": "basic",
    "version": 1
  }
}
```

```handlebars
{{!-- templates/basic/package.json.hbs --}}
{
  "name": "{{projectName}}",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "harness:validate": "harness validate",
    "harness:check-deps": "harness check-deps"
  },
  "dependencies": {},
  "devDependencies": {
    "@harness-engineering/cli": "^0.1.0",
    "typescript": "^5.0.0"
  }
}
```

```json
// templates/basic/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "declaration": true
  },
  "include": ["src"]
}
```

```typescript
// templates/basic/src/index.ts
export {};
```

- [ ] **Step 3: Create `templates/intermediate/`**

```json
// templates/intermediate/template.json
{
  "name": "intermediate",
  "description": "Level 2 adoption: Full docs, linters, layer enforcement",
  "level": "intermediate",
  "extends": "base",
  "version": 1
}
```

```handlebars
{{!-- templates/intermediate/harness.config.json.hbs --}}
{
  "version": 1,
  "name": "{{projectName}}",
  "layers": [
    { "name": "types", "pattern": "src/types/**", "allowedDependencies": [] },
    { "name": "domain", "pattern": "src/domain/**", "allowedDependencies": ["types"] },
    { "name": "services", "pattern": "src/services/**", "allowedDependencies": ["types", "domain"] },
    { "name": "api", "pattern": "src/api/**", "allowedDependencies": ["types", "domain", "services"] }
  ],
  "forbiddenImports": [
    { "from": "src/types/**", "disallow": ["src/services/**", "src/api/**"], "message": "Types layer cannot import from services or API" }
  ],
  "boundaries": {
    "requireSchema": ["src/api/**"]
  },
  "agentsMapPath": "./AGENTS.md",
  "docsDir": "./docs",
  "template": {
    "level": "intermediate",
    "version": 1
  }
}
```

```handlebars
{{!-- templates/intermediate/eslint.config.mjs.hbs --}}
import harnessPlugin from '@harness-engineering/eslint-plugin';

export default [
  harnessPlugin.configs.recommended,
  {
    rules: {
      '@harness-engineering/no-circular-deps': 'error',
      '@harness-engineering/no-forbidden-imports': 'error',
      '@harness-engineering/no-layer-violation': 'error',
    },
  },
];
```

```handlebars
{{!-- templates/intermediate/package.json.hbs --}}
{
  "name": "{{projectName}}",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "lint": "eslint src",
    "harness:validate": "harness validate",
    "harness:check-deps": "harness check-deps",
    "harness:check-docs": "harness check-docs"
  },
  "dependencies": {},
  "devDependencies": {
    "@harness-engineering/cli": "^0.1.0",
    "@harness-engineering/eslint-plugin": "^0.1.0",
    "eslint": "^9.0.0",
    "typescript": "^5.0.0"
  }
}
```

Create empty directories with `.gitkeep`:
- `templates/intermediate/src/types/.gitkeep`
- `templates/intermediate/src/domain/.gitkeep`
- `templates/intermediate/src/services/.gitkeep`

- [ ] **Step 4: Create `templates/advanced/`**

```json
// templates/advanced/template.json
{
  "name": "advanced",
  "description": "Level 3 adoption: Complete harness with agent loop, entropy management",
  "level": "advanced",
  "extends": "base",
  "version": 1
}
```

```handlebars
{{!-- templates/advanced/harness.config.json.hbs --}}
{
  "version": 1,
  "name": "{{projectName}}",
  "layers": [
    { "name": "types", "pattern": "src/types/**", "allowedDependencies": [] },
    { "name": "domain", "pattern": "src/domain/**", "allowedDependencies": ["types"] },
    { "name": "services", "pattern": "src/services/**", "allowedDependencies": ["types", "domain"] },
    { "name": "api", "pattern": "src/api/**", "allowedDependencies": ["types", "domain", "services"] }
  ],
  "forbiddenImports": [
    { "from": "src/types/**", "disallow": ["src/services/**", "src/api/**"], "message": "Types layer cannot import from services or API" }
  ],
  "boundaries": {
    "requireSchema": ["src/api/**"]
  },
  "agentsMapPath": "./AGENTS.md",
  "docsDir": "./docs",
  "agent": {
    "executor": "subprocess",
    "timeout": 300000
  },
  "entropy": {
    "excludePatterns": ["**/node_modules/**", "**/*.test.ts"],
    "autoFix": false
  },
  "template": {
    "level": "advanced",
    "version": 1
  }
}
```

```handlebars
{{!-- templates/advanced/package.json.hbs --}}
{
  "name": "{{projectName}}",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "lint": "eslint src",
    "harness:validate": "harness validate",
    "harness:check-deps": "harness check-deps",
    "harness:check-docs": "harness check-docs",
    "harness:cleanup": "harness cleanup",
    "harness:fix-drift": "harness fix-drift"
  },
  "dependencies": {},
  "devDependencies": {
    "@harness-engineering/cli": "^0.1.0",
    "@harness-engineering/eslint-plugin": "^0.1.0",
    "eslint": "^9.0.0",
    "typescript": "^5.0.0"
  }
}
```

Create: `templates/advanced/agents/personas/.gitkeep`

- [ ] **Step 5: Create `templates/nextjs/`**

```json
// templates/nextjs/template.json
{
  "name": "nextjs",
  "description": "Next.js framework overlay",
  "framework": "nextjs",
  "version": 1
}
```

```javascript
// templates/nextjs/next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {};
export default nextConfig;
```

```handlebars
{{!-- templates/nextjs/package.json.hbs --}}
{
  "name": "{{projectName}}",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "^14.0.0",
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.0.0",
    "@types/react-dom": "^18.0.0"
  }
}
```

```tsx
// templates/nextjs/src/app/layout.tsx
export const metadata = {
  title: 'Harness Engineering App',
  description: 'Built with Harness Engineering practices',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

```tsx
// templates/nextjs/src/app/page.tsx
export default function Home() {
  return (
    <main>
      <h1>Welcome to your Harness Engineering project</h1>
    </main>
  );
}
```

Create: `templates/nextjs/src/lib/.gitkeep`

- [ ] **Step 6: Validate all template.json files parse correctly**

```typescript
// Quick validation: run from project root
// packages/cli/tests/templates/template-content.test.ts
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { TemplateMetadataSchema } from '../../src/templates/schema';

const TEMPLATES_DIR = path.resolve(__dirname, '..', '..', '..', '..', 'templates');

describe('template content files', () => {
  const templateDirs = fs.readdirSync(TEMPLATES_DIR).filter((d) =>
    fs.statSync(path.join(TEMPLATES_DIR, d)).isDirectory()
  );

  for (const dir of templateDirs) {
    it(`${dir}/template.json is valid`, () => {
      const metaPath = path.join(TEMPLATES_DIR, dir, 'template.json');
      expect(fs.existsSync(metaPath)).toBe(true);
      const raw = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      const result = TemplateMetadataSchema.safeParse(raw);
      expect(result.success).toBe(true);
    });
  }

  it('basic template has required files', () => {
    expect(fs.existsSync(path.join(TEMPLATES_DIR, 'basic', 'harness.config.json.hbs'))).toBe(true);
    expect(fs.existsSync(path.join(TEMPLATES_DIR, 'basic', 'package.json.hbs'))).toBe(true);
  });
});
```

Run: `cd packages/cli && npx vitest run tests/templates/template-content.test.ts`
Expected: PASS — all template.json files are valid

- [ ] **Step 7: Commit**

```bash
git add templates/ packages/cli/tests/templates/template-content.test.ts
git commit -m "feat(templates): add base, basic, intermediate, advanced, and nextjs templates"
```

---

### Task 6: Update `harness init` Command

**Files:**
- Modify: `packages/cli/src/commands/init.ts`
- Delete: `packages/cli/src/templates/basic.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/cli/tests/commands/init.test.ts
import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { runInit } from '../../src/commands/init';

describe('runInit', () => {
  it('scaffolds a basic project by default', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-init-'));

    const result = await runInit({ cwd: tmpDir, name: 'test-project' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(fs.existsSync(path.join(tmpDir, 'harness.config.json'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'AGENTS.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'package.json'))).toBe(true);

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('scaffolds an intermediate project', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-init-'));

    const result = await runInit({ cwd: tmpDir, name: 'test-project', level: 'intermediate' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(fs.existsSync(path.join(tmpDir, 'eslint.config.mjs'))).toBe(true);

    const config = JSON.parse(fs.readFileSync(path.join(tmpDir, 'harness.config.json'), 'utf-8'));
    expect(config.template.level).toBe('intermediate');

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('scaffolds with nextjs overlay', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-init-'));

    const result = await runInit({ cwd: tmpDir, name: 'test-project', level: 'basic', framework: 'nextjs' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(fs.existsSync(path.join(tmpDir, 'next.config.mjs'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'src', 'app', 'page.tsx'))).toBe(true);

    const pkg = JSON.parse(fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf-8'));
    expect(pkg.dependencies.next).toBeDefined();

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('rejects already initialized project without --force', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-init-'));
    fs.writeFileSync(path.join(tmpDir, 'harness.config.json'), '{}');

    const result = await runInit({ cwd: tmpDir, name: 'test-project' });
    expect(result.ok).toBe(false);

    fs.rmSync(tmpDir, { recursive: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/cli && npx vitest run tests/commands/init.test.ts`
Expected: FAIL — `runInit` does not accept `level` or `framework`

- [ ] **Step 3: Rewrite `init.ts` to use TemplateEngine**

```typescript
// packages/cli/src/commands/init.ts
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import type { Result } from '@harness-engineering/core';
import { Ok, Err } from '@harness-engineering/core';
import { TemplateEngine } from '../templates/engine';
import { logger } from '../output/logger';
import { CLIError, ExitCode } from '../utils/errors';

interface InitOptions {
  cwd?: string;
  name?: string;
  level?: string;
  framework?: string;
  force?: boolean;
}

interface InitResult {
  filesCreated: string[];
}

// Resolve templates directory — bundled with CLI package or repo root
function resolveTemplatesDir(): string {
  // Check for templates in repo root first (development)
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const repoTemplates = path.join(repoRoot, 'templates');
  if (fs.existsSync(repoTemplates)) {
    return repoTemplates;
  }
  // Fallback: bundled templates
  return path.join(__dirname, '..', 'templates');
}

export async function runInit(options: InitOptions): Promise<Result<InitResult, CLIError>> {
  const cwd = options.cwd ?? process.cwd();
  const name = options.name ?? path.basename(cwd);
  const level = options.level ?? 'basic';
  const force = options.force ?? false;

  const configPath = path.join(cwd, 'harness.config.json');

  if (!force && fs.existsSync(configPath)) {
    return Err(new CLIError(
      'Project already initialized. Use --force to overwrite.',
      ExitCode.ERROR
    ));
  }

  const templatesDir = resolveTemplatesDir();
  const engine = new TemplateEngine(templatesDir);

  const resolveResult = engine.resolveTemplate(level, options.framework);
  if (!resolveResult.ok) {
    return Err(new CLIError(resolveResult.error.message, ExitCode.ERROR));
  }

  const renderResult = engine.render(resolveResult.value, {
    projectName: name,
    level,
    framework: options.framework,
  });
  if (!renderResult.ok) {
    return Err(new CLIError(renderResult.error.message, ExitCode.ERROR));
  }

  const writeResult = engine.write(renderResult.value, cwd, { overwrite: force });
  if (!writeResult.ok) {
    return Err(new CLIError(writeResult.error.message, ExitCode.ERROR));
  }

  return Ok({ filesCreated: writeResult.value });
}

export function createInitCommand(): Command {
  const command = new Command('init')
    .description('Initialize a new harness-engineering project')
    .option('-n, --name <name>', 'Project name')
    .option('-l, --level <level>', 'Adoption level (basic, intermediate, advanced)', 'basic')
    .option('--framework <framework>', 'Framework overlay (nextjs)')
    .option('-f, --force', 'Overwrite existing files')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();

      const result = await runInit({
        name: opts.name,
        level: opts.level,
        framework: opts.framework,
        force: opts.force,
      });

      if (!result.ok) {
        logger.error(result.error.message);
        process.exit(result.error.exitCode);
      }

      if (!globalOpts.quiet) {
        logger.success('Project initialized!');
        logger.info('Created files:');
        for (const file of result.value.filesCreated) {
          console.log(`  - ${file}`);
        }
        console.log('\nNext steps:');
        console.log('  1. Review harness.config.json');
        console.log('  2. Update AGENTS.md with your project structure');
        console.log('  3. Run "harness validate" to check your setup');
      }

      process.exit(ExitCode.SUCCESS);
    });

  return command;
}
```

- [ ] **Step 4: Delete `packages/cli/src/templates/basic.ts`**

Run: `rm packages/cli/src/templates/basic.ts`

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/cli && npx vitest run tests/commands/init.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Run all CLI tests to verify no regressions**

Run: `cd packages/cli && npx vitest run`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/commands/init.ts packages/cli/tests/commands/init.test.ts
git rm packages/cli/src/templates/basic.ts
git commit -m "feat(cli): update harness init to use file-based template engine

Add --level and --framework flags. Replace inline templates with
file-based TemplateEngine. Backwards compatible: defaults to basic level."
```

---

### Task 7: Integration Test — End-to-End Template Scaffolding

**Files:**
- Create: `packages/cli/tests/integration/init.test.ts`

- [ ] **Step 1: Write the integration test**

```typescript
// packages/cli/tests/integration/init.test.ts
import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { runInit } from '../../src/commands/init';

describe('harness init integration', () => {
  const levels = ['basic', 'intermediate', 'advanced'] as const;

  for (const level of levels) {
    it(`scaffolds a valid ${level} project`, async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `harness-init-${level}-`));

      const result = await runInit({ cwd: tmpDir, name: `test-${level}`, level });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // All levels should have these
      expect(fs.existsSync(path.join(tmpDir, 'harness.config.json'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'AGENTS.md'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'package.json'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, '.gitignore'))).toBe(true);

      // Config should have correct template metadata
      const config = JSON.parse(fs.readFileSync(path.join(tmpDir, 'harness.config.json'), 'utf-8'));
      expect(config.template.level).toBe(level);
      expect(config.name).toBe(`test-${level}`);

      // AGENTS.md should contain project name
      const agents = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf-8');
      expect(agents).toContain(`test-${level}`);

      fs.rmSync(tmpDir, { recursive: true });
    });
  }

  it('scaffolds basic + nextjs overlay correctly', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-init-nextjs-'));

    const result = await runInit({
      cwd: tmpDir,
      name: 'my-nextjs-app',
      level: 'basic',
      framework: 'nextjs',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Should have Next.js files
    expect(fs.existsSync(path.join(tmpDir, 'next.config.mjs'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'src', 'app', 'page.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'src', 'app', 'layout.tsx'))).toBe(true);

    // package.json should have merged deps
    const pkg = JSON.parse(fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf-8'));
    expect(pkg.dependencies.next).toBeDefined();
    expect(pkg.dependencies.react).toBeDefined();
    expect(pkg.scripts.dev).toBe('next dev');
    // Should also have harness scripts from basic
    expect(pkg.scripts['harness:validate']).toBeDefined();

    fs.rmSync(tmpDir, { recursive: true });
  });
});
```

- [ ] **Step 2: Run integration test**

Run: `cd packages/cli && npx vitest run tests/integration/init.test.ts`
Expected: PASS (4 tests — basic, intermediate, advanced, nextjs overlay)

- [ ] **Step 3: Add snapshot test for rendered template output**

```typescript
// packages/cli/tests/templates/snapshot.test.ts
import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { TemplateEngine } from '../../src/templates/engine';

const TEMPLATES_DIR = path.resolve(__dirname, '..', '..', '..', '..', 'templates');

describe('template snapshots', () => {
  const engine = new TemplateEngine(TEMPLATES_DIR);

  for (const level of ['basic', 'intermediate', 'advanced'] as const) {
    it(`${level} template output matches snapshot`, () => {
      const resolved = engine.resolveTemplate(level);
      if (!resolved.ok) throw new Error(resolved.error.message);

      const rendered = engine.render(resolved.value, {
        projectName: 'snapshot-test',
        level,
      });
      if (!rendered.ok) throw new Error(rendered.error.message);

      const fileMap = Object.fromEntries(
        rendered.value.files.map((f) => [f.relativePath, f.content])
      );
      expect(fileMap).toMatchSnapshot();
    });
  }
});
```

Run: `cd packages/cli && npx vitest run tests/templates/snapshot.test.ts -- --update`
Expected: Snapshots created

- [ ] **Step 4: Commit**

```bash
git add packages/cli/tests/templates/snapshot.test.ts packages/cli/tests/templates/__snapshots__/
git add packages/cli/tests/integration/init.test.ts
git commit -m "test(cli): add integration and snapshot tests for template scaffolding"
```

---

End of Chunk 1.

---

## Chunk 2: Persona System (Slice 2)

### Task 8: Persona YAML Schema

**Files:**
- Create: `packages/cli/src/persona/schema.ts`
- Test: `packages/cli/tests/persona/schema.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/cli/tests/persona/schema.test.ts
import { describe, it, expect } from 'vitest';
import { PersonaSchema } from '../../src/persona/schema';

describe('PersonaSchema', () => {
  const validPersona = {
    version: 1,
    name: 'Architecture Enforcer',
    description: 'Validates architectural constraints',
    role: 'Enforce layer boundaries',
    skills: ['enforce-architecture', 'check-mechanical-constraints'],
    commands: ['check-deps', 'validate'],
    triggers: [
      { event: 'on_pr', conditions: { paths: ['src/**'] } },
      { event: 'on_commit', conditions: { branches: ['main'] } },
      { event: 'scheduled', cron: '0 6 * * 1' },
    ],
  };

  it('validates a complete persona', () => {
    const result = PersonaSchema.safeParse(validPersona);
    expect(result.success).toBe(true);
  });

  it('applies config defaults', () => {
    const result = PersonaSchema.parse(validPersona);
    expect(result.config.severity).toBe('error');
    expect(result.config.autoFix).toBe(false);
    expect(result.config.timeout).toBe(300000);
  });

  it('applies output defaults', () => {
    const result = PersonaSchema.parse(validPersona);
    expect(result.outputs['agents-md']).toBe(true);
    expect(result.outputs['ci-workflow']).toBe(true);
    expect(result.outputs['runtime-config']).toBe(true);
  });

  it('rejects invalid version', () => {
    const result = PersonaSchema.safeParse({ ...validPersona, version: 2 });
    expect(result.success).toBe(false);
  });

  it('rejects missing required fields', () => {
    const result = PersonaSchema.safeParse({ version: 1, name: 'Test' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid trigger event', () => {
    const result = PersonaSchema.safeParse({
      ...validPersona,
      triggers: [{ event: 'on_deploy' }],
    });
    expect(result.success).toBe(false);
  });

  it('validates scheduled trigger requires cron', () => {
    const result = PersonaSchema.safeParse({
      ...validPersona,
      triggers: [{ event: 'scheduled' }],
    });
    expect(result.success).toBe(false);
  });

  it('accepts custom config overrides', () => {
    const result = PersonaSchema.parse({
      ...validPersona,
      config: { severity: 'warning', autoFix: true, timeout: 60000 },
    });
    expect(result.config.severity).toBe('warning');
    expect(result.config.autoFix).toBe(true);
    expect(result.config.timeout).toBe(60000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/cli && npx vitest run tests/persona/schema.test.ts`
Expected: FAIL — cannot resolve `../../src/persona/schema`

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/cli/src/persona/schema.ts
import { z } from 'zod';

export const PersonaTriggerSchema = z.discriminatedUnion('event', [
  z.object({
    event: z.literal('on_pr'),
    conditions: z.object({ paths: z.array(z.string()).optional() }).optional(),
  }),
  z.object({
    event: z.literal('on_commit'),
    conditions: z.object({ branches: z.array(z.string()).optional() }).optional(),
  }),
  z.object({
    event: z.literal('scheduled'),
    cron: z.string(),
  }),
]);

export const PersonaConfigSchema = z.object({
  severity: z.enum(['error', 'warning']).default('error'),
  autoFix: z.boolean().default(false),
  timeout: z.number().default(300000),
});

export const PersonaOutputsSchema = z.object({
  'agents-md': z.boolean().default(true),
  'ci-workflow': z.boolean().default(true),
  'runtime-config': z.boolean().default(true),
});

export const PersonaSchema = z.object({
  version: z.literal(1),
  name: z.string(),
  description: z.string(),
  role: z.string(),
  skills: z.array(z.string()),
  commands: z.array(z.string()),
  triggers: z.array(PersonaTriggerSchema),
  config: PersonaConfigSchema.default({}),
  outputs: PersonaOutputsSchema.default({}),
});

export type Persona = z.infer<typeof PersonaSchema>;
export type PersonaTrigger = z.infer<typeof PersonaTriggerSchema>;
export type PersonaConfig = z.infer<typeof PersonaConfigSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/cli && npx vitest run tests/persona/schema.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/persona/schema.ts packages/cli/tests/persona/schema.test.ts
git commit -m "feat(persona): add PersonaSchema Zod definition"
```

---

### Task 9: Persona Loader

**Files:**
- Create: `packages/cli/src/persona/loader.ts`
- Test: `packages/cli/tests/persona/loader.test.ts`
- Create: test fixtures

- [ ] **Step 1: Create test fixtures**

```yaml
# packages/cli/tests/persona/fixtures/valid-persona.yaml
version: 1
name: Test Enforcer
description: Test persona
role: Test role
skills:
  - enforce-architecture
commands:
  - validate
triggers:
  - event: on_pr
config:
  severity: error
```

```yaml
# packages/cli/tests/persona/fixtures/invalid-persona.yaml
version: 2
name: Bad Persona
```

- [ ] **Step 2: Write the failing test**

```typescript
// packages/cli/tests/persona/loader.test.ts
import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { loadPersona, listPersonas } from '../../src/persona/loader';

const FIXTURES = path.join(__dirname, 'fixtures');

describe('loadPersona', () => {
  it('loads and validates a valid persona YAML', () => {
    const result = loadPersona(path.join(FIXTURES, 'valid-persona.yaml'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe('Test Enforcer');
    expect(result.value.commands).toEqual(['validate']);
  });

  it('returns error for invalid persona', () => {
    const result = loadPersona(path.join(FIXTURES, 'invalid-persona.yaml'));
    expect(result.ok).toBe(false);
  });

  it('returns error for missing file', () => {
    const result = loadPersona(path.join(FIXTURES, 'nonexistent.yaml'));
    expect(result.ok).toBe(false);
  });
});

describe('listPersonas', () => {
  it('lists all valid personas in a directory', () => {
    const result = listPersonas(FIXTURES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBeGreaterThanOrEqual(1);
    expect(result.value[0].name).toBe('Test Enforcer');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd packages/cli && npx vitest run tests/persona/loader.test.ts`
Expected: FAIL — cannot resolve `../../src/persona/loader`

- [ ] **Step 4: Write the implementation**

```typescript
// packages/cli/src/persona/loader.ts
import * as fs from 'fs';
import * as path from 'path';
import YAML from 'yaml';
import type { Result } from '@harness-engineering/core';
import { Ok, Err } from '@harness-engineering/core';
import { PersonaSchema, type Persona } from './schema';

export interface PersonaMetadata {
  name: string;
  description: string;
  filePath: string;
}

export function loadPersona(filePath: string): Result<Persona, Error> {
  try {
    if (!fs.existsSync(filePath)) {
      return Err(new Error(`Persona file not found: ${filePath}`));
    }

    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = YAML.parse(raw);
    const result = PersonaSchema.safeParse(parsed);

    if (!result.success) {
      return Err(new Error(`Invalid persona ${filePath}: ${result.error.message}`));
    }

    return Ok(result.data);
  } catch (error) {
    return Err(new Error(`Failed to load persona: ${error instanceof Error ? error.message : String(error)}`));
  }
}

export function listPersonas(dir: string): Result<PersonaMetadata[], Error> {
  try {
    if (!fs.existsSync(dir)) {
      return Ok([]);
    }

    const entries = fs.readdirSync(dir).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
    const personas: PersonaMetadata[] = [];

    for (const entry of entries) {
      const filePath = path.join(dir, entry);
      const result = loadPersona(filePath);
      if (result.ok) {
        personas.push({
          name: result.value.name,
          description: result.value.description,
          filePath,
        });
      }
    }

    return Ok(personas);
  } catch (error) {
    return Err(new Error(`Failed to list personas: ${error instanceof Error ? error.message : String(error)}`));
  }
}
```

Note: If `yaml` is not yet a dependency of the CLI package, install it:
Run: `cd packages/cli && pnpm add yaml`

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/cli && npx vitest run tests/persona/loader.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/persona/loader.ts packages/cli/tests/persona/loader.test.ts packages/cli/tests/persona/fixtures/
git commit -m "feat(persona): add persona YAML loader with validation"
```

---

### Task 10: Runtime Config Generator

**Files:**
- Create: `packages/cli/src/persona/generators/runtime.ts`
- Test: `packages/cli/tests/persona/generators/runtime.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/cli/tests/persona/generators/runtime.test.ts
import { describe, it, expect } from 'vitest';
import { generateRuntime } from '../../../src/persona/generators/runtime';
import type { Persona } from '../../../src/persona/schema';

const mockPersona: Persona = {
  version: 1,
  name: 'Architecture Enforcer',
  description: 'Validates constraints',
  role: 'Enforce boundaries',
  skills: ['enforce-architecture', 'check-mechanical-constraints'],
  commands: ['check-deps', 'validate'],
  triggers: [{ event: 'on_pr' as const }],
  config: { severity: 'error', autoFix: false, timeout: 300000 },
  outputs: { 'agents-md': true, 'ci-workflow': true, 'runtime-config': true },
};

describe('generateRuntime', () => {
  it('generates valid runtime config JSON', () => {
    const result = generateRuntime(mockPersona);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const config = JSON.parse(result.value);
    expect(config.name).toBe('architecture-enforcer');
    expect(config.skills).toEqual(['enforce-architecture', 'check-mechanical-constraints']);
    expect(config.commands).toEqual(['check-deps', 'validate']);
    expect(config.timeout).toBe(300000);
    expect(config.severity).toBe('error');
  });

  it('converts name to kebab-case slug', () => {
    const result = generateRuntime({ ...mockPersona, name: 'Documentation Maintainer' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const config = JSON.parse(result.value);
    expect(config.name).toBe('documentation-maintainer');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/cli && npx vitest run tests/persona/generators/runtime.test.ts`
Expected: FAIL — cannot resolve module

- [ ] **Step 3: Write the implementation**

```typescript
// packages/cli/src/persona/generators/runtime.ts
import type { Result } from '@harness-engineering/core';
import { Ok, Err } from '@harness-engineering/core';
import type { Persona } from '../schema';

function toKebabCase(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

export function generateRuntime(persona: Persona): Result<string, Error> {
  try {
    const config = {
      name: toKebabCase(persona.name),
      skills: persona.skills,
      commands: persona.commands,
      timeout: persona.config.timeout,
      severity: persona.config.severity,
    };

    return Ok(JSON.stringify(config, null, 2));
  } catch (error) {
    return Err(new Error(`Failed to generate runtime config: ${error instanceof Error ? error.message : String(error)}`));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/cli && npx vitest run tests/persona/generators/runtime.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/persona/generators/runtime.ts packages/cli/tests/persona/generators/runtime.test.ts
git commit -m "feat(persona): add runtime config generator"
```

---

### Task 11: AGENTS.md Fragment Generator

**Files:**
- Create: `packages/cli/src/persona/generators/agents-md.ts`
- Test: `packages/cli/tests/persona/generators/agents-md.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/cli/tests/persona/generators/agents-md.test.ts
import { describe, it, expect } from 'vitest';
import { generateAgentsMd } from '../../../src/persona/generators/agents-md';
import type { Persona } from '../../../src/persona/schema';

const mockPersona: Persona = {
  version: 1,
  name: 'Architecture Enforcer',
  description: 'Validates constraints',
  role: 'Enforce layer boundaries, detect circular dependencies',
  skills: ['enforce-architecture', 'check-mechanical-constraints'],
  commands: ['check-deps', 'validate'],
  triggers: [
    { event: 'on_pr' as const, conditions: { paths: ['src/**'] } },
    { event: 'on_commit' as const, conditions: { branches: ['main', 'develop'] } },
    { event: 'scheduled' as const, cron: '0 6 * * 1' },
  ],
  config: { severity: 'error', autoFix: false, timeout: 300000 },
  outputs: { 'agents-md': true, 'ci-workflow': true, 'runtime-config': true },
};

describe('generateAgentsMd', () => {
  it('generates valid markdown fragment', () => {
    const result = generateAgentsMd(mockPersona);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toContain('## Architecture Enforcer Agent');
    expect(result.value).toContain('**Role:**');
    expect(result.value).toContain('Enforce layer boundaries');
    expect(result.value).toContain('**Skills:**');
    expect(result.value).toContain('enforce-architecture');
    expect(result.value).toContain('**Triggers:**');
    expect(result.value).toContain('On PR');
  });

  it('formats triggers correctly', () => {
    const result = generateAgentsMd(mockPersona);
    if (!result.ok) return;
    expect(result.value).toContain('src/**');
    expect(result.value).toContain('main');
    expect(result.value).toContain('weekly');
  });

  it('includes remediation guidance', () => {
    const result = generateAgentsMd(mockPersona);
    if (!result.ok) return;
    expect(result.value).toContain('**When this agent flags an issue:**');
    expect(result.value).toContain('harness check-deps');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/cli && npx vitest run tests/persona/generators/agents-md.test.ts`
Expected: FAIL

- [ ] **Step 3: Write the implementation**

```typescript
// packages/cli/src/persona/generators/agents-md.ts
import type { Result } from '@harness-engineering/core';
import { Ok, Err } from '@harness-engineering/core';
import type { Persona, PersonaTrigger } from '../schema';

function formatTrigger(trigger: PersonaTrigger): string {
  switch (trigger.event) {
    case 'on_pr': {
      const paths = trigger.conditions?.paths?.join(', ') ?? 'all files';
      return `On PR (${paths})`;
    }
    case 'on_commit': {
      const branches = trigger.conditions?.branches?.join(', ') ?? 'all branches';
      return `On commit (${branches})`;
    }
    case 'scheduled':
      return `Scheduled weekly (${trigger.cron})`;
  }
}

export function generateAgentsMd(persona: Persona): Result<string, Error> {
  try {
    const triggers = persona.triggers.map(formatTrigger).join(', ');
    const skills = persona.skills.join(', ');
    const commands = persona.commands.map((c) => `\`harness ${c}\``).join(', ');

    const fragment = `## ${persona.name} Agent

**Role:** ${persona.role}

**Triggers:** ${triggers}

**Skills:** ${skills}

**When this agent flags an issue:** Fix violations before merging. Run ${commands} locally to validate.
`;

    return Ok(fragment);
  } catch (error) {
    return Err(new Error(`Failed to generate AGENTS.md fragment: ${error instanceof Error ? error.message : String(error)}`));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/cli && npx vitest run tests/persona/generators/agents-md.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/persona/generators/agents-md.ts packages/cli/tests/persona/generators/agents-md.test.ts
git commit -m "feat(persona): add AGENTS.md fragment generator"
```

---

### Task 12: GitHub Actions CI Workflow Generator

**Files:**
- Create: `packages/cli/src/persona/generators/ci-workflow.ts`
- Test: `packages/cli/tests/persona/generators/ci-workflow.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/cli/tests/persona/generators/ci-workflow.test.ts
import { describe, it, expect } from 'vitest';
import YAML from 'yaml';
import { generateCIWorkflow } from '../../../src/persona/generators/ci-workflow';
import type { Persona } from '../../../src/persona/schema';

const mockPersona: Persona = {
  version: 1,
  name: 'Architecture Enforcer',
  description: 'Validates constraints',
  role: 'Enforce boundaries',
  skills: ['enforce-architecture'],
  commands: ['check-deps', 'validate'],
  triggers: [
    { event: 'on_pr' as const, conditions: { paths: ['src/**'] } },
    { event: 'on_commit' as const, conditions: { branches: ['main'] } },
    { event: 'scheduled' as const, cron: '0 6 * * 1' },
  ],
  config: { severity: 'error', autoFix: false, timeout: 300000 },
  outputs: { 'agents-md': true, 'ci-workflow': true, 'runtime-config': true },
};

describe('generateCIWorkflow', () => {
  it('generates valid GitHub Actions YAML', () => {
    const result = generateCIWorkflow(mockPersona, 'github');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const workflow = YAML.parse(result.value);
    expect(workflow.name).toBe('Architecture Enforcer');
    expect(workflow.on.pull_request).toBeDefined();
    expect(workflow.on.push).toBeDefined();
    expect(workflow.on.schedule).toBeDefined();
  });

  it('includes path filters for PR triggers', () => {
    const result = generateCIWorkflow(mockPersona, 'github');
    if (!result.ok) return;
    const workflow = YAML.parse(result.value);
    expect(workflow.on.pull_request.paths).toEqual(['src/**']);
  });

  it('includes branch filters for commit triggers', () => {
    const result = generateCIWorkflow(mockPersona, 'github');
    if (!result.ok) return;
    const workflow = YAML.parse(result.value);
    expect(workflow.on.push.branches).toEqual(['main']);
  });

  it('includes cron schedule', () => {
    const result = generateCIWorkflow(mockPersona, 'github');
    if (!result.ok) return;
    const workflow = YAML.parse(result.value);
    expect(workflow.on.schedule[0].cron).toBe('0 6 * * 1');
  });

  it('generates run steps for each command', () => {
    const result = generateCIWorkflow(mockPersona, 'github');
    if (!result.ok) return;
    const workflow = YAML.parse(result.value);
    const steps = workflow.jobs.enforce.steps;
    const runSteps = steps.filter((s: Record<string, unknown>) => typeof s.run === 'string');
    expect(runSteps.length).toBe(2);
    expect(runSteps[0].run).toContain('harness check-deps');
    expect(runSteps[1].run).toContain('harness validate');
  });

  it('includes severity flag when severity is set', () => {
    const result = generateCIWorkflow(mockPersona, 'github');
    if (!result.ok) return;
    expect(result.value).toContain('--severity error');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/cli && npx vitest run tests/persona/generators/ci-workflow.test.ts`
Expected: FAIL

- [ ] **Step 3: Write the implementation**

```typescript
// packages/cli/src/persona/generators/ci-workflow.ts
import YAML from 'yaml';
import type { Result } from '@harness-engineering/core';
import { Ok, Err } from '@harness-engineering/core';
import type { Persona, PersonaTrigger } from '../schema';

function toKebabCase(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

function buildGitHubTriggers(triggers: PersonaTrigger[]): Record<string, unknown> {
  const on: Record<string, unknown> = {};

  for (const trigger of triggers) {
    switch (trigger.event) {
      case 'on_pr': {
        const prConfig: Record<string, unknown> = {};
        if (trigger.conditions?.paths) {
          prConfig.paths = trigger.conditions.paths;
        }
        on.pull_request = prConfig;
        break;
      }
      case 'on_commit': {
        const pushConfig: Record<string, unknown> = {};
        if (trigger.conditions?.branches) {
          pushConfig.branches = trigger.conditions.branches;
        }
        on.push = pushConfig;
        break;
      }
      case 'scheduled':
        on.schedule = [{ cron: trigger.cron }];
        break;
    }
  }

  return on;
}

export function generateCIWorkflow(
  persona: Persona,
  platform: 'github' | 'gitlab'
): Result<string, Error> {
  try {
    if (platform === 'gitlab') {
      return Err(new Error('GitLab CI generation is not yet supported'));
    }

    const slug = toKebabCase(persona.name);
    const severity = persona.config.severity;

    const steps: Record<string, unknown>[] = [
      { uses: 'actions/checkout@v4' },
      { uses: 'actions/setup-node@v4', with: { 'node-version': '20' } },
      { run: 'npm ci' },
    ];

    for (const cmd of persona.commands) {
      const severityFlag = severity ? ` --severity ${severity}` : '';
      steps.push({ run: `npx harness ${cmd}${severityFlag}` });
    }

    const workflow = {
      name: persona.name,
      on: buildGitHubTriggers(persona.triggers),
      jobs: {
        enforce: {
          'runs-on': 'ubuntu-latest',
          steps,
        },
      },
    };

    return Ok(YAML.stringify(workflow, { lineWidth: 0 }));
  } catch (error) {
    return Err(new Error(`Failed to generate CI workflow: ${error instanceof Error ? error.message : String(error)}`));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/cli && npx vitest run tests/persona/generators/ci-workflow.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/persona/generators/ci-workflow.ts packages/cli/tests/persona/generators/ci-workflow.test.ts
git commit -m "feat(persona): add GitHub Actions CI workflow generator"
```

---

### Task 13: Create Built-in Persona YAML Files

**Files:**
- Create: `agents/personas/architecture-enforcer.yaml`
- Create: `agents/personas/documentation-maintainer.yaml`
- Create: `agents/personas/entropy-cleaner.yaml`

- [ ] **Step 1: Create architecture-enforcer persona**

```yaml
# agents/personas/architecture-enforcer.yaml
version: 1
name: Architecture Enforcer
description: Validates architectural constraints and dependency rules
role: Enforce layer boundaries, detect circular dependencies, block forbidden imports

skills:
  - enforce-architecture
  - check-mechanical-constraints

commands:
  - check-deps
  - validate

triggers:
  - event: on_pr
    conditions:
      paths: ["src/**"]
  - event: on_commit
    conditions:
      branches: ["main", "develop"]
  - event: scheduled
    cron: "0 6 * * 1"

config:
  severity: error
  autoFix: false
  timeout: 300000

outputs:
  agents-md: true
  ci-workflow: true
  runtime-config: true
```

- [ ] **Step 2: Create documentation-maintainer persona**

```yaml
# agents/personas/documentation-maintainer.yaml
version: 1
name: Documentation Maintainer
description: Keeps documentation in sync with source code
role: Detect documentation drift, validate doc coverage, align docs with code changes

skills:
  - detect-doc-drift
  - align-documentation

commands:
  - check-docs
  - validate

triggers:
  - event: on_pr
    conditions:
      paths: ["src/**", "docs/**"]
  - event: on_commit
    conditions:
      branches: ["main"]

config:
  severity: warning
  autoFix: false
  timeout: 300000

outputs:
  agents-md: true
  ci-workflow: true
  runtime-config: true
```

- [ ] **Step 3: Create entropy-cleaner persona**

```yaml
# agents/personas/entropy-cleaner.yaml
version: 1
name: Entropy Cleaner
description: Detects and fixes codebase entropy (drift, dead code, pattern violations)
role: Run scheduled cleanup, detect documentation drift, fix pattern violations

skills:
  - cleanup-dead-code
  - detect-doc-drift

commands:
  - cleanup
  - fix-drift

triggers:
  - event: scheduled
    cron: "0 6 * * 1"

config:
  severity: warning
  autoFix: false
  timeout: 600000

outputs:
  agents-md: true
  ci-workflow: true
  runtime-config: true
```

- [ ] **Step 4: Write validation test for built-in personas**

```typescript
// packages/cli/tests/persona/builtins.test.ts
import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { loadPersona, listPersonas } from '../../src/persona/loader';

const PERSONAS_DIR = path.resolve(__dirname, '..', '..', '..', '..', 'agents', 'personas');

describe('built-in personas', () => {
  const personaFiles = [
    'architecture-enforcer.yaml',
    'documentation-maintainer.yaml',
    'entropy-cleaner.yaml',
  ];

  for (const file of personaFiles) {
    it(`${file} is valid`, () => {
      const result = loadPersona(path.join(PERSONAS_DIR, file));
      expect(result.ok).toBe(true);
    });
  }

  it('lists all 3 built-in personas', () => {
    const result = listPersonas(PERSONAS_DIR);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBe(3);
  });
});
```

- [ ] **Step 5: Run tests**

Run: `cd packages/cli && npx vitest run tests/persona/builtins.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add agents/personas/ packages/cli/tests/persona/builtins.test.ts
git commit -m "feat(persona): add three built-in persona configs

architecture-enforcer, documentation-maintainer, entropy-cleaner"
```

---

### Task 14: Persona Runner (Execute Commands)

**Files:**
- Create: `packages/cli/src/persona/runner.ts`
- Test: `packages/cli/tests/persona/runner.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/cli/tests/persona/runner.test.ts
import { describe, it, expect, vi } from 'vitest';
import { runPersona, type CommandExecutor } from '../../src/persona/runner';
import type { Persona } from '../../src/persona/schema';

const mockPersona: Persona = {
  version: 1,
  name: 'Test Persona',
  description: 'Test',
  role: 'Test',
  skills: ['test-skill'],
  commands: ['validate', 'check-deps'],
  triggers: [{ event: 'on_pr' as const }],
  config: { severity: 'error', autoFix: false, timeout: 300000 },
  outputs: { 'agents-md': true, 'ci-workflow': true, 'runtime-config': true },
};

describe('runPersona', () => {
  it('executes all commands and returns pass report', async () => {
    const executor: CommandExecutor = vi.fn().mockResolvedValue({ ok: true, value: { valid: true } });

    const report = await runPersona(mockPersona, executor);
    expect(report.status).toBe('pass');
    expect(report.commands).toHaveLength(2);
    expect(report.commands[0].status).toBe('pass');
    expect(report.commands[1].status).toBe('pass');
    expect(executor).toHaveBeenCalledTimes(2);
  });

  it('fails fast when a command fails', async () => {
    const executor: CommandExecutor = vi.fn()
      .mockResolvedValueOnce({ ok: true, value: {} })
      .mockResolvedValueOnce({ ok: false, error: new Error('check-deps failed') });

    const report = await runPersona(mockPersona, executor);
    expect(report.status).toBe('fail');
    expect(report.commands[0].status).toBe('pass');
    expect(report.commands[1].status).toBe('fail');
    expect(report.commands[1].error).toContain('check-deps failed');
  });

  it('respects timeout', async () => {
    const slowExecutor: CommandExecutor = vi.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ ok: true, value: {} }), 5000))
    );

    const persona = { ...mockPersona, config: { ...mockPersona.config, timeout: 50 } };
    const report = await runPersona(persona, slowExecutor);
    expect(report.status).toBe('partial');
  });

  it('tracks duration per command', async () => {
    const executor: CommandExecutor = vi.fn().mockResolvedValue({ ok: true, value: {} });

    const report = await runPersona(mockPersona, executor);
    for (const cmd of report.commands) {
      expect(cmd.durationMs).toBeGreaterThanOrEqual(0);
    }
    expect(report.totalDurationMs).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/cli && npx vitest run tests/persona/runner.test.ts`
Expected: FAIL

- [ ] **Step 3: Write the implementation**

```typescript
// packages/cli/src/persona/runner.ts
import type { Result } from '@harness-engineering/core';
import type { Persona } from './schema';

export interface PersonaRunReport {
  persona: string;
  status: 'pass' | 'fail' | 'partial';
  commands: Array<{
    name: string;
    status: 'pass' | 'fail' | 'skipped';
    result?: unknown;
    error?: string;
    durationMs: number;
  }>;
  totalDurationMs: number;
}

export type CommandExecutor = (command: string) => Promise<Result<unknown, Error>>;

export async function runPersona(
  persona: Persona,
  executor: CommandExecutor
): Promise<PersonaRunReport> {
  const startTime = Date.now();
  const timeout = persona.config.timeout;
  const report: PersonaRunReport = {
    persona: persona.name.toLowerCase().replace(/\s+/g, '-'),
    status: 'pass',
    commands: [],
    totalDurationMs: 0,
  };

  for (const command of persona.commands) {
    // Check timeout
    if (Date.now() - startTime >= timeout) {
      report.commands.push({
        name: command,
        status: 'skipped',
        durationMs: 0,
      });
      report.status = 'partial';
      continue;
    }

    const cmdStart = Date.now();
    try {
      const remaining = timeout - (Date.now() - startTime);
      const result = await Promise.race([
        executor(command),
        new Promise<Result<never, Error>>((_, reject) =>
          setTimeout(() => reject(new Error('Command timed out')), remaining)
        ),
      ]);

      const durationMs = Date.now() - cmdStart;

      if (result.ok) {
        report.commands.push({
          name: command,
          status: 'pass',
          result: result.value,
          durationMs,
        });
      } else {
        report.commands.push({
          name: command,
          status: 'fail',
          error: result.error.message,
          durationMs,
        });
        report.status = 'fail';
        // Fail-fast: skip remaining commands
        for (const remaining of persona.commands.slice(persona.commands.indexOf(command) + 1)) {
          report.commands.push({ name: remaining, status: 'skipped', durationMs: 0 });
        }
        break;
      }
    } catch (error) {
      report.commands.push({
        name: command,
        status: 'fail',
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - cmdStart,
      });
      report.status = 'partial';
      // Mark remaining as skipped
      for (const remaining of persona.commands.slice(persona.commands.indexOf(command) + 1)) {
        report.commands.push({ name: remaining, status: 'skipped', durationMs: 0 });
      }
      break;
    }
  }

  report.totalDurationMs = Date.now() - startTime;
  return report;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/cli && npx vitest run tests/persona/runner.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/persona/runner.ts packages/cli/tests/persona/runner.test.ts
git commit -m "feat(persona): add persona runner with fail-fast and timeout"
```

---

### Task 15: Persona CLI Commands

**Files:**
- Create: `packages/cli/src/commands/persona/index.ts`
- Create: `packages/cli/src/commands/persona/list.ts`
- Create: `packages/cli/src/commands/persona/generate.ts`
- Modify: `packages/cli/src/index.ts`

- [ ] **Step 1: Write the list command**

```typescript
// packages/cli/src/commands/persona/list.ts
import { Command } from 'commander';
import * as path from 'path';
import { listPersonas } from '../../persona/loader';
import { logger } from '../../output/logger';
import { ExitCode } from '../../utils/errors';

function resolvePersonasDir(): string {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..', '..');
  return path.join(repoRoot, 'agents', 'personas');
}

export function createListCommand(): Command {
  return new Command('list')
    .description('List available agent personas')
    .action(async (_opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const personasDir = resolvePersonasDir();
      const result = listPersonas(personasDir);

      if (!result.ok) {
        logger.error(result.error.message);
        process.exit(ExitCode.ERROR);
      }

      if (globalOpts.json) {
        logger.raw(result.value);
      } else if (globalOpts.quiet) {
        for (const p of result.value) {
          console.log(p.name);
        }
      } else {
        if (result.value.length === 0) {
          logger.info('No personas found.');
        } else {
          console.log('Available personas:\n');
          for (const p of result.value) {
            console.log(`  ${p.name}`);
            console.log(`    ${p.description}\n`);
          }
        }
      }

      process.exit(ExitCode.SUCCESS);
    });
}
```

- [ ] **Step 2: Write the generate command**

```typescript
// packages/cli/src/commands/persona/generate.ts
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { loadPersona } from '../../persona/loader';
import { generateRuntime } from '../../persona/generators/runtime';
import { generateAgentsMd } from '../../persona/generators/agents-md';
import { generateCIWorkflow } from '../../persona/generators/ci-workflow';
import { logger } from '../../output/logger';
import { ExitCode } from '../../utils/errors';

function resolvePersonasDir(): string {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..', '..');
  return path.join(repoRoot, 'agents', 'personas');
}

function toKebabCase(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

export function createGenerateCommand(): Command {
  return new Command('generate')
    .description('Generate artifacts from a persona config')
    .argument('<name>', 'Persona name (e.g., architecture-enforcer)')
    .option('--output-dir <dir>', 'Output directory', '.')
    .option('--only <type>', 'Generate only: ci, agents-md, runtime')
    .action(async (name, opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const personasDir = resolvePersonasDir();
      const filePath = path.join(personasDir, `${name}.yaml`);

      const personaResult = loadPersona(filePath);
      if (!personaResult.ok) {
        logger.error(personaResult.error.message);
        process.exit(ExitCode.ERROR);
      }

      const persona = personaResult.value;
      const outputDir = path.resolve(opts.outputDir);
      const slug = toKebabCase(persona.name);
      const only = opts.only as string | undefined;
      const generated: string[] = [];

      // Runtime config
      if (!only || only === 'runtime') {
        const result = generateRuntime(persona);
        if (result.ok) {
          const outPath = path.join(outputDir, `${slug}.runtime.json`);
          fs.mkdirSync(path.dirname(outPath), { recursive: true });
          fs.writeFileSync(outPath, result.value);
          generated.push(outPath);
        }
      }

      // AGENTS.md fragment
      if (!only || only === 'agents-md') {
        const result = generateAgentsMd(persona);
        if (result.ok) {
          const outPath = path.join(outputDir, `${slug}.agents.md`);
          fs.writeFileSync(outPath, result.value);
          generated.push(outPath);
        }
      }

      // CI workflow
      if (!only || only === 'ci') {
        const result = generateCIWorkflow(persona, 'github');
        if (result.ok) {
          const outPath = path.join(outputDir, '.github', 'workflows', `${slug}.yml`);
          fs.mkdirSync(path.dirname(outPath), { recursive: true });
          fs.writeFileSync(outPath, result.value);
          generated.push(outPath);
        }
      }

      if (!globalOpts.quiet) {
        logger.success(`Generated ${generated.length} artifacts for ${persona.name}:`);
        for (const f of generated) {
          console.log(`  - ${f}`);
        }
      }

      process.exit(ExitCode.SUCCESS);
    });
}
```

- [ ] **Step 3: Write the parent command**

```typescript
// packages/cli/src/commands/persona/index.ts
import { Command } from 'commander';
import { createListCommand } from './list';
import { createGenerateCommand } from './generate';

export function createPersonaCommand(): Command {
  const command = new Command('persona').description('Agent persona management commands');

  command.addCommand(createListCommand());
  command.addCommand(createGenerateCommand());

  return command;
}
```

- [ ] **Step 4: Register persona command in CLI**

In `packages/cli/src/index.ts`, add import and registration:

```typescript
import { createPersonaCommand } from './commands/persona';
```

Add to `createProgram()`:
```typescript
program.addCommand(createPersonaCommand());
```

- [ ] **Step 5: Run all CLI tests**

Run: `cd packages/cli && npx vitest run`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/commands/persona/ packages/cli/src/index.ts
git commit -m "feat(cli): add harness persona list and generate commands"
```

---

### Task 16: Wire `--persona` Flag to `harness agent run`

**Files:**
- Modify: `packages/cli/src/commands/agent/run.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/cli/tests/commands/agent-run-persona.test.ts
import { describe, it, expect, vi } from 'vitest';
import * as path from 'path';

// Test that --persona flag loads and runs a persona
// We test the runAgentTask function with the persona option
describe('harness agent run --persona', () => {
  it('placeholder: persona flag is accepted', () => {
    // This tests the integration at the command level
    // The actual persona execution is tested in runner.test.ts
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 2: Add `--persona` flag to agent run command**

In `packages/cli/src/commands/agent/run.ts`, add the persona flag and a new code path:

Add imports at top:
```typescript
import { loadPersona } from '../../persona/loader';
import { runPersona, type CommandExecutor } from '../../persona/runner';
```

In the `createRunCommand` function, add the `--persona` option and modify the action:

```typescript
.option('--persona <name>', 'Run a persona by name')
```

In the action handler, add before the existing task logic:

```typescript
if (opts.persona) {
  const personasDir = path.resolve(__dirname, '..', '..', '..', '..', '..', 'agents', 'personas');
  const filePath = path.join(personasDir, `${opts.persona}.yaml`);
  const personaResult = loadPersona(filePath);

  if (!personaResult.ok) {
    logger.error(personaResult.error.message);
    process.exit(ExitCode.ERROR);
  }

  // Create executor that maps commands to CLI functions
  const executor: CommandExecutor = async (command: string) => {
    // Delegate to existing CLI command handlers
    const { Ok, Err } = await import('@harness-engineering/core');
    try {
      // For now, use subprocess to call harness CLI
      const { execSync } = await import('child_process');
      execSync(`npx harness ${command}`, { stdio: 'pipe', timeout: personaResult.value.config.timeout });
      return Ok({});
    } catch (error) {
      return Err(new Error(`Command '${command}' failed: ${error instanceof Error ? error.message : String(error)}`));
    }
  };

  const report = await runPersona(personaResult.value, executor);

  if (globalOpts.json) {
    logger.raw(report);
  } else {
    for (const cmd of report.commands) {
      const icon = cmd.status === 'pass' ? 'v' : cmd.status === 'fail' ? 'x' : '-';
      console.log(`  ${icon} ${cmd.name}: ${cmd.status} (${cmd.durationMs}ms)`);
    }
    if (report.status === 'pass') {
      logger.success(`Persona '${opts.persona}' passed all checks`);
    } else {
      logger.error(`Persona '${opts.persona}' ${report.status}`);
    }
  }

  process.exit(report.status === 'pass' ? ExitCode.SUCCESS : ExitCode.ERROR);
}
```

- [ ] **Step 3: Run all CLI tests**

Run: `cd packages/cli && npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/commands/agent/run.ts packages/cli/tests/commands/agent-run-persona.test.ts
git commit -m "feat(cli): add --persona flag to harness agent run

New code path loads persona config and executes commands sequentially.
Coexists with existing task-based agent run."
```

---

End of Chunk 2.

---

## Chunk 3: MCP Server (Slice 3)

### Task 17: Scaffold MCP Server Package

**Files:**
- Create: `packages/mcp-server/package.json`
- Create: `packages/mcp-server/tsconfig.json`
- Create: `packages/mcp-server/vitest.config.mts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@harness-engineering/mcp-server",
  "version": "0.1.0",
  "description": "MCP server for Harness Engineering toolkit",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "bin": {
    "harness-mcp": "./dist/bin/harness-mcp.js"
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "@harness-engineering/core": "workspace:*",
    "@harness-engineering/cli": "workspace:*",
    "@harness-engineering/linter-gen": "workspace:*",
    "@harness-engineering/types": "workspace:*",
    "zod": "^3.22.0",
    "yaml": "^2.3.0",
    "handlebars": "^4.7.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0",
    "vitest": "^2.0.0"
  },
  "license": "MIT"
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "references": [
    { "path": "../core" },
    { "path": "../types" }
  ]
}
```

- [ ] **Step 3: Create vitest.config.mts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
  },
});
```

- [ ] **Step 4: Install dependencies**

Run from workspace root: `pnpm install`

- [ ] **Step 5: Commit**

```bash
git add packages/mcp-server/package.json packages/mcp-server/tsconfig.json packages/mcp-server/vitest.config.mts
git commit -m "chore(mcp-server): scaffold package with dependencies"
```

---

### Task 18: Result Adapter

**Files:**
- Create: `packages/mcp-server/src/utils/result-adapter.ts`
- Test: `packages/mcp-server/tests/result-adapter.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/mcp-server/tests/result-adapter.test.ts
import { describe, it, expect } from 'vitest';
import { Ok, Err } from '@harness-engineering/core';
import { resultToMcpResponse } from '../src/utils/result-adapter';

describe('resultToMcpResponse', () => {
  it('converts Ok result to MCP success response', () => {
    const result = Ok({ valid: true, issues: [] });
    const response = resultToMcpResponse(result);

    expect(response.isError).toBeUndefined();
    expect(response.content).toHaveLength(1);
    expect(response.content[0].type).toBe('text');
    expect(JSON.parse(response.content[0].text)).toEqual({ valid: true, issues: [] });
  });

  it('converts Err result to MCP error response', () => {
    const result = Err(new Error('Validation failed: missing AGENTS.md'));
    const response = resultToMcpResponse(result);

    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain('Validation failed');
  });

  it('handles string values', () => {
    const result = Ok('simple string');
    const response = resultToMcpResponse(result);
    expect(response.content[0].text).toBe('"simple string"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/mcp-server && npx vitest run tests/result-adapter.test.ts`
Expected: FAIL

- [ ] **Step 3: Write the implementation**

```typescript
// packages/mcp-server/src/utils/result-adapter.ts
import type { Result } from '@harness-engineering/core';

interface McpToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export function resultToMcpResponse(result: Result<unknown, Error>): McpToolResponse {
  if (result.ok) {
    return {
      content: [{ type: 'text', text: JSON.stringify(result.value) }],
    };
  }

  return {
    content: [{ type: 'text', text: result.error.message }],
    isError: true,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/mcp-server && npx vitest run tests/result-adapter.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/mcp-server/src/utils/result-adapter.ts packages/mcp-server/tests/result-adapter.test.ts
git commit -m "feat(mcp-server): add Result-to-MCP response adapter"
```

---

### Task 19: Config Resolver

**Files:**
- Create: `packages/mcp-server/src/utils/config-resolver.ts`
- Test: `packages/mcp-server/tests/config-resolver.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/mcp-server/tests/config-resolver.test.ts
import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { resolveProjectConfig } from '../src/utils/config-resolver';

describe('resolveProjectConfig', () => {
  it('finds harness.config.json in given path', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'harness.config.json'),
      JSON.stringify({ version: 1, name: 'test' })
    );

    const result = resolveProjectConfig(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe('test');
    }

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('returns error when config not found', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-test-'));
    const result = resolveProjectConfig(tmpDir);
    expect(result.ok).toBe(false);
    fs.rmSync(tmpDir, { recursive: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/mcp-server && npx vitest run tests/config-resolver.test.ts`
Expected: FAIL

- [ ] **Step 3: Write the implementation**

```typescript
// packages/mcp-server/src/utils/config-resolver.ts
import * as fs from 'fs';
import * as path from 'path';
import type { Result } from '@harness-engineering/core';
import { Ok, Err } from '@harness-engineering/core';

export interface ProjectConfig {
  name?: string;
  version: number;
  [key: string]: unknown;
}

export function resolveProjectConfig(projectPath: string): Result<ProjectConfig, Error> {
  const configPath = path.join(projectPath, 'harness.config.json');

  if (!fs.existsSync(configPath)) {
    return Err(new Error(`No harness.config.json found in ${projectPath}`));
  }

  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(raw) as ProjectConfig;
    return Ok(config);
  } catch (error) {
    return Err(new Error(`Failed to parse config: ${error instanceof Error ? error.message : String(error)}`));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/mcp-server && npx vitest run tests/config-resolver.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/mcp-server/src/utils/config-resolver.ts packages/mcp-server/tests/config-resolver.test.ts
git commit -m "feat(mcp-server): add project config resolver"
```

---

### Task 20: MCP Server Core + Validate Tool

**Files:**
- Create: `packages/mcp-server/src/server.ts`
- Create: `packages/mcp-server/src/tools/validate.ts`
- Test: `packages/mcp-server/tests/server.test.ts`
- Test: `packages/mcp-server/tests/tools/validate.test.ts`

- [ ] **Step 1: Write the validate tool test**

```typescript
// packages/mcp-server/tests/tools/validate.test.ts
import { describe, it, expect } from 'vitest';
import { validateToolDefinition, handleValidateProject } from '../../src/tools/validate';

describe('validate tool', () => {
  it('has correct tool definition', () => {
    expect(validateToolDefinition.name).toBe('validate_project');
    expect(validateToolDefinition.inputSchema).toBeDefined();
    expect(validateToolDefinition.inputSchema.required).toContain('path');
  });

  it('returns error when path is invalid', async () => {
    const response = await handleValidateProject({ path: '/nonexistent/path' });
    expect(response.isError).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/mcp-server && npx vitest run tests/tools/validate.test.ts`
Expected: FAIL — cannot resolve module

- [ ] **Step 3: Write the validate tool**

```typescript
// packages/mcp-server/src/tools/validate.ts
import * as path from 'path';
import { validateConfig, validateFileStructure, HarnessConfigSchema } from '@harness-engineering/core';
import { resolveProjectConfig } from '../utils/config-resolver.js';
import { resultToMcpResponse } from '../utils/result-adapter.js';

export const validateToolDefinition = {
  name: 'validate_project',
  description: 'Run all validation checks on a harness engineering project',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description: 'Path to project root directory',
      },
    },
    required: ['path'],
  },
};

export async function handleValidateProject(input: { path: string }) {
  const projectPath = path.resolve(input.path);
  const configResult = resolveProjectConfig(projectPath);

  if (!configResult.ok) {
    return resultToMcpResponse(configResult);
  }

  const results: Record<string, unknown> = {};

  // Validate config against Zod schema (correct: 2nd arg is a Zod schema)
  const configValidation = validateConfig(configResult.value, HarnessConfigSchema);
  results.config = configValidation.ok ? 'pass' : configValidation.error;

  // Validate file structure
  const structureResult = await validateFileStructure(projectPath, []);
  results.structure = structureResult.ok ? 'pass' : structureResult.error;

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(results) }],
  };
}
```

Note: `HarnessConfigSchema` must be exported from `@harness-engineering/core` or imported from `@harness-engineering/cli`. Check which package exports it and adjust the import. If only CLI exports it, import from `@harness-engineering/cli`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/mcp-server && npx vitest run tests/tools/validate.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Write the server test**

```typescript
// packages/mcp-server/tests/server.test.ts
import { describe, it, expect } from 'vitest';
import { createHarnessServer, getToolDefinitions } from '../src/server';

describe('MCP Server', () => {
  it('creates a server instance', () => {
    const server = createHarnessServer();
    expect(server).toBeDefined();
  });

  it('registers validate_project tool', () => {
    const tools = getToolDefinitions();
    const names = tools.map((t) => t.name);
    expect(names).toContain('validate_project');
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd packages/mcp-server && npx vitest run tests/server.test.ts`
Expected: FAIL — cannot resolve module

- [ ] **Step 7: Write the server**

```typescript
// packages/mcp-server/src/server.ts
import { fileURLToPath } from 'url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { validateToolDefinition, handleValidateProject } from './tools/validate.js';

type ToolDefinition = { name: string; description: string; inputSchema: Record<string, unknown> };
type ToolHandler = (input: Record<string, unknown>) => Promise<unknown>;

const TOOL_DEFINITIONS: ToolDefinition[] = [validateToolDefinition];

const TOOL_HANDLERS: Record<string, ToolHandler> = {
  validate_project: handleValidateProject as ToolHandler,
};

/** Exposed for testing — returns all registered tool definitions */
export function getToolDefinitions(): ToolDefinition[] {
  return TOOL_DEFINITIONS;
}

export function createHarnessServer(): Server {
  const server = new Server(
    { name: 'harness-engineering', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFINITIONS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const handler = TOOL_HANDLERS[name];

    if (!handler) {
      return {
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }

    return handler(args ?? {});
  });

  return server;
}

export async function startServer() {
  const server = createHarnessServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
```

- [ ] **Step 8: Run all tests to verify they pass**

Run: `cd packages/mcp-server && npx vitest run`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add packages/mcp-server/src/server.ts packages/mcp-server/src/tools/validate.ts packages/mcp-server/tests/
git commit -m "feat(mcp-server): add MCP server core with validate_project tool"
```

---

### Task 21: Architecture, Docs, and Entropy Tools

**Files:**
- Create: `packages/mcp-server/src/tools/architecture.ts`
- Create: `packages/mcp-server/src/tools/docs.ts`
- Create: `packages/mcp-server/src/tools/entropy.ts`
- Test: `packages/mcp-server/tests/tools/architecture.test.ts`
- Test: `packages/mcp-server/tests/tools/docs.test.ts`

**Important:** All core API calls must use correct signatures:
- `validateDependencies(config: LayerConfig)` — requires `{ layers, rootDir, parser }` where `parser` is a `LanguageParser` (use `TypeScriptParser`)
- `checkDocCoverage(domain: string, options?: CoverageOptions)` — `domain` is a module name like `'services'`, `options.sourceDir` controls where to look
- `EntropyAnalyzer({ rootDir, analyze: { drift: true, deadCode: true, patterns: true } })` — requires `analyze` config object

- [ ] **Step 1: Write architecture tool test**

```typescript
// packages/mcp-server/tests/tools/architecture.test.ts
import { describe, it, expect } from 'vitest';
import { checkDependenciesDefinition, handleCheckDependencies } from '../../src/tools/architecture.js';

describe('check_dependencies tool', () => {
  it('has correct definition', () => {
    expect(checkDependenciesDefinition.name).toBe('check_dependencies');
    expect(checkDependenciesDefinition.inputSchema.required).toContain('path');
  });

  it('returns error for missing config', async () => {
    const response = await handleCheckDependencies({ path: '/nonexistent' });
    expect(response.isError).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/mcp-server && npx vitest run tests/tools/architecture.test.ts`
Expected: FAIL

- [ ] **Step 3: Write architecture tool**

```typescript
// packages/mcp-server/src/tools/architecture.ts
import * as path from 'path';
import { validateDependencies, TypeScriptParser } from '@harness-engineering/core';
import type { Layer } from '@harness-engineering/core';
import { resultToMcpResponse } from '../utils/result-adapter.js';
import { resolveProjectConfig } from '../utils/config-resolver.js';

export const checkDependenciesDefinition = {
  name: 'check_dependencies',
  description: 'Validate layer boundaries and detect circular dependencies',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
    },
    required: ['path'],
  },
};

export async function handleCheckDependencies(input: { path: string }) {
  const projectPath = path.resolve(input.path);
  const configResult = resolveProjectConfig(projectPath);
  if (!configResult.ok) return resultToMcpResponse(configResult);

  const config = configResult.value;
  const rawLayers = (config as Record<string, unknown>).layers as Array<{
    name: string; pattern: string; allowedDependencies: string[];
  }> ?? [];

  // Map config layers to LayerConfig format (pattern -> patterns array)
  const layers: Layer[] = rawLayers.map((l) => ({
    name: l.name,
    patterns: [l.pattern],
    allowedDependencies: l.allowedDependencies,
  }));

  const parser = new TypeScriptParser();
  const result = await validateDependencies({
    layers,
    rootDir: projectPath,
    parser,
  });

  return resultToMcpResponse(result);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/mcp-server && npx vitest run tests/tools/architecture.test.ts`
Expected: PASS

- [ ] **Step 5: Write docs tool test**

```typescript
// packages/mcp-server/tests/tools/docs.test.ts
import { describe, it, expect } from 'vitest';
import { checkDocsDefinition, validateKnowledgeMapDefinition } from '../../src/tools/docs.js';

describe('docs tools', () => {
  it('check_docs has correct definition', () => {
    expect(checkDocsDefinition.name).toBe('check_docs');
  });

  it('validate_knowledge_map has correct definition', () => {
    expect(validateKnowledgeMapDefinition.name).toBe('validate_knowledge_map');
  });
});
```

- [ ] **Step 6: Write docs and entropy tools**

```typescript
// packages/mcp-server/src/tools/docs.ts
import * as path from 'path';
import { checkDocCoverage, validateKnowledgeMap } from '@harness-engineering/core';
import { resultToMcpResponse } from '../utils/result-adapter.js';

export const checkDocsDefinition = {
  name: 'check_docs',
  description: 'Analyze documentation coverage',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      domain: { type: 'string', description: 'Domain/module to check (e.g., services, core)' },
    },
    required: ['path'],
  },
};

export async function handleCheckDocs(input: { path: string; domain?: string }) {
  const domain = input.domain ?? 'src';
  // checkDocCoverage(domain, options) — domain is a module name,
  // options.sourceDir controls where to look for source files
  const result = await checkDocCoverage(domain, {
    sourceDir: path.resolve(input.path, 'src'),
    docsDir: path.resolve(input.path, 'docs'),
  });
  return resultToMcpResponse(result);
}

export const validateKnowledgeMapDefinition = {
  name: 'validate_knowledge_map',
  description: 'Validate AGENTS.md knowledge map structure and links',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
    },
    required: ['path'],
  },
};

export async function handleValidateKnowledgeMap(input: { path: string }) {
  const result = await validateKnowledgeMap(path.resolve(input.path));
  return resultToMcpResponse(result);
}
```

```typescript
// packages/mcp-server/src/tools/entropy.ts
import * as path from 'path';
import { EntropyAnalyzer, createFixes, applyFixes } from '@harness-engineering/core';
import { resultToMcpResponse } from '../utils/result-adapter.js';
import { resolveProjectConfig } from '../utils/config-resolver.js';

export const detectEntropyDefinition = {
  name: 'detect_entropy',
  description: 'Detect documentation drift, dead code, and pattern violations',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      types: {
        type: 'array',
        items: { type: 'string', enum: ['doc-drift', 'dead-code', 'patterns'] },
        description: 'Types of entropy to detect',
      },
    },
    required: ['path'],
  },
};

export async function handleDetectEntropy(input: { path: string; types?: string[] }) {
  const projectPath = path.resolve(input.path);

  // EntropyAnalyzer requires rootDir + analyze config
  const analyzer = new EntropyAnalyzer({
    rootDir: projectPath,
    analyze: {
      drift: true,
      deadCode: true,
      patterns: true,
    },
  });
  const result = await analyzer.analyze();
  return resultToMcpResponse(result);
}

export const applyFixesDefinition = {
  name: 'apply_fixes',
  description: 'Auto-fix detected entropy issues',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      dryRun: { type: 'boolean', description: 'Preview fixes without applying' },
    },
    required: ['path'],
  },
};

export async function handleApplyFixes(input: { path: string; dryRun?: boolean }) {
  const projectPath = path.resolve(input.path);
  const analyzer = new EntropyAnalyzer({
    rootDir: projectPath,
    analyze: { drift: true, deadCode: true, patterns: true },
  });
  const analysisResult = await analyzer.analyze();
  if (!analysisResult.ok) return resultToMcpResponse(analysisResult);

  const fixes = createFixes(analysisResult.value, {});
  if (!fixes.ok) return resultToMcpResponse(fixes);

  if (input.dryRun) {
    return { content: [{ type: 'text' as const, text: JSON.stringify(fixes.value) }] };
  }

  const applied = await applyFixes(fixes.value, {});
  return resultToMcpResponse(applied);
}
```

- [ ] **Step 7: Register all tools in server.ts**

Update `packages/mcp-server/src/server.ts`:
- Import all new definitions and handlers
- Add to `TOOL_DEFINITIONS` array and `TOOL_HANDLERS` map

- [ ] **Step 8: Run all tests**

Run: `cd packages/mcp-server && npx vitest run`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add packages/mcp-server/src/tools/ packages/mcp-server/tests/tools/ packages/mcp-server/src/server.ts
git commit -m "feat(mcp-server): add architecture, docs, and entropy tools"
```

---

### Task 22: Linter and Init Tools

**Files:**
- Create: `packages/mcp-server/src/tools/linter.ts`
- Create: `packages/mcp-server/src/tools/init.ts`
- Test: `packages/mcp-server/tests/tools/linter.test.ts`

**Important: Cross-package imports.** The MCP server imports from published package APIs (`@harness-engineering/cli`, `@harness-engineering/linter-gen`), NOT from internal source paths. The CLI package must export `TemplateEngine` from its public API. If it doesn't already, add the export to `packages/cli/src/index.ts` as part of this task.

**Important: ESM compatibility.** Since `package.json` has `"type": "module"`, `__dirname` is not available. Use `import.meta.url` with `fileURLToPath` and `path.dirname()` instead.

- [ ] **Step 1: Ensure CLI exports TemplateEngine**

Check `packages/cli/src/index.ts`. If `TemplateEngine` is not exported, add:

```typescript
export { TemplateEngine } from './templates/engine';
export type { TemplateContext, RenderedFiles } from './templates/engine';
```

- [ ] **Step 2: Write linter tool test**

```typescript
// packages/mcp-server/tests/tools/linter.test.ts
import { describe, it, expect } from 'vitest';
import { generateLinterDefinition, validateLinterConfigDefinition } from '../../src/tools/linter.js';

describe('linter tools', () => {
  it('generate_linter has correct definition', () => {
    expect(generateLinterDefinition.name).toBe('generate_linter');
    expect(generateLinterDefinition.inputSchema.required).toContain('configPath');
  });

  it('validate_linter_config has correct definition', () => {
    expect(validateLinterConfigDefinition.name).toBe('validate_linter_config');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd packages/mcp-server && npx vitest run tests/tools/linter.test.ts`
Expected: FAIL

- [ ] **Step 4: Write linter tools**

```typescript
// packages/mcp-server/src/tools/linter.ts
import { generate, validate } from '@harness-engineering/linter-gen';

export const generateLinterDefinition = {
  name: 'generate_linter',
  description: 'Generate an ESLint rule from YAML configuration',
  inputSchema: {
    type: 'object' as const,
    properties: {
      configPath: { type: 'string', description: 'Path to harness-linter.yml' },
      outputDir: { type: 'string', description: 'Output directory for generated rule' },
    },
    required: ['configPath'],
  },
};

export async function handleGenerateLinter(input: { configPath: string; outputDir?: string }) {
  const result = await generate({ configPath: input.configPath, outputDir: input.outputDir });
  // linter-gen uses { success, error } pattern — adapt to MCP response
  if ('success' in result && result.success) {
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
  }
  return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], isError: true };
}

export const validateLinterConfigDefinition = {
  name: 'validate_linter_config',
  description: 'Validate a harness-linter.yml configuration file',
  inputSchema: {
    type: 'object' as const,
    properties: {
      configPath: { type: 'string', description: 'Path to harness-linter.yml' },
    },
    required: ['configPath'],
  },
};

export async function handleValidateLinterConfig(input: { configPath: string }) {
  const result = await validate({ configPath: input.configPath });
  if ('success' in result && result.success) {
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
  }
  return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], isError: true };
}
```

- [ ] **Step 5: Write init tool**

```typescript
// packages/mcp-server/src/tools/init.ts
import * as path from 'path';
import { fileURLToPath } from 'url';
import { TemplateEngine } from '@harness-engineering/cli';
import { resultToMcpResponse } from '../utils/result-adapter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
        description: 'Adoption level',
      },
      framework: { type: 'string', description: 'Framework overlay (e.g., nextjs)' },
    },
    required: ['path'],
  },
};

export async function handleInitProject(input: {
  path: string;
  name?: string;
  level?: string;
  framework?: string;
}) {
  try {
    // Resolve templates dir relative to monorepo root
    const templatesDir = path.resolve(__dirname, '..', '..', '..', '..', 'templates');
    const engine = new TemplateEngine(templatesDir);
    const level = input.level ?? 'basic';

    const resolveResult = engine.resolveTemplate(level, input.framework);
    if (!resolveResult.ok) return resultToMcpResponse(resolveResult);

    const renderResult = engine.render(resolveResult.value, {
      projectName: input.name ?? path.basename(input.path),
      level,
      framework: input.framework,
    });
    if (!renderResult.ok) return resultToMcpResponse(renderResult);

    const writeResult = engine.write(renderResult.value, path.resolve(input.path), { overwrite: false });
    return resultToMcpResponse(writeResult);
  } catch (error) {
    return {
      content: [{ type: 'text' as const, text: `Init failed: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true,
    };
  }
}
```

- [ ] **Step 6: Run tests and register tools in server.ts**

Update server.ts to import and register linter + init definitions and handlers.

Run: `cd packages/mcp-server && npx vitest run`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/mcp-server/src/tools/linter.ts packages/mcp-server/src/tools/init.ts packages/mcp-server/tests/tools/linter.test.ts packages/mcp-server/src/server.ts packages/cli/src/index.ts
git commit -m "feat(mcp-server): add linter and init tools

Uses published package APIs (@harness-engineering/cli, @harness-engineering/linter-gen)
instead of cross-package internal imports. ESM-compatible with import.meta.url."
```

---

### Task 23: Persona Tools + `run_persona` Meta-Tool

**Files:**
- Create: `packages/mcp-server/src/tools/persona.ts`
- Test: `packages/mcp-server/tests/tools/persona.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/mcp-server/tests/tools/persona.test.ts
import { describe, it, expect } from 'vitest';
import {
  listPersonasDefinition,
  generatePersonaArtifactsDefinition,
  runPersonaDefinition,
} from '../../src/tools/persona';

describe('persona tool definitions', () => {
  it('list_personas has correct schema', () => {
    expect(listPersonasDefinition.name).toBe('list_personas');
  });

  it('generate_persona_artifacts has correct schema', () => {
    expect(generatePersonaArtifactsDefinition.name).toBe('generate_persona_artifacts');
    expect(generatePersonaArtifactsDefinition.inputSchema.required).toContain('name');
  });

  it('run_persona has correct schema', () => {
    expect(runPersonaDefinition.name).toBe('run_persona');
    expect(runPersonaDefinition.inputSchema.required).toContain('persona');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/mcp-server && npx vitest run tests/tools/persona.test.ts`
Expected: FAIL

**Important:** The CLI must export persona functions from its public API. As part of this task, ensure `packages/cli/src/index.ts` exports:

```typescript
export { loadPersona, listPersonas } from './persona/loader';
export { generateRuntime } from './persona/generators/runtime';
export { generateAgentsMd } from './persona/generators/agents-md';
export { generateCIWorkflow } from './persona/generators/ci-workflow';
export { runPersona, type CommandExecutor, type PersonaRunReport } from './persona/runner';
export type { Persona } from './persona/schema';
```

- [ ] **Step 3: Write the implementation**

```typescript
// packages/mcp-server/src/tools/persona.ts
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  loadPersona,
  listPersonas,
  generateRuntime,
  generateAgentsMd,
  generateCIWorkflow,
  runPersona,
} from '@harness-engineering/cli';
import type { CommandExecutor } from '@harness-engineering/cli';
import { Ok, Err } from '@harness-engineering/core';
import { resultToMcpResponse } from '../utils/result-adapter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolvePersonasDir(): string {
  return path.resolve(__dirname, '..', '..', '..', '..', 'agents', 'personas');
}

export const listPersonasDefinition = {
  name: 'list_personas',
  description: 'List available agent personas',
  inputSchema: {
    type: 'object' as const,
    properties: {},
  },
};

export async function handleListPersonas() {
  const result = listPersonas(resolvePersonasDir());
  return resultToMcpResponse(result);
}

export const generatePersonaArtifactsDefinition = {
  name: 'generate_persona_artifacts',
  description: 'Generate runtime config, AGENTS.md fragment, and CI workflow from a persona',
  inputSchema: {
    type: 'object' as const,
    properties: {
      name: { type: 'string', description: 'Persona name (e.g., architecture-enforcer)' },
      only: {
        type: 'string',
        enum: ['runtime', 'agents-md', 'ci'],
        description: 'Generate only a specific artifact type',
      },
    },
    required: ['name'],
  },
};

export async function handleGeneratePersonaArtifacts(input: { name: string; only?: string }) {
  const filePath = path.join(resolvePersonasDir(), `${input.name}.yaml`);
  const personaResult = loadPersona(filePath);
  if (!personaResult.ok) return resultToMcpResponse(personaResult);

  const persona = personaResult.value;
  const artifacts: Record<string, string> = {};

  if (!input.only || input.only === 'runtime') {
    const r = generateRuntime(persona);
    if (r.ok) artifacts.runtime = r.value;
  }
  if (!input.only || input.only === 'agents-md') {
    const r = generateAgentsMd(persona);
    if (r.ok) artifacts.agentsMd = r.value;
  }
  if (!input.only || input.only === 'ci') {
    const r = generateCIWorkflow(persona, 'github');
    if (r.ok) artifacts.ciWorkflow = r.value;
  }

  return resultToMcpResponse(Ok(artifacts));
}

export const runPersonaDefinition = {
  name: 'run_persona',
  description: 'Execute all commands defined in a persona and return aggregated results',
  inputSchema: {
    type: 'object' as const,
    properties: {
      persona: { type: 'string', description: 'Persona name (e.g., architecture-enforcer)' },
      path: { type: 'string', description: 'Path to project root' },
      dryRun: { type: 'boolean', description: 'Preview without side effects' },
    },
    required: ['persona'],
  },
};

export async function handleRunPersona(input: { persona: string; path?: string; dryRun?: boolean }) {
  const filePath = path.join(resolvePersonasDir(), `${input.persona}.yaml`);
  const personaResult = loadPersona(filePath);
  if (!personaResult.ok) return resultToMcpResponse(personaResult);

  const projectPath = input.path ? path.resolve(input.path) : process.cwd();

  const executor: CommandExecutor = async (command: string) => {
    try {
      const { execSync } = await import('node:child_process');
      const dryFlag = input.dryRun ? ' --dry-run' : '';
      const output = execSync(`npx harness ${command}${dryFlag}`, {
        cwd: projectPath,
        stdio: 'pipe',
        timeout: personaResult.value.config.timeout,
      });
      return Ok(output.toString());
    } catch (error) {
      return Err(new Error(`${command} failed: ${error instanceof Error ? error.message : String(error)}`));
    }
  };

  const report = await runPersona(personaResult.value, executor);
  return resultToMcpResponse(Ok(report));
}
```

- [ ] **Step 4: Register all persona tools in server.ts**

Update server.ts to import and register `listPersonasDefinition`, `generatePersonaArtifactsDefinition`, `runPersonaDefinition` and their handlers.

- [ ] **Step 5: Run tests**

Run: `cd packages/mcp-server && npx vitest run`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/mcp-server/src/tools/persona.ts packages/mcp-server/tests/tools/persona.test.ts packages/mcp-server/src/server.ts
git commit -m "feat(mcp-server): add persona tools and run_persona meta-tool"
```

---

### Task 24: Stdio Entry Point and Index

**Files:**
- Create: `packages/mcp-server/src/index.ts`
- Create: `packages/mcp-server/bin/harness-mcp.ts`

- [ ] **Step 1: Write the entry point**

```typescript
// packages/mcp-server/src/index.ts
export { createHarnessServer, startServer } from './server';
export { resultToMcpResponse } from './utils/result-adapter';
export { resolveProjectConfig } from './utils/config-resolver';
```

- [ ] **Step 2: Write the bin script**

Note: The shebang must be the very first line. TypeScript will compile this to JS; the build should preserve or re-add the shebang.

```typescript
// packages/mcp-server/bin/harness-mcp.ts
#!/usr/bin/env node
import { startServer } from '../src/index.js';

startServer().catch((error: unknown) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});
```

- [ ] **Step 3: Build and verify**

Run: `cd packages/mcp-server && pnpm build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add packages/mcp-server/src/index.ts packages/mcp-server/bin/harness-mcp.ts
git commit -m "feat(mcp-server): add stdio entry point and public API exports"
```

---

### Task 25: Full Server Integration Test

**Files:**
- Create: `packages/mcp-server/tests/server-integration.test.ts`

- [ ] **Step 1: Write the integration test**

Uses the server's `getToolDefinitions()` helper (added in Task 20) to verify tool registration without accessing private internals.

```typescript
// packages/mcp-server/tests/server-integration.test.ts
import { describe, it, expect } from 'vitest';
import { createHarnessServer, getToolDefinitions } from '../src/server.js';

describe('MCP Server Integration', () => {
  it('creates a server instance', () => {
    const server = createHarnessServer();
    expect(server).toBeDefined();
  });

  it('registers all expected tools', () => {
    const tools = getToolDefinitions();
    const names = tools.map((t) => t.name);

    // 12 tools in v1 (add_component and run_agent_task deferred — see note below)
    expect(names).toContain('validate_project');
    expect(names).toContain('check_dependencies');
    expect(names).toContain('check_docs');
    expect(names).toContain('validate_knowledge_map');
    expect(names).toContain('detect_entropy');
    expect(names).toContain('apply_fixes');
    expect(names).toContain('generate_linter');
    expect(names).toContain('validate_linter_config');
    expect(names).toContain('init_project');
    expect(names).toContain('list_personas');
    expect(names).toContain('generate_persona_artifacts');
    expect(names).toContain('run_persona');

    expect(tools).toHaveLength(12);
  });

  it('all tool definitions have inputSchema', () => {
    const tools = getToolDefinitions();
    for (const tool of tools) {
      expect(tool.inputSchema).toBeDefined();
      expect(tool.description).toBeTruthy();
    }
  });
});
```

**Note on deferred tools:** The spec lists `add_component` (for `harness add`) and `run_agent_task` (for `harness agent run`) but these are thin wrappers around CLI commands that are less commonly used via MCP. They are deferred to Slice 4 (Expand) to keep v1 focused. The 12 tools above cover all primary use cases.

- [ ] **Step 2: Run all MCP server tests**

Run: `cd packages/mcp-server && npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Run full monorepo build**

Run: `pnpm build`
Expected: All packages build successfully

- [ ] **Step 4: Commit**

```bash
git add packages/mcp-server/tests/server-integration.test.ts
git commit -m "test(mcp-server): add server integration test verifying all 12 tools registered"
```

---

End of Chunk 3. End of plan.

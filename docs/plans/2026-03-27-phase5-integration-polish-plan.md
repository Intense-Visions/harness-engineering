# Plan: Multi-Language Templates -- Phase 5: Integration and Polish

**Date:** 2026-03-27
**Spec:** docs/changes/multi-language-templates/proposal.md
**Estimated tasks:** 9
**Estimated time:** 35 minutes

## Goal

Wire `detectFramework()` into the CLI auto-detection flow, persist tooling metadata in `harness.config.json` for all templates including JS/TS overlays, implement AGENTS.md append logic for existing projects, update the `/harness:initialize-project` skill documentation, and add end-to-end integration tests covering all 10 frameworks and 5 bare language scaffolds.

## Observable Truths (Acceptance Criteria)

1. When `runInit()` is called WITHOUT `--framework` or `--language` on a directory containing FastAPI files, the result includes the detected framework metadata (framework: "fastapi", language: "python") in the returned result, enabling callers to present confirmation to the user.
2. When `runInit()` is called with `--framework react-vite`, the written `harness.config.json` contains a `tooling` section with `{ packageManager: "npm", linter: "eslint", formatter: "prettier", buildTool: "vite", testRunner: "vitest" }` and `template.framework` is `"react-vite"`.
3. When `runInit()` is called with `--framework fastapi` on a directory with an existing `AGENTS.md`, the existing AGENTS.md content is preserved and a `## FastAPI Conventions` section is appended. If run again, the section is NOT duplicated.
4. The file `agents/skills/claude-code/initialize-harness-project/SKILL.md` mentions auto-detection, the `--language` flag, and all 10 supported frameworks.
5. `cd packages/cli && npx vitest run tests/integration/init.test.ts` passes with tests covering all 10 frameworks and 5 bare language scaffolds -- verifying config written, AGENTS.md present, correct files on disk.
6. `cd packages/cli && npx vitest run tests/templates/` passes with zero regressions (129+ tests).
7. The system shall not produce a `harness.config.json` with `template.level: null` for non-JS languages -- the `level` field should be omitted entirely.

## File Map

- MODIFY `packages/cli/src/commands/init.ts` (add auto-detect, tooling persistence, AGENTS.md append, framework in config)
- MODIFY `packages/cli/src/mcp/tools/init.ts` (add auto-detect support, tooling persistence)
- CREATE `packages/cli/src/templates/agents-append.ts` (AGENTS.md append helper with section markers)
- CREATE `packages/cli/tests/templates/agents-append.test.ts` (unit tests for append logic)
- MODIFY `packages/cli/tests/commands/init.test.ts` (add auto-detect and tooling persistence tests)
- MODIFY `packages/cli/tests/integration/init.test.ts` (add e2e tests for all 10 frameworks + 5 bare languages)
- MODIFY `agents/skills/claude-code/initialize-harness-project/SKILL.md` (update docs)
- MODIFY `templates/basic/harness.config.json.hbs` (add tooling placeholder for framework overlays)
- MODIFY `templates/intermediate/harness.config.json.hbs` (add tooling placeholder for framework overlays)
- MODIFY `templates/advanced/harness.config.json.hbs` (add tooling placeholder for framework overlays)

## Tasks

### Task 1: Create AGENTS.md append helper with section markers (TDD)

**Depends on:** none
**Files:** `packages/cli/src/templates/agents-append.ts`, `packages/cli/tests/templates/agents-append.test.ts`

1. Create test file `packages/cli/tests/templates/agents-append.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import {
     appendFrameworkSection,
     buildFrameworkSection,
   } from '../../src/templates/agents-append';

   describe('appendFrameworkSection', () => {
     it('appends framework section to existing AGENTS.md content', () => {
       const existing = '# My Project\n\nSome content.\n';
       const result = appendFrameworkSection(existing, 'fastapi', 'python');
       expect(result).toContain('# My Project');
       expect(result).toContain('<!-- harness:framework-conventions:fastapi -->');
       expect(result).toContain('## FastAPI Conventions');
       expect(result).toContain('<!-- /harness:framework-conventions:fastapi -->');
     });

     it('does not duplicate section if marker already exists', () => {
       const existing =
         '# My Project\n\n<!-- harness:framework-conventions:fastapi -->\n## FastAPI Conventions\nstuff\n<!-- /harness:framework-conventions:fastapi -->\n';
       const result = appendFrameworkSection(existing, 'fastapi', 'python');
       expect(result).toBe(existing);
     });

     it('appends different framework section even if another exists', () => {
       const existing =
         '# My Project\n\n<!-- harness:framework-conventions:fastapi -->\n## FastAPI Conventions\nstuff\n<!-- /harness:framework-conventions:fastapi -->\n';
       const result = appendFrameworkSection(existing, 'django', 'python');
       expect(result).toContain('<!-- harness:framework-conventions:django -->');
       expect(result).toContain('## Django Conventions');
     });

     it('returns original content when no framework specified', () => {
       const existing = '# My Project\n';
       const result = appendFrameworkSection(existing, undefined, 'python');
       expect(result).toBe(existing);
     });
   });

   describe('buildFrameworkSection', () => {
     it('builds section for each supported framework', () => {
       const frameworks = [
         'nextjs',
         'react-vite',
         'vue',
         'express',
         'nestjs',
         'fastapi',
         'django',
         'gin',
         'axum',
         'spring-boot',
       ];
       for (const fw of frameworks) {
         const section = buildFrameworkSection(fw);
         expect(section.length).toBeGreaterThan(50);
         expect(section).toContain(fw);
       }
     });

     it('returns empty string for unknown framework', () => {
       const section = buildFrameworkSection('unknown-fw');
       expect(section).toBe('');
     });
   });
   ```

2. Run test: `cd packages/cli && npx vitest run tests/templates/agents-append.test.ts`
3. Observe failure: module not found.
4. Create implementation `packages/cli/src/templates/agents-append.ts`:

   ```typescript
   const FRAMEWORK_SECTIONS: Record<string, { title: string; content: string }> = {
     nextjs: {
       title: 'Next.js Conventions',
       content: [
         '- Use the App Router (`src/app/`) for all routes',
         '- Server Components by default; add `"use client"` only when needed',
         '- Use `next/image` for images and `next/link` for navigation',
         '- API routes go in `src/app/api/`',
         '- Run `next dev` for development, `next build` for production',
       ].join('\n'),
     },
     'react-vite': {
       title: 'React + Vite Conventions',
       content: [
         '- Component files use `.tsx` extension in `src/`',
         '- Use Vite for dev server and bundling (`npm run dev`)',
         '- Prefer function components with hooks',
         '- CSS modules or styled-components for styling',
         '- Tests use Vitest (`npm test`)',
       ].join('\n'),
     },
     vue: {
       title: 'Vue Conventions',
       content: [
         '- Single File Components (`.vue`) in `src/`',
         '- Use `<script setup>` with Composition API',
         '- Vite for dev server and bundling (`npm run dev`)',
         '- Vue Router for routing, Pinia for state management',
         '- Tests use Vitest (`npm test`)',
       ].join('\n'),
     },
     express: {
       title: 'Express Conventions',
       content: [
         '- Entry point at `src/app.ts`',
         '- Routes in `src/routes/`, middleware in `src/middleware/`',
         '- Use `express.json()` for body parsing',
         '- Error handling via centralized error middleware',
         '- Tests use Vitest with supertest (`npm test`)',
       ].join('\n'),
     },
     nestjs: {
       title: 'NestJS Conventions',
       content: [
         '- Module-based architecture: each feature in its own module',
         '- Use decorators (`@Controller`, `@Injectable`, `@Module`)',
         '- Entry point at `src/main.ts`, root module at `src/app.module.ts`',
         '- Use Nest CLI for generating components (`nest g`)',
         '- Tests use Vitest (`npm test`)',
       ].join('\n'),
     },
     fastapi: {
       title: 'FastAPI Conventions',
       content: [
         '- Entry point at `src/main.py` with FastAPI app instance',
         '- Use Pydantic models for request/response validation',
         '- Async endpoints preferred; sync is acceptable for CPU-bound work',
         '- Run with `uvicorn src.main:app --reload` for development',
         '- Tests use pytest (`pytest`)',
       ].join('\n'),
     },
     django: {
       title: 'Django Conventions',
       content: [
         '- Settings at `src/settings.py`, URLs at `src/urls.py`',
         '- Use `manage.py` for management commands',
         '- Apps in `src/` directory; each app has models, views, urls',
         '- Run with `python manage.py runserver` for development',
         '- Tests use pytest with pytest-django (`pytest`)',
       ].join('\n'),
     },
     gin: {
       title: 'Gin Conventions',
       content: [
         '- Entry point at `main.go` with Gin router setup',
         '- Group routes by feature using `router.Group()`',
         '- Use middleware for logging, auth, error recovery',
         '- Run with `go run main.go` for development',
         '- Tests use `go test ./...`',
       ].join('\n'),
     },
     axum: {
       title: 'Axum Conventions',
       content: [
         '- Entry point at `src/main.rs` with Axum router',
         '- Use extractors for request parsing (`Path`, `Query`, `Json`)',
         '- Shared state via `Extension` or `State`',
         '- Run with `cargo run` for development',
         '- Tests use `cargo test`',
       ].join('\n'),
     },
     'spring-boot': {
       title: 'Spring Boot Conventions',
       content: [
         '- Entry point annotated with `@SpringBootApplication`',
         '- Controllers in `controller/` package, services in `service/`',
         '- Use constructor injection for dependencies',
         '- Run with `mvn spring-boot:run` for development',
         '- Tests use JUnit 5 with Spring Boot Test (`mvn test`)',
       ].join('\n'),
     },
   };

   export function buildFrameworkSection(framework: string): string {
     const entry = FRAMEWORK_SECTIONS[framework];
     if (!entry) return '';
     return `## ${entry.title}\n\n${entry.content}\n`;
   }

   export function appendFrameworkSection(
     existingContent: string,
     framework: string | undefined,
     _language: string | undefined
   ): string {
     if (!framework) return existingContent;

     const startMarker = `<!-- harness:framework-conventions:${framework} -->`;
     const endMarker = `<!-- /harness:framework-conventions:${framework} -->`;

     // Guard: do not duplicate
     if (existingContent.includes(startMarker)) return existingContent;

     const section = buildFrameworkSection(framework);
     if (!section) return existingContent;

     const block = `\n${startMarker}\n${section}${endMarker}\n`;
     return existingContent.trimEnd() + '\n' + block;
   }
   ```

5. Run test: `cd packages/cli && npx vitest run tests/templates/agents-append.test.ts`
6. Observe: all tests pass.
7. Commit: `feat(templates): add AGENTS.md framework section append helper`

---

### Task 2: Wire auto-detection into `runInit()` and return detection results

**Depends on:** none
**Files:** `packages/cli/src/commands/init.ts`, `packages/cli/tests/commands/init.test.ts`

1. Add tests to `packages/cli/tests/commands/init.test.ts`:

   ```typescript
   it('returns detected framework when no --framework or --language specified on existing project', async () => {
     const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-detect-'));
     fs.writeFileSync(path.join(tmpDir, 'requirements.txt'), 'fastapi==0.100.0\nuvicorn\n');
     fs.writeFileSync(
       path.join(tmpDir, 'pyproject.toml'),
       '[project]\ndependencies = ["fastapi"]\n'
     );

     const result = await runInit({ cwd: tmpDir, name: 'detect-test' });
     expect(result.ok).toBe(true);
     if (!result.ok) return;
     expect(result.value.detectedFrameworks).toBeDefined();
     expect(result.value.detectedFrameworks!.length).toBeGreaterThan(0);
     expect(result.value.detectedFrameworks![0].framework).toBe('fastapi');

     fs.rmSync(tmpDir, { recursive: true });
   });

   it('does not run detection when --framework is specified', async () => {
     const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-init-'));
     const result = await runInit({ cwd: tmpDir, name: 'test', language: 'python' });
     expect(result.ok).toBe(true);
     if (!result.ok) return;
     expect(result.value.detectedFrameworks).toBeUndefined();
     fs.rmSync(tmpDir, { recursive: true });
   });
   ```

2. Run tests: `cd packages/cli && npx vitest run tests/commands/init.test.ts` -- observe failure (detectedFrameworks not in result).

3. Modify `packages/cli/src/commands/init.ts`:
   - Import `DetectedFramework` from `../templates/engine`
   - Add `detectedFrameworks?: DetectedFramework[]` to `InitResult` interface
   - Before resolveTemplate, if neither `options.framework` nor `options.language` is specified, call `engine.detectFramework(cwd)`. If results found, attach to result and return early (scaffolding deferred until caller confirms). If no results and no flags, fall through to default JS/TS basic behavior.
   - Exact changes to `runInit()` after the template list loading block (line ~46):

   ```typescript
   // Auto-detect framework if no --framework and no --language specified
   if (!options.framework && !options.language) {
     const detectResult = engine.detectFramework(cwd);
     if (detectResult.ok && detectResult.value.length > 0) {
       // Return detection results for caller to confirm
       // Do NOT scaffold yet -- caller should re-invoke with explicit --framework
       return Ok({
         filesCreated: [],
         skippedConfigs: [],
         detectedFrameworks: detectResult.value,
       });
     }
   }
   ```

4. Run tests: `cd packages/cli && npx vitest run tests/commands/init.test.ts` -- observe all pass.
5. Commit: `feat(init): wire detectFramework() into runInit auto-detection flow`

---

### Task 3: Persist tooling metadata and framework in harness.config.json for JS/TS overlays

**Depends on:** none
**Files:** `packages/cli/src/commands/init.ts`, `packages/cli/tests/commands/init.test.ts`

1. Add test to `packages/cli/tests/commands/init.test.ts`:

   ```typescript
   it('persists tooling metadata in harness.config.json for JS/TS framework overlay', async () => {
     const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-init-'));
     const result = await runInit({
       cwd: tmpDir,
       name: 'test',
       level: 'basic',
       framework: 'react-vite',
     });
     expect(result.ok).toBe(true);
     if (!result.ok) return;

     const config = JSON.parse(fs.readFileSync(path.join(tmpDir, 'harness.config.json'), 'utf-8'));
     expect(config.template.framework).toBe('react-vite');
     expect(config.tooling).toBeDefined();
     expect(config.tooling.linter).toBe('eslint');
     expect(config.tooling.buildTool).toBe('vite');
     expect(config.tooling.testRunner).toBe('vitest');

     fs.rmSync(tmpDir, { recursive: true });
   });

   it('persists tooling for non-JS framework in harness.config.json', async () => {
     const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-init-'));
     const result = await runInit({
       cwd: tmpDir,
       name: 'test',
       framework: 'fastapi',
       language: 'python',
     });
     expect(result.ok).toBe(true);
     if (!result.ok) return;

     const config = JSON.parse(fs.readFileSync(path.join(tmpDir, 'harness.config.json'), 'utf-8'));
     expect(config.template.framework).toBe('fastapi');
     expect(config.template.language).toBe('python');
     expect(config.tooling.linter).toBe('ruff');

     fs.rmSync(tmpDir, { recursive: true });
   });

   it('does not include level:null in config for non-JS languages', async () => {
     const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-init-'));
     const result = await runInit({ cwd: tmpDir, name: 'test', language: 'go' });
     expect(result.ok).toBe(true);
     const config = JSON.parse(fs.readFileSync(path.join(tmpDir, 'harness.config.json'), 'utf-8'));
     expect(config.template.level).toBeUndefined();
     fs.rmSync(tmpDir, { recursive: true });
   });
   ```

2. Run tests -- observe failures (no tooling in config for react-vite, no framework in config).

3. Modify `packages/cli/src/commands/init.ts` -- after `engine.write()` succeeds, add a post-write step that patches `harness.config.json` with tooling from the overlay metadata:

   ```typescript
   // Post-write: persist tooling and framework metadata into harness.config.json
   const writtenConfigPath = path.join(cwd, 'harness.config.json');
   if (fs.existsSync(writtenConfigPath)) {
     const config = JSON.parse(fs.readFileSync(writtenConfigPath, 'utf-8'));
     const overlayMeta = resolveResult.value.overlayMetadata;

     // Add framework to template section
     if (options.framework) {
       config.template = config.template || {};
       config.template.framework = options.framework;
     }

     // Add tooling from overlay metadata (framework takes precedence over base)
     if (overlayMeta?.tooling) {
       config.tooling = { ...config.tooling, ...overlayMeta.tooling };
       // Remove lockFile from config (internal to template system)
       delete config.tooling.lockFile;
     } else if (resolveResult.value.metadata.tooling && !config.tooling) {
       config.tooling = { ...resolveResult.value.metadata.tooling };
       delete config.tooling.lockFile;
     }

     // Remove level:null for non-JS languages
     if (config.template?.level === null || config.template?.level === undefined) {
       delete config.template.level;
     }

     fs.writeFileSync(writtenConfigPath, JSON.stringify(config, null, 2) + '\n');
   }
   ```

4. Run tests: `cd packages/cli && npx vitest run tests/commands/init.test.ts` -- all pass.
5. Run: `cd packages/cli && npx vitest run tests/templates/` -- verify no regressions (129+ tests pass).
6. Commit: `feat(init): persist tooling and framework metadata in harness.config.json`

---

### Task 4: Implement AGENTS.md append in init flow for existing projects

**Depends on:** Task 1
**Files:** `packages/cli/src/commands/init.ts`, `packages/cli/tests/commands/init.test.ts`

1. Add tests to `packages/cli/tests/commands/init.test.ts`:

   ```typescript
   it('appends framework section to existing AGENTS.md', async () => {
     const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-init-'));
     fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), '# Existing Project\n\nSome content.\n');

     const result = await runInit({
       cwd: tmpDir,
       name: 'test',
       level: 'basic',
       framework: 'express',
       force: true,
     });
     expect(result.ok).toBe(true);

     const agents = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf-8');
     expect(agents).toContain('## Express Conventions');
     expect(agents).toContain('<!-- harness:framework-conventions:express -->');

     fs.rmSync(tmpDir, { recursive: true });
   });

   it('does not duplicate framework section on re-init', async () => {
     const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-init-'));
     const existingContent =
       '# Project\n\n<!-- harness:framework-conventions:express -->\n## Express Conventions\nstuff\n<!-- /harness:framework-conventions:express -->\n';
     fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), existingContent);

     const result = await runInit({
       cwd: tmpDir,
       name: 'test',
       level: 'basic',
       framework: 'express',
       force: true,
     });
     expect(result.ok).toBe(true);

     const agents = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf-8');
     const markerCount = (agents.match(/<!-- harness:framework-conventions:express -->/g) || [])
       .length;
     expect(markerCount).toBe(1);

     fs.rmSync(tmpDir, { recursive: true });
   });
   ```

2. Run tests -- observe failures.

3. Modify `packages/cli/src/commands/init.ts`:
   - Import `appendFrameworkSection` from `../templates/agents-append`
   - After the `engine.write()` call and the tooling patch, add AGENTS.md append logic:

   ```typescript
   // Post-write: append framework conventions to AGENTS.md if it already existed
   const agentsPath = path.join(cwd, 'AGENTS.md');
   if (options.framework && fs.existsSync(agentsPath)) {
     const existingAgents = fs.readFileSync(agentsPath, 'utf-8');
     const updatedAgents = appendFrameworkSection(existingAgents, options.framework, language);
     if (updatedAgents !== existingAgents) {
       fs.writeFileSync(agentsPath, updatedAgents);
     }
   }
   ```

4. Run tests: `cd packages/cli && npx vitest run tests/commands/init.test.ts` -- all pass.
5. Commit: `feat(init): append framework conventions to existing AGENTS.md`

---

### Task 5: Wire auto-detection and tooling persistence into MCP init tool

**Depends on:** Task 3
**Files:** `packages/cli/src/mcp/tools/init.ts`, `packages/cli/tests/mcp/tools/init.test.ts`

1. Read existing MCP init test file to understand test patterns.

2. Add test to `packages/cli/tests/mcp/tools/init.test.ts`:

   ```typescript
   it('persists tooling in harness.config.json for framework init', async () => {
     const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-mcp-init-'));
     const result = await handleInitProject({
       path: tmpDir,
       name: 'test',
       level: 'basic',
       framework: 'react-vite',
     });
     expect(result.isError).toBe(false);

     const config = JSON.parse(fs.readFileSync(path.join(tmpDir, 'harness.config.json'), 'utf-8'));
     expect(config.tooling).toBeDefined();
     expect(config.tooling.buildTool).toBe('vite');
     expect(config.template.framework).toBe('react-vite');

     fs.rmSync(tmpDir, { recursive: true });
   });
   ```

3. Run test -- observe failure (MCP init does not patch config).

4. Modify `packages/cli/src/mcp/tools/init.ts` to add post-write tooling and framework persistence, mirroring the logic from Task 3:
   - After `engine.write()`, read the written `harness.config.json`, patch in `tooling` from `resolveResult.value.overlayMetadata?.tooling` or `resolveResult.value.metadata.tooling`, patch `template.framework`, remove `level:null`, and write back.

5. Run test -- observe pass.
6. Commit: `feat(mcp): persist tooling metadata in MCP init_project tool`

---

### Task 6: Update `/harness:initialize-project` skill documentation

**Depends on:** none
**Files:** `agents/skills/claude-code/initialize-harness-project/SKILL.md`

1. Modify `agents/skills/claude-code/initialize-harness-project/SKILL.md` to add the following changes:

   In **Phase 1: ASSESS**, after step 2, add:

   ```markdown
   2b. **For existing projects with detectable frameworks:** Run `harness init` without flags first. The command auto-detects frameworks (FastAPI, Django, Gin, Axum, Spring Boot, Next.js, React+Vite, Vue, Express, NestJS) by scanning project files. Present the detection result to the human and ask for confirmation before proceeding. If detection fails, ask the human to specify `--framework` manually.
   ```

   In **Phase 2: SCAFFOLD**, update step 1 to include all framework and language options:

   ```markdown
   1. **Run `harness init` with the appropriate flags:**
      - New basic JS/TS project: `harness init --level basic`
      - With framework: `harness init --level basic --framework <framework>`
      - Non-JS language: `harness init --language <python|go|rust|java>`
      - Non-JS with framework: `harness init --framework <fastapi|django|gin|axum|spring-boot>`
      - Existing project (auto-detect): `harness init` (no flags -- auto-detection runs)

      **Supported frameworks:** nextjs, react-vite, vue, express, nestjs, fastapi, django, gin, axum, spring-boot
      **Supported languages:** typescript, python, go, rust, java
   ```

   In **Harness Integration**, update the first bullet:

   ```markdown
   - **`harness init --level <level> [--framework <framework>] [--language <language>]`** — Scaffold a new project. `--framework` infers language automatically. `--language` without `--framework` gives a bare language scaffold. Running without flags on an existing project directory triggers auto-detection.
   ```

2. Verify the file reads correctly and no existing content is broken.
3. Commit: `docs(skill): update initialize-project skill with multi-language and auto-detect info`

---

### Task 7: End-to-end integration tests for all 10 frameworks

**Depends on:** Tasks 3, 4
**Files:** `packages/cli/tests/integration/init.test.ts`

1. Add comprehensive e2e tests to `packages/cli/tests/integration/init.test.ts`:

   ```typescript
   describe('multi-language framework init (e2e)', () => {
     const jsFrameworks = [
       { framework: 'nextjs', level: 'basic', expectFile: 'next.config.mjs' },
       { framework: 'react-vite', level: 'basic', expectFile: 'vite.config.ts' },
       { framework: 'vue', level: 'basic', expectFile: 'vite.config.ts' },
       { framework: 'express', level: 'basic', expectFile: 'src/app.ts' },
       { framework: 'nestjs', level: 'basic', expectFile: 'nest-cli.json' },
     ];

     for (const { framework, level, expectFile } of jsFrameworks) {
       it(`scaffolds ${framework} with config, AGENTS.md, and framework files`, async () => {
         const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `harness-e2e-${framework}-`));
         const result = await runInit({ cwd: tmpDir, name: `test-${framework}`, level, framework });
         expect(result.ok).toBe(true);
         if (!result.ok) return;

         // Core files exist
         expect(fs.existsSync(path.join(tmpDir, 'harness.config.json'))).toBe(true);
         expect(fs.existsSync(path.join(tmpDir, 'AGENTS.md'))).toBe(true);
         expect(fs.existsSync(path.join(tmpDir, expectFile))).toBe(true);

         // Config has framework and tooling
         const config = JSON.parse(
           fs.readFileSync(path.join(tmpDir, 'harness.config.json'), 'utf-8')
         );
         expect(config.template.framework).toBe(framework);
         expect(config.tooling).toBeDefined();
         expect(config.tooling.linter).toBeDefined();

         fs.rmSync(tmpDir, { recursive: true });
       });
     }

     const nonJsFrameworks = [
       {
         framework: 'fastapi',
         language: 'python',
         expectFile: 'src/main.py',
         expectConfig: 'pyproject.toml',
       },
       {
         framework: 'django',
         language: 'python',
         expectFile: 'manage.py',
         expectConfig: 'pyproject.toml',
       },
       { framework: 'gin', language: 'go', expectFile: 'main.go', expectConfig: 'go.mod' },
       {
         framework: 'axum',
         language: 'rust',
         expectFile: 'src/main.rs',
         expectConfig: 'Cargo.toml',
       },
       {
         framework: 'spring-boot',
         language: 'java',
         expectFile: 'src/main/java/App.java',
         expectConfig: 'pom.xml',
       },
     ];

     for (const { framework, language, expectFile, expectConfig } of nonJsFrameworks) {
       it(`scaffolds ${framework} (${language}) with config, AGENTS.md, and framework files`, async () => {
         const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `harness-e2e-${framework}-`));
         const result = await runInit({
           cwd: tmpDir,
           name: `test-${framework}`,
           framework,
           language,
         });
         expect(result.ok).toBe(true);
         if (!result.ok) return;

         expect(fs.existsSync(path.join(tmpDir, 'harness.config.json'))).toBe(true);
         expect(fs.existsSync(path.join(tmpDir, 'AGENTS.md'))).toBe(true);
         expect(fs.existsSync(path.join(tmpDir, expectFile))).toBe(true);
         expect(fs.existsSync(path.join(tmpDir, expectConfig))).toBe(true);

         const config = JSON.parse(
           fs.readFileSync(path.join(tmpDir, 'harness.config.json'), 'utf-8')
         );
         expect(config.template.framework).toBe(framework);
         expect(config.template.language).toBe(language);
         expect(config.template.level).toBeUndefined();
         expect(config.tooling).toBeDefined();

         fs.rmSync(tmpDir, { recursive: true });
       });
     }
   });
   ```

2. Run tests: `cd packages/cli && npx vitest run tests/integration/init.test.ts`
3. Observe: all tests pass (relies on Tasks 3 and 4 being complete).
4. Commit: `test(init): add e2e integration tests for all 10 frameworks`

---

### Task 8: End-to-end integration tests for 5 bare language scaffolds

**Depends on:** Task 3
**Files:** `packages/cli/tests/integration/init.test.ts`

1. Add bare language scaffold tests to `packages/cli/tests/integration/init.test.ts`:

   ```typescript
   describe('bare language scaffold init (e2e)', () => {
     const languages = [
       { language: 'python', expectFile: 'pyproject.toml', expectLinter: 'ruff.toml' },
       { language: 'go', expectFile: 'go.mod', expectLinter: '.golangci.yml' },
       { language: 'rust', expectFile: 'Cargo.toml', expectLinter: 'clippy.toml' },
       { language: 'java', expectFile: 'pom.xml', expectLinter: 'checkstyle.xml' },
       { language: 'typescript', expectFile: 'package.json', expectLinter: undefined },
     ] as const;

     for (const { language, expectFile, expectLinter } of languages) {
       it(`scaffolds bare ${language} project with config and AGENTS.md`, async () => {
         const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `harness-e2e-${language}-`));
         const opts: any = { cwd: tmpDir, name: `test-${language}` };
         if (language === 'typescript') {
           opts.level = 'basic';
         } else {
           opts.language = language;
         }

         const result = await runInit(opts);
         expect(result.ok).toBe(true);
         if (!result.ok) return;

         expect(fs.existsSync(path.join(tmpDir, 'harness.config.json'))).toBe(true);
         expect(fs.existsSync(path.join(tmpDir, 'AGENTS.md'))).toBe(true);
         expect(fs.existsSync(path.join(tmpDir, expectFile))).toBe(true);
         if (expectLinter) {
           expect(fs.existsSync(path.join(tmpDir, expectLinter))).toBe(true);
         }

         const config = JSON.parse(
           fs.readFileSync(path.join(tmpDir, 'harness.config.json'), 'utf-8')
         );
         if (language !== 'typescript') {
           expect(config.template.language).toBe(language);
           expect(config.template.level).toBeUndefined();
           expect(config.tooling).toBeDefined();
         }

         fs.rmSync(tmpDir, { recursive: true });
       });
     }
   });

   describe('existing project overlay (e2e)', () => {
     it('does not clobber existing files when overlaying fastapi on existing Python project', async () => {
       const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-e2e-existing-'));
       fs.writeFileSync(path.join(tmpDir, 'pyproject.toml'), '[project]\nname = "my-existing"\n');
       fs.writeFileSync(
         path.join(tmpDir, 'AGENTS.md'),
         '# My Existing Project\n\nExisting content.\n'
       );

       const result = await runInit({
         cwd: tmpDir,
         name: 'my-existing',
         framework: 'fastapi',
         language: 'python',
         force: true,
       });
       expect(result.ok).toBe(true);
       if (!result.ok) return;

       // Existing pyproject.toml preserved (skipped)
       const pyproject = fs.readFileSync(path.join(tmpDir, 'pyproject.toml'), 'utf-8');
       expect(pyproject).toContain('my-existing');

       // AGENTS.md has framework section appended
       const agents = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf-8');
       expect(agents).toContain('My Existing Project');
       expect(agents).toContain('## FastAPI Conventions');

       // harness.config.json written
       expect(fs.existsSync(path.join(tmpDir, 'harness.config.json'))).toBe(true);

       fs.rmSync(tmpDir, { recursive: true });
     });
   });
   ```

2. Run tests: `cd packages/cli && npx vitest run tests/integration/init.test.ts`
3. Observe: all pass.
4. Commit: `test(init): add e2e tests for bare language scaffolds and existing project overlay`

---

### Task 9: Full regression run and cleanup

[checkpoint:human-verify]

**Depends on:** Tasks 1-8
**Files:** none (verification only)

1. Run the full template test suite: `cd packages/cli && npx vitest run tests/templates/`
   - Expect: 129+ tests pass, zero failures.

2. Run all init command tests: `cd packages/cli && npx vitest run tests/commands/init.test.ts`
   - Expect: all existing + new tests pass.

3. Run integration tests: `cd packages/cli && npx vitest run tests/integration/init.test.ts`
   - Expect: all existing + new tests pass.

4. Run MCP init tests: `cd packages/cli && npx vitest run tests/mcp/tools/init.test.ts`
   - Expect: all pass.

5. Verify observable truths manually:
   - Confirm `harness.config.json` output for `react-vite` has tooling section.
   - Confirm AGENTS.md append works with section markers.
   - Confirm auto-detection returns results for FastAPI project.
   - Confirm SKILL.md mentions all 10 frameworks.

6. Commit: `test(phase5): verify full integration and regression suite passes`

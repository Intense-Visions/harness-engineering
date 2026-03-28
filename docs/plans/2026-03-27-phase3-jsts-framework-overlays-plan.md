# Plan: Phase 3 -- JS/TS Framework Overlays

**Date:** 2026-03-27
**Spec:** docs/changes/multi-language-templates/proposal.md
**Estimated tasks:** 7
**Estimated time:** 25 minutes

## Goal

Create four JS/TS framework overlay templates (react-vite, vue, express, nestjs) that compose with the existing base -> level -> framework resolution chain and support auto-detection via `detect` patterns.

## Observable Truths (Acceptance Criteria)

1. When `engine.resolveTemplate('basic', 'react-vite')` is called, the system shall return a resolved template containing both base/basic files and react-vite overlay files (vite.config.ts, src/App.tsx, src/main.tsx, index.html, package.json).
2. When `engine.resolveTemplate('basic', 'vue')` is called, the system shall return a resolved template containing vue overlay files (vite.config.ts, src/App.vue, src/main.ts, index.html, package.json).
3. When `engine.resolveTemplate('basic', 'express')` is called, the system shall return a resolved template containing express overlay files (src/app.ts, package.json).
4. When `engine.resolveTemplate('basic', 'nestjs')` is called, the system shall return a resolved template containing nestjs overlay files (nest-cli.json, src/app.module.ts, src/main.ts, package.json).
5. The system shall compose each framework overlay correctly with all three levels (basic, intermediate, advanced) -- resolveTemplate succeeds and render produces valid output for each combination.
6. When `engine.detectFramework(dir)` is called on a directory containing `vite.config.ts` with `@vitejs/plugin-react`, the system shall return `react-vite` as a candidate.
7. When `engine.detectFramework(dir)` is called on a directory containing `package.json` with `vue`, the system shall return `vue` as a candidate.
8. When `engine.detectFramework(dir)` is called on a directory containing `package.json` with `express`, the system shall return `express` as a candidate.
9. When `engine.detectFramework(dir)` is called on a directory containing `package.json` with `@nestjs/core`, the system shall return `nestjs` as a candidate.
10. Each template's `template.json` shall pass Zod schema validation via `TemplateMetadataSchema.safeParse()`.
11. `npx vitest run packages/cli/tests/templates/engine.test.ts` shall pass with all new framework overlay tests.
12. `npx vitest run packages/cli/tests/templates/snapshot.test.ts` shall pass (snapshots updated for new overlays).

## File Map

```
CREATE templates/react-vite/template.json
CREATE templates/react-vite/package.json.hbs
CREATE templates/react-vite/vite.config.ts
CREATE templates/react-vite/index.html
CREATE templates/react-vite/src/App.tsx
CREATE templates/react-vite/src/main.tsx
CREATE templates/react-vite/src/lib/.gitkeep
CREATE templates/vue/template.json
CREATE templates/vue/package.json.hbs
CREATE templates/vue/vite.config.ts
CREATE templates/vue/index.html
CREATE templates/vue/src/App.vue
CREATE templates/vue/src/main.ts
CREATE templates/vue/src/lib/.gitkeep
CREATE templates/express/template.json
CREATE templates/express/package.json.hbs
CREATE templates/express/src/app.ts
CREATE templates/express/src/lib/.gitkeep
CREATE templates/nestjs/template.json
CREATE templates/nestjs/package.json.hbs
CREATE templates/nestjs/nest-cli.json
CREATE templates/nestjs/src/app.module.ts
CREATE templates/nestjs/src/main.ts
CREATE templates/nestjs/src/lib/.gitkeep
MODIFY packages/cli/tests/templates/engine.test.ts (add framework overlay tests)
MODIFY packages/cli/tests/templates/snapshot.test.ts (add framework overlay snapshot tests)
```

## Tasks

### Task 1: Create react-vite template

**Depends on:** none
**Files:** templates/react-vite/template.json, templates/react-vite/package.json.hbs, templates/react-vite/vite.config.ts, templates/react-vite/index.html, templates/react-vite/src/App.tsx, templates/react-vite/src/main.tsx, templates/react-vite/src/lib/.gitkeep

1. Create `templates/react-vite/template.json`:

   ```json
   {
     "name": "react-vite",
     "description": "React + Vite framework overlay",
     "framework": "react-vite",
     "version": 1,
     "language": "typescript",
     "tooling": {
       "packageManager": "npm",
       "linter": "eslint",
       "formatter": "prettier",
       "buildTool": "vite",
       "testRunner": "vitest",
       "lockFile": "package-lock.json"
     },
     "detect": [
       { "file": "vite.config.ts", "contains": "@vitejs/plugin-react" },
       { "file": "package.json", "contains": "@vitejs/plugin-react" }
     ]
   }
   ```

2. Create `templates/react-vite/package.json.hbs`:

   ```json
   {
     "name": "{{projectName}}",
     "scripts": {
       "dev": "vite",
       "build": "tsc && vite build",
       "preview": "vite preview"
     },
     "dependencies": {
       "react": "^18.0.0",
       "react-dom": "^18.0.0"
     },
     "devDependencies": {
       "@types/react": "^18.0.0",
       "@types/react-dom": "^18.0.0",
       "@vitejs/plugin-react": "^4.0.0",
       "vite": "^5.0.0"
     }
   }
   ```

3. Create `templates/react-vite/vite.config.ts`:

   ```typescript
   import { defineConfig } from 'vite';
   import react from '@vitejs/plugin-react';

   export default defineConfig({
     plugins: [react()],
   });
   ```

4. Create `templates/react-vite/index.html`:

   ```html
   <!doctype html>
   <html lang="en">
     <head>
       <meta charset="UTF-8" />
       <meta name="viewport" content="width=device-width, initial-scale=1.0" />
       <title>Harness Engineering App</title>
     </head>
     <body>
       <div id="root"></div>
       <script type="module" src="/src/main.tsx"></script>
     </body>
   </html>
   ```

5. Create `templates/react-vite/src/App.tsx`:

   ```tsx
   export default function App() {
     return (
       <main>
         <h1>Welcome to your Harness Engineering project</h1>
       </main>
     );
   }
   ```

6. Create `templates/react-vite/src/main.tsx`:

   ```tsx
   import React from 'react';
   import ReactDOM from 'react-dom/client';
   import App from './App';

   ReactDOM.createRoot(document.getElementById('root')!).render(
     <React.StrictMode>
       <App />
     </React.StrictMode>
   );
   ```

7. Create `templates/react-vite/src/lib/.gitkeep` (empty file).

8. Run: `harness validate`
9. Commit: `feat(templates): add react-vite framework overlay`

### Task 2: Create vue template

**Depends on:** none
**Files:** templates/vue/template.json, templates/vue/package.json.hbs, templates/vue/vite.config.ts, templates/vue/index.html, templates/vue/src/App.vue, templates/vue/src/main.ts, templates/vue/src/lib/.gitkeep

1. Create `templates/vue/template.json`:

   ```json
   {
     "name": "vue",
     "description": "Vue + Vite framework overlay",
     "framework": "vue",
     "version": 1,
     "language": "typescript",
     "tooling": {
       "packageManager": "npm",
       "linter": "eslint",
       "formatter": "prettier",
       "buildTool": "vite",
       "testRunner": "vitest",
       "lockFile": "package-lock.json"
     },
     "detect": [
       { "file": "package.json", "contains": "vue" },
       { "file": "vite.config.ts", "contains": "@vitejs/plugin-vue" }
     ]
   }
   ```

2. Create `templates/vue/package.json.hbs`:

   ```json
   {
     "name": "{{projectName}}",
     "scripts": {
       "dev": "vite",
       "build": "vue-tsc && vite build",
       "preview": "vite preview"
     },
     "dependencies": {
       "vue": "^3.0.0"
     },
     "devDependencies": {
       "@vitejs/plugin-vue": "^5.0.0",
       "vue-tsc": "^2.0.0",
       "vite": "^5.0.0"
     }
   }
   ```

3. Create `templates/vue/vite.config.ts`:

   ```typescript
   import { defineConfig } from 'vite';
   import vue from '@vitejs/plugin-vue';

   export default defineConfig({
     plugins: [vue()],
   });
   ```

4. Create `templates/vue/index.html`:

   ```html
   <!doctype html>
   <html lang="en">
     <head>
       <meta charset="UTF-8" />
       <meta name="viewport" content="width=device-width, initial-scale=1.0" />
       <title>Harness Engineering App</title>
     </head>
     <body>
       <div id="app"></div>
       <script type="module" src="/src/main.ts"></script>
     </body>
   </html>
   ```

5. Create `templates/vue/src/App.vue`:

   ```vue
   <template>
     <main>
       <h1>Welcome to your Harness Engineering project</h1>
     </main>
   </template>

   <script setup lang="ts"></script>
   ```

6. Create `templates/vue/src/main.ts`:

   ```typescript
   import { createApp } from 'vue';
   import App from './App.vue';

   createApp(App).mount('#app');
   ```

7. Create `templates/vue/src/lib/.gitkeep` (empty file).

8. Run: `harness validate`
9. Commit: `feat(templates): add vue framework overlay`

### Task 3: Create express template

**Depends on:** none
**Files:** templates/express/template.json, templates/express/package.json.hbs, templates/express/src/app.ts, templates/express/src/lib/.gitkeep

1. Create `templates/express/template.json`:

   ```json
   {
     "name": "express",
     "description": "Express.js framework overlay",
     "framework": "express",
     "version": 1,
     "language": "typescript",
     "tooling": {
       "packageManager": "npm",
       "linter": "eslint",
       "formatter": "prettier",
       "buildTool": "tsc",
       "testRunner": "vitest",
       "lockFile": "package-lock.json"
     },
     "detect": [{ "file": "package.json", "contains": "express" }]
   }
   ```

2. Create `templates/express/package.json.hbs`:

   ```json
   {
     "name": "{{projectName}}",
     "scripts": {
       "dev": "tsx watch src/app.ts",
       "build": "tsc",
       "start": "node dist/app.js"
     },
     "dependencies": {
       "express": "^4.0.0"
     },
     "devDependencies": {
       "@types/express": "^4.0.0",
       "tsx": "^4.0.0"
     }
   }
   ```

3. Create `templates/express/src/app.ts`:

   ```typescript
   import express from 'express';

   const app = express();
   const port = process.env.PORT || 3000;

   app.get('/', (_req, res) => {
     res.json({ message: 'Welcome to your Harness Engineering project' });
   });

   app.listen(port, () => {
     console.log(`Server running on port ${port}`);
   });
   ```

4. Create `templates/express/src/lib/.gitkeep` (empty file).

5. Run: `harness validate`
6. Commit: `feat(templates): add express framework overlay`

### Task 4: Create nestjs template

**Depends on:** none
**Files:** templates/nestjs/template.json, templates/nestjs/package.json.hbs, templates/nestjs/nest-cli.json, templates/nestjs/src/app.module.ts, templates/nestjs/src/main.ts, templates/nestjs/src/lib/.gitkeep

1. Create `templates/nestjs/template.json`:

   ```json
   {
     "name": "nestjs",
     "description": "NestJS framework overlay",
     "framework": "nestjs",
     "version": 1,
     "language": "typescript",
     "tooling": {
       "packageManager": "npm",
       "linter": "eslint",
       "formatter": "prettier",
       "buildTool": "nest",
       "testRunner": "jest",
       "lockFile": "package-lock.json"
     },
     "detect": [{ "file": "package.json", "contains": "@nestjs/core" }, { "file": "nest-cli.json" }]
   }
   ```

2. Create `templates/nestjs/package.json.hbs`:

   ```json
   {
     "name": "{{projectName}}",
     "scripts": {
       "dev": "nest start --watch",
       "build": "nest build",
       "start": "node dist/main.js"
     },
     "dependencies": {
       "@nestjs/common": "^10.0.0",
       "@nestjs/core": "^10.0.0",
       "@nestjs/platform-express": "^10.0.0",
       "reflect-metadata": "^0.2.0",
       "rxjs": "^7.0.0"
     },
     "devDependencies": {
       "@nestjs/cli": "^10.0.0"
     }
   }
   ```

3. Create `templates/nestjs/nest-cli.json`:

   ```json
   {
     "$schema": "https://json.schemastore.org/nest-cli",
     "collection": "@nestjs/schematics",
     "sourceRoot": "src"
   }
   ```

4. Create `templates/nestjs/src/app.module.ts`:

   ```typescript
   import { Module } from '@nestjs/common';

   @Module({
     imports: [],
     controllers: [],
     providers: [],
   })
   export class AppModule {}
   ```

5. Create `templates/nestjs/src/main.ts`:

   ```typescript
   import { NestFactory } from '@nestjs/core';
   import { AppModule } from './app.module';

   async function bootstrap() {
     const app = await NestFactory.create(AppModule);
     const port = process.env.PORT || 3000;
     await app.listen(port);
     console.log(`Application running on port ${port}`);
   }

   bootstrap();
   ```

6. Create `templates/nestjs/src/lib/.gitkeep` (empty file).

7. Run: `harness validate`
8. Commit: `feat(templates): add nestjs framework overlay`

### Task 5: Add framework overlay resolution and detection tests

**Depends on:** Task 1, Task 2, Task 3, Task 4
**Files:** packages/cli/tests/templates/engine.test.ts

1. Add the following test section to `packages/cli/tests/templates/engine.test.ts` inside the `'language base render (production templates)'` describe block (after the existing tests):

   ```typescript
   describe('JS/TS framework overlay resolution (production templates)', () => {
     const frameworks = ['react-vite', 'vue', 'express', 'nestjs'] as const;
     const levels = ['basic', 'intermediate', 'advanced'] as const;

     for (const fw of frameworks) {
       it(`resolves ${fw} overlay with basic level`, () => {
         const result = prodEngine.resolveTemplate('basic', fw);
         expect(result.ok).toBe(true);
         if (!result.ok) return;
         const paths = result.value.files.map((f) => f.relativePath);
         // Should include overlay package.json.hbs
         expect(
           paths.some((p) => p === 'package.json.hbs' || p === '__overlay__package.json.hbs')
         ).toBe(true);
       });

       for (const level of levels) {
         it(`renders ${fw} with ${level} level without errors`, () => {
           const resolved = prodEngine.resolveTemplate(level, fw);
           expect(resolved.ok).toBe(true);
           if (!resolved.ok) return;

           const rendered = prodEngine.render(resolved.value, {
             projectName: 'test-app',
             level,
             framework: fw,
           });
           expect(rendered.ok).toBe(true);
           if (!rendered.ok) return;

           // Should produce a merged package.json
           const pkg = rendered.value.files.find((f) => f.relativePath === 'package.json');
           expect(pkg).toBeDefined();
           const parsed = JSON.parse(pkg!.content);
           expect(parsed.name).toBe('test-app');
         });
       }
     }

     it('react-vite overlay includes expected files', () => {
       const resolved = prodEngine.resolveTemplate('basic', 'react-vite');
       if (!resolved.ok) throw new Error(resolved.error.message);
       const rendered = prodEngine.render(resolved.value, {
         projectName: 'test-app',
         level: 'basic',
         framework: 'react-vite',
       });
       if (!rendered.ok) throw new Error(rendered.error.message);
       const paths = rendered.value.files.map((f) => f.relativePath);
       expect(paths).toContain('vite.config.ts');
       expect(paths).toContain('index.html');
       expect(paths).toContain('src/App.tsx');
       expect(paths).toContain('src/main.tsx');
     });

     it('vue overlay includes expected files', () => {
       const resolved = prodEngine.resolveTemplate('basic', 'vue');
       if (!resolved.ok) throw new Error(resolved.error.message);
       const rendered = prodEngine.render(resolved.value, {
         projectName: 'test-app',
         level: 'basic',
         framework: 'vue',
       });
       if (!rendered.ok) throw new Error(rendered.error.message);
       const paths = rendered.value.files.map((f) => f.relativePath);
       expect(paths).toContain('vite.config.ts');
       expect(paths).toContain('index.html');
       expect(paths).toContain('src/App.vue');
       expect(paths).toContain('src/main.ts');
     });

     it('express overlay includes expected files', () => {
       const resolved = prodEngine.resolveTemplate('basic', 'express');
       if (!resolved.ok) throw new Error(resolved.error.message);
       const rendered = prodEngine.render(resolved.value, {
         projectName: 'test-app',
         level: 'basic',
         framework: 'express',
       });
       if (!rendered.ok) throw new Error(rendered.error.message);
       const paths = rendered.value.files.map((f) => f.relativePath);
       expect(paths).toContain('src/app.ts');
     });

     it('nestjs overlay includes expected files', () => {
       const resolved = prodEngine.resolveTemplate('basic', 'nestjs');
       if (!resolved.ok) throw new Error(resolved.error.message);
       const rendered = prodEngine.render(resolved.value, {
         projectName: 'test-app',
         level: 'basic',
         framework: 'nestjs',
       });
       if (!rendered.ok) throw new Error(rendered.error.message);
       const paths = rendered.value.files.map((f) => f.relativePath);
       expect(paths).toContain('nest-cli.json');
       expect(paths).toContain('src/app.module.ts');
       expect(paths).toContain('src/main.ts');
     });

     it('nestjs package.json merges overlay deps into base', () => {
       const resolved = prodEngine.resolveTemplate('basic', 'nestjs');
       if (!resolved.ok) throw new Error(resolved.error.message);
       const rendered = prodEngine.render(resolved.value, {
         projectName: 'test-app',
         level: 'basic',
         framework: 'nestjs',
       });
       if (!rendered.ok) throw new Error(rendered.error.message);
       const pkg = rendered.value.files.find((f) => f.relativePath === 'package.json');
       const parsed = JSON.parse(pkg!.content);
       expect(parsed.dependencies['@nestjs/core']).toBe('^10.0.0');
       expect(parsed.dependencies['@nestjs/common']).toBe('^10.0.0');
       expect(parsed.dependencies['@nestjs/platform-express']).toBe('^10.0.0');
     });
   });

   describe('JS/TS framework auto-detection (production templates)', () => {
     it('detects react-vite from vite.config.ts with plugin-react', () => {
       const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-detect-'));
       fs.writeFileSync(
         path.join(tmpDir, 'vite.config.ts'),
         'import react from "@vitejs/plugin-react";\nexport default defineConfig({ plugins: [react()] });'
       );

       const result = prodEngine.detectFramework(tmpDir);
       expect(result.ok).toBe(true);
       if (!result.ok) return;
       const names = result.value.map((c) => c.framework);
       expect(names).toContain('react-vite');

       fs.rmSync(tmpDir, { recursive: true });
     });

     it('detects vue from package.json with vue dependency', () => {
       const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-detect-'));
       fs.writeFileSync(
         path.join(tmpDir, 'package.json'),
         JSON.stringify({ dependencies: { vue: '^3.0.0' } })
       );

       const result = prodEngine.detectFramework(tmpDir);
       expect(result.ok).toBe(true);
       if (!result.ok) return;
       const names = result.value.map((c) => c.framework);
       expect(names).toContain('vue');

       fs.rmSync(tmpDir, { recursive: true });
     });

     it('detects express from package.json with express dependency', () => {
       const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-detect-'));
       fs.writeFileSync(
         path.join(tmpDir, 'package.json'),
         JSON.stringify({ dependencies: { express: '^4.0.0' } })
       );

       const result = prodEngine.detectFramework(tmpDir);
       expect(result.ok).toBe(true);
       if (!result.ok) return;
       const names = result.value.map((c) => c.framework);
       expect(names).toContain('express');

       fs.rmSync(tmpDir, { recursive: true });
     });

     it('detects nestjs from package.json with @nestjs/core', () => {
       const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-detect-'));
       fs.writeFileSync(
         path.join(tmpDir, 'package.json'),
         JSON.stringify({ dependencies: { '@nestjs/core': '^10.0.0' } })
       );

       const result = prodEngine.detectFramework(tmpDir);
       expect(result.ok).toBe(true);
       if (!result.ok) return;
       const names = result.value.map((c) => c.framework);
       expect(names).toContain('nestjs');

       fs.rmSync(tmpDir, { recursive: true });
     });

     it('all four JS/TS overlay template.json files have valid language field', () => {
       for (const fw of ['react-vite', 'vue', 'express', 'nestjs']) {
         const templates = prodEngine.listTemplates();
         expect(templates.ok).toBe(true);
         if (!templates.ok) return;
         const meta = templates.value.find((t) => t.framework === fw);
         expect(meta).toBeDefined();
         expect(meta!.language).toBe('typescript');
         expect(meta!.detect).toBeDefined();
         expect(meta!.detect!.length).toBeGreaterThan(0);
       }
     });
   });
   ```

2. Run test: `npx vitest run packages/cli/tests/templates/engine.test.ts`
3. Observe: all tests pass
4. Run: `harness validate`
5. Commit: `test(templates): add JS/TS framework overlay resolution and detection tests`

### Task 6: Add framework overlay snapshot tests

**Depends on:** Task 1, Task 2, Task 3, Task 4
**Files:** packages/cli/tests/templates/snapshot.test.ts

1. Add the following to `packages/cli/tests/templates/snapshot.test.ts` after the `languageBases` loop:

   ```typescript
   const frameworkOverlays = [
     { framework: 'react-vite', level: 'basic' as const, expectedFile: 'vite.config.ts' },
     { framework: 'vue', level: 'basic' as const, expectedFile: 'src/App.vue' },
     { framework: 'express', level: 'basic' as const, expectedFile: 'src/app.ts' },
     { framework: 'nestjs', level: 'basic' as const, expectedFile: 'nest-cli.json' },
   ] as const;

   for (const { framework, level, expectedFile } of frameworkOverlays) {
     it(`${framework} overlay with ${level} level matches snapshot`, () => {
       const resolved = engine.resolveTemplate(level, framework);
       if (!resolved.ok) throw new Error(resolved.error.message);

       const rendered = engine.render(resolved.value, {
         projectName: 'snapshot-test',
         level,
         framework,
       });
       if (!rendered.ok) throw new Error(rendered.error.message);

       const fileMap = Object.fromEntries(
         rendered.value.files.map((f) => [f.relativePath, f.content])
       );

       expect(fileMap[expectedFile]).toBeDefined();
       expect(fileMap).toMatchSnapshot();
     });
   }
   ```

2. Run test with snapshot update: `npx vitest run packages/cli/tests/templates/snapshot.test.ts --update`
3. Run test without update to confirm snapshots match: `npx vitest run packages/cli/tests/templates/snapshot.test.ts`
4. Observe: all snapshot tests pass
5. Run: `harness validate`
6. Commit: `test(templates): add snapshot tests for JS/TS framework overlays`

### Task 7: Update existing nextjs template.json with language and detect fields

[checkpoint:human-verify] -- Confirm that updating the existing nextjs template is desired before proceeding.

**Depends on:** none
**Files:** templates/nextjs/template.json

1. Update `templates/nextjs/template.json` to include `language`, `tooling`, and `detect` fields for consistency with the new overlays:

   ```json
   {
     "name": "nextjs",
     "description": "Next.js framework overlay",
     "framework": "nextjs",
     "version": 1,
     "language": "typescript",
     "tooling": {
       "packageManager": "npm",
       "linter": "eslint",
       "formatter": "prettier",
       "buildTool": "next",
       "testRunner": "vitest",
       "lockFile": "package-lock.json"
     },
     "detect": [
       { "file": "next.config.mjs" },
       { "file": "next.config.js" },
       { "file": "package.json", "contains": "next" }
     ]
   }
   ```

2. Run tests to confirm no regressions: `npx vitest run packages/cli/tests/templates/engine.test.ts`
3. Run: `npx vitest run packages/cli/tests/templates/snapshot.test.ts --update` (snapshots will change for nextjs-related entries)
4. Run: `npx vitest run packages/cli/tests/templates/snapshot.test.ts`
5. Run: `harness validate`
6. Commit: `feat(templates): add language, tooling, and detect fields to nextjs template`

## Traceability

| Observable Truth                          | Delivered by                      |
| ----------------------------------------- | --------------------------------- |
| 1. react-vite resolves with overlay files | Task 1, Task 5                    |
| 2. vue resolves with overlay files        | Task 2, Task 5                    |
| 3. express resolves with overlay files    | Task 3, Task 5                    |
| 4. nestjs resolves with overlay files     | Task 4, Task 5                    |
| 5. All levels compose correctly           | Task 5 (level loop)               |
| 6. react-vite auto-detection              | Task 1 (detect patterns), Task 5  |
| 7. vue auto-detection                     | Task 2 (detect patterns), Task 5  |
| 8. express auto-detection                 | Task 3 (detect patterns), Task 5  |
| 9. nestjs auto-detection                  | Task 4 (detect patterns), Task 5  |
| 10. Schema validation passes              | Task 5 (metadata validation test) |
| 11. engine.test.ts passes                 | Task 5                            |
| 12. snapshot.test.ts passes               | Task 6                            |

## Notes

- Tasks 1-4 are parallelizable (they create independent template directories with no shared state).
- Task 7 is independent of Tasks 1-6 and can be done in parallel.
- Tasks 5-6 depend on Tasks 1-4 being complete (they test the production templates).
- The `template-content.test.ts` auto-discovers new template dirs, so new templates will automatically be schema-validated without test modifications (learned from Phase 2).
- Pre-commit hook runs prettier on template JSON files, which is harmless (learned from Phase 2).

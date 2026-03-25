# Plan: Phase 1: The Shell

**Date:** 2026-03-24
**Spec:** docs/changes/harness-blueprint/proposal.md
**Estimated tasks:** 9
**Estimated time:** 45 minutes

## Goal

The foundation of the blueprint system: provide a CLI command `harness blueprint` that generates a static HTML "shell" of the project documentation in `docs/blueprint/`.

## Observable Truths (Acceptance Criteria)

1.  Running `harness blueprint` generates `docs/blueprint/index.html`.
2.  The generated `index.html` contains the project name (e.g., from `package.json` or `harness.config.json`).
3.  The generated `index.html` includes placeholder sections for Foundations, Core Logic, Interaction Surface, and Cross-Cutting Concerns.
4.  `harness validate` passes after all tasks.
5.  `npx vitest run packages/core/tests/blueprint` passes.

## File Map

- MODIFY `packages/core/package.json`
- CREATE `packages/core/src/blueprint/types.ts`
- CREATE `packages/core/src/blueprint/scanner.ts`
- CREATE `packages/core/src/blueprint/templates.ts`
- CREATE `packages/core/src/blueprint/generator.ts`
- CREATE `packages/core/tests/blueprint/scanner.test.ts`
- CREATE `packages/core/tests/blueprint/generator.test.ts`
- MODIFY `packages/core/src/index.ts`
- CREATE `packages/cli/src/commands/blueprint.ts`
- MODIFY `packages/cli/src/index.ts`

## Tasks

### Task 1: Add ejs dependency to packages/core

**Depends on:** none
**Files:** `packages/core/package.json`

1.  Add `ejs` to `dependencies` in `packages/core/package.json`:

```json
"dependencies": {
    "ejs": "^3.1.10",
    ...
}
```

2.  Add `@types/ejs` to `devDependencies` in `packages/core/package.json`:

```json
"devDependencies": {
    "@types/ejs": "^3.1.5",
    ...
}
```

3.  Run: `pnpm install` in the root.
4.  Run: `harness validate`
5.  Commit: `feat(blueprint): add ejs dependency to core`

### Task 2: Define Blueprint Types

**Depends on:** Task 1
**Files:** `packages/core/src/blueprint/types.ts`

1.  Create `packages/core/src/blueprint/types.ts`:

```typescript
export interface BlueprintModule {
  id: string;
  title: string;
  description: string;
  files: string[];
}

export interface BlueprintData {
  projectName: string;
  generatedAt: string;
  modules: BlueprintModule[];
}

export interface BlueprintOptions {
  outputDir: string;
  projectName?: string;
}
```

2.  Run: `harness validate`
3.  Commit: `feat(blueprint): define Blueprint types`

### Task 3: Implement Project Scanner

**Depends on:** Task 2
**Files:** `packages/core/src/blueprint/scanner.ts`, `packages/core/tests/blueprint/scanner.test.ts`

1.  Create `packages/core/tests/blueprint/scanner.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { ProjectScanner } from '../../src/blueprint/scanner';

describe('ProjectScanner', () => {
  it('should identify project name', async () => {
    const scanner = new ProjectScanner(process.cwd());
    const info = await scanner.scan();
    expect(info.projectName).toBeDefined();
    expect(info.modules.length).toBe(4);
  });
});
```

2.  Implement `packages/core/src/blueprint/scanner.ts`:

```typescript
import * as fs from 'fs/promises';
import * as path from 'path';
import { BlueprintData } from './types';

export class ProjectScanner {
  constructor(private rootDir: string) {}

  async scan(): Promise<BlueprintData> {
    let projectName = path.basename(this.rootDir);

    try {
      const pkgPath = path.join(this.rootDir, 'package.json');
      const pkgRaw = await fs.readFile(pkgPath, 'utf-8');
      const pkg = JSON.parse(pkgRaw);
      if (pkg.name) projectName = pkg.name;
    } catch {
      // Fallback to directory name
    }

    return {
      projectName,
      generatedAt: new Date().toISOString(),
      modules: [
        {
          id: 'foundations',
          title: 'Foundations',
          description: 'Utility files and basic types.',
          files: [],
        },
        {
          id: 'core-logic',
          title: 'Core Logic',
          description: 'Mid-level services and domain logic.',
          files: [],
        },
        {
          id: 'interaction-surface',
          title: 'Interaction Surface',
          description: 'APIs, CLIs, and Entry Points.',
          files: [],
        },
        {
          id: 'cross-cutting',
          title: 'Cross-Cutting Concerns',
          description: 'Security, Logging, and Observability.',
          files: [],
        },
      ],
    };
  }
}
```

3.  Run test: `npx vitest run packages/core/tests/blueprint/scanner.test.ts`
4.  Run: `harness validate`
5.  Commit: `feat(blueprint): add ProjectScanner`

### Task 4: Define Embedded Templates

**Depends on:** none
**Files:** `packages/core/src/blueprint/templates.ts`

1.  Create `packages/core/src/blueprint/templates.ts`:

```typescript
export const SHELL_TEMPLATE = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Blueprint: <%= projectName %></title>
    <style><%- styles %></style>
</head>
<body>
    <div id="app">
        <header>
            <h1>Blueprint: <%= projectName %></h1>
            <p>Generated at: <%= generatedAt %></p>
        </header>
        <main>
            <section class="modules">
                <% modules.forEach(module => { %>
                    <article class="module" id="<%= module.id %>">
                        <h2><%= module.title %></h2>
                        <p><%= module.description %></p>
                    </article>
                <% }) %>
            </section>
        </main>
    </div>
    <script><%- scripts %></script>
</body>
</html>
`;

export const STYLES = \`
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; margin: 0; padding: 20px; color: #333; }
header { border-bottom: 2px solid #eee; margin-bottom: 20px; padding-bottom: 10px; }
.module { background: #f9f9f9; border: 1px solid #ddd; padding: 15px; margin-bottom: 15px; border-radius: 4px; }
.module h2 { margin-top: 0; color: #0066cc; }
\`;

export const SCRIPTS = \`
console.log('Blueprint player initialized.');
\`;
```

2.  Run: `harness validate`
3.  Commit: `feat(blueprint): add embedded templates`

### Task 5: Implement Blueprint Generator

**Depends on:** Task 2, Task 4
**Files:** `packages/core/src/blueprint/generator.ts`, `packages/core/tests/blueprint/generator.test.ts`

1.  Create `packages/core/tests/blueprint/generator.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { BlueprintGenerator } from '../../src/blueprint/generator';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('BlueprintGenerator', () => {
  it('should generate blueprint files', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-blueprint-test-'));
    const generator = new BlueprintGenerator();
    const data = {
      projectName: 'test-project',
      generatedAt: new Date().toISOString(),
      modules: [{ id: 'm1', title: 'M1', description: 'Desc', files: [] }],
    };

    await generator.generate(data, { outputDir: tmpDir });

    const indexHtml = await fs.readFile(path.join(tmpDir, 'index.html'), 'utf-8');
    expect(indexHtml).toContain('<title>Blueprint: test-project</title>');
    expect(indexHtml).toContain('<h2>M1</h2>');
  });
});
```

2.  Implement `packages/core/src/blueprint/generator.ts`:

```typescript
import * as fs from 'fs/promises';
import * as path from 'path';
import * as ejs from 'ejs';
import { BlueprintData, BlueprintOptions } from './types';
import { SHELL_TEMPLATE, STYLES, SCRIPTS } from './templates';

export class BlueprintGenerator {
  async generate(data: BlueprintData, options: BlueprintOptions): Promise<void> {
    const html = ejs.render(SHELL_TEMPLATE, {
      ...data,
      styles: STYLES,
      scripts: SCRIPTS,
    });

    await fs.mkdir(options.outputDir, { recursive: true });
    await fs.writeFile(path.join(options.outputDir, 'index.html'), html);
  }
}
```

3.  Run test: `npx vitest run packages/core/tests/blueprint/generator.test.ts`
4.  Run: `harness validate`
5.  Commit: `feat(blueprint): add BlueprintGenerator`

### Task 6: Export Blueprint from Core

**Depends on:** Task 5
**Files:** `packages/core/src/index.ts`

1.  Modify `packages/core/src/index.ts` to export blueprint components:

```typescript
export * from './blueprint/types';
export { ProjectScanner } from './blueprint/scanner';
export { BlueprintGenerator } from './blueprint/generator';
```

2.  Run: `harness validate`
3.  Commit: `feat(blueprint): export blueprint from core`

### Task 7: Create CLI Command

**Depends on:** Task 6
**Files:** `packages/cli/src/commands/blueprint.ts`

1.  Create `packages/cli/src/commands/blueprint.ts`:

```typescript
import { Command } from 'commander';
import * as path from 'path';
import { ProjectScanner, BlueprintGenerator } from '@harness-engineering/core';
import { logger } from '../output/logger';

export function createBlueprintCommand(): Command {
  return new Command('blueprint')
    .description('Generate a self-contained, interactive blueprint of the codebase')
    .argument('[path]', 'Path to the project root', '.')
    .option('-o, --output <dir>', 'Output directory', 'docs/blueprint')
    .action(async (projectPath, options) => {
      try {
        const rootDir = path.resolve(projectPath);
        const outputDir = path.resolve(options.output);

        logger.info(\`Scanning project at \${rootDir}...\`);
        const scanner = new ProjectScanner(rootDir);
        const data = await scanner.scan();

        logger.info(\`Generating blueprint to \${outputDir}...\`);
        const generator = new BlueprintGenerator();
        await generator.generate(data, { outputDir });

        logger.success(\`Blueprint generated successfully at \${path.join(outputDir, 'index.html')}\`);
      } catch (error) {
        logger.error(\`Failed to generate blueprint: \${error instanceof Error ? error.message : String(error)}\`);
        process.exit(1);
      }
    });
}
```

2.  Run: `harness validate`
3.  Commit: `feat(blueprint): add blueprint command to CLI`

### Task 8: Register CLI Command

**Depends on:** Task 7
**Files:** `packages/cli/src/index.ts`

1.  Add import: `import { createBlueprintCommand } from './commands/blueprint';`
2.  Register command: `program.addCommand(createBlueprintCommand());` in `createProgram`.
3.  Run: `harness validate`
4.  Commit: `feat(blueprint): register blueprint command`

### Task 9: Final Verification

**Depends on:** Task 8
**Files:** none

1.  Build project: `pnpm build`
2.  Run from project root: `node packages/cli/dist/bin/harness.js blueprint`
3.  Verify: `docs/blueprint/index.html` exists and contains correct data.
4.  Run: `harness validate`
5.  Commit: `chore(blueprint): final verification of phase 1`

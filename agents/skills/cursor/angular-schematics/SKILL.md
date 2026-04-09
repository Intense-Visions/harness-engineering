# Angular Schematics

> Use ng generate, configure angular.json defaults, and author custom schematics for consistent code generation across a team

## When to Use

- Scaffolding components, services, pipes, guards, and other Angular artifacts with the CLI
- Configuring `angular.json` to set project-wide defaults (standalone, OnPush, flat file structure)
- Applying Angular migration schematics to upgrade between major versions
- Authoring custom schematics to enforce team conventions in code generation
- Using third-party schematics from libraries (Angular Material, NgRx, Spectator)

## Instructions

1. Use `ng generate component <name>` (shorthand: `ng g c <name>`) to scaffold components. Add flags for common options: `--standalone`, `--change-detection OnPush`, `--skip-tests`, `--flat`.
2. Set schematic defaults in `angular.json` under `projects.<name>.schematics` so flags are applied automatically without typing them every time.
3. Use `ng generate @angular/core:standalone` to migrate an NgModule-based project to standalone components. Run the migration in three phases (convert, remove modules, switch bootstrap).
4. Use `ng update` to update Angular and its dependencies with automatic migration schematics. Always run `ng update @angular/core @angular/cli` together.
5. Use `ng generate environments` to scaffold environment files in Angular 15+.
6. For library schematics, install the library first (`ng add @angular/material`), which runs its own `ng-add` schematic for automatic setup.
7. Author custom schematics as TypeScript functions using the `@angular-devkit/schematics` package. A schematic receives a `Tree` (virtual file system) and `SchematicContext` and returns a `Rule`.

```bash
# Common generation commands
ng generate component features/products/product-list --standalone --change-detection OnPush
ng generate service core/services/auth
ng generate guard core/guards/auth --functional
ng generate pipe shared/pipes/truncate --standalone
ng generate directive shared/directives/highlight --standalone
ng generate resolver features/products/product --functional
ng generate interceptor core/interceptors/auth --functional

# Generate with alias shortcuts
ng g c features/dashboard --standalone
ng g s services/cart
ng g p shared/pipes/format-bytes --standalone --flat
```

```json
// angular.json — set schematic defaults for the project
{
  "projects": {
    "my-app": {
      "schematics": {
        "@schematics/angular:component": {
          "standalone": true,
          "changeDetection": "OnPush",
          "style": "scss",
          "flat": false
        },
        "@schematics/angular:directive": {
          "standalone": true
        },
        "@schematics/angular:pipe": {
          "standalone": true
        },
        "@schematics/angular:guard": {
          "functional": true
        },
        "@schematics/angular:interceptor": {
          "functional": true
        }
      }
    }
  }
}
```

```bash
# Angular version upgrade
ng update @angular/core@17 @angular/cli@17

# Migrate to standalone
ng generate @angular/core:standalone
# Phase 1: Convert components/directives/pipes to standalone
# Phase 2: Remove unnecessary NgModules
# Phase 3: Switch to bootstrapApplication

# Apply NgRx schematics
ng generate @ngrx/schematics:store AppState --root --module app.module.ts
ng generate @ngrx/schematics:feature products --module features/products/products.module.ts
```

```typescript
// Custom schematic — basic structure
// schematics/my-feature/index.ts
import {
  Rule,
  SchematicContext,
  Tree,
  url,
  apply,
  template,
  move,
  mergeWith,
} from '@angular-devkit/schematics';
import { strings } from '@angular-devkit/core';

export function myFeature(options: { name: string; path: string }): Rule {
  return (tree: Tree, context: SchematicContext) => {
    const templateSource = apply(
      url('./files'), // template files directory
      [
        template({
          ...strings, // dasherize, classify, camelize, etc.
          ...options,
          name: options.name,
        }),
        move(options.path),
      ]
    );

    return mergeWith(templateSource)(tree, context);
  };
}
```

## Details

**`angular.json` structure overview:**

```
angular.json
└── projects
    └── <project-name>
        ├── architect
        │   ├── build       — build config (outputPath, assets, fileReplacements)
        │   ├── serve       — dev server config (port, proxy, open)
        │   ├── test        — test runner config (karma/jest)
        │   └── lint        — eslint config
        └── schematics      — default options for ng generate
```

**`fileReplacements` for environments:**

```json
"configurations": {
  "production": {
    "fileReplacements": [
      { "replace": "src/environments/environment.ts", "with": "src/environments/environment.prod.ts" }
    ]
  }
}
```

**Proxy configuration for dev server:** Create `proxy.conf.json` and reference it in `angular.json` under `serve.options.proxyConfig`:

```json
{ "/api": { "target": "http://localhost:3000", "secure": false, "changeOrigin": true } }
```

**Custom schematic templates:** Files in the `files/` directory use EJS-style template syntax for file name and content interpolation:

```
files/
  __name@dasherize__.component.ts.template
  __name@dasherize__.component.html.template
```

`<% classify(name) %>` in the file content becomes `MyFeature`. The `strings` helper from `@angular-devkit/core` provides `camelize`, `classify`, `dasherize`, `underscore`, and `capitalize`.

**`ng add` schematics:** Third-party packages run setup logic on install (`ng add @angular/material`). They can modify `angular.json`, `package.json`, and source files automatically. Review the schematic's changes in git diff before committing.

**Migration schematics:** Angular major version migrations run as schematics that automatically update APIs, rename symbols, and transform code patterns. Running `ng update` without `--force` performs a dry-run first, showing what would change.

## Source

https://angular.dev/tools/cli/schematics

## Process

1. Read the instructions and examples in this document.
2. Apply the patterns to your implementation, adapting to your specific context.
3. Verify your implementation against the details and edge cases listed above.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.

## Success Criteria

- The patterns described in this document are applied correctly in the implementation.
- Edge cases and anti-patterns listed in this document are avoided.

---
schemaVersion: 1
module: 'packages/linter-gen/src/engine'
sourceHash: '2a803162ba5819ff7d6b8291986ea9e73d5bc92456c2f258b006b49b35506c39'
compiledAt: '2026-08-28T01:22:11.941Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['context-builder.ts', 'template-loader.ts', 'template-renderer.ts']
---

## Summary

The engine module is a three-stage template-based code generator for ESLint rules. It takes a rule configuration, normalizes it into a context object with case variants (camelCase, PascalCase), then loads and renders a Handlebars template to produce rule implementation code. All stages use discriminated-union result types for explicit error handling.

## Invariants

- Template resolution order is critical: explicit config path is checked first; convention and built-in are fallbacks. Reversing the order breaks user-override semantics.
- Built-in templates are whitelisted: only ['import-restriction', 'boundary-validation', 'dependency-graph'] resolve to built-in. Adding a new rule type with no explicit or convention template will fail unless it's in this list.
- Generator version is manual: GENERATOR_VERSION is hardcoded in context-builder and must be updated by hand on release. There's no automated sync with package.json.
- Case converters are duplicated: toCamelCase and toPascalCase appear in both context-builder and template-renderer. Changes to one copy will silently diverge; they must stay synchronized.
- RuleContext is the template contract: templates assume name, nameCamel, namePascal, severity, config, and meta are always present. Missing or misspelled properties will fail at render time (strict mode).
- Handlebars helpers are global: registering helpers in template-renderer mutates Handlebars state once per module load. Reordering or omitting registrations affects all downstream renders.
- Convention path is hardcoded: the path ./templates/{type}.ts.hbs (relative to configDir) is baked into the loader. Changing the naming scheme requires code changes.
- Built-in path is relative to engine: built-in templates resolve relative to the compiled engine file (../templates/), not the project root. Relocating the engine or templates breaks the lookup.

## Interface Contract

```ts
export TemplateError
export TemplateLoadError
export buildRuleContext
export loadTemplate
export renderTemplate
```

## Dependency Slice

```
import { RuleConfig } from '../schema/linter-config.js'
import { RuleContext } from './context-builder.js'
import * as fs from 'fs/promises'
import Handlebars from 'handlebars'
import * as path from 'path'
import { fileURLToPath } from 'url'
```

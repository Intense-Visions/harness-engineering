---
schemaVersion: 1
module: 'packages/linter-gen/tests/engine'
sourceHash: 'a6214c3248c6c12458253303df9edebf970459fbd7b39277c1d4452f719780ee'
compiledAt: '2026-08-28T01:22:11.945Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['context-builder.test.ts', 'template-loader.test.ts', 'template-renderer.test.ts']
---

## Summary

The `packages/linter-gen/tests/engine` module tests the three-stage linter-generation pipeline: (1) Context Building transforms a RuleConfig into a template-ready context object, converting kebab-case rule names to camelCase and PascalCase variants while attaching metadata; (2) Template Loading resolves linter templates with a three-tier priority (explicit paths → convention paths → built-in), emitting TemplateLoadError when no template exists; (3) Template Rendering renders Handlebars templates against a rule context using helpers for serialization (json/jsonPretty) and case conversion (camelCase/pascalCase), returning TemplateError on invalid syntax. All three stages use a discriminated union result pattern: `{ success: true, data... } | { success: false, error }`.

## Invariants

- Name casing is bidirectional: every kebab-case rule name must correctly convert to both camelCase and PascalCase (tested across simple, multi-word, and numeric cases)
- Template priority is exclusive and ordered: explicit config path strictly overrides convention path, which strictly overrides built-in (tested with collision scenario)
- Handlebars helpers are complete and required: json, jsonPretty, camelCase, pascalCase must all be available; missing one breaks template rendering
- Result discriminant is enforced at call sites: callers must check result.success before accessing data or error; no exceptions thrown
- Paths are resolved relative to configDir: template paths in config are joined against the configDir baseline, not cwd
- Metadata is immutable through the pipeline: generatorVersion, configPath, and generatedAt are set at context-build time and must survive template rendering unchanged

## Interface Contract

```ts

```

## Dependency Slice

```
import { RuleContext, buildRuleContext } from '../../src/engine/context-builder'
import { TemplateLoadError, loadTemplate } from '../../src/engine/template-loader'
import { TemplateError, renderTemplate } from '../../src/engine/template-renderer'
import { RuleConfig } from '../../src/schema/linter-config'
import * as fs from 'fs/promises'
import * as path from 'path'
import { beforeAll, describe, expect, it } from 'vitest'
```

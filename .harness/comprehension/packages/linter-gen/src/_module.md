---
schemaVersion: 1
module: 'packages/linter-gen/src'
sourceHash: '18bc88343a3dd8a8694d34fe6e6890bb0ce4359df26e4340a8d31ac0805e74dc'
compiledAt: '2026-08-28T01:22:11.938Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts']
---

## Summary

@harness-engineering/linter-gen is a Handlebars-driven code generator that produces ESLint rule files from YAML config. It implements a five-stage pipeline: parse and Zod-validate harness-linter.yml, load templates via three-tier resolution (explicit config → convention path → builtin), build context with case-variant name conversions and metadata, render Handlebars templates in strict mode, and orchestrate file I/O with error aggregation. Two main APIs: generate() writes rule files to disk with optional cleaning and dry-run; validate() checks config syntax only.

## Invariants

- Config validity is monolithic — parse or validation error fails the entire generation; no partial output when config is invalid
- Rule names must be kebab-case (regex-enforced at schema); all case variants (camelCase, PascalCase) derive deterministically from this source
- Template resolution is ordered — explicit paths are required to exist; convention (./templates/{type}.ts.hbs) and builtin paths are optional fallbacks
- Output directory is config-relative, not cwd-relative, to maintain portability across working directories
- Error aggregation is all-or-nothing — generation succeeds only if errors list is empty; no partial success is reported
- Index file is only written if generation succeeded and no dryRun; prevents orphaned or empty indices
- Template context timestamp and version are burned in at construction time; not re-evaluated during rendering
- Handlebars strict mode is enforced — templates fail on undefined variables rather than silently rendering empty
- Built-in template allowlist is static — only three hardcoded types (import-restriction, boundary-validation, dependency-graph) can load from package
- Name case conversion functions are duplicated across context-builder, template-renderer, and index-generator — must stay identical to ensure consistent output

## Interface Contract

```ts
export GenerateOptions
export GenerateResult
export GeneratorError
export LinterConfig
export LinterConfigSchema
export ParseError
export RuleConfig
export RuleConfigSchema
export RuleContext
export TemplateError
export TemplateLoadError
export TemplateSource
export TemplateSourceType
export ValidateOptions
export ValidateResult
export generate
export validate
```

## Dependency Slice

```

```

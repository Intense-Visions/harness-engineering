---
schemaVersion: 1
module: 'packages/cli/tests/templates/fixtures/mock-templates/basic/src'
sourceHash: '16b8c17ce24bf0f900e459dfe210e64bfc91e989664c574e044552dbe3f1d0f7'
compiledAt: '2026-08-28T01:22:10.142Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts']
---

## Summary

`mock-templates/basic/src` is a test fixture representing the source directory of a basic-level adoption template for the CLI template system. It contains a single, intentionally empty TypeScript module (`index.ts`) that serves as a structural placeholder—part of the template's scaffolding for testing template rendering and file generation. The template itself is configured at `template.json` as a "level 1" offering that extends the `base` template and uses Handlebars to generate files like `package.json.hbs`.

## Invariants

- Empty-but-valid TS module: `index.ts` must parse as valid TypeScript; `export {};` is the canonical form for test fixtures to satisfy build checks without exporting anything.
- Template hierarchy: The `basic` template declares `"extends": "base"` in `template.json`, so removal or renaming breaks inheritance tests expecting base+basic composition.
- Fixture scope: This path is only exercised in test suites that verify template discovery, merging (base→basic overlay), and file-generation; production tooling never reads it.
- Single-file rule: Only `index.ts` exists in `src/` for this template; other mock templates (overlay, fastapi-overlay) vary their structure to test handling of different file shapes and counts.

## Interface Contract

```ts

```

## Dependency Slice

```

```

---
schemaVersion: 1
module: 'packages/linter-gen/scripts'
sourceHash: '7145df9ed7112ae932cd724b32d3682352614b9a670c5041726368e56559a18a'
compiledAt: '2026-08-28T01:22:11.936Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['copy-templates.mjs']
---

## Summary

`packages/linter-gen/scripts` is a build-time utility with a single ESM script that copies Handlebars template files from source to distribution after TypeScript compilation. The package generates ESLint rules from YAML configuration and uses `.hbs` templates to generate rule code. The script ensures these templates are available in the published package's dist folder by running as the second stage of the build pipeline (`tsc && node scripts/copy-templates.mjs`). It is Windows-compatible, using Node.js fs/promises APIs instead of shell commands.

## Invariants

- Execution order: Script must run after tsc completes; TypeScript compilation is a prerequisite.
- Stale file cleanup: Destination dist/templates/ must be deleted before copying to prevent leftover artifacts from previous builds.
- Recursive preservation: Copy operation must be recursive to preserve full template directory structure and capture all .hbs files.
- Path resolution: Script derives package root relative to its own file location (import.meta.url), not cwd, ensuring it works regardless of invocation directory.

## Interface Contract

```ts

```

## Dependency Slice

```
import { cp, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
```

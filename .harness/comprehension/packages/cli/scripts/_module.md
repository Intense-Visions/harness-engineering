---
schemaVersion: 1
module: 'packages/cli/scripts'
sourceHash: '65f9b0a4856ccd97abd3eefa251ddc2479a44367c83e7848a6985e0d5116f3b3'
compiledAt: '2026-08-28T01:22:08.627Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['copy-assets.mjs']
---

## Summary

The `packages/cli/scripts` module contains two build and validation utilities. **copy-assets.mjs** is a post-build asset copier wired into the normal build (`pnpm build`) that copies `templates/`, `agents/`, and `src/hooks/*.js` into dist, carefully dereferencing symlinks (needed for skill platform mirrors) and cleaning destinations first to avoid stale content. **validate-vision-benchmark.mts** is a manual end-to-end testing tool that scores two design screenshots (high-quality vs. flat) against the real local `claude` CLI to prove the vision-evaluation pipeline actually sees and discriminates design quality; not wired into CI.

## Invariants

- Symlink dereference is essential: cp with dereference:true is required because agents/skills/ contains relative symlinks to the claude-code canonical; without dereferencing, cp fails with ERR_FS_CP_EINVAL
- Destination cleanup must precede copy: destination directories are wiped before copy to avoid stale files and symlink-dereferencing conflicts; cp does not merge and leftover symlinks cause invalid state
- Hook assets must be compiled JS only: the filter excludes .ts sources from hooks; only .js scripts are packaged into dist to enforce pre-compilation and keep bundle size down
- agents/commands is agent-internal and never shipped: the commands subdirectory is filtered out because it contains agent implementation details, not user-facing skill definitions
- Vision-benchmark uses real local Claude CLI: validation runs against the actual claude command, not a mock provider, so it truly proves end-to-end vision scoring works against real design inputs

## Interface Contract

```ts

```

## Dependency Slice

```
import { cp, mkdir, rm } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
```

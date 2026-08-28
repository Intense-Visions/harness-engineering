---
schemaVersion: 1
module: 'packages/burn'
sourceHash: '47e15dfd256858dc52eb1decf1de742c179e7fceb96866708a650371f9cf4fa1'
compiledAt: '2026-08-28T01:22:08.624Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['tsup.config.ts']
---

## Summary

`packages/burn` provides two build artifacts: a library entry (`src/index.ts`) exported as CommonJS + ESM with type definitions for the `harness burn` CLI command, and a high-performance binary (`src/bin/burn-hud.ts`) that renders token usage/quota status on the statusline and after every assistant turn. The binary is built as an isolated, zero-dependency `.mjs` file to stay within a ~0.11s startup budget — importing the CLI's module graph would cost ~0.85s per invocation, unacceptable for a frequent statusline refresh. The `.mjs` extension bypasses Node's module-type detection reparse, which would otherwise fire on every launch since the package ships both CJS and ESM. The binary's isolation is enforced by `tests/bin-startup.test.ts`, which fails if any `@harness-engineering/*` imports leak in.

## Invariants

- Binary has zero dependencies on @harness-engineering/\* packages; any import breaks the startup budget and degrades statusline performance
- Binary startup latency must stay under 0.11s; it renders on every statusline repaint and after every turn
- Library entry must ship both CommonJS and ESM formats with type definitions to support CLI and downstream adoption
- .mjs extension is required for the binary — without it, Node would reparse on every invocation because package.json cannot set `type: module` (package ships CommonJS too)

## Interface Contract

```ts
export default
```

## Dependency Slice

```
import { defineConfig } from 'tsup'
```

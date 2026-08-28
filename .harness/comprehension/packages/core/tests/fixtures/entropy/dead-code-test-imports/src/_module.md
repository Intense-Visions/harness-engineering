---
schemaVersion: 1
module: 'packages/core/tests/fixtures/entropy/dead-code-test-imports/src'
sourceHash: '3e12012e9c8e8e043b5d35151ec7288e783060619fa8d6ee18f91d29acbe5430'
compiledAt: '2026-08-28T01:22:10.858Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['commands.spec.ts', 'commands.ts', 'index.ts']
---

## Summary

This is a regression-test fixture for a dead-export detector. It verifies that the detector correctly distinguishes between exports that are imported _only by test files_ (which should be kept) versus exports that have _no importers anywhere_ (which are genuinely dead). The module has three files: index.ts (public entry point exporting appName, deliberately does not import from commands.ts); commands.ts (contains runVerify() used only by test and deadCommand() used nowhere); and commands.spec.ts (co-located spec file that imports and tests runVerify).

## Invariants

- Test imports must count as live — runVerify has no source-file importers, only a test-file importer; it should not be flagged as dead
- Zero importers = genuinely dead — deadCommand has no source or test importers anywhere; it should be flagged as dead
- File naming matters for detector scope — .spec.ts naming keeps this file outside vitest's real-test collection while still matching the detector's test-file pattern

## Interface Contract

```ts
export appName
```

## Dependency Slice

```
import { runVerify } from './commands'
```

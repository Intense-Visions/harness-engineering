---
schemaVersion: 1
module: 'packages/local-models/tests'
sourceHash: 'a962dac614ea8ff256ace0a578a8dc9d30dc57249162a212e12c68d43d04d32d'
compiledAt: '2026-08-28T01:22:11.984Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['smoke.test.ts']
---

## Summary

@harness-engineering/local-models/tests is a bootstrap smoke-test suite for a new package (v0.1.0). It contains a single test file verifying that two public exports—LOCAL_MODELS_PACKAGE and LOCAL_MODELS_VERSION—are correctly wired: the package identifier must be '@harness-engineering/local-models' and the version must match package.json ('0.1.0').

## Invariants

- LOCAL_MODELS_PACKAGE export must equal '@harness-engineering/local-models' (matches package.json name)
- LOCAL_MODELS_VERSION export must equal '0.1.0' (stays in sync with package.json version)
- Both constants must be exported from src/index.js (import path dependency)

## Interface Contract

```ts

```

## Dependency Slice

```
import { LOCAL_MODELS_PACKAGE, LOCAL_MODELS_VERSION } from '../src/index.js'
import { describe, expect, it } from 'vitest'
```

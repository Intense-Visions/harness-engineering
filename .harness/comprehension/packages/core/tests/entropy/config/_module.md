---
schemaVersion: 1
module: 'packages/core/tests/entropy/config'
sourceHash: '90ff68053c7a35d3316991cb0fe7218b76a286866aba4f09e3d6388f914e5cd5'
compiledAt: '2026-08-28T01:22:10.800Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['schema.test.ts']
---

## Summary

`packages/core/tests/entropy/config` validates the schema for entropy detection configuration—a declarative system for defining code-pattern violations (exports, naming, complexity) that the entropy cleaner detects and reports. The module tests two entry points: `validatePatternConfig()` validates individual pattern definitions (name, description, severity, file globs, and type-specific rules like must-export-default, naming, max-exports), and `EntropyConfigSchema` validates the full entropy config structure (rootDir + analyze object with toggles for drift/deadCode/patterns that accept either booleans or nested objects). Tests are schema-only, verifying structural validity rather than behavioral correctness.

## Invariants

- Every pattern requires name, description, severity (enum: error/warning), files (glob array), and rule (type + payload); unknown types must be rejected
- Rule types are closed: must-export-default, naming (with match regex + convention), and max-exports (with count) each carry distinct, required properties
- Analyze config is polymorphic: drift, deadCode, patterns accept both boolean (shorthand) and object (detailed) forms; schema must parse both without coercion
- RootDir is required at top level; validation fails if missing
- Naming rule requires match field (regex pattern) and convention label for error messages

## Interface Contract

```ts

```

## Dependency Slice

```
import { EntropyConfigSchema, validatePatternConfig } from '../../../src/entropy/config/schema'
import { describe, expect, it } from 'vitest'
```

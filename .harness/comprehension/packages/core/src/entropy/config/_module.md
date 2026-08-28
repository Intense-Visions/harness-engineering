---
schemaVersion: 1
module: 'packages/core/src/entropy/config'
sourceHash: '14661bcfa776bd95726732a5139fa5b46aedb7450c8ba609d1197e9ebe32d3fb'
compiledAt: '2026-08-28T01:22:10.333Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts', 'schema.ts']
---

## Summary

This module exports Zod schemas for validating entropy analysis configuration. It defines the shape of configuration objects used to run code pattern analysis, drift detection, and dead code scanning.

The core exports are:

- **`EntropyConfigSchema`** — validates the full entropy config (rootDir, parser, entryPoints, analyze options, include/exclude globs, doc paths)
- **`PatternConfigSchema`** — validates pattern-based rule configurations
- **`validatePatternConfig()`** — parses and validates a config, returning a `Result<PatternConfig, EntropyError>` (never throws; errors are values)

The module uses Zod's discriminated union (`RuleSchema`) to enforce nine rule types: `must-export`, `must-export-default`, `no-export`, `must-import`, `no-import`, `naming`, `max-exports`, `max-lines`, and `require-jsdoc`. Each rule type has distinct required fields (e.g., naming rules require a `match` pattern and `convention` enum).

Configuration supports three optional analysis modes (`drift`, `deadCode`, `patterns`), each of which can be a boolean (enable with defaults) or an object with granular options.

## Invariants

- Discriminated union on `type` field ensures rules are exhaustively typed with no field leakage between rule types
- `validatePatternConfig()` returns `Result<PatternConfig, EntropyError>` (never throws); callers must pattern-match on Err vs Ok
- `parser` and `customPatterns` use `z.any()` intentionally because they are runtime functions, not serializable data
- Every pattern has a required `severity: 'error' | 'warning'` field that gates enforcement level
- Each analysis mode (drift/deadCode/patterns) can be boolean (shorthand enable) or a detailed config object; both forms are valid
- File filtering via `include`/`exclude` arrays uses glob syntax; no field-level filtering logic is embedded in the schema
- Pattern names are non-empty strings; descriptions and messages are required or optional per rule type

## Interface Contract

```ts
export EntropyConfigSchema
export PatternConfigSchema
export validatePatternConfig
```

## Dependency Slice

```
import { createEntropyError } from '../../shared/errors'
import { Err, Ok, Result } from '../../shared/result'
import { EntropyError, PatternConfig } from '../types'
import { z } from 'zod'
```

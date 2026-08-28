---
schemaVersion: 1
module: 'packages/intelligence/tests/guardian'
sourceHash: 'c618bf76c711ab92b62fde4d9ca27628f73fdff86d9bf5a6798a439c68b816b4'
compiledAt: '2026-08-28T01:22:11.906Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['reader.test.ts']
---

## Summary

The `guardian` test suite validates a diff-coverage analysis reader that ingests JSON records from a coverage-check gate. It exports four functions: `readGuardianAnalyses(dir)` loads and validates `.json` files using `schema`/`version` discriminators, silently skipping malformed or non-guardian records; `summarizeGuardian(records)` generates a one-line summary reporting FAIL (with worst coverage delta) or PASS, returning null for empty input; `guardianFlags(record)` returns true if verdict is fail OR severity is error; `guardianFileLines(records)` extracts human-readable file-level violations. The reader is defensive: missing directories return `[]`, malformed JSON is skipped without throwing, and non-guardian records in a shared directory are discriminated out by schema field.

## Invariants

- Records are discriminated by 'schema' and 'version' fields; records without them (e.g., intelligence pipeline records) are silently skipped, not merged
- Missing directories and malformed files do not throw; the function returns [] or skips the file and continues with valid records
- guardianFlags uses inclusive-OR: a record flags if verdict is 'fail' OR severity is 'error', not just one
- summarizeGuardian reports the most negative (worst) coverage delta, not average or median — pessimistic for gate signaling
- Empty input to summarizeGuardian returns null, enabling truthy checks in downstream gate logic
- Only .json files in the top-level directory are considered; subdirectories and non-JSON files are ignored
- guardianFileLines lists only files with uncovered lines or regions; empty arrays are omitted

## Interface Contract

```ts

```

## Dependency Slice

```
import { GUARDIAN_ANALYSIS_SCHEMA, GUARDIAN_ANALYSIS_VERSION, GuardianAnalysis, guardianFileLines, guardianFlags, readGuardianAnalyses, summarizeGuardian } from '../../src/guardian/index.js'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
```

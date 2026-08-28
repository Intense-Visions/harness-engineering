---
schemaVersion: 1
module: 'packages/linter-gen/tests/parser'
sourceHash: '36dcc4203632424728595344a386b6a8b5d98ea4ff9f3e92fe182d4f1b95f312'
compiledAt: '2026-08-28T01:22:11.944Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['config-parser.test.ts']
---

## Summary

Test suite for `parseConfig` validating a three-stage async YAML config loader: file I/O (FILE_NOT_FOUND), syntax parsing (YAML_PARSE_ERROR), and schema validation (version/output/rules structure). Returns discriminated union Result<ConfigData, ParseError> with success boolean branching to data or error. Rules array contains objects with at minimum a 'name' property.

## Invariants

- parseConfig returns Promise<{success: true, data: ConfigData} | {success: false, error: ParseError}>
- ParseError is an Error subclass with message and code properties (FILE_NOT_FOUND, YAML_PARSE_ERROR, schema errors)
- Successful ConfigData has version (number), output (string), and rules (array of objects with 'name' property)
- Failed parse error.message contains the violated constraint name (e.g., 'version')
- FILE_NOT_FOUND error code for missing file paths (not thrown exception)
- YAML_PARSE_ERROR code for malformed YAML syntax
- Schema validation errors include field name in ParseError.message for debugging

## Interface Contract

```ts

```

## Dependency Slice

```
import { ParseError, parseConfig } from '../../src/parser/config-parser'
import * as path from 'path'
import { describe, expect, it } from 'vitest'
```

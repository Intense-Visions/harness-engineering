---
schemaVersion: 1
module: 'packages/linter-gen/src/parser'
sourceHash: 'fd43fa5c24ddb4f2b8b2e9c5acf51822f364f68037591c5a8a0477b2c33f4125'
compiledAt: '2026-08-28T01:22:11.939Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['config-parser.ts']
---

## Summary

The `parser` module is a YAML config file parser and validator for the harness-linter. It reads a `harness-linter.yml` file, parses the YAML syntax, and validates the result against a Zod schema, returning either valid config data or a structured error with diagnostic context. The core flow is: file read → YAML parse → Zod validation, with each stage producing a specific error code (FILE_NOT_FOUND, FILE_READ_ERROR, YAML_PARSE_ERROR, VALIDATION_ERROR) that lets callers handle failures differently. The module exports a single async entry point `parseConfig(path)` that returns a discriminated union: `{ success: true; data: LinterConfig }` or `{ success: false; error: ParseError }`.

## Invariants

- ParseError code is semantically distinct — callers rely on error.code to distinguish file-not-found from parse errors from validation errors; if codes collapse or get renamed, error handling breaks
- Three-stage pipeline order is load-bearing — file read must happen before YAML parsing; parsing must happen before validation; reordering or skipping a stage changes which errors surface and when
- ParseResult discriminated union is enforced at type-check time — code that accesses .data without checking .success will fail TypeScript; any bypass silently introduces null-reference bugs
- Zod validation is the schema authority — the module does not pre-validate or post-validate; it delegates entirely to LinterConfigSchema.safeParse(); if schema and config contract diverge, validation passes silently
- Async boundary is non-negotiable — parseConfig returns Promise<ParseResult>; any caller treating it as sync will hang; no blocking variant exists
- Error message flattening is semi-structured — Zod validation errors are flattened to path.to.field: message; if the format changes, tooling that parses this string breaks

## Interface Contract

```ts
export ParseError
export parseConfig
```

## Dependency Slice

```
import { LinterConfig, LinterConfigSchema } from '../schema/linter-config.js'
import * as fs from 'fs/promises'
import * as yaml from 'yaml'
```

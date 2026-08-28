---
schemaVersion: 1
module: 'packages/cli/src/security-craft/extract'
sourceHash: '2134239f7a16fc7353dda9449b0873b48f084604a90d1a679908843f0c6cef70'
compiledAt: '2026-08-28T01:22:09.333Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['discover.ts', 'signals.ts']
---

## Summary

**`security-craft/extract`** performs two complementary tasks in the security-analysis pipeline:

**Source file discovery** (`discoverSourceFiles`) scans `packages/*/src/` recursively to enumerate TypeScript and JavaScript source files (excluding test directories and build artifacts). It returns an exhaustive list of targets for analysis, optionally filtered to specific packages.

**Security signal detection** (`detectSignals`) runs a single TypeScript AST walk per file to identify high-value security patterns: HTTP handlers, middleware, authentication APIs (JWT, bcrypt, passport), privileged operations (child_process, fs, vm, eval), network egress (axios, http, fetch), and secret-handling anti-patterns. Each signal is emitted as a `{kind, marker, line}` tuple and de-duplicated at the line level to avoid redundant findings. Files with zero signals are discarded—this is the FP-management strategy from the design proposal.

The module's intent is **AST-driven targeting**: by matching construct shape rather than path heuristics or regex, it avoids common false positives like 'eval' in comments or 'exec' as a variable name.

## Invariants

- Single canonical signal per {kind, marker, line}: de-duplication via the seen Set is load-bearing; handlers with multiple constructs at one line must not emit duplicates.
- Source discovery is exhaustive within scope: must walk all packages/\*/src/ but never descend into excluded dirs (node_modules, dist, .git, test dirs, **snapshots**, **mocks**). Incomplete walk = missing analysis targets.
- Test file exclusion is dual-layer: both directory-based (filter tests/, test/, **tests**/) and pattern-based (exclude _.test.ts, _.spec.js). Leakage to test analysis breaks v1 scope.
- Namespace.method registries are immutable sources of truth: PRIVILEGED_NAMESPACE_CALLS, AUTH_API_CALLS, EGRESS_NAMESPACE_CALLS are canonical signal mappings. Changes are breaking.
- Handler/middleware detection depends on parameter shape: regex patterns on parameter names (req,res, ctx,next) are the contract; must be stable and documented.
- AST parse failures are silent: detectSignals returns [] on parse error; orchestrator continues. Signals from unparseable files are lost silently but robustness is prioritized.
- Marker values must be deterministic: used as deduplication key; must always produce the same string for the same construct (e.g., passport.authenticate, never Passport.Authenticate).
- Files with zero signals are discarded by orchestrator: not processed downstream; this is the FP-management strategy from the design proposal.

## Interface Contract

```ts
export detectSignals
export discoverSourceFiles
```

## Dependency Slice

```
import { SecuritySignal, SignalKind } from '../findings/schema.js'
import * as fs from 'node:fs'
import * as path from 'node:path'
import ts from 'typescript'
```

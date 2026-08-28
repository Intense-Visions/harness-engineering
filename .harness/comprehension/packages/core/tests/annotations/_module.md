---
schemaVersion: 1
module: 'packages/core/tests/annotations'
sourceHash: '62654b60f54c44178cdca12265ffb3077c39653712880e1240dfda7c7d33197a'
compiledAt: '2026-08-28T01:22:10.680Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['protected-regions.test.ts']
---

## Summary

The `packages/core/tests/annotations` module validates the protected-regions annotation system, which enables engineers to exclude code from quality checks (entropy, architecture, security). It tests three APIs: `parseFileRegions` extracts inline markers from a single file using two styles (block: `// harness-ignore-start [scope]: [reason]` ... `// harness-ignore-end`; line: `// harness-ignore [scope]: [reason]` protecting the next code line), supporting `//` and `#` comment prefixes. `createRegionMap` builds a queryable lookup via `isProtected(file, lineNum, scope)` and `getRegions(file)`. `parseProtectedRegions` batch-processes multiple files, aggregating regions and validation issues. Scope defaults to `['all']` if omitted; only entropy/architecture/security/all are recognized. The system returns both protected regions and validation issues (unclosed blocks, orphaned ends, unknown scopes).

## Invariants

- Block pairing invariant: Every harness-ignore-start must have a matching harness-ignore-end; unclosed blocks extend to EOF and emit an unclosed-block validation issue
- Orphaned-end invariant: harness-ignore-end without a preceding start is rejected and reported as orphaned-end issue
- Scope resolution: Default scope is ['all'] if omitted; only entropy/architecture/security/all are accepted; unknown scopes are filtered and reported as unknown-scope issues
- Wildcard scope matching: A region with scope ['all'] matches any query scope; specific scopes match only themselves
- Line-level skip logic: Line annotations skip blank lines and comment lines to locate the actual code line being protected
- Inclusive range semantics: Regions protect lines in [startLine, endLine] inclusive; both boundaries are protected
- File isolation: Regions are file-specific; isProtected queries only the named file
- Security scanner passthrough: harness-ignore SEC-XXX-NNN patterns are ignored (not parsed as protected regions)
- Comment style detection: File extension determines comment prefix (// for .ts/.js, # for .py/.sh) — both syntaxes parse identically

## Interface Contract

```ts

```

## Dependency Slice

```
import { createRegionMap, parseFileRegions, parseProtectedRegions } from '../../src/annotations/protected-regions'
import { describe, expect, it } from 'vitest'
```

---
schemaVersion: 1
module: 'packages/core/src/annotations'
sourceHash: 'e88e3db73e7f1dc69797b45b85590ad80dcf23b406805e71b8f957ab3cf71723'
compiledAt: '2026-08-28T01:22:10.269Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts', 'protected-regions.ts', 'types.ts']
---

## Summary

The `annotations` module provides a lightweight system for marking source code regions as "protected" from automated checks. Developers annotate lines or blocks with `// harness-ignore [scopes]: [reason]` to exempt them from entropy, architecture, and security checks. The module parses these annotations, builds an efficient line-level lookup map, and reports structural issues (unclosed blocks, orphaned ends, unknown scopes). Core workflow: parse files → extract regions → create queryable map → check `isProtected(file, line, scope)`.

## Invariants

- Line numbering is 1-indexed throughout — startLine, endLine, and issue line numbers all use 1-based indexing (input split by \n is 0-indexed; conversion happens at report time).
- Line annotations protect the next code line, not the annotation line — // harness-ignore skips past comments/blanks via findNextCodeLine to land on the actual statement being protected.
- Unspecified scope defaults to 'all' — omitting the scope string yields ['all'], which protects from every check (isProtected matches if region has 'all' OR the query scope).
- Block nesting uses a stack; pairs match LIFO — start/end are pushed/popped as a stack, so start-A, start-B, end-B, end-A correctly nests; mismatches are reported as issues.
- Unclosed blocks extend to EOF and trigger an issue — any start still on the stack at end-of-file is closed at lines.length and flagged as unclosed-block; the region is still created (fail-safe).
- Regex explicitly excludes security-scanner patterns — LINE_PATTERN has a negative lookahead (?!\s\*(?:SEC-|-start|-end)) to avoid collision with harness-ignore SEC-XXX-NNN annotations (different system, not parsed here).
- isProtected is scope-aware and logical-OR'd — a line is protected if it falls within a region's [startLine, endLine] AND (scopes.includes('all') OR scopes.includes(queryScope)).
- Comment detection is language-agnostic heuristic — only //, #, /_, _ prefixes trigger the 'skip this line' logic; no language-aware AST (so false positives in strings are possible, but rare in practice).

## Interface Contract

```ts
export AnnotationIssue
export AnnotationIssueType
export ProtectedRegion
export ProtectedRegionMap
export ProtectionScope
export VALID_SCOPES
export createRegionMap
export parseFileRegions
export parseProtectedRegions
```

## Dependency Slice

```
import { AnnotationIssue, ProtectedRegion, ProtectedRegionMap, ProtectionScope, VALID_SCOPES } from './types'
```

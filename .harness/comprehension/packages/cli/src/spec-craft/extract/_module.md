---
schemaVersion: 1
module: 'packages/cli/src/spec-craft/extract'
sourceHash: 'e69b602585bfeb1c7b78784348f7846029bceca46e92db1a9e33989dadde7973'
compiledAt: '2026-08-28T01:22:09.398Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['discover.ts', 'sections.ts']
---

## Summary

spec-craft/extract discovers and parses structured specification documents (proposals and ADRs) within a project. It provides two core operations: (1) discoverSpecs recursively finds proposal.md files under docs/changes/<topic>/ (and one level deeper) and ADR .md files under docs/knowledge/decisions/, returning file paths tagged by kind; (2) parseSections splits a spec's markdown by H2 headings into named sections, strips frontmatter first, and normalizes each heading into a canonical form for downstream rubric matching while tracking exact line positions for source mapping. The module is lightweight and path-driven—it has no knowledge of spec semantics, only document structure—and serves as the intake layer for rubric-based analysis systems.

## Invariants

- H2 is the canonical section boundary — section parsing splits only on H2 headers, not H1 or H3+. Changing this delimiter breaks all downstream rubric routing.
- Frontmatter strips before line tracking — YAML frontmatter (---\n...\n---) must be removed from the source before section parsing and line-number calculation. If not, all line numbers drift and source-map calls fail.
- Canonicalization is deterministic and idempotent — the canonical field (lowercase → replace non-alphanumeric runs with '-' → strip edge hyphens) is used for rubric matching. Any change to this rule breaks section routing.
- Discovery paths are fixed and shallow — proposals are found at exactly two depths (docs/changes/<topic>/proposal.md or docs/changes/<topic>/<sub>/proposal.md); ADRs are flat in docs/knowledge/decisions/\*.md. Deeper nesting or moved directories will be silently missed.
- Line numbering contract: 1-indexed, endLine exclusive — line is the first body line (1-indexed), endLine is the line after the section (exclusive, 1-indexed). Consumers rely on this for error reporting and source-link generation.
- Section body is trimmed — whitespace-sensitive downstream consumers should not rely on leading/trailing blanks; all are removed via .trim().

## Interface Contract

```ts
export canonicalize
export discoverSpecs
export parseSections
```

## Dependency Slice

```
import * as fs from 'node:fs'
import * as path from 'node:path'
```

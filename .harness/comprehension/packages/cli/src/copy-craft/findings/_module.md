---
schemaVersion: 1
module: 'packages/cli/src/copy-craft/findings'
sourceHash: '93e81312c9f50d70c4e134bc153c237631406b309aff0a29202b9995009307b3'
compiledAt: '2026-08-28T01:22:08.972Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['schema.ts']
---

## Summary

`packages/cli/src/copy-craft/findings` defines the schema for text-critique findings emitted by the copy-craft tool—a copywriting/messaging quality pipeline that scans multiple text surfaces (error messages, logs, CLI output, git commits, PR descriptions, comments). Findings use a three-axis scoring model (Tier, Impact, Confidence) imported from the shared craft axes. The module exports the `CopyFinding` interface (a single finding with code, location, and critique message), `CopyCraftOutput` (batch of findings + metadata), and `ExtractedCopyItem` (uniform shape that all extractors produce before critique-phase processing).

## Invariants

- Stable code namespace: Every finding carries a `code` in the `COPY-R\d{3}` namespace (never changes; critical for tooling and rule aggregation).
- Phase v1 constraint: `phase` is hardcoded `'critique'` only—no POLISH phase exists yet; future expansion requires a new phase enum.
- Surface enum closed: `CopySurface` is a sealed union (`'error'|'log'|'cli-output'|'commit'|'pr-description'|'comment'`); new surface types require schema migration.
- Extractor uniformity: All extractors must produce `ExtractedCopyItem` before critique phase; the critique phase consumes this shape indiscriminately, so any extractor-specific context goes in the `context` object.
- Location semantics: `target.file` is a file path for source surfaces, a git ref (commit hash or PR number) for git surfaces; this dual meaning is implicit and must be preserved.
- Rubric traceability: `cite.rubricId` links each finding to a specific rubric rule; loss of this link breaks audit/analysis workflows.
- Priority derivation: `derived.priority` is computed _after_ extraction (not provided by extractors); scores must be deterministic and stable for batch ordering.
- Cost attribution: LLM call cost/provider/model must be tracked per run for billing and benchmarking; omission hides true operational cost.

## Interface Contract

```ts
export Confidence
export Impact
export Tier
```

## Dependency Slice

```
import { Confidence, Impact, Tier } from '../../shared/craft/findings/axes.js'
```

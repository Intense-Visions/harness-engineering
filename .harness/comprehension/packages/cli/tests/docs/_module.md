---
schemaVersion: 1
module: 'packages/cli/tests/docs'
sourceHash: 'dcd393d3ce44ab4c7b698e9da5530c164c0e3ebd5c6321fa21b0461ec55f63ae'
compiledAt: '2026-08-28T01:22:09.694Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['migration-guide.test.ts']
---

## Summary

The `packages/cli/tests/docs` module validates the roadmap migration guide documentation for completeness and accuracy. It ensures the migration guide exists at the correct path, contains all eight required structural sections (covering pre-flight, execution, verification, rollback, and collision-handling scenarios), and documents the exact CLI commands and rollback procedures operators will need. This prevents documentation drift from the actual CLI and ensures operational procedures are correct and current.

## Invariants

- Migration guide file path is hardcoded at `docs/changes/roadmap-tracker-only/migration.md` — path changes break the test silently if not updated
- Eight sections must be present (case-insensitive): `pre-flight checklist`, `dry run`, `real run`, `verification`, `rollback recipe`, `recovery from partial failure`, `title-only collision`, `archive collision`
- CLI commands must be documented verbatim: `harness roadmap migrate --to=file-less --dry-run` and `harness roadmap migrate --to=file-less` — syntax changes require updating both CLI and test
- Rollback procedures must be exact strings: `mv docs/roadmap.md.archived docs/roadmap.md` and `mv harness.config.json.pre-migration harness.config.json` — operators copy-paste these during incidents
- Document-code coherence is enforced: if roadmap migration CLI changes, this test ensures documentation stays in sync; skipping these checks risks stale operator procedures

## Interface Contract

```ts

```

## Dependency Slice

```
import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
```

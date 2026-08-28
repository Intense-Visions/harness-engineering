---
schemaVersion: 1
module: 'packages/core/src/constraints/sharing'
sourceHash: 'fcaad406c35cf678994734b96125d861ccffaba31ba49d7e40c325a605e358d7'
compiledAt: '2026-08-28T01:22:10.331Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'bundle.ts',
    'index.ts',
    'lockfile.ts',
    'manifest.ts',
    'merge.ts',
    'remove.ts',
    'types.ts',
    'write-config.ts',
  ]
---

## Summary

The `constraints/sharing` module enables constraint bundle publishing and adoption. It provides a complete workflow for extracting constraint configurations from a harness project, packaging them as versioned bundles with metadata, and merging those bundles into other projects' configs while tracking contributions for safe removal. Core operations: bundle extraction via dot-path navigation, manifest validation, deep merge with section-specific semantics and conflict detection, lockfile-based provenance tracking, and precise reversal of contributions using tracked keys.

## Invariants

- Silent omission on missing paths — dot-path resolution returns undefined for missing segments; extractBundle skips them without error (enables partial config exports).
- Bundle schemas always validated — extractBundle validates output against BundleSchema before returning; invalid bundles immediately fail (prevents downstream corruption).
- Section-specific merge semantics — Each constraint type has distinct merge rules (layers/forbidden imports: match by key then conflict on difference; boundaries/architecture/security: union/merge with per-category conflict detection). Cannot use generic deep-merge.
- Conflicts surfaced alongside config — deepMergeConstraints returns both the merged config AND conflict reports; conflicts are advisory (non-blocking), allowing partial adoption.
- Order-insensitive array equality — stringArraysEqual() sorts before comparing (allowedDependencies and disallow arrays must match regardless of order).
- Deep equality requires recursion — comparison must handle nested objects and arrays recursively to catch structural conflicts in architecture thresholds/modules.
- Contributions tracked by key — removeContributions uses contribution keys (e.g., layer names, rule IDs, 'modulePath:category') to identify what to delete, not full values (enables safe removal even if config evolved).
- Lockfile missing ≠ error — readLockfile returns { ok: true, value: null } for missing files (expected state on first install), distinguishing from parse/schema failures.
- Immutable updates — addProvenance/removeProvenance return new lockfile objects; removeContributions returns new config (no mutation, safe for composition).
- Manifest parsing is caller's responsibility — parseManifest only validates pre-parsed objects (YAML→JSON happens in CLI layer); keeps parsing concerns separated.

## Interface Contract

```ts
export Bundle
export BundleConstraints
export BundleConstraintsSchema
export BundleSchema
export ConflictReport
export Contributions
export ContributionsSchema
export Lockfile
export LockfilePackage
export LockfilePackageSchema
export LockfileSchema
export Manifest
export ManifestSchema
export MergeResult
export SharableBoundaryConfigSchema
export SharableForbiddenImportSchema
export SharableLayerSchema
export SharableSecurityRulesSchema
export addProvenance
export deepMergeConstraints
export extractBundle
export parseManifest
export readLockfile
export removeContributions
export removeProvenance
export writeConfig
export writeLockfile
```

## Dependency Slice

```
import { Err, Ok, Result } from '../../shared/result'
import { Bundle, BundleConstraints, BundleSchema, Contributions, Lockfile, LockfilePackage, LockfileSchema, Manifest, ManifestSchema } from './types'
import { writeConfig } from './write-config'
import { Result } from '@harness-engineering/types'
import * as fs from 'fs/promises'
import * as fs from 'node:fs/promises'
import { z } from 'zod'
```

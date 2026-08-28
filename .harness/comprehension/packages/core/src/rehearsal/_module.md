---
schemaVersion: 1
module: 'packages/core/src/rehearsal'
sourceHash: '4d8fc87f3d9b998f5cc9868e27387cd69c27ad23586fd90c871dc4a1599935ec'
compiledAt: '2026-08-28T01:22:10.460Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['catalog.test.ts', 'catalog.ts', 'index.ts', 'scoring.test.ts', 'scoring.ts', 'types.ts']
---

## Summary

The `rehearsal` module provides a deterministic scoring system for evaluating whether an agent successfully detected and recovered from deliberately-planted failure scenarios. It has two layers: a catalog layer (`catalog.ts`) that discovers and validates fixture manifests from the filesystem, and a scoring layer (`scoring.ts`) that grades recovery attempts against manifests' rubrics. Each fixture directory contains a `rehearsal.json` describing one planted failure (e.g., hardcoded secrets, layer violations) with expected check/fix instructions. Recovery scoring is pure, deterministic, and offline—no IO or LLM involved. Scoring maps five weighted dimensions (detected, correctCheck, fixed, noCollateral, identifiedFailureMode) to tiers: pass (≥80), partial (50–79), fail (<50). Bad fixtures degrade gracefully; the catalog skips malformed entries and returns empty when the fixtures root is absent.

## Invariants

- ID ↔ directory name bijection: a fixture's manifest ID must exactly match its parent directory name; violations rejected at load time to ensure `rehearse score --fixture <id>` resolves uniquely
- Manifest schema is authoritative: all fixtures pass Zod schema validation; schema-invalid fixtures return errors and never load
- Bad fixtures degrade gracefully: loadCatalog skips directories without valid manifests and returns empty list when fixtures root is absent; broken fixtures surface only when explicitly loaded via findFixture
- Detection credit is conditional on match: if an agent names a failure mode differing from the manifest's expected mode, detection credit is withheld—confidence in wrong diagnosis is penalized
- Check citation is normalized but not lenient: 'check-security' and 'harness check-security' are equivalent (prefix-stripped), but substring matches (e.g., bare 'check' for 'check-arch') do not credit
- Collateral damage always costs: the noCollateral dimension penalizes any collateral damage, even on otherwise perfect recoveries
- Tiers are banded, not graduated: score bands are absolute (≥80 pass, 50–79 partial, <50 fail); no continuous gradient per tier
- Result types prevent throws: all I/O operations (loadManifest, findFixture) return Result<T, Error>, never throw—callers decide how to handle missing/malformed data

## Interface Contract

```ts
export *
export MANIFEST_FILENAME
export REHEARSAL_WEIGHTS
export findFixture
export loadCatalog
export loadManifest
export rehearsalTierFor
export scoreRecovery
```

## Dependency Slice

```
import { Err, Ok, Result } from '../shared/result'
import { MANIFEST_FILENAME, findFixture, loadCatalog, loadManifest } from './catalog'
import { REHEARSAL_WEIGHTS, rehearsalTierFor, scoreRecovery } from './scoring'
import { RecoveryRecord, RehearsalManifest, RehearsalManifestSchema, RehearsalScore, RehearsalTier, ScoreDimension } from './types'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
```

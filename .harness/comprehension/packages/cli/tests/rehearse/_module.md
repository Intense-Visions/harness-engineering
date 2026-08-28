---
schemaVersion: 1
module: 'packages/cli/tests/rehearse'
sourceHash: '053591f3f19a60c4a1f63647effa91be40f87de151309da7e6a804b72d8f97cf'
compiledAt: '2026-08-28T01:22:09.884Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['fixtures-catalog.test.ts']
---

## Summary

The `rehearse` test module validates the wiring of shipped rehearsal fixtures used by the CLI to help engineers practice fixing common harness check failures. It tests that the four shipped fixtures (broken-doc-link, dependency-cycle, hardcoded-secret, layer-violation) load from disk and parse correctly, each fixture declares the correct harness check it exercises (check-docs, check-arch, or check-security), and the scoring and tiering logic grades recoveries consistently: a textbook-clean recovery (detected → identified → fixed → no collateral) scores 100 and tiers 'pass'; a complete miss scores below 50 and tiers 'fail'. This is a fixture wiring test that guards against manifest parsing errors or drift between a fixture's declared expectedCheck and its actual rubric, ensuring the CLI can serve valid rehearsal scenarios at runtime.

## Invariants

- The four expected fixtures by ID must exist under templates/rehearsal-fixtures/ and load without error
- Each fixture's expectedCheck field must match its prescribed harness check command (e.g., 'dependency-cycle' → 'harness check-arch')
- scoreRecovery(manifest, record) must return tier='pass' and score=100 when a recovery correctly detects, identifies, cites, fixes, and causes no collateral damage
- scoreRecovery must return tier='fail' and score<50 for a recovery that neither detects nor fixes the problem
- loadCatalog and findFixture must reliably round-trip fixture manifests from disk without parsing errors

## Interface Contract

```ts

```

## Dependency Slice

```
import { RecoveryRecord, findFixture, loadCatalog, scoreRecovery } from '@harness-engineering/core'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
```

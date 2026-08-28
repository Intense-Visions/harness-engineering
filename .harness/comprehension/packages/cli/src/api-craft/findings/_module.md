---
schemaVersion: 1
module: 'packages/cli/src/api-craft/findings'
sourceHash: '9e46074331b3a167fbd6f131a4d30b72ec36e20fef2fa5fc34fd1dab57a8ce2f'
compiledAt: '2026-08-28T01:22:08.712Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['schema.ts']
---

## Summary

`packages/cli/src/api-craft/findings` defines the finding schema for the api-craft skill—a 3-axis (Tier/Impact/Confidence) critique system for API surface analysis. It exports ApiFinding (individual critiques keyed to API artifacts with stable API-R\d{3} codes, severity axes, target location, message, and rubric citation) and ApiCraftOutput (findings list paired with ApiCraftSummary metadata tracking phase coverage, LLM cost, rubric appliance, and file-scan statistics). Structurally mirrors the craft family pattern (cli-ergonomics-craft, docs-craft), all using shared Tier/Impact/Confidence axes from packages/cli/src/shared/craft/findings/axes.js.

## Invariants

- v1 phase constraint: ApiFinding.phase is hardcoded to 'critique'; POLISH and BENCHMARK phases are architectural deferments, not runtime branches.
- Shared axes import: Tier, Impact, Confidence are singletons from shared/craft, not redefined here; enforces axis consistency across all craft skills.
- Stable code namespace: ApiFinding.code must match API-R\d{3} regex; codes are stable anchors for downstream tooling (dashboards, suppressions, trend analysis).
- Dual-path targets: target.file (absolute) + target.relative (display) must both populate; relative is user-facing in reports.
- Rubric traceability: Every finding must cite its source (rubricId + source field); enables audit trails back to the ruleset.
- Priority derivation: derived.priority is compute-once-store (not lazy); downstream consumers can sort without recomputing tier/impact/confidence.
- File counts pair: ApiCraftSummary.counts tracks both scanned and skipped files; omitting either loses coverage signal.
- ApiCraftSummary.phaseRun is a 1-tuple ['critique'] in v1; future phases extend this tuple, not the phase field itself.

## Interface Contract

```ts
export Confidence
export Impact
export Tier
```

## Dependency Slice

```
import { Confidence, Impact, Tier } from '../../shared/craft/findings/axes.js'
import { ApiSurfaceKind } from '../catalog/rubrics/types.js'
```

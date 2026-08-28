---
schemaVersion: 1
module: 'packages/cli/src/design-craft/findings'
sourceHash: '20ed257def1ae4b6d31d4505e18e262ca1ad12af80dd386d62102939b86d035d'
compiledAt: '2026-08-28T01:22:09.038Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['derived.ts', 'schema.ts']
---

## Summary

The `packages/cli/src/design-craft/findings` module defines the type contract for design-craft skill output—findings from critique/polish phases and benchmark scores. It exports `CraftFinding` (verdicts with code, phase, tier/impact/confidence axes, target, message, and rubric/pattern citation), `BenchmarkScore` (5 aesthetic dimensions scored 0–100 against exemplars), and `AwardBar` (machine-derived award-tier verdict computed deterministically in TypeScript from radar + exemplar floors). The top-level `DesignCraftOutput` aggregates findings, scores, and metadata. The module re-exports Tier/Impact/Confidence axes from shared/craft and maintains historical import paths via a re-export shim. It honors ADR 0018 (confidence first-class), ADR 0019 (3-axis preservation, never collapsed), and ADR 0020 (rubric/pattern citations for catalog growth).

## Invariants

- Three-axis preservation: tier, impact, confidence remain independent first-class fields; never collapsed at schema layer
- Confidence honesty required: emitted on every LLM-judgment surface; silently upgrading/dropping violates ADR 0018
- Priority is sole derived sortable: derived.priority is only deterministic derived surface; raw axes stay authoritative
- Award verdict lives in TypeScript: never LLM-emitted; computed deterministically by computeAwardBar from radar + exemplar floors
- Responsive gate veto: defective responsive result forces not-cleared regardless of radar; not-evaluated means downstream MUST NOT read cleared as mobile-ready
- Confidence floor enforcement: any dimension below configured threshold forces verdict to indeterminate; high-score uncertainty must never certify award tier
- Citation tracking: every finding records rubric/pattern ID and source for catalog growth signal
- MVP phase 1 scope: only findings populated by critique; scores is empty array stub; upgradeOffer omitted; vision-mode/POLISH fields unfilled for future vertical slices
- Backward compatibility via re-export: historical import paths intact; axes re-exported from derived.ts shim

## Interface Contract

```ts
export Confidence
export Impact
export Tier
export derivePriority
```

## Dependency Slice

```
import { ResponsiveGateResult } from '../../responsive/index.js'
import { Confidence, Impact, Tier } from '../../shared/craft/findings/axes.js'
```

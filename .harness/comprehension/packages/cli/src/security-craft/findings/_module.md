---
schemaVersion: 1
module: 'packages/cli/src/security-craft/findings'
sourceHash: 'c267f76af73284f7a81834703d661ad21bac64b69502ca1a3e9c66170699c74f'
compiledAt: '2026-08-28T01:22:09.331Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['schema.ts']
---

## Summary

The `security-craft/findings` module defines the shape and contract for security findings emitted by the security-craft pipeline. It's a pure schema module with a single file (`schema.ts`) that exports three primary interfaces: **SecurityFinding** is the core domain type—a single security critique identified by AST signal matching (HTTP handlers, middleware, auth APIs, privileged ops, data egress, raw queries, secret handling). Each finding carries a stable SEC-R code, three-axis severity (tier/impact/confidence), navigation metadata (file, line, AST marker), a rubric citation, and a computed priority. **SecurityCraftOutput** bundles findings with a summary: phase metadata ('critique' only), LLM telemetry, and signal counts. The module re-exports severity axes (Tier, Impact, Confidence) from shared craft types, maintaining the ADR-0019 three-axis model across the craft pipeline. Silent filtering of zero-signal files is the FP-management strategy.

## Invariants

- Code format: Finding code must match SEC-R\d{3} (stable namespace for navigation and tooling)
- Line numbers are 1-based: Both SecuritySignal.line and SecurityFinding.target.line for accurate editor navigation
- Phase is literal: phase: 'critique' only; no other phases (architecture constraint per proposal)
- SignalKind is closed: Exactly 7 values; AST matchers must route signals to one of: http-handler, middleware, auth-api, privileged-op, data-egress, raw-query, secret-handling
- Files with zero signals are dropped: Not recorded in findings; silent skip prevents FP noise per proposal Decisions #2
- Mode and phaseRun are fixed: Always 'fast' and ['critique'] respectively (architecture determinism, not user-configurable)
- Severity comes from shared axes: Tier, Impact, Confidence are defined externally in shared/craft/findings/axes.js; findings must use those values only

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

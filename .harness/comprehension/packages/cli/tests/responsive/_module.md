---
schemaVersion: 1
module: 'packages/cli/tests/responsive'
sourceHash: '9c680198bf7f843e99c4c279eebb291872bfbbd0c48209aa7b0793ebc350e384'
compiledAt: '2026-08-28T01:22:09.895Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['probe.test.ts']
---

## Summary

The `packages/cli/tests/responsive` module tests a mobile responsive gate that validates whether components render correctly at the 390px mobile viewport. It reports two classes of defects: horizontal overflow (content exceeding viewport width beyond a configurable tolerance) and unreachable navigation (neither primary nav nor menu toggle visible). The gate returns `clean`, `defective`, or `not-evaluated` based on collected browser metrics.

## Invariants

- Default config is 390px viewport + 1px overflow tolerance; tolerance comparison uses strictly-greater (not >=), allowing 1px sub-pixel jitter
- Desktop renders (wider than configured viewport) must be rejected as not-evaluated to prevent false positives from desktop screenshots
- Navigation accessibility is OR-gated: hidden primary nav + visible menu toggle = reachable; both hidden = unreachable-nav defect
- Multiple defects coexist and are reported together; gate does not short-circuit on first defect
- Malformed or misaligned metrics (NaN, undefined, viewport wider than configured) yield not-evaluated, never a pass
- Configuration is resolved via merging: resolveResponsiveGateConfig() overlays user overrides with defaults, preserving unspecified keys

## Interface Contract

```ts

```

## Dependency Slice

```
import { DEFAULT_RESPONSIVE_GATE_CONFIG, ResponsiveMetrics, computeResponsiveGate, resolveResponsiveGateConfig } from '../../src/responsive/probe.js'
import { describe, expect, it } from 'vitest'
```

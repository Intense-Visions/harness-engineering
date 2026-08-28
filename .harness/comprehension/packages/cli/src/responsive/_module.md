---
schemaVersion: 1
module: 'packages/cli/src/responsive'
sourceHash: 'a5d19ff9fe204b4f622a6684f418868ae99b60de9864aee1a216d9d2a626d15c'
compiledAt: '2026-08-28T01:22:09.315Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts', 'probe.ts']
---

## Summary

`responsive` is a mechanical floor-layer gate for mobile responsiveness validation in the design-craft pipeline. It takes rendered layout metrics (scrollWidth, viewport dimensions, nav visibility flags) and detects two classes of mobile defects: horizontal overflow and unreachable primary navigation. The gate produces a pass/fail verdict composed with the award-bar's aesthetic judgment. It is deterministic, LLM-free, and delegates rendering to callers (or the Playwright MCP).

## Invariants

- Mobile-only certification: metrics rendered at desktop width (wider than configured viewport) → not-evaluated, not clean. The configured viewport width is the test criterion, not advisory.
- Malformed input rejection: any malformed manifest (NaN numbers, non-boolean flags) → not-evaluated without defect masquerade. Input TS-checking at callers is insufficient; the floor must stay robust.
- Two exhaustive defect kinds: horizontal-overflow (scrollWidth exceeds viewportWidth + tolerance) and unreachable-nav (no visible primary nav AND no visible menu toggle). These are the only actionable layout facts the gate detects.
- Overflow tolerance absorbs sub-pixel rounding: default 1px; configurable but prevents false positives from fractional pixels while catching real overflow.
- No LLM involvement: purely mechanical detection; composed downstream with design LLM verdict, not embedded here.
- Deterministic composition: awardBar calls this gate alongside aesthetic verdict; order and merge strategy must be stable.

## Interface Contract

```ts
export DEFAULT_RESPONSIVE_GATE_CONFIG
export NOT_EVALUATED_RESPONSIVE
export ResponsiveDefect
export ResponsiveDefectKind
export ResponsiveGateConfig
export ResponsiveGateResult
export ResponsiveMetrics
export ResponsiveStatus
export computeResponsiveGate
export resolveResponsiveGateConfig
```

## Dependency Slice

```

```

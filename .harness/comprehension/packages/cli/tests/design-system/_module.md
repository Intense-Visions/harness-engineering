---
schemaVersion: 1
module: 'packages/cli/tests/design-system'
sourceHash: 'b072b32bac20e66af33c1c03b34f13faa4bd3c851c63796b17cd6bfbc65c246e'
compiledAt: '2026-08-28T01:22:09.692Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['validation.test.ts']
---

## Summary

The `packages/cli/tests/design-system` module validates Phase 7 of a design system infrastructure rollout. It ensures five design skills (system tokens, accessibility, design docs, web patterns, mobile patterns) are correctly scaffolded, publish consistent content across platforms (claude-code and gemini-cli), integrate with downstream systems (graph ingestion, impact analysis, architecture enforcement), and comply with W3C DTCG token format, WCAG AA accessibility thresholds, and platform-specific UI patterns.

## Invariants

- Platform parity is strict: each of 5 design skills must exist in both claude-code and gemini-cli with byte-identical SKILL.md and skill.yaml
- Skills are >100 lines: SKILL.md substantiveness floor prevents stub files; tests gate on line count
- Token structure is normative: all tokens.json must use $value and $type per W3C DTCG; DESIGN-001 through DESIGN-004 codes flag hardcoded value violations
- WCAG AA 4.5:1 contrast is hard floor: harness-accessibility surfaces violations as error (strict mode) or info (permissive mode)
- Design documentation requires 4 sections: DESIGN.md must include aesthetic direction, tone, anti-patterns, and platform notes
- Industry knowledge covers 8+ verticals: shared/design-knowledge/industries/ must have ≥8 YAML files with name, styles, palette, and typography sections
- Graph ingestion tests must exist: DesignIngestor.test.ts and DesignConstraintAdapter.test.ts are preconditions for constraint validation
- Platform patterns are comprehensive: mobile skill must name iOS HIG, Material Design, SwiftUI, Flutter, React Native, Compose; web must reference Tailwind and React/Vue/Svelte
- Components reference tokens, never hardcode values: harness-design-web and harness-design-mobile prohibit hardcoded color/spacing literals
- Token changes trigger impact analysis: harness-impact-analysis must recognize DesignToken and USES_TOKEN edge types for refactor visibility

## Interface Contract

```ts

```

## Dependency Slice

```
import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
import YAML from 'yaml'
```

---
schemaVersion: 1
module: 'packages/cli/tests/design-craft'
sourceHash: 'ffa7cdea61973a5b7373bb5cafff1ff5bdc0a8fd99e18f9a3be0d048987a211d'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['award-bar.test.ts', 'capture-command.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { ExemplarDefinition, RadarReference, linearEmptyListExemplar } from '../../src/design-craft/catalog/exemplars/linear-empty-list.js'
import { BenchmarkScore, Confidence, RadarDimensionName } from '../../src/design-craft/findings/schema.js'
import { MockLlmProvider } from '../../src/design-craft/llm/provider'
import { AwardBarConfig, DEFAULT_AWARD_BAR_CONFIG, applyResponsiveGate, computeAwardBar, resolveAwardBarConfig } from '../../src/design-craft/phases/award-bar.js'
import { handleDesignCraft, runCaptureCommand } from '../../src/mcp/tools/design-craft'
import { ResponsiveGateResult } from '../../src/responsive/probe.js'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
```

---
schemaVersion: 1
module: 'packages/cli/tests/design-craft'
sourceHash: 'b9a5e66706d0e5f69a19aa47ede96ef85deb9d424164d8012210b380bf615d9b'
compiledAt: '2026-08-28T01:22:09.667Z'
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

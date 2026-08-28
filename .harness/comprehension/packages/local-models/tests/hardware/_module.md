---
schemaVersion: 1
module: 'packages/local-models/tests/hardware'
sourceHash: '2dbc98e4cd549ef6ec2421a048b02a7224b5cba7e8e5efa16ecc3ef0fd472c93'
compiledAt: '2026-08-28T01:22:12.018Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['cpu.test.ts', 'detector.test.ts', 'macos.test.ts', 'nvidia.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { CpuOs, OsModule, detectCPU } from '../../src/hardware/cpu.js'
import { HardwareDetector, detectHardware } from '../../src/hardware/detector.js'
import { detectMacOS } from '../../src/hardware/macos.js'
import { OsModule, detectNVIDIA } from '../../src/hardware/nvidia.js'
import { ShellRunner } from '../../src/hardware/shell.js'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
```

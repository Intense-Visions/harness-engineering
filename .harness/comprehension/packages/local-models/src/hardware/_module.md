---
schemaVersion: 1
module: 'packages/local-models/src/hardware'
sourceHash: '9a26e8ff3a5f0c35d499dd33903a276ce8c07e65b22a29bc53986abdc46bf4d4'
compiledAt: '2026-08-28T01:22:11.965Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['cpu.ts', 'detector.ts', 'index.ts', 'macos.ts', 'nvidia.ts', 'shell.ts', 'types.ts']
---

## Interface Contract

```ts
export CpuOsModule
export DetectCPUResult
export DetectMacOSResult
export DetectNVIDIAResult
export HardwareDetectionResult
export HardwareDetectionSource
export HardwareDetectionWarning
export HardwareDetector
export HardwareDetectorOptions
export HardwareProfile
export NvidiaOsModule
export ShellResult
export ShellRunner
export defaultShellRunner
export detectCPU
export detectHardware
export detectMacOS
export detectNVIDIA
```

## Dependency Slice

```
import { OsModule, detectCPU } from './cpu.js'
import { detectMacOS } from './macos.js'
import { detectNVIDIA } from './nvidia.js'
import { ShellRunner, defaultShellRunner } from './shell.js'
import { HardwareDetectionResult, HardwareDetectionWarning, HardwareProfile } from './types.js'
import { LocalModelsHardwareOverride, LocalModelsPlatform } from '@harness-engineering/types'
import { execFile } from 'node:child_process'
import * as nodeOs from 'node:os'
import { promisify } from 'node:util'
```

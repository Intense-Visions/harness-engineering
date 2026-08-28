---
schemaVersion: 1
module: 'packages/local-models/src/hardware'
sourceHash: '9a26e8ff3a5f0c35d499dd33903a276ce8c07e65b22a29bc53986abdc46bf4d4'
compiledAt: '2026-08-28T01:22:11.965Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['cpu.ts', 'detector.ts', 'index.ts', 'macos.ts', 'nvidia.ts', 'shell.ts', 'types.ts']
---

## Summary

The `packages/local-models/src/hardware` module provides a resilient hardware-detection dispatcher for the orchestrator. It uses a four-layer resolution strategy: operator override (instant, no probing) → in-process cache (24h TTL) → platform-specific probe (macOS or NVIDIA) → CPU-only fallback (always succeeds). Each layer returns a HardwareProfile with platform, VRAM, RAM, bandwidth (GB/s), and CPU/GPU names, wrapped in HardwareDetectionResult carrying warnings and detection source. The detector never throws after construction, so it's safe to wire into orchestrator startup; platform-specific probe failures gracefully degrade to CPU detection with warnings rather than propagating errors.

## Invariants

- No-throw guarantee: After construction, detect() always returns a result; probe failures degrade to CPU with warnings, never propagate.
- Probe-then-fallback composition: probeWithFallback() catches all exceptions from platform-specific detectors and falls back to CPU, accumulating warnings from both layers.
- Cache TTL = scheduler refresh cadence: Default 24h cache (86.4M ms) aligns with spec's hardware-refresh policy; tests can override via cacheTtlMs: 0.
- Bandwidth heuristics are deliberately conservative: CPU_BANDWIDTH_TABLE assigns ballpark figures (40–460 GB/s) for ranker to estimate tokens-per-second; overestimating would bias models toward CPU.
- Override → profile coercion: Operator overrides normalize to full HardwareProfile with sensible defaults (ramGb ← vramGb if omitted; cpuName ← 'override').
- Dependency injection for testability: ShellRunner, OsModule, platform, and now() are all constructor-injectable; no static/global state.
- Cache invalidation is explicit: Tests and 'harness models refresh' call invalidate() to clear cache; otherwise cached result persists until TTL expires.
- Warning accumulation preserves root cause: When probe fails, warning carries original error message in cause field alongside high-level probe-name code.

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

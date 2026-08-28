---
schemaVersion: 1
module: 'packages/local-models/tests/hardware'
sourceHash: '2dbc98e4cd549ef6ec2421a048b02a7224b5cba7e8e5efa16ecc3ef0fd472c93'
compiledAt: '2026-08-28T01:22:12.018Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['cpu.test.ts', 'detector.test.ts', 'macos.test.ts', 'nvidia.test.ts']
---

## Summary

This module tests hardware detection for the local-models package—mapping CPU/GPU capabilities to memory bandwidth and VRAM profiles. The test suite validates three layers: (1) CPU detection maps CPU model strings to estimated memory bandwidth (DDR4→51 GB/s, DDR5→83 GB/s, server EPYC→460 GB/s) with a 40 GB/s fallback for unknown families; (2) Platform-aware dispatch routes detection to macOS or NVIDIA probes based on platform, falls back gracefully to CPU detection on probe failure, and caches results until invalidated; (3) macOS-specific detection parses Apple Silicon GPUs (M-series) and their unified-memory sizes, rejects Intel Macs as unsupported. All profiles include ISO-formatted timestamps and may include warnings capturing probe failures or mapping misses.

## Invariants

- Override is terminal: when supplied, detection skips all probes and returns it verbatim without side effects
- Fallback chain never crashes: shell probe failures produce warnings but always fall through to CPU detection with a valid profile
- Cache TTL is strict: repeated detect() calls within cache window reuse the prior result without re-invoking shell; invalidate() forces a fresh probe
- Timestamps are ISO and round-trippable: every profile's detectedAt must survive new Date(detectedAt).toISOString() === detectedAt
- CPU bandwidth is unmapped-family-safe: unknown CPU models map to 40 GB/s + a cpu_unmapped_family warning; known families match their generation (Ryzen 7000 DDR5, EPYC 9xxx 12-channel)
- macOS assumes unified memory: M-series detection reports the same value for both vramGb and ramGb; Intel Macs throw
- Warnings carry diagnostic context: probe failures include .cause (original error message) for troubleshooting
- Platform-specific detection order: darwin → macOS probe, linux → NVIDIA probe, others → CPU probe
- Shell probe invocation is observable: caching behavior must keep call count stable (2 parallel macOS calls per probe); invalidate() doubles the count on re-probe

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

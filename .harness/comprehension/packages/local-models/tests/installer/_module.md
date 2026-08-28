---
schemaVersion: 1
module: 'packages/local-models/tests/installer'
sourceHash: 'ec70eabc27b5f7f09ee4531bb573dfe50ad7d39244de22469e167c01bd13a405'
compiledAt: '2026-08-28T01:22:12.027Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['advisory.test.ts', 'errors.test.ts', 'interface.test.ts', 'ollama.test.ts']
---

## Summary

The `packages/local-models/tests/installer` module tests the installer subsystem's adapter layer—the pluggable interface for pulling local models across different backends (Ollama, vLLM, LM Studio, llama.cpp). It covers three adapter implementations: **AdvisoryInstallAdapter** (renders human-readable install commands with shell-quoting but rejects actual operations with `advisory_only` errors); **nullInstallAdapter** (null-object stub rejecting all operations with `installer_unavailable`); and **OllamaInstallAdapter** (real installer connecting to local Ollama server, streaming NDJSON progress events, and mapping domain errors to semantic codes). The test suite also validates the custom `InstallError` type for preserving codes, optional fields, nested causes, and clean JSON serialization.

## Invariants

- Error code mapping is semantic and context-aware: HTTP 404 or stream 'file does not exist' → failed_target_missing; ECONNREFUSED or 5xx → installer_unavailable; premature stream end → install_failed. Callers depend on this to decide retry/report/fallback behavior.
- Streaming protocol is strict NDJSON: each line from Ollama is one JSON object with status field ('pulling', 'downloading', 'success', 'error'). Stream ending without 'success' is a failed install even if no error was streamed.
- All adapters implement the same contract (install, evict, inspect, list), so callers don't branch on adapter type. Advisory and null adapters reject gracefully; real adapter fails on service unavailability to enable fallback cascades.
- Abort signals propagate unchanged: caller's AbortController.signal must forward verbatim into fetcher init so cancellation works end-to-end.
- InstallError JSON serialization omits undefined fields: toJSON() must not include status, target, or cause unless explicitly set. Callers checking JSON.stringify(err) for specific keys will miss optional fields never populated.
- Progress events precede completion in strict order: successful install emits pulling → progress (0..N times) → success. Callers tracking progress state assume this ordering.

## Interface Contract

```ts

```

## Dependency Slice

```
import { AdvisoryInstallAdapter } from '../../src/installer/advisory.js'
import { InstallError, isInstallError } from '../../src/installer/errors.js'
import { nullInstallAdapter } from '../../src/installer/interface.js'
import { OllamaInstallAdapter } from '../../src/installer/ollama.js'
import { InstallEvent, InstallerFetchResponse, InstallerFetcher } from '../../src/installer/types.js'
import { describe, expect, it } from 'vitest'
```

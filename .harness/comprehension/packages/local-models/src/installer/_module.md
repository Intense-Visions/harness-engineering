---
schemaVersion: 1
module: 'packages/local-models/src/installer'
sourceHash: 'df549f4132a7f7b2270e7c7ebdd2ca23648d5c786516144f525d386f5eadfd05'
compiledAt: '2026-08-28T01:22:11.978Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['advisory.ts', 'errors.ts', 'index.ts', 'interface.ts', 'ollama.ts', 'types.ts']
---

## Summary

The `installer` module defines the contract for managing local model lifecycle across heterogeneous backends via the `InstallAdapter` interface. It provides two concrete implementations: `OllamaInstallAdapter` for scriptable backends (Ollama REST API) and `AdvisoryInstallAdapter` for manual backends (LM Studio, vLLM, llama.cpp) that render copy-paste shell commands instead of automating installs. The module also defines `InstallError` for unrecoverable failures that adapters throw, distinct from in-band operation failures surfaced via `InstallResult.status`. A `nullInstallAdapter()` factory provides a safe default when LMLM is disabled.

## Invariants

- Error stratification: Unrecoverable failures throw InstallError; recoverable operation failures (install/evict) return InstallResult with status:'error' so the manager distinguishes backend-down (crash) from recoverable state (retry/reconcile).
- Advisory adapters are read-only: install() and evict() reject with advisory_only; list() returns [] (manager trusts LocalModelResolver probe for truth); inspect() rejects (manager never trusts fabricated disk sizes against budget).
- Shell-safe command rendering: AdvisoryInstallAdapter.renderCommand() POSIX-quotes model names; single-token ids [A-Za-z0-9._:/-]+ pass through unchanged so rendered commands stay idiomatic and copy-paste-safe.
- Fetcher DI contract: OllamaInstallAdapter accepts a fetcher option; tests inject a stub with pre-recorded NDJSON lines via InstallerFetchResponse.body async iterable; production adapts global fetch + ReadableStream into the same line-delimited interface.
- JSON serialization preserves discriminant: InstallError.toJSON() explicitly emits the code field so structured loggers retain the error code across JSON.stringify boundary.
- Stable error codes: install/evict failures map to stable InstallErrorCode values per types contract, enabling predictable manager branching on code-based state transitions.

## Interface Contract

```ts
export AdvisoryBackend
export AdvisoryInstallAdapter
export AdvisoryInstallAdapterOptions
export AdvisoryRenderRequest
export EvictRequest
export InspectRequest
export InstallAdapter
export InstallError
export InstallErrorCode
export InstallErrorJson
export InstallErrorOptions
export InstallEvent
export InstallRequest
export InstallResult
export InstallerFetchResponse
export InstallerFetcher
export ListRequest
export OllamaInstallAdapter
export OllamaInstallAdapterOptions
export RemoteModelInfo
export isInstallError
export nullInstallAdapter
```

## Dependency Slice

```
import { InstallError } from './errors.js'
import { EvictRequest, InspectRequest, InstallAdapter, InstallErrorCode, InstallEvent, InstallRequest, InstallResult, InstallerFetchResponse, InstallerFetcher, ListRequest, RemoteModelInfo } from './types.js'
```

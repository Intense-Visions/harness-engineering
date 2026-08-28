---
schemaVersion: 1
module: 'packages/local-models/src/huggingface'
sourceHash: '0c6867cde49c0aa45e0a75465093997ecfac57fa1f52370d9935677b1de02492'
compiledAt: '2026-08-28T01:22:11.955Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['cache.ts', 'client.ts', 'index.ts', 'types.ts']
---

## Summary

The `huggingface` module is a typed client library for querying HuggingFace model metadata and caching results. It has three layers: **Client** (`client.ts`) wraps HF's `/api/models` and `/api/models/:repo` REST endpoints, mapping all failures to `HuggingFaceClientError` with stable error codes for deterministic branching. **Cache** (`cache.ts`) provides dual-layer (in-memory + atomic disk) TTL caching with 24-hour default expiry and schema versioning to prevent serving stale data on algorithm changes. **Types** (`types.ts`) define narrow shapes (`HuggingFaceModel`, `HuggingFaceModelDetail`) that the ranker actually needs—HF response fields beyond these are parsed and dropped. The module serves Phase 2a–d of the local model lifecycle manager to avoid redundant API calls for trending models and GGUF quant manifests.

## Invariants

- Error codes are the control-flow contract—callers must branch on HuggingFaceClientError.code, not status or message, so network/auth/parse failures remain deterministic.
- Query params serialize in stable sorted order so cache keys are deterministic regardless of input order (buildQueryString, line 115–123).
- TTL window is exclusive of the boundary—an entry whose age equals ttlMs is considered stale (line 155: age >= this.ttlMs returns undefined).
- Cache disk writes are atomic via tmp+rename—a crash between write and rename leaves the previous good file intact with no partial/corrupt state persisting (line 180–186).
- Cache file version must match on read—schema changes require bumping CACHE_VERSION or stale data is silently cleared (line 135).
- Empty strings in token/env fallback are treated as unset so process.env.HF_TOKEN can be passed directly without guards (line 74–78).
- Fetcher is the sole I/O seam—all network calls go through the injected fetcher, never raw fetch, enabling deterministic test stubs.
- The client never throws unhandled HTTP status—all non-2xx responses map through statusToCode() to HuggingFaceClientError; no raw failures escape.

## Interface Contract

```ts
export CacheEntry
export CacheFilesystem
export DEFAULT_CACHE_PATH
export HuggingFaceCache
export HuggingFaceCacheOptions
export HuggingFaceClient
export HuggingFaceClientError
export HuggingFaceClientOptions
export HuggingFaceErrorCode
export HuggingFaceFetchResponse
export HuggingFaceFetcher
export HuggingFaceListOptions
export HuggingFaceModel
export HuggingFaceModelDetail
```

## Dependency Slice

```
import { HuggingFaceClientOptions, HuggingFaceErrorCode, HuggingFaceFetchResponse, HuggingFaceFetcher, HuggingFaceListOptions, HuggingFaceModel, HuggingFaceModelDetail } from './types.js'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
```

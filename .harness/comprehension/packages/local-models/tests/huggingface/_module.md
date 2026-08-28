---
schemaVersion: 1
module: 'packages/local-models/tests/huggingface'
sourceHash: '5a17a7ec5547be4195194e0306ada33e6648882ec079a0952d5a2343a348ab1b'
compiledAt: '2026-08-28T01:22:12.002Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['cache.test.ts', 'client.test.ts']
---

## Summary

The `packages/local-models/tests/huggingface` module tests two core components for HuggingFace API integration. HuggingFaceCache is a TTL-based in-memory cache with disk persistence via atomic tmp+rename writes; it gracefully degrades on corrupt files or schema mismatches by emitting warnings. HuggingFaceClient wraps the HuggingFace API with deterministic query parameters (sorted, URL-encoded), Bearer token injection from config or HF_TOKEN env, and HTTP status code mapping to semantic errors (HF_NOT_FOUND, HF_UNAUTHORIZED, HF_UNAVAILABLE, HF_NETWORK). Tests use mocked filesystems and fetchers to avoid I/O and real API calls; fixture JSON files provide test data for model responses and detail payloads.

## Invariants

- TTL boundary is inclusive: age === ttlMs means entry is stale (not just age > ttlMs)
- Cache persistence is atomic via temporary file + rename, never direct overwrite
- load() is idempotent: repeated calls do not re-read disk; first read is cached in-memory
- Query parameters are URL-encoded and sorted alphabetically; order is deterministic for OT tracing
- Bearer auth: explicit token parameter takes precedence over HF_TOKEN env var; header omitted only if neither exists
- HTTP error mapping: 404→HF_NOT_FOUND, 401/403→HF_UNAUTHORIZED, 429/5xx→HF_UNAVAILABLE, network rejection→HF_NETWORK
- Malformed JSON or schema version mismatch yields empty cache state + warning emission, never thrown error
- Accept header is always 'application/json' in API requests

## Interface Contract

```ts

```

## Dependency Slice

```
import { CacheFilesystem, HuggingFaceCache } from '../../src/huggingface/cache.js'
import { HuggingFaceClient, HuggingFaceClientError } from '../../src/huggingface/client.js'
import { HuggingFaceFetchResponse, HuggingFaceFetcher } from '../../src/huggingface/types.js'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
```

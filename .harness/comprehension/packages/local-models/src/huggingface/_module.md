---
schemaVersion: 1
module: 'packages/local-models/src/huggingface'
sourceHash: '0c6867cde49c0aa45e0a75465093997ecfac57fa1f52370d9935677b1de02492'
compiledAt: '2026-08-28T01:22:11.955Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['cache.ts', 'client.ts', 'index.ts', 'types.ts']
---

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

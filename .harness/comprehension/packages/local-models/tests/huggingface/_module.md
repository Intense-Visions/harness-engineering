---
schemaVersion: 1
module: 'packages/local-models/tests/huggingface'
sourceHash: '5a17a7ec5547be4195194e0306ada33e6648882ec079a0952d5a2343a348ab1b'
compiledAt: '2026-08-28T01:22:12.002Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['cache.test.ts', 'client.test.ts']
---

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

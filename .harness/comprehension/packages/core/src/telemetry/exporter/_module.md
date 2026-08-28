---
schemaVersion: 1
module: 'packages/core/src/telemetry/exporter'
sourceHash: 'ae9249ad310d9626785a3026caae65bc95228e60ab58ba940b104e2c7a68b0bf'
compiledAt: '2026-08-28T01:22:10.658Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['index.ts', 'otlp-http.test.ts', 'otlp-http.ts', 'types.ts']
---

## Interface Contract

```ts
export OTLPExporter
export OTLPExporterOptions
export SpanAttributes
export SpanKind
export TraceSpan
```

## Dependency Slice

```
import { OTLPExporter } from './otlp-http'
import { SpanKind, TraceSpan } from './types'
import * as http from 'node:http'
import { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```

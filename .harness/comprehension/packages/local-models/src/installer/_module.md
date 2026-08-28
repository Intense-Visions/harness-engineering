---
schemaVersion: 1
module: 'packages/local-models/src/installer'
sourceHash: 'df549f4132a7f7b2270e7c7ebdd2ca23648d5c786516144f525d386f5eadfd05'
compiledAt: '2026-08-28T01:22:11.978Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['advisory.ts', 'errors.ts', 'index.ts', 'interface.ts', 'ollama.ts', 'types.ts']
---

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

---
schemaVersion: 1
module: 'packages/local-models/tests/installer'
sourceHash: 'ec70eabc27b5f7f09ee4531bb573dfe50ad7d39244de22469e167c01bd13a405'
compiledAt: '2026-08-28T01:22:12.027Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['advisory.test.ts', 'errors.test.ts', 'interface.test.ts', 'ollama.test.ts']
---

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

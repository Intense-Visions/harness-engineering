---
schemaVersion: 1
module: 'packages/cli/tests/docs-publish'
sourceHash: '4d1c1493dfef280f6f874048069c7759fdcd0550bacb073e12114543e4cb1c65'
compiledAt: '2026-08-28T01:22:09.705Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  ['adf.test.ts', 'commands.test.ts', 'confluence.test.ts', 'resolver.test.ts', 'verify.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { runDocsPublishAttachMedia } from '../../src/commands/docs-publish/attach-media'
import { runDocsPublishDraft } from '../../src/commands/docs-publish/draft'
import { runDocsPublishPageTree } from '../../src/commands/docs-publish/page-tree'
import { runDocsPublishVerifyRender } from '../../src/commands/docs-publish/verify-render'
import { HarnessConfig } from '../../src/config/schema'
import { mediaInline, mediaSingle } from '../../src/docs-publish/connectors/adf'
import { ConfluenceConnector } from '../../src/docs-publish/connectors/confluence'
import { HttpClient, HttpResponse } from '../../src/docs-publish/interface'
import { PlaywrightImporter, verifyRender } from '../../src/docs-publish/render/verify'
import { resolveDocsPublishConnector } from '../../src/docs-publish/resolver'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```

---
schemaVersion: 1
module: 'packages/cli/src/commands/docs-publish'
sourceHash: 'e15c812d23f37fdb76a1731f9b2e918badac2d31c953e63d3693b0283ac1cc44'
compiledAt: '2026-08-28T01:22:08.809Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['attach-media.ts', 'draft.ts', 'index.ts', 'page-tree.ts', 'verify-render.ts']
---

## Interface Contract

```ts
export createDocsPublishCommand
```

## Dependency Slice

```
import { resolveConfig } from '../../config/loader'
import { AttachMediaInput, AttachMediaResult, DraftHandle, DraftInput, PageTreeInput, PageTreeNode, PageTreeResult, VerifyRenderResult, resolveDocsPublishConnector } from '../../docs-publish'
import { OutputMode } from '../../output/formatter'
import { logger } from '../../output/logger'
import { CLIError, ExitCode } from '../../utils/errors'
import { resolveOutputMode } from '../../utils/output'
import { createAttachMediaCommand } from './attach-media'
import { createDraftCommand } from './draft'
import { createPageTreeCommand } from './page-tree'
import { createVerifyRenderCommand } from './verify-render'
import { Err, Ok, Result } from '@harness-engineering/core'
import { Command } from 'commander'
import * as fs from 'fs'
```

---
schemaVersion: 1
module: 'packages/cli/src/commands/docs-publish'
sourceHash: '2a5d281a747e1c993947fa89ed7143ebef2e0ca73c358d1ef1180673c68ecbb4'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'attach-media.ts',
    'commands-success.test.ts',
    'draft.ts',
    'index.ts',
    'page-tree.ts',
    'verify-render.ts',
  ]
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
import { createAttachMediaCommand, runDocsPublishAttachMedia } from './attach-media'
import { createDraftCommand, runDocsPublishDraft } from './draft'
import { createPageTreeCommand, runDocsPublishPageTree } from './page-tree'
import { createVerifyRenderCommand } from './verify-render'
import { Err, Ok, Result } from '@harness-engineering/core'
import { Command } from 'commander'
import * as fs from 'fs'
import from 'node:fs'
import from 'node:os'
import from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```

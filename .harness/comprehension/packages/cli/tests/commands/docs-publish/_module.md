---
schemaVersion: 1
module: 'packages/cli/tests/commands/docs-publish'
sourceHash: '587906549b0ba557ef871e0f2257141da493f416244bb07c33a0aa8b4715d4ac'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['draft-cov544b.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { createDraftCommand, runDocsPublishDraft } from '../../../src/commands/docs-publish/draft'
import { Command } from 'commander'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```

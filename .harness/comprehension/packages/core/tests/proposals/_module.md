---
schemaVersion: 1
module: 'packages/core/tests/proposals'
sourceHash: '85f04143c705a41bc7e0e9c4cbb6f80fc81ee734e5f566b990b2f0ca7ebc8c11'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['store.test.ts', 'usage.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { ProposalConflictError, ProposalNotFoundError, createModelProposal, createProposal, getProposal, listProposals, updateProposal } from '../../src/proposals/store'
import { deriveSkillUsage } from '../../src/proposals/usage'
import { ModelProposalContent } from '@harness-engineering/types'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```

---
schemaVersion: 1
module: 'packages/core/tests/proposals'
sourceHash: '735f64190869c5b8245923d76e3a01a2c8443e19a0cb691a4f741c35a65ef720'
compiledAt: '2026-08-28T01:22:10.886Z'
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

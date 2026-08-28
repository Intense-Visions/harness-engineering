---
schemaVersion: 1
module: 'packages/cli/tests/mcp/resources'
sourceHash: '447895b0f14f1a4ea0035d52f4a08f4014b3ec547205df6bc1f2e3256445f8a3'
compiledAt: '2026-08-28T01:22:09.800Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'business-knowledge.test.ts',
    'graph.test.ts',
    'learnings.test.ts',
    'project.test.ts',
    'rules.test.ts',
    'skills.test.ts',
    'state.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { getBusinessKnowledgeResource } from '../../../src/mcp/resources/business-knowledge'
import { getEntitiesResource, getGraphResource, getRelationshipsResource } from '../../../src/mcp/resources/graph.js'
import { getLearningsResource } from '../../../src/mcp/resources/learnings'
import { getProjectResource } from '../../../src/mcp/resources/project'
import { getRulesResource } from '../../../src/mcp/resources/rules'
import { getSkillsResource } from '../../../src/mcp/resources/skills'
import { getStateResource } from '../../../src/mcp/resources/state'
import from '@harness-engineering/graph'
import * as fs from 'fs'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```

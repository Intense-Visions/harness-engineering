---
schemaVersion: 1
module: 'packages/cli/src/mcp/resources'
sourceHash: '3d7a5fbcef9e529e95d8a12a09bcafaabb36e3638f2cde3285c96b92191ffa88'
compiledAt: '2026-08-28T01:22:09.262Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'business-knowledge.ts',
    'graph.ts',
    'learnings.ts',
    'project.ts',
    'rules.ts',
    'skills.ts',
    'state.ts',
  ]
---

## Interface Contract

```ts
export getBusinessKnowledgeResource
export getEntitiesResource
export getGraphResource
export getLearningsResource
export getProjectResource
export getRelationshipsResource
export getRulesResource
export getSkillsResource
export getStateResource
```

## Dependency Slice

```
import from '../../shared/state-events.js'
import { loadGraphStore } from '../utils/graph-loader.js'
import from '@harness-engineering/core'
import from '@harness-engineering/graph'
import * as fs from 'fs'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as path from 'path'
import * as yaml from 'yaml'
```

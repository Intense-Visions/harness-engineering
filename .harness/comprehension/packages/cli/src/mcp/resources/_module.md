---
schemaVersion: 1
module: 'packages/cli/src/mcp/resources'
sourceHash: '9e1ac6cb8f5fb1f1168b38c4634c360031fa11eaaa0dca96066be29a1b7c7122'
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
import { describeStaleBuildError } from '../stale-build.js'
import { loadGraphStore } from '../utils/graph-loader.js'
import from '@harness-engineering/core'
import from '@harness-engineering/graph'
import * as fs from 'fs'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as path from 'path'
import * as yaml from 'yaml'
```

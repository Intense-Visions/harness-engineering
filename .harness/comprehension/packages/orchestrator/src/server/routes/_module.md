---
schemaVersion: 1
module: 'packages/orchestrator/src/server/routes'
sourceHash: '2f3f4e1c1480a6b44dd2f014a09d7e79baf3aedeab4487f5234cd1e7b2b2f9db'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'analyses.ts',
    'analyze.test.ts',
    'analyze.ts',
    'auth.test.ts',
    'auth.ts',
    'chat-proxy.ts',
    'dispatch-actions.test.ts',
    'dispatch-actions.ts',
    'interactions.ts',
    'local-model.ts',
    'maintenance.ts',
    'plans.ts',
    'roadmap-actions.ts',
    'sessions.ts',
    'streams.ts',
  ]
---

## Interface Contract

```ts
export MaintenanceHistoryEntry
export handleAnalysesRoute
export handleAnalyzeRoute
export handleAuthRoute
export handleChatProxyRoute
export handleDispatchActionsRoute
export handleInteractionsRoute
export handleLocalModelRoute
export handleLocalModelsRoute
export handleMaintenanceRoute
export handlePlansRoute
export handleRoadmapActionsRoute
export handleSessionsRoute
export handleStreamsRoute
export mapContentBlock
export toMaintenanceHistoryEntry
```

## Dependency Slice

```
import { TokenStore } from '../../auth/tokens'
import { AnalysisArchive } from '../../core/analysis-archive'
import { InteractionQueue } from '../../core/interaction-queue'
import { StreamRecorder } from '../../core/stream-recorder'
import { MaintenanceReporter } from '../../maintenance/reporter'
import { MaintenanceScheduler } from '../../maintenance/scheduler'
import { RunResult } from '../../maintenance/types'
import { OrchestratorServer } from '../http'
import { readBody } from '../utils'
import { readBody } from '../utils.js'
import { handleAnalyzeRoute } from './analyze'
import { handleDispatchActionsRoute } from './dispatch-actions'
import { ConflictError, NewFeatureInput, applyRoadmapDiff, createTrackerClient, loadProjectRoadmapMode, loadTrackerClientConfigFromProject, makeTrackerConflictBody, resolveRoadmapStoreForFile } from '@harness-engineering/core'
import { IntelligencePipeline, manualToRawWorkItem, scoreToConcernSignals } from '@harness-engineering/intelligence'
import { AuthTokenPublic, AuthTokenPublicSchema, BridgeKindSchema, Issue, LocalModelStatus, MaintenanceHistoryEntry, NamedLocalModelStatus, TokenScopeSchema } from '@harness-engineering/types'
import { ChildProcess, spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import * as fs from 'node:fs/promises'
import http, { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import * as path, { join } from 'node:path'
import * as readline from 'node:readline'
import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
```

---
schemaVersion: 1
module: 'packages/core/tests/roadmap'
sourceHash: '95807281b2027ca3fa0bc250f6843c485b6c83487890333710faa877e11acf82'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'assignee-lifecycle.test.ts',
    'derive-repo.test.ts',
    'fixtures.ts',
    'github-issues-state-guard.test.ts',
    'github-issues.test.ts',
    'groups-write-paths.test.ts',
    'heading.test.ts',
    'health.test.ts',
    'load-mode.test.ts',
    'load-tracker-client-config.test.ts',
    'mode-public-surface.test.ts',
    'mode.test.ts',
    'parse-block.test.ts',
    'parse-extended.test.ts',
    'parse-groups.test.ts',
    'parse.test.ts',
    'pilot-scoring-file-less.test.ts',
    'pilot-scoring-mode-stub.test.ts',
    'pilot-scoring.test.ts',
    'preservation.test.ts',
    'promote.test.ts',
    'reconcile.test.ts',
    'referenced-issues.test.ts',
    'serialize-extended.test.ts',
    'serialize-groups.test.ts',
    'serialize-summary-multiline.test.ts',
    'serialize.test.ts',
    'sync-engine-guards.test.ts',
    'sync-engine.test.ts',
    'sync.test.ts',
    'tracker-sync.test.ts',
  ]
---

## Interface Contract

```ts
export EMPTY_BACKLOG
export EMPTY_BACKLOG_MD
export EXTENDED_FIELDS_MD
export EXTENDED_FIELDS_ROADMAP
export GROUPED_ROADMAP
export GROUPED_ROADMAP_MD
export HISTORY_MD
export HISTORY_ROADMAP
export INVALID_STATUS_MD
export MARKER_NAMES
export NO_FRONTMATTER_MD
export VALID_ROADMAP
export VALID_ROADMAP_MD
```

## Dependency Slice

```
import { GitHubIssuesSyncAdapter, parseExternalId } from '../../src/roadmap/adapters/github-issues'
import { assigneeInvariantHolds, claim, isClaimableBy, isMachineAssignee, pushAssigneeToExternal, release, setStatus } from '../../src/roadmap/assignee-lifecycle'
import { deriveRepoFromGitRemote, parseOwnerRepoFromRemoteUrl } from '../../src/roadmap/derive-repo'
import { FEATURE_PREFIX, GROUP_PREFIX, matchFeatureHeadings, parseFeatureHeading, serializeFeatureHeading } from '../../src/roadmap/heading'
import { checkRoadmapHealth, defaultIsArchive, groomRoadmap, isUnactionablePlanned } from '../../src/roadmap/health'
import { loadProjectRoadmapMode } from '../../src/roadmap/load-mode'
import { loadTrackerClientConfigFromProject } from '../../src/roadmap/load-tracker-client-config'
import { RoadmapMode, getRoadmapMode } from '../../src/roadmap/mode'
import { parseFeatureBlock, parseRoadmap } from '../../src/roadmap/parse'
import { PilotScoringOptions, ScoredCandidate, assignFeature, scoreRoadmapCandidates, scoreRoadmapCandidatesForMode } from '../../src/roadmap/pilot-scoring'
import { scoreRoadmapCandidatesFileLess } from '../../src/roadmap/pilot-scoring-file-less'
import { findUnpreservedLines } from '../../src/roadmap/preservation'
import { decidePromotionForRow, promoteFeature } from '../../src/roadmap/promote'
import { reconcileDoneFromClosedIssues } from '../../src/roadmap/reconcile'
import { parseReferencedIssues } from '../../src/roadmap/referenced-issues'
import { serializeFeature, serializeRoadmap } from '../../src/roadmap/serialize'
import { resolveRoadmapStoreForFile } from '../../src/roadmap/store/factory'
import { serializeMeta } from '../../src/roadmap/store/meta'
import { assertSemanticRoundTrip, roadmapToShards } from '../../src/roadmap/store/migration'
import { slugifyFeatureName } from '../../src/roadmap/store/monolith-store'
import { writeRegeneratedRoadmap } from '../../src/roadmap/store/regenerator'
import { RoadmapStore, Shard } from '../../src/roadmap/store/roadmap-store'
import { parseShard, serializeShard } from '../../src/roadmap/store/shard'
import { ShardIO } from '../../src/roadmap/store/shard-store'
import { decodeSummaryField, encodeSummaryField } from '../../src/roadmap/summary-field'
import { syncRoadmap } from '../../src/roadmap/sync'
import { _resetSyncMutex, fullSync, syncFromExternal, syncRowToExternal, syncToExternal } from '../../src/roadmap/sync-engine'
import { TrackedFeature } from '../../src/roadmap/tracker'
import { loadTrackerSyncConfig } from '../../src/roadmap/tracker-config'
import { ExternalSyncOptions, TrackerSyncAdapter, resolveReverseStatus } from '../../src/roadmap/tracker-sync'
import { emitEvent } from '../../src/state/event-sourcing'
import { EMPTY_BACKLOG, EMPTY_BACKLOG_MD, EXTENDED_FIELDS_MD, EXTENDED_FIELDS_ROADMAP, GROUPED_ROADMAP, GROUPED_ROADMAP_MD, HISTORY_MD, HISTORY_ROADMAP, INVALID_STATUS_MD, MARKER_NAMES, NO_FRONTMATTER_MD, VALID_ROADMAP, VALID_ROADMAP_MD } from './fixtures'
import { MIGRATION_ROADMAP, MONOLITH_ROADMAP, OLD_ROADMAP_MD } from './store/fixtures'
import { getRoadmapMode } from '@harness-engineering/core'
import { AssignmentRecord, Err, ExternalTicket, ExternalTicketState, FeatureStatus, Ok, Result, Roadmap, RoadmapFeature, RoadmapMilestone, TrackerSyncConfig } from '@harness-engineering/types'
import * as fs from 'fs'
import { execFileSync } from 'node:child_process'
import * as fs, { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import * as os, { tmpdir } from 'node:os'
import * as path, { join } from 'node:path'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```

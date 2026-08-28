---
schemaVersion: 1
module: "packages/orchestrator/tests/tracker"
sourceHash: "6e8a24e97ce4a9dc4080332ca7700ae4f23738368468eb103df3f16baffef81f"
compiledAt: "2026-08-28T01:22:12.736Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["file-less-stub.test.ts", "roadmap.test.ts"]
---

## Summary

This test suite validates the tracker dispatch and roadmap adapter layer of the Orchestrator — the subsystem responsible for fetching work items (issues, features) from either GitHub Issues or markdown roadmap files, then marking them complete after workflows finish.

**file-less-stub.test.ts** verifies the tracker factory logic: routes to GitHubIssuesIssueTrackerAdapter when config specifies "github-issues", routes to RoadmapTrackerAdapter for "roadmap", and defensively falls back to file-backed mode when harness.config.json is absent (never throws).

**roadmap.test.ts** exercises the RoadmapTrackerAdapter with real markdown I/O: fetches candidate issues filtered by activeStates config, fetches issues by specific states (including custom states like 'needs-human'), resolves issue state by ID, and tests markIssueComplete() which transitions features to terminal states and writes the roadmap back while maintaining round-trip fidelity.

## Invariants

- Router factory is config-driven and defensive — orchestrator instantiates the correct adapter type; if harness.config.json is absent, it defaults to file-backed mode (never crashes)
- RoadmapTrackerAdapter reads and writes markdown losslessly — the adapter uses the canonical roadmap store serializer, so content round-trips without mutation
- State filtering is precise — fetchCandidateIssues() returns only items in activeStates; fetchIssuesByStates() returns items matching the supplied array
- markIssueComplete is idempotent and fault-tolerant: already-terminal features and deleted features both result in no-op; missing terminalStates config returns explicit error
- ID generation is deterministic — features are identified by SHA256(name).slice(0,8) + sanitized name, enabling dispatch replay and reconciliation
- Tests use real file I/O, not mocks — temp directories and post-mutation file inspection ensure fidelity to production serialization behavior

## Interface Contract

```ts

```

## Dependency Slice

```
import { Orchestrator } from '../../src/orchestrator'
import { GitHubIssuesIssueTrackerAdapter } from '../../src/tracker/adapters/github-issues-issue-tracker'
import { RoadmapTrackerAdapter } from '../../src/tracker/adapters/roadmap'
import { TrackerConfig, WorkflowConfig } from '@harness-engineering/types'
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import * as fs from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import * as os, { tmpdir } from 'node:os'
import * as path, path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```

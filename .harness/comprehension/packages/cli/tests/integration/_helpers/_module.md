---
schemaVersion: 1
module: 'packages/cli/tests/integration/_helpers'
sourceHash: 'fd2f88006d3af45f3494fd18dca6d57edc44461617fc5c0e28d1bdec9a5574b5'
compiledAt: '2026-08-28T01:22:09.714Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['init-fixture.ts']
---

## Summary

The `_helpers/init-fixture.ts` module scaffolds parameterized test fixtures for init-command integration tests covering design×roadmap configuration scenarios. It extracts duplicated setup blocks from test suites into a reusable helper.

The exported function `scaffoldInitFixture()` accepts a scenario (design: `yes`|`no`|`not-sure`; roadmap: `yes`|`no`), creates a temp project via `runInit()`, mutates `harness.config.json` to apply the design setting, and optionally writes `docs/roadmap.md` with initial state. It returns file paths and a cleanup callback for test teardown.

## Invariants

- Design config behavior is three-way: 'yes' → enabled:true with platforms; 'no' → enabled:false; 'not-sure' → field untouched (no enabled key). Mutation via non-destructive spread preserves existing config.
- Roadmap 'Set up design system' feature appears ONLY when design='yes' AND roadmap='yes'. Its conditional presence is the contract marker for design-first projects.
- Config must represent post-step-5b state and roadmap post-step-4 state from init flow spec. Deviating state breaks test assertions.
- Timestamps (lastSynced, lastManualEdit) are ISO strings captured at scaffold time, not hardcoded. Tests rely on these being 'now' for relative-time comparisons.
- Init failure throws with explicit scenario context after cleanup. Failed init breaks fixture contract; tests detect immediately and do not proceed.
- Returned cleanup() callback MUST be called in test finally blocks to prevent tmpdir leaks. No test should skip this.

## Interface Contract

```ts
export scaffoldInitFixture
```

## Dependency Slice

```
import { runInit } from '../../../src/commands/init'
import { serializeRoadmap } from '@harness-engineering/core'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
```

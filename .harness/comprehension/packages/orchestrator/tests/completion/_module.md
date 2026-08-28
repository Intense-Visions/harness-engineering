---
schemaVersion: 1
module: "packages/orchestrator/tests/completion"
sourceHash: "5fcc742d86dfa52deaf5483f2975e7fc10b8b114691540d0a899fe2be46fd62c"
compiledAt: "2026-08-28T01:22:12.507Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["handler.test.ts"]
---

## Summary

`packages/orchestrator/tests/completion` tests the `CompletionHandler` lifecycle — specifically how it handles worker exit events, records outcomes, and manages session telemetry. The handler acts as a bridge between the orchestrator's state machine and its observability layer (recorder, pipeline, tracker). Tests use dependency injection with mocks to isolate the handler's own logic from its collaborators (state-machine, highlight-extractor, GitHub adapter). The suite emphasizes correct state transitions, fallback behavior for optional fields, and conditional side-effects based on configuration (pipeline enabled/disabled, entry presence, session data).

## Invariants

- Attempt defaulting: when `attempt` parameter is null, `finishRecording` is called with attempt=1, not null
- Entry presence checks: `finishRecording` is skipped entirely if the running entry is missing or has no session; outcome recording still proceeds with synthetic defaults
- State machine contract: `applyEvent` is called once per exit, its returned `nextState` is always set via `setState`, and all returned `effects` are processed in order
- Backend fallback chain: `agentPersona` derives from `session.backendName` if present, else `config.agent.backend`; never null
- TaskType inference: inferred deterministically from issue labels via fixed mapping (e.g., `['bug']` → `'bugfix'`, `['feature']` → `'feature'`); labels are case-normalized
- Outcome result mapping: exit `reason='normal'` → `result='success'`; `reason='error'` → `result='failure'`
- Duration and timestamp: outcome always includes `durationMs` (computed from entry `startedAt`) and ISO-8601 `timestamp`; missing entries default to `durationMs=0`
- No taskType in outcomes: the outcome object must NOT include a `taskType` field when recorded to the pipeline

## Interface Contract

```ts

```

## Dependency Slice

```
import { CompletionHandler } from '../../src/completion/handler'
import { OrchestratorContext } from '../../src/types/orchestrator-context'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```

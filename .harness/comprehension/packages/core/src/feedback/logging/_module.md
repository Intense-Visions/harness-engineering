---
schemaVersion: 1
module: 'packages/core/src/feedback/logging'
sourceHash: 'ae80c270a75a7e686254b80c07847f56d1f2a1beedfe95b3193986e1ccd779d2'
compiledAt: '2026-08-28T01:22:10.384Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['console-sink.ts', 'emitter.ts', 'file-sink.ts', 'sink.ts']
---

## Summary

The `packages/core/src/feedback/logging` module provides event-driven logging for agent actions via a global pub/sub emitter that broadcasts lifecycle events (started/completed/failed) to registered listeners and configurable sinks. Core exports are an `AgentActionEmitter` (event hub), three sink implementations (`ConsoleSink`, `FileSink`, `NoOpSink`), and helper functions (`logAgentAction`, `trackAction`, `getActionEmitter`) that enrich actions with IDs/timestamps, emit events, and route to sinks in sequence.

## Invariants

- Global emitter singleton: getActionEmitter() caches one AgentActionEmitter; all events flow through it
- Action enrichment immutable: logAgentAction adds stable id (UUID) and timestamp (ISO string) before emission
- Event routing exhaustive: emitter invokes exact-type handlers, then wildcard (action:\*) handlers; all are called
- Handler errors isolated: exceptions in event handlers are caught/logged; do not prevent other handlers or propagate
- Sink writes sequential: logAgentAction awaits each sink in config order; later sinks see prior effects
- FileSink buffer atomic: flush writes entire buffer as single appendFileSync call; buffer cleared after write
- FileSink directory lazy: directories created on first write, not in constructor, to avoid permission errors
- Config gates flow: emitEvents=false blocks event emission; falsy sinks block all sink writes
- Duration synchronously measured: trackAction captures Date.now() at start and completion; no async gaps
- Tracker action state mutable: ActionTracker.action getter returns live object; caller observes mutations during lifecycle

## Interface Contract

```ts
export AgentActionEmitter
export ConsoleSink
export FileSink
export NoOpSink
export getActionEmitter
export logAgentAction
export trackAction
```

## Dependency Slice

```
import { Err, Ok, Result } from '../../shared/result'
import { generateId } from '../../shared/uuid'
import { getFeedbackConfig } from '../config'
import { ActionContext, ActionEvent, ActionEventHandler, ActionEventType, ActionResult, ActionSink, ActionTracker, ActionType, AgentAction, FeedbackError } from '../types'
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { dirname } from 'path'
```

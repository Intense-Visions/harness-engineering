---
schemaVersion: 1
module: 'packages/core/tests/feedback/logging'
sourceHash: 'c42b4d38df71417964d4bce70fe9aba35584941e13fa038a890e15b3875e21d5'
compiledAt: '2026-08-28T01:22:10.850Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['console-sink.test.ts', 'emitter.test.ts', 'file-sink.test.ts']
---

## Summary

The logging module captures and routes agent action lifecycle events through a plugin sink architecture. AgentActionEmitter provides pub/sub for action events (started, completed, failed), while concrete sinks (ConsoleSink, FileSink) format and output AgentAction objects. The trackAction() helper automates the lifecycle: starts an action, transitions to completed/failed with calculated duration, and fires emitted events. All operations return Result<T> for error handling.

## Invariants

- Event listeners attached via on() fire for matching event types or wildcards (action:\*); on() returns an unsubscribe function
- once() handlers fire exactly once then auto-unsubscribe
- trackAction() initializes action in 'started' state; complete() or fail() transitions to terminal state and calculates duration_ms
- logAgentAction() auto-generates id and ISO timestamp if not provided
- FileSink writes JSONL: one action per line as JSON, no pretty-printing
- FileSink buffers writes; flushes when buffer fills or flushInterval expires (time-based flush is async, not write-triggered)
- All async operations return { ok: boolean, value?: T, error?: E }
- Each sink has name property ('console', 'file', 'noop') used for routing/identification
- ConsoleSink pretty format uses symbols: ✓ (completed), ✗ (failed), → (started)
- removeAllListeners() clears all listeners for all event types
- listenerCount() returns the number of listeners for a specific event type

## Interface Contract

```ts

```

## Dependency Slice

```
import { configureFeedback, resetFeedbackConfig } from '../../../src/feedback/config'
import { ConsoleSink } from '../../../src/feedback/logging/console-sink'
import { AgentActionEmitter, getActionEmitter, logAgentAction, trackAction } from '../../../src/feedback/logging/emitter'
import { FileSink } from '../../../src/feedback/logging/file-sink'
import { NoOpSink } from '../../../src/feedback/logging/sink'
import { AgentAction } from '../../../src/feedback/types'
import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```

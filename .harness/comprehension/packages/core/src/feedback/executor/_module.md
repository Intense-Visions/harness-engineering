---
schemaVersion: 1
module: 'packages/core/src/feedback/executor'
sourceHash: 'f458e4521d7d523c3823a84b784171389082c8ec07de92ebe7032e6a18ce067e'
compiledAt: '2026-08-28T01:22:10.372Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['noop.ts']
---

## Summary

NoOpExecutor is a stub implementation of the AgentExecutor interface that simulates agent execution without spawning real agents. It stores spawned processes in an in-memory Map, immediately marks them as complete, and returns mocked peer-review results. Each spawned process is assigned a unique UUID and can be queried by status, awaited for review, or killed. All operations return successful Ok results unless a process lookup fails. This is typically used for testing, dry-runs, or as a fallback when a real execution backend is unavailable.

## Invariants

- Immediate completion: Every spawned process is marked status:'completed' and stored with a timestamp; no asynchronous execution occurs.
- In-memory store: All processes live in a Map<string, AgentProcess> scoped to the executor instance; terminating the executor loses all process history.
- Lookup-based state: Operations (status, wait, kill) require the process to exist in the map; missing processes return AGENT_SPAWN_ERROR.
- Approval-always: wait() returns a PeerReview with approved:true, empty comments/suggestions, and duration:0 — it never rejects or returns critiques.
- Unique identity: Each spawn generates a new UUID via generateId(), guaranteeing distinct process IDs.
- Stateless review: The peer review contains no analysis of the spawned config; it's a fixed success stub regardless of what was requested.

## Interface Contract

```ts
export NoOpExecutor
```

## Dependency Slice

```
import { Err, Ok, Result } from '../../shared/result'
import { generateId } from '../../shared/uuid'
import { AgentExecutor, AgentProcess, ExecutorHealth, FeedbackAgentConfig, FeedbackError, PeerReview } from '../types'
```

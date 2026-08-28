---
schemaVersion: 1
module: 'packages/core/tests/feedback/integration'
sourceHash: 'd7033aaed6890ba2e542587a3b2392063ae8af960efc0705a149e45525a95f11'
compiledAt: '2026-08-28T01:22:10.845Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['full-workflow.test.ts']
---

## Summary

The `feedback/integration` test suite validates the end-to-end feedback pipeline: parsing diffs, running self-review with custom rules, requesting peer review from agent specialists, and coordinating event emission across the workflow. It uses a `NoOpExecutor` and `NoOpSink` to test the orchestration plumbing without side effects. The three test cases verify that (1) self-review with custom rule checks works, (2) peer review routing to named agents works, and (3) self-review and peer-review can be composed into a full workflow.

## Invariants

- Config isolation per test: resetFeedbackConfig() must be called before each test; configuration is not automatically scoped, so tests must clean and reconfigure to avoid cross-test pollution
- Mandatory configuration before use: configureFeedback() must be called with at least executor and sinks before calling createSelfReview() or requestPeerReview(); missing config causes silent no-ops
- Diff parsing as precondition: parseDiff() must return ok: true before feeding its .value into createSelfReview(); malformed diffs fail early rather than propagate as partial state
- Result type consistency: Both createSelfReview() and requestPeerReview() return Result<T, E> with an ok discriminator; callers must check ok before accessing .value to avoid type errors
- Custom rule contract: Rules passed to createSelfReview() must supply id, name, description, severity, and a check() async function that returns {passed, details}; omitting fields silently breaks rule execution
- Event emission opt-in: Event listeners via getActionEmitter().on() fire only when configureFeedback({ emitEvents: true }) is set; tests that expect event calls will silently fail if this flag is omitted
- Workflow ordering: Self-review and peer-review can be composed in sequence, but the integration test validates that self-review output can be fed to peer-review input; reversing the order would break the contract

## Interface Contract

```ts

```

## Dependency Slice

```
import { NoOpExecutor, NoOpSink, configureFeedback, createSelfReview, getActionEmitter, parseDiff, requestPeerReview, resetFeedbackConfig } from '../../../src/feedback'
import { beforeEach, describe, expect, it, vi } from 'vitest'
```

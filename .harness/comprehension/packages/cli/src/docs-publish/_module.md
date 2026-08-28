---
schemaVersion: 1
module: 'packages/cli/src/docs-publish'
sourceHash: '82b788f59a0cf1581433417878b02dce4067527979eeba2525ea38185f8e7717'
compiledAt: '2026-08-28T01:22:09.175Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts', 'interface.ts', 'resolver.ts']
---

## Summary

`docs-publish` is a pluggable connector module for publishing documentation to platforms like Confluence. It enforces a strict contract around drafts, render verification, and authoritative persistence. The core abstraction is `DocsPublishConnector` — a four-operation interface (`draft`, `attachMedia`, `verifyRender`, `pageTree`) that concrete providers implement. A config-driven resolver builds the connector from `harness.config.json` with graceful error messaging. All operations use never-throw structured `Result<T>` types. The module ships one concrete implementation, `ConfluenceConnector`, plus a Playwright-based render verifier that checks for broken figures and media-card errors — the only authority on whether a stored page actually renders correctly.

## Invariants

- Drafts-only: No operation publishes, promotes, or moves a draft to current/live. Promotion is always the page owner's explicit action, never the connector's.
- Verify-render-before-done: A page is not done until verifyRender passes. Stored without error (valid ADF, HTTP 200) can still render broken figures — render verification is mandatory.
- Authoritative read-back over optimistic success: A write is only trustworthy after a GET confirms the persisted state. DocsPublishResult.confirmedByReadBack is true only after read-back; optimistic responses set it false.
- Stored ≠ rendered: Only verifyRender decides render correctness. Correct stored format and HTTP success are not evidence of correct rendering — this is the boundary where stored ADF meets the browser's media handling.

## Interface Contract

```ts
export *
export ConfluenceConnector
export PlaywrightImporter
export resolveDocsPublishConnector
export verifyRender
```

## Dependency Slice

```
import { HarnessConfig } from '../config/schema.js'
import { CLIError, ExitCode } from '../utils/errors.js'
import { ConfluenceConnector } from './connectors/confluence.js'
import { DocsPublishConnector } from './interface.js'
import { Err, Ok, Result } from '@harness-engineering/core'
```

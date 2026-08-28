---
schemaVersion: 1
module: 'packages/cli/tests/docs-publish'
sourceHash: '4d1c1493dfef280f6f874048069c7759fdcd0550bacb073e12114543e4cb1c65'
compiledAt: '2026-08-28T01:22:09.705Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  ['adf.test.ts', 'commands.test.ts', 'confluence.test.ts', 'resolver.test.ts', 'verify.test.ts']
---

## Summary

packages/cli/tests/docs-publish tests three layers of the docs-publish system: (1) ADF media serialization ensuring mediaSingle/mediaInline never degrade to mediaGroup, (2) CLI command wiring validating graceful degradation on missing config and correct option validation, and (3) ConfluenceConnector behavior verifying draft-only operations, read-back confirmation, correct HTTP verbs (POST/PUT), and manual-step recipes for media attachment.

## Invariants

- Draft-only guarantee: Confluence operations must never issue status=current (publish) calls; all writes target status=draft
- Read-back confirmation: Draft success tracks confirmedByReadBack separately; write succeeding ≠ page readable
- No mediaGroup fallback: mediaSingle and mediaInline serialization must never include a mediaGroup node form
- Never throw on config error: All commands degrade to typed Result<Error> when docsPublish is missing or invalid; no unhandled exceptions
- Manual-step recipe: attachMedia returns an actionable osascript template with interpolated pageId and auth trap warnings (no automated upload path)
- exactOptionalPropertyTypes safety: Optional ADF attributes must be omitted entirely when absent, not present as undefined
- HTTP method correctness: Confluence creates use POST, updates use PUT; both append status=draft

## Interface Contract

```ts

```

## Dependency Slice

```
import { runDocsPublishAttachMedia } from '../../src/commands/docs-publish/attach-media'
import { runDocsPublishDraft } from '../../src/commands/docs-publish/draft'
import { runDocsPublishPageTree } from '../../src/commands/docs-publish/page-tree'
import { runDocsPublishVerifyRender } from '../../src/commands/docs-publish/verify-render'
import { HarnessConfig } from '../../src/config/schema'
import { mediaInline, mediaSingle } from '../../src/docs-publish/connectors/adf'
import { ConfluenceConnector } from '../../src/docs-publish/connectors/confluence'
import { HttpClient, HttpResponse } from '../../src/docs-publish/interface'
import { PlaywrightImporter, verifyRender } from '../../src/docs-publish/render/verify'
import { resolveDocsPublishConnector } from '../../src/docs-publish/resolver'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```

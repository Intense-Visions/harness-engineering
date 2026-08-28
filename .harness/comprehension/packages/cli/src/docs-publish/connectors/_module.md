---
schemaVersion: 1
module: 'packages/cli/src/docs-publish/connectors'
sourceHash: '265f4c493065e0a5db52340db2f59b19b195f6c987d70a6e25387b60ad072dc8'
compiledAt: '2026-08-28T01:22:09.193Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['adf.ts', 'confluence.ts']
---

## Summary

The `docs-publish/connectors` module provides Confluence Cloud integration through two focused components:

**adf.ts** exports media serialization helpers (`mediaSingle`, `mediaInline`) that build properly-renderable Atlassian Document Format nodes. The critical distinction: `mediaSingle` renders as inline figures; `mediaGroup` (never emitted here) silently downgrades to thumbnail cards.

**confluence.ts** implements `ConfluenceConnector`, which orchestrates draft-only page CRUD, manual-step attachment upload (with detailed recipes for the browser-driven flow), page-tree sidebar ordering, and Playwright render verification. The connector is injectable-testable (HttpClient dependency) and enforces persistence via write-then-read-back confirmation. Three key architectural points: (1) all writes emit `status: 'draft'` exclusively—never publishes, (2) Playwright is the sole authority on render correctness (the schema can't detect render downgrades), and (3) attachment upload must surface a typed manual step since Confluence has no headless API—the working recipe requires osascript driving a logged-in browser tab.

## Invariants

- Draft-only enforcement — All writes emit status: 'draft' only. Never promote to 'current' or 'live'. Hard-coded in buildContentPayload; violation breaks the provider contract and the publish gate.
- MediaSingle exclusivity — ADF module NEVER emits mediaGroup. Both serialize without error, but mediaGroup renders as cropped thumbnail cards (filename + upload date), not figures. Only mediaSingle renders as intended. The schema permits both; the render is the source of truth.
- Write-then-read-back confirmation — After draft() or pageTree() writes, immediately issue an authoritative GET to confirm persistence. Write response alone is not trusted; only the read-back confirms the draft was stored.
- Playwright render verification is sole authority — verifyRender() via Playwright is the ONLY way to detect render correctness and silent schema→render downgrades (e.g., mediaSingle stored but mediaGroup-renders). Schema validation cannot catch this.
- data-local-id preservation on page-tree round-trips — When editing a full page body (read → mutate → write), preserve data-local-id on EVERY retained node. Dropping it causes the provider to treat retained nodes as new, breaking comments, anchors, sidebar ordering, and versioning.
- Attachment upload is always manual — Confluence has no headless attachment API. The only working recipe requires a logged-in browser tab driven by osascript. attachMedia() returns a typed manual step with the full recipe and three documented traps (parameter truncation, loopback hang, tab injection unreliability).
- Inject/verify separation for attachments — Never verify attachment success by polling the injection tab. osascript may run in a different tab than the one you poll. Always verify authoritatively via GET /wiki/rest/api/content/{pageId}/child/attachment?status=draft.

## Interface Contract

```ts
export ConfluenceConnector
export mediaInline
export mediaSingle
```

## Dependency Slice

```
import { AttachMediaInput, AttachMediaResult, DocsPublishConnector, DocsPublishResult, DraftHandle, DraftInput, HttpClient, HttpResponse, PageTreeInput, PageTreeResult, VerifyRenderInput, VerifyRenderResult } from '../interface.js'
import { renderVerify } from '../render/verify.js'
```

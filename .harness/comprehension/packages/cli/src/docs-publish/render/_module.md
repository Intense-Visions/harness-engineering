---
schemaVersion: 1
module: 'packages/cli/src/docs-publish/render'
sourceHash: '438d10e7ef232684b617fe1240b3b6cd311c03834590320afa8b5d128a9a0d76'
compiledAt: '2026-08-28T01:22:09.198Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['verify.ts']
---

## Summary

`packages/cli/src/docs-publish/render` exports `verifyRender`, which validates rendered documentation by launching a headless Chromium browser and asserting three DOM properties: all `<img>` elements have loaded (`naturalWidth > 0`), zero `.media-card-error` nodes exist, and zero `mediaGroup` figure nodes exist (which indicate silent downgrade failures). Playwright is treated as an optional peer dependency—if absent, it returns a non-verdict degraded result rather than failing, avoiding forced browser downloads during CLI installation. The counting logic runs as a browser-context string to sidestep DOM/Node type conflicts.

## Invariants

- Playwright import is guarded and injectable: the importer is a parameter with a safe default. If it throws, verifyRender returns degraded:'playwright-not-installed' with a user-friendly instruction—never a thrown error. Tests can inject a mock importer.
- COUNT_SCRIPT must be a string: it is passed as a raw string to page.evaluate() and runs in browser context, not Node. It is never type-checked and must remain valid JavaScript for the browser sandbox.
- Pass condition is conjunctive: ok = imagesLoaded > 0 && mediaCardErrors === 0 && mediaGroupCount === 0. All three must hold; one failure anywhere flags the render as failed.
- Browser cleanup is unconditional: the browser is always closed in the finally block, even on navigation timeouts, assertion failures, or unexpected errors. This prevents resource leaks in CI/automation loops.
- Result shape is stable on all paths: every code path returns all count fields (imagesLoaded, mediaCardErrors, mediaSingleCount, mediaGroupCount), initialized to 0 on error, so callers never null-check individual counts.

## Interface Contract

```ts
export verifyRender
```

## Dependency Slice

```
import { VerifyRenderInput, VerifyRenderResult } from '../interface.js'
```

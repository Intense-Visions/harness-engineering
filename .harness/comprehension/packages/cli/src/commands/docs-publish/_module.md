---
schemaVersion: 1
module: 'packages/cli/src/commands/docs-publish'
sourceHash: 'e15c812d23f37fdb76a1731f9b2e918badac2d31c953e63d3693b0283ac1cc44'
compiledAt: '2026-08-28T01:22:08.809Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['attach-media.ts', 'draft.ts', 'index.ts', 'page-tree.ts', 'verify-render.ts']
---

## Summary

`docs-publish` is a CLI command group for draft-first publishing to a provider (Confluence, etc.) configured via the `docsPublish` block in `harness.config.json`. It exports `createDocsPublishCommand()`, which composes four subcommands: **`draft`** (create/update pages in DRAFT state with page body as text or ADF JSON), **`attach-media`** (upload media; surfaces a manual step as success if automation is blocked), **`page-tree`** (bulk-create/order child pages under a parent), and **`verify-render`** (health check before publish). Each follows an identical pattern: load config → resolve connector → validate required flags → delegate to connector operation → map result to JSON/human text → exit with explicit code. File I/O is guarded so missing/malformed files become clean CLIError exits, not stack traces.

## Invariants

- Result-based error handling: all async operations return Result<T, CLIError>; errors mapped to exit codes; callers check .ok before accessing .value
- File reads wrapped in try-catch: missing or malformed JSON (body, ADF, children array) caught and wrapped in CLIError(VALIDATION_FAILED); never propagate raw exceptions
- Manual steps surface as success: when connector returns { status: 'manual-step-required', instructions, verifyWith }, it's printed as Ok, not downgraded to error
- Config and connector resolved once per command: both resolve sequentially; if either fails, command exits immediately without attempting the operation
- Three output modes (JSON/text/quiet): callers check resolveOutputMode(globalOpts) before printing; JSON uses console.log(JSON.stringify(…)); human uses logger; quiet suppresses output
- Optional CLI flags, required at runtime: option interfaces mark flags ?:undefined, but operations validate the subset that are mandatory (e.g., --space-id, --title), returning VALIDATION_FAILED on missing flags
- Explicit exit codes on all paths: success exits with ExitCode.SUCCESS; errors exit with result.error.exitCode (typically VALIDATION_FAILED for CLI issues or INTERNAL_ERROR from connector)

## Interface Contract

```ts
export createDocsPublishCommand
```

## Dependency Slice

```
import { resolveConfig } from '../../config/loader'
import { AttachMediaInput, AttachMediaResult, DraftHandle, DraftInput, PageTreeInput, PageTreeNode, PageTreeResult, VerifyRenderResult, resolveDocsPublishConnector } from '../../docs-publish'
import { OutputMode } from '../../output/formatter'
import { logger } from '../../output/logger'
import { CLIError, ExitCode } from '../../utils/errors'
import { resolveOutputMode } from '../../utils/output'
import { createAttachMediaCommand } from './attach-media'
import { createDraftCommand } from './draft'
import { createPageTreeCommand } from './page-tree'
import { createVerifyRenderCommand } from './verify-render'
import { Err, Ok, Result } from '@harness-engineering/core'
import { Command } from 'commander'
import * as fs from 'fs'
```

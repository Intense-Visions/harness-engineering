---
schemaVersion: 1
module: 'packages/cli/src/copy-craft/extract'
sourceHash: 'ab5df342c0f6c732e85caf48082f002732183db8934be1a5496313c20bb686d4'
compiledAt: '2026-08-28T01:22:08.963Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['commits.ts', 'pr-descriptions.ts', 'source.ts']
---

## Summary

This module extracts copywriting surfaces (error messages, log calls, PR/commit descriptions, and comments) from three sources: Git history, GitHub PRs, and TypeScript source code. Each extractor shells out to a system binary (git, gh) or walks the TypeScript AST, returning structured ExtractedCopyItem[] that downstream copy-craft passes use for style audits and tone analysis. The three exporters are: extractCommits (runs git log to harvest commit subjects), extractPRDescriptions (runs gh pr list to fetch PR titles/bodies), and extractFromSource (single AST walk to extract error messages, log calls, and non-JSDoc comments). All extractors gracefully degrade—when preconditions fail (not a git repo, gh not found/authed, non-JS file), they return {items: [], skipReason: "..."} so the caller can track skipped surfaces without throwing.

## Invariants

- Arg-array spawning (not shell strings): Both extractCommits and extractPRDescriptions use spawnSync with arg arrays and shell:false to bypass Windows cmd.exe quoting that preserves single quotes verbatim in format strings, breaking parsing.
- 10-second timeouts on system binaries (GIT_TIMEOUT_MS, GH_TIMEOUT_MS) prevent indefinite waits from hung git/gh processes.
- Comment dedup by start position: extractComments maintains seenStarts Set to avoid double-reporting comments that are both leading-of-nodeA and trailing-of-nodeB.
- JSDoc and license banners filtered: Comments matching ^\s\*/\*\* or containing Copyright/License/SPDX in first 1000 bytes are skipped (docs-craft scope, not copy-craft).
- Two error patterns recognized: throw new <X>Error(message) and Err({message: "..."}) Result-style calls; both extracted as error surface items.
- CLI surface precedence: When file matches cliOutputPaths and cli-output surface is enabled, console._ or formatter._ log calls emit as cli-output rather than log, enabling separate tone guidance for user-facing strings.
- Graceful precondition checking: isGitRepo walks up 10 levels for .git; hasGhBinary and isGhAuthed probe before work; failures return skipReason strings, not exceptions.

## Interface Contract

```ts
export extractCommits
export extractFromSource
export extractPRDescriptions
```

## Dependency Slice

```
import { CopySurface, ExtractedCopyItem } from '../findings/schema.js'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import ts from 'typescript'
```

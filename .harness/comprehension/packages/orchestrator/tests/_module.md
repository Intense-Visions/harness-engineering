---
schemaVersion: 1
module: "packages/orchestrator/tests"
sourceHash: "262af753be43c9ab72b042680165c8082c9c4cfddf7e7183f2bb76d91fe45ab1"
compiledAt: "2026-08-28T01:22:12.435Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["orchestrator-pr-guard.test.ts", "setup.ts", "verify-changed-packages.test.ts"]
---

## Summary

packages/orchestrator/tests validates the PRDetector class, which gates issue-to-agent dispatch by checking whether a candidate issue already has an open pull request. The detector wraps the gh CLI to answer three key questions: does an open PR exist by identifier branch (feat/issue-abc12345)?, is the GitHub issue already linked to an open PR (github:owner/repo#42)?, and has this branch ever had a PR (any state)?. Tests verify both happy paths and error resilience. The suite emphasizes batching to avoid GraphQL rate-limit thrashing and fail-open semantics so detection errors don't block dispatch.

## Invariants

- Fail-open on gh errors: detection methods return false (no PR found) when gh CLI fails; errors are logged but never throw or block dispatch.
- Batched repo checks, not per-issue search: when filtering candidates by externalId, a single `gh pr list --repo <repo> --state open` call handles all issues in that repo; never use `--search` per issue (GraphQL quota thrashing).
- ExternalId format validation gates CLI calls: github:owner/repo#number is the only recognized format; non-GitHub or malformed IDs short-circuit to false without calling gh.
- Result shape varies by query: hasOpenPRForIdentifier and hasOpenPRForExternalId return boolean; branchHasPullRequest returns {found, error?} object on failure.
- Mock callback pattern: gh mock implementations use (err, result) => cb(err, {stdout, stderr}) callback shape; stdout parsed as JSON or newline-delimited line count.
- No duplicate work: a candidate issue with an open PR is filtered out and never dispatched to an agent.

## Interface Contract

```ts

```

## Dependency Slice

```
import { PRDetector } from '../src/core/pr-detector'
import { Orchestrator } from '../src/orchestrator'
import { verifyChangedPackages } from '../src/orchestrator.js'
import { Issue, Ok, WorkflowConfig } from '@harness-engineering/types'
import { execFile } from 'node:child_process'
import { beforeEach, describe, expect, it, vi } from 'vitest'
```

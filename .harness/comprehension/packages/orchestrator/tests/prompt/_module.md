---
schemaVersion: 1
module: "packages/orchestrator/tests/prompt"
sourceHash: "d6b4d90d5b5c846b64a7c300c1052a025dae402731b06fbaef4c16f56d823037"
compiledAt: "2026-08-28T01:22:12.584Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["local-template-lint.test.ts", "renderer.test.ts"]
---

## Summary

The `packages/orchestrator/tests/prompt` module validates two core components: (1) **PromptRenderer**—a template engine for strict variable substitution that throws on missing variables and handles nested object contexts; (2) **Local template** (`harness.orchestrator.local.md`)—an indirection shim for SC8 that redirects `/harness:X` commands to `harness skill run harness-X --autonomous`, teaching users the mapping rather than inlining methodology. The shim is intentionally lean (≤80 body lines) and rendered at dispatch time with per-issue context injection (title, identifier, description, attempt counter).

## Invariants

- Shim discipline: local template is a thin redirect, not a paraphrase—body ≤80 lines enforced per-test
- Strict rendering: PromptRenderer throws on missing variables; callers must provide complete context
- Render variables: issue {{ title }}, {{ identifier }}, {{ description }}, and {{ attempt }} must be preserved in template for dispatch-time injection
- Gate enforcement: template must name 'harness validate' as the required gate
- Skill invocation: template redirects via 'harness skill run <name> --autonomous', not direct slash commands
- YAML frontmatter: template must open with '---\n' and close with another '---'
- Two-site consistency: harness.orchestrator.local.md at repo root and under templates/orchestrator/ must both pass identical lint checks

## Interface Contract

```ts

```

## Dependency Slice

```
import { PromptRenderer } from '../../src/prompt/renderer'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
```

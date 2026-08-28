---
schemaVersion: 1
module: "scripts/lib"
sourceHash: "b75574e5bd076293d2485ba8365efbd36a9731a511238aca17277cdcf2e1213a"
compiledAt: "2026-08-28T01:22:12.804Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["baseline-diff-guard.mjs", "diff-scope-guard.mjs", "plugin-config.mjs"]
---

## Summary

scripts/lib provides CI self-approval guards and multi-platform plugin configuration. Three modules: (1) diff-scope-guard validates that PR diffs touch only whitelisted paths before auto-approval, supporting exact-path and directory-prefix patterns; (2) baseline-diff-guard wraps diff-scope for the baseline-refresh job, enforcing exact-path-only matching to prevent glob gotchas; (3) plugin-config registers target-specific settings (Claude Code, Cursor, Gemini CLI, Antigravity, Codex) including artifact generation flags, hook templates, and skill directories. Shared by CI workflows and marketplace generators.

## Invariants

- Empty diffs reject auto-approval — assertDiffScope requires changed.length > 0 to prevent phantom PRs from self-approving arbitrary main changes
- Baseline allowlist is exact-match-only, never glob — baselines.json files in separate directories would be wrongly excluded by *-baselines.json patterns
- Skill symlink mirrors — cursor/gemini-cli/antigravity skillsDirs are symlinks into claude-code to avoid duplication and ensure generated commands use canonical paths
- Platform capability boundaries enforced via generateX booleans — Codex generates nothing; Gemini skips agents/hooks; Antigravity skips hooks only
- Dual-source-of-truth trap — STANDARD_HOOKS must mirror packages/cli/src/hooks/profiles.ts HOOK_SCRIPTS or Claude/Cursor desync silently
- Hook invocation templates vary by platform — Claude uses ${CLAUDE_PLUGIN_ROOT}, Cursor uses relative ./, Gemini uses TOML, preventing mistakes from copy-paste

## Interface Contract

```ts
export PLUGIN_CONFIGS
export STANDARD_HOOKS
export assertBaselineOnly
export assertDiffScope
export getConfig
```

## Dependency Slice

```
import { assertDiffScope } from './diff-scope-guard.mjs'
```

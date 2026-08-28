---
schemaVersion: 1
module: 'packages/core/src/validation/agent-configs/fallback'
sourceHash: '159361a8604f8f0983e1f2bdafdfe98204b277c9d5bc8083d155fcb57ec8e46d'
compiledAt: '2026-08-28T01:22:10.698Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'index.ts',
    'rule-agents-md.test.ts',
    'rule-agents-md.ts',
    'rule-agents.ts',
    'rule-agnix-toml.ts',
    'rule-claude-md.ts',
    'rule-commands.test.ts',
    'rule-commands.ts',
    'rule-hooks.ts',
    'rule-mcp.ts',
    'rule-personas.ts',
    'rule-settings-json.ts',
    'rule-skills.ts',
    'shared.test.ts',
    'shared.ts',
  ]
---

## Summary

The fallback module is a concurrent validation hub that runs ten independent rule suites against a project's agent configuration files (agent definitions, AGENTS.md, skills, hooks, etc.). It parallelizes rule execution and aggregates findings into a deterministically sorted list keyed by (file, line, ruleId). Core contract: `runFallbackRules(cwd)` → `Promise<AgentConfigFinding[]>`. Each rule suite is independent, scans for relevant files, and returns typed findings with severity, message, and suggestion.

## Invariants

- Concurrent rule independence: each rule suite operates on disjoint file sets with no cross-rule dependencies
- Deterministic sorting: findings sorted by (file lexicographic → line numeric → ruleId lexicographic)
- Agent file discovery: agents/\*_/_.md only, explicitly excluding skills/, README.md, SKILL.md, AGENTS.md, CLAUDE.md
- Frontmatter required: every agent definition must have YAML frontmatter with at least name and description fields
- Name-to-filename consistency: agent name should match basename; mismatch triggers a warning, not error
- Description routing threshold: description ≥20 characters minimum to win routing; shorter is flagged AC-012 warning
- AGENTS.md reuses validateAgentsMap: structural validation delegates to core validator for consistency
- Skip-safe on absence: missing config files return [] and do not error; validation only runs when files exist
- Agnix tool slugs curated: .agnix.toml target and tools entries must match known slug names
- Uniform finding shape: all findings carry file, ruleId, severity, message, suggestion, and optional line

## Interface Contract

```ts
export runFallbackRules
```

## Dependency Slice

```
import { validateAgentsMap } from '../../../context/agents-map'
import { AgentConfigFinding, AgentConfigSeverity } from '../types'
import { runAgentRules } from './rule-agents'
import { runAgentsMdRules } from './rule-agents-md'
import { runAgnixTomlRules } from './rule-agnix-toml'
import { runClaudeMdRules } from './rule-claude-md'
import { runCommandRules } from './rule-commands'
import { runHookRules } from './rule-hooks'
import { runMcpRules } from './rule-mcp'
import { runPersonaRules } from './rule-personas'
import { runSettingsJsonRules } from './rule-settings-json'
import { runSkillRules } from './rule-skills'
import { extractFrontmatter, makeFinding, parseFrontmatterFields, readTextSafe, relPath, safeFileSize } from './shared'
import { glob } from 'glob'
import * as fs, { existsSync, readFileSync, statSync } from 'node:fs'
import * as os from 'node:os'
import * as path, { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```

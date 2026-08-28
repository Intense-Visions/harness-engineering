---
schemaVersion: 1
module: 'packages/cli/src/agent-definitions'
sourceHash: '110060d2a4812fde42a29a2007e22f591905536c7f8d6775f44ccba93387a06b'
compiledAt: '2026-08-28T01:22:08.652Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'constants.ts',
    'generator.ts',
    'render-claude-code.ts',
    'render-codex.ts',
    'render-cursor.ts',
    'render-gemini-cli.ts',
  ]
---

## Summary

`packages/cli/src/agent-definitions` generates harness agent definitions in platform-specific formats (Claude Code, Codex, Cursor, Gemini CLI). It defines an `AgentDefinition` schema and renders it as YAML/TOML with consistent sections: role, skills, steps, and methodology. The module bridges persona metadata to platform implementations, translating tool names per platform (e.g., Bash → run_shell_command for Gemini CLI).

## Invariants

- Generated-file watermark: GENERATED_HEADER_AGENT marks all output files as auto-generated; do not hand-edit flagged files.
- DEFAULT_TOOLS ↔ GEMINI_TOOL_MAP must stay in sync; adding a new default tool requires its Gemini equivalent or validation fails.
- Agent names are prefixed 'harness-' and kebab-cased; descriptions looked up by kebab name in AGENT_DESCRIPTIONS, fallback to persona description.
- Methodology is concatenative: built by joining skill-content strings; depends on skillContents Map being pre-populated with all referenced skills.
- All renderers include the generated header as their first content line after YAML frontmatter.
- Step formatting is rigid across platforms: format is '`harness command` (when)'; when defaults to 'always' if omitted.
- Codex TOML prefers literal multi-line strings ('''…''') to avoid backslash escaping in shell snippets; falls back to escaped """…""" if body contains '''.
- Tools are translated per-platform: Claude Code names (Bash/Read/Edit/Glob/Grep) map to Gemini CLI names via GEMINI_TOOL_MAP.

## Interface Contract

```ts
export AGENT_DESCRIPTIONS
export DEFAULT_TOOLS
export GEMINI_TOOL_MAP
export GENERATED_HEADER_AGENT
export generateAgentDefinition
export renderClaudeCodeAgent
export renderCodexAgent
export renderCursorAgent
export renderGeminiAgent
```

## Dependency Slice

```
import { Persona, Step } from '../persona/schema'
import { toKebabCase } from '../utils/string'
import { GENERATED_HEADER_AGENT } from './constants'
import { AgentDefinition, GEMINI_TOOL_MAP } from './generator'
```

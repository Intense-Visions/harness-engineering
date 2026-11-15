---
schemaVersion: 1
module: 'packages/cli/src/agent-definitions'
sourceHash: '3aba5064444529ee727d7b020ab57af8b32614a2aa3aeb656179ceb9b4afd336'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
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

## Interface Contract

```ts
export AGENT_DESCRIPTIONS
export CLAUDE_CODE_MCP_SERVER_PREFIXES
export DEFAULT_TOOLS
export GEMINI_TOOL_MAP
export GENERATED_HEADER_AGENT
export PAUSE_PROTOCOL_MCP_TOOLS
export claudeCodeMcpTools
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
import { AgentDefinition, GEMINI_TOOL_MAP, claudeCodeMcpTools } from './generator'
```

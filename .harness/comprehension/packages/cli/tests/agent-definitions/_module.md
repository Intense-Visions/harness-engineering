---
schemaVersion: 1
module: 'packages/cli/tests/agent-definitions'
sourceHash: '95711bd0756cde5a4447a421962205c34ed4dc0c5a33a78c0b61b349ba5a3991'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'generator.test.ts',
    'render-claude-code.test.ts',
    'render-codex.test.ts',
    'render-cursor.test.ts',
    'render-gemini-cli.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { AGENT_DESCRIPTIONS, AgentDefinition, DEFAULT_TOOLS, GEMINI_TOOL_MAP, generateAgentDefinition, inlineRelativeLinks } from '../../src/agent-definitions/generator'
import { renderClaudeCodeAgent } from '../../src/agent-definitions/render-claude-code'
import { renderCodexAgent } from '../../src/agent-definitions/render-codex'
import { renderCursorAgent } from '../../src/agent-definitions/render-cursor'
import { renderGeminiAgent } from '../../src/agent-definitions/render-gemini-cli'
import { Persona } from '../../src/persona/schema'
import { describe, expect, it } from 'vitest'
```

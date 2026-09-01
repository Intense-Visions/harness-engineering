---
'@harness-engineering/cli': patch
---

chore(cleanup): narrow in-file-only MCP helpers to module scope.

Drops the redundant `export` keyword from internal helpers that are only called
within their own module: `parseAdr`, `serializeAdr`, `decisionsDirFor`,
`padNumber`, and `DECISIONS_DIR` (`mcp/tools/adr-store.ts`); and `agentsMdEntry`,
`hooksEntry`, and `skillTreeEntries` (`mcp/context-surface.ts`). No behavior
change — the `manage_adr` tool imports only the public store functions, none of
these helpers.
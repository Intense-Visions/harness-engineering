---
'@harness-engineering/orchestrator': patch
---

docs(codex-backend): attach the three-shape `agent_message` protocol JSDoc to `extractCodexAgentMessage`

The block documenting the nested/item/flat `agent_message` extraction contract sat above the trivial `nonEmptyString` guard instead of above the exported `extractCodexAgentMessage` it describes, so IDE hover attached it to the wrong function and the real extractor was undocumented. Comment relocation only — no runtime or type change. (craft-fleet COPY-R008)

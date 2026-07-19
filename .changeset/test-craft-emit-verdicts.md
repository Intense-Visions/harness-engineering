---
'@harness-engineering/cli': patch
---

test-craft can now emit a machine-readable per-test verdict report (`--emit <path>` CLI flag / `emitTo` MCP arg) so downstream tooling can consume its findings instead of losing them to chat. Part of #914.

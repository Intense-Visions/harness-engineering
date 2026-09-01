---
'@harness-engineering/cli': patch
---

test: characterize the docs-publish cluster — the `docs_publish` MCP tool
(config/connector degradation, per-op dispatch + validation, ok/error mapping,
unknown-op, handler-throw) and the draft/page-tree/attach-media/verify-render CLI
command SUCCESS + render paths (connector threading, human + JSON output, exit
verdicts). Behavior-only; no runtime change.

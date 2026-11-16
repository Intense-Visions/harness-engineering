---
'@harness-engineering/cli': patch
---

Fix `get_critical_paths`, `compute_blast_radius`, and `get_impact` failing with `The "paths[0]" argument must be of type string. Received undefined` when the project root was passed as `projectPath` or omitted. All three now accept `path`, its `projectPath` alias, or no root (the MCP server's working directory). Every MCP tool that sanitizes a path now rejects a missing or non-string value with an actionable message instead of Node's opaque `paths[0]` error.

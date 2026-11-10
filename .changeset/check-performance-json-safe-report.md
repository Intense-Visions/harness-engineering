---
'@harness-engineering/cli': patch
---

fix(cli): `check_performance` MCP tool now delivers parseable JSON. It returned the raw `EntropyReport` with `snapshot` (full per-file ASTs) first, so the compaction middleware's prefix truncation cut the response mid-AST. It now uses the same `toJsonSafeReport` projection as `detect_entropy` (actionable keys first, ASTs stripped). Refs #2364.

---
'@harness-engineering/intelligence': minor
'@harness-engineering/cli': minor
---

Add `CanaryAdapter.readRunHistory` (new injectable `CanaryReader` file-read seam +
permissive `canaryRunRecordSchema`/`canaryTestResultSchema`) and the thin
`canary_run_history` MCP tool. Reads canary's documented NDJSON run-history store
(`test-results/reports/history-v2.jsonl`) and degrades to `[]` — never throws — on a
missing/unreadable store or malformed lines. Foundation for graph/outcome-eval ingest.

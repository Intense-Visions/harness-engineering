---
'@harness-engineering/cli': patch
'@harness-engineering/core': patch
---

Fix `search_skills` returning irrelevant results and compaction destroying skill content.

- Index all non-internal skills regardless of tier so the router can discover Tier 1/2 skills
- Add minimum score threshold (0.25) to filter noise from incidental substring matches
- Fix `resultToMcpResponse` double-wrapping strings with `JSON.stringify`, which collapsed newlines and caused truncation to drop all content
- Truncate long lines to fit budget instead of silently skipping them; cap marker cost at 50% of budget
- Exempt 12 tools from lossy truncation (run_skill, emit_interaction, manage_state, etc.) — use structural-only compaction for tools whose output must arrive complete

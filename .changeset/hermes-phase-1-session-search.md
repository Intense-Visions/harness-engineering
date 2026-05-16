---
'@harness-engineering/types': minor
'@harness-engineering/core': minor
'@harness-engineering/orchestrator': minor
'@harness-engineering/cli': minor
---

Hermes Phase 1: Session Search + Insights

Adds a SQLite FTS5 full-text index over `.harness/sessions/` and
`.harness/archive/sessions/`, plus an LLM-generated retrospective summary
written to `<archive>/llm-summary.md` when a session is archived, plus a
composite `harness insights` aggregator covering health / entropy / decay /
attention / impact.

**New CLI:**

- `harness search "<query>"` — FTS5 + BM25 over indexed session memory.
- `harness insights` — composite project report.

**New MCP tools:**

- `search_sessions` (tier: core)
- `summarize_session` (tier: standard — LLM-spend implication)
- `insights_summary` (tier: core)

**New config (optional, all defaults are sensible):**

```jsonc
{
  "hermes": {
    "search": { "indexedFileKinds": [...], "maxIndexBytesPerFile": 262144 },
    "summary": { "enabled": true, "inputBudgetTokens": 16000, "timeoutMs": 60000 }
  }
}
```

**Backwards compatible:** existing `harness.config.json` files validate
unchanged; `archiveSession()`'s second argument is optional.

Dashboard Search + Insights pages are deferred to follow-up roadmap item
`hermes-phase-1.1-dashboard-ui`. See
`docs/changes/hermes-phase-1-session-search/proposal.md` and the
companion ADR
`docs/knowledge/decisions/0013-hermes-phase-1-session-memory-architecture.md`.

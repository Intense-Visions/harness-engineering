# Recommended Skills: Hermes Phase 1 — Session Search + Insights

> Skill annotations active during this phase's brainstorming + planning + execution.

## Apply (invoke during execution)

| Skill                | Purpose                                                                               | When                      |
| -------------------- | ------------------------------------------------------------------------------------- | ------------------------- |
| `ts-zod-integration` | Single-source-of-truth schemas for `SessionSummary`, `HermesConfig`, `InsightsReport` | Tasks 1, 6, 19            |
| `ts-testing-types`   | Typed AnalysisProvider stubs, in-memory SQLite fixtures, snapshot-friendly outputs    | Tasks 5, 7, 9, 13, 16, 20 |

## Reference (load as context)

| Skill                          | Purpose                                                                       | When        |
| ------------------------------ | ----------------------------------------------------------------------------- | ----------- |
| `gof-strategy`                 | Indexer interface vs concrete `SqliteSearchIndex` impl                        | Tasks 2, 14 |
| `gof-template-method`          | Archive hook ordering: summary → index, both best-effort                      | Task 8      |
| `gof-facade-pattern`           | `buildArchiveHooks` as a single entry point bundling summary + index          | Task 8      |
| `ts-performance-patterns`      | Prepared statements, WAL pragma, FTS5 BM25 tuning                             | Tasks 2, 4  |
| `harness:architecture-advisor` | Task 17 placement decision (insights composer in core vs dashboard)           | Task 17     |
| `events-event-schema`          | LLM summary frontmatter shape (`generatedAt`, `model`, tokens, schemaVersion) | Task 6      |

## Always at slice-plan time

`harness:soundness-review`, `harness:planning`, `harness:execution`,
`harness:verification`, `harness:integration`, `harness:tdd`,
`harness:enforce-architecture`.

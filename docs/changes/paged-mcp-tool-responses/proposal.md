# Paged MCP Tool Responses

Replace lossy truncation dead-ends with offset/limit pagination across MCP tools whose output frequently exceeds the compaction budget. Agents currently see `[truncated — prioritized truncation applied]` with no way to retrieve what was cut. After this change, tools return a `pagination` field with `hasMore` and `offset`/`limit` metadata, letting agents request subsequent pages on demand.

## Goals

1. Agents can retrieve complete tool output across multiple requests instead of losing data to truncation
2. Consistent `PaginationMeta` contract across all paginated tools
3. Pages are relevance-sorted so page 1 always contains the highest-value items
4. Per-tool default limits tuned so a single page fits comfortably within the 4000-token compaction budget
5. Zero breaking changes to existing tool consumers — pagination fields are additive; tools without `offset`/`limit` params behave identically to today

## Non-Goals

- Changing the compaction middleware or truncation strategy
- Server-side page caching or stateful cursors
- Paginating lossless-only tools (they bypass truncation by design)

## Decisions

| #   | Decision                                      | Rationale                                                                                                                                                              |
| --- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Tool-level pagination, not middleware         | Middleware truncation uses priority scoring — "page 2" would be low-priority lines, not meaningful continuation. Tools know what "next page" means semantically.       |
| 2   | Numeric offset/limit, not opaque cursors      | Tool data is effectively immutable within an agent session. Offset/limit is stateless, simple, and lets agents jump to any range.                                      |
| 3   | Shared `PaginationMeta` envelope              | Consistent contract across all tools so agents use one pattern everywhere. `{ offset, limit, total, hasMore }` added as `pagination` key in existing response objects. |
| 4   | Per-tool default limits tuned to token budget | A page of graph nodes costs far less than a page of review findings. Each tool calibrates its default so one page fits under 4000-token compaction budget.             |
| 5   | All 8 candidate tools in one pass             | Marginal effort per tool is low once the shared utility exists. No reason to defer.                                                                                    |
| 6   | Section-aware pagination for `gather_context` | Multi-section response needs a `section` param so offset/limit apply within a specific section. Other tools use simple array pagination.                               |
| 7   | Relevance-sorted before pagination            | Page 1 always has the highest-value items. Each tool sorts by its natural relevance signal (severity, connectivity, Z-score, etc.) before slicing.                     |

## Technical Design

### Shared Types

Define in `packages/core/src/compaction/pagination.ts`:

```typescript
export interface PaginationMeta {
  offset: number; // items skipped
  limit: number; // max items in this page
  total: number | null; // total available (null if expensive to compute)
  hasMore: boolean; // true if more pages exist
}

export interface PaginatedSlice<T> {
  items: T[];
  pagination: PaginationMeta;
}

export function paginate<T>(items: T[], offset: number, limit: number): PaginatedSlice<T>;
```

`paginate()` is pure: slice the array, compute `hasMore` from `offset + limit < items.length`, populate `total` from `items.length`. Tools call it after sorting by relevance.

### Input Schema Changes

All 8 tools gain two optional params:

| Param    | Type     | Default              | Description             |
| -------- | -------- | -------------------- | ----------------------- |
| `offset` | `number` | `0`                  | Number of items to skip |
| `limit`  | `number` | Per-tool (see below) | Max items to return     |

`gather_context` gains one additional param:

| Param     | Type     | Default     | Description                                                                                                                                |
| --------- | -------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `section` | `string` | `undefined` | Section to paginate (`graphContext`, `learnings`, `sessionSections`). When omitted, returns first page of each section (current behavior). |

### Per-Tool Defaults and Sort Keys

| Tool                | Default limit        | Sort key                                                       | Paginatable collection         |
| ------------------- | -------------------- | -------------------------------------------------------------- | ------------------------------ |
| `gather_context`    | 20 items per section | Section-dependent (graph: relevance score; learnings: recency) | Per-section arrays             |
| `query_graph`       | 50 nodes             | Connectivity (edge count desc)                                 | `nodes` array in detailed mode |
| `get_relationships` | 50 edges             | Edge weight desc                                               | `edges` array                  |
| `code_outline`      | 30 files             | Modification time desc                                         | File outline entries           |
| `review_changes`    | 20 findings          | Severity desc (critical > low)                                 | `findings` array               |
| `run_code_review`   | 20 findings          | Severity desc                                                  | `findings` array               |
| `detect_anomalies`  | 30 anomalies         | Z-score desc                                                   | Anomaly entries                |
| `get_decay_trends`  | 20 trends            | Decay magnitude desc                                           | Trend entries                  |

### Response Shape

Existing response objects gain an additive `pagination` key. Example for `query_graph`:

Before:

```json
{ "nodes": [...], "edges": [...], "meta": { ... } }
```

After:

```json
{
  "nodes": [...],
  "edges": [...],
  "meta": { ... },
  "pagination": { "offset": 0, "limit": 50, "total": 243, "hasMore": true }
}
```

### Unchanged

- Compaction middleware — still applies to each page
- Injection guard — unchanged
- Lossless-only tool list — unchanged
- Existing consumers that don't pass `offset`/`limit` — they get page 1 with defaults, plus a `pagination` field they can ignore

## Success Criteria

1. **Pagination utility exists** — `paginate<T>()` in `packages/core` with unit tests covering: empty arrays, offset beyond length, offset=0 default, `hasMore` true/false, `total` computation
2. **All 8 tools accept `offset`/`limit`** — passing `offset`/`limit` returns the correct slice; omitting them returns page 1 with tool-specific defaults
3. **`gather_context` accepts `section` param** — pagination applies within the named section; omitting `section` returns first page of each section
4. **`pagination` field present in all responses** — every paginated tool response includes `{ offset, limit, total, hasMore }` regardless of whether pagination params were passed
5. **Results are relevance-sorted** — each tool sorts by its documented sort key before slicing; test that page 1 items rank higher than page 2 items
6. **Pages fit under compaction budget** — a default-limit page from each tool produces output under 4000 tokens (measured via `estimateTokens()`) for representative test data
7. **Backward compatible** — existing callers that pass no `offset`/`limit` get identical behavior to today, plus the additive `pagination` field
8. **No truncation on page 1** — for default limits, compaction middleware should not need to truncate; truncation marker should not appear on paginated responses under normal conditions
9. **Input schema updated** — tool descriptions document `offset`, `limit`, defaults, and sort key so agents can discover pagination via the schema

## Implementation Order

### Phase 1: Shared Foundation

- Define `PaginationMeta`, `PaginatedSlice<T>`, and `paginate()` in `packages/core/src/compaction/pagination.ts`
- Unit tests for the utility

### Phase 2: Graph Tools (3 tools)

- `query_graph` — paginate `nodes` array, sorted by connectivity
- `get_relationships` — paginate `edges` array, sorted by weight
- `detect_anomalies` — paginate anomaly entries, sorted by Z-score

### Phase 3: Code Navigation & Review (3 tools)

- `code_outline` — paginate file entries, sorted by modification time; replace hard `MAX_FILES = 50` cap with pagination
- `review_changes` — paginate findings, sorted by severity
- `run_code_review` — paginate findings, sorted by severity

### Phase 4: Context & Trends (2 tools)

- `gather_context` — section-aware pagination with `section` param
- `get_decay_trends` — paginate trend entries, sorted by decay magnitude

### Phase 5: Schema & Documentation

- Update all 8 tool input schemas with `offset`, `limit`, and `section` (gather_context only) param definitions
- Document sort keys in tool descriptions
- Integration test: agent-style multi-page fetch across at least 2 tools

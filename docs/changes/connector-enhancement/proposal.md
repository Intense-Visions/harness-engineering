# Connector Enhancement for Business Knowledge Extraction

## Overview

Enhance the existing Jira, Confluence, and Slack connectors to extract richer business knowledge signals, replace hard truncation with configurable limits and LLM-powered summarization, and add a KnowledgeLinker post-processing pass that promotes extracted content into business knowledge graph nodes.

This is Phase 3 of the Business Knowledge System (ADR-001). Phases 1 (Knowledge Foundation) and 2 (Code Signal Extractors) established the graph schema, `BusinessKnowledgeIngestor`, and code-level extraction. This phase closes the gap between external systems (where business decisions live) and the knowledge graph (where skills consume them).

## Goals

1. **Preserve business-critical content** -- Replace the blanket 2000-char truncation with per-connector configurable limits and tiered LLM summarization for long content, so Confluence pages and Jira comment threads don't lose key details.
2. **Extract richer signals from Jira** -- Comments, custom fields, and acceptance criteria contain business rules and requirements that the current connector discards.
3. **Extract richer signals from Confluence** -- Page hierarchy encodes knowledge taxonomy; labels encode domain classification; full page bodies contain the actual knowledge.
4. **Extract richer signals from Slack** -- Thread replies contain decisions; reactions signal consensus. Top-level messages alone capture questions, not answers.
5. **Promote extracted content to business knowledge** -- A KnowledgeLinker post-processing pass scans enriched connector output, identifies business rules/facts via heuristics with confidence scoring, and stages high-confidence extractions for human review.

## Decisions

| #   | Decision                                                                          | Rationale                                                                                                                                                                                                                |
| --- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | KnowledgeLinker uses heuristic-first pattern detection with confidence thresholds | Aligns with Phase 2 extractor pattern. Avoids embedding dependency. Ambiguous cases deferred to human staging pipeline rather than guessed at.                                                                           |
| D2  | Per-connector `maxContentLength` field in `ConnectorConfig`                       | Simplest configurable truncation. One well-typed field with per-connector defaults (Confluence: 8000, Jira: 4000, Slack: 2000). Already supported by `sanitizeExternalText()` signature.                                 |
| D3  | Tiered summarization: truncate below threshold, LLM-summarize above               | Most connector content is short -- LLM only fires for long Confluence pages and Jira issues with extensive comment threads where truncation actually loses information. Falls back to truncation if no model configured. |
| D4  | Jira comments concatenated through tiered summarization pipeline                  | Captures full discussion context. Acceptance criteria extracted into `metadata.acceptanceCriteria`. Custom fields into `metadata.customFields` as key-value pairs.                                                       |
| D5  | Slack thread replies concatenated into parent conversation node                   | Decisions happen in replies, not top-level messages. Reaction counts stored as `metadata.reactions` for KnowledgeLinker confidence boosting.                                                                             |
| D6  | Confluence page hierarchy modeled as `contains` edges between document nodes      | Hierarchy is queryable via graph traversal (`get_relationships`). Labels stored as `metadata.labels: string[]` for filtering.                                                                                            |
| D7  | Foundation-fan implementation order                                               | Shared infrastructure first (truncation config, summarization utility, KnowledgeLinker skeleton), then parallel connector enhancements, then integration. Matches Phase 2 extractor pattern.                             |

## Technical Design

### Configurable Truncation & Tiered Summarization

**ConnectorConfig extension** (`packages/graph/src/ingest/connectors/ConnectorInterface.ts`):

```typescript
interface ConnectorConfig {
  // ... existing fields
  maxContentLength?: number; // Per-connector content limit (default varies by connector)
}
```

**Per-connector defaults:**

| Connector  | Default `maxContentLength` | Rationale                                              |
| ---------- | -------------------------- | ------------------------------------------------------ |
| Confluence | 8000                       | Pages are long-form knowledge; 2000 loses most content |
| Jira       | 4000                       | Issue body + comments can be substantial               |
| Slack      | 2000                       | Individual messages are short; threads add volume      |
| CI         | 200                        | Run names only -- unchanged                            |

**Summarization utility** -- new file `packages/graph/src/ingest/connectors/ContentCondenser.ts`:

```typescript
interface CondenserOptions {
  maxLength: number;
  summarizationThreshold?: number; // Default: 2x maxLength
  modelEndpoint?: string; // OpenAI-compatible endpoint URL
  modelName?: string; // Default: from env or 'default'
}

interface CondenserResult {
  content: string;
  method: 'passthrough' | 'truncated' | 'summarized';
  originalLength: number;
}

async function condenseContent(raw: string, options: CondenserOptions): Promise<CondenserResult>;
```

**Tiered logic:**

1. If `raw.length <= maxLength` -- passthrough (no change)
2. If `raw.length > maxLength` and `raw.length < summarizationThreshold` -- truncate via `sanitizeExternalText(raw, maxLength)`
3. If `raw.length >= summarizationThreshold` and model available -- LLM summarize to fit within `maxLength`, prompt instructs preservation of business rules, SLAs, requirements, and decisions
4. If `raw.length >= summarizationThreshold` and no model -- fallback to truncation

Summarized nodes tagged with `metadata.condensed: 'summarized' | 'truncated'` and `metadata.originalLength: number` for transparency.

### Jira Connector Enhancement

**File:** `packages/graph/src/ingest/connectors/JiraConnector.ts`

**New API calls in `processIssue()`:**

- `GET /rest/api/2/issue/{key}/comment` -- fetch all comments, concatenate chronologically with author + timestamp headers
- Issue fields already available in the existing response -- extract `customfield_*` entries and `description` acceptance criteria blocks

**Content assembly order:**

```
[Summary]
[Description]
[Acceptance Criteria -- extracted from description if present]
[Custom Fields -- key: value pairs]
[Comments -- chronological, author-prefixed]
```

Assembled content runs through `condenseContent()` with the connector's `maxContentLength`.

**Metadata additions to issue node:**

```typescript
metadata: {
  // ...existing (key, status, priority, assignee, labels)
  acceptanceCriteria: string[];     // Parsed from description AC blocks
  customFields: Record<string, string>;  // Non-null custom fields
  commentCount: number;
  condensed?: 'summarized' | 'truncated';
  originalLength?: number;
}
```

### Confluence Connector Enhancement

**File:** `packages/graph/src/ingest/connectors/ConfluenceConnector.ts`

**Changes to `fetchAllPages()`:**

- Request body expansion: `expand=body.storage,ancestors,metadata.labels` (currently only `body.storage`)

**Changes to `processPage()`:**

- Extract `page.ancestors[]` to identify parent page -- create `contains` edge from parent document node to child document node
- Extract `page.metadata.labels.results[].name` -- store as `metadata.labels: string[]`
- Full body content runs through `condenseContent()` at 8000 default limit

**Hierarchy edge creation:**

```typescript
// After creating the document node for this page:
if (page.ancestors?.length > 0) {
  const parentId = page.ancestors[page.ancestors.length - 1].id;
  const parentNodeId = `confluence:${parentId}`;
  store.addEdge({ source: parentNodeId, target: nodeId, type: 'contains' });
}
```

**Metadata additions to document node:**

```typescript
metadata: {
  // ...existing (spaceKey, pageId, status, url)
  labels: string[];
  parentPageId?: string;
  condensed?: 'summarized' | 'truncated';
  originalLength?: number;
}
```

### Slack Connector Enhancement

**File:** `packages/graph/src/ingest/connectors/SlackConnector.ts`

**New API call in `processChannel()`:**

- For messages with `reply_count > 0`: `GET /api/conversations.replies?channel={id}&ts={thread_ts}` -- fetch thread replies
- Extract from `message.reactions[]` if already in payload

**Content assembly:**

```
[Original message text]
[Thread replies -- chronological, author-prefixed]
```

Assembled content runs through `condenseContent()` with connector's `maxContentLength`.

**Metadata additions to conversation node:**

```typescript
metadata: {
  // ...existing (channel, timestamp, author)
  threadReplyCount?: number;
  reactions?: Record<string, number>;  // { "+1": 5, "white_check_mark": 3 }
  condensed?: 'summarized' | 'truncated';
  originalLength?: number;
}
```

### KnowledgeLinker

**New file:** `packages/graph/src/ingest/KnowledgeLinker.ts`

Modeled after `TopologicalLinker` -- a post-processing pass that runs after all connectors complete.

```typescript
interface LinkResult {
  factsCreated: number;
  conceptsClustered: number;
  duplicatesMerged: number;
  stagedForReview: number;
  errors: readonly string[];
}

class KnowledgeLinker {
  constructor(private store: GraphStore) {}
  link(): LinkResult;
}
```

**Three-stage pipeline:**

**Stage 1: Scan** -- Iterate all `issue`, `conversation`, `document` nodes. Apply heuristic patterns to content:

| Pattern                                                      | Signal              | Confidence |
| ------------------------------------------------------------ | ------------------- | ---------- |
| "must", "shall", "required" + domain noun                    | Business rule       | 0.7        |
| SLA/SLO patterns (e.g., `<Ns`, `99.9%`, `within N hours`)    | Business constraint | 0.8        |
| Monetary amounts with context (`$N`, revenue, cost)          | Business fact       | 0.6        |
| Acceptance criteria blocks (Given/When/Then, checkbox lists) | Business rule       | 0.8        |
| Regulatory references (GDPR, SOC2, PCI, HIPAA)               | Business rule       | 0.9        |

Each match produces a candidate `ExtractionRecord` written to `.harness/knowledge/extracted/linker.jsonl`.

**Stage 2: Cluster** -- Group related extractions by domain proximity (shared source node, overlapping keywords). Clusters with 3+ facts create a `business_concept` node.

**Stage 3: Promote** -- Extractions with confidence >= 0.8 create `business_fact` nodes directly. Extractions between 0.5-0.8 go to `.harness/knowledge/staged/` for human review. Below 0.5 are discarded.

**Deduplication:** Before creating a `business_fact`, check existing facts for overlapping content from different sources (same rule from Jira AND Confluence). Merge into single fact with multiple evidence citations in `metadata.sources[]`.

**Reaction boost:** For `conversation` nodes with high-signal reactions (`metadata.reactions`), boost confidence by 0.1 (capped at 1.0).

### Integration Points

**SyncManager** (`packages/graph/src/ingest/connectors/SyncManager.ts`):

- After `syncAll()` completes, invoke `KnowledgeLinker.link()` as post-processing step
- Add `condenseContent` import for connector use

**ConnectorUtils** (`packages/graph/src/ingest/connectors/ConnectorUtils.ts`):

- `sanitizeExternalText()` unchanged -- still handles prompt injection defense
- `condenseContent()` wraps sanitization + tiered summarization in new `ContentCondenser.ts`

### File Layout

```
packages/graph/src/ingest/
  connectors/
    ConnectorInterface.ts    # + maxContentLength field
    ConnectorUtils.ts        # unchanged
    ContentCondenser.ts      # NEW -- tiered summarization
    JiraConnector.ts         # enhanced
    ConfluenceConnector.ts   # enhanced
    SlackConnector.ts        # enhanced
    CIConnector.ts           # unchanged
    SyncManager.ts           # + KnowledgeLinker invocation
  KnowledgeLinker.ts         # NEW -- post-processing pass
```

## Success Criteria

### Truncation & Summarization

1. Each connector reads `maxContentLength` from its `ConnectorConfig` and applies it (Confluence: 8000, Jira: 4000, Slack: 2000, CI: 200 defaults)
2. Content exceeding the summarization threshold (2x `maxContentLength`) is LLM-summarized when a model endpoint is configured
3. When no model is configured, content falls back to truncation -- connector sync never fails due to missing model
4. Condensed nodes carry `metadata.condensed` and `metadata.originalLength` for transparency

### Jira Connector

5. Issue nodes include comment text (all comments, chronological, author-prefixed) in their content field
6. Acceptance criteria parsed from description are stored as `metadata.acceptanceCriteria: string[]`
7. Non-null custom fields stored as `metadata.customFields: Record<string, string>`
8. Assembled content (summary + description + acceptance criteria + custom fields + comments) runs through `condenseContent()`

### Confluence Connector

9. Document nodes for child pages have `contains` edges from their parent document node
10. Page labels stored as `metadata.labels: string[]`
11. Full page body content is fetched and runs through `condenseContent()` at 8000-char default
12. Pages with ancestors correctly resolve parent node IDs for edge creation

### Slack Connector

13. Messages with thread replies include reply text concatenated into the conversation node content
14. Reaction counts stored as `metadata.reactions: Record<string, number>`
15. Thread reply count stored as `metadata.threadReplyCount`

### KnowledgeLinker

16. Runs as post-processing after `SyncManager.syncAll()` completes
17. Scans `issue`, `conversation`, `document` nodes and applies heuristic patterns to identify business rules/facts
18. Extractions with confidence >= 0.8 create `business_fact` nodes in the graph
19. Extractions between 0.5-0.8 are written to `.harness/knowledge/staged/` for human review
20. Duplicate facts from multiple sources are merged into a single node with `metadata.sources[]`
21. Conversation nodes with high-signal reactions get a 0.1 confidence boost
22. Related extractions (3+ facts sharing domain proximity) cluster into `business_concept` nodes
23. All extractions written to `.harness/knowledge/extracted/linker.jsonl`

### Integration

24. `harness validate` passes after all changes
25. Existing connector tests continue to pass (no breaking changes to `GraphConnector` interface)
26. `ConnectorConfig.maxContentLength` is optional -- omitting it preserves current behavior

## Implementation Order

### Phase A: Shared Infrastructure (Foundation)

1. **`ConnectorConfig` extension** -- Add optional `maxContentLength` field to the interface
2. **`ContentCondenser`** -- New module with tiered logic (passthrough, truncate, LLM-summarize, fallback). Unit tests against all four tiers including model-unavailable fallback
3. **KnowledgeLinker skeleton** -- Class structure, heuristic pattern registry, confidence scoring framework, JSONL output to `.harness/knowledge/extracted/linker.jsonl`. Unit tests with mock graph store

### Phase B: Connector Enhancements (Parallel Fan-Out)

These three are independent and share no code beyond the Phase A foundation:

4. **Jira** -- Comments API integration, acceptance criteria parser, custom fields extraction, `condenseContent()` wiring. Tests with mocked HTTP responses
5. **Confluence** -- Ancestors/labels expansion, parent-child `contains` edge creation, `condenseContent()` wiring. Tests with mocked page hierarchies
6. **Slack** -- Thread replies via `conversations.replies`, reaction metadata extraction, `condenseContent()` wiring. Tests with mocked thread payloads

### Phase C: Integration & Polish

7. **KnowledgeLinker full pipeline** -- Wire heuristic scanning over real connector node types, clustering logic, promotion/staging, deduplication, reaction confidence boost. Integration tests with populated graph
8. **SyncManager integration** -- Invoke `KnowledgeLinker.link()` after `syncAll()` completes
9. **End-to-end validation** -- `harness validate`, verify no regressions in existing connector tests, verify business knowledge nodes appear in graph after full sync cycle

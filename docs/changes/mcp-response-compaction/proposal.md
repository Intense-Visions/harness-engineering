# MCP Response Compaction

## Overview and Goals

**Problem:** Harness MCP tools return verbose responses that consume large portions of the AI's context window. Agents make multiple round-trips to assemble context that could be delivered as one packed payload. This inflates token usage, increases latency, and leaves less room for reasoning.

**Goals:**

1. All harness MCP tool responses are automatically compacted (losslessly) before returning to the AI
2. A dedicated `compact` MCP tool lets the AI explicitly pack content, resolve intents into aggregated responses, or re-summarize prior tool output
3. No silent information loss — compaction is semantic-preserving by default; lossy strategies are opt-in
4. Debugging is not impaired — `compact: false` on any tool call bypasses middleware and returns raw output

**Out of scope:**

- Compacting requests coming _from_ the AI (input-side compression)
- Embedding-based or LLM-based semantic summarization in the auto-compaction middleware (opt-in only via `compact` tool — future work)
- Non-harness MCP servers

---

## Decisions

| #   | Decision                                                                                   | Rationale                                                                                           |
| --- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| 1   | Auto-compaction middleware on all MCP tool responses                                       | Single implementation point; no per-tool opt-in required; uniform behavior                          |
| 2   | Middleware applies lossless strategies only (structural + prioritized truncation)          | Preserves quality by default; lossy strategies require explicit AI intent                           |
| 3   | Dedicated `compact` tool accepts content, intents, and response refs                       | Covers all input types without requiring the AI to know which sub-tool to call                      |
| 4   | `compact` tool with intent input acts as active aggregator (repomix-style)                 | Eliminates multi-round-trip patterns; one coherent packed response beats five fragmented ones       |
| 5   | Lossy strategies (semantic summarization) are opt-in via `compact` tool only               | Never auto-applied; AI must explicitly request and accept quality tradeoff                          |
| 6   | `compact: false` handled at middleware layer, not per-tool                                 | Inspecting incoming args at middleware avoids editing 50+ individual tools                          |
| 7   | Packed envelopes preserve source attribution                                               | AI must be able to tell what context came from which tool or file                                   |
| 8   | Prioritized truncation over tail-cutting                                                   | Preserve identifiers, errors, paths first; cut verbose middle sections last                         |
| 9   | Middleware applies to all graph tool responses (`gather_context`, `find_context_for`)      | Graph responses are among the most verbose; existing `tokenBudget` only truncates, not restructures |
| 10  | `compact` tool intent routing uses FusionLayer graph search to determine what to aggregate | Graph-aware routing avoids hardcoded tool lists; adapts to project context                          |
| 11  | Pre-computed packed graph nodes for common intents (opt-in, freshness TTL required)        | Reduces latency on hot-path intents; invalidated via GitIngestor change detection                   |

---

## Technical Design

### 1. Compaction Middleware

A response interceptor wraps all MCP tool handlers at registration time. No per-tool changes required.

**Location:** `packages/cli/src/mcp/middleware/compaction.ts`

```typescript
interface CompactionStrategy {
  name: 'structural' | 'truncate' | 'pack' | 'semantic';
  lossy: boolean;
  apply(content: string, budget?: number): string;
}

interface CompactionMiddleware {
  wrap(toolName: string, handler: ToolHandler): ToolHandler;
}
```

**Default pipeline (lossless only):**

1. **Structural pass** — remove empty fields, collapse single-item arrays, strip redundant whitespace, normalize JSON
2. **Truncation pass** — if output exceeds `tokenBudget` (default: 4000 tokens), apply prioritized truncation: preserve identifiers, file paths, error messages, status fields first; cut verbose middle sections last

**`compact: false` escape hatch:** Middleware inspects incoming tool arguments. When `compact: false` is present, middleware is bypassed entirely and raw output returned. No per-tool changes required.

**Registration point:** `packages/cli/src/mcp/server.ts` — wrap all tool handlers on startup.

---

### 2. `compact` MCP Tool

**Location:** `packages/cli/src/mcp/tools/compact.ts`

**Input schema:**

```typescript
interface CompactInput {
  path: string;

  // Mode A: content — compress provided string directly
  content?: string;

  // Mode B: intent — aggregate via graph then pack
  intent?: string;

  // Mode C: ref — re-compress prior tool output (AI pastes it in; ref.source is a label)
  ref?: { source: string; content: string };

  // Options
  strategies?: Array<'structural' | 'truncate' | 'pack' | 'semantic'>;
  tokenBudget?: number; // default: 2000
}
```

**Mode routing:**

| Input present        | Behavior                                                                    |
| -------------------- | --------------------------------------------------------------------------- |
| `content`            | Apply selected strategies to content directly                               |
| `intent`             | FusionLayer search → collect relevant tool responses → pack into envelope   |
| `ref`                | Apply strategies to `ref.content`, preserve `ref.source` in envelope header |
| `intent` + `content` | Graph search scoped by content as filter context                            |

**Intent routing flow (Mode B):**

1. Check graph for cached `PackedSummary` node matching intent (TTL < 1h) — return if found
2. Call `find_context_for(path, intent, tokenBudget)` — FusionLayer search
3. Collect relevant node types (files, specs, state sections)
4. Fetch each via appropriate sub-tool
5. Apply structural pass to each result
6. Pack into `PackedEnvelope`
7. Write `PackedSummary` node to graph for future cache hits

---

### 3. Packed Envelope Format

```typescript
interface PackedEnvelope {
  meta: {
    strategy: string[];
    originalTokenEstimate: number;
    compactedTokenEstimate: number;
    reductionPct: number;
    cached: boolean;
  };
  sections: Array<{
    source: string; // tool name, file path, or section label
    content: string;
  }>;
}
```

Serialized as structured markdown for readability:

```
<!-- packed: structural+truncate | 4200→1100 tokens (-74%) -->
### [gather_context]
...compacted content...

### [docs/changes/skill-dispatch/proposal.md]
...compacted content...
```

---

### 4. Pre-computed Graph Nodes

**Node type:** `PackedSummary` in the Knowledge Graph
**Keyed by:** normalized intent string
**TTL:** 1 hour
**Invalidation:** GitIngestor change detection — when source nodes are modified, their dependent `PackedSummary` nodes are marked stale
**Written by:** `compact` tool on first intent resolution
**Read by:** `compact` tool before live aggregation (cache hit skips sub-tool calls)

---

### 5. File Layout

```
packages/
  core/src/compaction/
    strategies/
      structural.ts       # lossless structural compression
      truncation.ts       # prioritized budget truncation
    pipeline.ts           # compose strategies into a pipeline
    envelope.ts           # PackedEnvelope type + markdown serializer
  cli/src/mcp/
    middleware/
      compaction.ts       # wraps all tool handlers at registration
    tools/
      compact.ts          # new compact tool
```

---

## Success Criteria

**When [any harness MCP tool returns a response], the system shall apply lossless compaction before delivery to the AI.**

**When [compaction is applied], the system shall not drop identifiers, file paths, error messages, or status fields.**

**When [a tool is called with `compact: false`], the system shall return the raw uncompacted response.**

**When [the AI calls `compact` with `content`], the system shall return a compacted version using the specified or default strategies.**

**When [the AI calls `compact` with `intent`], the system shall resolve relevant context via FusionLayer, aggregate results, and return a single packed envelope.**

**When [the AI calls `compact` with `ref`], the system shall apply strategies to the provided content and preserve source attribution in the envelope header.**

**When [a `compact` intent call is made and a cached PackedSummary node exists (TTL < 1h)], the system shall return the cached result without making sub-tool calls.**

**When [a `compact` intent call produces a new result], the system shall write a PackedSummary node to the graph.**

**When [compaction is applied], the system shall include reduction metadata (original tokens, compacted tokens, reduction %) in the envelope.**

**Observable targets:**

- Auto-compaction achieves ≥20% token reduction on average across all tool responses
- `compact(intent)` resolves in ≤2 tool round-trips (graph search + pack)
- No existing harness MCP tool tests break with middleware applied
- `compact: false` returns byte-identical output to pre-middleware baseline

---

## Implementation Order

### Phase 1: Foundation

- `packages/core/src/compaction/strategies/structural.ts` — lossless structural compressor
- `packages/core/src/compaction/strategies/truncation.ts` — prioritized budget truncation
- `packages/core/src/compaction/pipeline.ts` — compose strategies
- `packages/core/src/compaction/envelope.ts` — `PackedEnvelope` type + markdown serializer
- Unit tests for each strategy against known fixtures

### Phase 2: Middleware

- `packages/cli/src/mcp/middleware/compaction.ts` — response interceptor
- Wire into `packages/cli/src/mcp/server.ts` at tool registration
- `compact: false` escape hatch via middleware arg inspection
- Integration tests: verify existing tool outputs pass through with no broken tests; verify reduction metrics

### Phase 3: `compact` Tool

- `packages/cli/src/mcp/tools/compact.ts` — all three input modes (content, intent, ref)
- Intent mode wired to `find_context_for` + sub-tool aggregation
- Packed envelope serialization with source attribution
- Tests for each mode

### Phase 4: Graph Cache

- `PackedSummary` node type added to graph schema
- TTL + invalidation logic via GitIngestor change detection
- `compact(intent)` checks cache before live aggregation
- Cache write on first resolution

### Phase 5: Prompt Caching with Content Stability Classification

- See [dedicated spec](../prompt-caching-provider-adapters/proposal.md)
- Content stability classification (`static`, `session`, `ephemeral`)
- Provider-specific cache adapters (Anthropic `cache_control`, OpenAI content ordering, Gemini `cachedContents`)
- MCP resource stability hints for client-side optimization
- Orchestrator integration for direct API call caching
- Sub-phases: 5a Types, 5b Adapters, 5c MCP Hints, 5d Orchestrator, 5e Observability

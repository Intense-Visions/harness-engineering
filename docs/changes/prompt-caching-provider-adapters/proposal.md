# Prompt Caching with Content Stability Classification

## Overview and Goals

**Problem:** Harness delivers large, stable content (skills index, graph context, architectural rules, tool definitions) to LLM clients via MCP and will soon make direct API calls via the orchestrator. This content is repeated across tool invocations and sessions but is never marked as cacheable. All three major LLM providers (Anthropic, OpenAI, Google Gemini) offer prompt caching that reduces input token costs by 50-90% -- but only when content is properly classified and annotated.

**Goals:**

1. Classify all harness content by stability tier (`static`, `session`, `ephemeral`) so caching strategies can be applied automatically
2. Provider adapters (Anthropic, OpenAI, Gemini) map stability tiers to provider-specific cache directives
3. MCP resources expose stability metadata so clients can optimize their own caching
4. Orchestrator API calls apply cache directives to system prompts and tool definitions
5. Existing `cacheCreationTokens`/`cacheReadTokens` tracking wired to real API response values

**Out of scope:**

- Modifying Claude Code's internal caching behavior (Anthropic server-side)
- Embedding/semantic caching of tool responses (covered by compaction Phase 4)
- Cache cost budgeting or alerting (future work)

**Keywords:** prompt-caching, cache-control, ephemeral, stability-classification, provider-adapters, MCP-resources, orchestrator, token-optimization

**Relationship:** Phase 5 of the [MCP Response Compaction](../mcp-response-compaction/proposal.md) spec. Compaction reduces token count; caching reduces cost of remaining tokens.

---

## Decisions

| #   | Decision                                                                                                                | Rationale                                                                                                   |
| --- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1   | Three-tier stability classification: `static`, `session`, `ephemeral`                                                   | Maps cleanly to all three providers' caching models; simple enough to maintain, granular enough to optimize |
| 2   | Stability metadata in skill.yaml and graph node type definitions                                                        | Colocated with the content it describes; no separate registry to maintain                                   |
| 3   | Provider adapters behind a unified `CacheAdapter` interface                                                             | Isolates provider-specific API differences; new providers added without touching classification logic       |
| 4   | Anthropic: explicit `cache_control` breakpoints on static/session content                                               | Explicit control outperforms automatic mode for predictable, large stable blocks                            |
| 5   | OpenAI: content ordering by stability (static first, ephemeral last)                                                    | OpenAI's automatic prefix-matching caching requires no API changes, only content ordering                   |
| 6   | Gemini: `cachedContents` resource for static content, implicit caching for session                                      | Avoids per-request storage costs on session-scoped content that changes between sessions                    |
| 7   | MCP resources annotated with `stability` field in resource metadata                                                     | Clients that support caching can use hints; clients that don't can ignore them                              |
| 8   | Orchestrator `AgentBackend` interface extended with cache-aware message construction                                    | Cache directives applied at message assembly, not scattered across individual tools                         |
| 9   | Wire real `cache_creation_input_tokens` / `cache_read_input_tokens` from API responses into existing UsageRecord fields | Infrastructure already exists in `packages/types/src/usage.ts`; just needs real data instead of zeros       |
| 10  | Phase 5 of the MCP Response Compaction spec                                                                             | Compaction reduces token count, caching reduces cost of remaining tokens -- complementary, not competing    |

---

## Technical Design

### 1. Stability Classification Schema

```typescript
// packages/types/src/caching.ts

type StabilityTier = 'static' | 'session' | 'ephemeral';

interface StabilityMetadata {
  stability: StabilityTier;
  ttlHint?: string; // e.g., '1h', '5m' -- advisory, provider adapters decide actual TTL
}
```

| Tier        | Definition                                       | Examples                                                              | Change frequency |
| ----------- | ------------------------------------------------ | --------------------------------------------------------------------- | ---------------- |
| `static`    | Changes only on deploy/update                    | Skills index, tool definitions, skill.yaml metadata, SKILL.md content | Days to weeks    |
| `session`   | Stable within a session, varies between sessions | Graph context, architectural rules, project state, learnings          | Per-session      |
| `ephemeral` | Changes per call                                 | Tool responses, diff content, file reads                              | Per-invocation   |

### 2. Where Stability Tags Live

**skill.yaml** -- new optional field:

```yaml
name: harness-brainstorming
stability: static # skills index entry is static
```

**Graph node types** -- classified in schema:

```typescript
// packages/graph/src/schema/node-types.ts
const NODE_STABILITY: Record<string, StabilityTier> = {
  File: 'session',
  Function: 'session',
  Class: 'session',
  Constraint: 'session',
  PackedSummary: 'session',
  SkillDefinition: 'static',
  ToolDefinition: 'static',
};
```

**MCP resources** -- metadata annotation:

```typescript
// packages/cli/src/mcp/resources/skills.ts
server.resource('skills-index', {
  description: 'Skill catalog',
  stability: 'static',
  // ...
});
```

### 3. Provider Cache Adapters

```typescript
// packages/core/src/caching/adapter.ts

interface CacheAdapter {
  provider: 'claude' | 'openai' | 'gemini';

  /** Wrap a system prompt block with cache directives */
  wrapSystemBlock(content: string, stability: StabilityTier): ProviderSystemBlock;

  /** Wrap tool definitions with cache directives */
  wrapTools(tools: ToolDefinition[], stability: StabilityTier): ProviderToolBlock;

  /** Order message content for optimal cache hit rates */
  orderContent(blocks: StabilityTaggedBlock[]): StabilityTaggedBlock[];

  /** Extract cache token counts from provider response */
  parseCacheUsage(response: unknown): { cacheCreationTokens: number; cacheReadTokens: number };
}
```

**Anthropic adapter:**

```typescript
// packages/core/src/caching/adapters/anthropic.ts

wrapSystemBlock(content, stability) {
  if (stability === 'ephemeral') return { type: 'text', text: content };
  const ttl = stability === 'static' ? '1h' : undefined; // 5m default for session
  return {
    type: 'text',
    text: content,
    cache_control: { type: 'ephemeral', ...(ttl && { ttl }) },
  };
}

parseCacheUsage(response) {
  return {
    cacheCreationTokens: response.usage?.cache_creation_input_tokens ?? 0,
    cacheReadTokens: response.usage?.cache_read_input_tokens ?? 0,
  };
}
```

**OpenAI adapter:**

```typescript
// packages/core/src/caching/adapters/openai.ts

orderContent(blocks) {
  // Static first, then session, then ephemeral -- maximizes prefix cache hits
  return blocks.sort((a, b) => TIER_ORDER[a.stability] - TIER_ORDER[b.stability]);
}

parseCacheUsage(response) {
  return {
    cacheCreationTokens: 0, // OpenAI doesn't separate creation
    cacheReadTokens: response.usage?.prompt_tokens_details?.cached_tokens ?? 0,
  };
}
```

**Gemini adapter:**

```typescript
// packages/core/src/caching/adapters/gemini.ts

// Static content -> explicit cachedContents resource
async ensureCache(content: string, model: string): Promise<string> {
  // Returns cachedContents/{id}, creates if not exists, refreshes TTL if exists
}

// Session content -> no explicit cache (relies on implicit caching in 2.5+)
wrapSystemBlock(content, stability) {
  if (stability === 'static') return { cachedContentRef: this.cacheId };
  return { parts: [{ text: content }] };
}

parseCacheUsage(response) {
  return {
    cacheCreationTokens: 0, // Gemini doesn't separate in response
    cacheReadTokens: response.usageMetadata?.cachedContentTokenCount ?? 0,
  };
}
```

### 4. Integration Surfaces

**Surface 1: MCP Resources** (`packages/cli/src/mcp/resources/`)

- Each resource descriptor gains a `stability` field
- Serialized into resource metadata for client consumption
- No behavioral change in harness -- purely advisory for clients

**Surface 2: Orchestrator Agent Dispatch** (`packages/orchestrator/`)

- `AgentBackend.buildMessages()` calls `CacheAdapter.orderContent()` and `wrapSystemBlock()` to construct cache-optimized message arrays
- `AgentBackend.parseResponse()` calls `parseCacheUsage()` to extract real cache metrics
- Cache metrics flow into existing `UsageRecord` -> `SessionUsage` -> `DailyUsage` pipeline

### 5. File Layout

```
packages/
  types/src/
    caching.ts                    # StabilityTier, StabilityMetadata types
  core/src/caching/
    adapter.ts                    # CacheAdapter interface
    adapters/
      anthropic.ts                # Anthropic cache_control implementation
      openai.ts                   # OpenAI content ordering implementation
      gemini.ts                   # Gemini cachedContents lifecycle
    stability.ts                  # Resolve stability tier for content blocks
  graph/src/schema/
    node-types.ts                 # NODE_STABILITY map (amended)
  cli/src/mcp/resources/
    *.ts                          # stability field added to each resource
  orchestrator/src/backends/
    *.ts                          # CacheAdapter wired into message construction
```

---

## Success Criteria

**When [the orchestrator creates an OpenAI backend session], the system shall initialize an OpenAI client and support multi-turn streaming chat completions via the `AgentBackend` interface.**

**When [the orchestrator creates a Gemini backend session], the system shall initialize a GenerativeModel and support multi-turn streaming generateContent via the `AgentBackend` interface.**

**When [the orchestrator dispatches an agent via the Anthropic backend], the system shall add `cache_control` breakpoints to all `static` and `session` content blocks in the API request.**

**When [the orchestrator dispatches an agent via the OpenAI backend], the system shall order message content with `static` blocks first, `session` blocks second, and `ephemeral` blocks last.**

**When [the orchestrator dispatches an agent via the Gemini backend], the system shall create or reuse a `cachedContents` resource for `static` content and reference it by name in the API request.**

**When [any orchestrator API call completes], the system shall extract provider-specific cache token counts and record them in the existing `UsageRecord.cacheCreationTokens` and `UsageRecord.cacheReadTokens` fields.**

**When [an MCP resource is served to a client], the resource metadata shall include a `stability` field reflecting its classification (`static`, `session`, or `ephemeral`).**

**When [a skill.yaml defines `stability: static`], the skills index MCP resource shall propagate that classification to the resource metadata.**

**When [a graph node type is looked up for caching purposes], the system shall return the stability tier from the `NODE_STABILITY` map, defaulting to `ephemeral` for unknown types.**

**If [a `cachedContents` resource expires or is invalidated on Gemini], the system shall not fail the request -- it shall fall back to uncached content and recreate the cache on the next call.**

**If [a provider does not support prompt caching], the adapter shall apply no cache directives and return zero for cache token fields (no-op passthrough).**

**Observable targets:**

- Anthropic API responses show `cache_read_input_tokens > 0` on second and subsequent calls within a session
- OpenAI API responses show `prompt_tokens_details.cached_tokens > 0` on repeated stable prefixes
- Gemini API responses reference an active `cachedContents` resource for static content
- `harness usage session <id>` displays cache hit rate and estimated savings
- All existing MCP tool tests pass unchanged (stability metadata is additive)

---

## Implementation Order

This is Phase 5 of the MCP Response Compaction spec. Phases 1-4 (compaction strategies, middleware, compact tool, graph cache) are prerequisites.

### Phase 5a: Types and Classification

- `packages/types/src/caching.ts` -- `StabilityTier`, `StabilityMetadata` types
- `packages/core/src/caching/stability.ts` -- resolver function that maps content blocks to stability tiers
- `packages/graph/src/schema/node-types.ts` -- add `NODE_STABILITY` map
- Add `stability` field to skill.yaml schema in `packages/types/src/skill.ts`
- Tag all existing skill.yaml files with `stability: static`
- Unit tests for stability resolution

### Phase 5b: Provider Adapters

- `packages/core/src/caching/adapter.ts` -- `CacheAdapter` interface
- `packages/core/src/caching/adapters/anthropic.ts` -- `cache_control` breakpoints, `parseCacheUsage`
- `packages/core/src/caching/adapters/openai.ts` -- content ordering, `parseCacheUsage`
- `packages/core/src/caching/adapters/gemini.ts` -- `cachedContents` lifecycle, `parseCacheUsage`
- Unit tests per adapter (mock provider responses to verify correct directives and usage extraction)

### Phase 5c: MCP Resource Hints

- Annotate each resource in `packages/cli/src/mcp/resources/*.ts` with `stability` field
- Verify stability metadata appears in MCP resource descriptors served to clients
- Integration test: resource listing includes stability metadata

### Phase 5d: OpenAI AgentBackend

<!-- complexity: medium -->

Implements the `AgentBackend` interface using the OpenAI SDK for direct API calls.

- Add `openai` SDK dependency to `packages/orchestrator/package.json`
- `packages/orchestrator/src/agent/backends/openai.ts` -- `OpenAIBackend` implementing `AgentBackend`
  - `startSession()`: initialize OpenAI client with API key from env/config
  - `runTurn()`: async generator yielding `AgentEvent` from streaming chat completions
  - `stopSession()`: cleanup
  - `healthCheck()`: models.list() call
- Support `systemPrompt` from `SessionStartParams` as system message
- Extract `TokenUsage` from response `usage` field including `prompt_tokens_details.cached_tokens`
- Unit tests with mocked OpenAI responses (streaming chunks)
- Reference: `ClaudeBackend` at `packages/orchestrator/src/agent/backends/claude.ts`

### Phase 5e: Gemini AgentBackend

<!-- complexity: medium -->

Implements the `AgentBackend` interface using the Google Generative AI SDK for direct API calls.

- Add `@google/generative-ai` SDK dependency to `packages/orchestrator/package.json`
- `packages/orchestrator/src/agent/backends/gemini.ts` -- `GeminiBackend` implementing `AgentBackend`
  - `startSession()`: initialize GenerativeModel with API key from env/config
  - `runTurn()`: async generator yielding `AgentEvent` from streaming generateContent
  - `stopSession()`: cleanup
  - `healthCheck()`: list models call
- Support `systemPrompt` from `SessionStartParams` as `systemInstruction`
- Extract `TokenUsage` from `usageMetadata` including `cachedContentTokenCount`
- Unit tests with mocked Gemini responses (streaming chunks)

### Phase 5f: Orchestrator Cache Integration

<!-- complexity: medium -->

Wires cache adapters into all three direct-API backends and the existing Claude backend.

- Extend `AgentBackend` with optional `cacheAdapter?: CacheAdapter` field
- Wire Anthropic adapter into a new `AnthropicBackend` (direct SDK, not the subprocess Claude backend)
  - Add `@anthropic-ai/sdk` dependency
  - `packages/orchestrator/src/agent/backends/anthropic.ts` -- direct API backend with `cache_control` on system/tool blocks
- Wire OpenAI adapter into `OpenAIBackend` -- content ordering by stability tier
- Wire Gemini adapter into `GeminiBackend` -- `cachedContents` resource management
- Wire `parseCacheUsage()` from all backends into `TurnResult.usage` (extend `TokenUsage` with `cacheCreationTokens`, `cacheReadTokens`)
- Update `AgentRunner` to propagate cache usage through event stream
- Integration tests: verify cache directives appear in constructed API requests

### Phase 5g: Observability

<!-- complexity: low -->

- `harness usage session <id>` shows cache hit rate (cache read tokens / total input tokens)
- `harness usage daily` shows aggregate cache savings in cost summary
- Add cache metrics to `<!-- packed: ... -->` header when both compaction and caching are active
- Backend selection exposed in orchestrator TUI (`AgentsTable` shows backend name)

**Dependency chain:** 5a -> 5b -> 5c (independent) | 5d -> 5e -> 5f -> 5g

Note: 5c (MCP resource hints) can ship independently once 5a is done. 5d and 5e (new backends) are prerequisites for 5f (cache wiring). 5f also introduces a direct Anthropic SDK backend separate from the subprocess-based Claude backend.

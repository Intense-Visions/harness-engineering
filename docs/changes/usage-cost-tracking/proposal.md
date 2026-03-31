# Usage & Cost Tracking

**Keywords:** tokens, pricing, cost, sessions, JSONL, LiteLLM, CLI, burn-rate, aggregation, model

## Overview

Usage & Cost Tracking gives harness users visibility into their AI token spend across sessions, days, and models. It reads from the existing cost-tracker hook's JSONL output, calculates costs at display time using a LiteLLM-backed pricing module with static fallback, and ships four CLI commands. Claude Code native session parsing is available via opt-in flag for model identification and historical data.

### Goals

1. Every harness session's token usage is recorded and queryable via CLI
2. Users can see daily spend trends, per-session breakdowns, and latest session cost
3. Pricing stays current via LiteLLM with graceful offline degradation to bundled static data
4. Claude Code sessions are parseable when explicitly opted in, but the feature works without them

### Non-goals

- Team/org aggregation dashboards (future scope — orchestrator enrichment)
- Real-time cost alerting or budget caps
- Billing integration with any cloud provider
- Automatic cost optimization recommendations
- Live streaming burn rate (requires per-turn hook support from Claude Code)

## Decisions

| Decision                | Choice                                                                                       | Rationale                                                                                                                                                                                       |
| ----------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pricing source          | LiteLLM JSON from pinned GitHub raw URL with 24h disk cache + bundled `fallback.json`        | Always current when online; works offline/CI via fallback; no npm dependency — single HTTP fetch                                                                                                |
| Cost calculation timing | At read time (when CLI commands run), not at write time (hook)                               | The Stop hook receives whatever Claude Code provides — we cannot control its payload. Calculating at read time lets us use the best available pricing data and handle unknown models gracefully |
| Session data source     | Harness cost-tracker JSONL primary; Claude Code JSONL opt-in via `--include-claude-sessions` | CC format is undocumented/unstable; opt-in contains blast radius of breakage                                                                                                                    |
| CLI surface             | Four subcommands: `daily`, `sessions`, `session <id>`, `latest`                              | Purpose-built views; `sessions` lists, `session` details; `latest` replaces "live burn rate" concept (infeasible with Stop-only hook)                                                           |
| Type design             | New `UsageRecord` type composes `TokenUsage` — does not extend it                            | `TokenUsage` stays a pure token counter; `model` and `costUSD` are identity/derived fields that belong in a separate type                                                                       |
| Cost precision          | Integer microdollars internally (USD \* 1,000,000); 4 decimal places on display              | Avoids IEEE 754 floating-point drift across thousands of accumulated turns                                                                                                                      |
| Unknown model pricing   | Return `null`, display as "unavailable", log warning                                         | Graceful degradation for fine-tuned models, new releases, or missing pricing data                                                                                                               |
| Scope boundary          | Core pricing + CLI commands; defer orchestrator aggregation and cross-project views          | Ship the valuable 80% fast; orchestrator enrichment is a clean follow-up                                                                                                                        |

## Technical Design

### Types

New type in `packages/types/src/usage.ts`:

```typescript
/** Raw token counts — unchanged, stays a pure counter */
interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/** Extended entry for cost tracking storage and display */
interface UsageRecord {
  sessionId: string;
  timestamp: string;
  tokens: TokenUsage;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  model?: string; // populated from CC session data or hook payload
  costMicroUSD?: number; // integer microdollars, calculated at read time
}
```

### Pricing Module

Location: `packages/core/src/pricing/`

- `pricing.ts` — `getModelPrice(model: string): ModelPricing | null`
  - Returns `{ inputPer1M, outputPer1M, cacheReadPer1M?, cacheWritePer1M? }` or `null` if model unknown
  - Logs warning on `null` return suggesting pricing update
- `cache.ts` — Disk cache at `.harness/cache/pricing.json` with 24h TTL
  - Fetches from pinned LiteLLM GitHub raw URL (documented in source)
  - On fetch failure: uses disk cache regardless of TTL; if no cache, uses `fallback.json`
  - When fallback is used for >7 days, emits staleness warning
- `fallback.json` — Bundled static pricing for Claude (Opus, Sonnet, Haiku), GPT-4o, Gemini models
  - Updated with each harness release
- `calculator.ts` — `calculateCost(record: UsageRecord): number | null`
  - Returns microdollars or `null` if model pricing unavailable
  - Multiplies token counts by per-model rates

### Cost-Tracker Hook

Location: `packages/cli/src/hooks/cost-tracker.js`

Current behavior (unchanged): Receives Stop event stdin, writes `{ timestamp, session_id, token_usage }` to `.harness/metrics/costs.jsonl`.

Update: Also write `cacheCreationTokens` and `cacheReadTokens` if present in the Stop event payload. The hook writes whatever fields it receives — no assumptions about upstream contract. Cost calculation happens at read time, not here.

Backward compatibility: Old JSONL entries without new fields are valid. The aggregator treats missing fields as absent/unknown.

### CLI Commands

Location: `packages/cli/src/commands/usage.ts` (follows `perf.ts` pattern)

**`harness usage daily [--days N] [--json]`**

- Reads `.harness/metrics/costs.jsonl`, groups by date
- Displays table: date | sessions | input tokens | output tokens | model(s) | cost
- Default: 7 days. Max: 90 days.
- Model breakdown per row (most-used model, with "and N others" if multiple)
- `--json` outputs array of day records

**`harness usage sessions [--limit N] [--json]`**

- Lists recent sessions with timestamp, duration, token count, model, cost
- Default: 10 sessions. Max: 100.
- `--json` outputs array of session records

**`harness usage session <id> [--json]`**

- Detail view: full token breakdown (input, output, cache read, cache write), model, cost
- If `id` not found: error with "did you mean?" suggestion from fuzzy match
- `--json` outputs single session record

**`harness usage latest [--json]`**

- Shows the most recently completed session's cost summary
- If `--include-claude-sessions` is enabled, reads CC's most recent session for richer data
- Shortcut for `harness usage session <most-recent-id>`
- `--json` outputs single session record

**All commands support:**

- `--include-claude-sessions` — Merges Claude Code JSONL data from `~/.claude/projects/*/*.jsonl`
- `--json` — Machine-readable output for piping to external tools

### Claude Code JSONL Parser

Location: `packages/core/src/usage/cc-parser.ts`

- Reads `~/.claude/projects/*/*.jsonl` (best-effort — this path is not a public API and may change across Claude Code versions)
- Extracts token usage events, maps to `UsageRecord`
- Only invoked when `--include-claude-sessions` flag is passed
- Graceful degradation: unparseable entries are skipped with a warning; path changes result in zero files found (no error, just no CC data)
- Primary value: provides `model` field that the harness hook may not receive

### Aggregation

Location: `packages/core/src/usage/aggregator.ts`

- `aggregateByDay(records: UsageRecord[]): DailyUsage[]`
- `aggregateBySession(records: UsageRecord[]): SessionUsage[]`
- Merges harness JSONL + CC JSONL records by session ID when both sources are available
- Deduplication: if both sources have data for the same session, harness data is authoritative for token counts; CC data supplements model identification

### File Layout

```
packages/types/src/
  usage.ts                    # UsageRecord, ModelPricing types
packages/core/src/pricing/
  pricing.ts                  # getModelPrice
  cache.ts                    # disk cache with TTL
  calculator.ts               # calculateCost
  fallback.json               # static pricing data
packages/core/src/usage/
  cc-parser.ts                # Claude Code JSONL parser (opt-in)
  aggregator.ts               # group by day/session, merge sources
packages/cli/src/commands/
  usage.ts                    # daily, sessions, session, latest
packages/cli/src/hooks/
  cost-tracker.js             # updated to pass through cache token fields
```

## Success Criteria

1. When a harness session completes, the cost-tracker hook writes an entry to `.harness/metrics/costs.jsonl` including `cacheCreationTokens` and `cacheReadTokens` if available in the Stop event payload
2. When `harness usage daily` is run, it displays a per-day spend table for the last 7 days with model and cost columns
3. When `harness usage sessions` is run, it lists recent sessions with token counts and costs
4. When `harness usage session <id>` is run, it displays the full token breakdown for that session
5. When `harness usage latest` is run, it shows the most recently completed session's cost summary
6. When the network is available, pricing data is fetched from LiteLLM and cached to disk for 24 hours
7. When the network is unavailable, the bundled `fallback.json` provides pricing without error
8. When `fallback.json` has been used for more than 7 days, a staleness warning is displayed
9. When a model has no pricing data, cost displays as "unavailable" with a logged warning
10. When `--include-claude-sessions` is passed, Claude Code JSONL files are merged into the output
11. If Claude Code JSONL entries are unparseable, they are skipped with a warning — the command does not fail
12. When `--json` is passed, all commands output machine-readable JSON
13. When legacy `costs.jsonl` entries lack `model`/cache fields, they display as "unknown model" / "N/A" cost

## Implementation Order

1. **Phase 1: Types & Pricing** — `UsageRecord` type, pricing module with cache, fallback, and calculator. Unit tests for pricing lookup, cache TTL, fallback behavior, unknown model handling.
2. **Phase 2: Hook & Aggregator** — Update cost-tracker hook to pass through cache token fields. Build aggregation logic (by day, by session, merge sources). Unit tests for aggregation and backward compatibility with legacy entries.
3. **Phase 3: CLI Commands** — Implement `daily`, `sessions`, `session <id>`, `latest` subcommands with `--json` support. Integration tests for each command with sample JSONL data.
4. **Phase 4: CC Parser** — Claude Code JSONL parser behind opt-in flag. Integration tests with sample CC JSONL. Graceful degradation tests (malformed entries, missing files).
5. **Phase 5: Integration Testing** — End-to-end test: hook writes → CLI reads → correct output. Verify backward compatibility with legacy entries. Verify offline fallback path. Verify `--json` output schema.

# Plan — Context-surface attribution report with exact token counts

Issue: Intense-Visions/harness-engineering#1274
Slug: `context-surface-attribution-report`

## Goal

Report what the harness's always-loaded context surface actually costs per turn:
classify every contributor as **always-loaded / path-scoped / invoked-only**, rank
the top contributors, and flag over-budget classes using the (currently dead)
`contextBudget()` allocator. Replace the `chars / 4` heuristic in `estimateTokens()`
with exact counts from Anthropic's `/v1/messages/count_tokens` endpoint, degrading
gracefully to the heuristic when there is no API key / the call fails / offline.

## Design

Pure logic lives in `@harness-engineering/core` (testable, no fs/network in the
report core); the CLI is a thin gather + render wrapper that feeds the REAL harness
surface in.

### 1. `packages/core/src/context/attribution.ts` (new, pure)

- `ContextClass = 'always-loaded' | 'path-scoped' | 'invoked-only'` — the three-way taxonomy.
- `ContextSurfaceEntry = { id; label; contextClass; text }` — one measurable surface item.
- `TokenCounter = (text: string) => number | Promise<number>` — pluggable counter (may throw).
- `heuristicTokenCounter` — wraps the existing `estimateTokens()` (`chars / 4`); the documented fallback.
- `buildAttributionReport(entries, options)`:
  - counts tokens per entry via the injected counter; on a per-entry throw it falls
    back to `estimateTokens()` and marks the report `degraded` + `counterMode: 'mixed' | 'heuristic'`.
  - aggregates tokens by class, ranks top contributors.
  - **calls `contextBudget(windowTokens, overrides)`** to allocate the window, maps each
    class to a budget category (always-loaded→systemPrompt, path-scoped→projectManifest,
    invoked-only→interfaces — documented), and derives per-class `overBudget` flags.
    This is the live consumer that makes `contextBudget()` a non-test caller (Fork B).

### 2. `packages/core/src/context/count-tokens.ts` (new)

- `createAnthropicTokenCounter({ apiKey?, model?, fetchImpl?, baseUrl? })` → `TokenCounter | null`.
  - returns `null` when no API key is resolvable (caller uses the heuristic — no hard fail).
  - otherwise POSTs to `/v1/messages/count_tokens` (default model `claude-opus-4-8`),
    returns `input_tokens`. On non-200 / network error it throws so the report's
    per-entry fallback records degradation (never hard-fails the report).
- `resolveTokenCounter(options)` → `{ counter, mode }` convenience resolver.

### 3. Barrel

Re-export both modules from `packages/core/src/context/index.ts`. `context` is a
`export *` auto-discovered dir in `scripts/generate-core-barrel.mjs`, so no allowlist
edit is needed; verified with `pnpm run generate:barrels --check`.

### 4. `packages/cli/src/mcp/context-surface.ts` (new) + `harness mcp context-report`

- Enumerates the REAL surface: MCP tool schemas via `getToolDefinitions()`
  (per tier via `selectTier` / tool-tiers allow-lists — the dominant contributor),
  `AGENTS.md`, `.claude/settings.json` hooks, and the four platform skill trees.
  - MCP tool schemas + AGENTS.md + hooks → always-loaded.
  - skill trees (Claude Code defers bodies) → invoked-only.
- Renders a ranked report (human + `--json`) via `buildAttributionReport`, using the
  Anthropic counter when a key is present and the heuristic otherwise.
- Wired as a `mcp` subcommand alongside `list-capabilities`.

### 5. Tests

- `packages/core/tests/context/attribution.test.ts` — classification aggregation,
  ranking, the exact→heuristic fallback path, and that `contextBudget()` drives the
  over-budget flags (spy/derivation).
- `packages/core/tests/context/count-tokens.test.ts` — null on no key, exact count via
  injected fetch, throw-on-error feeding the report fallback.
- `packages/cli/tests/mcp/context-surface.test.ts` — gathers real tool definitions and
  produces a per-tier report.

## Scope honesty

`tool-tiers.ts` already trims exposed tool count and Claude Code defers tool schemas,
so the report measures **per-tier** and the remaining win is smaller than the source
framing implies — surfaced explicitly in the report output and this plan.

## Stages run

brainstorming (surface/architecture research) → planning (this artifact) →
execution (core + cli + tests) → verification (build, typecheck, unit tests) →
integration (barrel freshness, docs). No material unforeseen fork; Fork B pre-answered.

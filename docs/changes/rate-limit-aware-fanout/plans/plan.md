# Plan — Rate-limit-aware fan-out (#1532)

Spec: `docs/changes/rate-limit-aware-fanout/proposal.md`
Closing keyword: `Refs #1532` (smallest coherent slice; broader per-API coverage + cross-process sharing deferred).

## Phase 1 — Per-resource budget primitive (core)

- **T1.1** Add `packages/core/src/fleet/rate-budget/types.ts` — `ResourceBudgetConfig { limit, windowMs }`.
- **T1.2** Add `packages/core/src/fleet/rate-budget/errors.ts` — `ThrottledFetchError`, `TruncatedFetchError` (carry `resource`, and `url` for truncation).
- **T1.3** Add `packages/core/src/fleet/rate-budget/budget.ts` — `RateBudget` class:
  - `configure(resource, cfg)`, `delayFor(resource, now): number` (pure: rolling-window count vs limit + `cooldownUntil`), `penalize(resource, cooldownMs, now?)`, `acquire(resource, now?): Promise<void>` (sleep `delayFor`, re-check, record timestamp).
  - Module singleton `sharedRateBudget`.
  - Pure applier `applyResourceBudgets(budget, map?)`.
- **T1.4** `packages/core/src/fleet/rate-budget/index.ts` barrel; re-export from `packages/core/src/fleet/index.ts`.
- **T1.5** Unit tests `packages/core/tests/fleet/rate-budget/budget.test.ts` — SC1 (delayFor limit boundary, clock-injected), SC2 (penalize shared cooldown observed by a second reader), applier copies config.
- **T1.6** `pnpm run generate:barrels` → confirm `--check` clean (fleet is `export *`-discovered; edit `scripts/generate-core-barrel.mjs` only if not).

## Phase 2 — Wire into GitHubHttp (core, live fetch path)

- **T2.1** `GitHubHttpOptions` gains `budget?: RateBudget` (default `sharedRateBudget`) + `resource?: string` (default `'github.core'`).
- **T2.2** `request()` → `await this.budget.acquire(this.resource)` before fetch.
- **T2.3** `fetchWithRetry()` → on 403/429 with `Retry-After`, `budget.penalize(resource, retryAfterMs)`; on terminal throttle (last is 403/429 after retries) **throw `ThrottledFetchError`** (was: return `last!`).
- **T2.4** `paginate()` → throw `TruncatedFetchError` on `incomplete_results: true`; propagate the terminal-throttle throw (never return partial `items`).
- **T2.5** Tests `packages/core/tests/roadmap/tracker/adapters/github-http.behavior.test.ts` — injected `fetchFn` + injected `budget`: SC3 (acquire consulted — pre-penalized budget delays), SC4 (terminal throttle throws), SC5 (truncation throws, no partial return). Keep zero-real-network.

## Phase 3 — Adopter config (types + orchestrator)

- **T3.1** `AgentConfig.resourceBudgets?: Record<string, ResourceBudgetConfig>` in `packages/types/src/orchestrator.ts` (+ export `ResourceBudgetConfig` type from types, or reference structurally). Keep `exactOptionalPropertyTypes` clean.
- **T3.2** `packages/orchestrator/src/workflow/config.ts` — optional Zod validation of `resourceBudgets` (reject malformed); `getDefaultConfig()` ships default map (`github.search: 10/60000`, `github.core: 80/60000`).
- **T3.3** Orchestrator startup calls `applyResourceBudgets(sharedRateBudget, config.agent.resourceBudgets)` so the config key is live (consumer wiring).
- **T3.4** Tests: config validation accept/reject; applier wiring.

## Phase 4 — Docs, barrels, provenance

- **T4.1** `pnpm run generate:barrels`, `pnpm run generate-docs` — commit regenerated `docs/reference/*`.
- **T4.2** `provenance.json` (issue 1532, stages, plan_path, closing_keyword, assumptions).
- **T4.3** Build CLI, run scoped tests + typecheck + lint; ship through pre-push gates (no `--no-verify`).

## Verification (WIRED)

Reviewer traces: `GitHubIssuesTracker` (`github-issues.ts:102` `new GitHubHttp(opts)`) → `this.http.paginate(...)`/`this.http.request(...)` → `budget.acquire(resource)` + throw-on-throttle/truncation. Config key `agent.resourceBudgets` → `applyResourceBudgets` → `sharedRateBudget` (the same default budget GitHubHttp uses).

---
title: Rate-limit-aware fan-out — per-resource API budgets, shared backoff, fail-on-truncation
issue: 1532
slug: rate-limit-aware-fanout
status: planned
tier: medium
keywords:
  - rate-limit
  - fan-out
  - api-budget
  - shared-backoff
  - fail-on-truncation
  - github-http
  - concurrency
---

# Rate-limit-aware fan-out

> Fleet concurrency is governed by compute slots, but not by the API budgets that
> leaves consume. Make fan-out consult a per-resource budget, share backoff across
> the fleet, and FAIL a leaf whose fetch was throttled or truncated instead of
> returning silent partial data.

## Overview and goals

Today the orchestrator governs concurrency by **compute slots** — `canDispatch`
(`packages/orchestrator/src/core/concurrency.ts`) gates dispatch on
`maxConcurrentAgents`, per-state caps, and a rolling LLM request/token window
(`AgentConfig.maxRequestsPerSecond` / `maxRequestsPerMinute`, evidence
`packages/types/src/orchestrator.ts:1030`). None of these knobs models the
**external API budgets** that a fan-out's leaves consume. When leaves fan out
GitHub API calls (code search is capped at 10 req/min; the commits API trips
secondary rate limits under modest parallelism), a slot-governed fleet degrades
into throttling and — worse — **quietly-incomplete results**: a measured run read
287 of 430 repos as zero because throttled/truncated fetches returned partial
data rather than failing.

The real GitHub HTTP layer is `GitHubHttp`
(`packages/core/src/roadmap/tracker/adapters/github-http.ts`). It already retries
403/429 with per-instance exponential backoff, but that backoff is **per-leaf**
(each `GitHubHttp` instance backs off in isolation, so N concurrent leaves keep
hammering a shared secondary-limit), there is **no proactive rate budget** (it
only reacts after a 429), and its `paginate` can stop early on a `< perPage` page
without distinguishing "genuinely done" from "server truncated the page".

**Goals (smallest coherent slice):**

1. A **per-resource budget primitive** — a process-wide, resource-keyed
   rolling-window limiter that leaves acquire before issuing a fetch, sitting
   _alongside_ (not replacing) the slot governor.
2. **Shared backoff** — when any leaf hits a 429/403 secondary limit, the cooldown
   is recorded on the shared budget so _every_ leaf on that resource backs off
   together, not per-leaf.
3. **Fail-on-truncation (the correctness rule)** — a truncated or throttled fetch
   raises a typed error and FAILS the leaf. It never returns partial or
   silent-zero data.
4. Wire (1)–(3) into the live `GitHubHttp` fetch path and expose the per-resource
   budgets as adopter configuration on `AgentConfig`.

**Non-goals (deferred slices, noted so merge order is clear):**

- Cross-process fleet coordination (a persisted/file-backed shared cooldown so
  budgets are shared across separate leaf _processes_). This slice is
  **process-wide** — it governs the in-process `Promise.all` / concurrency fan-out
  that produced the measured failure. Cross-process sharing is a deferred slice.
- Per-API budget coverage beyond GitHub's core + code-search + commits resources.
- Reworking the orchestrator's LLM-request rolling window (`concurrency.ts`) — the
  new primitive is additive and localized to the external-fetch concern (keeps
  this change mergeable alongside sibling PRs #1524/#1525).

## Decisions made

- **D1 — Truncated/throttled fetch FAILS the leaf** (operator-confirmed). Never
  return partial/silent-zero data. This is the core correctness rule of #1532.
  Realized as typed errors (`ThrottledFetchError`, `TruncatedFetchError`) thrown
  from the fetch path; callers that build a `Result` convert them to `Err`, and a
  fan-out leaf that awaits the throw fails rather than yielding a short list.
- **D2 — Per-resource budgets sit ALONGSIDE the slot budget** (operator-confirmed).
  Additive; the slot governor (`canDispatch`) is untouched. The new `RateBudget`
  is a separate primitive keyed by resource name (e.g. `github.core`,
  `github.search`).
- **D3 — Backoff is shared across the fleet, not per-leaf** (operator-confirmed).
  The shared cooldown lives on the `RateBudget` instance; all `GitHubHttp`
  instances constructed against the same budget observe the same cooldown.
- **D4 — Home the primitive in `@harness-engineering/core` under `fleet/`.** The
  `fleet/` module already houses "pure cross-run fleet coordination primitives"
  (`packages/core/src/fleet/`, evidence `scripts/generate-core-barrel.mjs:149`);
  it is `export *`-discovered, so a new `fleet/rate-budget` flows to the barrel
  through `fleet/index.ts` without an allowlist edit (verified via
  `generate:barrels --check`).
- **D5 — Wire into `GitHubHttp`, the real gh-API layer** (operator WIRED
  requirement). `GitHubHttp.request` acquires the budget before every fetch;
  `fetchWithRetry` records the shared cooldown on 429/403 and throws
  `ThrottledFetchError` on terminal throttle; `paginate` throws `TruncatedFetchError`
  when a page is server-truncated. `GitHubIssuesTracker`
  (`packages/core/src/roadmap/tracker/adapters/github-issues.ts:102`) is the live
  consumer — a reviewer traces its `this.http.paginate(...)` / `this.http.request(...)`
  call into the budget check.
- **D6 — Expose adopter config on `AgentConfig.resourceBudgets`.** The concurrency
  /governor config surface is `AgentConfig` (holds `maxConcurrentAgents` +
  `maxRequestsPerSecond`); the new optional `resourceBudgets` map lands there,
  "alongside slot budgets", validated in `workflow/config.ts` and defaulted in
  `getDefaultConfig()`.

## Technical design

### New primitive: `packages/core/src/fleet/rate-budget/`

```ts
// Config an adopter can set (mirrored on AgentConfig).
export interface ResourceBudgetConfig {
  /** Max requests permitted per rolling window for this resource. */
  limit: number;
  /** Rolling window length in ms (e.g. 60_000 for a per-minute cap). */
  windowMs: number;
}

export class RateBudget {
  configure(resource: string, cfg: ResourceBudgetConfig): void;
  /** Block (await) until a slot is free for `resource`, honoring the shared
   *  cooldown and the rolling window; records the request timestamp. */
  acquire(resource: string, now?: () => number): Promise<void>;
  /** Record a shared cooldown for `resource` (e.g. from a Retry-After). Every
   *  subsequent acquire() on this resource waits until the cooldown expires. */
  penalize(resource: string, cooldownMs: number, now?: () => number): void;
  /** Pure, testable: ms to wait before the next request may go (0 = go now). */
  delayFor(resource: string, now: number): number;
}

/** Process-wide default budget the fetch layer uses unless one is injected. */
export const sharedRateBudget: RateBudget;

export class ThrottledFetchError extends Error {
  resource: string;
}
export class TruncatedFetchError extends Error {
  resource: string;
  url: string;
}
```

`delayFor` is the pure core (rolling-window count vs `limit`, plus
`cooldownUntil`), unit-tested with an injected clock; `acquire` is the thin async
wrapper that sleeps `delayFor` then re-checks. This mirrors the existing pure
`computeRateLimitDelay` split (`packages/orchestrator/src/core/rate-limiter.ts`).

### Wiring into `GitHubHttp`

`GitHubHttpOptions` gains two optional fields (both defaulted, so all existing
callers/tests are source-compatible):

```ts
budget?: RateBudget;   // default: sharedRateBudget
resource?: string;     // default: 'github.core'
```

- `request()` → `await this.budget.acquire(this.resource)` before each fetch.
- `fetchWithRetry()` → on a 403/429 carrying `Retry-After`, call
  `this.budget.penalize(this.resource, retryAfterMs)` (shared backoff) in addition
  to the local sleep; after retries are exhausted on a throttle status, **throw
  `ThrottledFetchError`** instead of returning the 403/429 response (fail-the-leaf).
- `paginate()` → detect server truncation and **throw `TruncatedFetchError`**.
  Truncation signals: a `403`/`429` surfaced mid-walk (now a throw from
  `fetchWithRetry`), and — for search-style responses — a JSON body with
  `incomplete_results === true`. A partial accumulation is never returned.

### Adopter config

`AgentConfig` (`packages/types/src/orchestrator.ts`) gains:

```ts
/** Per-external-resource fan-out budgets, keyed by resource name
 *  (e.g. "github.core", "github.search"). Governs external API fan-out
 *  ALONGSIDE the slot/agent concurrency limits. */
resourceBudgets?: Record<string, ResourceBudgetConfig>;
```

Validated in `packages/orchestrator/src/workflow/config.ts` (optional; a
malformed entry is rejected at load, not silently dropped) and defaulted to a
small sane map in `getDefaultConfig()` (`github.search: { limit: 10, windowMs:
60000 }`, `github.core: { limit: 80, windowMs: 60000 }`). A pure applier
`applyResourceBudgets(budget, cfg.agent.resourceBudgets)` copies the config onto
the shared budget; the orchestrator calls it at startup so the config key is
live.

## Integration Points

- **Entry Points** — New `@harness-engineering/core` export `fleet/rate-budget`
  (`RateBudget`, `sharedRateBudget`, `ResourceBudgetConfig`, `ThrottledFetchError`,
  `TruncatedFetchError`). New optional `AgentConfig.resourceBudgets` config key.
  Modified fetch entry point: `GitHubHttp.request/fetchWithRetry/paginate`.
- **Registrations Required** — `fleet/rate-budget` reaches the barrel via
  `fleet/index.ts` (`export *`, auto-discovered); run `pnpm run generate:barrels`
  and confirm `--check` is clean. If discovery does not pick it up, add it to
  `scripts/generate-core-barrel.mjs`.
- **Documentation Updates** — Regenerate `docs/reference/*` via
  `pnpm run generate-docs` (config surface change). Note the config key in the
  reference config docs.
- **Architectural Decisions** — D1 (fail-on-truncation as a correctness invariant)
  and D3 (shared cross-leaf backoff) are the decisions that could warrant an ADR;
  scoped as a medium change, recorded here and in `provenance.json` rather than a
  standalone ADR for this slice.
- **Knowledge Impact** — Concept: "fan-out must be governed by API budgets, not
  only compute slots; a throttled/truncated fetch is a failure, not a partial
  success." Relationship: `RateBudget` → consumed-by → `GitHubHttp` → consumed-by
  → `GitHubIssuesTracker`.

## Success criteria

1. `RateBudget.delayFor` returns a positive delay once a resource's rolling-window
   request count reaches its `limit`, and 0 below the limit (pure, clock-injected
   unit test).
2. `RateBudget.penalize` makes every subsequent `delayFor`/`acquire` on that
   resource wait for the shared cooldown — a second `GitHubHttp` sharing the budget
   observes the cooldown set by the first (shared-backoff test).
3. `GitHubHttp.request` awaits `budget.acquire` before fetching (verified: a
   pre-penalized budget delays the fetch).
4. A terminal-throttle (403/429 after retries) makes `GitHubHttp` **throw
   `ThrottledFetchError`**, not return a response.
5. `paginate` **throws `TruncatedFetchError`** on a server-truncated walk
   (`incomplete_results: true`) and never returns a partial `items` array.
6. `AgentConfig.resourceBudgets` validates when present/well-formed, rejects a
   malformed entry, and `applyResourceBudgets` copies it onto the shared budget;
   `getDefaultConfig()` ships a sane default map.
7. Barrel `--check` clean, `generate-docs` clean, all-OS CI green.

## Implementation order

1. **Primitive** — `fleet/rate-budget/` (`RateBudget`, errors, `sharedRateBudget`,
   `ResourceBudgetConfig`) + pure unit tests; export via `fleet/index.ts`;
   regenerate barrel.
2. **Wire GitHubHttp** — budget acquire + shared penalize + throw on
   terminal-throttle + throw on truncation; tests with an injected `fetchFn` and
   budget.
3. **Config** — `AgentConfig.resourceBudgets` type + `workflow/config.ts`
   validation + `getDefaultConfig()` default + `applyResourceBudgets` applier +
   orchestrator startup call; tests.
4. **Docs/barrels** — `generate:barrels`, `generate-docs`; provenance + plan.

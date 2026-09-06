---
number: 0122
title: 'Rate-limit-aware fan-out: per-resource API budgets alongside the leaf-slot governor'
date: 2026-09-05
status: proposed
tier: medium
source: 'docs/changes/rate-limit-aware-fanout/proposal.md'
---

## Context

**This is a retrospective backfill.** The decision recorded here was taken and shipped
before this ADR was written; it is a record of a decision already made, not a proposal
seeking one. The prose was reconstructed from the "Decisions made" section of
`docs/changes/rate-limit-aware-fanout/proposal.md` (D1-D6, four of them marked
operator-confirmed) and from `docs/changes/rate-limit-aware-fanout/provenance.json`, then
re-verified line by line against the shipped code. Where the two disagreed, the shipped
code won — see "Assumptions made" for the one place they did.

Fleet concurrency has a governor, but it governs the wrong axis for this failure. ADR 0091
established the conductor-tier authority model, whose scarce resource is the **leaf slot**:
a single global pool (default 3, hard max 4, no member above 2), allocated to the leaf
subagents a member's DISPATCH fans out and enforced at dispatch time through each member's
own `--concurrency` flag. That budget meters _compute_ — how many agents may run at once.
It says nothing about the **external API budget** those leaves consume once running.

The gap is not theoretical. GitHub code search is capped at 10 requests/minute and the
commits API trips secondary rate limits under modest parallelism, so a slot-governed
fan-out that is perfectly well-behaved by ADR 0091's accounting still degrades into
throttling. The measured failure that motivated the work (issue #1532) is worse than slow:
a run read **287 of 430 repositories as zero**, because throttled and truncated fetches
returned partial data rather than failing. Silent under-fetch is indistinguishable from a
true empty result at the call site, so the fan-out reported confident, wrong answers.

The real GitHub HTTP layer is `GitHubHttp`
(`packages/core/src/roadmap/tracker/adapters/github-http.ts`). Before this change it had
three specific deficiencies:

1. **Reactive only.** It retried 403/429 with exponential backoff, but had no proactive
   budget — it discovered the limit by hitting it.
2. **Backoff was per-leaf.** Each `GitHubHttp` instance backed off in isolation, so N
   concurrent leaves sharing one secondary limit kept hammering it. Isolated backoff is
   precisely the wrong shape for a _shared_ server-side limit.
3. **Pagination could not tell "done" from "truncated."** `paginate` stopped on any page
   shorter than `perPage`, with no way to distinguish a genuinely final page from a page
   the server cut short.

The decision therefore had to settle two things that are easy to get wrong: what a
throttled or truncated fetch _returns_ (the correctness question), and where the new
budget _lives_ relative to the existing slot governor (the architecture question).

## Decision

A **second, orthogonal governor axis**: a per-resource external-API budget that sits
alongside ADR 0091's leaf-slot budget rather than inside it. Six decisions, each verified
against shipped code.

### D1 — A truncated or throttled fetch FAILS the leaf (operator-confirmed)

The correctness heart of this ADR: **never return partial or silent-zero data.** Realized
as two typed errors in `packages/core/src/fleet/rate-budget/errors.ts` —
`ThrottledFetchError` (carries `resource`, `status`; line 11) and `TruncatedFetchError`
(carries `resource`, `url`; line 31). Both are thrown, never returned:

- A fetch still throttled after the retry budget is exhausted throws rather than handing
  back the 403/429 response, which a caller could mistake for "zero results"
  (`github-http.ts:106-108`).
- A short page that _still_ advertises `Link: rel="next"` is a server truncation and throws
  (`github-http.ts:157-159`).
- A Search response with `incomplete_results === true` throws instead of returning the
  partial `items` array (`github-http.ts:210-212`).

Consumers already wrap these calls in try/catch and convert to `Err(...)`, so the failure
propagates as an error rather than a short list. The rule is stated as an invariant, not a
default, because the failure mode it prevents is invisible: an under-fetch that is never
detected is worse than a loud failure, since it produces confident wrong answers.

### D2 — Per-resource budgets sit ALONGSIDE the slot budget (operator-confirmed)

Additive and orthogonal. The slot governor is untouched: `canDispatch`
(`packages/orchestrator/src/core/concurrency.ts`) contains no reference to `RateBudget` or
`resourceBudgets` — verified by grep. The new `RateBudget`
(`packages/core/src/fleet/rate-budget/budget.ts:44`) is a separate primitive keyed by
**resource name** (`github.core`, `github.search`), not by agent or lane. Its pure core is
`delayFor(resource, now)` (line 79), a function of rolling-window state plus a shared
cooldown, returning milliseconds to wait; `acquire` (line 118) is the thin async wrapper
that sleeps and re-checks. That pure/wrapper split mirrors the existing
`computeRateLimitDelay` convention and is what makes the window logic unit-testable with an
injected clock.

The two axes are genuinely independent: slots meter how many leaves run, resource budgets
meter how fast the running leaves may call one external API. A single leaf can exhaust a
resource budget; ten leaves can sit under one.

### D3 — Backoff is shared across the fleet, not per-leaf (operator-confirmed)

`penalize(resource, cooldownMs)` (`budget.ts:107`) records the cooldown on the **shared**
`RateBudget` instance, and it extends but never shortens an existing cooldown
(`Math.max`, line 110). In `delayFor`, the shared cooldown **dominates** the rolling window
— a penalized resource waits regardless of window state (`budget.ts:83-84`). `acquire`
re-checks after each sleep, so a cooldown a sibling leaf installs mid-wait is observed by
leaves already waiting (`budget.ts:124-128`). Every `GitHubHttp` holding a handle to the
same budget therefore backs off together, which is what actually clears a server-side
secondary limit.

### D4 — Home the primitive in `@harness-engineering/core` under `fleet/`

`packages/core/src/fleet/` already houses pure cross-run fleet coordination primitives
(claims, context-budget, spend-budget), and it is `export *`-discovered: `fleet/index.ts:6`
adds `export * from './rate-budget'`, and the generated `packages/core/src/index.ts:144`
already carries `export * from './fleet'`. The new exports therefore reach the public barrel
**with no allowlist edit** to `scripts/generate-core-barrel.mjs`. Verified at runtime
against the built bundle: `RateBudget`, `sharedRateBudget`, `ThrottledFetchError`,
`TruncatedFetchError`, and `applyResourceBudgets` are all live exports of
`packages/core/dist/index.js`.

### D5 — Wire into `GitHubHttp`, the real gh-API layer (operator WIRED requirement)

Not a primitive parked next to the problem — wired into the live fetch path:

- Budget acquisition sits in `fetchWithRetry` (`github-http.ts:83`), **before every
  attempt** rather than once per logical request, so retries are paced too and a cooldown
  installed between attempts is honored. `request()` delegates to it (line 75).
- On a 403/429 the shared budget is penalized with the `Retry-After`-derived delay in
  addition to the local sleep (`github-http.ts:99`).
- Defaults keep every existing caller source-compatible: `budget` falls back to
  `sharedRateBudget` and `resource` to `github.core` (`github-http.ts:52-53`).

`GitHubIssuesTracker` is the live consumer. It constructs **two** clients on different
resource keys — `this.http` on the default `github.core` and `this.searchHttp` explicitly on
`github.search` (`github-issues.ts:110-111`) — which is what lets the strict 10/min search
cap be budgeted separately from the far higher core cap. Its `paginate`/`request`/`search`
call sites (`github-issues.ts:140, 189, 246, 589`) all route through the budget.

### D6 — Expose adopter config on `AgentConfig.resourceBudgets`

`ResourceBudgetConfig` (`limit`, `windowMs`) is defined canonically in
`packages/types/src/orchestrator.ts:1036` and the optional map lands on `AgentConfig` at
line 1070 — the same config object that already holds `maxConcurrentAgents`, which is what
makes "alongside the slot budget" true in the config surface and not just in prose. Core's
`fleet/rate-budget/types.ts` re-exports the type from `@harness-engineering/types` so the
primitive and its config surface cannot drift. Malformed entries are rejected at load rather
than silently dropped (`packages/orchestrator/src/workflow/config.ts:270-273`), defaults ship
conservative (`github.core` 80/min, `github.search` 10/min matching GitHub's documented
cap — `config.ts:399-402`), and the key is made live at startup by
`applyResourceBudgets(sharedRateBudget, config.agent.resourceBudgets)`
(`packages/orchestrator/src/orchestrator.ts:1052`).

## Alternatives considered

**Return partial data with a truncation flag, instead of failing the leaf (rejected).**
Cheaper and non-breaking: existing callers keep compiling and a diligent one checks the
flag. Rejected because it preserves the exact failure that motivated the work — the 287/430
zero-read happened _because_ a partial result was returned in a shape indistinguishable from
a complete one. A flag only helps callers who remember to check it, and the cost of
forgetting is silent wrong data rather than a visible error. Failing loudly makes the
under-fetch impossible to ignore; a flag makes it easy to.

**Fold the per-resource budget into the slot governor (rejected).** One governor, one place
to reason about limits. Rejected because the axes are dimensionally different: slots are
allocated per lane at dispatch time and held for a subagent's lifetime, while API budgets
are consumed per HTTP call by whichever leaf happens to be fetching, keyed by an external
resource no lane owns. Merging them would force `canDispatch` — a synchronous admission
decision — to model a rolling window it cannot observe, and would put a fetch-layer concern
inside the orchestrator's dispatch path. It also would have made this change collide with
sibling work on `concurrency.ts`/`budget-governor.ts` (#1524/#1525), where keeping it
additive let it merge independently.

**Per-leaf cooldown, keeping backoff local to each client (rejected).** This was the status
quo ante and it is the bug: a secondary rate limit is a property of the _server_, shared by
every leaf hitting it. N leaves backing off independently each rediscover the limit, and
their retries re-trip it for one another. Only a shared cooldown converges.

**Home the primitive in a new package (rejected).** A dedicated package would give the
limiter its own release surface, but `core/fleet/` already exists for exactly this class of
pure coordination primitive, already reaches the barrel by `export *` discovery, and adding
a package would mean new build wiring and a new dependency edge from `core` for one small
module. No benefit proportional to the cost.

## Consequences

### Positive

- **The motivating failure mode is now unrepresentable.** A throttled or truncated fetch
  cannot reach a caller as data; the three throw sites (`github-http.ts:107, 158, 211`)
  cover terminal throttle, truncated list pagination, and truncated search. A 287-of-430
  silent zero-read becomes a loud error.
- **Fan-out paces itself proactively** instead of discovering limits by tripping them, and
  the two GitHub resources with very different caps are budgeted independently rather than
  under one blended number.
- **Shared backoff converges.** One leaf's 429 slows every leaf on that resource, including
  ones already mid-wait.
- **ADR 0091's model is preserved intact.** The slot governor is untouched, so the conductor
  tier's accounting, its `--concurrency` seam, and its reasoning about leaf slots all remain
  valid; this is a new axis beside it, not a revision of it.
- **Additive and adopter-configurable** — defaults ship sane, all existing `GitHubHttp`
  callers stayed source-compatible via the `budget`/`resource` defaults, and the change
  merged independently of the sibling budget work.

### Negative

- **The budget is process-wide, not fleet-wide.** `sharedRateBudget` is a module singleton
  (`budget.ts:138`), so it governs the in-process fan-out that produced the measured failure
  but **not** separate leaf _processes_, which still contend for the same external limit
  unaware of one another. This is the single most important limitation of the shipped
  design and the most likely source of a future recurrence at higher fan-out. _Mitigation:_
  a persisted or file-backed cross-process cooldown is an explicitly deferred slice, noted
  in the proposal's Non-goals; the injectable `budget` parameter is the seam it would use.
- **Fail-the-leaf converts silent degradation into visible failure**, which will surface as
  new errors in runs that previously "succeeded" with wrong data. This is the intended
  trade, but it is a real behavior change for anyone who was unknowingly tolerating partial
  results. _Mitigation:_ the errors are typed and carry `resource`/`url`, so callers can
  distinguish throttle from truncation and retry at a higher level.
- **Truncation detection is heuristic, not a protocol guarantee.** The list-pagination
  signal is "short page that still advertises `Link: rel=next`" and the search signal is
  `incomplete_results === true`. Neither is a server contract that GitHub promises to
  maintain, and a truncation GitHub signals some third way would still slip through.
- **A module singleton is global mutable state**, with the usual test-isolation hazard.
  _Mitigation:_ `reset()` is exposed as an instance method specifically for this
  (`budget.ts:66`), and the clock and sleep are injectable via `RateBudgetAcquireOptions`.
- **Coverage is GitHub-only.** The primitive is resource-agnostic, but the only wired
  consumer is `GitHubHttp`; every other outbound API in the codebase remains ungoverned.

### Neutral

- Budget acquisition happens per _attempt_ inside `fetchWithRetry`, not per logical request
  — stricter than the proposal's wording, and the correct reading, since retries consume
  real quota.
- `github.core` / `github.search` are conventional string keys with no registry or
  enumeration; a typo yields an unconfigured resource, which `delayFor` treats as
  unlimited (returns 0 at `budget.ts:81`) rather than as an error.
- Two `GitHubHttp` instances now exist per tracker, one per resource key, where one existed
  before.

## Assumptions made

- **This record is a retrospective backfill of shipped behavior.** The decisions were taken
  and implemented before the ADR existed; nothing here proposes new work. Status is
  `proposed` because an ADR is accepted by a human, not by the agent that drafts it — the
  status reflects the record's review state, not the code's, which is already merged.
- **Shipped code is authoritative over the proposal, and they diverged in one place.** The
  proposal's Technical Design said `paginate()` would detect truncation via
  `incomplete_results`, and `provenance.json` then recorded the `incomplete_results` path as
  _deferred to a future search-specific slice_. Neither matches what shipped. The shipped
  design splits the signal by endpoint family — `paginate()` uses `Link: rel="next"` on a
  short page (`github-http.ts:157`), and a **separate `search<T>()` method** covers
  `incomplete_results` (`github-http.ts:187-212`) — because for Search a `rel="next"` header
  is ordinary paging rather than truncation, so the two endpoint families genuinely need
  different signals. Git history confirms this landed in two commits: `77c2577f0` (base
  slice) and `37b1be7a0` ("fail loud on GitHub Search incomplete_results truncation"). The
  deferred slice was completed, and it is wired — `searchHttp.search()` is consumed at
  `github-issues.ts:246`. This ADR records the split design, not the proposal's single-signal
  sketch.
- Decisions D1, D2, D3 and D5 are marked operator-confirmed in the source proposal; the
  rationale reconstructed for them here is inferred from the proposal, the provenance record
  and the code, and was not re-litigated with the operator during this backfill.
- The "287 of 430 repos read as zero" figure is carried forward from the proposal's problem
  statement as the motivating measurement; it was not independently re-measured.

## References

- Source proposal: `docs/changes/rate-limit-aware-fanout/proposal.md` (D1-D6)
- Provenance: `docs/changes/rate-limit-aware-fanout/provenance.json`
- Tracking issue: #1532 (closing keyword `Refs #1532` — broader per-API coverage deferred)
- ADR `0091-fleet-command-conductor-tier-authority-model.md` — owns the global **leaf-slot**
  budget this ADR adds an orthogonal per-resource axis beside
- Primitive: `packages/core/src/fleet/rate-budget/` — `budget.ts` (`RateBudget`,
  `sharedRateBudget`, `applyResourceBudgets`), `errors.ts`, `types.ts`, `index.ts`
- Wiring: `packages/core/src/roadmap/tracker/adapters/github-http.ts:52, 83, 99, 107, 158, 211`
- Live consumer: `packages/core/src/roadmap/tracker/adapters/github-issues.ts:110-111, 246`
- Config surface: `packages/types/src/orchestrator.ts:1036, 1070`;
  `packages/orchestrator/src/workflow/config.ts:270, 399`;
  `packages/orchestrator/src/orchestrator.ts:1052`
- Tests: `packages/core/src/fleet/rate-budget/budget.test.ts`,
  `packages/core/src/roadmap/tracker/adapters/github-http.test.ts`,
  `packages/core/tests/roadmap/tracker/adapters/github-issues.test.ts`
- Commits: `77c2577f0` (base slice), `37b1be7a0` (search truncation slice)

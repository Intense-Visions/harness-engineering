---
title: Cross-run work-claim leases for the -fleet family
status: draft
keywords:
  [
    fleet,
    concurrency,
    claim-lease,
    github-coordination,
    ttl-heartbeat,
    soft-reservation,
    duplicate-work,
  ]
---

# Cross-run work-claim leases for the `-fleet` family

## Overview & Goals

**Problem.** The `-fleet` family has no coordination across _separate invocations_. When two people on different clones run a fleet at nearly the same time, both enumerate the same backlog and build the same items. The only existing cross-run signal is "drop items that already have an open PR" (`roadmap-fleet/SKILL.md:53`), and it fires only _after_ the first run has published a PR — which is false during the `SELECT → PR-open` window. Every other safeguard is scoped to one machine or one invocation:

- The per-fleet concurrency governor (default 2, max ~3) bounds one run only.
- `fleet-command`'s global leaf-slot budget bounds one conductor invocation only.
- `compound-lock` (`packages/core/src/locks/compound-lock.ts`) is an O_EXCL PID file under `.harness/locks/`, which is **gitignored** (confirmed) — a PID is meaningless on another machine, so it cannot coordinate different clones.

**Goal.** Give the ID-based fleets an advisory, cross-machine **work-claim lease** published on GitHub that bridges exactly the `SELECT → PR-open` gap, so concurrent runners auto-partition the backlog instead of duplicating it.

**Non-goals (YAGNI):**

- **Not exactly-once.** This is a best-effort advisory lease. It shrinks the duplicate window from full-build-duration (10–30 min) to a sub-second reclaim race — never to zero. A hard guarantee would require the CAS git-ref approach we deliberately rejected (see Decisions D3).
- **Not area-based fleets** (bug / cleanup / security / craft) in v1. Their unit of work is a path-set with no external ID at SELECT time; they are already partly protected by disjoint-area construction _within_ a run. Deferred to v2 once the primitive is proven.
- **Not same-machine agent storms.** Already covered by `compound-lock` and the orchestrator's duplicate-dispatch detection.
- **No new infrastructure** — no lock server, no dedicated git ref, no database.

**Headline success.** When two clones run `roadmap-fleet` concurrently against the same backlog, no item is built by both; each item ends with exactly one PR.

## Decisions Made

| #   | Decision                                                                                                                       | Rationale                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | **Substrate = GitHub** (labels + claim comments), not local files or a git ref                                                 | The only real-time state two clones both see. `.harness/locks/` is gitignored (`compound-lock.ts:54`) so local locks cannot cross machines.                                                |
| D2  | **v1 scope = ID-based fleets** (roadmap / issue / pr)                                                                          | The item already carries an issue/PR number at SELECT → a GitHub-native claim key with no new ID format; also the highest-frequency collision.                                             |
| D3  | **Contention = soft reservation** (skip & move on), not a hard mutex                                                           | Matches the family front-load / park-and-continue model (ADR 0088); turns concurrency into backlog auto-partitioning. We accept best-effort over the heavier true-CAS git-ref alternative. |
| D4  | **Claim = `fleet:claimed` label + a structured claim-comment** carrying `{owner, runId, fleet, item, claimedAt, leaseSeconds}` | Label = cheap one-call SELECT filter; comment = authoritative lease payload; both are human-visible on the issue.                                                                          |
| D5  | **Staleness = TTL + heartbeat, measured off the GitHub server `updated_at`**                                                   | Decouples a slow-but-live item from a dead run; the server clock defeats cross-machine skew; self-heals with no manual `rm` (unlike `compound-lock`).                                      |
| D6  | **The open PR is the durable claim**; the lease only bridges `SELECT → PR-open`, then releases                                 | Reuses the existing "in-progress-elsewhere" drop; keeps the lease's scope and lifetime minimal.                                                                                            |
| D7  | **Graceful degradation** when `gh` auth is absent: fall back to open-PR-cross-check-only, never abort                          | Matches `roadmap-fleet`'s existing "missing gh auth degrades to available source" posture (`SKILL.md:51`).                                                                                 |

## Technical Design

### The claim record

A claim is published as a single GitHub issue/PR comment containing an HTML marker plus a fenced JSON payload, so it is both human-readable and unambiguously machine-parseable:

```json
// posted as a GitHub issue/PR comment, prefixed by an HTML marker line:
//   <!-- harness-fleet-claim -->
{
  "v": 1,
  "owner": "chadjw",
  "runId": "rf-1a2b3c",
  "fleet": "roadmap-fleet",
  "item": "#1490",
  "claimedAt": "2026-08-26T14:20:00Z",
  "leaseSeconds": 720
}
```

The HTML marker `harness-fleet-claim` lets SELECT locate the claim comment unambiguously. `claimedAt` is written by the claiming machine but is **advisory only**: staleness is computed by the reader from the comment's GitHub-server `updated_at` (`updated_at + leaseSeconds < now` ⇒ stale), so a skewed writer clock can neither prematurely expire nor over-trust a claim.

### New `FleetClaim` type and pure core module

`FleetClaim` joins `FleetHandoffRecord` in the types package (`packages/types/src/fleet-claim.ts`, exported from `packages/types/src/index.ts`).

A new **pure, offline** core module `packages/core/src/fleet/claims/` (no network — GitHub I/O stays in the skill layer, matching the repo's injected-IO discipline) exports:

| Export                                                   | Responsibility                                                                |
| -------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `buildClaimBody(input: FleetClaim): string`              | Render the marker + fenced JSON.                                              |
| `parseClaimComment(body: string): FleetClaim \| null`    | Tolerant parse; returns `null` on a foreign/malformed comment (never throws). |
| `isLeaseLive(claim, serverUpdatedAt, now): boolean`      | TTL check off the **server** timestamp, not `claimedAt`.                      |
| `CLAIM_LABEL = 'fleet:claimed'`                          | The SELECT-filter label.                                                      |
| `DEFAULT_LEASE_SECONDS = 720`, `HEARTBEAT_SECONDS = 240` | Defaults (see below).                                                         |

The module is added to the curated barrel allowlist in `scripts/generate-core-barrel.mjs` (a new export is a silent no-op otherwise).

### Lifecycle (wired into the family spine)

The lifecycle is stated once in `docs/reference/fleet-family.md` and consumed by each ID-based member. The GitHub I/O (all `gh` calls) lives in the member's orchestration layer.

```

SELECT enumerate candidates AS TODAY, plus fetch `--label fleet:claimed` items
and their claim comments. An item with a LIVE lease OR an open PR is
dropped as "claimed-elsewhere" (extends the existing
"in-progress-elsewhere" classification). A STALE lease is ignored.

CLAIM on entering DISPATCH for an item: add the `fleet:claimed` label + post
the claim comment (leaseSeconds TTL). Re-read first: if a competing live
claim appeared since SELECT, YIELD the item (soft reservation).

HEARTBEAT while the worker builds, the orchestrator edits the claim comment every
HEARTBEAT_SECONDS, bumping the server `updated_at` and extending the lease.

RELEASE on PR-open: remove the `fleet:claimed` label (comment is left as an audit
trail). The open PR now backstops the item via the existing open-PR drop.

CRASH/KILL no heartbeat, no release ⇒ the lease lapses at last `updated_at` +
leaseSeconds ⇒ the next run's SELECT sees it stale and reclaims it.

PARK/FAIL a terminal non-`done` status with no PR releases the label so the item is
not stranded; the outcome is reported and the item is reclaimable next run.

```

### TTL / heartbeat numbers

`DEFAULT_LEASE_SECONDS = 720` (12 min), `HEARTBEAT_SECONDS = 240` (4 min). A fleet build item routinely exceeds a few minutes, so a 12-minute TTL with 4-minute renewal tolerates one missed heartbeat (a transient network hiccup) without expiring a live item, while capping a dead claim's lingering at ≤ 12 minutes. Overridable per run via a new `--lease-seconds` flag; `fleet-command` passes it through. An escape hatch `--no-claim` disables the mechanism entirely (falls back to today's behavior).

### Reclaim tiebreak

Reclaiming a stale lease posts a _fresh_ claim comment (append-only). If two runs reclaim simultaneously, the earliest GitHub-server-stamped comment wins; the later run detects a competing live claim it did not write (runId mismatch) on its first heartbeat re-read and yields the item. Residual double-work is bounded to that reclaim race — by design never worse than today's uncoordinated behavior.

### GitHub API budget

The claim-scan **piggybacks** on the issue/PR enumeration SELECT already performs (add the `--label fleet:claimed` filter; fetch comments only for the claimed subset, not every item). Heartbeat uses a REST comment-edit (cheap), never a GraphQL `gh pr list` (which draws on the shared GraphQL quota). Net new API cost per run is small and bounded by the number of items actually claimed.

### `fleet-command` interaction

The conductor already enforces a global slot budget _within one invocation_. Cross-invocation coordination is entirely emergent from the per-item claims the members take: two conductors run by two people auto-partition the backlog through the same lease mechanism. The conductor's only change is passing `--lease-seconds` / `--no-claim` through to lanes; claims remain owned by the members.

## Integration Points

**Entry Points.**

- No new CLI command and no new MCP tool.
- New pure core module `@harness-engineering/core` → `fleet/claims`.
- New `FleetClaim` type in `@harness-engineering/types`.
- New shared section "Cross-run claim lease" in `docs/reference/fleet-family.md` (the spine).
- New fleet flags: `--lease-seconds <n>` and `--no-claim` on the ID-based members and passed through by `fleet-command`.

**Registrations Required.**

- Core barrel: add `fleet/claims` to the allowlist in `scripts/generate-core-barrel.mjs` (a new export is otherwise a silent no-op).
- Types barrel: export `FleetClaim` from `packages/types/src/index.ts`.
- The `fleet:claimed` GitHub label is auto-created idempotently on first claim (`gh label create ... || true`); no manual repo setup.
- Each ID-based member SKILL.md (`roadmap-fleet`, `issue-fleet`, `pr-fleet`) references the new spine section. Platform mirror copies are symlinks and update automatically; the Gemini `.toml` regenerates via pre-commit.

**Documentation Updates.**

- `docs/reference/fleet-family.md` — new "Cross-run claim lease" section (the canonical statement).
- The three ID-based members' SELECT/DISPATCH steps — reference the spine, do not restate it.
- AGENTS.md — if it summarizes fleet coordination, add a one-line pointer.

**Architectural Decisions.**

- **Cross-run advisory work-claim leases for the `-fleet` family** rises to a standalone family ADR (next available number, ~`0103`, pending renumber against latest main). It warrants an ADR because it is a family-wide contract every ID-based member consumes and every future member must honor — the same standing as ADR 0088 (front-load model). The ADR also records the deliberate choice of soft reservation over a true-CAS git-ref lock (D3), so the "why not exactly-once" reasoning is durable.

**Knowledge Impact.**

- Concepts: _advisory lease_, _claim comment_, _lease TTL / heartbeat_, _reclaim race_, _server-clock staleness_.
- Relationships: `fleet-member —claims→ work-item`; `open-PR —is-durable-claim-for→ work-item`; `lease —bridges→ (SELECT → PR-open) window`.

## Success Criteria

Phrased for observable, testable verification (EARS where behavioral):

- **SC1 — no double-build under concurrency.** When two runs SELECT the same backlog concurrently, then each item is claimed by at most one run before PR-open. _Verify:_ integration test with two simulated orchestrators against a fixture repo (mocked `gh`); assert each item's live claim comment carries exactly one `runId`.
- **SC2 — stale claims self-heal.** When a claim holder stops heartbeating, then the item becomes reclaimable after ≤ `leaseSeconds`. _Verify:_ unit test on `isLeaseLive` + an integration test that drops the heartbeat and asserts reclaim.
- **SC3 — PR is the durable claim.** When an item's PR is opened, then its `fleet:claimed` label is removed and subsequent SELECTs drop the item via the open-PR path, not the lease path. _Verify:_ integration assertion on label state + drop classification.
- **SC4 — graceful degradation.** If `gh` auth is absent, then the fleet proceeds with open-PR-cross-check-only and logs the degradation, and shall not abort. _Verify:_ run with `gh` unauthenticated; assert completion + log line.
- **SC5 — clock-skew safety.** Staleness is computed from the GitHub server `updated_at`, so a claim written by a clock-skewed machine is neither prematurely expired nor over-trusted. _Verify:_ unit test feeding a skewed `claimedAt` against a fixed server `updated_at`.
- **SC6 — parse round-trip and tolerance.** `parseClaimComment(buildClaimBody(x))` deep-equals `x`, and `parseClaimComment` returns `null` on a malformed or foreign comment. _Verify:_ unit.

## Implementation Order

### Phase 1: Core primitive

<!-- complexity: low -->

`FleetClaim` type + the pure `fleet/claims` module (`buildClaimBody` / `parseClaimComment` / `isLeaseLive` / constants) + unit tests (SC2, SC5, SC6) + both barrel exports (types index + core-barrel allowlist). No network. Independently shippable.

### Phase 2: Spine + reference member

<!-- complexity: medium -->

Add the "Cross-run claim lease" section to `docs/reference/fleet-family.md`; wire the full SELECT → CLAIM → HEARTBEAT → RELEASE lifecycle and the `gh`-degradation path into `roadmap-fleet` as the reference implementation; add the two-runner integration test (SC1, SC3, SC4).

### Phase 3: Roll to the remaining ID-based members

<!-- complexity: low -->

`issue-fleet` and `pr-fleet` reference the spine section rather than restating it; add the `--lease-seconds` / `--no-claim` flags to each member.

### Phase 4: ADR + conductor + docs

<!-- complexity: low -->

Write the family ADR (next available number, ~0103); add `fleet-command` flag pass-through for `--lease-seconds` / `--no-claim`; update AGENTS.md if it summarizes fleet coordination.

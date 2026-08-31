---
number: 0116
title: Single-writer semantic comprehension — main is the only writer of the semantic half
date: 2026-08-30
status: accepted
tier: high
supersedes-framing:
  - 'ADR 0109 §4 framing that byte-stability + the merge driver make semantic-shard collisions non-events — true only for local merges; server-side (GitHub merge button) merges bypass the driver and still conflict'
relates:
  - '0107-comprehension-committed-git-versioned-substrate'
  - '0108-serve-time-hash-gate-sole-llm-free-correctness-authority'
  - '0109-effortless-comprehension-agent-neutral-local-generation'
source: 'GitHub #1713 (ADR-0109 follow-up); complementary #1689'
---

> Numbering note: this decision was originally drafted and referenced in-code as
> "ADR 0110" while PRs #1728/#1729 were in flight. Number **0110** was concurrently
> taken on `main` by an unrelated adr-fleet decision
> (`0110-skill-run-execution-vs-separate-dispatcher`), so the single-writer decision
> is recorded here at **0116** and every `ADR 0110` reference in the shipped
> comprehension code/artifacts was corrected to `ADR 0116` in the same change.

## Context

ADR 0108/0109 committed a per-module comprehension substrate: each
`.harness/comprehension/**/_module.md` shard carries a deterministic **STATIC**
skeleton plus a non-deterministic **SEMANTIC** half (LLM-authored summary +
invariants). ADR 0109 shipped two collision mitigations — byte-stable shards
(slice 1, #1705) and a regenerate-on-conflict merge driver (slice 5, #1708) — and
framed collisions as "non-events" (§4).

Dogfooding the ADR-0109 5-PR rollout — the predicted pathological case — proved
that framing incomplete:

- **Byte-stability only dedupes the STATIC surface.** The semantic half is
  agent-authored prose and is **not deterministic**: two PRs touching the same
  module produce different semantic text and conflict. ADR 0109 §4 itself notes
  this and defers it to the merge driver.
- **The merge driver only runs on LOCAL merges.** GitHub's server-side merge
  button (and any platform-side merge) bypasses custom git merge drivers entirely,
  so the conflict resurfaces on the platform — exactly where fleet PRs land.

The root cause is not git storage. It is **many concurrent writers of a
non-deterministic artifact.** The treadmill recurs whenever concurrent PRs — or a
fleet fanning out over overlapping modules — regenerate the same module's semantic
shard. The ADR-0109 token-free-CI constraint still holds: CI has no LLM
subscription, so the fix cannot simply regenerate semantic in CI without a
credentialed provider.

## Decision

**`main` is the single writer of the SEMANTIC half.** PRs carry only the
deterministic STATIC skeleton (byte-stable ⇒ they never conflict). Semantic is
(re)generated once, out of the PR path, where there is no concurrency — so a
single writer means zero conflicts regardless of which merge button is used.

### 1. The PR path is static-only

The pre-commit hook already runs `--static` (deterministic, byte-stable). Policy
hardens to: **nothing writes _committed_ semantic on a branch.** In-session
provider-backed regeneration (`put_comprehension` / `comprehend --changed` with a
provider) is disabled on the PR path, or writes only to a git-ignored cache
overlay that is never committed. Enforcement is **branch-based** (only the `main`
main-pass may write committed semantic) because the `storage: cache` overlay is
not yet implemented.

### 2. `main` regenerates semantic — wire the dormant `comprehension.ci` seam

The config enum `ci: 'verify' | 'refresh' | 'off'` already exists but `refresh`
was unconsumed. The main-pass runs `comprehend --changed` (or periodic `--all`)
**with** a provider and commits the semantic shards to `main`. One writer, no
concurrency, no conflicts.

### 3. Provider for the main pass — MAINTAINER-LOCAL (chosen)

CI has no subscription. Of the three provider options — (a) a scheduled
keyed/self-hosted runner, (b) a maintainer's periodic local
`harness comprehend --all`, (c) a subscription-authenticated environment — we
choose **(b) maintainer-local**: zero new infra, CI stays token-free (the ADR-0109
invariant is preserved), conflicts end immediately, freshness is manual-cadence
(accepted — committed static serves warm in the interim). Option (a) — the
scheduled keyed runner — is the **alternative provider** that the opt-in
token-gated `comprehension.ci: refresh` mode (#1689) plugs into; it is off by
default and requires an LLM credential as a CI secret.

### 4. Reframe the slice-4 regression gate to guard `main`, not PRs

With static-only PRs, every touched module goes `present` (base) → `absent` (PR).
On a PR, `present → absent` is **EXPECTED** and is not a regression. The gate's
real job moves to `main` — "did the post-merge `main` lose semantic it previously
had?" — via the `--context <pr|main>` split.

### 5. Serve / prewarm unchanged

Committed static shards serve immediately (warm); after the main semantic pass,
semantic. The token-savings win from ADR 0107/0109 is fully preserved.

## Consequences

- **Zero semantic-shard conflicts.** PRs are clean, static-only, byte-stable; the
  fix works regardless of which merge button is used; the fleet families stop
  generating the comprehension conflict treadmill they currently cause.
- **Lose in-PR semantic review** (ADR-0109 §1 premise): semantic lands on `main`,
  not reviewed inline — a small real loss since generated prose is skimmed.
- **Main semantic freshness is bounded by maintainer cadence.** Mitigated by the
  always-warm committed static half and by #1689 as the opt-in automated
  alternative.
- **`storage: cache` (never commit semantic) retained as the simpler alternative**
  — removes the provider question but loses warm-on-clone; rejected as the default.
- **Extends, does not supersede, ADR 0107/0108/0109.** It corrects only 0109 §4's
  "collisions become non-events" framing for the server-side-merge case.

## Implementation slices

1. **#1713 — single-writer core** (PR #1728, merged): static-only PR path; wire
   `comprehension.ci: refresh`; reframe the slice-4 gate to `--context pr|main`.
2. **#1689 — opt-in token-gated CI refresh** (PR #1729, merged): the automated
   alternative provider (off by default, LLM credential via CI secret) on the same
   single-writer main-pass seam.

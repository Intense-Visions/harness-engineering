---
number: 0077
title: Discovery is a wide net; the benchmark ranker judges
date: 2026-07-17
status: accepted
tier: integration
source: docs/changes/recommendation-engine-recency/proposal.md
---

## Context

The local-model recommendation engine was recommending 6-month-stale models. Two
mechanisms in the discovery layer quietly did quality selection by popularity —
work the benchmark ranker is supposed to own — before the ranker ever saw the
candidates:

1. **Sort-by-downloads pre-filter.** `discoverOrg`
   (`packages/local-models/src/candidates/discover.ts`) listed each approved org's
   GGUF repos with `sort: 'downloads'` only. Cumulative downloads are a
   months-to-years-lagging popularity signal, so a brand-new leader with few
   cumulative downloads never appeared in the per-org slice — it was crowded out
   of the pool before the ranker could score it. Discovery was, in effect, ranking
   by popularity under the guise of "listing candidates."
2. **A too-narrow `allowedOrgs`.** The pool's `allowedOrgs` allowlist
   (`harness.orchestrator*.md`) omitted several current-leader orgs (`openai`,
   `zai-org`, `THUDM`, `moonshotai`), so even their established models could not
   enter the pool.

The benchmark ranker (`packages/local-models/src/ranker/evidence.ts`) is the
intended sole quality authority — it scores candidates on agentic-suitability
evidence. Letting discovery pre-decide quality by download count made the ranker's
judgement moot for exactly the new models the engine most needs to surface.

## Decision

**D1 — Discovery is a wide net; it does not judge quality.** `discoverOrg` now
fetches BOTH `sort: 'trending'` (new/hot) AND `sort: 'downloads'` (established) per
org, merges the two lists, dedupes by model id, and caps the merged set at
`perOrgLimit` (no count blow-up). The union — not a popularity-pre-filtered slice —
is handed downstream. Discovery's job is coverage, not selection.

**D2 — Discovery is best-effort and fail-soft.** A throwing `trending` list call is
warned and dropped, leaving the `downloads` result (discovery never breaks on the
new call). A throwing base `downloads` call keeps the existing org-skip fail-soft
behavior. Trending is listed first in the merge so new leaders win the per-org cap
tie-break, and dedupe is by model id before `getModel` so no repo is fetched twice.

**D3 — `allowedOrgs`/`allowedFamilies` remain the operator TRUST gate, not a
quality gate.** `select.ts` still filters candidates to the operator's approved
orgs/families — the same line the pool enforces at install time. Expanding
`allowedOrgs` to include the 2026-leader orgs widens what the operator trusts; it
does not rank. Quality remains the ranker's sole call.

**D4 — The benchmark ranker is untouched.** This change only widens the input set
handed to the ranker. `ranker/evidence.ts` and `benchmarks/merge.ts` are not
modified (asserted via an empty `git diff --stat` for those paths).

## Consequences

- New leaders now reach the ranker: a model that is trending but not yet a
  top-cumulative-downloads repo enters the candidate pool and gets scored on merit.
- **This is a discovery-coverage change, not a ranking change.** It does not — and
  is not meant to — alter how candidates are scored; it only ensures the ranker sees
  the right set. The ranker's scoring is out of scope (D4).
- Discovery is best-effort: a HuggingFace `trending` outage degrades to the prior
  downloads-only behavior rather than breaking a refresh (D2).
- **The discovery↔ranking boundary is now explicit and must not be blurred.** Do not
  re-add popularity filters to discovery (that re-hides the crowd-out bug), and do
  not add discovery/recency heuristics to the ranker (that forks the quality
  authority). Popularity, if it should influence recommendations at all, belongs in
  the ranker's evidence model — never as a discovery pre-filter.

## Alternatives rejected

- **Raise the per-org `downloads` limit instead of adding `trending`.** A larger
  downloads slice still orders by cumulative popularity, so a brand-new leader with
  few cumulative downloads stays at the bottom and is still crowded out below the
  cap. `trending` is the signal that surfaces recency; a bigger downloads window is
  not. Rejected.
- **Add recency weighting to the ranker and leave discovery as-is.** The ranker
  cannot score a candidate it never receives; the crowd-out happens upstream in
  discovery. Fixing recency purely in the ranker would leave the pool blind to new
  models. Rejected in favor of widening discovery (D1) and keeping the ranker as the
  quality authority (D4).
- **Make discovery rank (e.g. blend trending + downloads into a score).** That would
  re-introduce quality selection into discovery — exactly the coupling this ADR
  removes. Discovery merges and dedupes; it does not score (D1). Rejected.

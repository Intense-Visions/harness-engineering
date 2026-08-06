---
'@harness-engineering/orchestrator': patch
'@harness-engineering/local-models': patch
---

Correct stale LMLM candidate-discovery documentation and lock in the
live-discovery → recommender wiring with regression tests.

The live-HuggingFace → `RankerCandidate` parser (`parseHfModelToCandidates`),
the fail-soft discovery function (`discoverCandidates`), and the orchestrator
glue (`refreshCandidatesLive` → `seedRecommender`, wired at the CLI composition
root and fired on startup + the operator Refresh button) are all in place — the
autonomous swap-proposal loop consumes discovered candidates, so it is live, not
inert. Three source comments (`Orchestrator.modelRecommender`,
`startRefreshScheduler`, and `createNativeRecommender`) still asserted the
parser "was never built" and that the recommender is "seeded with an empty
candidate set"; those claims contradicted the shipped code and are corrected.

Adds orchestrator integration tests covering the previously-untested glue:
`refreshCandidatesLive` re-seeds the recommender with discovered,
allowlist-filtered candidates and the recommender ranks them (proving the loop
is live), plus the three fail-closed branches — discovery throws, discovery
yields nothing installable, and no orgs approved — each keeping the standing
frozen candidates. No runtime behavior change.

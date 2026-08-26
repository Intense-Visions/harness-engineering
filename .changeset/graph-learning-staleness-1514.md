---
'@harness-engineering/graph': minor
'@harness-engineering/core': minor
'@harness-engineering/cli': patch
---

feat(graph): deletion-based staleness flag on learning/execution_outcome nodes, surfaced in NLQ

Ports the deletion slice of Graphify's reflection loop (ADR 0104). Graph nodes now
carry an optional `StalenessInfo` marker (back-compat) that trips when a cited source
file no longer exists, a new NLQ `staleness` intent lists stale learnings, and
`flagStaleLearningNodes` (core) reuses `detectStaleLearnings` to stamp the marker
during `harness graph scan`. Move/rename detection is deferred.

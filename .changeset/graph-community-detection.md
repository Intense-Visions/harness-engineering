---
'@harness-engineering/graph': minor
'@harness-engineering/cli': minor
---

Add Louvain community detection over the knowledge graph. A new pluggable `CommunityDetector` interface with a self-contained `LouvainDetector` implementation partitions the graph into communities by maximizing modularity (undirected, confidence-weighted), and `detectCommunities` labels each node with its community id via a new optional, back-compatible `GraphNode.community` field. The pass is wired into `graph scan` (after ingest/link, before save) so labels persist through the Serializer and the scan output reports the community count. Detection is deterministic given a seed/tie-break order. Leiden is deferred behind the same interface as a follow-up.

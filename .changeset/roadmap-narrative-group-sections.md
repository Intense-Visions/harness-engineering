---
'@harness-engineering/types': minor
'@harness-engineering/core': minor
---

Support thematic grouping / narrative sections in a roadmap milestone.

An `### H3` whose heading text begins with the literal marker `Group: ` is now parsed as a narrative grouping section rather than a strict feature row: its body is captured verbatim on the new optional `RoadmapMilestone.groups` field (`RoadmapGroup`) and is never feature-validated, so free-form bullets, prose, blockquotes, and links no longer make the whole roadmap fail to parse. `serializeRoadmap` re-emits every group, so the serializer no longer flattens the narrative away.

The marker is explicit: a plain `### <name>` with no `- **Status:**` bullet still fails to parse, so real work is never silently skipped. A feature that genuinely needs a name starting with `Group: ` is authored as `### Feature: Group: <name>` — the explicit `Feature: ` prefix wins over the group marker, and the serializer emits it automatically for such names, so no tracked row is ever reclassified as narrative. Strict roadmaps are unaffected: `groups` is attached only when a milestone actually has one, so their parsed shape is byte-identical to before, and feature validation, `milestone.features`, and sharded mode are unchanged.

**A grouped roadmap is edited by hand.** Adding a group is a deliberate trade-off, because the automated write paths do not maintain group sections: the single-file writer (`manage_roadmap` update/promote/sync) **refuses** to rewrite a roadmap that carries groups, failing loudly with a "cannot preserve" error rather than destroying the prose, and `harness roadmap shard` likewise refuses to shard one. In sharded mode, do not add groups to `docs/roadmap.md` at all — it is a derived aggregate rebuilt from `docs/roadmap.d/` and is regenerated wholesale, so a group added there is dropped on the next `harness roadmap regen`. Narrative groups are a hand-edited monolith feature.

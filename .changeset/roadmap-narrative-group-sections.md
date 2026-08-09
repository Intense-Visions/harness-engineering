---
'@harness-engineering/types': minor
'@harness-engineering/core': minor
---

Support thematic grouping / narrative sections in a roadmap milestone.

An `### H3` whose heading text begins with the literal marker `Group: ` is now parsed as a narrative grouping section rather than a strict feature row: its body is captured verbatim on the new optional `RoadmapMilestone.groups` field (`RoadmapGroup`) and is never feature-validated, so free-form bullets, prose, blockquotes, and links no longer make the whole roadmap fail to parse. `serializeRoadmap` re-emits every group after its milestone's features, so a parse → edit → write cycle preserves the narrative instead of flattening it.

The marker is explicit: a plain `### <name>` with no `- **Status:**` bullet still fails to parse, so real work is never silently skipped. Strict roadmaps are unaffected — `groups` is attached only when a milestone actually has one, so their parsed shape is byte-identical to before, and feature validation, `milestone.features`, and sharded mode are unchanged.

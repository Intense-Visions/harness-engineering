---
'@harness-engineering/core': patch
'@harness-engineering/cli': patch
---

`manage_roadmap` no longer writes a field value containing a line break into the roadmap. Such a value used to land as a new line, so `plans: ['x\n- **Status:** done']` flipped a planned row to done and a heading-shaped feature name made every later read fail. `add`, `update` and `promote` now reject any field with a line break or control character (`summary` may still span lines), name the field, and write nothing. The roadmap serializer also refuses to emit a line break, so every writer is protected. New core export: `validateRoadmapFeatureFields`. (#2623)

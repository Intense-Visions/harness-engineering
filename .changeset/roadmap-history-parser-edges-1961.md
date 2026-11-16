---
'@harness-engineering/core': patch
'@harness-engineering/cli': patch
---

fix(roadmap): close the post-#1862 `## Assignment History` parser edges (#1961). A bullet block missing its `Feature` bullet (or repeating a label) is now refused instead of silently merging into its neighbour; a legacy table row sitting above the `|---|` separator is reported instead of dropped; GFM alignment separators (`| :--- |`) are read; a `_meta.md` whose history heading is a near miss (`## Assignment History (legacy)`) now fails `harness roadmap regen` instead of writing an aggregate `parseRoadmap` rejects; a heading that only mentions the section (an `###` heading, or an H1/H2 with no records under it) no longer hard-fails a document; and `roadmap regen` only advises `--allow-unreadable-history` for an error that flag can actually recover.

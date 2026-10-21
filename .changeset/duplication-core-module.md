---
'@harness-engineering/core': minor
---

Add the `duplication` module: a deterministic, offline Type-1/2 clone index over TS/JS sources
(`buildCloneIndex`, `CloneIndex`, `CloneClass`, `CloneMember`, `CloneUnitKind`,
`DuplicationConfig`). Whole-unit granularity over normalized token-stream fingerprints, with no
new dependencies. Phase 1 of the DRY-floor spec — reusable module only; nothing is wired into
the entropy pipeline, CLI, MCP, or code-craft yet.

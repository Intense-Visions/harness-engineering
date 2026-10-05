---
'@harness-engineering/core': patch
'@harness-engineering/cli': patch
---

`check-arch` now actually measures `circular-deps`, `layer-violations` and `forbidden-imports` (#2235). All three were 0 whatever the code did, so the arch ratchet reported "no new violations" for them without having looked.

- **`circular-deps`** built its graph with a stub parser that never parsed, giving nodes and zero edges, and it globbed only `**/*.ts`. It now uses the real parser registry and every JS/TS extension (`.ts .tsx .mts .cts .js .jsx .mjs .cjs`).
- **`layer-violations`** validated against `layers: []`. It now uses the top-level `layers` block from `harness.config.json`, the same one `check-deps` reads. A non-default `rootDir` is folded into the layer patterns the same way `check-deps` resolves them.
- **`forbidden-imports`** filtered for a `FORBIDDEN_IMPORT` reason that no engine ever emits. It now applies the top-level `forbiddenImports` rules itself, using the ESLint `no-forbidden-imports` matching: exact specifier, or a glob against the specifier or the resolved root-relative path. Package and `node:` builtin imports count.
- Each of the three results now reports what it measured in `metadata`, so a 0 from a run that analysed nothing can be told apart from a clean result. The fields are `filesAnalyzed`/`edgeCount`, `layersConfigured`/`modulesAnalyzed`, and `rulesConfigured`/`filesAnalyzed`.
- `ArchConfig` gains optional `layers` and `forbiddenImports` fields. They are not part of the `architecture` config schema. `check-arch` and `snapshot` inject them from the existing top-level blocks, so `harness.config.json` needs no change.

**Expect your recorded values to rise.** A project with real cycles or layer breaks that are already visible to `check-deps` will now see `check-arch` count them as well.

---
'@harness-engineering/eslint-plugin': patch
---

Use the project root (the directory of `harness.config.json`) as the
path-normalization anchor for `no-forbidden-imports` and
`no-layer-violation`. Previously, both rules anchored to `/src/`, which
collapsed `<monorepo>/packages/<x>/src/foo.ts` to `src/foo.ts` and destroyed
the package prefix — making layer-based rules with `from: "packages/<x>/**"`
patterns unable to match files inside `<package>/src/**`.

`normalizePath` and `resolveImportPath` now accept an optional `projectRoot`
parameter. When provided and the file lives under the root, the
project-root-relative path is returned (preserving package identity).
Otherwise the existing `/src/` heuristic is used unchanged, so
single-package projects and any direct callers of the utilities are
unaffected. A new `getConfigRoot(filePath)` helper in `config-loader`
resolves the anchor from the nearest ancestor `harness.config.json`.

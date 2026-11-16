---
'@harness-engineering/eslint-plugin': minor
---

`no-layer-violation` gains an opt-in `resolveWorkspacePackages` option. When enabled, bare specifiers naming a workspace package (`@scope/pkg`, `@scope/pkg/sub`) are resolved — via `pnpm-workspace.yaml` or `package.json` `workspaces`, each member's `exports`/`main`, and `dist/` → `src/` mapping — to the package's source file and checked against the layer config, so cross-package layer violations are reported. The workspace map is cached per workspace root for the lint run. Off by default; behaviour is unchanged unless enabled. Refs #2216.

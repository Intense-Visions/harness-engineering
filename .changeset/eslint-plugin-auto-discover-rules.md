---
'@harness-engineering/eslint-plugin': patch
---

feat(eslint-plugin): auto-generate the rule barrel from src/rules/

`src/rules/index.ts` (the barrel that imports every rule and assembles the
`rules` map) is now GENERATED from the rule files by
`scripts/generate-rules-barrel.mjs` — a rule file's basename is its rule name and
its default export is the rule, so registration is fully derivable. The generator
is chained into `build`, `test`, and `typecheck`, so the barrel is always fresh;
`generate:rules:check` guards freshness in CI.

Adding a rule is now a single self-contained file drop in `src/rules/` — no
hand-edit of the barrel, and no count to bump (the integration test asserts the
barrel registers exactly the files on disk, a filesystem invariant rather than a
hardcoded roster). This removes the precise multi-site barrel edit (import +
object entry, correct placement, no dupes) that is the most error-prone step in
adding a rule — especially for automated/local-model contributors. Preset
membership (recommended/strict) remains an explicit, curated choice in
`src/index.ts`.

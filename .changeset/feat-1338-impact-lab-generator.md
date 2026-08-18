---
'@harness-engineering/core': minor
---

Implement the blueprint Impact Lab data generator (#1338).

Adds `packages/core/src/blueprint/impact-lab-generator.ts` exporting
`generateImpactData`, which builds the seed "if I change this file, what
breaks?" data for a blueprint's Impact Lab. The impact source is injected (an
`ImpactAnalyzer` mirroring the `get_impact` MCP grouping of tests / docs / code /
other), so the generator stays pure, degrades gracefully to an empty impact set
when no graph is available, and classifies + tallies downstream-impacted nodes
per category.

Also wires the root-level `tests/` vitest tree into CI on every OS via a new
`test:root` script, so root-level specs (e.g. `tests/blueprint/impact-lab.test.ts`)
can no longer reference a missing module and rot unnoticed. The existing
`node --test 'tests/scripts/*.test.mjs'` run is unaffected (root vitest discovery
is scoped to `tests/**/*.test.ts`).

---
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
'@harness-engineering/orchestrator': minor
---

Add the compiled comprehension substrate (#1558): a persistent, incrementally
recompiled per-module comprehension layer (LLM summary + invariants, static
interface contract + dependency slice) served to agents as primary context.

- `@harness-engineering/core`: the pure, IO/provider-injected compiler + store —
  `compileModule`, `ComprehensionStore`, `computeSourceHash` (membership-folded
  full SHA-256), markdown+frontmatter (de)serialization, the LLM-free serve-time
  hash gate (`serveGate`), and the `createNodeModuleSourceReader` canonical
  enumeration.
- `@harness-engineering/cli`: the `harness comprehend` command
  (`--changed`/`--all`/`--check`/`--stats`), the `get_comprehension` MCP tool, the
  default-on `comprehension` constituent in `gather_context`, the static extractor
  and semantic-generation adapter, and a `claude`-CLI fallback appended to the
  analysis-provider resolver (ADR 0106 — strictly additive; also repairs
  `acceptance_eval`/`outcome_eval` for subscription users).
- `@harness-engineering/orchestrator`: dispatch-time pre-warm of a leaf's
  blast-radius comprehension units and served-unit attribution into the
  per-leaf context budget (#1524).

Correctness never requires a credential: the serve-time hash gate, `--check`, and
`--stats` are LLM-free, and semantic generation degrades to static-only when no
provider resolves.

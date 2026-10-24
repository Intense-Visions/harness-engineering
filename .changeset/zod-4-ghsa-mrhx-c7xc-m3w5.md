---
'@harness-engineering/types': minor
'@harness-engineering/core': minor
'@harness-engineering/intelligence': minor
'@harness-engineering/signals': minor
'@harness-engineering/graph': minor
'@harness-engineering/linter-gen': minor
'@harness-engineering/cli': minor
'@harness-engineering/dashboard': minor
'@harness-engineering/local-models': minor
'@harness-engineering/orchestrator': minor
'@harness-engineering/eslint-plugin': minor
---

Move every package from `zod ^3.25.76` to `zod ^4.6.6` for GHSA-mrhx-c7xc-m3w5
(high: zod can exhaust memory while validating oversized constrained collections).
The advisory covers every `zod < 4.6.6` and no patched 3.x exists, so this is a major
upgrade of the validator rather than a floor bump. Root `pnpm.overrides` gains
`"zod": ">=4.6.6 <5"` so transitive dependents (`@mistralai/mistralai`, the MCP SDK,
`openai`, `@anthropic-ai/sdk`) resolve the same patched copy; the lockfile has no
`zod@3` left. `@asteasolutions/zod-to-openapi` moves `^7.3.0` -> `^8.5.0` (its zod 4
line); `docs/api/openapi.yaml` regenerates byte-identical.

**Silent allowance bug this exposed.** In zod 4 an enum-keyed `z.record` is
exhaustive. `ArchAllowanceSchema.categories` used one, so an allowance listing only the
categories it acknowledges (the normal case) failed `safeParse`, and
`loadArchAllowances` skipped it without a word — the acknowledged regression stopped
counting. Every enum-keyed record (allowance categories, baseline/timeline metrics,
threshold config, trend/prediction categories and deltas, the routing
`complexityTierMatrix`, the GitHub tracker `statusMap`) is now `z.partialRecord`, which
is what zod 3 did at runtime and what their inferred types already said.

Other zod 4 semantics ported rather than shimmed (no `zod/v3` imports):

- Object `.default({})` / array-of-object defaults that relied on zod 3 parsing the
  default through the inner schema are now `.prefault()`, so nested defaults still fill.
- `skillHooks` stays `undefined` when absent (zod 4 applies an inner `.default()` even
  under `.optional()`).
- The JSON-schema converter used by the analysis providers and the
  `harness.config.json` stripped-key walker read zod 3 internals (`_def.typeName`);
  under zod 4 they would have emitted `{}` / reported no dropped keys. Both are ported
  to `_zod.def`, and the converter gains tests.
- `validateConfig` no longer misreports a missing field as a type mismatch (zod 4
  dropped `received` from `invalid_type` issues).
- Single-argument `z.record(v)` -> `z.record(z.string(), v)`; `errorMap` -> `error`.

Bump level is `minor`: these packages export zod schemas, and a consumer that composes
them with its own zod 3 instance will not interoperate. User-visible validation
messages also change wording (e.g. "Invalid input: expected number, received string").

---
'@harness-engineering/intelligence': minor
'@harness-engineering/cli': minor
---

Give design-craft BENCHMARK a real vision channel so the award bar is reachable.

BENCHMARK previously scored source **code** (`callText`), and `callVision` threw on
every provider with no image support in `@harness-engineering/intelligence` — so
`innovation` / `philosophicalCoherence` / surface could never be honestly judged and the
award verdict was structurally never `cleared`.

- `@harness-engineering/intelligence`: `AnalysisRequest.images` + Anthropic image content
  blocks; `claude-cli` image support via the `--input-format stream-json` transport.
- `@harness-engineering/cli`: real `AnalysisProviderAdapter.callVision` gated by a
  `supportsVision` capability flag (a non-vision backend throws instead of silently
  scoring a blank page); `runVisionBenchmark` scores the rendered screenshot; the
  `design_craft` tool routes deep-mode benchmark to it and requires a capture per
  page-scoped target.

Validated end-to-end against the real local `claude` CLI: the model reads images,
discriminates a strong page from a flat one, and a full-page strong capture clears all
five dimensions.

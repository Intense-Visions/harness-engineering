# Design-Craft Vision BENCHMARK — make the award bar actually reachable

**Keywords:** design-craft, benchmark, award-bar, vision, callVision, claude-cli, anthropic, intelligence-provider, screenshots

## Overview and goals

The `awardBar` verdict (ADR 0082 / `docs/changes/design-craft-award-bar`) is machine-derived from the BENCHMARK radar: each of the five dimensions must clear an exemplar-relative floor, and low confidence forces `indeterminate`. That spec explicitly listed **"no vision-mode changes"** as a non-goal.

The consequence, observed in the consuming `iv-demo` fleet: **`awardBar` is `false` on 40/40 recorded prospects, never once `cleared`.** The cause is not a missing corpus (the 9 MarketingPage exemplars are bundled) — it is that **BENCHMARK scored source code, not the rendered page**, and the vision channel it needed did not exist:

- `runBenchmark` built its prompt from the target's **source text** and called `provider.callText` (`packages/cli/src/design-craft/phases/benchmark.ts`).
- `LlmProvider.callVision` **threw on every provider** — `InSessionLlmProvider` ("must use a real provider"), `MockLlmProvider` ("Phase 2 work"), and `AnalysisProviderAdapter` ("wire vision when needed"). The `packages/intelligence` layer had no image support at all (`VisionInput` existed with zero implementations).

An LLM reading HTML/CSS cannot honestly judge `innovation`, `philosophicalCoherence`, or surface/craft — it lands sub-floor or at `low` confidence, so the verdict is **structurally never `cleared`.** The award bar has been unreachable since it shipped.

**Goal:** give BENCHMARK a real vision channel so the award bar is reachable — the model scores the _rendered screenshot_, exactly as the SKILL's deep mode already describes ("render via playwright … pass screenshots … to vision-capable LLM") and as `harness-design-craft/SKILL.md` anticipated ("`packages/intelligence/` … **may need extension if no vision support today**").

**Non-goals (YAGNI):** no change to the radar dimensions, the award-bar formula, exemplars, or the responsive gate; no new capture/browser tooling in the CLI (captures remain caller-supplied, per deep-mode critique).

## Decisions made

- **D1 — Extend the intelligence Anthropic provider for images.** `AnalysisRequest` gains `images?: AnalysisImage[]`; the Anthropic backend renders them as image content blocks ahead of the text prompt, keeping the `structured_output` tool contract. This is the extension the SKILL anticipated.
- **D2 — Real `callVision` on the adapter, gated by capability.** `AnalysisProviderAdapter.callVision` forwards the image through `analyze`. A `supportsVision` flag (true for `anthropic` + `claude-cli`, false otherwise) makes `callVision` **throw loudly** on a non-vision backend rather than silently forwarding an image the backend drops and scoring a blank page — the failure mode that would hallucinate a verdict.
- **D3 — Real vision through the local `claude` CLI.** The keyless path most interactive sessions use. `ClaudeCliAnalysisProvider` sends images via the `--input-format stream-json` transport (a user message whose content is the image block(s) + text) and reads `structured_output` from the terminal `result` event. Verified against Claude Code CLI 2.1.x.
- **D4 — Deep-mode BENCHMARK scores captures.** `runVisionBenchmark` mirrors `runBenchmark` but calls `callVision` over the rendered screenshot. The `design_craft` tool routes deep-mode benchmark to it, matching captures to targets by `file`, and **errors** when a page-scoped target has no capture — a page-scoped award verdict must never come from source alone.

## Technical design

- `packages/intelligence/src/analysis-provider/interface.ts` — `AnalysisImage` (`base64 | url` + `mediaType`) and `AnalysisRequest.images`.
- `packages/intelligence/src/analysis-provider/anthropic.ts` — user turn becomes a content-block array (image blocks + text) when images are present; unchanged (plain string) otherwise.
- `packages/intelligence/src/analysis-provider/claude-cli.ts` — `runClaudeVision` / `runClaudeStream`: stream-json transport with the image on stdin; text path unchanged.
- `packages/cli/src/shared/craft/llm/adapters.ts` — `callVision` implementation + `supportsVision` capability gate + `VisionInput → AnalysisImage` conversion (`imageBuffer → base64`).
- `packages/cli/src/design-craft/phases/benchmark.ts` — `VisionBenchmarkTarget` + `runVisionBenchmark` (reuses exemplar selection, `buildScore`, and the award-bar computation unchanged).
- `packages/cli/src/mcp/tools/design-craft.ts` — deep-mode benchmark → `runVisionBenchmark`; capture gate extended to benchmark; capture↔target join by `file`.

## Validation

Beyond unit/integration tests (Anthropic image-block construction, adapter capability gate, `runVisionBenchmark` + tool wiring), the path was validated **end-to-end against the real local `claude` CLI — no mocks, no API key:**

1. **The model genuinely sees images.** A rendered page with the token `ZORPTANGLE` on a `#0b5cff` field, sent headlessly via stream-json, returned `structured_output: {word: "ZORPTANGLE", bg: "#0A57FF"}`.
2. **It discriminates quality.** `runVisionBenchmark` (real `claude-cli` provider, son-daven exemplar) on a clean viewport capture: a strong Awwwards page vs a flat demo scored `innovation` **85 vs 56**, `philosophicalCoherence` **87 vs 77** — and reproduced the flat page's core defect unprompted: _"a recognizable hero-plus-section template — swapping the brand out would change little."_
3. **`cleared` is reachable.** A full-page capture of the strong page cleared all five dimensions (philosophicalCoherence 94, craftExecution 90, innovation 89; verdict `cleared`) — retiring the 40/40-always-false problem.

**Known characteristic:** LLM vision scoring carries run-to-run variance, amplified by degenerate captures (an animated site's full-page screenshot with large unrendered blank regions swung 88↔37 across two calls on the same image). Clean per-viewport captures gave stable results; the SKILL's 3-viewport capture guidance already mitigates this. A future N-pass median is a candidate follow-up.

The manual harness lives at `packages/cli/scripts/validate-vision-benchmark.mts` (not built/linted/typechecked — `tsconfig` includes only `src/**`).

## Follow-ups (out of scope here)

- **`iv-demo` wiring (consuming repo `harness-iv`):** invoke deep-mode BENCHMARK with 3-viewport captures + configure a vision-capable craft provider, so the pipeline stops recording `awardBar:false` by default. This PR delivers the capability; the consuming skill must opt into it.
- `openai-compatible` vision (currently gated off).
- N-pass median scoring to damp variance.

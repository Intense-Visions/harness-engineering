---
'@harness-engineering/local-models': minor
'@harness-engineering/orchestrator': minor
'@harness-engineering/dashboard': patch
'@harness-engineering/cli': patch
---

feat(lmlm): live HuggingFace candidate discovery on startup + Refresh button

The recommendation candidate list was a bundled, human-curated `candidates.json`
imported statically at build. The orchestrator now refreshes it **live from
HuggingFace** — on startup (in the background, non-blocking) and on the operator's
**Refresh** button — while keeping the frozen list as the offline-safe fallback.

- New `discoverCandidates()` in `@harness-engineering/local-models` composes the
  existing HF client + GGUF parser and **merges the curated `ollamaName`/`family`
  tags** from the frozen snapshot back in — the HF API doesn't carry them, and a
  candidate without an `ollamaName` isn't installable, so an un-mappable model is
  dropped rather than surfaced as a broken row.
- The orchestrator seeds the recommender from the frozen list immediately, then
  swaps in live results when discovery returns; `POST /api/v1/local-models/candidates/refresh`
  re-discovers + re-seeds + re-ranks on demand. Fail-closed: any HF error or empty
  result keeps the current candidates.
- The dashboard **Refresh** button now triggers the live refresh (one button = "get
  the latest").
- Discovery defaults to a no-op on the `Orchestrator` (so tests make no network
  calls); the CLI's `orchestrator run` wires the real implementation.

Delivers the `lmlm-live-hf-candidate-discovery` roadmap item. Note: discovery
refreshes/ranks the **curated** model set — onboarding a brand-new installable
model still needs its `ollamaName` mapping added (a deliberate curation boundary).

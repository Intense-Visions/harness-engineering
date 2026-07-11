---
'@harness-engineering/orchestrator': minor
'@harness-engineering/intelligence': minor
'@harness-engineering/types': minor
'@harness-engineering/cli': minor
---

feat(adaptive-model-routing): provider-neutral capability-tier routing (AMR Phases 1–4)

Adds Adaptive Model Routing — provider-neutral, capability-tier-based backend
selection driven by task complexity — behind a **default-off** gate. It is fully
**opt-in**: with no `routing.policy` in `harness.config.json`, `AdaptiveRouter`
is never constructed, the complexity classifier never runs, and routing is
byte-identical to the shipped `BackendRouter` (no new spans, LLM calls, or latency).

- **types**: additive `BackendCapabilities`, `ComplexityVerdict`, `RoutingRequest`,
  `RoutingPolicy`, `RoutingError` (codes `privacy-no-match` / `escalation-exhausted`);
  optional `capabilities?` on `BackendDef`; optional `complexity` / `tierRequired` /
  `estCostUsd` on `RoutingDecision`. `RoutingValue` is **not** widened — tier resolution
  lives entirely in the AMR layer (backward-compatible). `RoutingError` is now the single
  error family for AMR routing failures: the orchestrator's `PrivacyNoMatch` extends it
  (carrying `code: 'privacy-no-match'`), so it is catchable/narrowable as either — a
  backward-compatible refinement (`PrivacyNoMatch` is still an `Error` with the same
  `name`/`code`).
- **intelligence**: a complexity cascade (static pass → `fast` LLM tie-break →
  confidence-gated `standard` escalation) emitting a `ComplexityVerdict`, plus pure
  `deriveRequiredTier` resolution (matrix → D5 blast-radius `strong` veto →
  low-confidence up-bump → D8 budget clamp → D10 escalation floor). The LLM never
  influences the final tier.
- **orchestrator**: `AdaptiveRouter` wraps `BackendRouter` (which is unchanged), a
  capability registry + cheapest-qualifying selection that fails **closed** on
  privacy/allowlist exclusion, enriched `routing:decision` telemetry, and a vertical
  `EscalationState` (D10/SC16) that climbs a coherence unit's floor tier on repeated
  quality failures (monotonic, `strong`-capped). Live dispatch routes through
  `AdaptiveRouter` only when a `routing.policy` is present. Both routing hard-fails now
  **surface to a human** via the `needs-human` interaction queue (not just a log): a
  fail-closed `PrivacyNoMatch` at the dispatch boundary emits a distinct
  `routing:no-tier-match` steward escalation (never recorded as a transport failure, never
  fed to escalation), and an exhausted `strong`-ceiling re-crossing emits
  `routing:escalation-exhausted` (D10 hard-fail-to-human).
- **cli**: `harness routing trace --complexity <level> --risk <band>` dry-runs a
  routing decision (prints derived tier + chosen backend without dispatching), with
  client-side enum validation.

Split-routing (D6/SC4) and the live quality-gate fan-in into escalation (Phase 4c)
are deferred — see `docs/changes/adaptive-model-routing/proposal.md` "Deferred
follow-ups". No behavior changes for existing single-backend or multi-backend
configs.

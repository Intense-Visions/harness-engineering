---
slug: "lmlm-build-quality-model-selection"
milestone: "Intake"
order: 3
---

### LMLM: feed post-build quality into per-model build routing

- **Status:** planned
- **Spec:** —
- **Summary:** Follow-on to the deterministic tool-calling capability signal (PR #833). Add a LEARNED build-quality signal so a local model that tool-calls but produces failing/buggy builds is deprioritized for build routing over time — the soft-quality dimension the capability probe deliberately does NOT cover. Approach (minimal slice): attribute each build's quality outcome (tests/review, or the roadmap-auto-triage Phase-4 retrospective verdict) to the SPECIFIC resolved local model — today only `lastRoutedTier` is stashed on the running entry, so the ollama model id must be threaded through the completion/retrospective path — then feed quality-fails into the EXISTING `LocalModelResolver` circuit breaker (threshold 3 + cooldown) rather than a new scoring subsystem, reusing its anti-flakiness + recovery. Keep capability (deterministic probe) separate from reliability (learned). Design MUST include decay/exploration so a model demoted on one flaky build can recover. **Gated on build throughput:** local agentic builds are minutes-to-tens-of-minutes, so meaningful per-model signal accrues slowly, and the acute hard-failure case is already covered by the breaker + the capability probe — so near-term value is low until build volume (cloud / faster hardware) makes learning worthwhile.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** —

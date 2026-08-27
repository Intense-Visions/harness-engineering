---
slug: "bullwhip-demand-signal-dampening"
milestone: "Fleet Family — Batch Orchestration"
order: 145
---

### Bullwhip dampening — end-demand visibility across pipeline stages

- **Status:** planned
- **Spec:** —
- **Summary:** Supply chains discovered that order variance amplifies upstream: each stage orders based on the noisy orders of the stage below, adding its own safety stock and batching, so a small ripple in end demand becomes a whip at the far end — and the fix is structural, not behavioral: share the end-demand signal with every stage instead of letting each stage see only its neighbor. Multi-stage orchestration has the same topology: intent → decomposition → dispatch → verification → landing, each stage sizing its work and buffers from the stage adjacent to it. A burst of intents becomes over-decomposition, which becomes over-dispatch, which floods verification, which batches landings — amplified variance at every hop, visible in telemetry as oscillating load that no single stage caused. Import the fix: every stage reads the true end-demand signal (the intent arrival rate and its forecast) directly, sizes its buffers against that instead of against its upstream neighbor's bursts, and batching policies are set globally rather than per-stage. The measurable claim: variance amplification ratio per stage (output variance / input variance), currently unmeasured, drops toward 1 when stages share the demand signal.
- **Blockers:** Depends on `feedback-control-for-governors` and `queueing-model-for-pipeline-capacity`
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1666

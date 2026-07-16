---
slug: "local-model-agentic-suitability"
milestone: "Intake"
order: 23
---

### Agentic-suitability in the local-model pool recommender

- **Status:** planned
- **Spec:** —
- **Summary:** The pool ranker (`packages/local-models/src/ranker/algorithm.ts`) scores candidates by VRAM fitness + a **bandwidth-estimated** tokens/sec (speed-confidence bands) + benchmark confidence — but it does NOT compose those into "is this model usable for **autonomous agentic dispatch**," and that gap picks unusable models. Live evidence (2026-07-16): **llama3.3:70b** fits memory and its tokens/sec *estimate* looked fine, but real agentic latency — time-to-first-token on a 66GB model with a large multi-turn context — was a **4-minute single call**, unusable for a tool-loop; **qwen2.5-coder:7b** fits and is fast but **won't emit tool_calls** (should be excluded from agentic routing, not merely down-ranked); **qwen3:32b** tool-calls and completes but stumbles on some tasks. Add an **agentic-suitability** dimension the recommender/AMR use to select for dispatch = (a) tool-calling capability as a HARD filter (reuse the deterministic probe from #833 in `packages/local-models/src/capability/tool-calling.ts` — no tool-calls ⇒ ineligible for agentic use), × (b) a **measured** agentic latency/throughput signal (time-to-first-token + turn latency under a real agentic prompt, not the bandwidth estimate — a model over a latency budget is ineligible/steeply penalized for interactive dispatch even if it fits), × (c) learned build quality (the `local-dispatch-...`/`lmlm-build-quality-model-selection` follow-on). Keep the existing size/speed/benchmark ranking for non-agentic uses; expose a separate `agenticScore` so a fits-VRAM-but-too-slow / can't-tool-call / builds-badly model is never routed autonomous work. Ties to Agent-Autonomy: the pool should recommend a model a human can actually let run unattended.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** —

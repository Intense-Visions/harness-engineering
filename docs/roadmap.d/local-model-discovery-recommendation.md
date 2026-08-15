---
slug: "local-model-discovery-recommendation"
milestone: "Intake"
order: 24
---

### Automate best-model discovery/recommendation for local dispatch

- **Status:** done
- **Spec:** —
- **Summary:** The pool recommender should automate the manual process a human just used to pick a local coding model, and that process taught concrete lessons the frozen ranker misses. When picking a model for agentic dispatch by hand (2026-07-16) the winning process was: (1) query **current** authoritative sources for the best agentic coders — the landscape moves monthly (llama3.3:70b → qwen3-coder:30b / devstral-24b / laguna-xs), so a frozen snapshot goes stale; recency must be a ranking input. (2) Filter by hardware fit (already done). (3) **Rank speed by MoE ACTIVE params, not total size** — this was the key miss: a dense 70B is too slow for a tool-loop (a single call took 4 min) while a 30B **MoE with ~3B active** is fast and usable; the ranker's bandwidth×total-size estimate treats these the same, so it must model compute/latency from active params (MoE-aware). (4) **Require tool-calling** (hard filter — reuse #833's probe). (5) **Weight agentic benchmarks** — SWE-bench Verified (devstral 46.8%, laguna-xs 70.9%) over generic perplexity/chat benchmarks. (6) **Prefer coding/agent-specialized** models (qwen3-coder, Mistral's agent-first devstral) over general chat models for dispatch. Build a discovery step that pulls current candidates (Ollama library + HF + published SWE-bench numbers) with recency weighting, computes the [[local-model-agentic-suitability]] `agenticScore` (tool-calling × MoE-aware latency × agentic benchmark × learned build quality), surfaces the top recommendation for dispatch, and can **auto-pull** it. This makes the pool's suggestions match — or beat — what an expert would pick by hand, instead of recommending a fits-VRAM-but-too-slow dense model. Cross-refs #833 (tool-calling probe), the agentic-suitability item, and the LMLM live-HF candidate-discovery work.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1005
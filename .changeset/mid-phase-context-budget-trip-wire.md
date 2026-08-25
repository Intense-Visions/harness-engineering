---
'@harness-engineering/core': minor
---

Add a mid-phase context-budget trip wire (`evaluateContextBudget`).

Autopilot keeps context fresh _between_ phases (each state dispatches a cold subagent),
but nothing watched a single long-running turn for context creep _within_ its own turn.
This adds a pure, deterministic helper — `evaluateContextBudget(usedTokens, window)` plus
`resolveContextBudgetThresholds(window)` and `EFFECTIVE_WINDOW_RATIO` — that classifies a
turn's total resident-token count (input + output + tool results) as `ok | warn | trip`
against token-anchored, window-keyed thresholds (`1m` warn 250K/trip 350K; `200k` warn
80K/trip 100K; `local` warn ~30%/trip ~37.5%) rather than a naive flat percentage. The
autopilot, harness-execution, and skill-authoring skills document the two-stage discipline
(soft-warn ⇒ converge + flush state; hard-trip ⇒ checkpoint-and-restart into a cold
subagent seeded with a distilled state file). Threshold policy grounded in Chroma Context
Rot, NoLiMa, RULER, Lost-in-the-Middle, Anthropic Effective Context Engineering, and
Horthy/Pragmatic Engineer. Closes #1403.

---
slug: "cloud-autopilot-diagnostic-agent-on-stuck"
milestone: "Intake"
order: 29
---

### Cloud autopilot: independent diagnostic agent on stuck retry

- **Status:** planned
- **Spec:** —
- **Summary:** Port a convergence lesson from the local-model executor to the cloud autopilot. Today the autopilot's EXECUTE retry budget (harness-autopilot SKILL.md: attempt 1 obvious fix → attempt 2 related files + learnings → attempt 3 full context) escalates **context** but always re-dispatches the **same `harness-task-executor`** persona — it never brings in a *different, diagnosis-focused* agent when the executor is genuinely stuck. The local path added a "reasoner unstick advisory" (#937): after N failed self-corrections it dispatches an independent reasoning model to produce a structured root-cause + concrete fix, prepended to the next attempt's prompt — a validated pattern (re-prompting a stuck executor with more raw context is weak; a fresh independent diagnosis is not). Proposal: on the autopilot's final retry (or a new attempt N+1 before recovery), dispatch an independent diagnostic agent (`harness-adversarial-reviewer` or a dedicated diagnostician) with the task + accumulated diff + exact gate/test failure, and feed its structured `{root cause, prescribed fix}` to `harness-task-executor` instead of only piling on context. Adds agent-independence + structured diagnosis to the retry loop. Notes: (a) adopter-portable skill → must mirror across all 4 platform copies (claude-code/cursor/codex/gemini-cli); (b) scope guard — keep the 3-attempt/1-diagnosis budget so it can't compound failures; (c) design review needed on which persona diagnoses and whether it's a new agent. Related: the gate-failure distiller and per-stage personas from the same campaign are already covered on the cloud path (Claude reads full tool output natively; cloud already delegates to persona subagents), so this is the one genuine local→cloud crossover.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** —

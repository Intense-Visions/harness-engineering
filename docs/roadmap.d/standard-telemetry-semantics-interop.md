---
slug: "standard-telemetry-semantics-interop"
milestone: "v5.0 — Telemetry & Effectiveness"
order: 150
---

### Standards interop — OpenTelemetry GenAI semantics and emerging agent protocols

- **Status:** planned
- **Spec:** —
- **Summary:** The telemetry estate is proprietary by accident rather than by decision, and the field is converging on standards: OpenTelemetry's GenAI semantic conventions for model/agent spans (tokens, model IDs, tool calls, costs) and emerging agent-interop protocols for cross-system agent communication. Every proprietary format is a standing tax — adopters cannot point their existing observability stack (the collectors, dashboards, and alerting they already run) at harness telemetry, and the federation/passport items will need wire formats that other systems speak. The work: map the internal telemetry envelope onto OTel GenAI semconv and emit it natively (OTLP export alongside the internal store, not a lossy bridge bolted on later); adopt standard span semantics for agent runs, tool calls, and gate executions; and track the agent-interop protocol space deliberately — a periodic assessment with adopt/wrap/ignore verdicts per standard — so the passport and federation wire formats align with whatever the ecosystem converges on rather than fighting it. Interop is an adoption feature: telemetry that lands in the adopter's existing dashboards on day one removes a whole integration project from the adoption cost.
- **Blockers:** Depends on `basal-token-metabolism`, `cross-project-knowledge-federation`, and `verification-passports`
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1648

---
slug: "orchestrator-codex-backend-subprocess-env-air-gap"
milestone: "Parallel Execution & State"
order: 6
---

### Orchestrator Codex Backend Subprocess Env Air-Gap (follow-up)

- **Status:** done
- **Spec:** —
- **Summary:** Apply the subprocess env allowlist air-gap to the Codex backend. The gateway policy-envelope work air-gapped the Claude backend's subprocess spawn (replaced `env: process.env` with an explicit allowlist), but the Codex backend (`packages/orchestrator/src/backends/codex.ts`) still passes the full parent environment to its spawned subprocess — the same leak, unpatched. Extend the shared subprocess-env allowlist + PolicyMetadata stamping to codex.ts so both backends enforce the boundary identically. Follow-up to the orchestrator gateway policy envelope + subprocess air-gap.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1158

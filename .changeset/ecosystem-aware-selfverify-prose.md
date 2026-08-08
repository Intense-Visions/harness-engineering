---
'@harness-engineering/orchestrator': patch
---

Local stage prompt now renders the detected ecosystem's self-verify commands (mirroring the enforced gate) instead of hardcoded pnpm --filter lines, and the surrounding self-verify prose is ecosystem-neutral (node-specific typecheck guidance is now explicitly scoped to TypeScript/Node packages). Non-node workspaces no longer get contradictory pnpm guidance.

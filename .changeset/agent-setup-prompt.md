---
'@harness-engineering/cli': patch
---

refactor(setup): extract shared SETUP_CLIENTS descriptor

Extract the per-client install matrix from `setup.ts`'s inline array into a
shared `packages/cli/src/setup/clients.ts` descriptor (with a `print-clients.ts`
tsx emitter), consumed by both `harness setup` and the new generated agent-setup
`prompt.md`. `runMcpSetup` is behavior-neutral — same five clients, same detect
dirs and config targets, same OpenCode cross-platform path handling. No
user-facing CLI behavior change.

---
'@harness-engineering/types': minor
'@harness-engineering/orchestrator': minor
---

Add an orchestrator gateway policy envelope + subprocess env air-gap.

Every agent subprocess dispatch now carries a `PolicyMetadata` envelope
(`approvalMode`, `sandboxMode`, `networkMode`, `dangerousFlags[]`, `agentFamily`,
`agentVersion`) that is stamped as a one-line-per-dispatch governance record into
`.harness/audit.log` (alongside the existing gateway auth records, discriminated
by `event: "agent_dispatch"`). The record logs the NAMES of any parent-env vars
withheld from the subprocess — never their values, never the prompt/payload.

The load-bearing control: the `claude` backend no longer spawns with
`env: process.env` (which leaked the orchestrator's ENTIRE environment — every
unrelated secret — into the agent subprocess). It now spawns with an
allowlisted environment (`buildSubprocessEnv`) that forwards well-known-safe
plumbing (PATH/HOME/SHELL/locale/TLS/proxy/temp), the harness runtime + session
vars (`HARNESS_*`), the agent CLI's own config (`CLAUDE_*`/`ANTHROPIC_*`), git
tooling (`GIT_*`/`GH_*`/`GITHUB_*`), and cloud model-provider credentials
(prefix-matched providers plus any `*_API_KEY`), while dropping arbitrary
unrelated secrets. The allowlist is extensible per-call and via the
`HARNESS_SUBPROCESS_ENV_ALLOW` escape hatch, with a
`HARNESS_SUBPROCESS_ENV_UNSAFE_PASSTHROUGH` kill-switch for advisory-only mode.

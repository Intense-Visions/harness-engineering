---
'@harness-engineering/orchestrator': patch
---

Port the subprocess-env air-gap to the Codex backend. `CodexBackend` previously spawned `codex exec` with `env: process.env`, leaking every host secret the orchestrator held into the subprocess. It now builds an allowlisted env via `buildSubprocessEnv` (mirroring the Claude backend) and stamps the resolved policy envelope plus the names of withheld env vars into the optional governance audit sink.

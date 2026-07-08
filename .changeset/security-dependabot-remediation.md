---
'@harness-engineering/cli': patch
'@harness-engineering/dashboard': patch
'@harness-engineering/orchestrator': patch
---

security: remediate open Dependabot advisories

- dashboard: bump `react-router` to `^7.15.1` (fixes HIGH RCE via vendored turbo-stream and `__manifest` DoS) and `vite` to `^6.4.3`.
- orchestrator: bump `liquidjs` to `^10.26.0` (fixes CRITICAL RCE) and `@earendil-works/pi-coding-agent` to `^0.79.0` (fixes HIGH local privilege escalation).
- Root `pnpm.overrides` sweep the remaining transitive advisories (undici, hono, qs, shell-quote, tmp, js-yaml, brace-expansion, protobufjs, @babel/core, uuid, vite@6, @grpc/grpc-js); dev-only, vitepress-pinned residuals are recorded in `auditExceptions`.

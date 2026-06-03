---
'@harness-engineering/dashboard': patch
---

Upgrade `@hono/node-server` from `^1.19.13` to `^2.0.4`. v2 is a perf-only major (up to 2.3× throughput on body-parsing) with the same public API. The pnpm.overrides floor for `@hono/node-server` is also bumped to `>=2.0.4`. v2 drops Node 18 support (we already require Node ≥22) and removes the Vercel adapter (not used).

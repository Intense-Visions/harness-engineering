---
'@harness-engineering/dashboard': patch
---

Bump `hono` to `^4.13.16` and `@hono/node-server` to `^2.1.6` (lockfile resolves 4.13.18 / 2.1.8), clearing 7 `pnpm audit` advisories in the dashboard HTTP stack: GHSA-qv5m-9pm6-hqp3, GHSA-jpvv-r467-5p4w, GHSA-4m76-xfj5-7975, GHSA-h7mg-cq63-vhpq, GHSA-46wx-v44x-9hh2, GHSA-4h7h-rv7c-7m2v, GHSA-3gg2-335m-rxc6. The root `pnpm.overrides` security floors are raised to match.

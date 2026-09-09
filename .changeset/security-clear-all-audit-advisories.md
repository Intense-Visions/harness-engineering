---
'@harness-engineering/orchestrator': patch
---

security(deps): clear all eight active audit advisories so `Reconcile audit exceptions` passes

The `Reconcile audit exceptions` gate (issue #1324) was failing on `main` and on every open
PR with eight active advisories and no covering register entries. This resolves all of them
by upgrading, not by adding `auditExceptions` entries.

| Advisory            | CVE            | Severity | Package                    | Vulnerable        | Resolved to |
| ------------------- | -------------- | -------- | -------------------------- | ----------------- | ----------- |
| GHSA-4r6h-5v86-94p3 | CVE-2026-69222 | high     | `liquidjs`                 | `<=10.27.1`       | `10.27.2`   |
| GHSA-82fw-gwwq-j7x9 | CVE-2026-84373 | moderate | `vitest`, `@vitest/mocker` | `>=2.1.0 <4.1.11` | `4.1.11`    |
| GHSA-2883-xcg3-v3hh | CVE-2026-84375 | high     | `js-yaml` (3.x)            | `>=3.0.0 <3.15.2` | `3.15.2`    |
| GHSA-2883-xcg3-v3hh | CVE-2026-84375 | high     | `js-yaml` (4.x)            | `>=4.0.0 <4.3.2`  | `4.3.2`     |
| GHSA-gqvv-2mrq-wpjv | CVE-2026-84365 | moderate | `hono`                     | `<4.13.5`         | `4.13.7`    |
| GHSA-g6gw-c38x-mqfc | CVE-2026-84364 | moderate | `hono`                     | `<4.13.5`         | `4.13.7`    |
| GHSA-crvj-82cr-hjcx | CVE-2026-84363 | moderate | `hono`                     | `<4.13.5`         | `4.13.7`    |

`liquidjs` and `vitest` are lockfile-only re-resolutions inside ranges the manifests already
declare. `hono` and `js-yaml` move via the root `pnpm.overrides` floors (`hono` `>=4.12.34`
-> `>=4.13.5`; `js-yaml@3` `>=3.15.1` -> `>=3.15.2`; `js-yaml@4` `>=4.3.1` -> `>=4.3.2`).

**Repo-local scope.** No published manifest range changes: `@harness-engineering/dashboard`
still declares `"hono": "^4.12.18"` and `@harness-engineering/orchestrator` still declares
`"liquidjs": "^10.26.0"`. Downstream consumers' declared ranges are unchanged — they already
permit the patched versions, but this repo does not force them.

Refs #2087.

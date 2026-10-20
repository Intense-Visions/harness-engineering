---
'@harness-engineering/dashboard': patch
---

Raise the `vite` security floor to the patched `6.4.4` for GHSA-698v-4r3x-3vcv
(moderate, CVE-2026-112943): `launch-editor`'s `escapeCmdArgs()` omits `%`
escaping on Windows, so a `cmd.exe` argument can expand an environment variable
and execute a subcommand.

The installed version was **vulnerable, not merely permitted**. The advisory's
affected range for the 6.x line is `vite <= 6.4.3` and the lockfile resolved
exactly `6.4.3`. Root `pnpm.overrides` goes `">=6.4.3 <7"` → `">=6.4.4 <7"` and
the dashboard's declared devDependency range goes `^6.4.3` → `^6.4.4` so the two
agree; `pnpm-lock.yaml` resolution moves `6.4.3` → `6.4.4` with no `vite@6.4.3`
reference left.

Patch, not minor: a dependency floor move inside the existing 6.x line, no API
or behaviour change. `vite` is a devDependency used to build the dashboard
client and, via `vitest`, to run every package's tests.

**Read the per-range data, not the first `first_patched_version`.** The advisory
covers six `vite` ranges; the first entry in its `vulnerabilities[]` array is the
8.3.x branch with `first_patched_version: 8.3.3`, which reads as though this
needs a major bump from 6.x. The entry whose `vulnerable_version_range` actually
matches this repo (`<= 6.4.3`) gives `first_patched_version: 6.4.4`. Match the
range first, then read its patch version.

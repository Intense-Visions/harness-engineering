---
'@harness-engineering/core': patch
'@harness-engineering/dashboard': patch
---

Update the `tsx` dev dependency to 4.23.11

Raises the declared `tsx` floor to `^4.23.11` (same major) in the root,
`core`, and `dashboard` manifests. `tsx` 4.23.11 depends on `esbuild`
`~0.28.0` and resolves the patched `esbuild` 0.28.2, replacing the 0.27.7
copy it previously pulled.

This also corrects the root `auditExceptions` record for
`GHSA-g7r4-m6w7-qqqr`, whose stated precondition ("accepted pending a tsx
release on esbuild >=0.28.1") had been met upstream and was therefore stale.

The advisory is **not** cleared by this change and remains accepted. `tsup`
8.5.1 — the latest published `tsup` — declares `esbuild` `^0.27.0`, so a
vulnerable 0.27.7 copy still resolves via `tsup` and its `bundle-require`
dependency. It stays dev-only, Windows-only, and low severity; the real fix
is a `tsup` release on `esbuild` >=0.28.1.

Dev-tooling only — no published runtime dependency or API surface changes.

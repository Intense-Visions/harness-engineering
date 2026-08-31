# Plan: Clear all 17 Dependabot alerts

**Route:** chore (dependency hygiene) · **Item:** `dependabot-cleanup` · **Issue:** none

## Goal

Drive the repo's open Dependabot count to 0 by landing the dependency fixes in
one PR. All 17 alerts are non-shipping (prior `pnpm audit --prod` = 0 across prod
packages); this is noise-clearing + build-tooling hygiene, not an emergency.

## The 17 alerts, two buckets

### Bucket 1 — `examples/slack-echo-bridge` (12 alerts, npm `package-lock.json`)

Private, never-published (`private: true`, v0.0.0), own npm lockfile outside the
pnpm workspace.

| Package | Vulnerable (locked) | Fixed  | Advisories                                             |
| ------- | ------------------- | ------ | ------------------------------------------------------ |
| axios   | 1.16.1              | 1.20.0 | GHSA-gcfj-64vw-6mp9 (high) + 9 moderate                |
| postcss | 8.5.16              | 8.5.26 | GHSA-r28c-9q8g-f849 (high) + GHSA-fxqj-rqcc-2cmp (mod) |

Fix: add npm `overrides` (`axios >=1.18.0`, `postcss >=8.5.23`) to the example's
package.json and regenerate its package-lock.json (`npm install --package-lock-only`).

### Bucket 2 — workspace `pnpm-lock.yaml` (5 alerts, dev/transitive)

| Package | Copy / source                         | Vulnerable      | Fixed                | Advisories                                         |
| ------- | ------------------------------------- | --------------- | -------------------- | -------------------------------------------------- |
| vite    | vitepress 1.6.4 -> 5.4.21             | `<= 6.4.2`      | 6.4.3                | GHSA-fx2h (high), GHSA-v6wh (mod), GHSA-4w7w (mod) |
| esbuild | vitepress -> 0.21.5                   | `<= 0.24.2`     | 0.25.12 (via vite 6) | GHSA-67mh (mod)                                    |
| esbuild | tsup 8.5.1 / bundle-require -> 0.27.7 | `0.27.3–0.28.0` | 0.28.2               | GHSA-g7r4 (low)                                    |

Fix via root `pnpm.overrides`:

- `vite: ">=6.4.3 <7"` (was `vite@6: ^6.4.3`) — forces vitepress off vite 5;
  side effect: vitepress's esbuild moves 0.21.5 -> 0.25.12, clearing GHSA-67mh.
- `esbuild@0.27: ">=0.28.1"` — scoped to the tsup/bundle-require copy only, so it
  does not disturb vite 6's own esbuild (0.25.12). A _global_ esbuild >=0.28.1
  override was rejected: it breaks the vitepress docs build.

## Overrides location — NOT migrated to pnpm-workspace.yaml

The task suggested migrating `pnpm.overrides` to `pnpm-workspace.yaml`. Empirically
rejected: CI runs genuine pnpm 8.15.4 (via `pnpm/action-setup@v5` + the
`packageManager` field) with `--frozen-lockfile`, and pnpm 8.15.4 does not read
`overrides` from pnpm-workspace.yaml. Moving them there dropped every pin from the
lockfile. Overrides stay in package.json — the only location CI's pnpm reads.

## Verification (all green)

- `pnpm audit` (full): No known vulnerabilities. `pnpm audit --prod`: clean.
- `cd examples/slack-echo-bridge && npm audit`: found 0 vulnerabilities.
- `pnpm install --frozen-lockfile` (pnpm 8.15.4, Node 22): passes.
- `pnpm build` 22/22 (incl. all tsup packages + dashboard on vite 6), `pnpm typecheck` 22/22.
- `pnpm docs:build` (vitepress on vite 6.4.3): build complete.
- `node scripts/audit-exceptions.mjs`: 0 active advisories, 0 register entries — OK.
- `node --test tests/scripts/audit-exceptions.test.mjs`: 12/12.

## Residual / stale cleanup

The 5 GHSAs previously in root `auditExceptions` are now genuinely fixed, so the
register entries are stale and were removed (keeping them would suppress a future
regression of the same advisories). No alert requires dismissal — all 17 are
lockfile-fixable and will auto-close on merge.

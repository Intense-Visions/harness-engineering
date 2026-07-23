# Supply Chain Audit: harness-engineering

**Date:** 2026-07-22
**Lockfile:** `pnpm-lock.yaml` (lockfileVersion 6.0, pnpm 8.15.4)
**Scope:** 14 workspace packages · 76 external direct deps (39 prod / 37 dev) · 1,152 total packages
**Iron Law:** findings below are **flags for human review, not verdicts**. A "high-risk" signal may be entirely appropriate for this project.

---

## Result

```
RESULT (before repair): 4 High, 5 Moderate, 2 Low CVEs (0 critical severity)
RESULT (after repair):  1 High, 3 Moderate, 1 Low — all remaining are documented auditExceptions
```

**3 HIGH-severity CVEs and 3 further advisories were un-triaged and are now fixed** via override bumps. The only vulnerabilities that remain after repair are the five that already carry a written `auditExceptions` justification (all esbuild/vite, dev-only and mostly Windows-only, no in-major patch available).

---

## Repair applied (in this worktree)

The root `pnpm.overrides` security-pin list had **drifted below current patched versions**. Four leaf/utility libraries were bumped, all within their current major (no breaking major jumps):

| Package                     | Was                                 | Now                      | Fixes                                | Severity    |
| --------------------------- | ----------------------------------- | ------------------------ | ------------------------------------ | ----------- |
| `fast-uri`                  | resolved 3.1.2 (override `>=3.1.2`) | 3.1.4 (`>=3.1.4 <4`)     | GHSA host-confusion ×2               | **HIGH**    |
| `brace-expansion` (v2 line) | resolved 2.0.3 (unmanaged)          | 2.1.2 (`@2: >=2.1.2 <3`) | GHSA DoS                             | **HIGH**    |
| `@hono/node-server`         | resolved 2.0.4 (override `>=2.0.4`) | 2.0.11 (`>=2.0.10`)      | serve-static path traversal + WS DoS | moderate ×2 |
| `body-parser`               | resolved 2.2.2 (unmanaged)          | 2.3.0 (`>=2.3.0`)        | limit-bypass DoS                     | low         |

Verified: `pnpm install --lockfile-only` resolved cleanly; `pnpm audit` re-run confirms the six advisories cleared and only documented exceptions remain. `prettier --check package.json` passes.

**Root cause worth noting:** the override list and the `fast-uri`/`@hono/node-server` pins were set once and not re-tightened as new advisories landed above the pinned floor. Open-ended `>=x` pins do **not** auto-track new patches here (pnpm resolved each to the floor version). Recommend periodically re-running this audit so pinned floors keep pace with advisories.

---

## Remaining advisories — all pre-accepted (`auditExceptions`)

| GHSA                | Pkg     | Sev     | Documented rationale                                                                                                                                             |
| ------------------- | ------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GHSA-fx2h-pf6j-xcff | vite    | HIGH    | `server.fs.deny` bypass — residual is vite 5.4.x pulled only by vitepress ^5 (no 5.x patch). Dev/docs-only, no `--host`. Real fix: upgrade vitepress off vite 5. |
| GHSA-v6wh-96g9-6wx3 | vite    | (H→mod) | launch-editor NTLM disclosure — same vitepress vite-5 residual. Dev/docs-only, Windows-only.                                                                     |
| GHSA-4w7w-66w2-5vf9 | vite    | mod     | `.map` path traversal — dev-only, no `--host`. Blocked by vitepress ^5 pin.                                                                                      |
| GHSA-67mh-4wv8-2f99 | esbuild | mod     | dev-server CORS — dev-only, no network exposure.                                                                                                                 |
| GHSA-g7r4-m6w7-qqqr | esbuild | low     | Windows dev-server file read — esbuild 0.27.x via tsx/tsup. Overriding inside tsx risks toolchain breakage; accepted pending tsx on esbuild ≥0.28.1.             |

**Flag for review:** the single most impactful next step to clear the last HIGH is **upgrading `vitepress` off the vite-5 line** (docs tooling). Left as a flag, not auto-applied — it's a docs-toolchain upgrade with its own compatibility surface.

---

## Factor-by-factor summary

### Factor 4 — Install scripts

- 2 **direct** deps carry install scripts: `better-sqlite3` (native SQLite bindings) and `@google/genai` (Google official SDK). Both legitimate — flag for awareness only.
- Transitive native builds: `protobufjs`, `tree-sitter*`, `cpu-features`, `ssh2`, `node-gyp-build`, plus 26 platform-specific `@esbuild/*` binaries (expected). None anomalous.
- _Method note:_ derived from the lockfile `requiresBuild` flag (a superset of install-script packages), not per-package `scripts` reads — worktree used `--lockfile-only`, so `node_modules` was not populated.

### Factor 6 — Transitive depth

- Max dependency depth **7**; 17 packages at depth > 5. Subtrees at that depth are small (< 20), so none reach the skill's "high" bar (depth > 5 **and** subtree > 20).
- Largest direct-dep subtrees (all mainstream dev tooling): `@earendil-works/pi-coding-agent` (215), `vitepress` (178), `testcontainers` (155), `vitest`/`@vitest/ui` (153). Depth 0, so Medium at most on this factor.

### Factors 1–3 — Maintainer / maintenance / popularity (flags only)

- **Caveat:** the npm `maintainers` field lists publishing accounts, not true contributor count. It reports "1 maintainer" for hugely-popular, well-governed packages (`chalk`, `glob`, `zod`, `@types/*`, `@hono/node-server`, `better-sqlite3`). These are **false-positive bus-factor signals** — do not act on them mechanically.
- Genuinely worth a glance (low-ish popularity **and** small maintainer set — still just flags): `tree-sitter-wasms`, `react-virtuoso`, `liquidjs`. All are deliberate, fit-for-purpose choices here.
- No package was unresolvable on the registry.

---

## Next steps (flags, not actions)

1. **Land this repair** (override bumps + lockfile) — clears 3 HIGH + 3 lesser advisories with in-major, leaf-library patches.
2. **Upgrade vitepress off vite 5** to clear the last remaining HIGH (currently an accepted dev/docs-only exception).
3. **Re-run this audit on a schedule** so `>=x` override floors keep pace with new advisories instead of silently sitting below them.

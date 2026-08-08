# Supply Chain Audit: harness-engineering

**Date:** 2026-08-08
**Lockfile:** `pnpm-lock.yaml` (lockfileVersion 6.0)
**Scope:** 14 workspace packages · 76 external direct deps · 1,157 total packages
**Iron Law:** findings below are **flags for human review, not verdicts**. A "high-risk" signal may be entirely appropriate for this project.

---

## Result

```
RESULT (before repair): 15 High, 13 Moderate, 2 Low CVEs (0 critical severity)
RESULT (after repair):   1 High,  3 Moderate, 1 Low — all remaining are documented auditExceptions
```

**25 of 30 advisories cleared** via override-floor bumps. The five that remain
are exactly the ones already carrying a written `auditExceptions` justification
(all esbuild/vite in the vitepress `^5` chain — dev/docs-only, no in-major patch
available). This is a direct recurrence of the [2026-07-22 audit](./supply-chain-audit-2026-07-22.md)
root cause: **open-ended `>=x` override floors do not auto-track new patches** —
pnpm resolves each to the floor version, so new advisories landing above the
pinned floor go un-mitigated until the floor is re-tightened.

---

## Repair applied

The root `pnpm.overrides` security-pin list had drifted below current patched
versions. All bumps stay within the current major (no breaking jumps):

| Package              | Was           | Now           | Fixes                                           | Severity     |
| -------------------- | ------------- | ------------- | ----------------------------------------------- | ------------ |
| `hono`               | `>=4.12.25`   | `>=4.12.34`   | CORS ReDoS, `memo()` SSR disclosure, lang DoS   | high/mod ×4  |
| `postcss`            | `>=8.5.10`    | `>=8.5.23`    | attacker-controlled `sourceMappingURL` reads    | high ×2, mod |
| `ip-address`         | `>=10.1.1`    | `>=10.3.1`    | SSRF / trust-boundary bypass                    | high, mod ×2 |
| `fast-uri`           | `>=3.1.4 <4`  | `>=3.1.5 <4`  | host confusion via backslash authority          | **high**     |
| `undici`             | `^7.28.0`     | `>=7.29.0`    | response desync, cache disclosure, CRLF, cookie | high, mod ×3 |
| `brace-expansion@2`  | `>=2.1.2 <3`  | `>=2.1.4 <3`  | unbounded-expansion DoS                         | **high**     |
| `brace-expansion@5`  | `^5.0.6`      | `>=5.0.9 <6`  | unbounded-expansion DoS ×2                      | **high**     |
| `js-yaml@3`          | `>=3.15.0 <4` | `>=3.15.1 <4` | quadratic CPU in `!!omap`                       | **high**     |
| `js-yaml@4`          | `>=4.2.0 <5`  | `>=4.3.1 <5`  | quadratic CPU in `!!omap`                       | **high**     |
| `nanoid` (new)       | —             | `>=3.3.17`    | infinite loop on negative/zero size             | **high** ×2  |
| `react-router` (new) | —             | `>=7.18.2 <8` | RSC-mode CSRF bypass                            | **high**     |

Also bumped the direct `react-router` dependency in `@harness-engineering/dashboard`
from `^7.15.1` to `^7.18.2` so the manifest is honest, not just the override.

> **Note on the `react-router` pin.** The floor was constrained to `<8`: an
> unbounded `>=7.18.2` resolved to `react-router@8.x`, which requires React 19
> and broke the React 18 dashboard. The `<8` ceiling keeps it on the 7.x line.

Verified: `pnpm install` resolved cleanly (only pre-existing vitepress→vite@5 and
tree-sitter peer warnings remain); `pnpm audit` re-run confirms 25 advisories
cleared and only documented exceptions remain.

---

## Remaining advisories — all pre-accepted (`auditExceptions`)

| GHSA                | Pkg     | Sev      | Documented rationale (see `package.json` `auditExceptions`)                     |
| ------------------- | ------- | -------- | ------------------------------------------------------------------------------- |
| GHSA-67mh-4wv8-2f99 | esbuild | moderate | dev-server CORS — dev-only, no network exposure; blocked by vitepress `^5` pin  |
| GHSA-4w7w-66w2-5vf9 | vite    | moderate | `.map` path traversal — dev-only, no `--host`; blocked by vitepress `^5` pin    |
| GHSA-fx2h-pf6j-xcff | vite    | **high** | `server.fs.deny` bypass — residual vite 5.4.x via vitepress `^5`; no 5.x patch  |
| GHSA-v6wh-96g9-6wx3 | vite    | moderate | launch-editor NTLM disclosure — Windows-only, dev/docs-only, same residual      |
| GHSA-g7r4-m6w7-qqqr | esbuild | low      | dev-server file read — esbuild 0.27.x via build tooling; Windows-only, dev-only |

The one remaining **HIGH** (`GHSA-fx2h`, vite `server.fs.deny` bypass) has no fix
inside the vite 5.x major; the real remediation is upgrading `vitepress` off
vite 5. It is dev/docs-only with no `--host` usage. Tracked as an accepted
exception, not an open action item.

---

## Six-factor signal notes

- **Install scripts (Factor 4):** native-addon builds only — `better-sqlite3`,
  `cpu-features`, `ssh2`, `tree-sitter*`, `esbuild`, `protobufjs` (postinstall),
  plus `canary-test-cli` (postinstall). pnpm's `onlyBuiltDependencies` allowlist
  is empty, so **build scripts are blocked by default** (`.modules.yaml` shows
  esbuild platform builds as `skipped`) — a strong default posture. No unexpected
  install hooks found.
- **Maintainer concentration / popularity (Factors 1 & 3):** the direct set is
  dominated by high-adoption, multi-maintainer packages (React, vite, eslint,
  vitest, typescript, hono, zod). No sole-maintainer + abandoned combination
  surfaced among direct deps.
- **Known CVEs (Factor 5):** the actionable factor this cycle — covered above.
- **Transitive risk (Factor 6):** deepest un-mitigated risk was the
  `pi-coding-agent → @google/genai → @modelcontextprotocol/sdk` chain
  (undici / ip-address / fast-uri / hono), all now pinned via overrides.

---

## Recommendation

Re-run this audit on a schedule (or wire it into the milestone gate) so pinned
override floors keep pace with new advisories. The recurrence of the exact
2026-07-22 pattern confirms open-ended `>=x` floors silently go stale.

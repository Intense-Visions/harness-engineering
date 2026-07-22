---
'@harness-engineering/orchestrator': patch
'@harness-engineering/dashboard': patch
---

Refresh stale `pnpm.overrides` security pins to clear 3 un-triaged HIGH CVEs surfaced by a supply-chain audit.

Several override floors had drifted below current patched versions, so `pnpm audit` still reported vulnerable resolved versions despite the pins being present. Bumped, all within the current major (no breaking upgrades):

- `fast-uri` `>=3.1.2` → `>=3.1.4 <4` — clears host-confusion via backslash authority delimiter + failed IDN canonicalization (2 × HIGH; resolved 3.1.2 → 3.1.4)
- `brace-expansion@2` (previously unmanaged) → `>=2.1.2 <3` — clears DoS via exponential-time expansion (HIGH; resolved 2.0.3 → 2.1.2)
- `@hono/node-server` `>=2.0.4` → `>=2.0.10` — clears serve-static path traversal + unauthenticated WebSocket-handshake memory-leak DoS (2 × moderate; resolved 2.0.4 → 2.0.11)
- `body-parser` (previously unmanaged) → `>=2.3.0` — clears limit-bypass DoS (low; resolved 2.2.2 → 2.3.0)

Audit summary: 11 advisories (4 high, 5 moderate, 2 low) → 5 advisories (1 high, 3 moderate, 1 low). Every remaining advisory maps to an existing documented `auditExceptions` entry (all esbuild/vite, dev-only and mostly Windows-only, no in-major patch available). The last remaining HIGH (vite `server.fs.deny`, residual vite-5 via vitepress) is left as an accepted exception; the real fix is upgrading vitepress off vite 5, tracked separately.

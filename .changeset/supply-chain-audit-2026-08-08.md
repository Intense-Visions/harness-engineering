---
'@harness-engineering/cli': patch
'@harness-engineering/dashboard': patch
'@harness-engineering/orchestrator': patch
---

Supply-chain audit: re-tighten drifted security override floors

The root `pnpm.overrides` security pins had drifted below their currently
patched versions again (open-ended `>=x` floors resolve to the floor, not the
latest patch). Bumped the floors and added two new pins, clearing 25 of 30
`pnpm audit` advisories — all within the current major, no breaking jumps:

- `hono` `>=4.12.25` → `>=4.12.34` (ReDoS, SSR cross-user disclosure, DoS)
- `postcss` `>=8.5.10` → `>=8.5.23` (arbitrary `.map` file read ×3)
- `ip-address` `>=10.1.1` → `>=10.3.1` (SSRF / trust-boundary bypass ×3)
- `fast-uri` `>=3.1.4` → `>=3.1.5` (host confusion)
- `undici` `^7.28.0` → `>=7.29.0` (response desync, cache disclosure, CRLF ×4)
- `brace-expansion@2` `>=2.1.2` → `>=2.1.4`; `brace-expansion@5` `^5.0.6` → `>=5.0.9` (DoS)
- `js-yaml@3` `>=3.15.0` → `>=3.15.1`; `js-yaml@4` `>=4.2.0` → `>=4.3.1` (quadratic CPU)
- new: `nanoid` `>=3.3.17` (infinite loop), `react-router` `>=7.18.2 <8` (RSC CSRF bypass)

Also bumped the direct `react-router` dep in `@harness-engineering/dashboard`
to `^7.18.2`. The 5 remaining advisories are all the pre-accepted
`auditExceptions` (esbuild/vite in the vitepress ^5 chain, dev/docs-only).

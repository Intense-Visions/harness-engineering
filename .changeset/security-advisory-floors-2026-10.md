---
'@harness-engineering/cli': patch
'@harness-engineering/linter-gen': patch
'@harness-engineering/orchestrator': patch
---

Clear the 34 active dependency advisories that had been failing the blocking
`Reconcile audit exceptions` check on every PR since 2026-10-05, and cover the two
that have no upstream patch with a time-boxed register.

`pnpm audit` goes from **34 active advisory entries (31 distinct GHSA ids) to 2** — all four
criticals and ten of eleven highs clear.

Twelve `pnpm.overrides` floors raised or added: `@grpc/grpc-js` (^1.14.5), `ip-address`
(>=10.7.1), `fast-uri` (>=3.1.8 <4), `undici` (^7.29.1), `shell-quote` (^1.11.0),
`brace-expansion@2` (>=2.1.7 <3), `brace-expansion@5` (>=5.0.12 <6), plus new floors for
`proxy-addr` (>=2.0.8), `source-map-js` (>=1.2.2), `postcss-selector-parser` (>=7.1.6) and
`@vue/server-renderer` + `vue` (both >=3.5.42, floored together so the runtime and its
server-renderer cannot skew). Two direct dependency ranges move with them: `handlebars`
^4.7.9 → ^4.7.10 (`cli`, `linter-gen`) and `@modelcontextprotocol/sdk` ^1.29.0 → ^1.31.0
(`cli`, `orchestrator`).

Note on the mechanism, because it is not what it looks like: **every one of the seven existing
floors already permitted its patched version.** They sat below it because these are transitives
declared in no workspace manifest, so `pnpm update` has no dependency spec to advance and only an
edit to the override _string_ moves them. Filed separately as the reason this recurs.

Two advisories cannot be cleared at all — `braces` (GHSA-vfj7-8cjw-p6xm) and `sprintf-js`
(GHSA-hp3w-g68c-fv3c) both report `patched_versions: "<0.0.0"`, so no patched release exists.
They are covered by a deliberately narrow two-entry `auditExceptions` register with a
per-advisory justification and a dated `expires`, not by a blanket exemption.

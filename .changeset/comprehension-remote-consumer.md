---
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
'@harness-engineering/orchestrator': minor
---

Read comprehension from a remote hosted vault (harness-comprehension-serve consumer)

`get_comprehension`, `gather_context`, and the orchestrator leaf pre-warm can now serve a
module's compiled unit from a hosted vault (e.g. pnyon) instead of always recompiling locally:

- **core**: `createHttpComprehensionReadIO` — a read-only `ComprehensionIO` that fetches a
  module's `_module.md` over HTTP (identity-bound bearer serve token, injected `fetch`;
  404 → ENOENT-shaped so the gate treats it as absent) with a batch `listUnitPaths` that primes
  a read cache. The env-driven opt-in `resolveRemoteComprehension` now lives in core too
  (`HARNESS_COMPREHENSION_STORAGE=remote` + `_REMOTE_URL` + `_OUTPOST` +
  `PNYON_COMPREHENSION_SERVE_TOKEN`, never the committed `harness.config.json`) so the cli and the
  orchestrator resolve it identically. Both exported from the comprehension barrel.
- **cli**: `get_comprehension` and `gather_context` are remote-first serves — with no local
  source they trust the vault (Mode B, opt-in `HARNESS_COMPREHENSION_TRUST_REMOTE`); with local
  source they validate the remote unit against the working tree (Mode A) and fall through to a
  LOCAL recompile on a mismatch or a remote miss/error. `config.ts` now re-exports the resolver
  from core. The local store remains the sole writer.
- **orchestrator**: the leaf pre-warm reads through the hosted Outpost when remote is configured
  (bypassing the local `.harness/comprehension` early-out), so a consumer with no local tree still
  gets pre-warm from pnyon under `trustRemote`; unconfigured behavior is byte-identical to before.

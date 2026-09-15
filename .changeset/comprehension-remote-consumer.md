---
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
---

Read comprehension from a remote hosted vault (harness-comprehension-serve consumer)

`get_comprehension` can now serve a module's compiled unit from a hosted vault (e.g. pnyon)
instead of always recompiling locally:

- **core**: `createHttpComprehensionReadIO` — a read-only `ComprehensionIO` that fetches a
  module's `_module.md` over HTTP (identity-bound bearer serve token, injected `fetch`;
  404 → ENOENT-shaped so the gate treats it as absent). Exported from the comprehension barrel.
- **cli**: an ENV-driven opt-in (`resolveRemoteComprehension` — `HARNESS_COMPREHENSION_STORAGE=remote`
  - `_REMOTE_URL` + `_OUTPOST` + `PNYON_COMPREHENSION_SERVE_TOKEN`, never the committed
    `harness.config.json`), wired into `get_comprehension` as a remote-first serve: with no local
    source it trusts the vault (Mode B, opt-in `HARNESS_COMPREHENSION_TRUST_REMOTE`), with local
    source it validates the remote unit against the working tree (Mode A) and falls through to a
    LOCAL recompile on a mismatch or a remote miss/error. The local store remains the sole writer.

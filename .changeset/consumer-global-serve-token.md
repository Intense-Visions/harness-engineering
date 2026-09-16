---
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
'@harness-engineering/orchestrator': minor
---

Remote comprehension consumer reads the `pnyon login` serve token from `~/.pnyon/credentials.json`

After `pnyon login` writes an identity-bound serve token to the global `~/.pnyon/credentials.json`
(under the published `comprehension-serve-token` key), the harness comprehension consumer now reads
it automatically — so a hosted-vault read no longer needs a per-repo `.env.local` /
`PNYON_COMPREHENSION_SERVE_TOKEN` env var. Serve-token precedence is: env
`PNYON_COMPREHENSION_SERVE_TOKEN` (explicit override) → global `~/.pnyon/credentials.json`.

- **core**: new `readPnyonServeToken` (fail-SAFE — a missing/malformed/unreadable credentials file
  returns `undefined` so the consumer degrades to local comprehension, never throws) and a new
  impure `resolveRemoteComprehensionWithGlobalToken(env, file?, deps?)` wrapper that injects the
  global token into a COPIED env before delegating to the still-pure `resolveRemoteComprehension`,
  threading the committed `comprehension.remote` block through unchanged. Both exported from the
  comprehension barrel; the pure resolver is unchanged (cli + orchestrator resolve identically).
- **cli**: `get_comprehension` and `gather_context` resolve the serve token via the new wrapper
  (the committed `comprehension.remote` file block is still passed through).
- **orchestrator**: the dispatch leaf pre-warm resolves the serve token via the new wrapper.

The non-secret routing (`comprehension.remote` enable/url/outpost/trust) still merges committed
config with env (env wins); only the serve token gains the global-credential fallback. No token ⇒
falls back to LOCAL, so CI + tokenless teammates are unaffected.

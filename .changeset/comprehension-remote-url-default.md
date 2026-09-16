---
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
---

Default the remote-comprehension URL to pnyon (`https://core.pnyon.com`)

`HARNESS_COMPREHENSION_REMOTE_URL` is now OPTIONAL — it defaults to `DEFAULT_REMOTE_URL`
(`https://core.pnyon.com`, exported from core), so adopting the hosted comprehension read path no
longer requires anyone to know or paste the URL:

- **read path** (`resolveRemoteComprehension`): a minimal opt-in is now
  `HARNESS_COMPREHENSION_STORAGE=remote` + `HARNESS_COMPREHENSION_OUTPOST` + a serve token; the URL
  defaults. An explicit `HARNESS_COMPREHENSION_REMOTE_URL` still wins (point it at another host).
- **discovery** (`harness public-outposts`): now needs only `PNYON_COMPREHENSION_SERVE_TOKEN`; the
  URL defaults.

The `STORAGE=remote` switch stays an explicit opt-in (it is the safety gate that keeps teammates
and CI on local comprehension unless they deliberately turn it on), and `TRUST_REMOTE` stays
default-off.

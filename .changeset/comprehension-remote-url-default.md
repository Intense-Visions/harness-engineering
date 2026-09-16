---
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
'@harness-engineering/orchestrator': minor
---

Team-friendly hosted-comprehension config: committed `comprehension.remote` block + default URL

Adopting the hosted-comprehension read path is now a committed, team-shared config instead of
per-developer env plumbing — while the secret stays out of git:

- **Committed, non-secret routing** — a new `comprehension.remote` block in `harness.config.json`
  (`{ enabled, url?, outpost, trustRemote? }`) supplies the routing for the whole team. The env
  (`HARNESS_COMPREHENSION_*`) overrides each field per developer/machine. The serve token is the one
  exception: it is read ONLY from `PNYON_COMPREHENSION_SERVE_TOKEN` (env) and is never a config
  field, so no secret is committed. No token ⇒ falls back to LOCAL, so CI + tokenless teammates are
  unaffected even when `enabled` is committed.
- **Default URL** — `HARNESS_COMPREHENSION_REMOTE_URL` (and the committed `url`) are optional; both
  default to `DEFAULT_REMOTE_URL` (`https://core.pnyon.com`, exported from core). The URL is the one
  value nobody can guess.
- `resolveRemoteComprehension(env, file?)` now merges the committed block with the env; `get_comprehension`,
  `gather_context`, and the orchestrator leaf pre-warm all pass the committed block. `harness
public-outposts` needs only a serve token.

`STORAGE=remote` stays an explicit opt-in (env `HARNESS_COMPREHENSION_STORAGE`, or committed
`remote.enabled`), and `TRUST_REMOTE` stays default-off.

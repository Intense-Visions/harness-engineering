---
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
---

Discover public pnyon Outposts (`harness public-outposts`)

A contributor who wants to read a project's hosted comprehension needs its Outpost id for
`HARNESS_COMPREHENSION_OUTPOST`, but had no way to find it. This adds discovery:

- **core**: `fetchPublicOutposts({ baseUrl, token })` — GETs the pnyon public directory
  (`GET /public-outposts`) and returns the public Outposts (id + name + knowledge count, metadata
  only). Injected `fetch`; status/kind-only errors (never the token).
- **cli**: `harness public-outposts` — lists them (table, or `--json`), reading
  `HARNESS_COMPREHENSION_REMOTE_URL` + `PNYON_COMPREHENSION_SERVE_TOKEN` from the environment. It
  deliberately does NOT require `HARNESS_COMPREHENSION_OUTPOST` (that's what you're discovering);
  copy an id from the output into it to read that Outpost.

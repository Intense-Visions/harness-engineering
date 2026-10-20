---
---

Release-pipeline hardening only (#2289): `scripts/release-publish.mjs`, the
`release` script, a `release.yml` comment and the pre-push tag-only skip. No
publishable package's source or manifest changes, so nothing should be bumped —
this empty marker records that deliberately.

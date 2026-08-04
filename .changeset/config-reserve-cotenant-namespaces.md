---
'@harness-engineering/cli': patch
---

fix(config): reserve co-tenant namespaces so harness.config.json stops warning on shared keys

`harness.config.json` is in practice a **shared file**: sibling tools read their
own top-level namespace out of it (e.g. Canary reads `canary` directly). Since
the stripped-key warning landed (#862), harness warned on that live, load-bearing
block — `⚠ harness.config.json: ignored unknown key 'canary'`. The warning is
correct from harness's point of view and **actively harmful in effect**: the
obvious way to silence it is to delete the key, which silently resets the
co-tenant's gate configuration (#982).

The dropped-key detector now recognizes reserved co-tenant namespaces at the
**root** and never reports them: an explicit allow-list (`canary`) plus the
`x-*` extension convention for tools harness has not been told about. The
reservation is root-only and narrow — a genuinely-unknown root key
(`frobnicate`) is still reported, and a `canary` key **mis-nested** under a known
section (`entropy.canary`) is still caught, since only the root is co-tenant
space.

Addresses ask (1) of #982. Asks (2) pin the publisher's own smoke test and (3)
the release-cadence / `stable` dist-tag / config-migration policy are distribution
decisions left to the maintainers.

---
'@harness-engineering/cli': patch
---

Honour `design.tokenPath` in the drift token resolvers (#1855)

`design.tokenPath` was declared and type-validated by the config schema but
never read — both token resolvers hardcoded `design-system/tokens.json`. An
adopter whose tokens lived elsewhere got no error and watched the DRIFT-T001 /
T002 / T003 token-bypass rules skip silently, which reads identically to "no
drift found".

`loadTokenSet` and `loadTokenPathIndex` now resolve the configured
`design.tokenPath` relative to the project root (an absolute value is used
as-is), falling back to `design-system/tokens.json` only when the key is unset.
A blank or whitespace-only value is treated as unset.

Missing-file behaviour is unchanged: a configured path that does not exist still
yields `null`.

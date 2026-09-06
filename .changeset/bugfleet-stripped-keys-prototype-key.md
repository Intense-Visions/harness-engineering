---
'@harness-engineering/cli': patch
---

Use an own-property lookup when walking the config schema for unknown-key detection. A config key colliding with an `Object.prototype` member (`__proto__`, `constructor`, `toString`, ...) resolved to the inherited value, so the walk recursed into a non-zod object and threw; the throw is swallowed upstream, silently discarding the unknown-key warnings for the entire config file.

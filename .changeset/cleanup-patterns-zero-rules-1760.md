---
'@harness-engineering/cli': patch
---

fix(cleanup): stop `harness cleanup -t patterns` from reporting a false pass over zero rules (#1760)

`runCleanup` hardcoded the pattern analyzer to an empty rule set (`{ patterns: [] }`), so `harness cleanup -t patterns` evaluated zero rules yet still printed `Entropy issues: 0` and exited 0 — indistinguishable from a real pattern check that found nothing. The command now reads pattern rules from a new `entropy.patterns` config block and fails loudly when the patterns check is requested with no rules configured, instead of green-ticking an empty check.

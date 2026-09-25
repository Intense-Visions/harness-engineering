---
'@harness-engineering/stats': minor
---

`stats.sprt` is live: `createSprt(config)` runs a Bernoulli sequential probability ratio test against Wald's bounds (`reject` favors h1, `accept` favors h0, `continue` otherwise) with a sticky terminal verdict and optional `maxN` resolution to the currently favored hypothesis; `waldBounds`, `validateSprtConfig`, and the typed `InvalidSprtConfigError` complete the surface.

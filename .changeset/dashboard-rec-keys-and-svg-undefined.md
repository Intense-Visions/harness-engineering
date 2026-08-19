---
'@harness-engineering/dashboard': patch
---

Fix two client rendering defects on the Local Models page.

- `RecommendationsCard` keyed recommendation rows by `hfRepoId` alone, which collides when the same repo is recommended at multiple quants (Q4/Q5/Q6/Q8) — React logged "two children with the same key". Rows are now keyed by `hfRepoId@quant`.
- `NeuralOrganism` (the animated background) rendered `motion.circle`/`motion.path` elements that animate `cx`/`cy`/`r`/`d` without an `initial` prop, so framer-motion wrote `undefined` to those SVG attributes for one frame (`Invalid value for <circle> attribute r="undefined"`, `Problem parsing d="undefined"`). Each animated geometry attribute is now seeded in `initial` with its own first keyframe (no visual change).

---
'@harness-engineering/cli': patch
---

fix(design-pipeline): `--no-fill` no longer reports `pass` for a project with no design system. The verdict now reads design-system input presence (DESIGN.md, its Component Registry / Brand Rules sections, tokens.json) instead of whether FILL bootstrapped them, so a missing input is `warn` whether or not FILL ran, and `--no-fill` records a notice naming what is missing. (#1960)

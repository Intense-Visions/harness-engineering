---
'@harness-engineering/cli': patch
---

Add `harness check-operational-drift`: a diff-based check that flags changes to operational-policy surfaces (hook profiles, `.husky/**`, the pre-commit `--skip` list, and `harness.config.json` threshold fields) that lack a corresponding ADR under `docs/knowledge/decisions/`. Advisory by default; configurable to blocking via `operationalPolicy` config or `--strict`.

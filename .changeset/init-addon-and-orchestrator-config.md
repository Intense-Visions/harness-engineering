---
'@harness-engineering/cli': patch
---

fix(init): the `orchestrator` template now writes a `harness.config.json` (so validate passes), add-on templates (`ci-required-review`, `ci-pre-merge-brief`) layer onto an already-initialized project without `--force` and never overwrite a file, an add-on writes only its own files (no generic CI workflow or roadmap scaffold), and the printed next steps now match what was actually written (#2670).

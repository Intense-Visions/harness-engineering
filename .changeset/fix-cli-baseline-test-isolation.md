---
'@harness-engineering/cli': patch
---

Fix #911: check-arch resolves the working directory from the `-c` config's own
project instead of process.cwd(), so `harness check-arch -c <path> --update-baseline`
writes the baseline into that project — and the action-handler tests stop leaking
writes into this repo's tracked `packages/cli/.harness/arch/baselines.json`.

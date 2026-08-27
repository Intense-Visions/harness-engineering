---
'@harness-engineering/cli': patch
---

Ignore three generated `.harness/` runtime artifacts that were leaking into working trees, for this repo and for adopters: `craft/` (generated craft-run records), `spill/` (generated overflow/spill artifacts), and all `tokens.json*` variants (widened from `tokens.json` so siblings like `tokens.json.disabled` are ignored too). The adopter-facing generator (`packages/cli/src/templates/post-write.ts`) adds these to its canonical `.harness/.gitignore` set, so existing adopter installs get the new lines appended on the next `harness init` / `init_project` run.

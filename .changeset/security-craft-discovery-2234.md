---
'@harness-engineering/cli': patch
---

fix(security-craft): scan single-package repos, detect privileged calls through named imports, and report zero-file runs as an abstention (#2234)

- Discovery now falls back to `src/` and `app/` when there is no `packages/` directory. The source roots are shared with code-craft, which already had this fallback.
- Signal detection resolves import and require bindings, so `import { spawnSync } from 'node:child_process'` followed by bare `spawnSync(...)` is flagged. The same applies to multi-line named-import lists, renamed imports, aliased namespaces such as `import * as cp`, default imports, destructured `require`, and `node:fs/promises`.
- The summary adds `counts.candidateFiles`. It also adds `summary.abstention` when no file was examined, so a run that looked at nothing no longer reads as a clean scan. The in-session collect output carries the same fields.

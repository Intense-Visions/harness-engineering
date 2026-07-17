---
'@harness-engineering/core': patch
---

Tighten the review division-by-zero heuristic so it no longer flags
path-like slashes. The detector matched any `x/y`, so a scoped-package
import (`@harness-engineering/types`) read as a division — reddening the
floor-only (no-LLM) required-review tier on essentially every code PR.
It now skips `import`/`export` lines, comment/URL slashes, and requires a
real spaced division shape (`a / b`) with a variable/paren divisor — which
is how division always appears in a prettier-formatted codebase. Real
division is still detected; scoped imports and paths are not.

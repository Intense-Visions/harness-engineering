---
'@harness-engineering/cli': patch
---

fix(mcp): restore the context-surface helper exports that broke typecheck on main (#1820)

#1804's dead-export sweep removed `export` from `skillTreeEntries`, `agentsMdEntry` and `hooksEntry` — correct by its own measure, since nothing under `src/` imports them — but `context-surface.test.ts` does, and it landed from a different branch. Each change was green alone; together they left `main` failing `tsc --noEmit` with four errors, which also made the repo's own pre-push hook reject every push. The exports are restored with a comment recording why they exist, so the next sweep does not remove them again.

---
'@harness-engineering/core': patch
'@harness-engineering/types': patch
---

fix(roadmap): make the roadmap codec a text inverse (#2166). Backslashes in `Summary` / `Plan` / `Blockers` prose (a regex like `\d{3}` documented in a row) are no longer doubled on every write — only a backslash the decoder would misread is escaped — and an authored empty optional bullet such as `- **Priority:** —` or `- **External-ID:** —` now survives a parse → serialize round-trip instead of being dropped. Values the old encoder already doubled still decode correctly and are re-emitted un-doubled.

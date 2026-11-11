---
'@harness-engineering/core': patch
'@harness-engineering/cli': patch
'@harness-engineering/dashboard': patch
---

Fix a batch of small bugs. The roadmap parser now accepts files with Windows (CRLF) line endings, and a `## Milestone: Backlog` heading is treated as the backlog so it no longer flips after one save. The drift detector resolves root-absolute doc links such as `/packages/...` against the project root instead of the filesystem root. A tree-sitter grammar that fails to load is reported as `PARSER_UNAVAILABLE` rather than as a syntax error in the file. Two processes writing the same event-log blob at once no longer fail on Windows. `harness agent run` rejects an unknown `--trigger` and lists the valid ones instead of quietly running as `manual`, and `harness api-craft` rejects a non-numeric `--max-files` instead of reporting a clean run over zero files. The dashboard no longer crashes when an advise-skills result leaves out `reasons`.

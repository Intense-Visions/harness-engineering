---
'@harness-engineering/core': patch
'@harness-engineering/cli': patch
'@harness-engineering/orchestrator': patch
---

fix(scan-config): stop reading Markdown structure as injection or path traversal (#2052)

`harness scan-config` (and the orchestrator's pre-dispatch workspace scan) reported
Markdown table syntax as `INJ-SUS-001` / `INJ-SUS-002` (cell-edge padding and the
`| --- |` separator row) and fenced code samples as `INJ-SUS-*` / `SEC-PTH-001`.
On this repository's AGENTS.md that was 56 false `INJ-SUS-*` findings out of 89.
Findings in CLAUDE.md / AGENTS.md now go through `suppressMarkdownStructureFindings`
(new core export): those three rules are dropped on table separator rows, on cell-edge
padding, and inside fenced code blocks. Whitespace / delimiter runs inside a cell's
own text, and every other injection rule (in prose, table cells and fences), still fire.

---
'@harness-engineering/graph': patch
---

fix(graph): give the #940 extractor integration test a Windows-safe per-test timeout

The `binds extractor governs/documents edges to materialized code-scanner file
nodes (#940)` case is the only test in this suite that runs the full
`CodeIngestor.ingest` filesystem materialization on top of the extractor pass.
That IO is markedly slower on the `windows-latest` runner and intermittently
blew the suite's default 30s budget there (ubuntu and macOS finish the same
test well inside it), turning `main` red on Windows alone (#992).

The fix scopes a larger 120s budget to this one IO-heavy test rather than
raising the global `testTimeout` — a genuine hang in any other test still
surfaces at the default 30s deadline. The assertion the test makes
(path-based `file:${relativePath}` node IDs, the thing #940 fixed) is left
untouched, so Windows path handling stays covered rather than skipped.

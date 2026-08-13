---
'@harness-engineering/cli': patch
---

fix(scan-config): apply `fileGlob` so path-scoped rules stop matching the wrong files

`scan-config` called `SecurityScanner.scanContent`, which documents that it
evaluates every active rule "regardless of filePath". Path-scoped rules were
therefore matched against files their `fileGlob` excludes.

The visible cost was SEC-AGT-007 ("Shell metacharacters in hook commands"),
scoped to `**/settings*.json,**/hooks.json`, whose pattern ``/`[^`]+`/``
matches ordinary Markdown inline code. Measured on a real repository, the scan
reported **787** findings and exited 2; **758** of them were SEC-AGT-007 (378),
SEC-MCP-002 (377) and SEC-MCP-004 (3) firing on `CLAUDE.md` and `AGENTS.md`
prose such as ``If on `main`:``. After the fix the same repository reports 29
findings — the genuine `INJ-SUS-*` matches — and exits 0.

The scan now calls `scanFileContent`, which applies the same `fileGlob`
filtering as `scanFile` while reusing the content already read from disk.
`packages/orchestrator/src/workspace/config-scanner.ts` had already routed
around this for its copy of the workflow, naming SEC-AGT-007 and SEC-MCP-002 in
a comment; the CLI command was never brought across.

Rules whose `fileGlob` does match are unaffected — a regression test asserts
SEC-AGT-006 still fires on `CLAUDE.md`, so the fix narrows by path rather than
switching the security engine off.

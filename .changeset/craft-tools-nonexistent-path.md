---
'@harness-engineering/cli': patch
---

Craft MCP tools no longer report a clean critique when given a path that does not exist or a scope with nothing in it (#2625).

All eleven craft tools (`api_craft`, `cli_ergonomics_craft`, `code_craft`, `copy_craft`, `design_craft`, `docs_craft`, `knowledge_craft`, `naming_craft`, `security_craft`, `spec_craft`, `test_craft`) now go through one shared guard. A `path` that does not exist, or that is not a directory, returns `isError` with a message naming the path. Previously, inline runs returned `findings: []`, which looks exactly like a clean critique. In-session runs failed only because the run-state mkdir happened to fail, and when the parent directory was writable that mkdir created the missing directory.

When an existing scope yields zero candidates, the result now carries `abstention: { reason: 'no-candidate-files', message }`, the same shape security-craft added in #2234. It appears on the in-session collect output and on `summary` of the inline and finalize outputs, and it is absent on every run that examined something. For `design_craft`, it appears when no `files`, `benchmarkTargets` or `captures` were given.

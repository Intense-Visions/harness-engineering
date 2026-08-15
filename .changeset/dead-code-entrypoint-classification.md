---
'@harness-engineering/core': minor
---

fix(entropy): classify unreferenced build entry points instead of suggesting deletion

The dead-code detector treated every file unreachable from `entropy.entryPoints` as a
generic dead file (`reason: 'NO_IMPORTERS'`), so the suggestion fixer emitted a
high-priority `delete` recommendation and the auto-fix fixer emitted a `delete-file`
fix for build entry points — `*.config.ts`, `src/main.ts(x)`, `app.module.ts` — that
are reachable at build/runtime rather than through static imports. Deleting one breaks
the build; the correct remediation is to declare it in `entryPoints`.

`findDeadFiles` (and the graph-based path) now classify an unreachable file whose path
matches a build entry-point convention with the new `DeadFile` reason
`UNREFERENCED_ENTRY_POINT`. For those files the suggestion fixer emits a new,
non-destructive `Suggestion` type `configure-entrypoint` at `low` (info) priority —
"declare it in entryPoints" — and the auto-fix fixer never emits a `delete-file` fix.
Genuinely orphaned files still get the `delete` suggestion and `delete-file` fix.

Closes #1325.

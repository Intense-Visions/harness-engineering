---
schemaVersion: 1
module: 'packages/core/tests/fixtures/entropy/go-cmd/cmd/mytool'
sourceHash: 'a6dbd8a2fd69952b5111dac87760df79843fdf8850bec104c24b86c7c838835f'
compiledAt: '2026-08-28T01:22:10.858Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['main.go']
---

## Summary

This is a minimal test fixture for verifying Go command-line tool entry-point detection. The module follows the standard Go project layout—a `cmd/<name>/main.go` structure—where a command named `mytool` has an empty entrypoint. It's used by the entropy snapshot tests to verify that `resolveEntryPoints()` can correctly identify Go binary entry points in the conventional directory structure (rather than detecting `main.go` at project root).

## Invariants

- Directory structure: Entry point must be at `cmd/mytool/main.go` — this exact path is pattern-matched by the test regex (`cmd[\\]mytool[\\]main\.go$`)
- File existence: `main.go` must exist as a Go source file; the empty body satisfies the requirement (no semantic checking)
- Go module declaration: `go.mod` must declare the project as a valid Go module (enables recognition as a Go project over other language projects)
- No additional binaries: Only `mytool` is tested; adding other directories under `cmd/` would not break the test but changes fixture semantics

## Interface Contract

```ts

```

## Dependency Slice

```

```

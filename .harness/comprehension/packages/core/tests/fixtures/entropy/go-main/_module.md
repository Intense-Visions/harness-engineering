---
schemaVersion: 1
module: 'packages/core/tests/fixtures/entropy/go-main'
sourceHash: 'a6dbd8a2fd69952b5111dac87760df79843fdf8850bec104c24b86c7c838835f'
compiledAt: '2026-08-28T01:22:10.858Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['main.go']
---

## Summary

The `go-main` fixture is a minimal Go module used to test language-aware entry point resolution. It demonstrates the simplest Go binary layout: a single `main.go` file at the project root with a valid `go.mod` module declaration. The fixture validates that entropy detection correctly identifies Go entry points using the root-level convention, as opposed to the `cmd/<name>/main.go` multi-binary layout tested separately.

## Invariants

- Module path must be a valid Go module with `go.mod` defining `module example.com/demo` and Go version `1.22`
- `main.go` must exist at the project root with package `main` and a `func main()` declaration
- The `main()` function is intentionally empty — only structure matters, not implementation
- The `resolveEntryPoints()` function depends on this fixture to detect root-level `main.go` files and distinguish them from sub-directory patterns (`cmd/*/main.go`), so any restructuring or removal breaks the test at `snapshot.test.ts:86`

## Interface Contract

```ts

```

## Dependency Slice

```

```

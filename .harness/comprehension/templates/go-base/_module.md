---
schemaVersion: 1
module: "templates/go-base"
sourceHash: "479b155d495ee63bd60fa0efc57cc62f6d9a51e790bffc748cf2766a16cc0e05"
compiledAt: "2026-08-28T01:22:12.816Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["main.go"]
---

## Summary

`templates/go-base` is a minimal Go project template providing a bare-bones executable entry point. It contains only a `main.go` file with a single `main()` function that prints "Hello, world!" to stdout via the standard `fmt` package. This serves as a zero-ceremony scaffold for bootstrapping Go binaries—no dependencies, no configuration, no build tooling defined at this layer.

## Invariants

- Single entry point: Package `main` with a `main()` func is required; Go's linker will not produce an executable without it
- No external dependencies: Only stdlib (`fmt`) is imported; template remains dependency-free and buildable in any Go 1.x environment without `go mod` setup
- Stdout-only output: The template emits via `fmt.Println()` (unbuffered newline); callers should not assume stderr routing or structured logging
- No error handling: Template ignores I/O errors (e.g., write failures); callers using this as a base must add error handling for production use

## Interface Contract

```ts

```

## Dependency Slice

```

```

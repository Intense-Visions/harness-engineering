---
schemaVersion: 1
module: 'packages/core/tests/fixtures/entropy/rust-bin/src'
sourceHash: '125891a40bcb5ec81b2e54e24d94a8c111f3216be26371b1d19c2615d84aaea0'
compiledAt: '2026-08-28T01:22:10.860Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['cli.rs']
---

## Summary

Minimal Rust binary fixture for entropy testing. Defines a single executable target "mytool" (Cargo.toml) backed by a trivial cli.rs containing only an empty main() function. No dependencies or logic—a skeleton for testing comprehension/entropy detection of bare-bones Rust binaries.

## Invariants

- Cargo.toml declares a [[bin]] section; target name 'mytool' and path 'src/cli.rs' must match exactly
- main() function must exist and be the entry point; removal breaks compilation and violates fixture contract
- Zero external dependencies; any crate addition alters the dependency-graph surface measured by entropy tests
- Single source file (cli.rs); members list in \_module.md reflects exactly ['cli.rs']

## Interface Contract

```ts

```

## Dependency Slice

```

```

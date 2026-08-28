---
schemaVersion: 1
module: "templates/rust-base/src"
sourceHash: "2f052d9769730c65b893b68663d33352744ba88bdfaffe3c153733c096cd84fc"
compiledAt: "2026-08-28T01:22:12.858Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["main.rs"]
---

## Summary

The `templates/rust-base/src` module is a minimal Rust binary scaffold consisting of a single `main.rs` file. It contains a boilerplate `main()` function that prints "Hello, world!" to stdout, serving as a working entry point to validate that the Rust toolchain compiles and executes correctly. This is part of a larger templated project structure (using Handlebars for `Cargo.toml`, `AGENTS.md`, and `harness.config.json`) designed as a clean starting point for new Rust projects.

## Invariants

- main.rs must define a main() function as the binary entry point
- The program must compile without errors to validate toolchain setup
- The binary must execute successfully with exit code 0
- Content must remain minimal to serve as an uncluttered starting template
- File structure must align with Cargo.toml.hbs templating expectations

## Interface Contract

```ts

```

## Dependency Slice

```

```

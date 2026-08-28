---
schemaVersion: 1
module: 'packages/core/tests/fixtures/entropy/rust-convention/src'
sourceHash: 'ea74a7ffec29b8abf004c70743988d3f5068e71c02f44f7ea08d5ae9f60b4ca0'
compiledAt: '2026-08-28T01:22:10.860Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['main.rs']
---

## Summary

This is a minimal Rust module test fixture within the comprehension system's entropy validation suite. The `rust-convention/src` directory is compiled without semantic annotations (marked `absent`), serving as either a baseline or unanalyzed module test case. It declares `main.rs` as a member but no actual source files exist, making it a skeleton fixture designed to test fallback handling or empty-module edge cases.

## Invariants

- Semantic model must remain absent — fixture intentionally carries no LLM annotations for testing baseline behavior
- Compiler versions (static and semantic) must both be 1.0.0 to align with harness comprehension pipeline
- SourceHash ea74a7ffec29b8abf004c70743988d3f5068e71c02f44f7ea08d5ae9f60b4ca0 must not drift; regenerate if fixture content changes
- Fixture path must remain under packages/core/tests/fixtures/entropy/ to maintain test isolation
- Members list must continue to reference main.rs even though the file does not yet exist on disk
- Model field must remain null since no semantic analysis has been performed

## Interface Contract

```ts

```

## Dependency Slice

```

```

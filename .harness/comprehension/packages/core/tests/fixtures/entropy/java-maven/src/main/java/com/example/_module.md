---
schemaVersion: 1
module: 'packages/core/tests/fixtures/entropy/java-maven/src/main/java/com/example'
sourceHash: 'cde04c4f13ed77b0af8ef69ae00d9a1ce0c337a610ffe20bf3a2abfead80e2c4'
compiledAt: '2026-08-28T01:22:10.858Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['Main.java']
---

## Summary

This is a minimal Java Maven test fixture in the `com.example` package containing a single, empty `Main` class with an unused entry point. The fixture is stripped to essentials—likely used to test entropy detection, dead code identification, or codebase health analysis on Java/Maven projects without runtime behavior.

## Invariants

- Package name is `com.example` — test fixtures reference this standard namespace; renaming breaks fixture contracts
- Main class is public with a public static void main(String[] args) signature — standard JVM entry point; changes break compilation or fixture intent
- main() method body is empty (no-op) — fixture tests dead-code or unreachable-statement detection; adding logic invalidates the test scenario
- File path follows Maven convention (`src/main/java/com/example/Main.java`) — tooling and build systems assume this layout; deviations confuse the Maven compiler plugin

## Interface Contract

```ts

```

## Dependency Slice

```

```

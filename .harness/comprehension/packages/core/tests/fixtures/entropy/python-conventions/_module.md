---
schemaVersion: 1
module: 'packages/core/tests/fixtures/entropy/python-conventions'
sourceHash: 'cfc05c960c1e9c151439779c28b5b0748e754beaab3165694313c0b5d9c0b811'
compiledAt: '2026-08-28T01:22:10.860Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['main.py']
---

## Summary

This is a minimal Python fixture for testing convention recognition. It validates the standard Python entry-point pattern: a `main()` function with modern type hints (`-> None`) and the canonical `if __name__ == "__main__"` guard that defines script-vs-import behavior. The fixture lives in the "entropy" test suite, likely used to verify the codebase can parse and classify well-formed Python code—distinguishing conventional patterns from drift or anti-patterns.

## Invariants

- Entry point guard present — `if __name__ == "__main__":` must call `main()` (defines what runs on direct execution vs module import)
- Type annotation on main — `def main() -> None:` signals modern Python best practices and enables static analysis
- No return value — function returns `None` (matched by type hint), not an exit code or other value
- Minimal, deterministic behavior — `print("hello")` is a pure side-effect, no I/O or state dependencies (fixture-appropriate)

## Interface Contract

```ts

```

## Dependency Slice

```

```

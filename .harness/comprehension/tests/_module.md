---
schemaVersion: 1
module: "tests"
sourceHash: "39051e2cf736cd8c7c708625e5ccbca314edb4c891def78cc42b3de9a6ffc0e5"
compiledAt: "2026-08-28T01:22:12.864Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["platform-parity.test.ts"]
---

## Summary

The `tests` module is a root-level platform parity test suite that enforces cross-platform (Windows/Unix) compatibility at the structural level. It scans the repo for three anti-patterns: Unix commands in package.json scripts (rm, cp, mkdir, chmod), shell scripts missing cross-platform equivalents (.mjs/.ts/.js versions), and unguarded fs.chmodSync calls lacking platform guards. Code-level checks are delegated to ESLint rules running on every commit; this test suite complements those with structural/JSON-level validation via Vitest.

## Invariants

- EXCLUDE_DIRS and GLOB_EXCLUDE must stay in sync with actual project ignores (node_modules, dist, .turbo, .harness, etc.); drifts break scan scope and miss violations
- UNIX_SCRIPT_PATTERNS regex must cover all shell commands that fail on Windows; gaps silently pass broken scripts into the codebase
- Cross-platform equivalents are mandatory for all .sh files except husky hooks and docker-* scripts; missing equivalents block Windows CI
- chmodSync platform guards are non-negotiable within 5 lines of the call; missing guards cause EACCES crashes on Windows
- ESLint rules (@harness-engineering/no-hardcoded-path-separator, etc.) are the primary enforcement running on every commit; this test suite is a structural second-line check, not the source of truth

## Interface Contract

```ts

```

## Dependency Slice

```
import { existsSync, globSync, readFileSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
```

---
schemaVersion: 1
module: 'packages/core/src/security/rules/stack'
sourceHash: 'e2e9637423f36930d670c8577280fb13be95f58250f37b05818b54f7d79e5e34'
compiledAt: '2026-08-28T01:22:10.573Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['express.ts', 'go.ts', 'node.ts', 'react.ts']
---

## Summary

This module exports regex-based security rules organized by technology stack (Express, Go, Node, React). Each rule detects a specific vulnerability pattern, assigns severity/confidence, and provides CWE references and remediation steps. Detection is pattern-matching only — no AST analysis or semantic checking.

## Invariants

- Stack field must match the source module (expressRules[*].stack === ['express'], etc.)
- Pattern matching is the sole detection mechanism; all rules rely on regex with inherent low–medium confidence and false-positive risk
- Every rule must cite at least one CWE reference for audit/compliance tracking
- Remediation guidance must be specific and actionable, not vague ('add helmet()' not 'apply security')
- FileGlob (when present) must match the stack context; mismatches silently disable the rule
- No rule claims high confidence; patterns are advisory, not definitive
- No overlaps across stacks — each vulnerability signature defined once per stack with stack-specific patterns

## Interface Contract

```ts
export expressRules
export goRules
export nodeRules
export reactRules
```

## Dependency Slice

```
import { SecurityRule } from '../../types'
```

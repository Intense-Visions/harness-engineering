---
schemaVersion: 1
module: 'packages/cli/tests/fixtures/security-findings/src'
sourceHash: '1026a69f90fb8fc9da042d46ca6804d78550558383bb403d984dd7ff57498450'
compiledAt: '2026-08-28T01:22:09.712Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['insecure.ts']
---

## Summary

This is a deliberately-vulnerable test fixture for security scanner validation. It exports a `query()` function that takes unsanitized user input and injects it directly into SQL, and hardcodes an API key in plaintext at module scope. The file exists to let the harness verify that security checks catch both hardcoded secrets (CWE-798) and SQL injection (CWE-89) vulnerabilities.

## Invariants

- Hardcoded secret must remain on the module scope line — security scanners detect `sk_live_` prefix as a credential; must stay top-level and unescaped so pattern-matching tools catch it
- SQL injection query must use template literal with bare `userInput` — the query concatenates user input without parameterization; this is the canonical injectable SQL sink
- `query` export must remain — test code imports and verifies this function as a false-positive detector for baseline tuning
- File path `security-findings/src/insecure.ts` must stay — security checkers assume fixtures live under `security-findings/` and use filename heuristics to skip over expected violations

## Interface Contract

```ts
export query
```

## Dependency Slice

```

```

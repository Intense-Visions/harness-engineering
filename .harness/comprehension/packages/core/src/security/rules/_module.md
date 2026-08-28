---
schemaVersion: 1
module: 'packages/core/src/security/rules'
sourceHash: '279fc71eaa9895dd293fec72f821257c3c88b0f4998caa07379f0b333ce39d86'
compiledAt: '2026-08-28T01:22:10.591Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'agent-config.ts',
    'crypto.ts',
    'deserialization.ts',
    'injection.ts',
    'insecure-defaults.ts',
    'mcp.ts',
    'network.ts',
    'path-traversal.ts',
    'registry.ts',
    'secrets.ts',
    'sharp-edges.ts',
    'xss.ts',
  ]
---

## Summary

A static-analysis rule engine detecting common security vulnerabilities and misconfigurations across TypeScript/JavaScript codebases. Organized into 11 rule categories (agent-config, crypto, deserialization, injection, insecure-defaults, mcp, network, path-traversal, secrets, sharp-edges, xss) with regex pattern matching scoped by file-glob. Each rule includes severity (error/warning/info), confidence (high/medium/low), CWE references, and actionable remediation guidance. Exported as a RuleRegistry plus individual category exports (e.g., agentConfigRules, injectionRules) for tooling integration.

## Invariants

- Rule ID scheme is canonical: SEC-<CATEGORY>-<NUMBER> (e.g., SEC-INJ-004) — used for filtering, suppression, and audit traceability across CI/linting tooling
- Severity + Confidence matrix drives enforcement: severity (error/warning/info) sets CI gating tier; confidence (high/medium/low) signals false-positive rate — both inform decision to block or report
- Every rule links to OWASP CWE numbers — required for compliance audit and enabling external tooling to cross-reference vulnerability databases
- File-glob scoping is load-bearing: rules only apply to matching files (e.g., auth-only rules skip non-auth code) — prevents off-topic matches and false positives in unrelated domains
- Pattern matching is intentionally shallow (regex-only, no AST): some rules carry comments explaining why they match only interpolated/concatenated cases, not static calls (e.g., SEC-INJ-004 Prisma rule) — closing gaps in ORM injection prevention without bloating false positives
- Remediation is always concrete code-level guidance, not abstract policy — enables developers to fix violations without external research
- RuleRegistry export is the deterministic, unified entry point for all downstream tooling (CI linters, security gates, scan aggregators) — ensures consistent rule application across all check surfaces

## Interface Contract

```ts
export RuleRegistry
export agentConfigRules
export cryptoRules
export deserializationRules
export injectionRules
export insecureDefaultsRules
export mcpRules
export networkRules
export pathTraversalRules
export secretRules
export sharpEdgesRules
export xssRules
```

## Dependency Slice

```
import { SecurityCategory, SecurityRule } from '../types'
```

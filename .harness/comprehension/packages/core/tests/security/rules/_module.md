---
schemaVersion: 1
module: 'packages/core/tests/security/rules'
sourceHash: 'd20be8820e789616e1cb009dcac886d5631ab977a73a1da42a162e56b4bb32af'
compiledAt: '2026-08-28T01:22:11.096Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'agent-config.test.ts',
    'crypto.test.ts',
    'deserialization.test.ts',
    'express.test.ts',
    'go.test.ts',
    'injection.test.ts',
    'insecure-defaults.test.ts',
    'mcp.test.ts',
    'medium-confidence.test.ts',
    'network.test.ts',
    'node.test.ts',
    'path-traversal.test.ts',
    'react.test.ts',
    'registry.test.ts',
    'secrets-new.test.ts',
    'secrets.test.ts',
    'sharp-edges.test.ts',
    'stack-rules.test.ts',
    'xss-crypto.test.ts',
    'xss.test.ts',
  ]
---

## Summary

`packages/core/tests/security/rules` is a comprehensive test suite validating a modular security rule system. It tests **16 rule categories** (agent-config, crypto, deserialization, injection, insecure-defaults, MCP, network, path-traversal, secrets, sharp-edges, and 5 stack-specific variants: Express, Go, Node, React, XSS) through a registry-based architecture. Each rule is a pattern-matching engine with severity metadata (error/warning/info), confidence levels (high/medium/low), and CWE/OWASP references for traceability. Tests verify both true and false positives for each rule's regex patterns, ensuring minimal noise and accurate detection.

## Invariants

- ID format contract: Every rule must have a unique ID matching `SEC-{CATEGORY_PREFIX}-{NUMBER}` (e.g., SEC-AGT-001, SEC-CRY-001); ID prefix must align with its category.
- Category consistency: All rules within an imported rule set (e.g., `agentConfigRules`) must declare the same category field; the RuleRegistry depends on this for bucketing.
- Pattern validation invariant: Each rule must have a non-empty `patterns` array of compiled regexes; test suites verify both matching cases (true positives) and non-matching cases (true negatives) to prevent alert fatigue.
- Metadata completeness: Every rule requires `severity` (error|warning|info), `confidence` (high|medium|low), `references` array (CWE/OWASP IDs), and `fileGlob`; SecurityScanner relies on these for filtering and prioritization.
- Stack-specific rules must declare target stacks: Rules with stack variants (Express, Node, React, Go) must populate the `stack` array; this determines which stack context triggers the rule during scanning.
- CWE/OWASP traceability: Each rule must cite at least one CWE or OWASP reference; this is load-bearing for security audit trails and regulatory compliance reporting.
- Registry coherence: The RuleRegistry must load all 16 rule categories without gaps; adding a new category requires both the rules module and a test file with category validation.

## Interface Contract

```ts

```

## Dependency Slice

```
import { agentConfigRules } from '../../../src/security/rules/agent-config'
import { cryptoRules } from '../../../src/security/rules/crypto'
import { deserializationRules } from '../../../src/security/rules/deserialization'
import { injectionRules } from '../../../src/security/rules/injection'
import { insecureDefaultsRules } from '../../../src/security/rules/insecure-defaults'
import { mcpRules } from '../../../src/security/rules/mcp'
import { networkRules } from '../../../src/security/rules/network'
import { pathTraversalRules } from '../../../src/security/rules/path-traversal'
import { RuleRegistry } from '../../../src/security/rules/registry'
import { secretRules } from '../../../src/security/rules/secrets'
import { sharpEdgesRules } from '../../../src/security/rules/sharp-edges'
import { expressRules } from '../../../src/security/rules/stack/express'
import { goRules } from '../../../src/security/rules/stack/go'
import { nodeRules } from '../../../src/security/rules/stack/node'
import { reactRules } from '../../../src/security/rules/stack/react'
import { xssRules } from '../../../src/security/rules/xss'
import { SecurityScanner } from '../../../src/security/scanner'
import { SecurityRule } from '../../../src/security/types'
import { describe, expect, it } from 'vitest'
```

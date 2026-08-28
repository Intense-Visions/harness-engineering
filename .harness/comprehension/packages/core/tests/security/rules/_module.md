---
schemaVersion: 1
module: 'packages/core/tests/security/rules'
sourceHash: 'd20be8820e789616e1cb009dcac886d5631ab977a73a1da42a162e56b4bb32af'
compiledAt: '2026-08-28T01:22:11.096Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
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

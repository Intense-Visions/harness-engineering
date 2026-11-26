---
schemaVersion: 1
module: 'packages/core/tests/security/rules'
sourceHash: 'f514247f1103eb60b1fafe22ed839f21026cc9028ff1cee8bf01eff9aa59a5a7'
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

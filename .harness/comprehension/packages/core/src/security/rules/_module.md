---
schemaVersion: 1
module: 'packages/core/src/security/rules'
sourceHash: '2fcd08f8dac5226ced17b5bae5dc3a4f37e7e729ea0c8575e71cadff80c7a436'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
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

## Interface Contract

```ts
export RuleRegistry
export agentConfigRules
export cryptoRules
export deserializationRules
export injectionRules
export insecureDefaultsRules
export isJsonParseSchemaValidated
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

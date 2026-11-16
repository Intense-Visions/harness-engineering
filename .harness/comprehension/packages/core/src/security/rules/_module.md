---
schemaVersion: 1
module: 'packages/core/src/security/rules'
sourceHash: '62ae9785f3f481af90cb28cbbf5a9e93109cc985163f7dbd8457e498bf1ee48a'
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

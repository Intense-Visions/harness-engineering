---
schemaVersion: 1
module: 'packages/core/src/security/rules'
sourceHash: 'c117dbc8679e5aa85ab6a0084e65ca2365692d1bacc69de6e0247d63ba1ceb72'
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

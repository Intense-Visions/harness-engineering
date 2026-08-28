---
schemaVersion: 1
module: 'packages/core/src/security/rules'
sourceHash: '279fc71eaa9895dd293fec72f821257c3c88b0f4998caa07379f0b333ce39d86'
compiledAt: '2026-08-28T01:22:10.591Z'
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

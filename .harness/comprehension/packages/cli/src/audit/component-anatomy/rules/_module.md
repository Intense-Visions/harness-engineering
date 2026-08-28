---
schemaVersion: 1
module: 'packages/cli/src/audit/component-anatomy/rules'
sourceHash: 'af281d1455eec0df35fc55f9c3aca162131e28b80352137149b841528be9c265'
compiledAt: '2026-08-28T01:22:08.735Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  ['convention-rule.ts', 'convention-runner.test.ts', 'convention-runner.ts', 'pattern-rule.ts']
---

## Interface Contract

```ts
export runConventionRule
```

## Dependency Slice

```
import { AnatomyFindingCode, Severity } from '../findings/finding'
import { AnatomyFinding, AnatomyFindingCode, Severity } from '../findings/finding.js'
import { DesignStrictness, defaultSeverityForCode, resolveSeverity } from '../findings/severity.js'
import { ParsedComponent } from '../parsers/ast'
import { ParsedComponent } from '../parsers/ast.js'
import { AnatomyPart, ConventionRule } from './convention-rule'
import { ConventionRule, ConventionSource } from './convention-rule.js'
import { runConventionRule } from './convention-runner'
import { describe, expect, it } from 'vitest'
```

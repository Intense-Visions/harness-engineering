---
schemaVersion: 1
module: 'packages/core/tests/review/agents'
sourceHash: '6b115a014b5a49b354cf5549c0a429bc8593735bc089da6105773113a1f800a5'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'architecture-agent.test.ts',
    'bug-agent.test.ts',
    'compliance-agent.test.ts',
    'conditional-subagents.test.ts',
    'security-agent.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { runAdversarialAgent } from '../../../src/review/agents/adversarial-agent'
import { ARCHITECTURE_DESCRIPTOR, runArchitectureAgent } from '../../../src/review/agents/architecture-agent'
import { BUG_DETECTION_DESCRIPTOR, runBugDetectionAgent } from '../../../src/review/agents/bug-agent'
import { COMPLIANCE_DESCRIPTOR, runComplianceAgent } from '../../../src/review/agents/compliance-agent'
import { runFrontendRacesAgent } from '../../../src/review/agents/frontend-races-agent'
import { SECURITY_DESCRIPTOR, runSecurityAgent } from '../../../src/review/agents/security-agent'
import { runTypescriptStrictAgent } from '../../../src/review/agents/typescript-strict-agent'
import { enforceFindingIntegrity } from '../../../src/review/finding-integrity'
import { ContextBundle, ReviewFinding } from '../../../src/review/types'
import { describe, expect, it } from 'vitest'
```

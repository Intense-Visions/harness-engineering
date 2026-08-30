---
schemaVersion: 1
module: 'packages/core/src/review/agents'
sourceHash: 'aa81ed678f95be59e8cfac51653a9c2b6d35c6286bd672d7b6d7ff4317166fb1'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'adversarial-agent.ts',
    'architecture-agent.ts',
    'bug-agent.ts',
    'compliance-agent.ts',
    'frontend-races-agent.ts',
    'index.ts',
    'learnings-agent.ts',
    'security-agent.ts',
    'typescript-strict-agent.ts',
  ]
---

## Interface Contract

```ts
export ADVERSARIAL_DESCRIPTOR
export AGENT_DESCRIPTORS
export ARCHITECTURE_DESCRIPTOR
export BUG_DETECTION_DESCRIPTOR
export COMPLIANCE_DESCRIPTOR
export CONDITIONAL_SUBAGENT_DESCRIPTORS
export FRONTEND_RACES_DESCRIPTOR
export LEARNINGS_DESCRIPTOR
export SECURITY_DESCRIPTOR
export TYPESCRIPT_STRICT_DESCRIPTOR
export runAdversarialAgent
export runArchitectureAgent
export runBugDetectionAgent
export runComplianceAgent
export runFrontendRacesAgent
export runLearningsAgent
export runSecurityAgent
export runTypescriptStrictAgent
```

## Dependency Slice

```
import { isReferenceOnlySecretValue } from '../../security/secret-reference'
import { scoreRelevance } from '../../state/learnings-content'
import { makeFindingId } from '../constants'
import { ContextBundle, ReviewAgentDescriptor, ReviewConfidence, ReviewDomain, ReviewFinding, ReviewSubagent } from '../types'
import { ADVERSARIAL_DESCRIPTOR } from './adversarial-agent'
import { ARCHITECTURE_DESCRIPTOR } from './architecture-agent'
import { BUG_DETECTION_DESCRIPTOR } from './bug-agent'
import { COMPLIANCE_DESCRIPTOR } from './compliance-agent'
import { FRONTEND_RACES_DESCRIPTOR } from './frontend-races-agent'
import { LEARNINGS_DESCRIPTOR } from './learnings-agent'
import { SECURITY_DESCRIPTOR } from './security-agent'
import { TYPESCRIPT_STRICT_DESCRIPTOR } from './typescript-strict-agent'
```

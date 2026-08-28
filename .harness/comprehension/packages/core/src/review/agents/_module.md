---
schemaVersion: 1
module: 'packages/core/src/review/agents'
sourceHash: 'bc85129887729a61c41a9b0672d7aa4a005af9a8844be1ccee93e7d29b6e4b02'
compiledAt: '2026-08-28T01:22:10.482Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
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

## Summary

`packages/core/src/review/agents` is the pluggable review agent framework. It exports 8 domain-specific agents (Adversarial, Architecture, Bug Detection, Compliance, Frontend Races, Learnings, Security, TypeScript Strict), each as a descriptor + runner function pair. Agents scan changed files for anti-patterns using regex/heuristics or parse external context (e.g., check-deps output), then emit structured `ReviewFinding` objects keyed by file/line/category. Findings flow through dedup and synthesis logic downstream; the coordinator composes agents to handle different code dimensions in parallel, with optional depth-gating (e.g., cascade detection on Deep tier only).

## Invariants

- Finding IDs are deterministic and unique via makeFindingId(agentName, file, line, category) — collisions suppress duplicates; non-determinism breaks idempotency
- Each agent exports both *\_DESCRIPTOR and run*Agent() — descriptor declares domain/tier/UI; runner executes detection logic; mismatch breaks routing
- Findings must populate domain, severity, and validatedBy fields — review system keys on domain for filtering, severity gates PR comments, validatedBy signals confidence; omission breaks downstream synthesis
- Confidence scores affect severity mapping (agent-local contract) — e.g., adversarial maps ≥75 → 'important', <75 → 'suggestion'
- Architecture agent silently skips layer violations if harness-check-deps-output is absent from contextFiles — caller must inject check-deps result before dispatch
- File base-name normalization is required for circular-import detection — relative imports stripped of ./ and ../ prefixes, paths matched by base name; mismatch causes false negatives
- runCascades option gates Promise-constructor detection for depth-aware review — Standard-depth reviews must pass { runCascades: false } to skip expensive check; omission defaults to true (suitable for Deep/Max)
- Findings are immutable post-emission — agents return findings once; edits must happen in coordinator, not agent

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

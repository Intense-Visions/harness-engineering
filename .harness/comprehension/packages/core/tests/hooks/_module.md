---
schemaVersion: 1
module: 'packages/core/tests/hooks'
sourceHash: 'ac2e55422c647fb012367cd0bf07b96dfd2d14afdab95cbfc5d3b4ee5e8c05bc'
compiledAt: '2026-08-28T01:22:10.869Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['canary-review-hooks.test.ts', 'skill-lifecycle.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { CANARY_REVIEW_DETECTORS, CANARY_REVIEW_EVENTS, planCanaryReviewDetectors, resolveCanaryReviewHooks, resolveReviewHooksWithCanary } from '../../src/hooks/canary-review-hooks'
import { HookContext, buildHookBriefLines, buildHookEnv, buildHookStdinPayload } from '../../src/hooks/hook-context'
import { SKILL_HOOK_EVENT_KEY_RE, SkillHooksConfigHolder, defaultBlocking, resolveSkillHooks } from '../../src/hooks/skill-lifecycle'
import { describe, expect, it } from 'vitest'
```

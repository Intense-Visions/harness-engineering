---
schemaVersion: 1
module: 'packages/core/tests/hooks'
sourceHash: '007faa7cbe33fe929974f674509ffc9f53f2cc07b842d328ab74e099c0355295'
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

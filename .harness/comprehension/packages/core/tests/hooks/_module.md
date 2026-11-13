---
schemaVersion: 1
module: 'packages/core/tests/hooks'
sourceHash: '4114906c623e5629319328f6e666b2c0105fa3cb6026ac245abd47c236a73c53'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['canary-review-hooks.test.ts', 'craft-review-hooks.test.ts', 'skill-lifecycle.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { CANARY_REVIEW_DETECTORS, CANARY_REVIEW_EVENTS, planCanaryReviewDetectors, resolveCanaryReviewHooks, resolveReviewHooksWithCanary } from '../../src/hooks/canary-review-hooks'
import { CRAFT_ANY_LANGUAGE, CRAFT_DOMAINS_NOT_ACTIVATED_V1, CRAFT_REVIEW_DOMAINS, CRAFT_REVIEW_EVENTS_BY_HOST, CraftReviewPlan, DEFAULT_MAX_CRAFT_DOMAINS, planCraftReviewDomains, resolveReviewHooksWithCraft } from '../../src/hooks/craft-review-hooks'
import { HookContext, buildHookBriefLines, buildHookEnv, buildHookStdinPayload } from '../../src/hooks/hook-context'
import { SKILL_HOOK_EVENT_KEY_RE, SkillHookEntry, SkillHooksConfigHolder, defaultBlocking, resolveSkillHooks } from '../../src/hooks/skill-lifecycle'
import { describe, expect, it } from 'vitest'
```

---
schemaVersion: 1
module: 'packages/core/src/hooks'
sourceHash: 'd2646bb6111db3caf2bc79693ca614edd3638b0b0edef2dbb536c09856139d04'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['canary-review-hooks.ts', 'hook-context.ts', 'index.ts', 'skill-lifecycle.ts']
---

## Interface Contract

```ts
export CANARY_REVIEW_DETECTORS
export CANARY_REVIEW_EVENTS
export CANARY_REVIEW_HOST_SKILL
export CanaryReviewDetectorPlan
export HookContext
export NormalizedHook
export SKILL_HOOK_EVENT_KEY_RE
export SkillAvailability
export SkillHookEntry
export SkillHooksConfig
export SkillHooksConfigHolder
export SkillHooksForSkill
export buildHookBriefLines
export buildHookEnv
export buildHookStdinPayload
export defaultBlocking
export planCanaryReviewDetectors
export resolveCanaryReviewHooks
export resolveReviewHooksWithCanary
export resolveSkillHooks
```

## Dependency Slice

```
import { NormalizedHook, SkillHookEntry, SkillHooksConfigHolder, defaultBlocking, resolveSkillHooks } from './skill-lifecycle'
```

---
schemaVersion: 1
module: 'packages/core/src/hooks'
sourceHash: '5d55b595efc00116e669eefb844dcf7ef0944ef36e884a7031a3b2c705bfcc98'
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

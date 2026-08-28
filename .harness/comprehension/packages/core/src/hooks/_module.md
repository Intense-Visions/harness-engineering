---
schemaVersion: 1
module: 'packages/core/src/hooks'
sourceHash: '75869716f1f9c18e6c7a7661d6a605b512d51b0e16f1977672a814ff95cee98b'
compiledAt: '2026-08-28T01:22:10.407Z'
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

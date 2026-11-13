---
schemaVersion: 1
module: 'packages/core/src/hooks'
sourceHash: '4db7e26bc7ec7fefa13bfcc698b437cf8a478cb08df6d3d1c43e96b25cfa8f43'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'canary-review-hooks.ts',
    'craft-review-hooks.ts',
    'hook-context.ts',
    'index.ts',
    'skill-lifecycle.ts',
  ]
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
import { EXTENSION_MAP, SupportedLanguage, detectLanguage } from '../code-nav/types'
import { SkillAvailability } from './canary-review-hooks'
import { NormalizedHook, SkillHookEntry, SkillHooksConfigHolder, defaultBlocking, resolveSkillHooks } from './skill-lifecycle'
```

---
schemaVersion: 1
module: 'packages/core/src/hooks'
sourceHash: 'a9e3a183f8eb6c59fb4c6aaabf12cfb121d3ca732d6b0152e63b55b947717d05'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'canary-review-hooks.ts',
    'craft-review-hooks.ts',
    'hook-context.ts',
    'index.ts',
    'skill-availability.ts',
    'skill-lifecycle.ts',
  ]
---

## Interface Contract

```ts
export CANARY_REVIEW_DETECTORS
export CANARY_REVIEW_EVENTS
export CANARY_REVIEW_HOST_SKILL
export CRAFT_ANY_LANGUAGE
export CRAFT_DOMAINS_NOT_ACTIVATED_V1
export CRAFT_REVIEW_DOMAINS
export CRAFT_REVIEW_EVENTS_BY_HOST
export CanaryReviewDetectorPlan
export CraftDomainRule
export CraftReviewHostSkill
export CraftReviewOptions
export CraftReviewPlan
export CraftReviewSkip
export CraftSkipReason
export DEFAULT_MAX_CRAFT_DOMAINS
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
export planCraftReviewDomains
export resolveCanaryReviewHooks
export resolveReviewHooksWithCanary
export resolveReviewHooksWithCraft
export resolveSkillHooks
```

## Dependency Slice

```
import { EXTENSION_MAP, SupportedLanguage, detectLanguage } from '../code-nav/types'
import { SkillAvailability, bareSkillName, declaredSkillNames, makeAvailabilityPredicate } from './skill-availability'
import { NormalizedHook, SkillHookEntry, SkillHooksConfigHolder, defaultBlocking, resolveSkillHooks } from './skill-lifecycle'
```

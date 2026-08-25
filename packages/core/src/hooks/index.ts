// packages/core/src/hooks/index.ts
export { resolveSkillHooks, defaultBlocking, SKILL_HOOK_EVENT_KEY_RE } from './skill-lifecycle';
export type {
  SkillHookEntry,
  SkillHooksForSkill,
  SkillHooksConfig,
  SkillHooksConfigHolder,
  NormalizedHook,
} from './skill-lifecycle';
export { buildHookEnv, buildHookStdinPayload, buildHookBriefLines } from './hook-context';
export type { HookContext } from './hook-context';
export {
  CANARY_REVIEW_DETECTORS,
  CANARY_REVIEW_EVENTS,
  CANARY_REVIEW_HOST_SKILL,
  planCanaryReviewDetectors,
  resolveCanaryReviewHooks,
  resolveReviewHooksWithCanary,
} from './canary-review-hooks';
export type { SkillAvailability, CanaryReviewDetectorPlan } from './canary-review-hooks';

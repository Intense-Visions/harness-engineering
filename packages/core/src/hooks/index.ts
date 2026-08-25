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

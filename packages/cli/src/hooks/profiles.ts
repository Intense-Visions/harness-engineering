/**
 * Hook profile definitions.
 *
 * Profiles are additive: each higher tier includes all hooks from lower tiers.
 * - minimal: safety floor (block-no-verify only)
 * - standard: + protect-config, quality-warner (quality gates warn, never block),
 *   pre-compact-state, adoption-tracker, telemetry-reporter, plus the security floor:
 *   sentinel-pre (exit-2 blocks a destructive op in an already-tainted session — the
 *   same safety-floor class as block-no-verify) and sentinel-post (detection only;
 *   always exit 0, never blocks). Quality gates warn-never-block here. (default)
 * - strict: + strict-quality-gate (blocks on quality violations), cost-tracker
 */

export type HookProfile = 'minimal' | 'standard' | 'strict';

export interface HookScript {
  /** Script filename without .js extension */
  name: string;
  /** Claude Code hook event */
  event: 'PreToolUse' | 'PostToolUse' | 'PreCompact' | 'Stop';
  /** Tool matcher pattern */
  matcher: string;
  /** Minimum profile tier that includes this hook */
  minProfile: HookProfile;
}

export const HOOK_SCRIPTS: HookScript[] = [
  { name: 'block-no-verify', event: 'PreToolUse', matcher: 'Bash', minProfile: 'minimal' },
  { name: 'protect-config', event: 'PreToolUse', matcher: 'Write|Edit', minProfile: 'standard' },
  { name: 'quality-warner', event: 'PostToolUse', matcher: 'Edit|Write', minProfile: 'standard' },
  { name: 'pre-compact-state', event: 'PreCompact', matcher: '*', minProfile: 'standard' },
  { name: 'adoption-tracker', event: 'Stop', matcher: '*', minProfile: 'standard' },
  { name: 'telemetry-reporter', event: 'Stop', matcher: '*', minProfile: 'standard' },
  {
    name: 'strict-quality-gate',
    event: 'PostToolUse',
    matcher: 'Edit|Write',
    minProfile: 'strict',
  },
  { name: 'cost-tracker', event: 'Stop', matcher: '*', minProfile: 'strict' },
  { name: 'sentinel-pre', event: 'PreToolUse', matcher: '*', minProfile: 'standard' },
  { name: 'sentinel-post', event: 'PostToolUse', matcher: '*', minProfile: 'standard' },
];

const PROFILE_ORDER: HookProfile[] = ['minimal', 'standard', 'strict'];

function hooksForProfile(profile: HookProfile): string[] {
  const profileIndex = PROFILE_ORDER.indexOf(profile);
  return HOOK_SCRIPTS.filter((h) => PROFILE_ORDER.indexOf(h.minProfile) <= profileIndex).map(
    (h) => h.name
  );
}

export const PROFILES: Record<HookProfile, string[]> = {
  minimal: hooksForProfile('minimal'),
  standard: hooksForProfile('standard'),
  strict: hooksForProfile('strict'),
};

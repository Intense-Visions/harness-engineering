import { describe, it, expect } from 'vitest';
import { PROFILES, type HookProfile, HOOK_SCRIPTS } from '../../src/hooks/profiles';

describe('profiles', () => {
  it('exports minimal, standard, and strict profiles', () => {
    expect(PROFILES).toHaveProperty('minimal');
    expect(PROFILES).toHaveProperty('standard');
    expect(PROFILES).toHaveProperty('strict');
  });

  it('minimal is the safety floor: block-no-verify and autonomy-guard (D16)', () => {
    expect(PROFILES.minimal).toEqual(['block-no-verify', 'autonomy-guard']);
  });

  it('autonomy-guard guards Bash and file writes at the same tier as block-no-verify', () => {
    const guard = HOOK_SCRIPTS.find((h) => h.name === 'autonomy-guard');
    const bnv = HOOK_SCRIPTS.find((h) => h.name === 'block-no-verify');
    expect(guard).toBeDefined();
    expect(guard!.event).toBe('PreToolUse');
    expect(guard!.minProfile).toBe(bnv!.minProfile);
    for (const tool of ['Bash', 'Write', 'Edit', 'MultiEdit']) {
      expect(new RegExp(`^(?:${guard!.matcher})$`).test(tool), tool).toBe(true);
    }
    expect(new RegExp(`^(?:${guard!.matcher})$`).test('Read')).toBe(false);
  });

  it('every safety-floor (minimal) hook ships in the plugin hook list with the same event/matcher', async () => {
    // profiles.ts and scripts/lib/plugin-config.mjs are a dual source of truth.
    const { STANDARD_HOOKS } = (await import(
      // @ts-expect-error -- untyped .mjs build script
      '../../../../scripts/lib/plugin-config.mjs'
    )) as { STANDARD_HOOKS: Array<{ name: string; event: string; matcher: string }> };
    for (const name of PROFILES.minimal) {
      const profile = HOOK_SCRIPTS.find((h) => h.name === name)!;
      expect(STANDARD_HOOKS, name).toContainEqual({
        name,
        event: profile.event,
        matcher: profile.matcher,
      });
    }
  });

  it('standard includes minimal plus protect-config, quality-warner, pre-compact-state', () => {
    expect(PROFILES.standard).toContain('block-no-verify');
    expect(PROFILES.standard).toContain('autonomy-guard');
    expect(PROFILES.standard).toContain('protect-config');
    expect(PROFILES.standard).toContain('quality-warner');
    expect(PROFILES.standard).toContain('pre-compact-state');
    expect(PROFILES.standard).toContain('adoption-tracker');
    expect(PROFILES.standard).toContain('telemetry-reporter');
    expect(PROFILES.standard).toContain('session-retrospect');
    expect(PROFILES.standard).toContain('sentinel-pre');
    expect(PROFILES.standard).toContain('sentinel-post');
    expect(PROFILES.standard).not.toContain('cost-tracker');
    // The blocking gate is strict-only.
    expect(PROFILES.standard).not.toContain('strict-quality-gate');
  });

  it('strict includes all hooks', () => {
    expect(PROFILES.strict).toContain('block-no-verify');
    expect(PROFILES.strict).toContain('protect-config');
    expect(PROFILES.strict).toContain('quality-warner');
    expect(PROFILES.strict).toContain('strict-quality-gate');
    expect(PROFILES.strict).toContain('pre-compact-state');
    expect(PROFILES.strict).toContain('cost-tracker');
  });

  it('profiles are additive (each tier is superset of previous)', () => {
    for (const hook of PROFILES.minimal) {
      expect(PROFILES.standard).toContain(hook);
    }
    for (const hook of PROFILES.standard) {
      expect(PROFILES.strict).toContain(hook);
    }
  });

  it('HOOK_SCRIPTS defines event, matcher, and profile for each hook', () => {
    expect(HOOK_SCRIPTS).toHaveLength(12);
    const blockNoVerify = HOOK_SCRIPTS.find((h) => h.name === 'block-no-verify');
    expect(blockNoVerify).toBeDefined();
    expect(blockNoVerify!.event).toBe('PreToolUse');
    expect(blockNoVerify!.matcher).toBe('Bash');
  });
});

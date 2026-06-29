import { describe, it, expect } from 'vitest';
import { PROFILES, type HookProfile, HOOK_SCRIPTS } from '../../src/hooks/profiles';

describe('profiles', () => {
  it('exports minimal, standard, and strict profiles', () => {
    expect(PROFILES).toHaveProperty('minimal');
    expect(PROFILES).toHaveProperty('standard');
    expect(PROFILES).toHaveProperty('strict');
  });

  it('minimal includes only block-no-verify', () => {
    expect(PROFILES.minimal).toEqual(['block-no-verify']);
  });

  it('standard includes minimal plus protect-config, quality-warner, pre-compact-state', () => {
    expect(PROFILES.standard).toContain('block-no-verify');
    expect(PROFILES.standard).toContain('protect-config');
    expect(PROFILES.standard).toContain('quality-warner');
    expect(PROFILES.standard).toContain('pre-compact-state');
    expect(PROFILES.standard).toContain('adoption-tracker');
    expect(PROFILES.standard).toContain('telemetry-reporter');
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
    expect(HOOK_SCRIPTS).toHaveLength(10);
    const blockNoVerify = HOOK_SCRIPTS.find((h) => h.name === 'block-no-verify');
    expect(blockNoVerify).toBeDefined();
    expect(blockNoVerify!.event).toBe('PreToolUse');
    expect(blockNoVerify!.matcher).toBe('Bash');
  });
});

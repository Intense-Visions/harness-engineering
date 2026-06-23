import { describe, it, expect } from 'vitest';
import { RUNNER_PRESETS, isSupportedRunner } from '../../../src/review/ci/runner-presets';

describe('RUNNER_PRESETS registry shape', () => {
  it('has entries for claude, gemini, codex, cursor', () => {
    expect(Object.keys(RUNNER_PRESETS).sort()).toEqual(['claude', 'codex', 'cursor', 'gemini']);
  });

  it('marks claude/gemini/codex supported with a secretEnvVar and headlessInvocation', () => {
    for (const id of ['claude', 'gemini', 'codex'] as const) {
      const p = RUNNER_PRESETS[id];
      expect(p.supported).toBe(true);
      if (!p.supported) throw new Error(`${id} should be supported`);
      expect(p.secretEnvVar).toMatch(/.+/);
      expect(typeof p.headlessInvocation).toBe('function');
      expect(typeof p.verdictParser).toBe('function');
    }
  });

  it('builds a headless invocation argv per supported runner', () => {
    for (const id of ['claude', 'gemini', 'codex'] as const) {
      const preset = RUNNER_PRESETS[id];
      if (!preset.supported) throw new Error(`${id} should be supported`);
      const inv = preset.headlessInvocation({ instruction: 'review', diffPath: '/tmp/d.diff' });
      expect(inv.command).toMatch(/.+/);
      expect(Array.isArray(inv.args)).toBe(true);
    }
  });

  it('reports claude/gemini/codex as supported runners via isSupportedRunner', () => {
    expect(isSupportedRunner('claude')).toBe(true);
    expect(isSupportedRunner('gemini')).toBe(true);
    expect(isSupportedRunner('codex')).toBe(true);
  });

  it('marks cursor unsupported with a reason and no usable parser path', () => {
    const c = RUNNER_PRESETS.cursor;
    expect(c.supported).toBe(false);
    if (c.supported) throw new Error('cursor should be unsupported');
    expect(c.unsupportedReason).toMatch(/.+/);
    expect(isSupportedRunner('cursor')).toBe(false);
  });
});

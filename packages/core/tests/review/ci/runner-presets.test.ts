import { describe, it, expect } from 'vitest';
import {
  RUNNER_PRESETS,
  isSupportedRunner,
  presetKind,
} from '../../../src/review/ci/runner-presets';

describe('RUNNER_PRESETS registry shape', () => {
  it('has entries for claude, gemini, codex, cursor, local', () => {
    expect(Object.keys(RUNNER_PRESETS).sort()).toEqual([
      'claude',
      'codex',
      'cursor',
      'gemini',
      'local',
    ]);
  });

  it('marks claude/gemini/codex as supported agent-cli presets', () => {
    for (const id of ['claude', 'gemini', 'codex'] as const) {
      const p = RUNNER_PRESETS[id];
      expect(p.kind).toBe('agent-cli');
      expect(p.supported).toBe(true);
      if (p.kind !== 'agent-cli' || !p.supported)
        throw new Error(`${id} should be supported agent-cli`);
      expect(p.secretEnvVar).toMatch(/.+/);
      expect(typeof p.headlessInvocation).toBe('function');
      expect(typeof p.verdictParser).toBe('function');
    }
  });

  it('classifies every preset kind via presetKind', () => {
    expect(presetKind('claude')).toBe('agent-cli');
    expect(presetKind('gemini')).toBe('agent-cli');
    expect(presetKind('codex')).toBe('agent-cli');
    expect(presetKind('cursor')).toBe('agent-cli');
    expect(presetKind('local')).toBe('endpoint');
  });

  it('builds a headless invocation argv per supported agent-cli runner', () => {
    for (const id of ['claude', 'gemini', 'codex'] as const) {
      const preset = RUNNER_PRESETS[id];
      if (preset.kind !== 'agent-cli' || !preset.supported) {
        throw new Error(`${id} should be supported agent-cli`);
      }
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

  it('marks cursor as an unsupported agent-cli placeholder', () => {
    const c = RUNNER_PRESETS.cursor;
    expect(c.kind).toBe('agent-cli');
    expect(c.supported).toBe(false);
    if (c.supported) throw new Error('cursor should be unsupported');
    expect(c.unsupportedReason).toMatch(/.+/);
    expect(isSupportedRunner('cursor')).toBe(false);
  });

  it('exposes a supported local endpoint preset with env-var seams and an injected invoke', () => {
    const l = RUNNER_PRESETS.local;
    expect(l.kind).toBe('endpoint');
    expect(l.supported).toBe(true);
    if (l.kind !== 'endpoint') throw new Error('local should be an endpoint preset');
    expect(l.endpointEnvVar).toBe('HARNESS_LOCAL_ENDPOINT');
    expect(l.modelEnvVar).toBe('HARNESS_LOCAL_MODEL');
    expect(typeof l.verdictParser).toBe('function');
    expect(isSupportedRunner('local')).toBe(true);
  });
});

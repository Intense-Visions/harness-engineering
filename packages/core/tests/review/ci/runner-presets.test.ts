import { describe, it, expect } from 'vitest';
import {
  RUNNER_PRESETS,
  isSupportedRunner,
  presetKind,
} from '../../../src/review/ci/runner-presets';

describe('RUNNER_PRESETS registry shape', () => {
  it('has entries for claude, gemini, antigravity, codex, cursor, local', () => {
    expect(Object.keys(RUNNER_PRESETS).sort()).toEqual([
      'antigravity',
      'claude',
      'codex',
      'cursor',
      'gemini',
      'local',
    ]);
  });

  it('marks claude/codex/antigravity as supported agent-cli presets', () => {
    for (const id of ['claude', 'codex', 'antigravity'] as const) {
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
    expect(presetKind('antigravity')).toBe('agent-cli');
    expect(presetKind('codex')).toBe('agent-cli');
    expect(presetKind('cursor')).toBe('agent-cli');
    expect(presetKind('local')).toBe('endpoint');
  });

  it('builds a STDIN-based headless invocation argv per supported agent-cli runner', () => {
    for (const id of ['claude', 'codex', 'antigravity'] as const) {
      const preset = RUNNER_PRESETS[id];
      if (preset.kind !== 'agent-cli' || !preset.supported) {
        throw new Error(`${id} should be supported agent-cli`);
      }
      // The diff is piped via STDIN — the builder takes only the instruction.
      const inv = preset.headlessInvocation({ instruction: 'review this diff' });
      expect(inv.command).toMatch(/.+/);
      expect(Array.isArray(inv.args)).toBe(true);
      expect(inv.args).toContain('review this diff');
      // No diff-path/file argument leaks into argv (diff goes over STDIN).
      expect(inv.args).not.toContain('--input-file');
      expect(inv.args).not.toContain('--file');
    }
  });

  it('builds the verified claude argv: `claude -p <instruction> --output-format json`', () => {
    const p = RUNNER_PRESETS.claude;
    if (p.kind !== 'agent-cli' || !p.supported) throw new Error('claude should be supported');
    const inv = p.headlessInvocation({ instruction: 'INSTR' });
    expect(inv.command).toBe('claude');
    expect(inv.args).toEqual(['-p', 'INSTR', '--output-format', 'json']);
  });

  it('builds the verified codex argv: `codex exec --json <instruction>` (positional prompt)', () => {
    const p = RUNNER_PRESETS.codex;
    if (p.kind !== 'agent-cli' || !p.supported) throw new Error('codex should be supported');
    const inv = p.headlessInvocation({ instruction: 'INSTR' });
    expect(inv.command).toBe('codex');
    expect(inv.args).toEqual(['exec', '--json', 'INSTR']);
  });

  it('builds the verified antigravity argv: `agy --print <instruction>` (no --output-format flag)', () => {
    const p = RUNNER_PRESETS.antigravity;
    if (p.kind !== 'agent-cli' || !p.supported) throw new Error('antigravity should be supported');
    const inv = p.headlessInvocation({ instruction: 'INSTR' });
    expect(inv.command).toBe('agy');
    expect(inv.args).toEqual(['--print', 'INSTR']);
    // agy has NO --output-format/--json flag (it errors on it); the diff is on STDIN.
    expect(inv.args).not.toContain('--output-format');
    expect(inv.args).not.toContain('--json');
  });

  it('uses GEMINI_API_KEY as the best-guess CI secret for antigravity (Gemini-family)', () => {
    const p = RUNNER_PRESETS.antigravity;
    if (p.kind !== 'agent-cli' || !p.supported) throw new Error('antigravity should be supported');
    expect(p.secretEnvVar).toBe('GEMINI_API_KEY');
  });

  it('reports claude/codex/antigravity as supported runners via isSupportedRunner', () => {
    expect(isSupportedRunner('claude')).toBe(true);
    expect(isSupportedRunner('codex')).toBe(true);
    expect(isSupportedRunner('antigravity')).toBe(true);
  });

  it('marks gemini as unsupported and SUPERSEDED by the antigravity runner', () => {
    const g = RUNNER_PRESETS.gemini;
    expect(g.kind).toBe('agent-cli');
    expect(g.supported).toBe(false);
    if (g.kind !== 'agent-cli' || g.supported) throw new Error('gemini should be unsupported');
    expect(g.unsupportedReason).toMatch(/GEMINI_API_KEY/);
    expect(g.unsupportedReason).toMatch(/UNVERIFIED/);
    expect(g.unsupportedReason).toMatch(/SUPERSEDED/);
    expect(g.unsupportedReason).toMatch(/--runner antigravity/);
    expect(isSupportedRunner('gemini')).toBe(false);
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

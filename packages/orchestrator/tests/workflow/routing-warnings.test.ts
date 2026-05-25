import { describe, it, expect } from 'vitest';
import type { RoutingConfig } from '@harness-engineering/types';
import { STANDARD_COGNITIVE_MODES } from '@harness-engineering/types';
import { routingWarnings } from '../../src/workflow/config';

describe('routingWarnings — Spec B Phase 2 S3 (warn on unknown skill/mode)', () => {
  it('returns no warnings when routing.skills + routing.modes are empty', () => {
    const routing: RoutingConfig = { default: 'claude-opus' };
    expect(routingWarnings(routing, ['harness-debugging'])).toEqual([]);
  });

  it('returns no warnings when every routing.skills.<name> is in the catalog', () => {
    const routing: RoutingConfig = {
      default: 'claude-opus',
      skills: { 'harness-debugging': 'claude-opus' },
    };
    expect(routingWarnings(routing, ['harness-debugging'])).toEqual([]);
  });

  it('warns when routing.skills.<name> is not in the catalog', () => {
    const routing: RoutingConfig = {
      default: 'claude-opus',
      skills: { 'harness-debuggin': 'claude-opus' }, // typo
    };
    const warnings = routingWarnings(routing, ['harness-debugging']);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('routing.skills.harness-debuggin');
    expect(warnings[0]).toContain('not present in the local skill catalog');
  });

  it('emits one warning per unknown skill name (count proportional to typos)', () => {
    // Concern #3: confirm emission scales linearly so operator gets every typo.
    // Note: pass a non-empty catalog so the helper actually evaluates the
    // skill names (an empty catalog suppresses warnings entirely — pinned
    // by the "does NOT warn when knownSkillNames is empty" test below).
    const routing: RoutingConfig = {
      default: 'claude-opus',
      skills: {
        bogus1: 'claude-opus',
        bogus2: 'claude-opus',
        bogus3: 'claude-opus',
      },
    };
    const warnings = routingWarnings(routing, ['harness-debugging']);
    expect(warnings).toHaveLength(3);
  });

  it('does NOT warn when knownSkillNames is empty (no catalog discovered)', () => {
    // When `agents/skills/` is absent, we cannot evaluate the warning.
    // Skipping is preferable to flooding the operator with false positives.
    const routing: RoutingConfig = {
      default: 'claude-opus',
      skills: { foo: 'claude-opus' },
    };
    expect(routingWarnings(routing, [])).toEqual([]);
  });

  it('returns no warnings when every routing.modes.<name> is a STANDARD_COGNITIVE_MODE', () => {
    const routing: RoutingConfig = {
      default: 'claude-opus',
      modes: {
        'adversarial-reviewer': 'claude-opus',
        'constructive-architect': 'claude-opus',
      },
    };
    expect(routingWarnings(routing, ['harness-debugging'])).toEqual([]);
  });

  it('warns when routing.modes.<mode> is not in STANDARD_COGNITIVE_MODES', () => {
    const routing: RoutingConfig = {
      default: 'claude-opus',
      modes: { 'gut-reactor': 'claude-opus' },
    };
    const warnings = routingWarnings(routing, []);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('routing.modes.gut-reactor');
    expect(warnings[0]).toContain('not in STANDARD_COGNITIVE_MODES');
    for (const mode of STANDARD_COGNITIVE_MODES) {
      expect(warnings[0]).toContain(mode);
    }
  });

  it('warns on both unknown skills and unknown modes in a single call', () => {
    const routing: RoutingConfig = {
      default: 'claude-opus',
      skills: { bogus: 'claude-opus' },
      modes: { 'bogus-mode': 'claude-opus' },
    };
    const warnings = routingWarnings(routing, ['harness-debugging']);
    expect(warnings).toHaveLength(2);
    expect(warnings.some((w) => w.includes('routing.skills.bogus'))).toBe(true);
    expect(warnings.some((w) => w.includes('routing.modes.bogus-mode'))).toBe(true);
  });
});

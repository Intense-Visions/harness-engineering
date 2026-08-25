import { describe, it, expect } from 'vitest';
import {
  CANARY_REVIEW_DETECTORS,
  CANARY_REVIEW_EVENTS,
  resolveCanaryReviewHooks,
  resolveReviewHooksWithCanary,
} from '../../src/hooks/canary-review-hooks';
import { resolveSkillHooks, type SkillHooksConfigHolder } from '../../src/hooks/skill-lifecycle';

/**
 * Canary auto-wiring at REVIEW / FINAL_REVIEW (#1482).
 *
 * When canary is present, autopilot's review moments run canary's deterministic
 * detectors ALONGSIDE (never replacing) harness-code-reviewer, reusing the
 * skillHooks dispatch path. These tests pin: the detector set + order, the
 * present/absent gate, review-event-only gating, blocking policy, additive merge
 * with a project's configured skillHooks, dedup against explicit config, and the
 * no-regression guarantee when canary is absent.
 */
describe('resolveCanaryReviewHooks', () => {
  it('emits one blocking skill hook per deterministic detector at after:REVIEW', () => {
    expect(resolveCanaryReviewHooks(true, 'after:REVIEW')).toEqual([
      { type: 'skill', skill: 'canary-savant', blocking: true },
      { type: 'skill', skill: 'canary-blackhawk', blocking: true },
      { type: 'skill', skill: 'canary-katana', blocking: true },
      { type: 'skill', skill: 'canary-cassandra', blocking: true },
    ]);
  });

  it('emits the same blocking detectors at after:FINAL_REVIEW', () => {
    const hooks = resolveCanaryReviewHooks(true, 'after:FINAL_REVIEW');
    expect(hooks.map((h) => h.type === 'skill' && h.skill)).toEqual([...CANARY_REVIEW_DETECTORS]);
    expect(hooks.every((h) => h.type === 'skill' && h.blocking === true)).toBe(true);
  });

  it('returns [] when canary is absent (no regression)', () => {
    expect(resolveCanaryReviewHooks(false, 'after:REVIEW')).toEqual([]);
    expect(resolveCanaryReviewHooks(false, 'after:FINAL_REVIEW')).toEqual([]);
  });

  it('returns [] for non-review events even when canary is present', () => {
    for (const event of ['before:EXECUTE', 'after:VERIFY', 'after:PLAN', 'on:failure']) {
      expect(resolveCanaryReviewHooks(true, event)).toEqual([]);
    }
  });

  it('exports exactly the four documented detectors', () => {
    expect(CANARY_REVIEW_DETECTORS).toEqual([
      'canary-savant',
      'canary-blackhawk',
      'canary-katana',
      'canary-cassandra',
    ]);
    expect(CANARY_REVIEW_EVENTS).toEqual(['after:REVIEW', 'after:FINAL_REVIEW']);
  });
});

describe('resolveReviewHooksWithCanary', () => {
  it('appends canary detectors after configured hooks when canary is present', () => {
    const config: SkillHooksConfigHolder = {
      skillHooks: {
        'harness-autopilot': {
          'after:REVIEW': [{ type: 'skill', skill: 'my-domain-reviewer', blocking: true }],
        },
      },
    };
    const hooks = resolveReviewHooksWithCanary(config, 'harness-autopilot', 'after:REVIEW', {
      canaryPresent: true,
    });
    expect(hooks).toEqual([
      { type: 'skill', skill: 'my-domain-reviewer', blocking: true },
      { type: 'skill', skill: 'canary-savant', blocking: true },
      { type: 'skill', skill: 'canary-blackhawk', blocking: true },
      { type: 'skill', skill: 'canary-katana', blocking: true },
      { type: 'skill', skill: 'canary-cassandra', blocking: true },
    ]);
  });

  it('does not duplicate a detector a project already declares explicitly', () => {
    const config: SkillHooksConfigHolder = {
      // Project pins canary-cassandra as non-blocking; the canary default for it
      // must be dropped so the explicit entry wins and it is dispatched once.
      skillHooks: {
        'harness-autopilot': {
          'after:REVIEW': [{ type: 'skill', skill: 'canary-cassandra', blocking: false }],
        },
      },
    };
    const hooks = resolveReviewHooksWithCanary(config, 'harness-autopilot', 'after:REVIEW', {
      canaryPresent: true,
    });
    const cassandra = hooks.filter((h) => h.type === 'skill' && h.skill === 'canary-cassandra');
    expect(cassandra).toEqual([{ type: 'skill', skill: 'canary-cassandra', blocking: false }]);
    // Every OTHER detector still auto-wires.
    expect(hooks.map((h) => h.type === 'skill' && h.skill)).toEqual([
      'canary-cassandra',
      'canary-savant',
      'canary-blackhawk',
      'canary-katana',
    ]);
  });

  it('preserves configured prompt/command hooks and appends detectors', () => {
    const config: SkillHooksConfigHolder = {
      skillHooks: {
        'harness-autopilot': {
          'after:REVIEW': [
            { type: 'prompt', text: 'Prefer existing helpers.' },
            { type: 'command', run: 'pnpm lint', blocking: true },
          ],
        },
      },
    };
    const hooks = resolveReviewHooksWithCanary(config, 'harness-autopilot', 'after:REVIEW', {
      canaryPresent: true,
    });
    expect(hooks.slice(0, 2)).toEqual([
      { type: 'prompt', text: 'Prefer existing helpers.' },
      { type: 'command', run: 'pnpm lint', blocking: true },
    ]);
    expect(hooks.slice(2).map((h) => h.type === 'skill' && h.skill)).toEqual([
      ...CANARY_REVIEW_DETECTORS,
    ]);
  });

  it('returns exactly the configured hooks when canary is absent (no regression)', () => {
    const config: SkillHooksConfigHolder = {
      skillHooks: {
        'harness-autopilot': { 'after:REVIEW': ['my-domain-reviewer'] },
      },
    };
    const expected = resolveSkillHooks(config, 'harness-autopilot', 'after:REVIEW');
    const hooks = resolveReviewHooksWithCanary(config, 'harness-autopilot', 'after:REVIEW', {
      canaryPresent: false,
    });
    expect(hooks).toEqual(expected);
  });

  it('injects detectors even with no configured skillHooks at all', () => {
    const hooks = resolveReviewHooksWithCanary(undefined, 'harness-autopilot', 'after:REVIEW', {
      canaryPresent: true,
    });
    expect(hooks.map((h) => h.type === 'skill' && h.skill)).toEqual([...CANARY_REVIEW_DETECTORS]);
  });

  it('never attaches canary detectors to a non-autopilot host skill', () => {
    const hooks = resolveReviewHooksWithCanary(undefined, 'harness-code-review', 'after:REVIEW', {
      canaryPresent: true,
    });
    expect(hooks).toEqual([]);
  });

  it('does not inject detectors at a non-review autopilot event', () => {
    const config: SkillHooksConfigHolder = {
      skillHooks: { 'harness-autopilot': { 'before:EXECUTE': ['preflight'] } },
    };
    const hooks = resolveReviewHooksWithCanary(config, 'harness-autopilot', 'before:EXECUTE', {
      canaryPresent: true,
    });
    expect(hooks).toEqual([{ type: 'skill', skill: 'preflight', blocking: false }]);
  });
});

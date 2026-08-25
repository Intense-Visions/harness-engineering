import { describe, it, expect } from 'vitest';
import {
  CANARY_REVIEW_DETECTORS,
  CANARY_REVIEW_EVENTS,
  planCanaryReviewDetectors,
  resolveCanaryReviewHooks,
  resolveReviewHooksWithCanary,
} from '../../src/hooks/canary-review-hooks';
import { resolveSkillHooks, type SkillHooksConfigHolder } from '../../src/hooks/skill-lifecycle';

/**
 * Canary auto-wiring at REVIEW / FINAL_REVIEW (#1482).
 *
 * When canary is present, autopilot's review moments run canary's deterministic
 * detectors ALONGSIDE (never replacing) harness-code-reviewer, reusing the
 * skillHooks dispatch path. Crucially the detectors are FORWARD-WIRED harness
 * defaults: a detector whose skill is not installed is skipped (never a hard
 * halt), while a USER-declared unresolvable hook still hard-halts. These tests
 * pin: the detector set + order, present/absent + event + host gating, blocking
 * policy, resolve-and-filter by availability, the wired/skipped/expected plan,
 * additive merge, dedup + enabled:false opt-out, and the no-regression guarantee.
 */

// The four detectors, all installed — the future state where canary ships them.
const ALL_INSTALLED = new Set<string>([...CANARY_REVIEW_DETECTORS]);

describe('planCanaryReviewDetectors', () => {
  it('wires all detectors (in order, blocking) when all are installed', () => {
    const plan = planCanaryReviewDetectors(true, 'after:REVIEW', ALL_INSTALLED);
    expect(plan.wired).toEqual([
      { type: 'skill', skill: 'canary-savant', blocking: true },
      { type: 'skill', skill: 'canary-blackhawk', blocking: true },
      { type: 'skill', skill: 'canary-katana', blocking: true },
      { type: 'skill', skill: 'canary-cassandra', blocking: true },
    ]);
    expect(plan.skipped).toEqual([]);
    expect(plan.expected).toEqual([...CANARY_REVIEW_DETECTORS]);
  });

  it('skips every detector (no hard halt) when none are installed — canary 5.12.0 reality', () => {
    // canary is present, but ships none of the four → all skipped, none wired.
    const plan = planCanaryReviewDetectors(true, 'after:REVIEW', new Set());
    expect(plan.wired).toEqual([]);
    expect(plan.skipped).toEqual([...CANARY_REVIEW_DETECTORS]);
    expect(plan.expected).toEqual([...CANARY_REVIEW_DETECTORS]);
  });

  it('partitions installed vs not-installed detectors', () => {
    const plan = planCanaryReviewDetectors(true, 'after:FINAL_REVIEW', ['canary-katana']);
    expect(plan.wired).toEqual([{ type: 'skill', skill: 'canary-katana', blocking: true }]);
    expect(plan.skipped).toEqual(['canary-savant', 'canary-blackhawk', 'canary-cassandra']);
  });

  it('treats unknown availability (undefined) as none installed — never optimistically wires', () => {
    const plan = planCanaryReviewDetectors(true, 'after:REVIEW');
    expect(plan.wired).toEqual([]);
    expect(plan.skipped).toEqual([...CANARY_REVIEW_DETECTORS]);
  });

  it('accepts a predicate for availability', () => {
    const plan = planCanaryReviewDetectors(true, 'after:REVIEW', (s) => s === 'canary-savant');
    expect(plan.wired).toEqual([{ type: 'skill', skill: 'canary-savant', blocking: true }]);
    expect(plan.skipped).toEqual(['canary-blackhawk', 'canary-katana', 'canary-cassandra']);
  });

  it('returns an empty plan when canary is absent (no regression)', () => {
    const plan = planCanaryReviewDetectors(false, 'after:REVIEW', ALL_INSTALLED);
    expect(plan).toEqual({ wired: [], skipped: [], expected: [] });
  });

  it('returns an empty plan for non-review events even when canary is present', () => {
    for (const event of ['before:EXECUTE', 'after:VERIFY', 'after:PLAN', 'on:failure']) {
      expect(planCanaryReviewDetectors(true, event, ALL_INSTALLED)).toEqual({
        wired: [],
        skipped: [],
        expected: [],
      });
    }
  });

  it('exports exactly the four documented detectors and two review events', () => {
    expect(CANARY_REVIEW_DETECTORS).toEqual([
      'canary-savant',
      'canary-blackhawk',
      'canary-katana',
      'canary-cassandra',
    ]);
    expect(CANARY_REVIEW_EVENTS).toEqual(['after:REVIEW', 'after:FINAL_REVIEW']);
  });
});

describe('resolveCanaryReviewHooks', () => {
  it('returns only the installed detectors as blocking hooks', () => {
    expect(resolveCanaryReviewHooks(true, 'after:REVIEW', ALL_INSTALLED)).toEqual(
      CANARY_REVIEW_DETECTORS.map((skill) => ({ type: 'skill', skill, blocking: true }))
    );
  });

  it('returns [] when no detector is installed (skip, not halt)', () => {
    expect(resolveCanaryReviewHooks(true, 'after:REVIEW', new Set())).toEqual([]);
  });

  it('returns [] when canary is absent', () => {
    expect(resolveCanaryReviewHooks(false, 'after:REVIEW', ALL_INSTALLED)).toEqual([]);
  });
});

describe('resolveReviewHooksWithCanary', () => {
  it('appends INSTALLED canary detectors after configured hooks', () => {
    const config: SkillHooksConfigHolder = {
      skillHooks: {
        'harness-autopilot': {
          'after:REVIEW': [{ type: 'skill', skill: 'my-domain-reviewer', blocking: true }],
        },
      },
    };
    const hooks = resolveReviewHooksWithCanary(config, 'harness-autopilot', 'after:REVIEW', {
      canaryPresent: true,
      availableSkills: ALL_INSTALLED,
    });
    expect(hooks).toEqual([
      { type: 'skill', skill: 'my-domain-reviewer', blocking: true },
      { type: 'skill', skill: 'canary-savant', blocking: true },
      { type: 'skill', skill: 'canary-blackhawk', blocking: true },
      { type: 'skill', skill: 'canary-katana', blocking: true },
      { type: 'skill', skill: 'canary-cassandra', blocking: true },
    ]);
  });

  it('when no detector is installed, returns exactly the configured hooks (review proceeds, no halt) — canary 5.12.0 reality', () => {
    // The realistic case today: canary present, ships none of the four. The
    // effective hooks are just the baseline reviewer path; nothing is injected,
    // nothing hard-halts.
    const config: SkillHooksConfigHolder = {
      skillHooks: {
        'harness-autopilot': {
          'after:REVIEW': [{ type: 'skill', skill: 'my-domain-reviewer', blocking: true }],
        },
      },
    };
    const hooks = resolveReviewHooksWithCanary(config, 'harness-autopilot', 'after:REVIEW', {
      canaryPresent: true,
      availableSkills: new Set(), // none installed
    });
    expect(hooks).toEqual([{ type: 'skill', skill: 'my-domain-reviewer', blocking: true }]);
  });

  it('a USER-declared hook flows through regardless of availability (dispatcher hard-halts on it, not us)', () => {
    // A user-declared skill (a possible typo) is NOT filtered by availability —
    // it is returned so the consuming skill can hard-halt on it if unresolvable.
    // Only harness-DEFAULT canary detectors are availability-filtered.
    const config: SkillHooksConfigHolder = {
      skillHooks: {
        'harness-autopilot': { 'after:REVIEW': ['my-typo-reviewer'] },
      },
    };
    const hooks = resolveReviewHooksWithCanary(config, 'harness-autopilot', 'after:REVIEW', {
      canaryPresent: true,
      availableSkills: new Set(), // nothing installed
    });
    // The user hook is present even though it is not "installed" — the resolver
    // never silently drops a user-declared hook.
    expect(hooks).toEqual([{ type: 'skill', skill: 'my-typo-reviewer', blocking: true }]);
  });

  it('does not duplicate a detector a project already declares explicitly', () => {
    const config: SkillHooksConfigHolder = {
      skillHooks: {
        'harness-autopilot': {
          'after:REVIEW': [{ type: 'skill', skill: 'canary-cassandra', blocking: false }],
        },
      },
    };
    const hooks = resolveReviewHooksWithCanary(config, 'harness-autopilot', 'after:REVIEW', {
      canaryPresent: true,
      availableSkills: ALL_INSTALLED,
    });
    const cassandra = hooks.filter((h) => h.type === 'skill' && h.skill === 'canary-cassandra');
    expect(cassandra).toEqual([{ type: 'skill', skill: 'canary-cassandra', blocking: false }]);
    expect(hooks.map((h) => h.type === 'skill' && h.skill)).toEqual([
      'canary-cassandra',
      'canary-savant',
      'canary-blackhawk',
      'canary-katana',
    ]);
  });

  it('honors an enabled:false detector as an opt-out (parked, not re-injected)', () => {
    const config: SkillHooksConfigHolder = {
      skillHooks: {
        'harness-autopilot': {
          'after:REVIEW': [{ type: 'skill', skill: 'canary-cassandra', enabled: false }],
        },
      },
    };
    const hooks = resolveReviewHooksWithCanary(config, 'harness-autopilot', 'after:REVIEW', {
      canaryPresent: true,
      availableSkills: ALL_INSTALLED,
    });
    expect(hooks.some((h) => h.type === 'skill' && h.skill === 'canary-cassandra')).toBe(false);
    expect(hooks.map((h) => h.type === 'skill' && h.skill)).toEqual([
      'canary-savant',
      'canary-blackhawk',
      'canary-katana',
    ]);
  });

  it('dedups against a bare-string detector declaration through the merged layer', () => {
    const config: SkillHooksConfigHolder = {
      skillHooks: { 'harness-autopilot': { 'after:REVIEW': ['canary-katana'] } },
    };
    const hooks = resolveReviewHooksWithCanary(config, 'harness-autopilot', 'after:REVIEW', {
      canaryPresent: true,
      availableSkills: ALL_INSTALLED,
    });
    const katana = hooks.filter((h) => h.type === 'skill' && h.skill === 'canary-katana');
    expect(katana).toEqual([{ type: 'skill', skill: 'canary-katana', blocking: true }]);
    expect(hooks.map((h) => h.type === 'skill' && h.skill)).toEqual([
      'canary-katana',
      'canary-savant',
      'canary-blackhawk',
      'canary-cassandra',
    ]);
  });

  it('preserves configured prompt/command hooks and appends installed detectors', () => {
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
      availableSkills: ALL_INSTALLED,
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
      availableSkills: ALL_INSTALLED,
    });
    expect(hooks).toEqual(expected);
  });

  it('injects installed detectors even with no configured skillHooks at all', () => {
    const hooks = resolveReviewHooksWithCanary(undefined, 'harness-autopilot', 'after:REVIEW', {
      canaryPresent: true,
      availableSkills: ALL_INSTALLED,
    });
    expect(hooks.map((h) => h.type === 'skill' && h.skill)).toEqual([...CANARY_REVIEW_DETECTORS]);
  });

  it('never attaches canary detectors to a non-autopilot host skill', () => {
    const hooks = resolveReviewHooksWithCanary(undefined, 'harness-code-review', 'after:REVIEW', {
      canaryPresent: true,
      availableSkills: ALL_INSTALLED,
    });
    expect(hooks).toEqual([]);
  });

  it('does not inject detectors at a non-review autopilot event', () => {
    const config: SkillHooksConfigHolder = {
      skillHooks: { 'harness-autopilot': { 'before:EXECUTE': ['preflight'] } },
    };
    const hooks = resolveReviewHooksWithCanary(config, 'harness-autopilot', 'before:EXECUTE', {
      canaryPresent: true,
      availableSkills: ALL_INSTALLED,
    });
    expect(hooks).toEqual([{ type: 'skill', skill: 'preflight', blocking: false }]);
  });
});

import { describe, it, expect } from 'vitest';
import {
  resolveSkillHooks,
  defaultBlocking,
  SKILL_HOOK_EVENT_KEY_RE,
  type SkillHooksConfigHolder,
} from '../../src/hooks/skill-lifecycle';
import {
  buildHookEnv,
  buildHookStdinPayload,
  buildHookBriefLines,
  type HookContext,
} from '../../src/hooks/hook-context';

/**
 * Cross-skill lifecycle hook resolver (#1481 → generalized `skillHooks`).
 *
 * The resolver is the shared seam every hook-supporting skill calls. These
 * tests pin: the three entry kinds (skill / prompt / command), the bare-string
 * shorthand, the default-blocking policy, event-key grammar, and empty/absent
 * config — for BOTH the harness-autopilot and harness-code-review consumers.
 */
describe('resolveSkillHooks — normalization', () => {
  it('normalizes a bare string to a skill hook (shorthand)', () => {
    const config: SkillHooksConfigHolder = {
      skillHooks: { 'harness-autopilot': { 'before:EXECUTE': ['preflight-skill'] } },
    };
    expect(resolveSkillHooks(config, 'harness-autopilot', 'before:EXECUTE')).toEqual([
      { type: 'skill', skill: 'preflight-skill', blocking: false },
    ]);
  });

  it('normalizes an explicit skill entry and honors per-entry blocking override', () => {
    const config: SkillHooksConfigHolder = {
      skillHooks: {
        'harness-autopilot': {
          // after:REVIEW would default blocking:true; the entry forces false.
          'after:REVIEW': [{ type: 'skill', skill: 'canary-cassandra', blocking: false }],
        },
      },
    };
    expect(resolveSkillHooks(config, 'harness-autopilot', 'after:REVIEW')).toEqual([
      { type: 'skill', skill: 'canary-cassandra', blocking: false },
    ]);
  });

  it('applies the default-blocking policy to an explicit skill entry with no blocking field', () => {
    const config: SkillHooksConfigHolder = {
      skillHooks: {
        'harness-autopilot': { 'after:REVIEW': [{ type: 'skill', skill: 'canary-cassandra' }] },
      },
    };
    expect(resolveSkillHooks(config, 'harness-autopilot', 'after:REVIEW')).toEqual([
      // after:REVIEW ⇒ default blocking true.
      { type: 'skill', skill: 'canary-cassandra', blocking: true },
    ]);
  });

  it('normalizes a prompt entry (never carries a blocking field)', () => {
    const config: SkillHooksConfigHolder = {
      skillHooks: {
        'harness-autopilot': {
          'before:EXECUTE': [{ type: 'prompt', text: 'Prefer existing helpers.' }],
        },
      },
    };
    const hooks = resolveSkillHooks(config, 'harness-autopilot', 'before:EXECUTE');
    expect(hooks).toEqual([{ type: 'prompt', text: 'Prefer existing helpers.' }]);
    expect('blocking' in hooks[0]).toBe(false);
  });

  it('normalizes a command entry with the default-blocking policy', () => {
    const config: SkillHooksConfigHolder = {
      skillHooks: {
        'harness-autopilot': {
          // before:EXECUTE ⇒ default blocking false unless overridden.
          'before:EXECUTE': [
            { type: 'command', run: 'pnpm lint', blocking: true },
            { type: 'command', run: 'echo hi' },
          ],
        },
      },
    };
    expect(resolveSkillHooks(config, 'harness-autopilot', 'before:EXECUTE')).toEqual([
      { type: 'command', run: 'pnpm lint', blocking: true },
      { type: 'command', run: 'echo hi', blocking: false },
    ]);
  });

  it('preserves declared order across mixed kinds', () => {
    const config: SkillHooksConfigHolder = {
      skillHooks: {
        'harness-autopilot': {
          'before:EXECUTE': [
            'preflight-skill',
            { type: 'command', run: 'pnpm lint' },
            { type: 'prompt', text: 'note' },
          ],
        },
      },
    };
    const hooks = resolveSkillHooks(config, 'harness-autopilot', 'before:EXECUTE');
    expect(hooks.map((h) => h.type)).toEqual(['skill', 'command', 'prompt']);
  });
});

describe('resolveSkillHooks — default-blocking policy', () => {
  it('defaults skill/command to blocking:true at review/verify events', () => {
    expect(defaultBlocking('after:REVIEW')).toBe(true);
    expect(defaultBlocking('after:FINAL_REVIEW')).toBe(true);
    expect(defaultBlocking('after:VERIFY')).toBe(true);
    expect(defaultBlocking('before:review')).toBe(true);
  });

  it('defaults skill/command to blocking:false at non-review/verify events', () => {
    expect(defaultBlocking('before:EXECUTE')).toBe(false);
    expect(defaultBlocking('after:PLAN')).toBe(false);
    expect(defaultBlocking('on:failure')).toBe(false);
    expect(defaultBlocking('after:mechanical')).toBe(false);
    expect(defaultBlocking('after:run')).toBe(false);
  });

  it('matches whole tokens, so review/verify substrings do not misfire', () => {
    // "preview" contains "review", "reverify"/"unverified" contain "verify" —
    // a substring test would wrongly default these to blocking.
    expect(defaultBlocking('after:preview')).toBe(false);
    expect(defaultBlocking('before:reverify')).toBe(false);
    expect(defaultBlocking('on:unverified')).toBe(false);
    // …while a genuine segmented review/verify phase still blocks.
    expect(defaultBlocking('after:FINAL_REVIEW')).toBe(true);
    expect(defaultBlocking('before:pre-verify')).toBe(true);
  });
});

describe('resolveSkillHooks — event grammar', () => {
  it('accepts before:/after:/on: forms including run-boundary and lifecycle events', () => {
    for (const key of [
      'before:EXECUTE',
      'after:REVIEW',
      'before:run',
      'after:run',
      'on:failure',
      'on:park',
      'after:mechanical',
    ]) {
      expect(SKILL_HOOK_EVENT_KEY_RE.test(key)).toBe(true);
    }
  });

  it('rejects malformed event keys', () => {
    for (const key of ['REVIEW', 'during:REVIEW', 'after:', ':REVIEW', 'after REVIEW']) {
      expect(SKILL_HOOK_EVENT_KEY_RE.test(key)).toBe(false);
    }
  });

  it('resolves a before:run entry (run-boundary hook for single-shot skills)', () => {
    const config: SkillHooksConfigHolder = {
      skillHooks: { 'harness-autopilot': { 'before:run': ['preflight-skill'] } },
    };
    expect(resolveSkillHooks(config, 'harness-autopilot', 'before:run')).toEqual([
      { type: 'skill', skill: 'preflight-skill', blocking: false },
    ]);
  });

  it('resolves an on:failure command hook', () => {
    const config: SkillHooksConfigHolder = {
      skillHooks: {
        'harness-autopilot': {
          'on:failure': [{ type: 'command', run: 'scripts/notify.sh' }],
        },
      },
    };
    expect(resolveSkillHooks(config, 'harness-autopilot', 'on:failure')).toEqual([
      { type: 'command', run: 'scripts/notify.sh', blocking: false },
    ]);
  });
});

describe('resolveSkillHooks — cross-skill (not autopilot-locked)', () => {
  it('resolves hooks for the harness-code-review consumer', () => {
    const config: SkillHooksConfigHolder = {
      skillHooks: {
        'harness-code-review': { 'after:mechanical': ['extra-domain-check'] },
      },
    };
    expect(resolveSkillHooks(config, 'harness-code-review', 'after:mechanical')).toEqual([
      { type: 'skill', skill: 'extra-domain-check', blocking: false },
    ]);
  });

  it('scopes hooks by skill name — one skill never sees another skill hooks', () => {
    const config: SkillHooksConfigHolder = {
      skillHooks: {
        'harness-autopilot': { 'after:REVIEW': ['a'] },
        'harness-code-review': { 'after:mechanical': ['b'] },
      },
    };
    expect(resolveSkillHooks(config, 'harness-autopilot', 'after:mechanical')).toEqual([]);
    expect(resolveSkillHooks(config, 'harness-code-review', 'after:REVIEW')).toEqual([]);
  });
});

describe('resolveSkillHooks — enabled toggle', () => {
  it('skips an enabled:false entry entirely (park without deleting)', () => {
    const config: SkillHooksConfigHolder = {
      skillHooks: {
        'harness-autopilot': {
          'before:EXECUTE': [
            { type: 'command', run: 'pnpm lint', enabled: false },
            { type: 'skill', skill: 'preflight-skill' },
          ],
        },
      },
    };
    expect(resolveSkillHooks(config, 'harness-autopilot', 'before:EXECUTE')).toEqual([
      { type: 'skill', skill: 'preflight-skill', blocking: false },
    ]);
  });

  it('keeps an explicit enabled:true entry', () => {
    const config: SkillHooksConfigHolder = {
      skillHooks: {
        'harness-autopilot': {
          'before:EXECUTE': [{ type: 'prompt', text: 'note', enabled: true }],
        },
      },
    };
    expect(resolveSkillHooks(config, 'harness-autopilot', 'before:EXECUTE')).toEqual([
      { type: 'prompt', text: 'note' },
    ]);
  });
});

describe('hook input-context contract', () => {
  const base: HookContext = {
    event: 'after:REVIEW',
    hostSkill: 'harness-autopilot',
    phase: 'REVIEW',
    projectRoot: '/repo',
    sessionDir: '/repo/.harness/sessions/s1',
    changedFiles: ['src/a.ts', 'src/b.ts'],
    planPath: 'docs/changes/x/plans/p.md',
  };

  it('buildHookEnv populates HARNESS_* keys incl. event and changed files', () => {
    const env = buildHookEnv(base);
    expect(env.HARNESS_HOOK_EVENT).toBe('after:REVIEW');
    expect(env.HARNESS_HOOK_SKILL).toBe('harness-autopilot');
    expect(env.HARNESS_PHASE).toBe('REVIEW');
    expect(env.HARNESS_PROJECT_ROOT).toBe('/repo');
    expect(env.HARNESS_SESSION_DIR).toBe('/repo/.harness/sessions/s1');
    expect(env.HARNESS_CHANGED_FILES).toBe('src/a.ts\nsrc/b.ts');
    expect(env.HARNESS_PLAN_PATH).toBe('docs/changes/x/plans/p.md');
  });

  it('buildHookEnv unsets absent keys rather than passing empty strings', () => {
    const env = buildHookEnv({ event: 'before:run', hostSkill: 'harness-code-review' });
    expect(env.HARNESS_HOOK_EVENT).toBe('before:run');
    expect('HARNESS_PHASE' in env).toBe(false);
    expect('HARNESS_CHANGED_FILES' in env).toBe(false);
    expect('HARNESS_FAILURE_REASON' in env).toBe(false);
  });

  it('on:failure context sets HARNESS_FAILURE_REASON', () => {
    const env = buildHookEnv({
      event: 'on:failure',
      hostSkill: 'harness-autopilot',
      failureReason: 'unresolvable review skill: canary-typo',
    });
    expect(env.HARNESS_FAILURE_REASON).toBe('unresolvable review skill: canary-typo');
  });

  it('buildHookStdinPayload mirrors the context in camelCase, omitting absent fields', () => {
    const payload = buildHookStdinPayload({
      event: 'after:REVIEW',
      hostSkill: 'harness-autopilot',
    });
    expect(payload).toEqual({ event: 'after:REVIEW', hostSkill: 'harness-autopilot' });
  });

  it('buildHookBriefLines gives a skill subagent the same context (changed files, plan)', () => {
    const lines = buildHookBriefLines(base).join('\n');
    expect(lines).toMatch(/Event: after:REVIEW/);
    expect(lines).toMatch(/src\/a\.ts/);
    expect(lines).toMatch(/Plan: docs\/changes\/x\/plans\/p\.md/);
  });
});

describe('resolveSkillHooks — empty / absent config', () => {
  it('returns [] for undefined / null config', () => {
    expect(resolveSkillHooks(undefined, 'harness-autopilot', 'after:REVIEW')).toEqual([]);
    expect(resolveSkillHooks(null, 'harness-autopilot', 'after:REVIEW')).toEqual([]);
  });

  it('returns [] when skillHooks is empty', () => {
    expect(resolveSkillHooks({ skillHooks: {} }, 'harness-autopilot', 'after:REVIEW')).toEqual([]);
  });

  it('returns [] when the skill has no entry for the event', () => {
    const config: SkillHooksConfigHolder = {
      skillHooks: { 'harness-autopilot': { 'after:REVIEW': ['a'] } },
    };
    expect(resolveSkillHooks(config, 'harness-autopilot', 'before:EXECUTE')).toEqual([]);
  });

  it('returns [] when the event array is empty', () => {
    const config: SkillHooksConfigHolder = {
      skillHooks: { 'harness-autopilot': { 'after:REVIEW': [] } },
    };
    expect(resolveSkillHooks(config, 'harness-autopilot', 'after:REVIEW')).toEqual([]);
  });
});

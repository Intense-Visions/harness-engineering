import { describe, it, expect } from 'vitest';
import {
  HarnessConfigSchema,
  SkillHookEntrySchema,
  SkillHooksConfigSchema,
} from '../../src/config/schema';

/**
 * #1481 (generalized) — the narrow `review.additionalSkills` field is replaced
 * by a top-level, cross-skill `skillHooks` framework. These tests pin the
 * schema surface: the three entry kinds, the bare-string shorthand, the
 * `enabled` toggle, the event-key grammar, and default-safe absence.
 */
describe('SkillHookEntrySchema — entry kinds', () => {
  it('accepts a bare skill-name string', () => {
    expect(SkillHookEntrySchema.safeParse('canary-cassandra').success).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(SkillHookEntrySchema.safeParse('').success).toBe(false);
  });

  it('accepts a skill object with blocking + enabled', () => {
    const parsed = SkillHookEntrySchema.safeParse({
      type: 'skill',
      skill: 'canary-cassandra',
      blocking: true,
      enabled: false,
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts a prompt object', () => {
    expect(
      SkillHookEntrySchema.safeParse({ type: 'prompt', text: 'Prefer existing helpers.' }).success
    ).toBe(true);
  });

  it('rejects a prompt object with empty text', () => {
    expect(SkillHookEntrySchema.safeParse({ type: 'prompt', text: '' }).success).toBe(false);
  });

  it('accepts a command object', () => {
    expect(
      SkillHookEntrySchema.safeParse({ type: 'command', run: 'pnpm lint', blocking: true }).success
    ).toBe(true);
  });

  it('rejects a command object with empty run', () => {
    expect(SkillHookEntrySchema.safeParse({ type: 'command', run: '' }).success).toBe(false);
  });

  it('rejects an unknown type', () => {
    expect(SkillHookEntrySchema.safeParse({ type: 'webhook', url: 'x' }).success).toBe(false);
  });
});

describe('SkillHooksConfigSchema — event-key grammar', () => {
  it('accepts before:/after:/on: forms incl. run-boundary + lifecycle events', () => {
    const parsed = SkillHooksConfigSchema.safeParse({
      'harness-autopilot': {
        'before:EXECUTE': ['preflight'],
        'after:REVIEW': [{ type: 'skill', skill: 'canary-cassandra' }],
        'before:run': ['x'],
        'after:run': ['y'],
        'on:failure': [{ type: 'command', run: 'scripts/notify.sh' }],
      },
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a malformed event key', () => {
    const parsed = SkillHooksConfigSchema.safeParse({
      'harness-autopilot': { REVIEW: ['x'] },
    });
    expect(parsed.success).toBe(false);
  });

  it('defaults to {} when absent', () => {
    const parsed = SkillHooksConfigSchema.safeParse(undefined);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toEqual({});
  });
});

describe('HarnessConfigSchema — skillHooks integration', () => {
  it('parses a full skillHooks block on the top-level config', () => {
    const parsed = HarnessConfigSchema.safeParse({
      version: 1,
      skillHooks: {
        'harness-autopilot': {
          'before:EXECUTE': [
            'preflight-skill',
            { type: 'command', run: 'pnpm lint', blocking: true },
            { type: 'prompt', text: 'Prefer existing helpers.' },
          ],
          'after:REVIEW': [{ type: 'skill', skill: 'canary-cassandra', blocking: true }],
        },
        'harness-code-review': { 'after:mechanical': ['extra-domain-check'] },
      },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.skillHooks?.['harness-code-review']?.['after:mechanical']).toEqual([
        'extra-domain-check',
      ]);
    }
  });

  it('leaves skillHooks undefined when absent (no regression)', () => {
    const parsed = HarnessConfigSchema.safeParse({ version: 1 });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.skillHooks).toBeUndefined();
  });

  it('no longer accepts the removed review.additionalSkills field shape as a review key', () => {
    // review.additionalSkills was removed; a review block with only model_tiers still parses.
    const parsed = HarnessConfigSchema.safeParse({
      version: 1,
      review: { model_tiers: { fast: 'claude-haiku-4' } },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect((parsed.data.review as Record<string, unknown>).additionalSkills).toBeUndefined();
    }
  });
});

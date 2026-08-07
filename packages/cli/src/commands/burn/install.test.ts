import { describe, expect, it } from 'vitest';

import { parseBudget } from './budget';
import { applySettings, buildPlan } from './install';

const BIN = '/opt/harness/burn/dist/bin/burn-hud.mjs';

describe('install plan', () => {
  it('treats a fresh settings file as pure additions', () => {
    const plan = buildPlan({}, BIN);
    expect(plan.added).toEqual(['statusLine', 'SessionStart', 'Stop']);
    expect(plan.replaced).toEqual([]);
    expect(plan.clobbered).toBeNull();
  });

  it('reports the old Python HUD as a replacement, not an addition', () => {
    // The cutover case: these entries point at the predecessor and are the ones
    // that must be removed, or both HUDs scan and both hooks speak.
    const plan = buildPlan(
      {
        statusLine: { command: '/Users/x/.claude/hud/statusline.sh' },
        hooks: {
          SessionStart: [
            { hooks: [{ command: '/Users/x/.claude/hud/hooks/burn-session-brief.sh' }] },
          ],
          Stop: [{ hooks: [{ command: '/Users/x/.claude/hud/hooks/burn-escalation.sh' }] }],
        },
      },
      BIN
    );
    expect(plan.added).toEqual([]);
    expect(plan.replaced).toHaveLength(3);
    expect(plan.clobbered).toBeNull();
  });

  it('flags an unrelated statusline as a take-over rather than claiming to leave it', () => {
    // A statusline is single-valued, so installing one necessarily takes it.
    // Saying otherwise would make the printed plan disagree with the write.
    const plan = buildPlan({ statusLine: { command: 'starship prompt' } }, BIN);
    expect(plan.clobbered).toBe('starship prompt');
    expect(plan.replaced).toEqual([]);
  });

  it('leaves unrelated hooks out of the plan entirely', () => {
    const plan = buildPlan(
      { hooks: { Stop: [{ hooks: [{ command: 'my-own-linter.sh' }] }] } },
      BIN
    );
    expect(plan.replaced).toEqual([]);
    expect(plan.added).toContain('Stop'); // ours is added alongside, not instead
  });

  it('recognises an already-installed HUD as a replacement', () => {
    const plan = buildPlan({ statusLine: { command: `${BIN} line` } }, BIN);
    expect(plan.replaced[0]).toContain('burn-hud.mjs line');
  });
});

describe('settings rewrite', () => {
  interface Hooked {
    hooks?: Record<string, { hooks?: { command?: string }[] }[]>;
  }

  function stopCommands(settings: Record<string, unknown>): string[] {
    return ((settings as Hooked).hooks?.Stop ?? []).flatMap((e) =>
      (e.hooks ?? []).map((h) => h.command ?? '')
    );
  }

  it('is idempotent — installing twice leaves one hook, not two', () => {
    // Two Stop hooks means the escalation fires twice per assistant turn, and
    // a warning that double-prints is the noise this HUD exists to avoid.
    const once = applySettings({}, BIN);
    const twice = applySettings(once, BIN);
    expect(stopCommands(twice)).toEqual([`${BIN} stop`]);
  });

  it('drops the predecessor rather than running both HUDs', () => {
    const migrated = applySettings(
      {
        hooks: {
          Stop: [{ hooks: [{ command: '/Users/x/.claude/hud/hooks/burn-escalation.sh' }] }],
        },
      },
      BIN
    );
    expect(stopCommands(migrated)).toEqual([`${BIN} stop`]);
  });

  it('preserves unrelated hooks and unrelated settings keys', () => {
    const migrated = applySettings(
      {
        permissions: { allow: ['Bash(npm run:*)'] },
        hooks: { Stop: [{ hooks: [{ command: 'my-own-linter.sh' }] }] },
      },
      BIN
    );
    expect(stopCommands(migrated)).toEqual(['my-own-linter.sh', `${BIN} stop`]);
    expect(migrated.permissions).toEqual({ allow: ['Bash(npm run:*)'] });
  });
});

describe('budget parsing', () => {
  it('reads suffixed magnitudes', () => {
    expect(parseBudget('250M', null)).toBe(250_000_000);
    expect(parseBudget('1.2B', null)).toBe(1_200_000_000);
    expect(parseBudget('800k', null)).toBe(800_000);
    expect(parseBudget('12000', null)).toBe(12_000);
  });

  it('reads a multiplier against the trailing baseline', () => {
    expect(parseBudget('1.5x', 200_000_000)).toBe(300_000_000);
  });

  it('refuses a multiplier with no baseline to multiply', () => {
    // Inventing a ceiling out of no baseline is exactly the fabricated
    // precision the HUD refuses to print.
    expect(parseBudget('1.5x', null)).toBeNull();
  });

  it('refuses input it cannot read', () => {
    expect(parseBudget('lots', null)).toBeNull();
    expect(parseBudget('', null)).toBeNull();
  });
});

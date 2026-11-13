// agents/skills/tests/autonomy-wiring.test.ts
//
// Wiring of trusted autonomy into workflow skills: SC10 (D2), SC11, D17 flags.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { SUMMARY_STEP, START_STEP } from './pause-markers';
import { parse } from 'yaml';

const SKILLS = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'claude-code');
const skill = (name: string) => readFileSync(resolve(SKILLS, name, 'SKILL.md'), 'utf-8');

/** The text from a heading to the next heading of the same or higher level. */
function section(md: string, heading: string): string {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => l.trim() === heading);
  if (start < 0) throw new Error(`heading not found: ${heading}`);
  const level = (/^#+/.exec(heading) ?? [''])[0].length;
  const end = lines.findIndex(
    (l, i) => i > start && /^#+ /.test(l) && (/^#+/.exec(l) ?? [''])[0].length <= level
  );
  return lines.slice(start, end < 0 ? undefined : end).join('\n');
}
/** Cells of the first table row whose first cell matches. */
function row(md: string, first: string): string[] {
  const r = md.split('\n').find((l) => new RegExp(`^\\|\\s*${first}\\s*\\|`).test(l));
  if (r === undefined) throw new Error(`row not found: ${first}`);
  return r
    .split('|')
    .map((c) => c.trim())
    .filter(Boolean);
}

describe('SC10 / D2: --fast no longer auto-approves plans or INTEGRATE', () => {
  const ap = skill('harness-autopilot');
  it('Rigor Levels: the fast APPROVE_PLAN and INTEGRATE cells do not auto-approve', () => {
    const rigor = section(ap, '## Rigor Levels');
    const plan = row(rigor, 'APPROVE_PLAN');
    expect(plan[2]).toBe('Signal-based'); // control: the row was parsed
    expect(plan[1]).not.toMatch(/auto-approve/i);
    expect(row(rigor, 'INTEGRATE')[1]).not.toMatch(/auto-approve/i);
  });
  it('APPROVE_PLAN has no fast-only approval path', () => {
    const s = section(ap, '### APPROVE_PLAN');
    expect(s).toContain('Signals (any true'); // control
    expect(s).not.toContain('auto_approved_plan_fast');
    expect(s).not.toMatch(/"fast"`?\s*→\s*auto-approve/);
  });
  it('reviewPlans makes plan approval a pause that never auto-resolves (D-H)', () => {
    expect(section(ap, '### APPROVE_PLAN')).toContain(
      'If `reviewPlans` is `true`, this approval never auto-resolves'
    );
  });
  it('INTEGRATE: the fast step does not auto-approve', () => {
    const fast = section(ap, '### INTEGRATE')
      .split('\n')
      .find((l) => l.includes('`"fast"`'));
    expect(fast).toBeDefined();
    expect(fast).not.toMatch(/auto-approve/i);
  });
  it('harness-integration: the fast rigor row does not auto-approve', () => {
    const r = row(section(skill('harness-integration'), '### Rigor Level Interaction'), '`fast`');
    expect(r[1]).toMatch(/WIRE only/); // control
    expect(r[1]).not.toMatch(/auto-approve/i);
  });
});

describe('SC11: terminal points print the auto-decision summary', () => {
  it('the summary step keys on the CLI no-decisions sentinel', () => {
    expect(SUMMARY_STEP).toContain('`No auto-decisions recorded`');
    expect(SUMMARY_STEP).toContain('harness autonomy log --session <session-slug>');
  });
  it('autopilot DONE', () => {
    expect(section(skill('harness-autopilot'), '### DONE')).toContain(SUMMARY_STEP);
  });
  it('execution completion, after the roadmap sync and before the auto-transition', () => {
    const s = skill('harness-execution');
    const at = s.indexOf(SUMMARY_STEP);
    expect(at).toBeGreaterThan(s.indexOf('**Sync roadmap (mandatory when present).**'));
    expect(at).toBeLessThan(s.indexOf('**Auto-transition to verification.**'));
  });
  it('brainstorming sign-off, before the roadmap promotion', () => {
    const s = skill('harness-brainstorming');
    const at = s.indexOf(SUMMARY_STEP);
    expect(at).toBeGreaterThan(s.indexOf('**Request sign-off in plain text.**'));
    expect(at).toBeLessThan(s.indexOf('**Promote the roadmap row.**'));
  });
});

const FLAG_SKILLS = [
  'harness-brainstorming',
  'harness-planning',
  'harness-autopilot',
  'harness-execution',
  'harness-integration',
];
const argNames = (name: string): string[] =>
  (
    (
      parse(readFileSync(resolve(SKILLS, name, 'skill.yaml'), 'utf-8')) as {
        cli?: { args?: Array<{ name: string }> };
      }
    ).cli?.args ?? []
  ).map((a) => a.name);

describe('D17: Tier-1 workflow skills accept only lowering autonomy flags', () => {
  it.each(FLAG_SKILLS)('%s declares supervised and audit, never trusted or no-audit', (name) => {
    const a = argNames(name);
    expect(a.length).toBeGreaterThan(0); // control: the yaml was parsed
    expect(a).toEqual(expect.arrayContaining(['supervised', 'audit']));
    expect(a).not.toContain('trusted');
    expect(a).not.toContain('no-audit');
  });
});

describe('D2: rigor flag descriptions describe checking only, never approval', () => {
  const argDesc = (name: string, arg: string): string | undefined =>
    (
      parse(readFileSync(resolve(SKILLS, name, 'skill.yaml'), 'utf-8')) as {
        cli?: { args?: Array<{ name: string; description?: string }> };
      }
    ).cli?.args?.find((a) => a.name === arg)?.description;
  it.each(['harness-autopilot', 'harness-integration', 'harness-planning', 'harness-execution'])(
    '%s --fast description has no approval wording',
    (name) => {
      const d = argDesc(name, 'fast');
      expect(d).toBeDefined(); // control: the arg exists
      expect(d).not.toMatch(/approv/i);
    }
  );
});

describe('brainstorming sign-off states who approves in each mode (verify N5)', () => {
  it('names supervised approval and the trusted-mode ceremony', () => {
    const s = skill('harness-brainstorming');
    expect(s).toContain(
      'The human must explicitly approve (supervised); in trusted mode this ceremony is auto-approved and logged per the Pause Protocol.'
    );
    expect(s).not.toContain(
      'The human must explicitly approve (a clear "yes") before this skill is complete.'
    );
  });
});

/** Index of the first canonical marker line at or after `from`, or Infinity. */
function firstMarker(md: string, from = 0): number {
  const m =
    /^\s*_Pause point \([a-z]+\): resolve per the Pause Protocol\._ <!-- pause: [a-z]+ -->$/m.exec(
      md.slice(from)
    );
  return m ? from + m.index : Number.POSITIVE_INFINITY;
}

describe('B1 / D17: lowering flags are applied before any dispatch or marked point', () => {
  const FLAGGED = [
    'harness-brainstorming',
    'harness-planning',
    'harness-autopilot',
    'harness-execution',
    'harness-integration',
  ];
  it.each(FLAGGED)(
    '%s carries the start step before its first dispatch and first pause marker',
    (name) => {
      const md = skill(name);
      const at = md.indexOf(START_STEP);
      expect(at, 'start step present').toBeGreaterThanOrEqual(0);
      // autopilot's hook-policy text precedes its state machine; its run starts at INIT
      const runStart = name === 'harness-autopilot' ? md.indexOf('## State Machine') : 0;
      expect(runStart).toBeGreaterThanOrEqual(0);
      expect(at).toBeGreaterThan(runStart - 1);
      expect(at, 'before the first pause marker').toBeLessThan(firstMarker(md, runStart));
      const dispatch = md.search(/^\s*subagent_type: "/m);
      if (dispatch >= 0) expect(at, 'before the first dispatch').toBeLessThan(dispatch);
    }
  );
  it('autopilot INIT applies the flags and reads autonomy before ASSESS', () => {
    const init = section(skill('harness-autopilot'), '### INIT');
    expect(init).toContain(START_STEP);
    expect(init).toMatch(/include: \[[^\]]*"autonomy"[^\]]*\]/);
    expect(init.indexOf(START_STEP)).toBeLessThan(init.indexOf('→ ASSESS'));
  });
  it('every skill that declares a lowering flag carries the start step (list is complete)', () => {
    const declaring = readdirSync(SKILLS).filter(
      (n) => existsSync(resolve(SKILLS, n, 'skill.yaml')) && argNames(n).includes('supervised')
    );
    expect(declaring.length).toBeGreaterThan(0); // control
    expect(declaring.sort()).toEqual([...FLAGGED].sort());
  });
});

describe('N6: autopilot routes a headless audit disagreement to the human, never to retry', () => {
  const ap = skill('harness-autopilot');
  it('reads handoff blockers and concerns after every dispatch', () => {
    const s = section(ap, '### After every dispatch');
    expect(s).toContain('read `{sessionDir}/handoff.json` `blockers` and `concerns`');
    expect(s).toContain('If any blocker starts with `audit-disagreement:`');
    expect(s).toContain('present both positions from `concerns` to the human in plain text');
  });
  it('never retries or re-dispatches the unit to settle it', () => {
    const s = section(ap, '### After every dispatch');
    expect(s).toContain('it never enters the EXECUTE retry path');
    expect(s).toContain('the same unit is never re-dispatched to settle it');
  });
  it('the EXECUTE retry logic excludes it', () => {
    const s = section(ap, '### EXECUTE');
    const exclusion = s.indexOf(
      'A handoff blocker starting `audit-disagreement:` is not a task failure'
    );
    expect(exclusion).toBeGreaterThanOrEqual(0);
    expect(exclusion).toBeLessThan(s.indexOf('Attempt 1:'));
  });
});

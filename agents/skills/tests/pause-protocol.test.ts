// agents/skills/tests/pause-protocol.test.ts
//
// Pins the rules of the shared Pause Protocol (docs/changes/trusted-autonomy-mode/proposal.md,
// D1, D7-D11, D17; SC3, SC4, SC7, SC11, SC14). Behaviour is instruction-level by design (D5):
// these tests prove the instructions exist and say the right thing, not that an agent obeys them.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const PROTOCOL = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'templates',
  'pause-protocol.md'
);
const md = readFileSync(PROTOCOL, 'utf-8');

/** The text between a heading and the next heading of the same or higher level. */
function section(heading: string): string {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => l.trim() === heading);
  if (start < 0) throw new Error(`heading not found: ${heading}`);
  const level = (/^#+/.exec(heading) ?? [''])[0].length;
  const end = lines.findIndex(
    (l, i) => i > start && /^#+ /.test(l) && (/^#+/.exec(l) ?? [''])[0].length <= level
  );
  return lines.slice(start, end < 0 ? undefined : end).join('\n');
}
const classRows = md.split('\n').filter((l) => /^\|\s*`[a-z]+`\s*\|/.test(l));
const cells = (cls: string) => {
  const row = classRows.find((r) => r.startsWith(`| \`${cls}\``));
  if (row === undefined) throw new Error(`no class row for ${cls}`);
  return row
    .split('|')
    .map((c) => c.trim())
    .filter(Boolean);
};

describe('Pause Protocol class table (D1, SC1-SC4)', () => {
  it('defines exactly four classes', () => {
    expect(classRows.map((r) => /`([a-z]+)`/.exec(r)?.[1])).toEqual([
      'ceremony',
      'judgment',
      'irreversible',
      'gate',
    ]);
  });
  it.each([
    ['ceremony', 'pause', 'auto-approve, log'],
    [
      'judgment',
      'pause (audit verdict shown if on)',
      'audit → agree: auto-take, log; disagree: pause',
    ],
    ['irreversible', 'pause', 'pause'],
    ['gate', 'stop', 'stop'],
  ])('%s resolves to (supervised: %s, trusted: %s)', (cls, sup, tru) => {
    expect(cells(cls).slice(-2)).toEqual([sup, tru]);
  });
  it('irreversible and gate never auto-resolve, at any level (SC4)', () => {
    const rules = section('## Resolving a pause point');
    expect(rules).toContain('1. `gate` → stop at every autonomy level.');
    expect(rules).toContain('2. `irreversible` → pause at every autonomy level.');
  });
});

describe('marker convention and reading autonomy', () => {
  it('shows the canonical marker line', () => {
    expect(md).toContain(
      '_Pause point (judgment): resolve per the Pause Protocol._ <!-- pause: judgment -->'
    );
  });
  it('the nearest marker wins, and no window may hold two classes (verify N1)', () => {
    const s = section('## Marker convention');
    expect(s).toContain('The nearest marker above a pause point is the one that applies.');
    expect(s).toContain(
      'No pause point may have markers of two different classes within its window'
    );
  });
  it('re-reads autonomy at every pause point through gather_context (SC7, D10)', () => {
    const s = section('## Reading autonomy');
    expect(s).toContain('include: ["autonomy"]');
    expect(s).toContain('**and again at every pause point**');
    expect(s).toContain('never undone');
  });
  it('treats invocation flags as lower-only and applies them as a session lowering (D17)', () => {
    const s = section('## Reading autonomy');
    expect(s).toContain('**Invocation flags only lower autonomy (D17).**');
    expect(s).toContain('action: "set-autonomy"');
    expect(s).toMatch(/On `--trusted` or `--no-audit`, change nothing/);
  });
});

describe('record before proceeding (SC14) and fail-safe rules', () => {
  it('auto-resolves only after recorded: true, and pauses on anything else', () => {
    const s = section('## Resolving a pause point');
    expect(s).toContain('**Record before proceeding.**');
    expect(s).toContain('Only when it returns `recorded: true`');
    expect(s).toMatch(/`recorded: false`[^\n]*pause exactly as supervised mode would/);
    expect(s).toContain('An unlogged auto-decision is never taken');
  });
  it('lists five fail-safe rules, all resolving to pause', () => {
    const s = section('### Fail-safe rules');
    expect(s).toContain('Each of these resolves to **pause**');
    expect(s.split('\n').filter((l) => l.startsWith('- '))).toHaveLength(5);
    for (const phrase of [
      'no stated recommendation',
      'no marker',
      'no session slug',
      'did not return `recorded: true`',
      'cannot read this protocol or resolve autonomy',
    ]) {
      expect(s).toContain(phrase);
    }
  });
  it('never sends ts or autonomySource', () => {
    expect(section('### `record_auto_decision` call')).toContain(
      'Never send `ts` or `autonomySource`'
    );
  });
});

describe('self-audit and escalation (D7, D8, D11, SC3)', () => {
  it('runs blind re-derivation first and the refuter only on agreement', () => {
    const s = section('## Self-audit (judgment forks)');
    expect(s).toContain('**Blind re-derivation.**');
    expect(s).toContain('**Refutation** (only when the picks agree)');
    expect(s).toContain('never contains your recommendation or your rationale');
  });
  it('records an unavailable audit and proceeds, counted in N/M (D11)', () => {
    const s = section('## Self-audit (judgment forks)');
    expect(s).toContain('{ "status": "unavailable" }');
    expect(s).toContain('audited N/M');
  });
  it('escalates in plain text, records only after the human answers, and routes headless runs through blockers', () => {
    const s = section('## Escalation (audit disagreement)');
    expect(s).toContain('Escalations are recorded only after the human answers');
    expect(s).toContain('"status": "escalated"');
    expect(s).toContain('"blockers": ["audit-disagreement: <question>"]');
    expect(s).toContain('in `supervised` mode the log refuses every entry');
  });
});

describe('end-of-run summary (SC11)', () => {
  it('names the summary command and the no-decisions sentinel', () => {
    const s = section('## End-of-run summary');
    expect(s).toContain('harness autonomy log --session <session-slug>');
    expect(s).toContain('`No auto-decisions recorded`');
    expect(s).toContain('never report zero decisions you did not read');
  });
});

/** Slots the blind auditor may receive. Anything else could carry the conclusion (SC8). */
const BLIND_SLOTS = ['evidence', 'options', 'phase', 'question', 'skill'];
const SLOT = /\{\{\s*([A-Za-z]+)\s*\}\}/g;
function template(tag: string): string {
  const m = new RegExp('```' + tag + '\\n([\\s\\S]*?)\\n```').exec(md);
  if (!m) throw new Error(`no \`\`\`${tag} block in pause-protocol.md`);
  return m[1] ?? '';
}
const slots = (t: string) => [...t.matchAll(SLOT)].map((m) => m[1] ?? '').sort();
const render = (t: string, vars: Record<string, string>) =>
  t.replace(SLOT, (_m, k: string) => {
    const v = vars[k];
    if (v === undefined) throw new Error(`unfilled slot ${k}`);
    return v;
  });

const RECO = 'Recommendation: B) Defer Y (confidence: medium) RECO-7f3a';
const RATIONALE = 'Keeps the plan focused on the stated goal RAT-91c2';
/** A full decision, including what the blind auditor must never see. */
const decision: Record<string, string> = {
  skill: 'harness-planning',
  phase: 'SCOPE',
  question: 'Include Y in this plan?',
  options: '- C) Update the spec first\n- A) Include Y\n- B) Defer Y',
  evidence: 'Spec section 3 omits Y; the YAGNI review flagged it.',
  recommendation: RECO,
  rationale: RATIONALE,
  pick: 'B) Defer Y',
};

/** Every way a template could let the blind auditor see the conclusion. */
function blindLeaks(t: string): string[] {
  const out: string[] = [];
  const extra = slots(t).filter((s) => !BLIND_SLOTS.includes(s));
  if (extra.length > 0) out.push(`slots beyond the blind set: ${extra.join(', ')}`);
  if (/recommend|rationale/i.test(t))
    out.push('template text mentions a recommendation or rationale');
  const rendered = render(t, decision);
  if (rendered.includes('RECO-7f3a') || rendered.includes('RAT-91c2')) {
    out.push('rendered prompt contains the recommendation or its rationale');
  }
  return out;
}

describe('SC8: the blind auditor never sees the recommendation', () => {
  it('uses exactly the blind slots', () => {
    expect(slots(template('blind-audit-prompt'))).toEqual(BLIND_SLOTS);
  });
  it('renders a full decision without the recommendation or its rationale', () => {
    const out = render(template('blind-audit-prompt'), decision);
    expect(out).toContain('Include Y in this plan?'); // control: the decision was rendered
    expect(out).toContain('B) Defer Y'); // the option itself is shown, unlabelled
    expect(out).not.toContain('RECO-7f3a');
    expect(out).not.toContain('RAT-91c2');
    expect(out).not.toMatch(/recommend/i);
    expect(blindLeaks(template('blind-audit-prompt'))).toEqual([]);
  });
  it('negative control: a template that adds a recommendation or rationale slot is caught', () => {
    const t = template('blind-audit-prompt');
    expect(blindLeaks(`${t}\nHint: {{recommendation}}`)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/slots beyond the blind set: recommendation/),
        expect.stringMatching(/rendered prompt contains/),
      ])
    );
    expect(blindLeaks(`${t}\nWhy: {{rationale}}`).length).toBeGreaterThan(0);
  });
  it('positive control: the refuter does receive the pick, and still not the rationale', () => {
    const t = template('refuter-prompt');
    expect(slots(t)).toEqual([...BLIND_SLOTS, 'pick'].sort());
    const out = render(t, decision);
    expect(out).toContain('Chosen option:\nB) Defer Y');
    expect(out).not.toContain('RECO-7f3a');
    expect(out).not.toContain('RAT-91c2');
  });
  it('tells the agent to shuffle options and strip recommendation markers first', () => {
    expect(md).toContain(
      'Shuffle the options into a random order and strip every recommendation marker'
    );
    expect(template('blind-audit-prompt')).toMatch(/order is random/i);
  });
});

describe('review I1: the recommendation is committed before the audit, and the audit runs once', () => {
  it('prints the pre-audit recommendation and binds chosen and rationale to it', () => {
    const audit = section('## Self-audit (judgment forks)');
    expect(audit).toContain('print `Recommendation (pre-audit): <option>`');
    expect(audit).toContain('copied verbatim from the options');
    const rec = section('### `record_auto_decision` call');
    expect(rec).toContain('`chosen` equals the pre-audit recommendation');
    expect(rec).toContain('`rationale` begins `pre-audit: <option>;`');
  });
  it('spawns one blind auditor and at most one refuter; a second spawn escalates', () => {
    const audit = section('## Self-audit (judgment forks)');
    expect(audit).toContain('Spawn exactly one blind auditor and at most one refuter per fork.');
    expect(audit).toContain(
      'Never re-run either: needing a second spawn of either is a disagreement → escalate.'
    );
  });
  it('a recommendation the agent would have to invent counts as none', () => {
    expect(section('### Fail-safe rules')).toContain(
      'If the skill text at this pause names no options or no recommendation, a recommendation you would have to invent counts as none.'
    );
  });
});

describe('review I2: an audit is unavailable only on a host that cannot spawn, decided once', () => {
  it('fixes availability at skill start, from the host tools alone', () => {
    const audit = section('## Self-audit (judgment forks)');
    expect(audit).toContain(
      'Decide this once, at skill start, and only from whether the host has a subagent-spawning tool; it stays fixed for the session.'
    );
    expect(md).not.toContain('or the spawn failed');
  });
  it('on a host that can spawn, a failed or malformed audit is a disagreement', () => {
    expect(section('## Self-audit (judgment forks)')).toContain(
      'On a host that can spawn, a spawn error, a reply that is not JSON, or a pick that is not verbatim one of the options is a disagreement → escalate.'
    );
  });
});

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

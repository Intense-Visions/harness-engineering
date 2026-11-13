// agents/skills/tests/pause-markers.test.ts
//
// SC12: a test fails if any pause point in the seven workflow skills lacks a
// `<!-- pause: <class> -->` marker or uses a class outside the four defined. Detection is
// phrase-based (see pause-markers.ts); the denominator is printed and floored per skill.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  WORKFLOW_SKILLS,
  PAUSE_PREAMBLE,
  PAUSE_PREAMBLE_HEADING,
  canonicalMarkerLine as marker,
  pauseMarkerViolations,
  scanSkill,
} from './pause-markers';

const SKILLS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'claude-code');
const read = (s: string) => readFileSync(resolve(SKILLS_DIR, s, 'SKILL.md'), 'utf-8');
const violations = (t: string) => pauseMarkerViolations(scanSkill(t));

describe('pause marker detector controls', () => {
  it('fails an unmarked pause (positive control)', () => {
    expect(violations('Intro\n\nAsk the human. Proceed? (yes/no)\n')).toEqual([
      expect.stringMatching(/^line 3: unmarked pause point/),
    ]);
  });
  it('accepts a marker up to three lines above, and rejects one four lines above', () => {
    expect(violations(`${marker('ceremony')}\na\nb\nProceed? (yes/no)\n`)).toEqual([]);
    expect(violations(`${marker('ceremony')}\na\nb\nc\nProceed? (yes/no)\n`)).toHaveLength(1);
  });
  it('anchors a pause inside a fence at the opening fence', () => {
    const deep = `${marker('ceremony')}\n\n\`\`\`\nApprove spec at x?\n1\n2\n3\n4\nProceed? (yes/no)\n\`\`\`\n`;
    expect(violations(deep)).toEqual([]);
    expect(
      violations(`${marker('ceremony')}\n1\n2\n3\n\`\`\`\nProceed? (yes/no)\n\`\`\`\n`)
    ).toHaveLength(1);
  });
  it('anchors every table row at the first row', () => {
    const rows = Array.from({ length: 5 }, (_, i) => `| r${i} | **STOP.** |`).join('\n');
    expect(violations(`${marker('gate')}\n| a | b |\n|---|---|\n${rows}\n`)).toEqual([]);
  });
  it('rejects an unknown class, a bare marker, a mismatched reference, and two markers on a line', () => {
    expect(violations('<!-- pause: maybe -->\n')).toEqual([
      expect.stringMatching(/unknown pause class "maybe"/),
    ]);
    expect(violations('<!-- pause: gate -->\nSTOP.\n')[0]).toMatch(/non-canonical marker line/);
    expect(
      violations(
        '_Pause point (gate): resolve per the Pause Protocol._ <!-- pause: ceremony -->\n'
      )[0]
    ).toMatch(/non-canonical/);
    expect(violations(`${marker('gate')} <!-- pause: gate -->\n`)[0]).toMatch(/more than one/);
  });
  it('ignores exempt sections only until the next heading, and not across fenced headings', () => {
    expect(violations('## Red Flags\n\n| x | STOP. |\n\n## Process\n\nok\n')).toEqual([]);
    expect(violations('## Red Flags\n\nSTOP.\n\n## Process\n\nSTOP.\n')).toEqual([
      expect.stringMatching(/^line 7:/),
    ]);
    expect(violations('## Red Flags\n\n```bash\n# Process\n```\nSTOP.\n')).toEqual([]);
  });
  it('does not count negated pauses or the protocol name', () => {
    expect(scanSkill('Announce. Do NOT pause here. Never pause there.\n').pausePhrases).toEqual([]);
    expect(scanSkill('Apply the Pause Protocol (`pause-protocol.md`).\n').pausePhrases).toEqual([]);
  });
  it('needs a three-word opt-out reason, covering its own line, the next line, or a fence below it', () => {
    expect(violations('STOP. <!-- not-a-pause: no -->\n')[0]).toMatch(/at least three words/);
    expect(violations('STOP. <!-- not-a-pause: self-correction, not a human ask -->\n')).toEqual(
      []
    );
    expect(
      violations(
        '<!-- not-a-pause: plan template copied into plans -->\n```\n[checkpoint:human-verify] ...\n```\n'
      )
    ).toEqual([]);
    expect(violations('<!-- not-a-pause: too far above it -->\n\nSTOP.\n')).toHaveLength(1);
  });
  it('the preamble section is exempt and ends at the next heading', () => {
    const t = `# S\n\n## Process\n\n${PAUSE_PREAMBLE}\n\n### Iron Law\n\nSTOP.\n`;
    const s = scanSkill(t);
    expect(s.errors).toEqual([]);
    expect(s.exemptHits).toBeGreaterThan(0);
    expect(pauseMarkerViolations(s)).toEqual([
      expect.stringMatching(/unmarked pause point: STOP\./),
    ]);
  });
});

/** Pause phrases found per skill at base c4068cf23. Raise when a skill gains pauses; never lower. */
const MIN_PAUSE_PHRASES: Record<(typeof WORKFLOW_SKILLS)[number], number> = {
  'harness-brainstorming': 22,
  'harness-planning': 16,
  'harness-autopilot': 19,
  'harness-execution': 21,
  'harness-soundness-review': 2,
  'harness-code-review': 10,
  'harness-integration': 9,
};

/** Skills not yet labelled; their compliance check runs as it.fails. Tasks 12-18 empty this. */
const UNLABELLED = new Set<string>([
  'harness-execution',
  'harness-soundness-review',
  'harness-code-review',
  'harness-integration',
]);

const rows = WORKFLOW_SKILLS.map((skill) => {
  const text = read(skill);
  return { skill, text, scan: scanSkill(text) };
});

describe('SC12: every pause point in the seven workflow skills is marked', () => {
  it('finds at least the pinned number of pause phrases in every skill (denominator)', () => {
    console.info(
      rows
        .map(
          (r) =>
            `${r.skill}: ${r.scan.pausePhrases.length} pause phrases, ${r.scan.markers.length} markers, ` +
            `${r.scan.optOuts} opt-outs, ${r.scan.exemptHits} in exempt sections`
        )
        .join('\n')
    );
    for (const r of rows) {
      expect(r.scan.pausePhrases.length, r.skill).toBeGreaterThanOrEqual(
        MIN_PAUSE_PHRASES[r.skill]
      );
    }
  });
  for (const r of rows) {
    const title = `${r.skill}: all ${r.scan.pausePhrases.length} pause phrases marked; classes known; preamble present`;
    const check = () => {
      expect(pauseMarkerViolations(r.scan)).toEqual([]);
      expect(r.scan.markers.length).toBeGreaterThan(0);
      const at = r.text.indexOf(PAUSE_PREAMBLE);
      expect(at, 'canonical Pause points preamble').toBeGreaterThanOrEqual(0);
      expect(r.text.split(PAUSE_PREAMBLE_HEADING).length - 1, 'one Pause points heading').toBe(1);
      expect(r.text.slice(at + PAUSE_PREAMBLE.length).replace(/^\n+/, '')).toMatch(/^#{1,6} /);
    };
    if (UNLABELLED.has(r.skill)) it.fails(`${title} [pending labelling]`, check);
    else it(title, check);
  }
});

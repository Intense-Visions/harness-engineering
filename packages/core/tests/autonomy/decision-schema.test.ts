import { describe, it, expect } from 'vitest';
import {
  AUTO_DECISION_LIMITS,
  parseAutoDecisionLine,
  validateAutoDecisionInput,
  escapeUnsafeLogText,
} from '../../src/autonomy/decision-schema';

const ceremony = {
  skill: 'harness-planning',
  phase: 'VALIDATE',
  pauseClass: 'ceremony',
  question: 'Approve plan?',
  options: ['approve'],
  chosen: 'approve',
  rationale: 'all truths traced',
};
const judgment = {
  skill: 'harness-brainstorming',
  phase: 'EVALUATE',
  pauseClass: 'judgment',
  question: 'Which approach?',
  options: ['A', 'B'],
  chosen: 'A',
  rationale: 'smaller blast radius',
  audit: { status: 'agreed', blindPick: 'A' },
};
const fields = (r: ReturnType<typeof validateAutoDecisionInput>) =>
  r.ok ? [] : (r.error as { fields: string[]; code: string }).fields;
const code = (r: ReturnType<typeof validateAutoDecisionInput>) =>
  r.ok ? null : (r.error as { code: string }).code;

describe('validateAutoDecisionInput', () => {
  it('accepts a ceremony entry without audit and judgments with each audit status', () => {
    expect(validateAutoDecisionInput(ceremony).ok).toBe(true);
    expect(validateAutoDecisionInput(judgment).ok).toBe(true);
    for (const audit of [
      {
        status: 'agreed',
        blindPick: 'A',
        objection: { severity: 'non-blocking', text: 'minor' },
      },
      {
        status: 'escalated',
        blindPick: 'B',
        objection: { severity: 'blocking', text: 'x' },
        humanChoice: 'A',
      },
      { status: 'unavailable' },
      { status: 'off' },
    ])
      expect(validateAutoDecisionInput({ ...judgment, audit }).ok).toBe(true);
  });
  it('rejects caller-supplied autonomySource and ts: writer-stamped fields cannot be spoofed', () => {
    const a = validateAutoDecisionInput({ ...ceremony, autonomySource: 'flag' });
    expect(code(a)).toBe('AUTO_DECISION_INVALID');
    expect(fields(a)).toContain('autonomySource');
    expect(
      fields(validateAutoDecisionInput({ ...ceremony, ts: '2026-01-01T00:00:00.000Z' }))
    ).toContain('ts');
  });
  it('rejects irreversible and gate pause classes (they never auto-proceed)', () => {
    for (const pauseClass of ['irreversible', 'gate', 'Ceremony'])
      expect(fields(validateAutoDecisionInput({ ...ceremony, pauseClass }))).toContain(
        'pauseClass'
      );
  });
  it('rejects audit on ceremony and a judgment with no audit (SC9 denominator)', () => {
    expect(fields(validateAutoDecisionInput({ ...ceremony, audit: { status: 'off' } }))).toContain(
      'audit'
    );
    const { audit: _a, ...bare } = judgment;
    expect(fields(validateAutoDecisionInput(bare))).toContain('audit');
  });
  it('enforces chosen/blindPick/humanChoice consistency', () => {
    expect(fields(validateAutoDecisionInput({ ...judgment, chosen: 'C' }))).toContain('chosen');
    expect(
      fields(
        validateAutoDecisionInput({ ...judgment, audit: { status: 'agreed', blindPick: 'B' } })
      )
    ).toContain('audit');
    expect(
      fields(
        validateAutoDecisionInput({
          ...judgment,
          audit: { status: 'escalated', blindPick: 'B', humanChoice: 'B' },
        })
      )
    ).toContain('chosen');
    // escalated: the human may pick something outside the listed options
    expect(
      validateAutoDecisionInput({
        ...judgment,
        chosen: 'C',
        audit: { status: 'escalated', blindPick: 'B', humanChoice: 'C' },
      }).ok
    ).toBe(true);
    expect(
      fields(
        validateAutoDecisionInput({
          ...judgment,
          audit: {
            status: 'agreed',
            blindPick: 'A',
            objection: { severity: 'blocking', text: 'x' },
          },
        })
      )
    ).toContain('audit');
  });
  it('rejects malformed options', () => {
    expect(fields(validateAutoDecisionInput({ ...judgment, options: 'A,B' }))).toContain('options');
    expect(fields(validateAutoDecisionInput({ ...judgment, options: ['A', 'A'] }))).toContain(
      'options'
    );
    expect(fields(validateAutoDecisionInput({ ...judgment, options: ['A'] }))).toContain('options');
    expect(
      fields(
        validateAutoDecisionInput({
          ...judgment,
          options: Array.from({ length: 11 }, (_, i) => `o${i}`),
        })
      )
    ).toContain('options');
  });
  it.each(['2028', '2029', '061c', 'feff', '200b', '200e', '200f'])(
    'rejects U+%s (line/paragraph separator, invisible or bidi mark) in one-line and prose fields (review S6)',
    (hex) => {
      const ch = String.fromCodePoint(parseInt(hex, 16));
      expect(fields(validateAutoDecisionInput({ ...ceremony, skill: `a${ch}b` }))).toContain(
        'skill'
      );
      expect(fields(validateAutoDecisionInput({ ...ceremony, question: `q${ch}` }))).toContain(
        'question'
      );
    }
  );
  it.each([
    ['Persian ZWNJ', '\u0645\u06cc\u200c\u062e\u0648\u0627\u0647\u0645'],
    ['emoji ZWJ sequence', 'pair with \u{1F469}\u200d\u{1F4BB} on it'],
  ])('accepts %s (U+200C / U+200D are legitimate text, review N1)', (_name, s) => {
    expect(validateAutoDecisionInput({ ...ceremony, question: s }).ok).toBe(true);
    expect(validateAutoDecisionInput({ ...ceremony, rationale: s }).ok).toBe(true);
  });
  it('names invisible characters in the rejection message (review N1)', () => {
    const r = validateAutoDecisionInput({ ...ceremony, question: 'a\u200bb' });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.message).toMatch(/control, bidi or invisible characters/);
  });
  it('escapeUnsafeLogText escapes C1, bidi and separator characters as \\uXXXX', () => {
    expect(escapeUnsafeLogText('a\u202eb\u009bc\u2028d ok')).toBe('a\\u202eb\\u009bc\\u2028d ok');
  });
  it('rejects control and bidi characters that could spoof terminal output; allows newlines in prose', () => {
    expect(
      fields(validateAutoDecisionInput({ ...ceremony, question: 'ok\u001b[2Khidden' }))
    ).toContain('question');
    expect(
      fields(validateAutoDecisionInput({ ...ceremony, chosen: 'appr‮ove', options: ['appr‮ove'] }))
    ).toContain('chosen');
    expect(fields(validateAutoDecisionInput({ ...ceremony, skill: 'a\nb' }))).toContain('skill');
    expect(validateAutoDecisionInput({ ...ceremony, rationale: 'line 1\nline 2\tx' }).ok).toBe(
      true
    );
  });
  it('rejects blank and over-length text', () => {
    expect(fields(validateAutoDecisionInput({ ...ceremony, rationale: '   ' }))).toContain(
      'rationale'
    );
    expect(
      fields(
        validateAutoDecisionInput({
          ...ceremony,
          question: 'q'.repeat(AUTO_DECISION_LIMITS.question + 1),
        })
      )
    ).toContain('question');
  });
  it('rejects non-objects at the root', () => {
    for (const v of [null, [], 'x', 1])
      expect(fields(validateAutoDecisionInput(v))).toEqual(['(root)']);
  });
});

describe('parseAutoDecisionLine', () => {
  const stored = { ts: '2026-11-13T00:00:00.000Z', ...ceremony, autonomySource: 'user-config' };
  it('round-trips a stored entry', () => {
    const r = parseAutoDecisionLine(JSON.stringify(stored));
    expect(r.ok && r.value).toEqual(stored);
  });
  it('rejects bad JSON, a missing autonomySource, and a non-ISO ts', () => {
    expect(parseAutoDecisionLine('{not json').ok).toBe(false);
    const { autonomySource: _s, ...noSource } = stored;
    expect(parseAutoDecisionLine(JSON.stringify(noSource)).ok).toBe(false);
    expect(parseAutoDecisionLine(JSON.stringify({ ...stored, ts: 'yesterday' })).ok).toBe(false);
    expect(parseAutoDecisionLine(JSON.stringify({ ...stored, autonomySource: 'agent' })).ok).toBe(
      false
    );
  });
});

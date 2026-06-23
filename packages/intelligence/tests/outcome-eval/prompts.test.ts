import { describe, it, expect } from 'vitest';
import {
  OUTCOME_EVAL_SYSTEM_PROMPT,
  buildUserPrompt,
  PROMPT_FIELD_MAX_CHARS,
} from '../../src/outcome-eval/prompts.js';

describe('OUTCOME_EVAL_SYSTEM_PROMPT', () => {
  it('encodes the conservative-confidence posture', () => {
    const p = OUTCOME_EVAL_SYSTEM_PROMPT.toLowerCase();
    // high confidence requires naming a specific criterion
    expect(p).toContain('high');
    expect(p).toMatch(/specific|name|cite/);
    // default is medium
    expect(p).toContain('medium');
    // bias toward advisory / not blocking
    expect(p).toMatch(/advisory|caution|conservative/);
  });

  it('instructs the model not to emit authority', () => {
    expect(OUTCOME_EVAL_SYSTEM_PROMPT.toLowerCase()).toMatch(/do not|never/);
    expect(OUTCOME_EVAL_SYSTEM_PROMPT.toLowerCase()).toContain('authority');
  });
});

describe('buildUserPrompt', () => {
  it('embeds section, diff, and test output under labeled headings', () => {
    const out = buildUserPrompt('SECTION_BODY', 'DIFF_BODY', 'TEST_BODY');
    expect(out).toContain('SECTION_BODY');
    expect(out).toContain('DIFF_BODY');
    expect(out).toContain('TEST_BODY');
    expect(out).toMatch(/spec|criteria/i);
    expect(out).toMatch(/diff/i);
    expect(out).toMatch(/test/i);
  });

  it('truncates an over-long diff and testOutput with a marker (OE-SUG-1)', () => {
    const hugeDiff = 'D'.repeat(PROMPT_FIELD_MAX_CHARS + 5000);
    const hugeTest = 'T'.repeat(PROMPT_FIELD_MAX_CHARS + 5000);
    const out = buildUserPrompt('SECTION', hugeDiff, hugeTest);
    // The raw over-long bodies must NOT appear in full.
    expect(out).not.toContain(hugeDiff);
    expect(out).not.toContain(hugeTest);
    // A truncation marker is present.
    expect(out).toMatch(/truncated/i);
    // Each clamped field is bounded (allowing the marker + fences overhead).
    expect(out.length).toBeLessThan(2 * PROMPT_FIELD_MAX_CHARS + 2000);
  });

  it('fences diffs containing triple backticks without early fence-close (OE-SUG-1)', () => {
    const diffWithFence = 'before\n```\ncode inside\n```\nafter';
    const out = buildUserPrompt('SECTION', diffWithFence, 'tests pass');
    // The inner triple-backtick content survives verbatim.
    expect(out).toContain('code inside');
    // The outer fence is a 4-backtick fence, immune to inner ``` closing it.
    expect(out).toContain('````diff');
    expect(out).toContain('````');
  });
});

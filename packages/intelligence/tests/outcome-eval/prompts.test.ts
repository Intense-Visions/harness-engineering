import { describe, it, expect } from 'vitest';
import { OUTCOME_EVAL_SYSTEM_PROMPT, buildUserPrompt } from '../../src/outcome-eval/prompts.js';

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
});

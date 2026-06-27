import { describe, it, expect } from 'vitest';
import {
  ACCEPTANCE_EVAL_SYSTEM_PROMPT,
  buildUserPrompt,
  PROMPT_FIELD_MAX_CHARS,
} from '../../src/acceptance-eval/prompts.js';

describe('ACCEPTANCE_EVAL_SYSTEM_PROMPT', () => {
  it('encodes the conservative-confidence posture', () => {
    const p = ACCEPTANCE_EVAL_SYSTEM_PROMPT.toLowerCase();
    expect(p).toContain('high');
    expect(p).toMatch(/specific|name|cite/);
    expect(p).toContain('medium');
    expect(p).toMatch(/advisory|caution|conservative/);
  });

  it('instructs the model not to emit authority', () => {
    expect(ACCEPTANCE_EVAL_SYSTEM_PROMPT.toLowerCase()).toMatch(/do not|never/);
    expect(ACCEPTANCE_EVAL_SYSTEM_PROMPT.toLowerCase()).toContain('authority');
  });

  it('names the three responsibilities (measurability, criteria, coverage)', () => {
    const p = ACCEPTANCE_EVAL_SYSTEM_PROMPT.toLowerCase();
    expect(p).toMatch(/measurab/);
    expect(p).toMatch(/cover|test/);
  });
});

describe('buildUserPrompt', () => {
  it('embeds the section and test content under labeled headings', () => {
    const out = buildUserPrompt('SECTION_BODY', 'TEST_BODY');
    expect(out).toContain('SECTION_BODY');
    expect(out).toContain('TEST_BODY');
    expect(out).toMatch(/criteria|acceptance/i);
    expect(out).toMatch(/test/i);
  });

  it('tolerates omitted test content with a placeholder', () => {
    const out = buildUserPrompt('SECTION_BODY');
    expect(out).toContain('SECTION_BODY');
    expect(out).toMatch(/no test content|not provided|none/i);
  });

  it('truncates over-long test content with a marker', () => {
    const huge = 'T'.repeat(PROMPT_FIELD_MAX_CHARS + 5000);
    const out = buildUserPrompt('SECTION', huge);
    expect(out).not.toContain(huge);
    expect(out).toMatch(/truncated/i);
  });

  it('fences test content containing triple backticks without early close', () => {
    const withFence = 'before\n```\ncode inside\n```\nafter';
    const out = buildUserPrompt('SECTION', withFence);
    expect(out).toContain('code inside');
    expect(out).toContain('````');
  });
});

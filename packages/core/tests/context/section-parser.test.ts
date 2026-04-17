import { describe, it, expect } from 'vitest';
import { parseSections, extractLevel } from '../../src/context/section-parser';

const SAMPLE_SKILL_MD = `# Test Skill

> Summary line

## When to Use

- Use for testing

## Process

### Iron Law

Do the thing.

1. Step one
2. Step two

## Gates

- No skipping
- No vague tasks

## Success Criteria

- Tests pass
- Code compiles

## Session State

| Section | R | W |
| --- | --- | --- |
| data | Y | N |

## Harness Integration

- Run harness validate

## Examples

### Example 1

Some example content here.

## Evidence Requirements

Cite file:line references.

## Escalation

- If stuck, ask for help.

## Rationalizations to Reject

| Rationalization | Reality |
| --- | --- |
| "It's fine" | It's not |
`;

describe('parseSections', () => {
  it('parses all H2 sections from markdown', () => {
    const sections = parseSections(SAMPLE_SKILL_MD);
    const headings = sections.map((s) => s.heading);
    expect(headings).toContain('When to Use');
    expect(headings).toContain('Process');
    expect(headings).toContain('Gates');
    expect(headings).toContain('Success Criteria');
    expect(headings).toContain('Escalation');
  });

  it('classifies Process as level 1 (rules)', () => {
    const sections = parseSections(SAMPLE_SKILL_MD);
    const process = sections.find((s) => s.heading === 'Process');
    expect(process?.level).toBe(1);
  });

  it('classifies Gates as level 1 (rules)', () => {
    const sections = parseSections(SAMPLE_SKILL_MD);
    const gates = sections.find((s) => s.heading === 'Gates');
    expect(gates?.level).toBe(1);
  });

  it('classifies Success Criteria as level 2 (spec)', () => {
    const sections = parseSections(SAMPLE_SKILL_MD);
    const sc = sections.find((s) => s.heading === 'Success Criteria');
    expect(sc?.level).toBe(2);
  });

  it('classifies Examples as level 3 (source)', () => {
    const sections = parseSections(SAMPLE_SKILL_MD);
    const ex = sections.find((s) => s.heading === 'Examples');
    expect(ex?.level).toBe(3);
  });

  it('classifies Escalation as level 4 (errors)', () => {
    const sections = parseSections(SAMPLE_SKILL_MD);
    const esc = sections.find((s) => s.heading === 'Escalation');
    expect(esc?.level).toBe(4);
  });

  it('classifies Rationalizations to Reject as level 4 (errors)', () => {
    const sections = parseSections(SAMPLE_SKILL_MD);
    const rat = sections.find((s) => s.heading === 'Rationalizations to Reject');
    expect(rat?.level).toBe(4);
  });

  it('returns empty array for empty content', () => {
    expect(parseSections('')).toEqual([]);
    expect(parseSections('   ')).toEqual([]);
  });
});

describe('extractLevel', () => {
  it('returns only rules sections at level 1', () => {
    const result = extractLevel(SAMPLE_SKILL_MD, 1);
    expect(result).toContain('## Process');
    expect(result).toContain('## Gates');
    expect(result).not.toContain('## Examples');
    expect(result).not.toContain('## Escalation');
  });

  it('returns rules + spec sections at level 2', () => {
    const result = extractLevel(SAMPLE_SKILL_MD, 2);
    expect(result).toContain('## Process');
    expect(result).toContain('## Success Criteria');
    expect(result).not.toContain('## Examples');
  });

  it('returns rules + spec + source sections at level 3', () => {
    const result = extractLevel(SAMPLE_SKILL_MD, 3);
    expect(result).toContain('## Process');
    expect(result).toContain('## Success Criteria');
    expect(result).toContain('## Examples');
    expect(result).not.toContain('## Escalation');
  });

  it('returns everything except history at level 4', () => {
    const result = extractLevel(SAMPLE_SKILL_MD, 4);
    expect(result).toContain('## Escalation');
    expect(result).toContain('## Rationalizations to Reject');
  });

  it('returns full content unchanged at level 5', () => {
    const result = extractLevel(SAMPLE_SKILL_MD, 5);
    expect(result).toBe(SAMPLE_SKILL_MD);
  });

  it('preserves title and summary at all levels', () => {
    const result = extractLevel(SAMPLE_SKILL_MD, 1);
    expect(result).toContain('# Test Skill');
  });

  it('appends truncation notice when content is reduced', () => {
    const result = extractLevel(SAMPLE_SKILL_MD, 1);
    expect(result).toContain('<!-- context-budget: loaded at level 1/5');
  });

  it('handles empty content', () => {
    const result = extractLevel('', 3);
    expect(result).toBe('');
  });

  it('handles content with no H2 sections', () => {
    const result = extractLevel('# Just a title\n\nSome text.', 1);
    expect(result).toContain('# Just a title');
  });
});

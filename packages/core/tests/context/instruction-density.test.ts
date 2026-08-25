import { describe, it, expect } from 'vitest';
import {
  countImperativeInstructions,
  analyzeSkillInstructionDensity,
  DEFAULT_INSTRUCTION_BUDGET,
} from '../../src/context/instruction-density';

describe('countImperativeInstructions', () => {
  it('returns 0 for empty or whitespace content', () => {
    expect(countImperativeInstructions('')).toBe(0);
    expect(countImperativeInstructions('   \n  \n')).toBe(0);
  });

  it('counts numbered steps', () => {
    const md = `1. Do the first thing
2. Do the second thing
3) A paren-numbered step also counts`;
    expect(countImperativeInstructions(md)).toBe(3);
  });

  it('counts imperative-verb bullets but not descriptive bullets', () => {
    const md = `- Run the build
- Verify the output
- Existing JWT middleware handles auth
- Vendor lock-in is a risk`;
    // Only the "Run" and "Verify" bullets are imperative.
    expect(countImperativeInstructions(md)).toBe(2);
  });

  it('counts MUST/SHALL/REQUIRED directive lines', () => {
    const md = `Technical claims MUST cite evidence.
The system shall respond quickly.
This field is REQUIRED for the request.`;
    // "shall" lowercase is NOT counted (SCREAMING form only); MUST + REQUIRED are.
    expect(countImperativeInstructions(md)).toBe(2);
  });

  it('does not double-count a numbered imperative line', () => {
    expect(countImperativeInstructions('1. Run the build')).toBe(1);
  });

  it('ignores content inside fenced code blocks', () => {
    const md = `1. Real step
\`\`\`bash
Run this in the shell
1. not a real step
MUST not count
\`\`\`
2. Another real step`;
    expect(countImperativeInstructions(md)).toBe(2);
  });

  it('excludes plain prose', () => {
    const md = `This is a paragraph describing the design.
It has several sentences but no instructions.`;
    expect(countImperativeInstructions(md)).toBe(0);
  });
});

const SAMPLE = `# Sample Skill

> Summary line.

## Process

1. Run the setup
2. Verify the state

### Iron Law

You MUST not skip the gate.

## Examples

- Read the docs for context
- Descriptive bullet with no verb lead

## Escalation

- Stop and ask the human
`;

describe('analyzeSkillInstructionDensity', () => {
  it('reports one entry per packing level 1..5', () => {
    const report = analyzeSkillInstructionDensity(SAMPLE);
    expect(report.levels.map((l) => l.level)).toEqual([1, 2, 3, 4, 5]);
  });

  it('uses the default budget when none supplied', () => {
    const report = analyzeSkillInstructionDensity(SAMPLE);
    expect(report.budget).toBe(DEFAULT_INSTRUCTION_BUDGET);
  });

  it('is monotonic non-decreasing across cumulative levels', () => {
    const report = analyzeSkillInstructionDensity(SAMPLE);
    for (let i = 1; i < report.levels.length; i++) {
      expect(report.levels[i]!.instructionCount).toBeGreaterThanOrEqual(
        report.levels[i - 1]!.instructionCount
      );
    }
  });

  it('flags over-budget when budget is set below the level counts', () => {
    const report = analyzeSkillInstructionDensity(SAMPLE, 2);
    expect(report.maxLevelOverBudget).not.toBeNull();
    // The worst case is the highest over-budget level.
    expect(report.maxLevelOverBudget!.level).toBe(5);
    expect(report.maxLevelOverBudget!.overBudget).toBe(true);
  });

  it('returns null maxLevelOverBudget when every level is within budget', () => {
    const report = analyzeSkillInstructionDensity(SAMPLE, 1000);
    expect(report.maxLevelOverBudget).toBeNull();
    expect(report.levels.every((l) => !l.overBudget)).toBe(true);
  });

  it('handles empty content without throwing', () => {
    const report = analyzeSkillInstructionDensity('');
    expect(report.maxLevelOverBudget).toBeNull();
    expect(report.levels).toHaveLength(5);
  });
});

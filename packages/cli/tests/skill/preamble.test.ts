// packages/cli/tests/skill/preamble.test.ts
import { describe, it, expect } from 'vitest';
import { buildPreamble } from '../../src/commands/skill/preamble';

describe('buildPreamble', () => {
  it('includes complexity section when phases exist', () => {
    const preamble = buildPreamble({
      complexity: 'fast',
      phases: [
        { name: 'red', description: 'Write test', required: true },
        { name: 'refactor', description: 'Clean up', required: false },
      ],
    });
    expect(preamble).toContain('## Active Phases');
    expect(preamble).toContain('RED (required)');
    expect(preamble).toContain('~~REFACTOR~~ (skipped in fast mode)');
  });

  it('shows all phases in full mode', () => {
    const preamble = buildPreamble({
      complexity: 'thorough',
      phases: [
        { name: 'red', description: 'Write test', required: true },
        { name: 'refactor', description: 'Clean up', required: false },
      ],
    });
    expect(preamble).toContain('REFACTOR');
    expect(preamble).not.toContain('~~REFACTOR~~');
  });

  it('includes principles when provided', () => {
    const preamble = buildPreamble({
      principles: '## Code Quality\n- Explicit over implicit',
    });
    expect(preamble).toContain('## Project Principles');
    expect(preamble).toContain('Explicit over implicit');
  });

  it('includes phase re-entry info', () => {
    const preamble = buildPreamble({
      phase: 'hypothesize',
      priorState: 'Some debug state content',
    });
    expect(preamble).toContain('## Resuming at Phase: hypothesize');
    expect(preamble).toContain('Some debug state content');
  });

  it('includes party mode indicator', () => {
    const preamble = buildPreamble({ party: true });
    expect(preamble).toContain('## Party Mode: Active');
  });

  it('returns empty string when no options set', () => {
    const preamble = buildPreamble({});
    expect(preamble).toBe('');
  });

  describe('autonomous mode (SC7)', () => {
    it('injects the autonomous-decider section when autonomous is true', () => {
      const preamble = buildPreamble({ autonomous: true });
      expect(preamble).toContain('## Autonomous Decision-Making: Active');
      expect(preamble).toContain('there is no human in this session to answer questions');
    });

    it('includes the PR-flag safety valve heading (D9)', () => {
      const preamble = buildPreamble({ autonomous: true });
      expect(preamble).toContain('## Autonomous decisions requiring review');
      expect(preamble).toContain('strategy contradiction');
    });

    it('leads the output with the autonomous section, before Active Phases', () => {
      const preamble = buildPreamble({
        autonomous: true,
        complexity: 'thorough',
        phases: [{ name: 'red', description: 'Write test', required: true }],
      });
      const autonomousIdx = preamble.indexOf('## Autonomous Decision-Making: Active');
      const phasesIdx = preamble.indexOf('## Active Phases');
      expect(autonomousIdx).toBeGreaterThanOrEqual(0);
      expect(phasesIdx).toBeGreaterThan(autonomousIdx);
    });

    it('does not inject the autonomous section when the flag is absent', () => {
      const preamble = buildPreamble({ party: true });
      expect(preamble).not.toContain('## Autonomous Decision-Making');
    });
  });
});

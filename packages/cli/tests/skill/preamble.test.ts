// packages/cli/tests/skill/preamble.test.ts
import { describe, it, expect } from 'vitest';
import { buildPreamble } from '../../src/commands/skill/preamble';

describe('buildPreamble', () => {
  it('includes complexity section when phases exist', () => {
    const preamble = buildPreamble({
      complexity: 'light',
      phases: [
        { name: 'red', description: 'Write test', required: true },
        { name: 'refactor', description: 'Clean up', required: false },
      ],
    });
    expect(preamble).toContain('## Active Phases');
    expect(preamble).toContain('RED (required)');
    expect(preamble).toContain('~~REFACTOR~~ (skipped in light mode)');
  });

  it('shows all phases in full mode', () => {
    const preamble = buildPreamble({
      complexity: 'full',
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
});

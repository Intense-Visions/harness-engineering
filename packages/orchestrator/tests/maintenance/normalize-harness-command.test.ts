import { describe, it, expect } from 'vitest';
import { normalizeHarnessCommand } from '../../src/orchestrator';

describe('normalizeHarnessCommand', () => {
  it('prepends the harness binary to a bare subcommand', () => {
    expect(normalizeHarnessCommand(['check-arch'])).toEqual(['harness', 'check-arch']);
  });

  it('prepends to a multi-arg subcommand', () => {
    expect(normalizeHarnessCommand(['graph', 'scan'])).toEqual(['harness', 'graph', 'scan']);
  });

  it('does not double-prefix a command that already starts with harness (main-sync)', () => {
    expect(normalizeHarnessCommand(['harness', 'sync-main', '--json'])).toEqual([
      'harness',
      'sync-main',
      '--json',
    ]);
  });

  it('returns an empty argv unchanged', () => {
    expect(normalizeHarnessCommand([])).toEqual([]);
  });
});

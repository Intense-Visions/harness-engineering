import { describe, it, expect } from 'vitest';
import { buildArgumentHint } from '../../src/slash-commands/argument-hint';

describe('buildArgumentHint', () => {
  it('returns empty string for no args', () => {
    expect(buildArgumentHint([])).toBe('');
  });

  it('formats a required arg', () => {
    expect(
      buildArgumentHint([{ name: 'target', description: 'Target path', required: true }])
    ).toBe('--target <target>');
  });

  it('formats an optional arg', () => {
    expect(
      buildArgumentHint([{ name: 'path', description: 'Project path', required: false }])
    ).toBe('[--path <path>]');
  });

  it('formats mixed required and optional args', () => {
    expect(
      buildArgumentHint([
        { name: 'target', description: 'Target', required: true },
        { name: 'path', description: 'Path', required: false },
      ])
    ).toBe('--target <target> [--path <path>]');
  });

  // #1969: skill.yaml cli.args names may already carry their leading `--`
  // (every fleet skill does). The hint must not double the prefix into
  // `[----fleets <--fleets>]`.
  it('does not double the dash prefix when the arg name already carries it', () => {
    expect(
      buildArgumentHint([
        { name: '--fleets', description: 'Fleets', required: false },
        { name: '--target', description: 'Target', required: true },
      ])
    ).toBe('[--fleets <fleets>] --target <target>');
  });
});

import { describe, it, expect } from 'vitest';
import { createMaintenanceCommand } from '../../src/commands/maintenance';

describe('maintenance command', () => {
  it('registers list, show, and run subcommands', () => {
    const names = createMaintenanceCommand().commands.map((c) => c.name());
    expect(names).toEqual(expect.arrayContaining(['list', 'show', 'run']));
  });
  it('run exposes --all/--only/--skip/--fix/--concurrency/--json/--path', () => {
    const run = createMaintenanceCommand().commands.find((c) => c.name() === 'run')!;
    const flags = run.options.map((o) => o.long);
    expect(flags).toEqual(
      expect.arrayContaining([
        '--all',
        '--only',
        '--skip',
        '--fix',
        '--concurrency',
        '--json',
        '--path',
      ])
    );
  });
});

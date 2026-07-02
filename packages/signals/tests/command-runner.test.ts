import { describe, it, expect } from 'vitest';
import { defaultCommandRunner, type CommandRunner } from '../src/command-runner';

describe('defaultCommandRunner', () => {
  it('runs a command and returns trimmed stdout', async () => {
    const out = await defaultCommandRunner('node', ['-e', 'process.stdout.write("hi\\n")']);
    expect(out).toBe('hi');
  });
  it('rejects when the command exits non-zero', async () => {
    await expect(defaultCommandRunner('node', ['-e', 'process.exit(3)'])).rejects.toBeInstanceOf(
      Error
    );
  });
  it('satisfies the CommandRunner type', () => {
    const r: CommandRunner = defaultCommandRunner;
    expect(typeof r).toBe('function');
  });
});

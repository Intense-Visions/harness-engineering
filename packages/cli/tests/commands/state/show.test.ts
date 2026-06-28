import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createShowCommand } from '../../../src/commands/state/show';

function seed(dir: string) {
  fs.mkdirSync(path.join(dir, '.harness'), { recursive: true });
  const legacy = {
    schemaVersion: 1,
    position: { phase: 'execute', task: 'Task 15' },
    decisions: [{ date: '2026-06-27', decision: 'cli reads', context: 'harness-execution' }],
    blockers: [],
    progress: { 'Task 14': 'complete' },
  };
  fs.writeFileSync(path.join(dir, '.harness', 'state.json'), JSON.stringify(legacy));
  return legacy;
}

describe('state show CLI (R4 parity)', () => {
  const logs: string[] = [];
  let origLog: typeof console.log;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logs.length = 0;
    origLog = console.log;
    console.log = (...a: unknown[]) => {
      logs.push(a.map(String).join(' '));
    };
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);
  });

  afterEach(() => {
    console.log = origLog;
    exitSpy.mockRestore();
  });

  it('prints populated legacy state fields in text mode via snapshot projection', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'state-show-cli-'));
    try {
      seed(tmp);
      const cmd = createShowCommand();
      await expect(cmd.parseAsync(['--path', tmp], { from: 'user' })).rejects.toThrow('exit:0');
      const out = logs.join('\n');
      expect(out).toContain('Schema Version: 1');
      expect(out).toContain('execute');
      expect(out).toContain('Task 15');
      expect(out).toContain('Task 14: complete');
      expect(out).toContain('Decisions: 1');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('prints the same HarnessState JSON in --quiet mode (parity)', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'state-show-cli-q-'));
    try {
      const legacy = seed(tmp);
      const program = new Command();
      program.option('--quiet');
      program.addCommand(createShowCommand());
      await expect(
        program.parseAsync(['show', '--path', tmp, '--quiet'], { from: 'user' })
      ).rejects.toThrow('exit:0');
      // --quiet prints a single JSON.stringify(state) line.
      const parsed = JSON.parse(logs.join(''));
      expect(parsed).toEqual(legacy);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

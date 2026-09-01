import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Command } from 'commander';
import { createDistortionCommand } from '../../src/commands/distortion';

async function runCommand(args: string[]): Promise<void> {
  const parent = new Command();
  parent.option('--json', 'JSON output');
  parent.addCommand(createDistortionCommand());
  parent.exitOverride();
  await parent.parseAsync(['node', 'test', 'distortion', ...args]);
}

/** Seeded observations: `stated-constraints` is load-bearing for implementation. */
function seededObservations(): string {
  const lines: string[] = [];
  for (let i = 0; i < 3; i += 1) {
    lines.push(
      JSON.stringify({
        runId: `r${i}`,
        taskClass: 'implementation',
        ablation: { kind: 'baseline' },
        outcome: { rework: 1 },
      })
    );
    lines.push(
      JSON.stringify({
        runId: `r${i}`,
        taskClass: 'implementation',
        ablation: { kind: 'ablated', informationClass: 'stated-constraints' },
        outcome: { rework: 6 },
      })
    );
    lines.push(
      JSON.stringify({
        runId: `r${i}`,
        taskClass: 'implementation',
        ablation: { kind: 'ablated', informationClass: 'conversational-history' },
        outcome: { rework: 1 },
      })
    );
  }
  return lines.join('\n') + '\n';
}

let tmpDir: string;
let cwdSpy: ReturnType<typeof vi.spyOn>;
let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'distortion-'));
  cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  cwdSpy.mockRestore();
  vi.restoreAllMocks();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('harness distortion fit', () => {
  it('reads a fixture observations file end-to-end and writes a distortion model (WIRED)', async () => {
    const metricsDir = path.join(tmpDir, '.harness', 'metrics');
    fs.mkdirSync(metricsDir, { recursive: true });
    fs.writeFileSync(path.join(metricsDir, 'ablation-replays.jsonl'), seededObservations());

    await runCommand(['fit']);

    const modelPath = path.join(metricsDir, 'distortion-model.json');
    expect(fs.existsSync(modelPath)).toBe(true);
    const model = JSON.parse(fs.readFileSync(modelPath, 'utf-8'));

    expect(model.version).toBe('1.0.0');
    expect(model.runsObserved).toBe(3);
    expect(model.taskClasses).toEqual(['implementation']);

    const constraints = model.cells.find(
      (c: { taskClass: string; informationClass: string }) =>
        c.taskClass === 'implementation' && c.informationClass === 'stated-constraints'
    );
    const history = model.cells.find(
      (c: { taskClass: string; informationClass: string }) =>
        c.taskClass === 'implementation' && c.informationClass === 'conversational-history'
    );
    expect(constraints.sensitivity).toBe('sensitive');
    expect(history.sensitivity).toBe('insensitive');
  });

  it('emits the model as JSON with the global --json flag', async () => {
    const metricsDir = path.join(tmpDir, '.harness', 'metrics');
    fs.mkdirSync(metricsDir, { recursive: true });
    fs.writeFileSync(path.join(metricsDir, 'ablation-replays.jsonl'), seededObservations());

    await runCommand(['--json', 'fit']);

    const out = logSpy.mock.calls.map((c) => c[0]).join('\n');
    const model = JSON.parse(out);
    expect(model.taskClasses).toEqual(['implementation']);
    // --json does not write a file.
    expect(fs.existsSync(path.join(metricsDir, 'distortion-model.json'))).toBe(false);
  });

  it('honors --threshold when classifying a small delta', async () => {
    const metricsDir = path.join(tmpDir, '.harness', 'metrics');
    fs.mkdirSync(metricsDir, { recursive: true });
    // A deterministic +5 delta becomes inconclusive/insensitive under a huge threshold.
    fs.writeFileSync(path.join(metricsDir, 'ablation-replays.jsonl'), seededObservations());

    await runCommand(['--json', 'fit', '--threshold', '100']);
    const model = JSON.parse(logSpy.mock.calls.map((c) => c[0]).join('\n'));
    const constraints = model.cells.find(
      (c: { informationClass: string }) => c.informationClass === 'stated-constraints'
    );
    expect(constraints.sensitivity).toBe('insensitive');
    expect(model.threshold).toBe(100);
  });

  it('warns and writes nothing when no observations file exists', async () => {
    await runCommand(['fit']);
    expect(fs.existsSync(path.join(tmpDir, '.harness', 'metrics', 'distortion-model.json'))).toBe(
      false
    );
  });
});

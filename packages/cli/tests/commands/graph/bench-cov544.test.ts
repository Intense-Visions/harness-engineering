import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Command } from 'commander';
import { formatAnswerQuality, createBenchCommand } from '../../../src/commands/graph/bench';
import type { AnswerQualityAxis } from '../../../src/commands/graph/bench';
import { runScan } from '../../../src/commands/graph/scan';

describe('formatAnswerQuality', () => {
  it('renders the skipped axis', () => {
    const axis: AnswerQualityAxis = { status: 'skipped', advisory: true, note: '' };
    expect(formatAnswerQuality(axis)).toMatch(/not run/);
  });

  it('renders the inconclusive axis', () => {
    const axis: AnswerQualityAxis = { status: 'inconclusive', advisory: true, note: '' };
    expect(formatAnswerQuality(axis)).toMatch(/INCONCLUSIVE/);
  });

  it('renders a measured axis with a decidable rate and a null (n/a) rate', () => {
    const axis: AnswerQualityAxis = {
      status: 'measured',
      advisory: true,
      note: '',
      graph: { sufficient: 3, insufficient: 1, inconclusive: 0, total: 4, sufficientRate: 0.75 },
      naive: { sufficient: 0, insufficient: 0, inconclusive: 2, total: 2, sufficientRate: null },
    };
    const out = formatAnswerQuality(axis);
    expect(out).toMatch(/75% sufficient/);
    expect(out).toMatch(/n\/a \(no decidable grades\)/);
  });
});

interface RunOutcome {
  exitCode: number | null;
  out: string[];
  err: string[];
}

async function runBench(args: string[], globalFlags: string[] = []): Promise<RunOutcome> {
  const program = new Command();
  program.option('--json');
  program.option('--config <path>');
  program.addCommand(createBenchCommand());

  let exitCode: number | null = null;
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((c?: number) => {
    exitCode = c ?? 0;
    throw new Error(`__exit__:${exitCode}`);
  }) as never);
  const out: string[] = [];
  const err: string[] = [];
  const logSpy = vi.spyOn(console, 'log').mockImplementation((m?: unknown) => out.push(String(m)));
  const errSpy = vi
    .spyOn(console, 'error')
    .mockImplementation((m?: unknown) => err.push(String(m)));
  try {
    await program.parseAsync([...globalFlags, 'bench', ...args], { from: 'user' });
  } catch (e) {
    if (!(e instanceof Error) || !e.message.startsWith('__exit__')) throw e;
  } finally {
    exitSpy.mockRestore();
    logSpy.mockRestore();
    errSpy.mockRestore();
  }
  return { exitCode, out, err };
}

describe('bench command — abstention (no graph)', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-cmd-'));
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('exits ZERO_DENOMINATOR and prints a scan instruction when no graph exists', async () => {
    const cfg = path.join(tmp, 'harness.config.json');
    fs.writeFileSync(cfg, '{}');
    const { exitCode, err } = await runBench(['--config', cfg]);
    expect(exitCode).toBe(3);
    expect(err.join('\n')).toMatch(/graph scan/i);
  });

  it('handles --judge with no reachable provider and still abstains', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.HARNESS_ANALYSIS_BASE_URL;
    const cfg = path.join(tmp, 'harness.config.json');
    fs.writeFileSync(cfg, '{}');
    const { exitCode } = await runBench(['--config', cfg, '--judge', '--top', 'not-a-number']);
    expect(exitCode).toBe(3);
  });
});

describe('bench command — emit on a real graph', () => {
  let dir: string;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-graph-'));
    const src = path.join(dir, 'src');
    fs.mkdirSync(src, { recursive: true });
    fs.writeFileSync(
      path.join(src, 'b.ts'),
      `export const BAR = 42;\nexport function bar() { return BAR; }\n`
    );
    fs.writeFileSync(
      path.join(src, 'a.ts'),
      `import { bar, BAR } from './b.js';\nexport function foo() { return bar() + BAR; }\n`
    );
    fs.writeFileSync(path.join(dir, 'harness.config.json'), '{}');
    await runScan(dir);
  }, 60_000);

  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('writes the machine-readable result to --out and prints a text report', async () => {
    const outFile = path.join(dir, 'nested', 'result.json');
    const cfg = path.join(dir, 'harness.config.json');
    const { exitCode, out } = await runBench(['--config', cfg, '--out', outFile, '--top', '1']);
    expect(exitCode).toBeNull();
    expect(fs.existsSync(outFile)).toBe(true);
    const written = JSON.parse(fs.readFileSync(outFile, 'utf-8'));
    expect(written.ok).toBe(true);
    // default (no --json): human report printed
    expect(out.join('\n')).toMatch(/issue #1271/);
  }, 60_000);

  it('emits JSON to stdout when --json is set globally', async () => {
    const cfg = path.join(dir, 'harness.config.json');
    const { exitCode, out } = await runBench(['--top', '1', '--config', cfg], ['--json']);
    expect(exitCode).toBeNull();
    const parsed = JSON.parse(out.join('\n'));
    expect(parsed.ok).toBe(true);
    expect(parsed.overall).toBeDefined();
  }, 60_000);
});

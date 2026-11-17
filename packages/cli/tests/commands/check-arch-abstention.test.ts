/**
 * #2268: a collector that throws (or abstains) used to reach `diff()` and the
 * baseline writer as a plain `value: 0`. Against a baseline of N > 0 that 0
 * reads as an improvement: the category's known violations are reported as
 * "resolved", and `--update-baseline` writes the 0 down, permanently discarding
 * the tracked allowlist for that category.
 *
 * These tests drive the REAL `runAll` (so its rejection branch is exercised)
 * over stub collectors, through the real `runCheckArch` / command action.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Collector, MetricResult } from '@harness-engineering/core';

const stubs = vi.hoisted(() => ({ collectors: [] as unknown[] }));

vi.mock('@harness-engineering/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@harness-engineering/core')>();
  return {
    ...actual,
    runAll: (config: Parameters<typeof actual.runAll>[0], rootDir: string) =>
      actual.runAll(config, rootDir, stubs.collectors as Collector[]),
  };
});

import { createCheckArchCommand, runCheckArch } from '../../src/commands/check-arch';

/** A collector that measured real work: module-size with one 5-LOC module. */
function measuredModuleSize(value: number): Collector {
  return {
    category: 'module-size',
    getRules: () => [],
    collect: async (): Promise<MetricResult[]> => [
      {
        category: 'module-size',
        scope: 'src',
        value,
        violations: [],
        metadata: { fileCount: 1, totalLoc: value },
      },
    ],
  };
}

/** A collector that crashes; `runAll` substitutes `{ value: 0, metadata: { error } }`. */
function crashing(category: Collector['category']): Collector {
  return {
    category,
    getRules: () => [],
    collect: async () => {
      throw new Error(`${category} exploded`);
    },
  };
}

const SEEDED = {
  version: 1,
  updatedAt: '2026-01-01T00:00:00.000Z',
  updatedFrom: 'seed',
  metrics: {
    complexity: { value: 40, violationIds: ['cx-1', 'cx-2'] },
    'module-size': { value: 10, violationIds: [] },
  },
};

let tmpDir: string;
let configPath: string;
let baselinePath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-arch-2268-'));
  configPath = path.join(tmpDir, 'harness.config.json');
  baselinePath = path.join(tmpDir, '.harness', 'arch', 'baselines.json');
  fs.writeFileSync(configPath, JSON.stringify({ version: 1, architecture: { enabled: true } }));
  fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
  fs.writeFileSync(baselinePath, JSON.stringify(SEEDED));
  stubs.collectors = [crashing('complexity'), measuredModuleSize(5)];
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('check-arch abstention channel (#2268)', () => {
  it('reports a crashed collector as abstained, never as resolved violations', async () => {
    const result = await runCheckArch({ cwd: tmpDir, configPath });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.mode).toBe('baseline');
    // The crashed category's known violations must NOT be celebrated as fixed.
    expect(result.value.resolvedViolations).not.toContain('cx-1');
    expect(result.value.resolvedViolations).not.toContain('cx-2');
    expect(result.value.abstainedCategories).toEqual(['complexity']);
    // The measurement still carries the crash so `--json` can show it.
    const cx = result.value.measurements?.find((m) => m.category === 'complexity');
    expect(cx?.metadata?.error).toMatch(/complexity exploded/);
  });

  it('--update-baseline leaves a crashed category untouched and still updates a measured one', async () => {
    const result = await runCheckArch({ cwd: tmpDir, configPath, updateBaseline: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.baselineUpdated).toBe(true);

    const written = JSON.parse(fs.readFileSync(baselinePath, 'utf-8'));
    // Crashed: unchanged — the tracked allowlist survives.
    expect(written.metrics.complexity).toEqual({ value: 40, violationIds: ['cx-1', 'cx-2'] });
    // Positive control: the measured category really was rewritten (10 → 5).
    expect(written.metrics['module-size']).toEqual({ value: 5, violationIds: [] });
    expect(result.value.abstainedCategories).toEqual(['complexity']);
    expect(result.value.warning).toMatch(/complexity/);
  });

  describe('exit codes', () => {
    let mockExit: ReturnType<typeof vi.spyOn>;
    let mockLog: ReturnType<typeof vi.spyOn>;
    const exitError = new Error('process.exit');

    beforeEach(() => {
      mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw exitError;
      }) as never);
      mockLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    });
    afterEach(() => {
      mockExit.mockRestore();
      mockLog.mockRestore();
    });

    async function run(args: string[]): Promise<void> {
      const program = new Command();
      program.option('--json', 'JSON output');
      program.option('-c, --config <path>', 'Config');
      program.addCommand(createCheckArchCommand());
      try {
        await program.parseAsync(['node', 'harness', '-c', configPath, ...args]);
      } catch (e) {
        if (e !== exitError) throw e;
      }
    }

    it('exits ZERO_DENOMINATOR (3) when every category abstained', async () => {
      stubs.collectors = [crashing('complexity'), crashing('module-size')];
      await run(['--json', 'check-arch']);
      expect(mockExit).toHaveBeenCalledWith(3);
      const out = JSON.parse(String(mockLog.mock.calls[0]?.[0]));
      expect(out.abstainedCategories.sort()).toEqual(['complexity', 'module-size']);
      // The JSON verdict agrees with the exit code instead of reading as a pass.
      expect(out.verdict).toBe('abstained');
      expect(out.abstained).toBe(true);
    });

    it('plain output says abstained, never "validation passed", with the same exit code', async () => {
      stubs.collectors = [crashing('complexity'), crashing('module-size')];
      const mockWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const mockErr = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        await run(['check-arch']);
        expect(mockExit).toHaveBeenCalledWith(3);
        const printed = [...mockLog.mock.calls, ...mockWarn.mock.calls, ...mockErr.mock.calls]
          .map((c) => c.map(String).join(' '))
          .join('\n');
        expect(printed).toMatch(/abstained/i);
        expect(printed).not.toMatch(/validation passed/i);
      } finally {
        mockWarn.mockRestore();
        mockErr.mockRestore();
      }
    });

    it('a measured, clean run reports verdict "passed" in --json (positive control)', async () => {
      await run(['--json', 'check-arch']);
      expect(mockExit).toHaveBeenCalledWith(0);
      const out = JSON.parse(String(mockLog.mock.calls[0]?.[0]));
      expect(out.verdict).toBe('passed');
      expect(out.abstained).toBe(false);
    });

    it('a partial abstention does not abstain the whole run (positive control)', async () => {
      await run(['check-arch']);
      expect(mockExit).toHaveBeenCalledWith(0);
    });
  });
});

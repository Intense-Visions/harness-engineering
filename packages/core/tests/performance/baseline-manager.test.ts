import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BaselineManager } from '../../src/performance/baseline-manager';
import type { BaselinesFile, BenchmarkResult } from '../../src/performance/types';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('BaselineManager', () => {
  let tmpDir: string;
  let manager: BaselineManager;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'baseline-manager-'));
    manager = new BaselineManager(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('load()', () => {
    it('returns null when baselines file does not exist', () => {
      expect(manager.load()).toBeNull();
    });

    it('loads a valid baselines file', () => {
      const baselines: BaselinesFile = {
        version: 1,
        updatedAt: '2026-03-19T00:00:00.000Z',
        updatedFrom: 'abc123',
        benchmarks: {
          'parse.bench.ts::parse large file': {
            opsPerSec: 80,
            meanMs: 12.5,
            p99Ms: 25.0,
            marginOfError: 0.03,
          },
        },
      };
      mkdirSync(join(tmpDir, '.harness', 'perf'), { recursive: true });
      writeFileSync(join(tmpDir, '.harness', 'perf', 'baselines.json'), JSON.stringify(baselines));

      const result = manager.load();
      expect(result).toEqual(baselines);
    });

    it('returns null for invalid JSON', () => {
      mkdirSync(join(tmpDir, '.harness', 'perf'), { recursive: true });
      writeFileSync(join(tmpDir, '.harness', 'perf', 'baselines.json'), 'not-json{{{');
      expect(manager.load()).toBeNull();
    });
  });

  describe('save()', () => {
    it('saves benchmark results to disk', () => {
      const results: BenchmarkResult[] = [
        {
          file: 'parse.bench.ts',
          name: 'parse large file',
          opsPerSec: 80,
          meanMs: 12.5,
          p99Ms: 25.0,
          marginOfError: 0.03,
        },
      ];

      manager.save(results, 'def456');

      const raw = readFileSync(join(tmpDir, '.harness', 'perf', 'baselines.json'), 'utf-8');
      const written = JSON.parse(raw) as BaselinesFile;

      expect(written.version).toBe(1);
      expect(written.updatedFrom).toBe('def456');
      expect(written.updatedAt).toBeTruthy();
      expect(written.benchmarks['parse.bench.ts::parse large file']).toEqual({
        opsPerSec: 80,
        meanMs: 12.5,
        p99Ms: 25.0,
        marginOfError: 0.03,
      });
    });

    it('updates existing baselines preserving other entries', () => {
      const existing: BaselinesFile = {
        version: 1,
        updatedAt: '2026-03-18T00:00:00.000Z',
        updatedFrom: 'old',
        benchmarks: {
          'parse.bench.ts::parse small': {
            opsPerSec: 500,
            meanMs: 2.0,
            p99Ms: 4.0,
            marginOfError: 0.02,
          },
          'render.bench.ts::render': {
            opsPerSec: 200,
            meanMs: 5.0,
            p99Ms: 10.0,
            marginOfError: 0.04,
          },
        },
      };
      mkdirSync(join(tmpDir, '.harness', 'perf'), { recursive: true });
      writeFileSync(join(tmpDir, '.harness', 'perf', 'baselines.json'), JSON.stringify(existing));

      const results: BenchmarkResult[] = [
        {
          file: 'parse.bench.ts',
          name: 'parse small',
          opsPerSec: 555,
          meanMs: 1.8,
          p99Ms: 3.5,
          marginOfError: 0.02,
        },
      ];
      manager.save(results, 'new123');

      const written = JSON.parse(
        readFileSync(join(tmpDir, '.harness', 'perf', 'baselines.json'), 'utf-8')
      ) as BaselinesFile;
      expect(written.benchmarks['parse.bench.ts::parse small']!.opsPerSec).toBe(555);
      expect(written.benchmarks['render.bench.ts::render']!.opsPerSec).toBe(200);
      expect(written.updatedFrom).toBe('new123');
    });
  });

  describe('prune()', () => {
    it('removes entries whose file prefix does not match', () => {
      const existing: BaselinesFile = {
        version: 1,
        updatedAt: '',
        updatedFrom: '',
        benchmarks: {
          'a.bench.ts::keep': { opsPerSec: 1, meanMs: 1, p99Ms: 1, marginOfError: 0 },
          'b.bench.ts::remove': { opsPerSec: 1, meanMs: 1, p99Ms: 1, marginOfError: 0 },
        },
      };
      mkdirSync(join(tmpDir, '.harness', 'perf'), { recursive: true });
      writeFileSync(join(tmpDir, '.harness', 'perf', 'baselines.json'), JSON.stringify(existing));

      manager.prune(['a.bench.ts']);

      const written = JSON.parse(
        readFileSync(join(tmpDir, '.harness', 'perf', 'baselines.json'), 'utf-8')
      ) as BaselinesFile;
      expect(written.benchmarks['a.bench.ts::keep']).toBeDefined();
      expect(written.benchmarks['b.bench.ts::remove']).toBeUndefined();
    });

    it('does nothing when baselines file does not exist', () => {
      expect(() => manager.prune(['a.bench.ts'])).not.toThrow();
    });
  });
});

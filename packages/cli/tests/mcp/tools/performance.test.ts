import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkPerformanceDefinition,
  getPerfBaselinesDefinition,
  updatePerfBaselinesDefinition,
  getCriticalPathsDefinition,
  handleCheckPerformance,
  handleGetPerfBaselines,
  handleUpdatePerfBaselines,
  handleGetCriticalPaths,
} from '../../../src/mcp/tools/performance';

// Behavior characterization of the four performance MCP tool handlers.
//
// Before this file the tool was only smoke-tested at the server level
// (`names.toContain('check_performance')`); none of the handler behavior —
// baseline round-trips, critical-path resolution, the check-type routing, or
// the shared error envelope — was asserted. These tests exercise the handlers
// against real temp projects.
//
// Assumptions made: coverage authored via the test-fleet tdd/test-craft flow;
// the knowledge graph was unavailable at selection time (static-analysis
// fallback), so graph-augmented code paths are exercised via the "graph not
// available — proceed without" branch that the handlers already tolerate.

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'perf-tool-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Parse the JSON payload out of a successful MCP tool response. */
function payload(res: { content: Array<{ text: string }>; isError?: boolean }) {
  expect(res.isError).toBeFalsy();
  return JSON.parse(res.content[0].text);
}

describe('performance tool definitions', () => {
  it('check_performance declares its name, path, and the type enum', () => {
    expect(checkPerformanceDefinition.name).toBe('check_performance');
    expect(checkPerformanceDefinition.inputSchema.required).toContain('path');
    expect(checkPerformanceDefinition.inputSchema.properties.type.enum).toEqual([
      'structural',
      'coupling',
      'size',
      'all',
    ]);
  });

  it('the baseline + critical-path tools declare stable names and required inputs', () => {
    expect(getPerfBaselinesDefinition.name).toBe('get_perf_baselines');
    expect(getPerfBaselinesDefinition.inputSchema.required).toEqual(['path']);

    expect(updatePerfBaselinesDefinition.name).toBe('update_perf_baselines');
    expect(updatePerfBaselinesDefinition.inputSchema.required).toEqual([
      'path',
      'commitHash',
      'results',
    ]);

    expect(getCriticalPathsDefinition.name).toBe('get_critical_paths');
    expect(getCriticalPathsDefinition.inputSchema.required).toEqual(['path']);
  });
});

describe('handleGetPerfBaselines', () => {
  it('returns an empty default baselines file when none exists on disk', async () => {
    const res = await handleGetPerfBaselines({ path: dir });
    const baselines = payload(res);
    expect(baselines).toEqual({
      version: 1,
      updatedAt: '',
      updatedFrom: '',
      benchmarks: {},
    });
  });

  it('returns an error envelope (never throws) on an invalid path', async () => {
    // sanitizePath rejects the filesystem root; the handler must catch it.
    const res = await handleGetPerfBaselines({ path: '/' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('Error:');
  });
});

describe('handleUpdatePerfBaselines', () => {
  it('persists benchmark results keyed by file::name and round-trips on read', async () => {
    const results = [
      {
        name: 'parse-large-file',
        file: 'src/parser.ts',
        opsPerSec: 1200,
        meanMs: 0.83,
        p99Ms: 1.1,
        marginOfError: 0.02,
      },
    ];

    const updateRes = await handleUpdatePerfBaselines({
      path: dir,
      commitHash: 'abc123',
      results,
    });
    const saved = payload(updateRes);
    expect(saved.updatedFrom).toBe('abc123');
    expect(saved.benchmarks['src/parser.ts::parse-large-file']).toMatchObject({
      opsPerSec: 1200,
      meanMs: 0.83,
      p99Ms: 1.1,
      marginOfError: 0.02,
    });

    // The write is real: a subsequent read observes the same benchmark.
    const readBack = payload(await handleGetPerfBaselines({ path: dir }));
    expect(readBack.benchmarks['src/parser.ts::parse-large-file'].opsPerSec).toBe(1200);
    // And it landed at the documented location.
    const onDisk = JSON.parse(
      readFileSync(join(dir, '.harness', 'perf', 'baselines.json'), 'utf-8')
    );
    expect(onDisk.updatedFrom).toBe('abc123');
  });
});

describe('handleGetCriticalPaths', () => {
  it('reports zero entries for a project with no @perf-critical annotations', async () => {
    writeFileSync(join(dir, 'plain.ts'), 'export const add = (a: number, b: number) => a + b;\n');
    const set = payload(await handleGetCriticalPaths({ path: dir }));
    expect(set.stats.total).toBe(0);
    expect(set.entries).toEqual([]);
  });

  it('surfaces functions carrying a @perf-critical annotation', async () => {
    writeFileSync(
      join(dir, 'hot.ts'),
      ['// @perf-critical', 'export function hotLoop(): void {', '  /* ... */', '}', ''].join('\n')
    );
    const set = payload(await handleGetCriticalPaths({ path: dir }));
    expect(set.stats.annotated).toBeGreaterThan(0);
    expect(set.entries.some((e: { file: string }) => e.file.endsWith('hot.ts'))).toBe(true);
  });
});

describe('handleCheckPerformance', () => {
  it('analyzes a project with a resolvable entry point and returns a JSON report', async () => {
    // A conventional src/index.ts + package.json is enough for entry-point
    // resolution; the analyzer then runs and returns a report payload.
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'package.json'), '{}');
    writeFileSync(
      join(dir, 'src', 'index.ts'),
      'export function a(x: number): number {\n  return x + 1;\n}\n'
    );
    const res = await handleCheckPerformance({ path: dir, type: 'size' });
    expect(res.isError).toBeFalsy();
    expect(() => JSON.parse(res.content[0].text)).not.toThrow();
  });

  it('returns an error envelope when entry points cannot be resolved', async () => {
    // A bare directory has no resolvable entry point; the handler reports the
    // failure through the shared error envelope rather than throwing.
    const res = await handleCheckPerformance({ path: dir, type: 'all' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('Could not resolve entry points');
  });

  it('returns an error envelope (never throws) on an invalid path', async () => {
    const res = await handleCheckPerformance({ path: '/', type: 'all' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('Error:');
  });
});

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildCostReport } from '../src/cost-per-pr';
import { costMetricsPath, writeCostReport } from '../src/cost-metrics';
import type { UsageRecord } from '../src/types';

let root: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'burn-metrics-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const rec: UsageRecord = {
  ts: '2026-08-20T12:00:00.000Z',
  model: 'claude-opus-4-8',
  out: 100,
  in: 200,
  cacheWrite: 0,
  cacheRead: 1000,
  agent: 'harness-task-executor',
  agentId: 'lane-1',
};

describe('writeCostReport', () => {
  it('targets .harness/metrics/cost-per-pr.json under the repo root', () => {
    expect(costMetricsPath(root)).toBe(path.join(root, '.harness', 'metrics', 'cost-per-pr.json'));
  });

  it('creates the metrics dir and round-trips the report', () => {
    const report = buildCostReport({ records: [rec], provenance: [], linkage: new Map() });
    const target = writeCostReport(root, report);
    expect(existsSync(target)).toBe(true);
    const parsed = JSON.parse(readFileSync(target, 'utf8'));
    expect(parsed.by_lane[0].lane_id).toBe('lane-1');
    expect(parsed.denominator_note).toContain('merged PR');
  });
});

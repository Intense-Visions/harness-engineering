/**
 * `harness burn per-pr` end-to-end against a throwaway HUD tree.
 *
 * Drives the real store + provenance readers via the same `CLAUDE_HUD_*`
 * variables a real install uses, so the join and the JSON contract are
 * exercised rather than mocked. `gh` is never called: with no provenance
 * `laneId` and no network, linkage degrades and the report still emits.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { printPerPr } from './per-pr';

let root: string;
let logged: string[];
const originalEnv = { ...process.env };
const originalCwd = process.cwd();

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'burn-perpr-'));
  const hud = path.join(root, 'hud');
  const state = path.join(hud, 'state');
  mkdirSync(state, { recursive: true });
  process.env.CLAUDE_HUD_HOME = hud;
  process.env.CLAUDE_HUD_STATE = state;
  process.env.CLAUDE_HUD_PROJECTS = path.join(root, 'projects');

  // Seed a usage.tsv row directly (positional, tab-delimited store format):
  // id, ts, model, out, in, cacheWrite, cacheRead, agent, agentId
  const row = [
    'req-1',
    '2026-08-20T12:00:00.000Z',
    'claude-opus-4-8',
    '100',
    '200',
    '0',
    '1000',
    'harness-task-executor',
    'lane-1',
  ].join('\t');
  writeFileSync(path.join(state, 'usage.tsv'), `${row}\n`);

  logged = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logged.push(args.join(' '));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  process.chdir(originalCwd);
  rmSync(root, { recursive: true, force: true });
  for (const k of ['CLAUDE_HUD_HOME', 'CLAUDE_HUD_STATE', 'CLAUDE_HUD_PROJECTS']) {
    if (originalEnv[k] === undefined) delete process.env[k];
    else process.env[k] = originalEnv[k];
  }
});

describe('harness burn per-pr', () => {
  it('emits a JSON report with both denominators and lane token sums', () => {
    process.chdir(root); // no docs/changes ⇒ empty provenance, no gh
    const code = printPerPr({ json: true });
    expect(code).toBe(0);
    const report = JSON.parse(logged.join('\n'));
    expect(report.by_lane[0].lane_id).toBe('lane-1');
    expect(report.by_lane[0].tokens_in).toBe(200);
    expect(report.totals).toHaveProperty('cost_per_merged_pr');
    expect(report.totals).toHaveProperty('cost_per_dispatched_lane');
    expect(report).toHaveProperty('band_findings');
  });

  it('writes the metrics file under --write', () => {
    process.chdir(root);
    const code = printPerPr({ write: true });
    expect(code).toBe(0);
    const written = path.join(root, '.harness', 'metrics', 'cost-per-pr.json');
    expect(logged.some((l) => l.includes('Cost per merged PR'))).toBe(true);
    // File exists and is valid JSON.
    const parsed = JSON.parse(readFileSync(written, 'utf8'));
    expect(parsed.by_lane[0].lane_id).toBe('lane-1');
  });
});

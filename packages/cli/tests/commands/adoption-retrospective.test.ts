import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Command } from 'commander';
import { readAdoptionRecords } from '@harness-engineering/core';
import { createAdoptionCommand } from '../../src/commands/adoption';

// Keep the real aggregation + render; stub only the JSONL reader.
vi.mock('@harness-engineering/core', async (importActual) => {
  const actual = await importActual<typeof import('@harness-engineering/core')>();
  return { ...actual, readAdoptionRecords: vi.fn() };
});

const mockRecords = [
  {
    skill: 'harness-brainstorming',
    session: 's1',
    startedAt: '2026-06-01T10:00:00.000Z',
    outcome: 'completed',
    duration: 5000,
    phasesReached: [],
  },
  {
    skill: 'harness-brainstorming',
    session: 's2',
    startedAt: '2026-06-02T10:00:00.000Z',
    outcome: 'failed',
    duration: 3000,
    phasesReached: ['explore'],
  },
  {
    skill: 'harness-brainstorming',
    session: 's2b',
    startedAt: '2026-06-02T11:00:00.000Z',
    outcome: 'failed',
    duration: 3000,
    phasesReached: ['explore'],
  },
  {
    skill: 'harness-debugging',
    session: 's3',
    startedAt: '2026-06-03T10:00:00.000Z',
    outcome: 'abandoned',
    duration: 1000,
    phasesReached: [],
  },
  {
    skill: 'harness-debugging',
    session: 's3b',
    startedAt: '2026-06-03T11:00:00.000Z',
    outcome: 'abandoned',
    duration: 1000,
    phasesReached: [],
  },
];

async function runCommand(args: string[]): Promise<void> {
  const parent = new Command();
  parent.option('--json', 'JSON output');
  parent.addCommand(createAdoptionCommand());
  parent.exitOverride();
  await parent.parseAsync(['node', 'test', 'adoption', ...args]);
}

let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.mocked(readAdoptionRecords).mockReturnValue(mockRecords as never);
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('adoption retrospective', () => {
  it('emits a structured report with --json', async () => {
    await runCommand(['retrospective', '--json']);
    const out = logSpy.mock.calls.map((c) => c[0]).join('\n');
    const report = JSON.parse(out);
    expect(report.totalRecords).toBe(5);
    expect(report.distinctSkills).toBe(2);
    expect(report.topInvoked[0].skill).toBe('harness-brainstorming');
    expect(report.topFailing[0].skill).toBe('harness-brainstorming');
    expect(report.abandonedMidWorkflow.map((s: { skill: string }) => s.skill)).toEqual([
      'harness-brainstorming',
      'harness-debugging',
    ]);
  });

  it('includes the Bayesian skill-effectiveness view in --json', async () => {
    await runCommand(['retrospective', '--json']);
    const report = JSON.parse(logSpy.mock.calls.map((c) => c[0]).join('\n'));
    expect(report.skillEffectiveness).toBeDefined();
    // Every scored skill carries a Laplace-smoothed rate in [0, 1].
    for (const s of report.skillEffectiveness.scores) {
      expect(s.successRate).toBeGreaterThanOrEqual(0);
      expect(s.successRate).toBeLessThanOrEqual(1);
    }
    // brainstorming: 2 failed / 3 -> failing skill above default threshold.
    expect(report.skillEffectiveness.failing.map((s: { skill: string }) => s.skill)).toContain(
      'harness-brainstorming'
    );
    // debugging: 2 abandoned / 2 -> abandoned skill above default threshold.
    expect(report.skillEffectiveness.abandoned.map((s: { skill: string }) => s.skill)).toContain(
      'harness-debugging'
    );
  });

  it('respects --inactive-days when flagging stale skills', async () => {
    await runCommand(['retrospective', '--inactive-days', '1', '--json']);
    const report = JSON.parse(logSpy.mock.calls.map((c) => c[0]).join('\n'));
    expect(report.inactiveDaysThreshold).toBe(1);
  });

  it('prints Markdown to stdout with --no-write', async () => {
    await runCommand(['retrospective', '--no-write']);
    const out = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(out).toContain('# Catalog Retrospective');
    expect(out).toContain('Top skills by invocations');
    expect(out).toContain('Abandoned mid-workflow');
    expect(out).toContain('## Bayesian skill effectiveness');
    expect(out).toContain('Failing skills (Bayesian-ranked)');
  });

  it('writes a Markdown file to --out', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'retro-'));
    const outFile = path.join(dir, 'report.md');
    try {
      await runCommand(['retrospective', '--out', outFile]);
      expect(fs.existsSync(outFile)).toBe(true);
      const content = fs.readFileSync(outFile, 'utf-8');
      expect(content).toContain('# Catalog Retrospective');
      expect(content).toContain('harness-brainstorming');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

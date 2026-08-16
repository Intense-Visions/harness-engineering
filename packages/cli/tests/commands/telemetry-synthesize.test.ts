import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Command } from 'commander';
import { createTelemetryCommand } from '../../src/commands/telemetry';

/**
 * Integration coverage for `harness telemetry synthesize` (#563). Runs the real
 * command in-process against on-disk fixtures — exercising the real adoption /
 * usage readers and the real compose + render — so the acceptance criteria are
 * verified end-to-end, not against mocks.
 */

const MODEL = 'claude-sonnet-4-20250514'; // present in the bundled fallback pricing

function writeAdoption(dir: string, lines: object[]): void {
  fs.mkdirSync(path.join(dir, '.harness', 'metrics'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.harness', 'metrics', 'adoption.jsonl'),
    lines.map((l) => JSON.stringify(l)).join('\n') + '\n'
  );
}

function writeCosts(dir: string, lines: object[]): void {
  fs.mkdirSync(path.join(dir, '.harness', 'metrics'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.harness', 'metrics', 'costs.jsonl'),
    lines.map((l) => JSON.stringify(l)).join('\n') + '\n'
  );
}

async function runSynthesize(args: string[]): Promise<string> {
  const out: string[] = [];
  const logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    out.push(args.map((a) => String(a ?? '')).join(' '));
  });
  try {
    const parent = new Command();
    parent.addCommand(createTelemetryCommand());
    parent.exitOverride();
    await parent.parseAsync(['node', 'test', 'telemetry', 'synthesize', ...args]);
  } finally {
    logSpy.mockRestore();
  }
  return out.join('\n');
}

describe('harness telemetry synthesize', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-synth-'));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('AC1/AC2: prints a Markdown headline + a section per present source', async () => {
    writeAdoption(tempDir, [
      {
        skill: 'harness-autopilot',
        startedAt: '2026-08-15T10:00:00Z',
        duration: 1000,
        outcome: 'completed',
        phasesReached: ['plan'],
      },
      {
        skill: 'harness-code-review',
        startedAt: '2026-08-14T10:00:00Z',
        duration: 500,
        outcome: 'completed',
        phasesReached: ['review'],
      },
    ]);
    const md = await runSynthesize([]);
    expect(md).toContain('# Telemetry Synthesis');
    expect(md).toContain('## Headline');
    expect(md).toContain('## Skill adoption');
    expect(md).toContain('## Skill effectiveness');
  });

  it('AC3: --json emits a TelemetrySynthesis with all five source keys + headline', async () => {
    writeAdoption(tempDir, [
      {
        skill: 'harness-autopilot',
        startedAt: '2026-08-15T10:00:00Z',
        duration: 1000,
        outcome: 'completed',
        phasesReached: [],
      },
    ]);
    const json = JSON.parse(await runSynthesize(['--json']));
    expect(Object.keys(json.sources).sort()).toEqual([
      'adoption',
      'effectiveness',
      'insights',
      'outcomes',
      'usage',
    ]);
    expect(json.headline).toHaveProperty('totalSkillInvocations');
    expect(json.headline).toHaveProperty('healthPassed');
  });

  it('AC4: adoption K skills / N invocations match `harness adoption skills` over the same fixture', async () => {
    const records = [
      {
        skill: 'harness-autopilot',
        startedAt: '2026-08-15T10:00:00Z',
        duration: 1000,
        outcome: 'completed',
        phasesReached: [],
      },
      {
        skill: 'harness-autopilot',
        startedAt: '2026-08-14T10:00:00Z',
        duration: 900,
        outcome: 'failed',
        phasesReached: ['plan'],
      },
      {
        skill: 'harness-code-review',
        startedAt: '2026-08-13T10:00:00Z',
        duration: 500,
        outcome: 'completed',
        phasesReached: [],
      },
    ];
    writeAdoption(tempDir, records);
    const json = JSON.parse(await runSynthesize(['--json']));

    // Parity source of truth: read the same fixture through the public reader.
    const { readAdoptionRecords, aggregateBySkill } = await import('@harness-engineering/core');
    const read = readAdoptionRecords(tempDir);
    const K = aggregateBySkill(read).length;
    expect(json.sources.adoption.distinctSkills).toBe(K); // 2
    expect(json.headline.totalSkillInvocations).toBe(read.length); // 3
  });

  it('AC5: no adoption.jsonl → exits 0, adoption absent, footered, headline invocations null', async () => {
    const json = JSON.parse(await runSynthesize(['--json']));
    expect(json.sources.adoption.present).toBe(false);
    expect(json.headline.totalSkillInvocations).toBeNull();
    const md = await runSynthesize([]);
    expect(md).toContain('## Sources with no data');
    expect(md).toMatch(/Skill adoption:/);
  });

  it('AC6: headline cost equals the usage aggregator total over the same fixture', async () => {
    const costs = [
      {
        session_id: 's1',
        timestamp: '2026-08-15T10:00:00Z',
        model: MODEL,
        token_usage: { input_tokens: 1000, output_tokens: 500 },
      },
      {
        session_id: 's2',
        timestamp: '2026-08-14T10:00:00Z',
        model: MODEL,
        token_usage: { input_tokens: 2000, output_tokens: 800 },
      },
    ];
    writeCosts(tempDir, costs);

    const json = JSON.parse(await runSynthesize(['--json']));

    // Parity: price + aggregate the same fixture exactly as `harness usage` does.
    const { readCostRecords, loadPricingData, calculateCost, aggregateByDay } =
      await import('@harness-engineering/core');
    const read = readCostRecords(tempDir);
    const pricing = await loadPricingData(tempDir);
    for (const r of read) {
      if (r.model && r.costMicroUSD == null) {
        const c = calculateCost(r, pricing);
        if (c != null) r.costMicroUSD = c;
      }
    }
    const total = aggregateByDay(read).reduce((sum, d) => sum + (d.costMicroUSD ?? 0), 0);
    expect(json.sources.usage.totalCostMicroUSD).toBe(total);
    expect(json.headline.totalCostUsd).toBeCloseTo(total / 1_000_000, 6);
  });

  it('AC7: no graph → outcomes absent and satisfied rate null', async () => {
    const json = JSON.parse(await runSynthesize(['--json']));
    expect(json.sources.outcomes.present).toBe(false);
    expect(json.headline.outcomeSatisfiedRate).toBeNull();
  });

  it('AC8: --skip usage omits usage and nulls headline cost, leaving others present', async () => {
    writeAdoption(tempDir, [
      {
        skill: 'harness-autopilot',
        startedAt: '2026-08-15T10:00:00Z',
        duration: 1000,
        outcome: 'completed',
        phasesReached: [],
      },
    ]);
    writeCosts(tempDir, [
      {
        session_id: 's1',
        timestamp: '2026-08-15T10:00:00Z',
        model: MODEL,
        token_usage: { input_tokens: 1000, output_tokens: 500 },
      },
    ]);
    const json = JSON.parse(await runSynthesize(['--skip', 'usage', '--json']));
    expect(json.sources.usage.present).toBe(false);
    expect(json.sources.usage.reason).toBe('skipped');
    expect(json.headline.totalCostUsd).toBeNull();
    expect(json.sources.adoption.present).toBe(true);
  });

  it('AC9: --out writes the report + prints a confirmation; nothing is written without --out', async () => {
    writeAdoption(tempDir, [
      {
        skill: 'harness-autopilot',
        startedAt: '2026-08-15T10:00:00Z',
        duration: 1000,
        outcome: 'completed',
        phasesReached: [],
      },
    ]);
    // Without --out: no report file appears.
    await runSynthesize([]);
    expect(fs.existsSync(path.join(tempDir, 'report.md'))).toBe(false);

    // With --out: file written + confirmation logged.
    const logs = await runSynthesize(['--out', 'report.md']);
    expect(fs.existsSync(path.join(tempDir, 'report.md'))).toBe(true);
    expect(logs).toContain('Telemetry synthesis written to report.md');
  });

  it('AC10: read-only — no writes to .harness/metrics during a run', async () => {
    writeAdoption(tempDir, [
      {
        skill: 'harness-autopilot',
        startedAt: '2026-08-15T10:00:00Z',
        duration: 1000,
        outcome: 'completed',
        phasesReached: [],
      },
    ]);
    writeCosts(tempDir, [
      {
        session_id: 's1',
        timestamp: '2026-08-15T10:00:00Z',
        model: MODEL,
        token_usage: { input_tokens: 1000, output_tokens: 500 },
      },
    ]);
    const metricsDir = path.join(tempDir, '.harness', 'metrics');
    const before = fs.readdirSync(metricsDir).map((f) => {
      const st = fs.statSync(path.join(metricsDir, f));
      return { f, mtime: st.mtimeMs, size: st.size };
    });
    await runSynthesize(['--json']);
    const after = fs.readdirSync(metricsDir).map((f) => {
      const st = fs.statSync(path.join(metricsDir, f));
      return { f, mtime: st.mtimeMs, size: st.size };
    });
    expect(after).toEqual(before);
  });

  it('AC11: --window bounds adoption to the trailing N days', async () => {
    const recent = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const old = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    writeAdoption(tempDir, [
      {
        skill: 'harness-autopilot',
        startedAt: recent,
        duration: 1000,
        outcome: 'completed',
        phasesReached: [],
      },
      {
        skill: 'harness-old',
        startedAt: old,
        duration: 1000,
        outcome: 'completed',
        phasesReached: [],
      },
    ]);
    const windowed = JSON.parse(await runSynthesize(['--window', '30', '--json']));
    expect(windowed.headline.totalSkillInvocations).toBe(1);
    const allTime = JSON.parse(await runSynthesize(['--json']));
    expect(allTime.headline.totalSkillInvocations).toBe(2);
  });
});

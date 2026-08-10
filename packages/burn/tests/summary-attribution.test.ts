/**
 * Where the week's units went, by agent.
 *
 * Two properties carry the weight. The labels must PARTITION the week — if
 * they do not sum to the week's total, some spend is invisible and the
 * report is a lie of omission. And a week whose subagent spend carries no
 * readable label must say so: a silent zero would read as "no fleet ran".
 */
import { writeFileSync } from 'node:fs';

import { afterEach, describe, expect, it } from 'vitest';

import { recompute, refresh } from '../src/refresh';
import type { Summary } from '../src/types';
import { DEFAULT_WEEK, agentLine, hoursAgo, makeHud, transcriptLine, type Hud } from './helpers';

let hud: Hud | null = null;

function newHud(): Hud {
  hud = makeHud();
  return hud;
}

afterEach(() => {
  hud?.cleanup();
  hud = null;
});

describe('summary — agents block', () => {
  it('partitions the week across labels, within a unit of rounding per label', () => {
    // Each block rounds independently, so the published integers are asserted
    // to +/-1 unit per label — never as an exact integer sum.
    const h = newHud();
    const now = new Date();
    h.writeConfig({ week_reset: DEFAULT_WEEK });
    h.writeTranscript('main.jsonl', [transcriptLine('m1', hoursAgo(now, 1), { out: 333 })]);
    h.writeSubagentTranscript('agent-a.jsonl', [
      agentLine(
        's1',
        hoursAgo(now, 1),
        { isSidechain: true, agentId: 'lane-1', attributionAgent: 'harness-task-executor' },
        { out: 777 }
      ),
      agentLine('s2', hoursAgo(now, 1), { isSidechain: true, agentId: 'lane-2' }, { out: 111 }),
    ]);

    const s = refresh(h.paths);
    const labels = Object.keys(s.agents);
    expect(labels.sort()).toEqual(['harness-task-executor', 'main', 'unattributed']);

    const summed = labels.reduce((acc, k) => acc + s.agents[k]!.units, 0);
    expect(Math.abs(summed - s.wtd.units)).toBeLessThanOrEqual(labels.length);
  });

  it('counts distinct dispatches as lanes and reports zero lanes for main', () => {
    const h = newHud();
    const now = new Date();
    h.writeConfig({ week_reset: DEFAULT_WEEK });
    h.writeTranscript('main.jsonl', [transcriptLine('m1', hoursAgo(now, 1))]);
    h.writeSubagentTranscript('agent-a.jsonl', [
      agentLine('s1', hoursAgo(now, 1), {
        isSidechain: true,
        agentId: 'lane-1',
        attributionAgent: 'harness-task-executor',
      }),
      agentLine('s2', hoursAgo(now, 1), {
        isSidechain: true,
        agentId: 'lane-2',
        attributionAgent: 'harness-task-executor',
      }),
      agentLine('s3', hoursAgo(now, 1), {
        isSidechain: true,
        agentId: 'lane-2',
        attributionAgent: 'harness-task-executor',
      }),
    ]);

    const s = refresh(h.paths);
    expect(s.agents['harness-task-executor']!.lanes).toBe(2);
    expect(s.agents['harness-task-executor']!.requests).toBe(3);
    expect(s.agents.main!.lanes).toBe(0);
    expect(s.attribution.lanes).toBe(2);
    expect(s.attribution.main_units).toBeGreaterThan(0);
    expect(s.attribution.attributed_units).toBeGreaterThan(0);
  });

  it('reports degraded when subagent spend carries no readable label at all', () => {
    const h = newHud();
    const now = new Date();
    h.writeConfig({ week_reset: DEFAULT_WEEK });
    h.writeTranscript('main.jsonl', [transcriptLine('m1', hoursAgo(now, 1))]);
    h.writeSubagentTranscript('agent-a.jsonl', [
      agentLine('s1', hoursAgo(now, 1), { isSidechain: true, agentId: 'lane-1' }),
    ]);

    const s = refresh(h.paths);
    expect(s.attribution.degraded).toBe(true);
    expect(s.attribution.unattributed_units).toBeGreaterThan(0);
    expect(s.attribution.attributed_units).toBe(0);
  });

  it('does not report degraded while some subagent spend is still labelled', () => {
    const h = newHud();
    const now = new Date();
    h.writeConfig({ week_reset: DEFAULT_WEEK });
    h.writeSubagentTranscript('agent-a.jsonl', [
      agentLine('s1', hoursAgo(now, 1), {
        isSidechain: true,
        agentId: 'lane-1',
        attributionAgent: 'harness-task-executor',
      }),
      agentLine('s2', hoursAgo(now, 1), { isSidechain: true, agentId: 'lane-2' }),
    ]);

    expect(refresh(h.paths).attribution.degraded).toBe(false);
  });

  it('does not report degraded when there is no subagent spend to lose', () => {
    // No fleet ran. That is not a degraded scanner, and saying so would
    // train the reader to ignore the one alert that matters.
    const h = newHud();
    h.writeConfig({ week_reset: DEFAULT_WEEK });
    h.writeTranscript('main.jsonl', [transcriptLine('m1', hoursAgo(new Date(), 1))]);

    const s = refresh(h.paths);
    expect(s.attribution.degraded).toBe(false);
    expect(s.attribution.unattributed_units).toBe(0);
    expect(s.agents.main!.pct_of_week).toBeGreaterThan(0);
  });
});

describe('summary — pre-migration rows', () => {
  /** Seed a 7-column store with a current-week row and roll it up without a scan. */
  function legacyOnly(h: Hud, extraRows: string[] = []): Summary {
    h.writeConfig({ week_reset: DEFAULT_WEEK });
    const ts = hoursAgo(new Date(), 1).toISOString();
    writeFileSync(
      h.paths.usageTsv,
      `${[`old1\t${ts}\tclaude-opus-5\t500\t10\t0\t0`, ...extraRows].join('\n')}\n`
    );
    return recompute(h.paths);
  }

  it('files a legacy row under pre-migration, not under main or unattributed', () => {
    const h = newHud();
    const s = legacyOnly(h);
    expect(Object.keys(s.agents)).toEqual(['pre-migration']);
    expect(s.attribution.pre_migration_units).toBeGreaterThan(0);
    expect(s.attribution.main_units).toBe(0);
    expect(s.attribution.unattributed_units).toBe(0);
  });

  it('does not raise the degradation alarm on history alone', () => {
    // The whole reason `pre-migration` exists as a separate label: a store
    // full of legacy rows is not evidence that the transcript shape changed.
    const h = newHud();
    expect(legacyOnly(h).attribution.degraded).toBe(false);
  });

  it('does not let a legacy row suppress a real degradation alarm', () => {
    // The mirror failure: if `pre-migration` counted as attributed spend,
    // one legacy row would make `attributed === 0` false and silence the
    // alarm for a week whose subagent spend really did lose its labels.
    const h = newHud();
    const ts = hoursAgo(new Date(), 1).toISOString();
    const s = legacyOnly(h, [`sub1\t${ts}\tclaude-opus-5\t500\t10\t0\t0\tunattributed\tlane-1`]);
    expect(s.attribution.attributed_units).toBe(0);
    expect(s.attribution.degraded).toBe(true);
  });

  it('counts a lane once even when it appears under two labels', () => {
    // Possible mid-migration, via the upgrade rule. `attribution.lanes` is a
    // union across labels, deliberately not the sum of per-label lanes.
    const h = newHud();
    const ts = hoursAgo(new Date(), 1).toISOString();
    const s = legacyOnly(h, [
      `a\t${ts}\tclaude-opus-5\t100\t0\t0\t0\tharness-task-executor\tlane-1`,
      `b\t${ts}\tclaude-opus-5\t100\t0\t0\t0\tunattributed\tlane-1`,
    ]);
    expect(s.agents['harness-task-executor']!.lanes).toBe(1);
    expect(s.agents.unattributed!.lanes).toBe(1);
    expect(s.attribution.lanes).toBe(1);
  });
});

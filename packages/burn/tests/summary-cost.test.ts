import { writeFileSync } from 'node:fs';

import { afterEach, describe, expect, it } from 'vitest';

import { DEFAULT_CONFIG } from '../src/config';
import { buildSummary } from '../src/summary';
import type { BurnConfig, ScanInfo } from '../src/types';
import { DEFAULT_WEEK, makeHud, type Hud } from './helpers';

/**
 * Dollar-cost reconciliation for the burn summary (Refs #1525). Proves the `$`
 * figure appears ONLY when a price table is configured, is reconciled through
 * #1522's `priceRecord` arithmetic, and stays honest about unpriced models.
 */

const NOW = new Date('2026-08-12T12:00:00Z');
const HOUR = 3_600_000;

let hud: Hud | null = null;

afterEach(() => {
  hud?.cleanup();
  hud = null;
});

interface Row {
  id: string;
  model: string;
  in: number;
  out: number;
  cacheRead: number;
  atMsAgo: number;
}

/** Seed the 10-column store with fully-attributed `main` rows carrying token splits. */
function seed(h: Hud, rows: Row[]): void {
  const lines = rows.map((r) => {
    const ts = new Date(NOW.getTime() - r.atMsAgo).toISOString();
    // id ts model out in cacheWrite cacheRead agent agentId invokingSkill
    return `${r.id}\t${ts}\t${r.model}\t${r.out}\t${r.in}\t0\t${r.cacheRead}\tmain\t\t`;
  });
  writeFileSync(h.paths.usageTsv, lines.join('\n') + '\n');
}

function cfg(overrides: Partial<BurnConfig> = {}): BurnConfig {
  return { ...DEFAULT_CONFIG, week_reset: DEFAULT_WEEK, ...overrides };
}

function scan(recordsTotal: number): ScanInfo {
  return {
    files_total: 1,
    files_rescanned: 1,
    records_added: recordsTotal,
    records_total: recordsTotal,
  };
}

const PRICE_TABLE = {
  'claude-opus-5': { in: 0.00001, out: 0.00005, cache_read: 0.000001 },
};

describe('buildSummary — dollar-cost reconciliation', () => {
  it('omits the cost block entirely when no price table is configured (byte-identical)', () => {
    hud = makeHud();
    seed(hud, [
      { id: 'a', model: 'claude-opus-5', in: 1000, out: 100, cacheRead: 500, atMsAgo: HOUR },
    ]);

    const s = buildSummary(hud.paths, scan(1), cfg(), NOW);

    expect(s.cost).toBeUndefined();
    expect('cost' in s).toBe(false);
  });

  it('reconciles current-week USD through the price table when configured', () => {
    hud = makeHud();
    seed(hud, [
      { id: 'a', model: 'claude-opus-5', in: 1000, out: 100, cacheRead: 500, atMsAgo: HOUR },
    ]);

    const s = buildSummary(hud.paths, scan(1), cfg({ cost_price_table: PRICE_TABLE }), NOW);

    // 1000*0.00001 + 100*0.00005 + 500*0.000001 = 0.01 + 0.005 + 0.0005
    expect(s.cost).toBeDefined();
    expect(s.cost!.usd_wtd).toBeCloseTo(0.0155, 9);
    expect(s.cost!.models_priced).toBe(1);
    expect(s.cost!.models_total).toBe(1);
  });

  it('reports models_priced < models_total when a current-week model is unpriced', () => {
    hud = makeHud();
    seed(hud, [
      { id: 'a', model: 'claude-opus-5', in: 1000, out: 100, cacheRead: 500, atMsAgo: HOUR },
      { id: 'b', model: 'mystery-model', in: 2000, out: 200, cacheRead: 0, atMsAgo: HOUR },
    ]);

    const s = buildSummary(hud.paths, scan(2), cfg({ cost_price_table: PRICE_TABLE }), NOW);

    // The unpriced model contributes 0 USD; the priced one is unchanged.
    expect(s.cost!.usd_wtd).toBeCloseTo(0.0155, 9);
    expect(s.cost!.models_priced).toBe(1);
    expect(s.cost!.models_total).toBe(2);
  });
});

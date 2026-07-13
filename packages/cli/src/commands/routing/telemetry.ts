import { Command } from 'commander';
import { getJson, orchestratorBase } from './http-client';
import { logger } from '../../output/logger';
import { ExitCode } from '../../utils/errors';
import type { RoutingTelemetry, CapabilityTier } from '@harness-engineering/types';

/**
 * AMR observability: `harness routing telemetry` — GET /api/v1/routing/telemetry.
 * The enriched decision ring projected into the Shuttle wire shape
 * ({ decisions, spentUsd }): per-decision tier/backend/cost, plus a tier
 * distribution and the ring spend total. `spentUsd` here is the ring-sum
 * (telemetry-grade); the budget accumulator that drives the clamp is in
 * `harness routing status`.
 */
const TIERS: CapabilityTier[] = ['fast', 'standard', 'strong'];

function shortIso(iso: string): string {
  const tail = iso.split('T')[1] ?? iso;
  return tail.replace('Z', '');
}

// The tier distribution + spend total always summarize the FULL retained ring;
// `tableLimit` bounds only the verbose per-decision table below them.
function renderHuman(data: RoutingTelemetry, tableLimit?: number): void {
  if (data.decisions.length === 0) {
    console.log('(no routing telemetry — AMR is off or no decisions recorded yet)');
    return;
  }
  // Tier distribution over the full ring.
  const byTier = new Map<CapabilityTier, { count: number; cost: number }>();
  for (const t of TIERS) byTier.set(t, { count: 0, cost: 0 });
  for (const d of data.decisions) {
    const bucket = byTier.get(d.tierRequired);
    if (bucket) {
      bucket.count += 1;
      bucket.cost += d.estCostUsd;
    }
  }
  console.log(`Decisions (retained ring): ${data.decisions.length}`);
  console.log(`Ring spend total:          $${data.spentUsd.toFixed(4)}`);
  console.log('');
  console.log('TIER      COUNT   SHARE   COST');
  for (const t of TIERS) {
    const b = byTier.get(t)!;
    const share = Math.round((b.count / data.decisions.length) * 100);
    console.log(
      `${t.padEnd(9)} ${String(b.count).padStart(5)}   ${String(share).padStart(4)}%   $${b.cost.toFixed(4)}`
    );
  }
  console.log('');
  const rows = tableLimit !== undefined ? data.decisions.slice(0, tableLimit) : data.decisions;
  console.log(
    `TIMESTAMP     TIER      BACKEND         COST${tableLimit !== undefined ? `  (latest ${rows.length} of ${data.decisions.length})` : ''}`
  );
  for (const d of rows) {
    const ts = shortIso(d.decisionTs).padEnd(13);
    const tier = d.tierRequired.padEnd(9);
    const be = d.backend.padEnd(15);
    console.log(`${ts} ${tier} ${be} $${d.estCostUsd.toFixed(4)}`);
  }
}

export function createTelemetryCommand(): Command {
  return new Command('telemetry')
    .description('Routing telemetry: per-decision tier/backend/cost + tier distribution (AMR)')
    .option('--last <N>', 'Show only the N most recent decisions in the per-decision table')
    .option('--json', 'Emit JSON to stdout instead of human-readable text')
    .action(async (opts: { last?: string; json?: boolean }) => {
      const r = await getJson<RoutingTelemetry>('/api/v1/routing/telemetry');
      if (!r.ok) {
        if (r.status === 0) {
          logger.error(
            `Failed to reach orchestrator at ${orchestratorBase()}: ${r.error ?? 'unknown error'}`
          );
        } else {
          logger.error(`Request failed (${r.status}): ${r.error ?? ''}`);
        }
        process.exit(ExitCode.ERROR);
        return;
      }
      const body = r.body ?? { decisions: [], spentUsd: 0 };
      if (opts.json) {
        // JSON is the full retained payload (for scripting); `--last` is a
        // display convenience for the human table only.
        console.log(JSON.stringify(body, null, 2));
        return;
      }
      // `--last N` bounds only the per-decision table; the tier distribution +
      // spend total still summarize the full retained ring.
      const tableLimit =
        opts.last && Number.isFinite(Number(opts.last)) && Number(opts.last) > 0
          ? Math.floor(Number(opts.last))
          : undefined;
      renderHuman(body, tableLimit);
    });
}

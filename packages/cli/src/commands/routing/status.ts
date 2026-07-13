import { Command } from 'commander';
import { getJson, orchestratorBase } from './http-client';
import { logger } from '../../output/logger';
import { ExitCode } from '../../utils/errors';
import type { RoutingStatus } from '@harness-engineering/types';

/**
 * AMR observability: `harness routing status` — GET /api/v1/routing/status.
 * The live operator view of the adaptive router: whether it's active, budget
 * spend-vs-cap (the MONOTONIC accumulator that drives the D8 clamp — not the
 * telemetry ring sum), the coherence units that have escalated, and the active
 * provider allowlist.
 */
function bar(pct: number, width = 24): string {
  const clamped = Math.max(0, Math.min(100, pct));
  const filled = Math.round((clamped / 100) * width);
  return `[${'#'.repeat(filled)}${'-'.repeat(width - filled)}]`;
}

function renderHuman(s: RoutingStatus): void {
  if (!s.active) {
    console.log('Adaptive routing: OFF (no routing.policy configured — dispatch is unchanged)');
    return;
  }
  console.log('Adaptive routing: ON');

  if (s.budget) {
    const b = s.budget;
    const state = b.degrading ? 'DEGRADING (clamping tiers down)' : 'ok';
    console.log('');
    console.log('Budget:');
    console.log(
      `  $${b.spentUsd.toFixed(4)} / $${b.capUsd.toFixed(2)}  ${bar(b.spentPct)} ${b.spentPct}%`
    );
    console.log(`  degrade at ${b.degradeAtPct}% → ${state}`);
  } else {
    console.log('Budget:      (none configured)');
  }

  console.log('');
  if (s.escalation.length === 0) {
    console.log('Escalation:  (no units have climbed above the fast floor)');
  } else {
    console.log(`Escalation:  ${s.escalation.length} unit(s) climbed`);
    console.log('  UNIT                                   FLOOR');
    for (const u of s.escalation) {
      console.log(`  ${u.coherenceUnit.padEnd(38)} ${u.floor}`);
    }
  }

  console.log('');
  console.log(
    `Allowlist:   ${
      s.allowedProviders && s.allowedProviders.length > 0
        ? s.allowedProviders.join(', ')
        : '(all providers allowed)'
    }`
  );
}

export function createStatusCommand(): Command {
  return new Command('status')
    .description(
      'Live routing status: budget spend-vs-cap, escalated units, provider allowlist (AMR)'
    )
    .option('--json', 'Emit JSON to stdout instead of human-readable text')
    .action(async (opts: { json?: boolean }) => {
      const r = await getJson<RoutingStatus>('/api/v1/routing/status');
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
      const body = r.body ?? {
        active: false,
        budget: null,
        escalation: [],
        allowedProviders: null,
      };
      if (opts.json) {
        console.log(JSON.stringify(body, null, 2));
        return;
      }
      renderHuman(body);
    });
}

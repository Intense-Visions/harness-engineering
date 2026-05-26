import { Command } from 'commander';
import { postJson, orchestratorBase } from './http-client';
import { logger } from '../../output/logger';
import { ExitCode } from '../../utils/errors';
import type { RoutingDecision, RoutingUseCase } from '@harness-engineering/types';

/**
 * Spec B Phase 6: `harness routing trace` — POST /api/v1/routing/trace.
 * Dry-run a routing decision without dispatching (F7). Surfaces `--skill`
 * and `--mode` (D-OP-2); any non-2xx exits ExitCode.ERROR (D-OP-3, O3).
 */
interface TraceResponse {
  decision: RoutingDecision;
  def: { type: string };
}

function buildUseCase(opts: { skill?: string; mode?: string }): RoutingUseCase | null {
  if (opts.skill) {
    return opts.mode
      ? { kind: 'skill', skillName: opts.skill, cognitiveMode: opts.mode }
      : { kind: 'skill', skillName: opts.skill };
  }
  if (opts.mode) return { kind: 'mode', cognitiveMode: opts.mode };
  return null;
}

function renderHuman(r: TraceResponse): void {
  console.log(`Backend: ${r.decision.backendName} (type: ${r.def.type})`);
  console.log(`Duration: ${r.decision.durationMs.toFixed(2)} ms`);
  console.log('Resolution path:');
  if (r.decision.resolutionPath.length === 0) {
    console.log('  (empty)');
    return;
  }
  for (const step of r.decision.resolutionPath) {
    console.log(`  ${step.source}:${step.candidate} -> ${step.outcome}`);
  }
}

export function createTraceCommand(): Command {
  return new Command('trace')
    .description('Dry-run a routing decision without dispatching (Spec B F7)')
    .option('--skill <name>', 'Skill name to trace')
    .option('--mode <m>', 'Cognitive mode to trace (or attach to --skill per spec D12)')
    .option('--json', 'Emit JSON to stdout instead of human-readable text')
    .action(async (opts: { skill?: string; mode?: string; json?: boolean }) => {
      const useCase = buildUseCase(opts);
      if (!useCase) {
        logger.error('Either --skill <name> or --mode <m> is required');
        process.exit(ExitCode.ERROR);
        return;
      }
      const r = await postJson<TraceResponse>('/api/v1/routing/trace', { useCase });
      if (!r.ok) {
        if (r.status === 0) {
          logger.error(
            `Failed to reach orchestrator at ${orchestratorBase()}: ${r.error ?? 'unknown error'}`
          );
        } else if (r.status === 503) {
          logger.error(
            'Routing observability not available — orchestrator has no BackendRouter (legacy single-backend config)'
          );
        } else {
          logger.error(`Trace failed (${r.status}): ${r.error ?? ''}`);
        }
        process.exit(ExitCode.ERROR);
        return;
      }
      if (opts.json) {
        console.log(JSON.stringify(r.body, null, 2));
        return;
      }
      if (r.body) renderHuman(r.body);
    });
}

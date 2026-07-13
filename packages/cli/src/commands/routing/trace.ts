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
  /** AMR Phase 3 (SC10): present when --complexity/--risk were supplied. */
  tierRequired?: string;
  estCostUsd?: number;
}

// Client-side enum guards mirror the server's zod schema
// (orchestrator server/routes/v1/routing.ts). Validating here turns an invalid
// value into a friendly, self-documenting error instead of round-tripping to a
// generic server 400. Keep these in sync with that schema.
const COMPLEXITY_VALUES = ['trivial', 'simple', 'moderate', 'complex'] as const;
const RISK_VALUES = ['low', 'high'] as const;

/** Returns an error message if `value` is not one of `allowed`, else null. */
function validateEnum(
  flag: string,
  value: string | undefined,
  allowed: readonly string[]
): string | null {
  if (value === undefined || allowed.includes(value)) return null;
  return `Invalid ${flag} "${value}". Allowed values: ${allowed.join(', ')}.`;
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
  // AMR Phase 3 (SC10): only present on --complexity/--risk dry-runs.
  if (r.tierRequired !== undefined) {
    console.log(`Tier required: ${r.tierRequired}`);
  }
  if (r.estCostUsd !== undefined) {
    console.log(`Est cost: $${r.estCostUsd.toFixed(4)}`);
  }
}

interface TraceOptions {
  skill?: string;
  mode?: string;
  complexity?: string;
  risk?: string;
  json?: boolean;
}

/** Maps a failed trace response to its user-facing error message. */
function traceErrorMessage(r: { status: number; error?: string }): string {
  if (r.status === 0) {
    return `Failed to reach orchestrator at ${orchestratorBase()}: ${r.error ?? 'unknown error'}`;
  }
  if (r.status === 503) {
    return 'Routing observability not available — orchestrator has no BackendRouter (legacy single-backend config)';
  }
  return `Trace failed (${r.status}): ${r.error ?? ''}`;
}

async function runTrace(opts: TraceOptions): Promise<void> {
  const useCase = buildUseCase(opts);
  if (!useCase) {
    logger.error('Either --skill <name> or --mode <m> is required');
    process.exit(ExitCode.ERROR);
    return;
  }
  // Fail fast on bad enum values with a friendly, allowed-values error
  // rather than a generic server 400.
  const enumError =
    validateEnum('--complexity', opts.complexity, COMPLEXITY_VALUES) ??
    validateEnum('--risk', opts.risk, RISK_VALUES);
  if (enumError) {
    logger.error(enumError);
    process.exit(ExitCode.ERROR);
    return;
  }
  const r = await postJson<TraceResponse>('/api/v1/routing/trace', {
    useCase,
    ...(opts.complexity ? { complexity: opts.complexity } : {}),
    ...(opts.risk ? { risk: opts.risk } : {}),
  });
  if (!r.ok) {
    logger.error(traceErrorMessage(r));
    process.exit(ExitCode.ERROR);
    return;
  }
  if (opts.json) {
    console.log(JSON.stringify(r.body, null, 2));
    return;
  }
  if (r.body) renderHuman(r.body);
}

export function createTraceCommand(): Command {
  return new Command('trace')
    .description('Dry-run a routing decision without dispatching (Spec B F7)')
    .option('--skill <name>', 'Skill name to trace')
    .option('--mode <m>', 'Cognitive mode to trace (or attach to --skill per spec D12)')
    .option(
      '--complexity <level>',
      'Synthetic complexity (trivial|simple|moderate|complex) — dry-run only'
    )
    .option('--risk <band>', 'Synthetic risk band (low|high) — dry-run only')
    .option('--json', 'Emit JSON to stdout instead of human-readable text')
    .action(runTrace);
}

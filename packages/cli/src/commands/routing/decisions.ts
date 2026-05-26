import { Command } from 'commander';
import { getJson, orchestratorBase } from './http-client';
import { logger } from '../../output/logger';
import { ExitCode } from '../../utils/errors';
import type { RoutingDecision, RoutingUseCase } from '@harness-engineering/types';

/**
 * Spec B Phase 6: `harness routing decisions` — GET /api/v1/routing/decisions.
 * Reads the orchestrator's ring buffer of recent routing decisions (F8).
 * Filters (`--skill`, `--mode`, `--backend`) and `--last` are forwarded as
 * AND-combined query params. Server returns newest-first (D-OP-4).
 */
interface DecisionsResponse {
  decisions: RoutingDecision[];
}

function summarizeUseCase(uc: RoutingUseCase): string {
  switch (uc.kind) {
    case 'skill':
      return uc.cognitiveMode
        ? `skill:${uc.skillName}/${uc.cognitiveMode}`
        : `skill:${uc.skillName}`;
    case 'mode':
      return `mode:${uc.cognitiveMode}`;
    case 'tier':
      return `tier:${uc.tier}`;
    case 'intelligence':
      return `intelligence:${uc.layer}`;
    case 'isolation':
      return `isolation:${uc.tier}`;
    case 'maintenance':
      return 'maintenance';
    case 'chat':
      return 'chat';
  }
}

function shortIso(iso: string): string {
  // 2026-05-26T12:34:56.789Z -> 12:34:56.789
  const parts = iso.split('T');
  const tail = parts[1] ?? iso;
  return tail.replace('Z', '');
}

function renderHuman(data: DecisionsResponse): void {
  if (data.decisions.length === 0) {
    console.log('(no decisions in buffer)');
    return;
  }
  console.log('TIMESTAMP     USE-CASE                              BACKEND        DURATION');
  for (const d of data.decisions) {
    const ts = shortIso(d.timestamp).padEnd(13);
    const uc = summarizeUseCase(d.useCase).padEnd(38);
    const be = d.backendName.padEnd(14);
    const dur = `${d.durationMs.toFixed(2)} ms`;
    console.log(`${ts} ${uc} ${be} ${dur}`);
  }
}

function buildQuery(opts: {
  skill?: string;
  mode?: string;
  backend?: string;
  last?: string;
}): string {
  const p = new URLSearchParams();
  if (opts.skill) p.set('skill', opts.skill);
  if (opts.mode) p.set('mode', opts.mode);
  if (opts.backend) p.set('backend', opts.backend);
  if (opts.last) p.set('limit', opts.last);
  const q = p.toString();
  return q ? `?${q}` : '';
}

export function createDecisionsCommand(): Command {
  return new Command('decisions')
    .description('List recent routing decisions from the orchestrator ring buffer (Spec B F8)')
    .option('--skill <name>', 'Filter by useCase.skillName')
    .option('--mode <m>', 'Filter by useCase.cognitiveMode')
    .option('--backend <name>', 'Filter by chosen backendName')
    .option('--last <N>', 'Limit to the N most recent decisions')
    .option('--json', 'Emit JSON to stdout instead of human-readable text')
    .action(
      async (opts: {
        skill?: string;
        mode?: string;
        backend?: string;
        last?: string;
        json?: boolean;
      }) => {
        const query = buildQuery(opts);
        const r = await getJson<DecisionsResponse>(`/api/v1/routing/decisions${query}`);
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
            logger.error(`Request failed (${r.status}): ${r.error ?? ''}`);
          }
          process.exit(ExitCode.ERROR);
          return;
        }
        if (opts.json) {
          console.log(JSON.stringify(r.body, null, 2));
          return;
        }
        if (r.body) renderHuman(r.body);
      }
    );
}

import { Command } from 'commander';
import { getJson } from './http-client';
import { failRoutingCall, routingFailureMessage } from './failure';

/**
 * Spec B Phase 6: `harness routing config` — GET /api/v1/routing/config.
 * Human-readable default (two sections: Backends + Resolved Chains);
 * `--json` emits the raw response body for shell pipelines (D-OP-6).
 */
interface ResolvedChainCandidate {
  candidate: string;
  exists: boolean;
}

interface ConfigResponse {
  routing: unknown;
  resolvedChains: Record<string, ResolvedChainCandidate[]>;
  backends: string[];
}

function renderHuman(data: ConfigResponse): void {
  console.log('Backends:');
  for (const b of data.backends) console.log(`  - ${b}`);
  console.log('');
  console.log('Resolved Chains:');
  const keys = Object.keys(data.resolvedChains);
  if (keys.length === 0) {
    console.log('  (none)');
    return;
  }
  for (const key of keys) {
    const chain = data.resolvedChains[key] ?? [];
    const rendered = chain
      .map((c) => (c.exists ? c.candidate : `${c.candidate}(MISSING)`))
      .join(' -> ');
    console.log(`  ${key}: ${rendered}`);
  }
}

export function createConfigCommand(): Command {
  return new Command('config')
    .description('Print active routing config and resolved fallback chains')
    .option('--json', 'Emit JSON to stdout instead of human-readable text')
    .action(async (opts: { json?: boolean }) => {
      const r = await getJson<ConfigResponse>('/api/v1/routing/config');
      if (!r.ok) {
        failRoutingCall(routingFailureMessage(r, { unavailableOn503: true }), r.status, opts.json);
        return;
      }
      if (opts.json) {
        console.log(JSON.stringify(r.body, null, 2));
        return;
      }
      if (r.body) renderHuman(r.body);
    });
}

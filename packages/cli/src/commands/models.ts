// packages/cli/src/commands/models.ts
//
// `harness models` command group. Today ships the `probe` subcommand only —
// a focused primitive that lets operators (and craft skills via the lazy
// adapter) check what's loaded at a local backend's `/v1/models` endpoint.
//
// Future LMLM phases add `status`, `suggest`, `pool {...}`, `proposals`,
// `approve`, `reject`, `install`, `evict`, `refresh` under this same group.
// See docs/changes/local-model-lifecycle-manager/proposal.md.

import { Command } from 'commander';
import { defaultFetchModels } from '@harness-engineering/orchestrator';
import { logger } from '../output/logger';
import { ExitCode } from '../utils/errors';
import { resolveConfig } from '../config/loader';

interface ProbeOptions {
  backend?: string;
  endpoint?: string;
  apiKey?: string;
  json?: boolean;
  configPath?: string;
}

interface ProbeResult {
  status: 'ok' | 'no-match' | 'error';
  backend?: string;
  endpoint: string;
  configured: string[];
  detected: string[];
  resolved: string | null;
  error?: string;
  exitCode: number;
}

interface ProbeContext {
  endpoint: string;
  configured: string[];
  apiKey: string;
  backendLabel: string | undefined;
}

function errorResult(message: string, partial?: Partial<ProbeResult>): ProbeResult {
  return {
    status: 'error',
    endpoint: '',
    configured: [],
    detected: [],
    resolved: null,
    error: message,
    exitCode: ExitCode.ERROR,
    ...partial,
  };
}

function pickConfiguredList(model: unknown): string[] {
  if (typeof model === 'string') return [model];
  if (Array.isArray(model)) return model.filter((m): m is string => typeof m === 'string');
  return [];
}

type BackendDefRecord = Record<string, unknown>;

interface LocatedBackend {
  name: string;
  def: BackendDefRecord;
}

/** Walk harness.config.json → agent.backends and pick the requested entry (or default). */
function locateBackend(opts: ProbeOptions): LocatedBackend | ProbeResult {
  const resolved = resolveConfig(opts.configPath);
  if (!resolved.ok) {
    return errorResult(`Could not load harness.config.json: ${resolved.error.message}`);
  }
  const backends = resolved.value.agent?.backends as Record<string, BackendDefRecord> | undefined;
  const name = opts.backend ?? defaultLocalBackend(backends);
  if (name === null) {
    return errorResult(
      'No local backend in agent.backends. Declare one with type "local" or "pi", ' +
        'or pass --endpoint <url>.'
    );
  }
  const def = backends?.[name];
  if (def === undefined) {
    return errorResult(`agent.backends["${name}"] not found.`);
  }
  return { name, def };
}

/** Resolve probe inputs from explicit options + harness.config.json. */
function resolveProbeContext(opts: ProbeOptions): ProbeContext | ProbeResult {
  if (opts.endpoint !== undefined) {
    return {
      endpoint: opts.endpoint,
      configured: [],
      apiKey: opts.apiKey ?? 'local',
      backendLabel: opts.backend,
    };
  }

  const located = locateBackend(opts);
  if ('status' in located) return located;

  const ep = located.def.endpoint;
  if (typeof ep !== 'string') {
    return errorResult(`agent.backends["${located.name}"]: missing or invalid 'endpoint'.`);
  }
  const explicitKey = typeof located.def.apiKey === 'string' ? located.def.apiKey : undefined;
  return {
    endpoint: ep,
    configured: pickConfiguredList(located.def.model),
    apiKey: opts.apiKey ?? explicitKey ?? 'local',
    backendLabel: located.name,
  };
}

export async function runModelsProbe(opts: ProbeOptions): Promise<ProbeResult> {
  const ctx = resolveProbeContext(opts);
  if ('status' in ctx) return ctx;

  let detected: string[];
  try {
    detected = await defaultFetchModels(ctx.endpoint, ctx.apiKey);
  } catch (err) {
    return {
      status: 'error',
      ...(ctx.backendLabel !== undefined ? { backend: ctx.backendLabel } : {}),
      endpoint: ctx.endpoint,
      configured: ctx.configured,
      detected: [],
      resolved: null,
      error: err instanceof Error ? err.message : String(err),
      exitCode: ExitCode.ERROR,
    };
  }

  const match = ctx.configured.find((id) => detected.includes(id)) ?? null;
  return {
    status: match !== null ? 'ok' : 'no-match',
    ...(ctx.backendLabel !== undefined ? { backend: ctx.backendLabel } : {}),
    endpoint: ctx.endpoint,
    configured: ctx.configured,
    detected,
    resolved: match,
    exitCode: match !== null ? ExitCode.SUCCESS : ExitCode.ERROR,
  };
}

function defaultLocalBackend(
  backends: Record<string, Record<string, unknown>> | undefined
): string | null {
  if (backends === undefined) return null;
  for (const [name, def] of Object.entries(backends)) {
    const t = def.type;
    if (t === 'local' || t === 'pi') return name;
  }
  return null;
}

function formatProbe(result: ProbeResult): string {
  if (result.status === 'error') {
    return `error probing ${result.endpoint || '(no endpoint)'}: ${result.error}`;
  }
  const lines: string[] = [];
  lines.push(
    `endpoint: ${result.endpoint}${result.backend !== undefined ? ` (agent.backends["${result.backend}"])` : ''}`
  );
  lines.push(`configured: [${result.configured.join(', ')}]`);
  lines.push(`detected:   [${result.detected.join(', ')}]`);
  if (result.resolved !== null) {
    lines.push(`resolved:   ${result.resolved}`);
  } else {
    lines.push('resolved:   (no configured model is loaded)');
    lines.push(
      'hint: load one of the configured models or update agent.backends.<name>.model to include a detected id.'
    );
  }
  return lines.join('\n');
}

export function createModelsCommand(): Command {
  const cmd = new Command('models').description(
    'Inspect and manage local LLM backends. Currently ships `probe`; LMLM phases add status/suggest/pool/proposals.'
  );

  cmd
    .command('probe')
    .description(
      "Probe a local backend's /v1/models endpoint and report which configured model is loaded."
    )
    .option(
      '--backend <name>',
      'Name of an entry in agent.backends. Defaults to the first local/pi entry.'
    )
    .option('--endpoint <url>', 'Override the backend endpoint (bypasses harness.config.json).')
    .option('--api-key <key>', 'Override the API key.')
    .option('--json', 'Print machine-readable JSON instead of a human summary.', false)
    .action(async (options: ProbeOptions) => {
      const result = await runModelsProbe(options);
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        const text = formatProbe(result);
        if (result.status === 'error' || result.status === 'no-match') {
          logger.error(text);
        } else {
          logger.info(text);
        }
      }
      process.exit(result.exitCode);
    });

  return cmd;
}

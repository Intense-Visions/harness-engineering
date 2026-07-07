// packages/cli/src/commands/models.ts
//
// `harness models` command group. Today ships the `probe` subcommand only —
// a focused primitive that lets operators (and craft skills via the lazy
// adapter) check what's loaded at a local backend's `/v1/models` endpoint.
//
// Ships `probe`, `proposals`, `approve`, `reject`, and (Phase 6) `refresh`.
// Future LMLM phases add `status`, `suggest`, `pool {...}`, `install`, `evict`
// under this same group. See docs/changes/local-model-lifecycle-manager/proposal.md.

import { Command } from 'commander';
import { resolve } from 'node:path';
import { defaultFetchModels } from '@harness-engineering/orchestrator';
import { listProposals, type ListProposalsOptions, type Proposal } from '@harness-engineering/core';
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

// ── Model-proposal subcommands (Phase 5b) ──────────────────────────────────
//
// `proposals` reads the file-backed store via @harness-engineering/core
// (`listProposals`); `approve` and `reject` both go through the orchestrator's
// kind-aware HTTP route so they share its terminal-state guard + bus events
// (rather than writing the store directly). The CLI deliberately takes NO
// local-models workspace dep (the dependency-hygiene test enforces this) — the
// model *content* schema lives in @harness-engineering/types (re-exported
// through core), and pool/installer wiring stays server-side.

function projectRoot(): string {
  return resolve(process.env['HARNESS_PROJECT_ROOT'] ?? process.cwd());
}

/** Compact summary row for a model proposal listing. */
function summarizeModelProposal(p: Proposal): Record<string, unknown> {
  const base = { id: p.id, status: p.status, proposedBy: p.proposedBy, createdAt: p.createdAt };
  if (p.kind !== 'model') return { ...base, kind: p.kind };
  return {
    ...base,
    kind: 'model',
    action: p.model.action,
    target: p.model.target.ollamaName,
    replaces: p.model.replaces?.ollamaName,
    scoreDelta: p.model.scoreDelta,
  };
}

/** List model proposals (defaults to the pending `open` queue). */
export async function runModelsProposals(
  status: string = 'open'
): Promise<Record<string, unknown>[]> {
  const opts: ListProposalsOptions = { kind: 'model' };
  if (status !== 'all') opts.status = status as NonNullable<ListProposalsOptions['status']>;
  const proposals = await listProposals(projectRoot(), opts);
  return proposals.map(summarizeModelProposal);
}

/** Result of an approve/reject attempt (HTTP round-trip to the orchestrator). */
export interface ModelsMutationResult {
  ok: boolean;
  status?: number;
  body?: string;
  error?: string;
}

/** @deprecated Use {@link ModelsMutationResult}. Retained for call-site compat. */
export type ModelsApproveResult = ModelsMutationResult;

/** Approve a model proposal via the orchestrator's kind-aware approve route. */
export async function runModelsApprove(id: string): Promise<ModelsMutationResult> {
  const orchestratorUrl = process.env['HARNESS_ORCHESTRATOR_URL'] ?? 'http://127.0.0.1:4577';
  const token = process.env['HARNESS_ADMIN_TOKEN'];
  if (!token) {
    return {
      ok: false,
      error: 'HARNESS_ADMIN_TOKEN is required to approve proposals (manage-proposals scope).',
    };
  }
  try {
    const res = await fetch(`${orchestratorUrl}/api/v1/proposals/${id}/approve`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });
    return { ok: res.ok, status: res.status, body: await res.text() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Reject a model proposal via the orchestrator's kind-aware reject route —
 * symmetric with {@link runModelsApprove}. Routing through HTTP (rather than
 * writing the store directly) means the CLI inherits the route's terminal-state
 * guard (409 on an already approved/rejected/failed proposal, so decision
 * history and the F7 rejected-pair signal cannot be corrupted) and the
 * `local-models:proposal` bus event, which direct store writes bypassed.
 */
export async function runModelsReject(id: string, reason: string): Promise<ModelsMutationResult> {
  const orchestratorUrl = process.env['HARNESS_ORCHESTRATOR_URL'] ?? 'http://127.0.0.1:4577';
  const token = process.env['HARNESS_ADMIN_TOKEN'];
  if (!token) {
    return {
      ok: false,
      error: 'HARNESS_ADMIN_TOKEN is required to reject proposals (manage-proposals scope).',
    };
  }
  try {
    const res = await fetch(`${orchestratorUrl}/api/v1/proposals/${id}/reject`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    return { ok: res.ok, status: res.status, body: await res.text() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Result of a force-refresh attempt (HTTP round-trip to the orchestrator). */
export interface ModelsRefreshResult {
  ok: boolean;
  status?: number;
  emitted?: number;
  warnings?: string[];
  error?: string;
  body?: string;
}

/**
 * Force a background-scheduler refresh tick via the orchestrator route and
 * surface the O4 signal. The CLC deliberately reads the O4 hard-failure verdict
 * from the HTTP status (`503` ⇒ HF unreachable AND no snapshot loaded) rather
 * than importing the local-models predicate — the dependency-hygiene test
 * forbids a local-models workspace dep, and the route already owns that mapping.
 * A `200` (including the HF-down-but-snapshot-loaded soft-warning case) is a
 * success; only a non-2xx sets a non-zero exit.
 */
export async function runModelsRefresh(): Promise<ModelsRefreshResult> {
  const orchestratorUrl = process.env['HARNESS_ORCHESTRATOR_URL'] ?? 'http://127.0.0.1:4577';
  const token = process.env['HARNESS_ADMIN_TOKEN'];
  if (!token) {
    return {
      ok: false,
      error: 'HARNESS_ADMIN_TOKEN is required to trigger a refresh (manage-proposals scope).',
    };
  }
  try {
    const res = await fetch(`${orchestratorUrl}/api/v1/local-models/refresh`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });
    return buildRefreshResult(res, await res.text());
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Assemble a {@link ModelsRefreshResult} from the route response. */
function buildRefreshResult(res: Response, body: string): ModelsRefreshResult {
  const parsed = safeParseObject(body);
  const emitted = parsed?.['emitted'];
  const warnings = parsed?.['warnings'];
  const error = parsed?.['error'];
  return {
    ok: res.ok,
    status: res.status,
    ...(typeof emitted === 'number' ? { emitted } : {}),
    ...(Array.isArray(warnings) ? { warnings: warnings as string[] } : {}),
    ...(res.ok ? {} : { error: typeof error === 'string' ? error : `HTTP ${res.status}` }),
    body,
  };
}

/** Best-effort JSON object parse; returns undefined for non-object/invalid bodies. */
function safeParseObject(body: string): Record<string, unknown> | undefined {
  try {
    const v = JSON.parse(body) as unknown;
    return v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

/** Map a refresh result to a process exit code (O4: hard failure ⇒ non-zero). */
export function refreshExitCode(result: ModelsRefreshResult): number {
  return result.ok ? ExitCode.SUCCESS : ExitCode.ERROR;
}

/** One-line error string for a failed HTTP round-trip (explicit error or status+body). */
function httpErrorLine(r: { error?: string; status?: number; body?: string }): string {
  return r.error ?? `HTTP ${r.status ?? '?'}: ${r.body ?? ''}`;
}

/** Shared approve/reject reporter: print the route body or exit non-zero on failure. */
function reportMutation(result: ModelsMutationResult): void {
  if (!result.ok) {
    logger.error(httpErrorLine(result));
    process.exit(ExitCode.ERROR);
  }
  console.log(result.body ?? '');
}

async function probeAction(options: ProbeOptions): Promise<void> {
  const result = await runModelsProbe(options);
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const text = formatProbe(result);
    if (result.status === 'error' || result.status === 'no-match') logger.error(text);
    else logger.info(text);
  }
  process.exit(result.exitCode);
}

async function refreshAction(): Promise<void> {
  const result = await runModelsRefresh();
  if (!result.ok) {
    logger.error(httpErrorLine(result));
  } else {
    logger.info(`refresh: emitted ${result.emitted ?? 0} proposal(s)`);
    for (const w of result.warnings ?? []) logger.warn(`  warning: ${w}`);
  }
  // O4: keep output clean — set the exit code rather than throwing.
  process.exitCode = refreshExitCode(result);
}

function addProbeCommand(cmd: Command): void {
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
    .action(probeAction);
}

function addProposalsCommand(cmd: Command): void {
  cmd
    .command('proposals')
    .description('List model proposals in the local review queue (defaults to pending).')
    .option('--status <status>', 'Filter by status (open | approved | rejected | all).', 'open')
    .action(async (options: { status?: string }) => {
      const rows = await runModelsProposals(options.status ?? 'open');
      console.log(JSON.stringify(rows, null, 2));
    });
}

function addRejectCommand(cmd: Command): void {
  cmd
    .command('reject <id>')
    .description(
      'Reject a model proposal with a one-line reason (records the decision + fires the bus event). Requires the orchestrator to be running and HARNESS_ADMIN_TOKEN.'
    )
    .requiredOption('--reason <text>', 'Why the proposal is being rejected')
    .action(async (id: string, options: { reason: string }) => {
      reportMutation(await runModelsReject(id, options.reason));
    });
}

function addApproveCommand(cmd: Command): void {
  cmd
    .command('approve <id>')
    .description(
      'Approve a model proposal (drives the installer + pool update). Requires the orchestrator to be running and HARNESS_ADMIN_TOKEN.'
    )
    .action(async (id: string) => {
      reportMutation(await runModelsApprove(id));
    });
}

function addRefreshCommand(cmd: Command): void {
  cmd
    .command('refresh')
    .description(
      'Force a background-scheduler refresh tick now (emits any model proposals). Exits non-zero on an O4 hard failure (HuggingFace unreachable AND no benchmark snapshot). Requires the orchestrator running + HARNESS_ADMIN_TOKEN.'
    )
    .action(refreshAction);
}

export function createModelsCommand(): Command {
  const cmd = new Command('models').description(
    'Inspect and manage local LLM backends. Ships `probe`, model-proposal review (proposals/approve/reject), and `refresh` (force a scheduler tick).'
  );
  addProbeCommand(cmd);
  addProposalsCommand(cmd);
  addRejectCommand(cmd);
  addApproveCommand(cmd);
  addRefreshCommand(cmd);
  return cmd;
}

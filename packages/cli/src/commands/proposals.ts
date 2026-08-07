import { Command } from 'commander';
import { resolve } from 'node:path';
import {
  listProposals,
  getProposal,
  updateProposal,
  type ListProposalsOptions,
  type Proposal,
  type ProposalStatus,
} from '@harness-engineering/core';
import { envEnabled } from '../mcp/tools/state.js';

function projectRoot(): string {
  return resolve(process.env['HARNESS_PROJECT_ROOT'] ?? process.cwd());
}

function summarizeProposal(p: Proposal): Record<string, unknown> {
  const base = {
    id: p.id,
    status: p.status,
    proposedBy: p.proposedBy,
    createdAt: p.createdAt,
  };
  if (p.kind === 'skill') {
    return {
      ...base,
      kind: p.skillKind,
      targetSkill: p.targetSkill,
      name: p.content.name,
      gateLastRunAt: p.gate?.lastRunAt,
      findings: p.gate?.findings?.length ?? 0,
    };
  }
  return {
    ...base,
    kind: p.kind,
    targetSkill: undefined,
    name: p.model.target.ollamaName,
    gateLastRunAt: undefined,
    findings: 0,
  };
}

export async function runProposalsList(
  status?: ProposalStatus | 'all'
): Promise<Record<string, unknown>[]> {
  const opts: ListProposalsOptions = { kind: 'skill' };
  if (status) opts.status = status;
  const proposals = await listProposals(projectRoot(), opts);
  return proposals.map(summarizeProposal);
}

export async function runProposalsShow(id: string): Promise<Proposal | null> {
  return getProposal(projectRoot(), id);
}

export async function runProposalsReject(id: string, reason: string): Promise<Proposal> {
  const decision = {
    decidedAt: new Date().toISOString(),
    decidedBy: process.env['USER'] ?? 'cli',
    action: 'rejected' as const,
    reason,
  };
  return updateProposal(projectRoot(), id, { status: 'rejected', decision });
}

export interface ProposalsStatusReport {
  queue: {
    open: number;
    gateRunning: number;
    gateFailed: number;
    approved: number;
    rejected: number;
    total: number;
  };
  emitters: {
    manualEmit: { surface: 'emit_skill_proposal'; available: true };
    retrospection: {
      enabled: boolean;
      envFlagSet: boolean;
      providerResolvable: boolean;
      dormantReason?: string;
    };
  };
}

/**
 * Report the real state of the skill-proposal loop: queue counts by status plus
 * whether each emission surface is live or dormant (and why).
 *
 * Provider-independent by design — retrospection enablement is derived from env
 * only, using the SAME predicates the runtime uses so the report cannot drift
 * from behaviour:
 *  - the truthy-flag test reuses `envEnabled` (`1|true|yes|on`, case-insensitive);
 *  - provider-resolvability mirrors `resolveAnalysisProvider`'s precedence by
 *    env-var presence (`ANTHROPIC_API_KEY` else `HARNESS_ANALYSIS_BASE_URL`),
 *    never constructing a provider or importing `@harness-engineering/intelligence`.
 *
 * Never throws on a degraded store — `listProposals` returns `[]` on a missing
 * or unreadable `.harness/proposals/` and skips malformed records.
 */
export async function runProposalsStatus(
  env: NodeJS.ProcessEnv,
  projectRoot?: string
): Promise<ProposalsStatusReport> {
  // Fallback mirrors the module's `projectRoot()` (the param shadows it here).
  const root = projectRoot ?? resolve(process.env['HARNESS_PROJECT_ROOT'] ?? process.cwd());
  const proposals = await listProposals(root, { kind: 'skill' });

  const queue = {
    open: 0,
    gateRunning: 0,
    gateFailed: 0,
    approved: 0,
    rejected: 0,
    total: proposals.length,
  };
  for (const p of proposals) {
    switch (p.status) {
      case 'open':
        queue.open += 1;
        break;
      case 'gate-running':
        queue.gateRunning += 1;
        break;
      case 'gate-failed':
        queue.gateFailed += 1;
        break;
      case 'approved':
        queue.approved += 1;
        break;
      case 'rejected':
        queue.rejected += 1;
        break;
    }
  }

  const envFlagSet = envEnabled(env.HARNESS_SESSION_RETROSPECTION);
  const providerResolvable =
    (env.ANTHROPIC_API_KEY?.trim() ?? '') !== '' ||
    (env.HARNESS_ANALYSIS_BASE_URL?.trim() ?? '') !== '';
  const enabled = envFlagSet && providerResolvable;

  const retrospection: ProposalsStatusReport['emitters']['retrospection'] = {
    enabled,
    envFlagSet,
    providerResolvable,
  };
  if (!enabled) {
    const missing: string[] = [];
    if (!envFlagSet) missing.push('HARNESS_SESSION_RETROSPECTION unset');
    if (!providerResolvable) {
      missing.push(
        'no analysis provider resolvable (set ANTHROPIC_API_KEY or HARNESS_ANALYSIS_BASE_URL)'
      );
    }
    retrospection.dormantReason = missing.join('; ');
  }

  return {
    queue,
    emitters: {
      manualEmit: { surface: 'emit_skill_proposal', available: true },
      retrospection,
    },
  };
}

const ALLOWED_STATUSES: Array<ProposalStatus | 'all'> = [
  'open',
  'gate-running',
  'gate-failed',
  'approved',
  'rejected',
  'all',
];

function fail(message: string): void {
  console.error(message);
  process.exitCode = 1;
}

async function actListCommand(opts: { status?: string }): Promise<void> {
  const raw = opts.status ?? 'open';
  if (!ALLOWED_STATUSES.includes(raw as ProposalStatus | 'all')) {
    fail(`Error: unknown status "${raw}"`);
    return;
  }
  const proposals = await runProposalsList(raw as ProposalStatus | 'all');
  console.log(JSON.stringify(proposals, null, 2));
}

async function actShowCommand(id: string): Promise<void> {
  const proposal = await runProposalsShow(id);
  if (!proposal) {
    fail(`No such proposal: ${id}`);
    return;
  }
  console.log(JSON.stringify(proposal, null, 2));
}

async function actRejectCommand(id: string, opts: { reason: string }): Promise<void> {
  try {
    const updated = await runProposalsReject(id, opts.reason);
    console.log(JSON.stringify(summarizeProposal(updated), null, 2));
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}

async function actApproveCommand(id: string): Promise<void> {
  const orchestratorUrl = process.env['HARNESS_ORCHESTRATOR_URL'] ?? 'http://127.0.0.1:4577';
  const token = process.env['HARNESS_ADMIN_TOKEN'];
  if (!token) {
    fail('HARNESS_ADMIN_TOKEN is required to approve proposals (manage-proposals scope).');
    return;
  }
  try {
    const res = await fetch(`${orchestratorUrl}/api/v1/proposals/${id}/approve`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      fail(`HTTP ${res.status}: ${await res.text()}`);
      return;
    }
    console.log(await res.text());
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}

async function actStatusCommand(_opts: unknown, cmd: Command): Promise<void> {
  // `--json` is a global program option; read it merged with any local flag.
  const json = Boolean(cmd.optsWithGlobals().json);
  const report = await runProposalsStatus(process.env);
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  const { queue, emitters } = report;
  console.log(
    `Queue: ${queue.total} total — open ${queue.open}, gate-running ${queue.gateRunning}, ` +
      `gate-failed ${queue.gateFailed}, approved ${queue.approved}, rejected ${queue.rejected}`
  );
  console.log(
    `Manual emit (${emitters.manualEmit.surface}): available — agents call it to capture a candidate`
  );
  const r = emitters.retrospection;
  const state = r.enabled ? 'live' : 'dormant';
  const detail = r.enabled ? '' : ` — ${r.dormantReason}`;
  console.log(`Session-terminus retrospection: ${state}${detail}`);
}

export function createProposalsCommand(): Command {
  const cmd = new Command('proposals').description('Skill-proposal review queue');

  cmd
    .command('list')
    .description('List skill proposals in the local queue')
    .option(
      '--status <status>',
      `Filter by status — one of ${ALLOWED_STATUSES.join(' | ')}`,
      'open'
    )
    .action(actListCommand);

  cmd.command('show <id>').description('Show a single proposal in full').action(actShowCommand);

  cmd
    .command('reject <id>')
    .description('Reject a proposal with a one-line reason')
    .requiredOption('--reason <text>', 'Why the proposal is being rejected')
    .action(actRejectCommand);

  cmd
    .command('approve <id>')
    .description(
      'Approve a proposal (runs the soundness-review gate then promotes). Requires the orchestrator to be running.'
    )
    .action(actApproveCommand);

  cmd
    .command('status')
    .description(
      'Show queue counts and whether each proposal emitter is live or dormant (use --json for the full report)'
    )
    .action(actStatusCommand);

  return cmd;
}

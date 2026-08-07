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
import { envEnabled } from '../utils/env-flag.js';

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

/** Env-presence proxy for `resolveAnalysisProvider` precedence (Anthropic → local /v1). */
function providerResolvable(env: NodeJS.ProcessEnv): boolean {
  if (env['ANTHROPIC_API_KEY']?.trim()) return true;
  if (env['HARNESS_ANALYSIS_BASE_URL']?.trim()) return true;
  return false;
}

export async function runProposalsStatus(
  env: NodeJS.ProcessEnv,
  projectRootPath: string
): Promise<ProposalsStatusReport> {
  const proposals = await listProposals(projectRootPath, { kind: 'skill' });
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
        queue.open++;
        break;
      case 'gate-running':
        queue.gateRunning++;
        break;
      case 'gate-failed':
        queue.gateFailed++;
        break;
      case 'approved':
        queue.approved++;
        break;
      case 'rejected':
        queue.rejected++;
        break;
    }
  }

  const envFlagSet = envEnabled(env['HARNESS_SESSION_RETROSPECTION']);
  const resolvable = providerResolvable(env);
  const enabled = envFlagSet && resolvable;
  // Precedence mirrors the runtime (state.ts): flag checked before provider.
  let dormantReason: string | undefined;
  if (!envFlagSet) {
    dormantReason =
      'HARNESS_SESSION_RETROSPECTION is not set — session-terminus retrospection is opt-in';
  } else if (!resolvable) {
    dormantReason =
      'no analysis provider resolvable — set ANTHROPIC_API_KEY or HARNESS_ANALYSIS_BASE_URL';
  }

  return {
    queue,
    emitters: {
      manualEmit: { surface: 'emit_skill_proposal', available: true },
      retrospection: {
        enabled,
        envFlagSet,
        providerResolvable: resolvable,
        ...(dormantReason ? { dormantReason } : {}),
      },
    },
  };
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

export async function actStatusCommand(opts: { json?: boolean }): Promise<void> {
  const report = await runProposalsStatus(process.env, projectRoot());
  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  const q = report.queue;
  const r = report.emitters.retrospection;
  console.log('Skill-proposal queue');
  console.log(
    `  open ${q.open}  gate-running ${q.gateRunning}  gate-failed ${q.gateFailed}` +
      `  approved ${q.approved}  rejected ${q.rejected}  (total ${q.total})`
  );
  console.log('Emitters');
  console.log('  manual emit (emit_skill_proposal): available');
  console.log(
    `  retrospection: ${r.enabled ? 'ENABLED' : 'dormant'}` +
      `  [flag ${r.envFlagSet ? 'set' : 'unset'}, provider ${r.providerResolvable ? 'resolvable' : 'unresolvable'}]`
  );
  if (r.dormantReason) console.log(`    reason: ${r.dormantReason}`);
  // Status is a report, never a gate: exit 0 always.
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
      'Report queue counts and whether each emission surface (manual emit, retrospection) is live or dormant'
    )
    .option('--json', 'Emit the machine-readable ProposalsStatusReport')
    .action(actStatusCommand);

  return cmd;
}

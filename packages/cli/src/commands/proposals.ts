import { Command } from 'commander';
import { resolve } from 'node:path';
import {
  listProposals,
  getProposal,
  updateProposal,
  type ListProposalsOptions,
  type SkillProposal,
  type ProposalStatus,
} from '@harness-engineering/core';

function projectRoot(): string {
  return resolve(process.env['HARNESS_PROJECT_ROOT'] ?? process.cwd());
}

function summarizeProposal(p: SkillProposal): Record<string, unknown> {
  return {
    id: p.id,
    kind: p.kind,
    targetSkill: p.targetSkill,
    name: p.content.name,
    status: p.status,
    proposedBy: p.proposedBy,
    createdAt: p.createdAt,
    gateLastRunAt: p.gate?.lastRunAt,
    findings: p.gate?.findings?.length ?? 0,
  };
}

export async function runProposalsList(
  status?: ProposalStatus | 'all'
): Promise<Record<string, unknown>[]> {
  const opts: ListProposalsOptions = {};
  if (status) opts.status = status;
  const proposals = await listProposals(projectRoot(), opts);
  return proposals.map(summarizeProposal);
}

export async function runProposalsShow(id: string): Promise<SkillProposal | null> {
  return getProposal(projectRoot(), id);
}

export async function runProposalsReject(id: string, reason: string): Promise<SkillProposal> {
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
  const cmd = new Command('proposals').description('Skill-proposal review queue (Hermes Phase 4)');

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

  return cmd;
}

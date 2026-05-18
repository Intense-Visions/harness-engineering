import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  SkillProposalSchema,
  EmitSkillProposalInputSchema,
  type SkillProposal,
  type EmitSkillProposalInput,
  type ProposalStatus,
} from '@harness-engineering/types';

export function proposalsDir(projectPath: string): string {
  return path.join(projectPath, '.harness', 'proposals');
}

function proposalPath(projectPath: string, id: string): string {
  return path.join(proposalsDir(projectPath), `${id}.json`);
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function writeAtomic(filePath: string, content: string): void {
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, content);
  fs.renameSync(tmpPath, filePath);
}

export class ProposalNotFoundError extends Error {
  constructor(id: string) {
    super(`proposal not found: ${id}`);
    this.name = 'ProposalNotFoundError';
  }
}

export class ProposalConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProposalConflictError';
  }
}

/**
 * Create a new proposal on disk. Generates a uuid, validates the payload,
 * and writes `.harness/proposals/<id>.json` atomically.
 */
export async function createProposal(
  projectPath: string,
  input: EmitSkillProposalInput
): Promise<SkillProposal> {
  const validated = EmitSkillProposalInputSchema.parse(input);

  const id = `proposal_${randomUUID().replace(/-/g, '')}`;
  const proposal: SkillProposal = SkillProposalSchema.parse({
    id,
    createdAt: new Date().toISOString(),
    kind: validated.kind,
    targetSkill: validated.targetSkill,
    proposedBy: validated.proposedBy,
    source: {
      sessionId: validated.sessionId,
      taskId: validated.taskId,
      justification: validated.justification,
    },
    content: validated.content,
    status: 'open',
  });

  // Refinement collision: at most one open refinement per target skill.
  if (proposal.kind === 'refinement' && proposal.targetSkill) {
    const existing = await listProposals(projectPath, { status: 'open' });
    const clash = existing.find(
      (p) => p.kind === 'refinement' && p.targetSkill === proposal.targetSkill
    );
    if (clash) {
      throw new ProposalConflictError(
        `An open refinement proposal already exists for skill "${proposal.targetSkill}" (id: ${clash.id})`
      );
    }
  }

  const dir = proposalsDir(projectPath);
  ensureDir(dir);
  writeAtomic(proposalPath(projectPath, id), JSON.stringify(proposal, null, 2));
  return proposal;
}

export async function getProposal(projectPath: string, id: string): Promise<SkillProposal | null> {
  const file = proposalPath(projectPath, id);
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    const parsed = SkillProposalSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export interface ListProposalsOptions {
  status?: ProposalStatus | 'all';
}

export async function listProposals(
  projectPath: string,
  opts: ListProposalsOptions = {}
): Promise<SkillProposal[]> {
  const dir = proposalsDir(projectPath);
  let files: string[];
  try {
    files = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const out: SkillProposal[] = [];
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const id = file.slice(0, -'.json'.length);
    const proposal = await getProposal(projectPath, id);
    if (!proposal) continue;
    if (opts.status && opts.status !== 'all' && proposal.status !== opts.status) continue;
    out.push(proposal);
  }
  // Stable, newest-first ordering keyed on createdAt.
  out.sort((a, b) => (a.createdAt > b.createdAt ? -1 : a.createdAt < b.createdAt ? 1 : 0));
  return out;
}

/**
 * Apply a shallow patch to an existing proposal. Returns the updated proposal.
 * Patch is validated through SkillProposalSchema (round-trip), preserving
 * cross-field invariants (kind ↔ content shape).
 */
export async function updateProposal(
  projectPath: string,
  id: string,
  patch: Partial<SkillProposal>
): Promise<SkillProposal> {
  const current = await getProposal(projectPath, id);
  if (!current) throw new ProposalNotFoundError(id);
  // Forbid mutation of id/createdAt/kind through this path; those are immutable.
  const next = SkillProposalSchema.parse({
    ...current,
    ...patch,
    id: current.id,
    createdAt: current.createdAt,
    kind: current.kind,
  });
  writeAtomic(proposalPath(projectPath, id), JSON.stringify(next, null, 2));
  return next;
}

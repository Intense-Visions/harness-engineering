import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  ProposalSchema,
  SkillProposalSchema,
  EmitSkillProposalInputSchema,
  type Proposal,
  type SkillProposal,
  type ModelProposalRecord,
  type ModelProposalContent,
  type ProposalSource,
  type EmitSkillProposalInput,
  type ProposalStatus,
  type ProposalType,
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
    kind: 'skill',
    skillKind: validated.kind,
    targetSkill: validated.targetSkill,
    proposedBy: validated.proposedBy,
    source: {
      sessionId: validated.sessionId,
      taskId: validated.taskId,
      justification: validated.justification,
    },
    content: validated.content,
    status: 'open',
  }) as SkillProposal;

  // Refinement collision: at most one open refinement per target skill.
  if (proposal.skillKind === 'refinement' && proposal.targetSkill) {
    const existing = await listProposals(projectPath, { status: 'open' });
    const clash = existing
      .filter((p): p is SkillProposal => p.kind === 'skill')
      .find((p) => p.skillKind === 'refinement' && p.targetSkill === proposal.targetSkill);
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

/**
 * Persist a model-pool recommendation as a `kind: 'model'` proposal record.
 * Generates an id, wraps the content in the discriminated record shape, and
 * writes `.harness/proposals/<id>.json` atomically. The scheduler's
 * `emitProposal` seam calls this once per diff proposal.
 */
export async function createModelProposal(
  projectPath: string,
  content: ModelProposalContent,
  opts: { proposedBy?: string; source?: ProposalSource } = {}
): Promise<ModelProposalRecord> {
  const id = `proposal_${randomUUID().replace(/-/g, '')}`;
  const record = ProposalSchema.parse({
    id,
    createdAt: new Date().toISOString(),
    kind: 'model',
    proposedBy: opts.proposedBy ?? 'orchestrator',
    source: opts.source ?? { justification: content.justification.summary },
    model: content,
    status: 'open',
  }) as ModelProposalRecord;
  const dir = proposalsDir(projectPath);
  ensureDir(dir);
  writeAtomic(proposalPath(projectPath, id), JSON.stringify(record, null, 2));
  return record;
}

export async function getProposal(projectPath: string, id: string): Promise<Proposal | null> {
  const file = proposalPath(projectPath, id);
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    const parsed = ProposalSchema.safeParse(JSON.parse(raw));
    return parsed.success ? (parsed.data as Proposal) : null;
  } catch {
    return null;
  }
}

export interface ListProposalsOptions {
  status?: ProposalStatus | 'all';
  kind?: ProposalType;
}

export async function listProposals(
  projectPath: string,
  opts: ListProposalsOptions = {}
): Promise<Proposal[]> {
  const dir = proposalsDir(projectPath);
  let files: string[];
  try {
    files = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const out: Proposal[] = [];
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const id = file.slice(0, -'.json'.length);
    const proposal = await getProposal(projectPath, id);
    if (!proposal) continue;
    if (opts.status && opts.status !== 'all' && proposal.status !== opts.status) continue;
    if (opts.kind && proposal.kind !== opts.kind) continue;
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
  patch: Partial<SkillProposal> & Partial<ModelProposalRecord>
): Promise<Proposal> {
  const current = await getProposal(projectPath, id);
  if (!current) throw new ProposalNotFoundError(id);
  // Forbid mutation of id/createdAt/kind (and skillKind) through this path; immutable.
  const base = {
    ...current,
    ...patch,
    id: current.id,
    createdAt: current.createdAt,
    kind: current.kind,
  };
  const next = ProposalSchema.parse(
    current.kind === 'skill' ? { ...base, skillKind: (current as SkillProposal).skillKind } : base
  ) as Proposal;
  writeAtomic(proposalPath(projectPath, id), JSON.stringify(next, null, 2));
  return next;
}

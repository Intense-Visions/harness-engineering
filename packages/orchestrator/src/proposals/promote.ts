import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import {
  getProposal,
  updateProposal,
  ProposalNotFoundError,
  type SkillProposal,
} from '@harness-engineering/core';

export class GateNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GateNotReadyError';
  }
}

export class PromotionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PromotionError';
  }
}

export interface PromotionResult {
  proposalId: string;
  skillPath: string;
  /** Provenance field stamped onto the promoted skill. */
  provenance: 'agent-proposed';
}

const GATE_FRESHNESS_MS = 24 * 60 * 60 * 1000;

function skillDir(projectPath: string, name: string): string {
  return path.join(projectPath, 'agents', 'skills', 'claude-code', name);
}

function readIfExists(p: string): string | null {
  try {
    return fs.readFileSync(p, 'utf-8');
  } catch {
    return null;
  }
}

function injectProvenanceIntoYaml(yamlText: string, proposalId: string): string {
  let doc: unknown;
  try {
    doc = parseYaml(yamlText);
  } catch (err) {
    throw new PromotionError(
      `skill.yaml does not parse: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  if (!doc || typeof doc !== 'object') {
    throw new PromotionError('skill.yaml top-level is not a mapping');
  }
  const obj = doc as Record<string, unknown>;
  obj['provenance'] = 'agent-proposed';
  obj['originatingProposalId'] = proposalId;
  return stringifyYaml(obj);
}

function assertGateReady(proposal: SkillProposal): void {
  if (proposal.status !== 'gate-running') {
    throw new GateNotReadyError(
      `proposal ${proposal.id} is in status "${proposal.status}"; the gate must pass before promotion`
    );
  }
  const findings = proposal.gate?.findings ?? [];
  if (findings.some((f) => f.severity === 'error')) {
    throw new GateNotReadyError(
      `proposal ${proposal.id} has unresolved gate errors; re-run the gate after edits`
    );
  }
  if (!proposal.gate?.lastRunAt) {
    throw new GateNotReadyError(`proposal ${proposal.id} has no gate run on record`);
  }
  const ageMs = Date.now() - Date.parse(proposal.gate.lastRunAt);
  if (!Number.isFinite(ageMs) || ageMs > GATE_FRESHNESS_MS) {
    throw new GateNotReadyError(
      `proposal ${proposal.id} gate run is older than 24h; re-run before approving`
    );
  }
}

async function promoteNewSkill(
  projectPath: string,
  proposal: SkillProposal
): Promise<{ skillPath: string }> {
  const target = skillDir(projectPath, proposal.content.name);
  if (fs.existsSync(target)) {
    throw new PromotionError(
      `a catalog skill already exists at ${target}; use a refinement proposal to update it`
    );
  }
  fs.mkdirSync(target, { recursive: true });
  const yamlOut = injectProvenanceIntoYaml(proposal.content.skillYaml ?? '', proposal.id);
  fs.writeFileSync(path.join(target, 'skill.yaml'), yamlOut);
  fs.writeFileSync(path.join(target, 'SKILL.md'), proposal.content.skillMd ?? '');
  return { skillPath: target };
}

async function promoteRefinement(
  projectPath: string,
  proposal: SkillProposal
): Promise<{ skillPath: string }> {
  if (!proposal.targetSkill) {
    throw new PromotionError('refinement proposal is missing targetSkill');
  }
  const target = skillDir(projectPath, proposal.targetSkill);
  if (!fs.existsSync(target)) {
    throw new PromotionError(
      `target skill ${proposal.targetSkill} does not exist at ${target}; cannot refine`
    );
  }
  // D4: reviewer is expected to have applied the diff via the edit action.
  // Promotion only updates provenance metadata; if the file is unchanged
  // since the proposal was emitted, fail loudly so the reviewer notices.
  const yamlPath = path.join(target, 'skill.yaml');
  const before = readIfExists(yamlPath) ?? '';
  const after = injectProvenanceIntoYaml(before, proposal.id);
  if (after === before) {
    throw new PromotionError(
      'no metadata changes detected; check that the reviewer applied the proposed diff before approving'
    );
  }
  fs.writeFileSync(yamlPath, after);
  return { skillPath: target };
}

/**
 * Promote a proposal to the skill catalog. Caller is responsible for
 * emitting `proposal.approved` after a successful return.
 */
export async function promote(
  projectPath: string,
  proposalId: string,
  decidedBy: string
): Promise<PromotionResult> {
  const proposal = await getProposal(projectPath, proposalId);
  if (!proposal) throw new ProposalNotFoundError(proposalId);
  assertGateReady(proposal);

  const out =
    proposal.kind === 'new-skill'
      ? await promoteNewSkill(projectPath, proposal)
      : await promoteRefinement(projectPath, proposal);

  await updateProposal(projectPath, proposalId, {
    status: 'approved',
    decision: {
      decidedAt: new Date().toISOString(),
      decidedBy,
      action: 'approved',
    },
  });

  return {
    proposalId,
    skillPath: out.skillPath,
    provenance: 'agent-proposed',
  };
}

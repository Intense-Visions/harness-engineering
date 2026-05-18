import type { EventEmitter } from 'node:events';
import type { SkillProposal } from '@harness-engineering/core';

/**
 * Phase 4 — thin wrappers around the orchestrator event bus that emit the
 * three `proposal.*` lifecycle events with a stable, validated payload
 * shape. Both the webhook fan-out (gateway/webhooks/events.ts) and the
 * in-process notification dispatcher (notifications/events.ts) subscribe
 * to these topics; their envelope derivers know the field names below.
 */

export interface ProposalCreatedData {
  id: string;
  kind: SkillProposal['kind'];
  name: string;
  targetSkill?: string;
  proposedBy: string;
  justification: string;
}

export interface ProposalApprovedData {
  id: string;
  kind: SkillProposal['kind'];
  name: string;
  targetSkill?: string;
  decidedBy: string;
}

export interface ProposalRejectedData {
  id: string;
  kind: SkillProposal['kind'];
  name: string;
  decidedBy: string;
  reason: string;
}

function emit(bus: EventEmitter, topic: string, data: unknown): void {
  bus.emit(topic, data);
}

export function emitProposalCreated(bus: EventEmitter, proposal: SkillProposal): void {
  const data: ProposalCreatedData = {
    id: proposal.id,
    kind: proposal.kind,
    name: proposal.content.name,
    proposedBy: proposal.proposedBy,
    justification: proposal.source.justification,
  };
  if (proposal.targetSkill) data.targetSkill = proposal.targetSkill;
  emit(bus, 'proposal.created', data);
}

export function emitProposalApproved(bus: EventEmitter, proposal: SkillProposal): void {
  const data: ProposalApprovedData = {
    id: proposal.id,
    kind: proposal.kind,
    name: proposal.content.name,
    decidedBy: proposal.decision?.decidedBy ?? '(unknown)',
  };
  if (proposal.targetSkill) data.targetSkill = proposal.targetSkill;
  emit(bus, 'proposal.approved', data);
}

export function emitProposalRejected(bus: EventEmitter, proposal: SkillProposal): void {
  const data: ProposalRejectedData = {
    id: proposal.id,
    kind: proposal.kind,
    name: proposal.content.name,
    decidedBy: proposal.decision?.decidedBy ?? '(unknown)',
    reason: proposal.decision?.reason ?? '(no reason given)',
  };
  emit(bus, 'proposal.rejected', data);
}

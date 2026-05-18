import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import type { SkillProposal } from '@harness-engineering/core';
import {
  emitProposalCreated,
  emitProposalApproved,
  emitProposalRejected,
} from '../../src/proposals/events';

function buildProposal(overrides: Partial<SkillProposal> = {}): SkillProposal {
  return {
    id: 'proposal_test',
    createdAt: new Date().toISOString(),
    kind: 'new-skill',
    proposedBy: 'tester',
    source: { justification: 'because the pattern repeats often enough to merit a skill.' },
    content: {
      name: 'demo-skill',
      description: 'A demo skill for tests in the orchestrator events module.',
      skillYaml: 'name: demo-skill\nversion: "0.1.0"\n',
      skillMd: '# Demo Skill\n',
    },
    status: 'open',
    ...overrides,
  };
}

function collect<T extends string>(bus: EventEmitter, topic: T): Array<unknown> {
  const out: Array<unknown> = [];
  bus.on(topic, (d: unknown) => out.push(d));
  return out;
}

describe('proposal event emitters', () => {
  it('emitProposalCreated emits proposal.created with the right shape', () => {
    const bus = new EventEmitter();
    const seen = collect(bus, 'proposal.created');
    emitProposalCreated(bus, buildProposal());
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      id: 'proposal_test',
      kind: 'new-skill',
      name: 'demo-skill',
      proposedBy: 'tester',
    });
  });

  it('emitProposalCreated includes targetSkill on refinements', () => {
    const bus = new EventEmitter();
    const seen = collect(bus, 'proposal.created');
    emitProposalCreated(
      bus,
      buildProposal({
        kind: 'refinement',
        targetSkill: 'existing-skill',
        content: {
          name: 'existing-skill',
          description: 'A refinement to the existing skill.',
          diff: '--- a/SKILL.md\n+++ b/SKILL.md\n@@\n+## phase\n',
        },
      })
    );
    expect(seen[0]).toMatchObject({ targetSkill: 'existing-skill' });
  });

  it('emitProposalApproved emits proposal.approved with decidedBy', () => {
    const bus = new EventEmitter();
    const seen = collect(bus, 'proposal.approved');
    emitProposalApproved(
      bus,
      buildProposal({
        status: 'approved',
        decision: {
          decidedAt: new Date().toISOString(),
          decidedBy: 'cwarner',
          action: 'approved',
        },
      })
    );
    expect(seen[0]).toMatchObject({ decidedBy: 'cwarner', kind: 'new-skill' });
  });

  it('emitProposalRejected emits proposal.rejected with reason', () => {
    const bus = new EventEmitter();
    const seen = collect(bus, 'proposal.rejected');
    emitProposalRejected(
      bus,
      buildProposal({
        status: 'rejected',
        decision: {
          decidedAt: new Date().toISOString(),
          decidedBy: 'cwarner',
          action: 'rejected',
          reason: 'duplicate of existing skill',
        },
      })
    );
    expect(seen[0]).toMatchObject({
      decidedBy: 'cwarner',
      reason: 'duplicate of existing skill',
    });
  });
});

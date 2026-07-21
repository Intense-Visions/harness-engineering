import { describe, it, expect, beforeEach } from 'vitest';
import { findAgentThreadId } from '../../../../src/client/components/orchestrator/navigation';
import { useThreadStore } from '../../../../src/client/stores/threadStore';
import type { AgentMeta } from '../../../../src/client/types/thread';

/**
 * Helper to seed an agent thread for a given issue. Uses the real store's
 * createThread so the derived id (`agent:<issueId>`) matches production.
 */
function seedAgentThread(issueId: string, overrides: Partial<AgentMeta> = {}): string {
  return useThreadStore.getState().createThread('agent', {
    issueId,
    identifier: `feat/${issueId}`,
    phase: 'StreamingTurn',
    issueTitle: `Agent for ${issueId}`,
    issueDescription: null,
    startedAt: '2026-07-20T00:00:00.000Z',
    backendName: 'claude',
    ...overrides,
  }).id;
}

describe('findAgentThreadId', () => {
  beforeEach(() => {
    useThreadStore.setState({
      threads: new Map(),
      activeThreadId: null,
      lastThreadId: null,
      messages: new Map(),
    });
  });

  it('returns the id of the agent thread matching the issueId', () => {
    const expectedId = seedAgentThread('ISSUE-1');
    expect(findAgentThreadId('ISSUE-1')).toBe(expectedId);
  });

  it('returns undefined when no thread matches the issueId', () => {
    seedAgentThread('ISSUE-1');
    expect(findAgentThreadId('ISSUE-DOES-NOT-EXIST')).toBeUndefined();
  });

  it('returns undefined when the store has no threads at all', () => {
    expect(findAgentThreadId('ISSUE-1')).toBeUndefined();
  });

  it('selects the correct agent thread among several with distinct issueIds', () => {
    seedAgentThread('ISSUE-1');
    const targetId = seedAgentThread('ISSUE-2');
    seedAgentThread('ISSUE-3');
    expect(findAgentThreadId('ISSUE-2')).toBe(targetId);
  });

  it('ignores non-agent threads whose meta carries the same issueId', () => {
    // An attention thread also has an `issueId` field, but findAgentThreadId
    // must only match threads of type 'agent'.
    useThreadStore.getState().createThread('attention', {
      interactionId: 'int-1',
      issueId: 'ISSUE-9',
      reasons: ['Risk'],
      context: null,
    });
    expect(findAgentThreadId('ISSUE-9')).toBeUndefined();

    // Adding an actual agent thread for the same issue now makes it resolvable.
    const agentId = seedAgentThread('ISSUE-9');
    expect(findAgentThreadId('ISSUE-9')).toBe(agentId);
  });
});

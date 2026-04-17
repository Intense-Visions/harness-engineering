import { describe, it, expect } from 'vitest';
import { GraphStore } from '@harness-engineering/graph';
import { ExecutionOutcomeConnector } from '../../src/outcome/connector.js';
import type { ExecutionOutcome } from '../../src/outcome/types.js';

function makeOutcome(overrides: Partial<ExecutionOutcome> = {}): ExecutionOutcome {
  return {
    id: 'outcome:issue-1:1',
    issueId: 'issue-1',
    identifier: 'TEST-1',
    result: 'failure',
    retryCount: 0,
    failureReasons: ['TypeError: undefined is not a function'],
    durationMs: 5000,
    linkedSpecId: 'spec-1',
    affectedSystemNodeIds: [],
    timestamp: '2026-04-14T12:00:00Z',
    ...overrides,
  };
}

describe('ExecutionOutcomeConnector', () => {
  it('creates an execution_outcome node with correct metadata', () => {
    const store = new GraphStore();
    const connector = new ExecutionOutcomeConnector(store);

    const outcome = makeOutcome();
    const result = connector.ingest(outcome);

    expect(result.nodesAdded).toBe(1);
    const node = store.getNode('outcome:issue-1:1');
    expect(node).not.toBeNull();
    expect(node!.type).toBe('execution_outcome');
    expect(node!.name).toContain('TEST-1');
    expect(node!.metadata.result).toBe('failure');
    expect(node!.metadata.retryCount).toBe(0);
    expect(node!.metadata.failureReasons).toEqual(['TypeError: undefined is not a function']);
    expect(node!.metadata.durationMs).toBe(5000);
    expect(node!.metadata.linkedSpecId).toBe('spec-1');
    expect(node!.metadata.issueId).toBe('issue-1');
    expect(node!.metadata.timestamp).toBe('2026-04-14T12:00:00Z');
  });

  it('creates outcome_of edges to affected system nodes', () => {
    const store = new GraphStore();
    // Pre-populate graph with system nodes
    store.addNode({ id: 'module:auth', type: 'module', name: 'auth', metadata: {} });
    store.addNode({ id: 'module:api', type: 'module', name: 'api', metadata: {} });

    const connector = new ExecutionOutcomeConnector(store);
    const outcome = makeOutcome({
      affectedSystemNodeIds: ['module:auth', 'module:api'],
    });

    const result = connector.ingest(outcome);

    expect(result.edgesAdded).toBe(2);
    const authEdges = store.getEdges({
      from: 'outcome:issue-1:1',
      to: 'module:auth',
      type: 'outcome_of',
    });
    expect(authEdges).toHaveLength(1);
    const apiEdges = store.getEdges({
      from: 'outcome:issue-1:1',
      to: 'module:api',
      type: 'outcome_of',
    });
    expect(apiEdges).toHaveLength(1);
  });

  it('skips edges for system nodes not found in the graph', () => {
    const store = new GraphStore();
    // Only add one of two referenced nodes
    store.addNode({ id: 'module:auth', type: 'module', name: 'auth', metadata: {} });

    const connector = new ExecutionOutcomeConnector(store);
    const outcome = makeOutcome({
      affectedSystemNodeIds: ['module:auth', 'module:nonexistent'],
    });

    const result = connector.ingest(outcome);

    expect(result.edgesAdded).toBe(1);
    expect(result.errors).toHaveLength(0);
    // Edge only to the existing node
    const edges = store.getEdges({ from: 'outcome:issue-1:1', type: 'outcome_of' });
    expect(edges).toHaveLength(1);
    expect(edges[0].to).toBe('module:auth');
  });

  it('creates a success outcome with empty failureReasons', () => {
    const store = new GraphStore();
    const connector = new ExecutionOutcomeConnector(store);

    const outcome = makeOutcome({
      id: 'outcome:issue-2:1',
      issueId: 'issue-2',
      result: 'success',
      failureReasons: [],
    });

    const result = connector.ingest(outcome);

    expect(result.nodesAdded).toBe(1);
    const node = store.getNode('outcome:issue-2:1');
    expect(node!.metadata.result).toBe('success');
    expect(node!.metadata.failureReasons).toEqual([]);
  });

  it('records agentPersona in metadata when provided', () => {
    const store = new GraphStore();
    const connector = new ExecutionOutcomeConnector(store);

    const outcome = makeOutcome({ agentPersona: 'task-executor' });
    connector.ingest(outcome);

    const node = store.getNode('outcome:issue-1:1');
    expect(node!.metadata.agentPersona).toBe('task-executor');
  });

  it('omits agentPersona from metadata when not provided', () => {
    const store = new GraphStore();
    const connector = new ExecutionOutcomeConnector(store);

    const outcome = makeOutcome();
    connector.ingest(outcome);

    const node = store.getNode('outcome:issue-1:1');
    expect(node!.metadata.agentPersona).toBeUndefined();
    expect('agentPersona' in node!.metadata).toBe(false);
  });

  it('handles duplicate ingestion gracefully (upsert)', () => {
    const store = new GraphStore();
    const connector = new ExecutionOutcomeConnector(store);

    const outcome = makeOutcome();
    connector.ingest(outcome);
    const result = connector.ingest(outcome);

    // GraphStore.addNode merges on duplicate -- node count stays 1
    expect(result.nodesAdded).toBe(1);
    expect(store.findNodes({ type: 'execution_outcome' })).toHaveLength(1);
  });
});

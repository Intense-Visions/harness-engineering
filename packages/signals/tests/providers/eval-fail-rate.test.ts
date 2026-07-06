import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { GraphStore } from '@harness-engineering/graph';
import type { GraphNode } from '@harness-engineering/graph';
import { evalFailRateProvider } from '../../src/providers/eval-fail-rate';
import { SignalTimelineStore } from '../../src/timeline-store';
import type { SignalContext } from '../../src/types';

// Real `execution_outcome` node shape as written by
// `ExecutionOutcomeConnector.ingest` — verdict in metadata.result, ISO timestamp
// in metadata.timestamp. IDs look like `outcome:issue-1:0` (NEVER bare hex).
function outcomeNode(
  id: string,
  result: 'success' | 'failure' | string,
  timestamp: string
): GraphNode {
  return {
    id,
    type: 'execution_outcome',
    name: `${result}: ${id}`,
    metadata: {
      issueId: id,
      identifier: id,
      result,
      retryCount: 0,
      failureReasons: [],
      durationMs: 1,
      linkedSpecId: null,
      timestamp,
    },
  };
}

function buildGraph(nodes: GraphNode[]): GraphStore {
  const g = new GraphStore();
  for (const n of nodes) g.addNode(n);
  return g;
}

function tmpDir() {
  return path.join(__dirname, '__test-tmp-eval-fail-rate__');
}

describe('evalFailRateProvider', () => {
  let root: string;
  function ctx(graphStore: GraphStore | undefined, now: Date): SignalContext {
    return { projectPath: '/unused', now, timeline: new SignalTimelineStore(root), graphStore };
  }

  beforeEach(() => {
    root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('exposes the correct static contract', () => {
    expect(evalFailRateProvider.id).toBe('eval-fail-rate');
    expect(evalFailRateProvider.label.length).toBeGreaterThan(0);
  });

  it('computes fail-rate % from execution_outcome verdicts in the 30d window', async () => {
    const now = new Date('2026-06-22T00:00:00.000Z');
    // 1 failure + 3 success all dated 2026-06-15 => 25% => alert (> 10)
    const g = buildGraph([
      outcomeNode('outcome:issue-1:0', 'failure', '2026-06-15T10:00:00.000Z'),
      outcomeNode('outcome:issue-2:0', 'success', '2026-06-15T11:00:00.000Z'),
      outcomeNode('outcome:issue-3:0', 'success', '2026-06-15T12:00:00.000Z'),
      outcomeNode('outcome:issue-4:0', 'success', '2026-06-15T13:00:00.000Z'),
    ]);
    const r = await evalFailRateProvider.compute(ctx(g, now));
    expect(r.id).toBe('eval-fail-rate');
    expect(r.value).toBe(25);
    expect(r.unit).toBe('%');
    expect(r.betterDirection).toBe('down');
    expect(r.threshold).toEqual({ warn: 5, alert: 10 });
    expect(r.status).toBe('alert');
  });

  it('returns ok below 5% and warn between 5 and 10', async () => {
    const now = new Date('2026-06-22T00:00:00.000Z');

    // 1 failure + 24 success = 4% => ok
    const okNodes: GraphNode[] = [
      outcomeNode('outcome:issue-fail:0', 'failure', '2026-06-15T10:00:00.000Z'),
    ];
    for (let i = 0; i < 24; i++) {
      okNodes.push(outcomeNode(`outcome:issue-ok-${i}:0`, 'success', '2026-06-15T11:00:00.000Z'));
    }
    const ok = await evalFailRateProvider.compute(ctx(buildGraph(okNodes), now));
    expect(ok.value).toBe(4);
    expect(ok.status).toBe('ok');

    // 2 failures + 23 success = 8% => warn
    const warnNodes: GraphNode[] = [
      outcomeNode('outcome:issue-fail-a:0', 'failure', '2026-06-15T10:00:00.000Z'),
      outcomeNode('outcome:issue-fail-b:0', 'failure', '2026-06-15T10:30:00.000Z'),
    ];
    for (let i = 0; i < 23; i++) {
      warnNodes.push(outcomeNode(`outcome:issue-w-${i}:0`, 'success', '2026-06-15T11:00:00.000Z'));
    }
    const warn = await evalFailRateProvider.compute(ctx(buildGraph(warnNodes), now));
    expect(warn.value).toBe(8);
    expect(warn.status).toBe('warn');
  });

  it('returns pending with null value when zero execution_outcome nodes exist', async () => {
    const now = new Date('2026-06-22T00:00:00.000Z');
    const r = await evalFailRateProvider.compute(ctx(new GraphStore(), now));
    expect(r.status).toBe('pending');
    expect(r.value).toBeNull();
    expect(r.history).toEqual([]);
    expect(r.detail).toMatch(/outcome-eval/);
  });

  it('returns pending when nodes exist but none fall in the 30-day window', async () => {
    const now = new Date('2026-06-22T00:00:00.000Z');
    // single outcome dated 60 days before now => out of window
    const g = buildGraph([
      outcomeNode('outcome:issue-old:0', 'failure', '2026-04-23T10:00:00.000Z'),
    ]);
    const r = await evalFailRateProvider.compute(ctx(g, now));
    expect(r.status).toBe('pending');
    expect(r.value).toBeNull();
  });

  it('returns error when graphStore is absent', async () => {
    const now = new Date('2026-06-22T00:00:00.000Z');
    const r = await evalFailRateProvider.compute(ctx(undefined, now));
    expect(r.status).toBe('error');
    expect(r.value).toBeNull();
  });

  it('returns error (no throw) when findNodes throws', async () => {
    const now = new Date('2026-06-22T00:00:00.000Z');
    const corrupt = {
      findNodes() {
        throw new Error('graph corrupt');
      },
    } as unknown as GraphStore;
    const r = await evalFailRateProvider.compute(ctx(corrupt, now));
    expect(r.status).toBe('error');
    expect(r.value).toBeNull();
  });

  it('ignores nodes with malformed result or timestamp', async () => {
    const now = new Date('2026-06-22T00:00:00.000Z');
    const g = buildGraph([
      outcomeNode('outcome:issue-good-fail:0', 'failure', '2026-06-15T10:00:00.000Z'),
      outcomeNode('outcome:issue-good-ok:0', 'success', '2026-06-15T11:00:00.000Z'),
      outcomeNode('outcome:issue-bad-result:0', 'unknown', '2026-06-15T12:00:00.000Z'),
      outcomeNode('outcome:issue-bad-ts:0', 'failure', 'not-a-date'),
    ]);
    const r = await evalFailRateProvider.compute(ctx(g, now));
    // Only the 2 valid nodes count: 1 failure of 2 => 50%
    expect(r.value).toBe(50);
  });

  it('excludes outcomes older than 30 days from the window', async () => {
    const now = new Date('2026-06-22T00:00:00.000Z');
    const g = buildGraph([
      outcomeNode('outcome:issue-in:0', 'failure', '2026-06-15T10:00:00.000Z'),
      outcomeNode('outcome:issue-out:0', 'failure', '2026-04-23T10:00:00.000Z'), // 60d ago
    ]);
    const r = await evalFailRateProvider.compute(ctx(g, now));
    // Only the in-window failure counts: 1 of 1 => 100%
    expect(r.value).toBe(100);
    expect(r.detail).toMatch(/1 post-merge eval failed/);
  });
});

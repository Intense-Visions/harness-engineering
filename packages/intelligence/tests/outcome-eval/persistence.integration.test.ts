import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GraphStore } from '@harness-engineering/graph';
import { ExecutionOutcomeConnector } from '../../src/outcome/connector.js';
import {
  computePersonaEffectiveness,
  detectBlindSpots,
  recommendPersona,
} from '../../src/effectiveness/scorer.js';
import { OutcomeEvaluator } from '../../src/outcome-eval/evaluator.js';
import type {
  AnalysisProvider,
  AnalysisRequest,
  AnalysisResponse,
} from '../../src/analysis-provider/interface.js';
import type { LlmVerdict } from '../../src/outcome-eval/prompts.js';

function provider(payload: LlmVerdict): AnalysisProvider {
  return {
    async analyze<T>(req: AnalysisRequest): Promise<AnalysisResponse<T>> {
      return {
        result: payload as unknown as T,
        tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        model: req.model ?? 'stub',
        latencyMs: 0,
      };
    },
  };
}

function writeSpec(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'oe-int-'));
  const p = join(dir, 'spec.md');
  writeFileSync(p, body);
  return p;
}

const SPEC = ['# Spec', '## Success Criteria', '1. The endpoint returns 200.', ''].join('\n');

describe('OutcomeEvaluator persistence — real GraphStore + effectiveness scorer (Criterion 6)', () => {
  it('evaluate() writes a scorer-shaped execution_outcome node into a real GraphStore', async () => {
    const store = new GraphStore();
    const p = writeSpec(SPEC);
    await new OutcomeEvaluator(
      provider({
        verdict: 'NOT_SATISFIED',
        confidence: 'high',
        rationale: 'unmet',
        unmetCriteria: ['returns 200'],
      }),
      store
    ).evaluate({ specPath: p, diff: 'd', testOutput: 't' });

    const nodes = store.findNodes({ type: 'execution_outcome' });
    expect(nodes).toHaveLength(1);
    expect(nodes[0].metadata.result).toBe('failure');
    expect(nodes[0].metadata.verdict).toBe('NOT_SATISFIED');
    expect(nodes[0].metadata.linkedSpecId).toBe(p);

    // The scorer can traverse the store without throwing on the evaluator node.
    expect(() => computePersonaEffectiveness(store)).not.toThrow();
    expect(() => detectBlindSpots(store)).not.toThrow();
    expect(() => recommendPersona(store, { systemNodeIds: ['module:api'] })).not.toThrow();

    // v1: no persona/affected systems on the evaluator node -> not counted (D4).
    expect(computePersonaEffectiveness(store)).toEqual([]);
  });

  it('persists the FULL verdict (rationale/authority/unmetCriteria) + commit so a sha-keyed consumer can reconstruct it', async () => {
    const store = new GraphStore();
    const p = writeSpec(SPEC);
    await new OutcomeEvaluator(
      provider({
        verdict: 'NOT_SATISFIED',
        confidence: 'high',
        rationale: 'the 404 branch is missing',
        unmetCriteria: ['404 path unimplemented'],
      }),
      store
    ).evaluate({ specPath: p, diff: 'd', testOutput: 't', commit: 'deadbeef' });

    const nodes = store.findNodes({ type: 'execution_outcome' });
    expect(nodes).toHaveLength(1);
    const m = nodes[0].metadata;
    // The node is a faithful, self-describing record of the verdict.
    expect(m.verdict).toBe('NOT_SATISFIED');
    expect(m.confidence).toBe('high');
    expect(m.rationale).toBe('the 404 branch is missing');
    expect(m.unmetCriteria).toEqual(['404 path unimplemented']);
    // authority is the TS-derived value (high NOT_SATISFIED => blocking), copied
    // onto the node — NEVER read from the LLM payload.
    expect(m.authority).toBe('blocking');
    // The head sha lets a sha-keyed consumer (pre-merge brief) match this node.
    expect(m.commit).toBe('deadbeef');
  });

  it('omits commit from metadata when none is supplied (additive, byte-identical to no-commit wiring)', async () => {
    const store = new GraphStore();
    const p = writeSpec(SPEC);
    await new OutcomeEvaluator(
      provider({ verdict: 'SATISFIED', confidence: 'high', rationale: 'ok', unmetCriteria: [] }),
      store
    ).evaluate({ specPath: p, diff: 'd', testOutput: 't' });

    const m = store.findNodes({ type: 'execution_outcome' })[0].metadata;
    expect('commit' in m).toBe(false);
    expect(m.authority).toBe('advisory'); // SATISFIED => advisory
  });

  it('scorer surfaces a persona-attributed execution_outcome linked to a seeded system node', () => {
    const store = new GraphStore();
    store.addNode({ id: 'module:api', type: 'module', name: 'api', metadata: {} });
    const connector = new ExecutionOutcomeConnector(store);
    connector.ingest({
      id: 'outcome:seed:1',
      issueId: 'seed',
      identifier: 'SEED-1',
      result: 'failure',
      retryCount: 0,
      failureReasons: ['returns 200 unmet'],
      durationMs: 0,
      linkedSpecId: '/spec.md',
      affectedSystemNodeIds: ['module:api'],
      timestamp: '2026-06-22T00:00:00Z',
      agentPersona: 'task-executor',
      metadata: { verdict: 'NOT_SATISFIED', confidence: 'high', source: 'outcome-eval' },
    });

    const scores = computePersonaEffectiveness(store);
    expect(scores).toHaveLength(1);
    expect(scores[0].persona).toBe('task-executor');
    expect(scores[0].systemNodeId).toBe('module:api');
    expect(scores[0].failures).toBe(1);
  });
});

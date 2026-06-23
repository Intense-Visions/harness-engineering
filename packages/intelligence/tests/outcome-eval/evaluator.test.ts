import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { GraphStore } from '@harness-engineering/graph';
import type {
  AnalysisProvider,
  AnalysisRequest,
  AnalysisResponse,
} from '../../src/analysis-provider/interface.js';
import { OutcomeEvaluator } from '../../src/outcome-eval/evaluator.js';
import { OUTCOME_EVAL_SYSTEM_PROMPT, verdictSchema } from '../../src/outcome-eval/prompts.js';
import type { LlmVerdict } from '../../src/outcome-eval/prompts.js';

interface StubProvider {
  provider: AnalysisProvider;
  analyzeSpy: ReturnType<typeof vi.fn>;
  /** The last AnalysisRequest the evaluator passed to analyze(). */
  lastRequest: () => AnalysisRequest | undefined;
}

/**
 * Realistic AnalysisProvider stub: captures the AnalysisRequest, optionally runs
 * the request's responseSchema.parse on its payload (as real providers do for
 * structured output), and returns the payload as the result. A regression that
 * drops the system prompt or forwarded model is observable via lastRequest().
 */
function makeProvider(
  payload: Record<string, unknown>,
  opts: { parseWithSchema?: boolean } = {}
): StubProvider {
  let captured: AnalysisRequest | undefined;
  const analyzeSpy = vi.fn();
  const provider: AnalysisProvider = {
    async analyze<T>(request: AnalysisRequest): Promise<AnalysisResponse<T>> {
      analyzeSpy(request);
      captured = request;
      const result = (opts.parseWithSchema ? request.responseSchema.parse(payload) : payload) as T;
      return {
        result,
        tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        model: request.model ?? 'stub',
        latencyMs: 0,
      };
    },
  };
  return { provider, analyzeSpy, lastRequest: () => captured };
}

/** Provider whose analyze() always rejects — models rate limit / network errors. */
function makeRejectingProvider(reason: string): StubProvider {
  const analyzeSpy = vi.fn();
  const provider: AnalysisProvider = {
    async analyze<T>(request: AnalysisRequest): Promise<AnalysisResponse<T>> {
      analyzeSpy(request);
      throw new Error(reason);
    },
  };
  return { provider, analyzeSpy, lastRequest: () => undefined };
}

const SPEC_WITH_CRITERIA = [
  '# Spec',
  '## Success Criteria',
  '1. The endpoint returns 200.',
  '',
].join('\n');

const SPEC_NO_SECTION = ['# Spec', '## Random Heading', 'nothing judgable here', ''].join('\n');

function writeSpec(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'outcome-eval-'));
  const p = join(dir, 'spec.md');
  writeFileSync(p, body);
  return p;
}

describe('OutcomeEvaluator — no judgable section', () => {
  it('returns INCONCLUSIVE/advisory WITHOUT calling the provider', async () => {
    const { provider, analyzeSpy } = makeProvider({});
    const noSectionPath = writeSpec(SPEC_NO_SECTION);
    const evaluator = new OutcomeEvaluator(provider, new GraphStore());
    const verdict = await evaluator.evaluate({
      specPath: noSectionPath,
      diff: 'some diff',
      testOutput: 'ok',
    });
    expect(analyzeSpy).not.toHaveBeenCalled();
    expect(verdict.verdict).toBe('INCONCLUSIVE');
    expect(verdict.authority).toBe('advisory');
    expect(verdict.judgedAgainst).toBe('overview');
    expect(verdict.unmetCriteria).toEqual([]);
  });

  it('treats a pre-resolved empty/whitespace specSection as no-section (OE-SUG-3)', async () => {
    const { provider, analyzeSpy } = makeProvider({});
    // specPath is irrelevant: the empty specSection short-circuits before readFile.
    const evaluator = new OutcomeEvaluator(provider, new GraphStore());
    const verdict = await evaluator.evaluate({
      specPath: '/nonexistent/spec.md',
      diff: 'd',
      testOutput: 't',
      specSection: '   \n\t  ',
    });
    // No LLM call: must NOT be tagged success-criteria.
    expect(analyzeSpy).not.toHaveBeenCalled();
    expect(verdict.verdict).toBe('INCONCLUSIVE');
    expect(verdict.authority).toBe('advisory');
    expect(verdict.judgedAgainst).toBe('overview');
    expect(verdict.confidence).toBe('low');
  });
});

describe('OutcomeEvaluator — provider request shape (stub realism)', () => {
  it('forwards the system prompt, a populated user prompt, the schema, and the model', async () => {
    const p = writeSpec(SPEC_WITH_CRITERIA);
    const { provider, lastRequest } = makeProvider(
      {
        verdict: 'SATISFIED',
        confidence: 'medium',
        rationale: 'returns 200 met',
        unmetCriteria: [],
      } satisfies LlmVerdict,
      { parseWithSchema: true }
    );
    const evaluator = new OutcomeEvaluator(provider, new GraphStore(), { model: 'gpt-judge' });
    await evaluator.evaluate({ specPath: p, diff: 'DIFF_X', testOutput: 'TEST_Y' });
    const req = lastRequest();
    expect(req).toBeDefined();
    expect(req?.systemPrompt).toBe(OUTCOME_EVAL_SYSTEM_PROMPT);
    expect(req?.prompt.length).toBeGreaterThan(0);
    expect(req?.prompt).toContain('returns 200'); // section body
    expect(req?.prompt).toContain('DIFF_X'); // diff
    expect(req?.prompt).toContain('TEST_Y'); // test output
    expect(req?.responseSchema).toBe(verdictSchema);
    expect(req?.model).toBe('gpt-judge'); // forwarded when provided
  });

  it('omits the model when no override is configured', async () => {
    const p = writeSpec(SPEC_WITH_CRITERIA);
    const { provider, lastRequest } = makeProvider({
      verdict: 'SATISFIED',
      confidence: 'medium',
      rationale: 'ok',
      unmetCriteria: [],
    } satisfies LlmVerdict);
    await new OutcomeEvaluator(provider, new GraphStore()).evaluate({
      specPath: p,
      diff: 'd',
      testOutput: 't',
    });
    expect(lastRequest()?.model).toBeUndefined();
  });
});

describe('OutcomeEvaluator — provider path', () => {
  it('flows verdict/confidence/judgedAgainst through and derives authority (Criterion 1)', async () => {
    const p = writeSpec(SPEC_WITH_CRITERIA);
    const { provider, analyzeSpy } = makeProvider({
      verdict: 'SATISFIED',
      confidence: 'high',
      rationale: 'Criterion "returns 200" met by the new handler.',
      unmetCriteria: [],
    } satisfies LlmVerdict);
    const evaluator = new OutcomeEvaluator(provider, new GraphStore());
    const v = await evaluator.evaluate({ specPath: p, diff: 'd', testOutput: 't' });
    expect(analyzeSpy).toHaveBeenCalledOnce();
    expect(v.verdict).toBe('SATISFIED');
    expect(v.confidence).toBe('high');
    expect(v.judgedAgainst).toBe('success-criteria');
    expect(v.authority).toBe('advisory'); // SATISFIED is never blocking
    expect(v.rationale).toContain('returns 200');
  });

  it('derives blocking ONLY for NOT_SATISFIED+high', async () => {
    const p = writeSpec(SPEC_WITH_CRITERIA);
    const { provider } = makeProvider({
      verdict: 'NOT_SATISFIED',
      confidence: 'high',
      rationale: 'Criterion "returns 200" unmet — handler returns 500.',
      unmetCriteria: ['returns 200'],
    } satisfies LlmVerdict);
    const v = await new OutcomeEvaluator(provider, new GraphStore()).evaluate({
      specPath: p,
      diff: 'd',
      testOutput: 't',
    });
    expect(v.authority).toBe('blocking');
    expect(v.unmetCriteria).toEqual(['returns 200']);
  });

  // Security guarantee: an injected `authority` key is NEVER readable. It is
  // discarded by the .strict() schema re-parse, and that strict-reject then
  // degrades to a derived authority — so even a malicious payload cannot make
  // authority surface. Realized via strict-reject-then-degrade.
  it('never surfaces an LLM-injected authority key; degrades to advisory (Criterion 4)', async () => {
    const p = writeSpec(SPEC_WITH_CRITERIA);
    const { provider } = makeProvider({
      verdict: 'NOT_SATISFIED',
      confidence: 'high',
      rationale: 'x',
      unmetCriteria: [],
      authority: 'blocking', // malicious/buggy extra key
    });
    const evaluator = new OutcomeEvaluator(provider, new GraphStore());
    const v = await evaluator.evaluate({ specPath: p, diff: 'd', testOutput: 't' });
    // The strict re-parse rejects the extra key; the evaluator degrades safely.
    expect(v.authority).toBe('advisory'); // injected 'blocking' never surfaces
    expect(v.verdict).toBe('INCONCLUSIVE');
    expect(v.confidence).toBe('low');
  });
});

describe('OutcomeEvaluator — degrade-safe error boundary (Criterion 3 ∩ Criterion 4)', () => {
  it('degrades to INCONCLUSIVE/advisory when the provider rejects (rate limit/network)', async () => {
    const p = writeSpec(SPEC_WITH_CRITERIA);
    const { provider, analyzeSpy } = makeRejectingProvider('429 rate limited: sk-secret-token');
    const v = await new OutcomeEvaluator(provider, new GraphStore()).evaluate({
      specPath: p,
      diff: 'd',
      testOutput: 't',
    });
    expect(analyzeSpy).toHaveBeenCalledOnce();
    expect(v.verdict).toBe('INCONCLUSIVE');
    expect(v.confidence).toBe('low');
    expect(v.authority).toBe('advisory');
    // judgedAgainst is the resolved section since resolution succeeded.
    expect(v.judgedAgainst).toBe('success-criteria');
    expect(v.unmetCriteria).toEqual([]);
    // No secret/stack-trace leakage in the rationale.
    expect(v.rationale).not.toContain('sk-secret-token');
    expect(v.rationale).toMatch(/could not be completed/i);
  });

  it('degrades when the strict re-parse fails on a malformed payload', async () => {
    const p = writeSpec(SPEC_WITH_CRITERIA);
    // Wrong enum + missing fields: strict schema parse throws.
    const { provider } = makeProvider({ verdict: 'MAYBE' });
    const v = await new OutcomeEvaluator(provider, new GraphStore()).evaluate({
      specPath: p,
      diff: 'd',
      testOutput: 't',
    });
    expect(v.verdict).toBe('INCONCLUSIVE');
    expect(v.confidence).toBe('low');
    expect(v.authority).toBe('advisory');
    expect(v.judgedAgainst).toBe('success-criteria');
  });

  it('degrades to advisory when the spec file is missing; provider NOT called (OE-SUG-4)', async () => {
    const { provider, analyzeSpy } = makeProvider({});
    const v = await new OutcomeEvaluator(provider, new GraphStore()).evaluate({
      specPath: '/definitely/missing/spec.md',
      diff: 'd',
      testOutput: 't',
    });
    expect(analyzeSpy).not.toHaveBeenCalled();
    expect(v.verdict).toBe('INCONCLUSIVE');
    expect(v.confidence).toBe('low');
    expect(v.authority).toBe('advisory');
    // Section unknown on a read failure -> 'overview'.
    expect(v.judgedAgainst).toBe('overview');
    expect(v.rationale).toMatch(/could not be completed/i);
  });
});

describe('OutcomeEvaluator — persistence (Criterion 6)', () => {
  it('writes exactly one execution_outcome node on the provider-success path', async () => {
    const p = writeSpec(SPEC_WITH_CRITERIA);
    const store = new GraphStore();
    const { provider } = makeProvider({
      verdict: 'NOT_SATISFIED',
      confidence: 'high',
      rationale: 'returns 200 unmet',
      unmetCriteria: ['returns 200'],
    } satisfies LlmVerdict);
    await new OutcomeEvaluator(provider, store).evaluate({
      specPath: p,
      diff: 'd',
      testOutput: 't',
    });
    const nodes = store.findNodes({ type: 'execution_outcome' });
    expect(nodes).toHaveLength(1);
    expect(nodes[0].metadata.result).toBe('failure'); // NOT_SATISFIED -> failure
    expect(nodes[0].metadata.verdict).toBe('NOT_SATISFIED');
    expect(nodes[0].metadata.confidence).toBe('high');
    expect(nodes[0].metadata.judgedAgainst).toBe('success-criteria');
    expect(nodes[0].metadata.source).toBe('outcome-eval');
    expect(nodes[0].metadata.linkedSpecId).toBe(p);
  });

  it('OMITS taskType on the evaluator node (no fabricated "feature") — SUG-2', async () => {
    const p = writeSpec(SPEC_WITH_CRITERIA);
    const store = new GraphStore();
    const { provider } = makeProvider({
      verdict: 'NOT_SATISFIED',
      confidence: 'high',
      rationale: 'unmet',
      unmetCriteria: ['returns 200'],
    } satisfies LlmVerdict);
    await new OutcomeEvaluator(provider, store).evaluate({
      specPath: p,
      diff: 'd',
      testOutput: 't',
    });
    const node = store.findNodes({ type: 'execution_outcome' })[0];
    expect(node.metadata.taskType).toBeUndefined();
    expect('taskType' in node.metadata).toBe(false);
  });

  it('maps SATISFIED -> success', async () => {
    const p = writeSpec(SPEC_WITH_CRITERIA);
    const store = new GraphStore();
    const { provider } = makeProvider({
      verdict: 'SATISFIED',
      confidence: 'medium',
      rationale: 'ok',
      unmetCriteria: [],
    } satisfies LlmVerdict);
    await new OutcomeEvaluator(provider, store).evaluate({
      specPath: p,
      diff: 'd',
      testOutput: 't',
    });
    expect(store.findNodes({ type: 'execution_outcome' })[0].metadata.result).toBe('success');
  });

  it('writes exactly one node on the no-section short-circuit path (INCONCLUSIVE)', async () => {
    const p = writeSpec(SPEC_NO_SECTION);
    const store = new GraphStore();
    const { provider, analyzeSpy } = makeProvider({});
    await new OutcomeEvaluator(provider, store).evaluate({
      specPath: p,
      diff: 'd',
      testOutput: 't',
    });
    expect(analyzeSpy).not.toHaveBeenCalled();
    const nodes = store.findNodes({ type: 'execution_outcome' });
    expect(nodes).toHaveLength(1);
    expect(nodes[0].metadata.verdict).toBe('INCONCLUSIVE');
    expect(nodes[0].metadata.result).toBe('failure'); // INCONCLUSIVE -> failure for type-validity
    expect(nodes[0].metadata.agentPersona).toBeUndefined(); // scorer-neutral (D2)
  });

  it('writes exactly one node on the degraded provider-rejection path', async () => {
    const p = writeSpec(SPEC_WITH_CRITERIA);
    const store = new GraphStore();
    const { provider } = makeRejectingProvider('429');
    await new OutcomeEvaluator(provider, store).evaluate({
      specPath: p,
      diff: 'd',
      testOutput: 't',
    });
    expect(store.findNodes({ type: 'execution_outcome' })).toHaveLength(1);
  });

  it('writes TWO distinct nodes for two evaluate() calls against the SAME store (no upsert collision)', async () => {
    const p = writeSpec(SPEC_WITH_CRITERIA);
    const store = new GraphStore();
    const { provider } = makeProvider({
      verdict: 'NOT_SATISFIED',
      confidence: 'high',
      rationale: 'unmet',
      unmetCriteria: ['returns 200'],
    } satisfies LlmVerdict);
    const evaluator = new OutcomeEvaluator(provider, store);
    // Two evaluate() calls that could land in the same millisecond must NOT
    // collide via GraphStore.addNode's upsert-by-id — one node per evaluate().
    await evaluator.evaluate({ specPath: p, diff: 'd', testOutput: 't' });
    await evaluator.evaluate({ specPath: p, diff: 'd', testOutput: 't' });
    const nodes = store.findNodes({ type: 'execution_outcome' });
    expect(nodes).toHaveLength(2);
    expect(new Set(nodes.map((n) => n.id)).size).toBe(2);
  });

  it('swallows a graph-write failure; verdict is returned unchanged (D3)', async () => {
    const p = writeSpec(SPEC_WITH_CRITERIA);
    const throwingStore = new GraphStore();
    vi.spyOn(throwingStore, 'addNode').mockImplementation(() => {
      throw new Error('disk full while writing graph');
    });
    const { provider } = makeProvider({
      verdict: 'NOT_SATISFIED',
      confidence: 'high',
      rationale: 'unmet',
      unmetCriteria: ['returns 200'],
    } satisfies LlmVerdict);
    const v = await new OutcomeEvaluator(provider, throwingStore).evaluate({
      specPath: p,
      diff: 'd',
      testOutput: 't',
    });
    // evaluate() must NOT throw; the blocking verdict survives intact.
    expect(v.verdict).toBe('NOT_SATISFIED');
    expect(v.authority).toBe('blocking');
    expect(throwingStore.findNodes({ type: 'execution_outcome' })).toHaveLength(0);
  });
});

describe('OutcomeEvaluator — persistence log hygiene (no-secret-leak guarantee)', () => {
  it('does NOT warn on the provider-success persistence path', async () => {
    const p = writeSpec(SPEC_WITH_CRITERIA);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { provider } = makeProvider({
        verdict: 'SATISFIED',
        confidence: 'medium',
        rationale: 'ok',
        unmetCriteria: [],
      } satisfies LlmVerdict);
      await new OutcomeEvaluator(provider, new GraphStore()).evaluate({
        specPath: p,
        diff: 'd',
        testOutput: 't',
      });
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('does NOT warn on the degrade-without-store-error path (provider rejection)', async () => {
    const p = writeSpec(SPEC_WITH_CRITERIA);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { provider } = makeRejectingProvider('429 rate limited: sk-secret-token');
      await new OutcomeEvaluator(provider, new GraphStore()).evaluate({
        specPath: p,
        diff: 'd',
        testOutput: 't',
      });
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('warns exactly once with a static no-secret message on the throwing-store path', async () => {
    const p = writeSpec(SPEC_WITH_CRITERIA);
    const throwingStore = new GraphStore();
    vi.spyOn(throwingStore, 'addNode').mockImplementation(() => {
      throw new Error('disk full: s3://bucket/secret-key sk-leak-12345');
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { provider } = makeProvider({
        verdict: 'NOT_SATISFIED',
        confidence: 'high',
        rationale: 'unmet',
        unmetCriteria: ['returns 200'],
      } satisfies LlmVerdict);
      await new OutcomeEvaluator(provider, throwingStore).evaluate({
        specPath: p,
        diff: 'd',
        testOutput: 't',
      });
      expect(warnSpy).toHaveBeenCalledOnce();
      const msg = String(warnSpy.mock.calls[0]?.[0]);
      // Static message — no secret, stack frame, or thrown-error text leaks.
      expect(msg).not.toContain('sk-leak-12345');
      expect(msg).not.toContain('s3://');
      expect(msg).not.toContain('disk full');
      expect(msg).toMatch(/persistence failed/i);
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe('OutcomeEvaluator — conservative-confidence calibration (Criterion 7)', () => {
  it('system prompt caps partial satisfaction at medium', () => {
    expect(OUTCOME_EVAL_SYSTEM_PROMPT.toLowerCase()).toMatch(/partial.*medium|not exceed.*medium/);
  });

  it('a partial-satisfaction verdict (medium) is advisory, never blocking', async () => {
    const p = writeSpec(SPEC_WITH_CRITERIA);
    // Stub models a partial-satisfaction outcome: NOT_SATISFIED at medium.
    const { provider } = makeProvider({
      verdict: 'NOT_SATISFIED',
      confidence: 'medium',
      rationale: 'Endpoint added but error path unverified — partial.',
      unmetCriteria: ['returns 200 on error path'],
    } satisfies LlmVerdict);
    const v = await new OutcomeEvaluator(provider, new GraphStore()).evaluate({
      specPath: p,
      diff: 'd',
      testOutput: 't',
    });
    expect(v.confidence).toBe('medium');
    expect(v.authority).toBe('advisory'); // medium NOT_SATISFIED never blocks
  });
});

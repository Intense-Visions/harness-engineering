import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import type {
  AnalysisProvider,
  AnalysisRequest,
  AnalysisResponse,
} from '../../src/analysis-provider/interface.js';
import { AcceptanceEvaluator } from '../../src/acceptance-eval/evaluator.js';
import {
  ACCEPTANCE_EVAL_SYSTEM_PROMPT,
  acceptanceVerdictSchema,
} from '../../src/acceptance-eval/prompts.js';
import type { LlmAcceptanceVerdict } from '../../src/acceptance-eval/prompts.js';

interface StubProvider {
  provider: AnalysisProvider;
  analyzeSpy: ReturnType<typeof vi.fn>;
  lastRequest: () => AnalysisRequest | undefined;
}

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

const SPEC_WITH_CRITERIA = [
  '# Spec',
  '## Success Criteria',
  '1. The endpoint returns 200.',
  '',
].join('\n');
const SPEC_NO_SECTION = ['# Spec', '## Random Heading', 'nothing judgable', ''].join('\n');

function writeSpec(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'acceptance-eval-'));
  const p = join(dir, 'spec.md');
  writeFileSync(p, body);
  return p;
}

const MEASURABLE: LlmAcceptanceVerdict = {
  measurability: 'MEASURABLE',
  confidence: 'medium',
  rationale: 'Criterion "returns 200" is observable and testable.',
  criteriaFindings: [],
  coverageFindings: [],
};

describe('AcceptanceEvaluator — no judgable section (D-P1-4)', () => {
  it('returns INCONCLUSIVE/advisory WITHOUT calling the provider', async () => {
    const { provider, analyzeSpy } = makeProvider({});
    const v = await new AcceptanceEvaluator(provider).evaluate({
      specPath: writeSpec(SPEC_NO_SECTION),
    });
    expect(analyzeSpy).not.toHaveBeenCalled();
    expect(v.measurability).toBe('INCONCLUSIVE');
    expect(v.authority).toBe('advisory');
    expect(v.judgedAgainst).toBe('overview');
    expect(v.criteriaFindings).toEqual([]);
    expect(v.coverageFindings).toEqual([]);
  });

  it('treats a pre-resolved empty specSection as no-section', async () => {
    const { provider, analyzeSpy } = makeProvider({});
    const v = await new AcceptanceEvaluator(provider).evaluate({
      specPath: '/nope.md',
      specSection: '  \n\t ',
    });
    expect(analyzeSpy).not.toHaveBeenCalled();
    expect(v.measurability).toBe('INCONCLUSIVE');
    expect(v.authority).toBe('advisory');
    expect(v.confidence).toBe('low');
  });
});

describe('AcceptanceEvaluator — provider request shape', () => {
  it('forwards system prompt, populated user prompt, schema, and model', async () => {
    const { provider, lastRequest } = makeProvider(MEASURABLE, { parseWithSchema: true });
    await new AcceptanceEvaluator(provider, { model: 'gpt-judge' }).evaluate({
      specPath: writeSpec(SPEC_WITH_CRITERIA),
      testContent: 'TEST_Y',
    });
    const req = lastRequest();
    expect(req?.systemPrompt).toBe(ACCEPTANCE_EVAL_SYSTEM_PROMPT);
    expect(req?.prompt).toContain('returns 200');
    expect(req?.prompt).toContain('TEST_Y');
    expect(req?.responseSchema).toBe(acceptanceVerdictSchema);
    expect(req?.model).toBe('gpt-judge');
  });

  it('omits the model when no override is configured', async () => {
    const { provider, lastRequest } = makeProvider(MEASURABLE);
    await new AcceptanceEvaluator(provider).evaluate({ specPath: writeSpec(SPEC_WITH_CRITERIA) });
    expect(lastRequest()?.model).toBeUndefined();
  });
});

describe('AcceptanceEvaluator — provider path', () => {
  it('flows fields through and derives advisory authority for MEASURABLE', async () => {
    const { provider, analyzeSpy } = makeProvider(MEASURABLE);
    const v = await new AcceptanceEvaluator(provider).evaluate({
      specPath: writeSpec(SPEC_WITH_CRITERIA),
    });
    expect(analyzeSpy).toHaveBeenCalledOnce();
    expect(v.measurability).toBe('MEASURABLE');
    expect(v.judgedAgainst).toBe('success-criteria');
    expect(v.authority).toBe('advisory');
  });

  it('derives blocking ONLY for NOT_MEASURABLE+high and flows findings', async () => {
    const { provider } = makeProvider({
      measurability: 'NOT_MEASURABLE',
      confidence: 'high',
      rationale: 'No observable criterion is stated.',
      criteriaFindings: [{ target: 'Overview', message: 'no measurable outcome' }],
      coverageFindings: [],
    } satisfies LlmAcceptanceVerdict);
    const v = await new AcceptanceEvaluator(provider).evaluate({
      specPath: writeSpec(SPEC_WITH_CRITERIA),
    });
    expect(v.authority).toBe('blocking');
    expect(v.criteriaFindings[0].message).toBe('no measurable outcome');
  });
});

function makeRejectingProvider(reason: string) {
  const analyzeSpy = vi.fn();
  const provider: AnalysisProvider = {
    async analyze<T>(request: AnalysisRequest): Promise<AnalysisResponse<T>> {
      analyzeSpy(request);
      throw new Error(reason);
    },
  };
  return { provider, analyzeSpy };
}

describe('AcceptanceEvaluator — degrade-safe error boundary', () => {
  it('degrades to INCONCLUSIVE/advisory when the provider rejects (no secret leak)', async () => {
    const { provider, analyzeSpy } = makeRejectingProvider('429 rate limited: sk-secret-token');
    const v = await new AcceptanceEvaluator(provider).evaluate({
      specPath: writeSpec(SPEC_WITH_CRITERIA),
    });
    expect(analyzeSpy).toHaveBeenCalledOnce();
    expect(v.measurability).toBe('INCONCLUSIVE');
    expect(v.confidence).toBe('low');
    expect(v.authority).toBe('advisory');
    expect(v.judgedAgainst).toBe('success-criteria');
    expect(v.rationale).not.toContain('sk-secret-token');
    expect(v.rationale).toMatch(/could not be completed/i);
  });

  it('degrades when the strict re-parse fails on a malformed payload', async () => {
    const { provider } = makeProvider({ measurability: 'MAYBE' });
    const v = await new AcceptanceEvaluator(provider).evaluate({
      specPath: writeSpec(SPEC_WITH_CRITERIA),
    });
    expect(v.measurability).toBe('INCONCLUSIVE');
    expect(v.authority).toBe('advisory');
    expect(v.judgedAgainst).toBe('success-criteria');
  });

  it('never surfaces an LLM-injected authority key; degrades to advisory', async () => {
    const { provider } = makeProvider({
      measurability: 'NOT_MEASURABLE',
      confidence: 'high',
      rationale: 'x',
      criteriaFindings: [],
      coverageFindings: [],
      authority: 'blocking',
    });
    const v = await new AcceptanceEvaluator(provider).evaluate({
      specPath: writeSpec(SPEC_WITH_CRITERIA),
    });
    expect(v.authority).toBe('advisory'); // injected 'blocking' never surfaces
    expect(v.measurability).toBe('INCONCLUSIVE');
    expect(v.confidence).toBe('low');
  });

  it('degrades to advisory when the spec file is missing; provider NOT called', async () => {
    const { provider, analyzeSpy } = makeProvider({});
    const v = await new AcceptanceEvaluator(provider).evaluate({
      specPath: '/definitely/missing/spec.md',
    });
    expect(analyzeSpy).not.toHaveBeenCalled();
    expect(v.measurability).toBe('INCONCLUSIVE');
    expect(v.authority).toBe('advisory');
    expect(v.judgedAgainst).toBe('overview');
  });
});

import { describe, it, expect, afterEach } from 'vitest';
import type { SourceFile, SemanticInput } from '@harness-engineering/core';
import type {
  AnalysisProvider,
  AnalysisRequest,
  AnalysisResponse,
} from '@harness-engineering/intelligence';
import {
  semanticResponseSchema,
  boundSourceDigest,
  buildSemanticPrompt,
  createGenerateSemantic,
  DEFAULT_DIGEST_CHAR_BUDGET,
  DEFAULT_MAX_OUTPUT_TOKENS,
  DEFAULT_SEMANTIC_MODEL,
  REENTRANCY_ENV,
} from '../../src/comprehension/generate-semantic.js';

/** Records requests + returns a canned response (or throws) per call. */
class StubProvider implements AnalysisProvider {
  public requests: AnalysisRequest[] = [];
  public envDuringCall: Array<string | undefined> = [];
  private queue: Array<AnalysisResponse<unknown> | Error>;
  constructor(responses: Array<AnalysisResponse<unknown> | Error>) {
    this.queue = [...responses];
  }
  async analyze<T>(request: AnalysisRequest): Promise<AnalysisResponse<T>> {
    this.requests.push(request);
    this.envDuringCall.push(process.env[REENTRANCY_ENV]);
    const next = this.queue.shift();
    if (next instanceof Error) throw next;
    if (!next) throw new Error('StubProvider: no more canned responses');
    return next as AnalysisResponse<T>;
  }
}

function ok(result: unknown, totalTokens = 50, model = 'x'): AnalysisResponse<unknown> {
  return {
    result,
    tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens },
    model,
    latencyMs: 1,
  };
}

const INPUT: SemanticInput = {
  module: 'pkg/mod',
  interfaceContract: 'CONTRACT_MARKER export function f(): void',
  dependencySlice: 'imports: ./x',
  sourceFiles: [{ path: 'a.ts', content: 'export const a = 1;' }],
};

describe('semanticResponseSchema — authority-in-TS at the seam', () => {
  it('accepts a well-formed { summary, invariants }', () => {
    expect(semanticResponseSchema.parse({ summary: 's', invariants: ['a'] })).toEqual({
      summary: 's',
      invariants: ['a'],
    });
  });

  it('rejects a non-string summary', () => {
    expect(() => semanticResponseSchema.parse({ summary: 5, invariants: [] })).toThrow();
  });

  it('rejects invariants that are not a string array', () => {
    expect(() => semanticResponseSchema.parse({ summary: 's', invariants: [1, 2] })).toThrow();
  });

  it('rejects extra keys (strict)', () => {
    expect(() =>
      semanticResponseSchema.parse({ summary: 's', invariants: [], extra: true })
    ).toThrow();
  });
});

describe('boundSourceDigest — input bounded by budget, not module size', () => {
  it('returns full joined contents when total is under budget', () => {
    const files: SourceFile[] = [
      { path: 'a.ts', content: 'export const a = 1;' },
      { path: 'b.ts', content: 'export const b = 2;' },
    ];
    const out = boundSourceDigest(files, 10_000);
    expect(out).toContain('a.ts');
    expect(out).toContain('export const a = 1;');
    expect(out).toContain('b.ts');
    expect(out).toContain('export const b = 2;');
    expect(out).not.toContain('truncated');
  });

  it('caps output at the budget and appends a truncation marker when over budget', () => {
    const big = 'x'.repeat(5_000);
    const files: SourceFile[] = [
      { path: 'a.ts', content: big },
      { path: 'b.ts', content: big },
      { path: 'c.ts', content: big },
    ];
    const budget = 4_000;
    const out = boundSourceDigest(files, budget);
    expect(out.length).toBeLessThanOrEqual(budget);
    expect(out).toContain('[source truncated for comprehension digest]');
  });
});

describe('buildSemanticPrompt — static-feeds-semantic, bounded', () => {
  const input = {
    module: 'pkg/mod',
    interfaceContract: 'CONTRACT_MARKER export function f(): void',
    dependencySlice: 'DEP_MARKER imports: ./x',
    sourceFiles: [
      { path: 'a.ts', content: 'RAW_SOURCE_MARKER_' + 'y'.repeat(20_000) },
    ] as SourceFile[],
  };

  it('contains the static interface contract and dependency slice', () => {
    const prompt = buildSemanticPrompt(input);
    expect(prompt).toContain('CONTRACT_MARKER');
    expect(prompt).toContain('DEP_MARKER');
  });

  it('bounds the source digest and does NOT include an over-budget file whole', () => {
    const prompt = buildSemanticPrompt(input, 2_000);
    expect(prompt).toContain('[source truncated for comprehension digest]');
    // The full 20k raw body must not survive the digest budget.
    expect(prompt).not.toContain('y'.repeat(20_000));
  });

  it('uses DEFAULT_DIGEST_CHAR_BUDGET when no budget is given', () => {
    expect(DEFAULT_DIGEST_CHAR_BUDGET).toBeGreaterThan(0);
    const prompt = buildSemanticPrompt(input);
    // over the default budget → truncation marker present
    expect(prompt).toContain('[source truncated for comprehension digest]');
  });
});

describe('createGenerateSemantic — provider call, cost levers, validation', () => {
  const savedActive = process.env[REENTRANCY_ENV];
  afterEach(() => {
    if (savedActive === undefined) delete process.env[REENTRANCY_ENV];
    else process.env[REENTRANCY_ENV] = savedActive;
  });

  it('happy path: returns a validated { summary, invariants, model } with cost levers on the request', async () => {
    const provider = new StubProvider([
      ok({ summary: 'does X', invariants: ['keeps Y'] }, 50, 'model-x'),
    ]);
    const gen = createGenerateSemantic(provider);
    const out = await gen(INPUT);
    expect(out).toEqual({ summary: 'does X', invariants: ['keeps Y'], model: 'model-x' });
    const req = provider.requests[0];
    expect(req.disableThinking).toBe(true);
    expect(typeof req.maxTokens).toBe('number');
    expect(req.maxTokens).toBe(DEFAULT_MAX_OUTPUT_TOKENS);
    expect(req.responseSchema).toBe(semanticResponseSchema);
    expect(req.prompt).toContain('CONTRACT_MARKER');
  });

  it('defaults to a cheap-tier model, overridable via opts.model', async () => {
    const p1 = new StubProvider([ok({ summary: 's', invariants: [] })]);
    await createGenerateSemantic(p1)(INPUT);
    expect(p1.requests[0].model).toBe(DEFAULT_SEMANTIC_MODEL);

    const p2 = new StubProvider([ok({ summary: 's', invariants: [] })]);
    await createGenerateSemantic(p2, { model: 'custom-model' })(INPUT);
    expect(p2.requests[0].model).toBe('custom-model');
  });

  it('malformed provider output → null (authority-in-TS), does not throw, logs once', async () => {
    const provider = new StubProvider([ok({ summary: 42 })]);
    const warn = { n: 0, last: '' };
    const gen = createGenerateSemantic(provider, {
      logger: {
        warn: (m) => {
          warn.n++;
          warn.last = m;
        },
      },
    });
    const out = await gen(INPUT);
    expect(out).toBeNull();
    expect(warn.n).toBe(1);
  });

  it('provider throw → null (never aborts the run), logs once', async () => {
    const provider = new StubProvider([new Error('boom')]);
    const warn = { n: 0 };
    const gen = createGenerateSemantic(provider, { logger: { warn: () => warn.n++ } });
    expect(await gen(INPUT)).toBeNull();
    expect(warn.n).toBe(1);
  });

  it('per-run budget fail-loud: exhausted budget short-circuits, does NOT call analyze, warns once', async () => {
    const provider = new StubProvider([
      ok({ summary: 's1', invariants: [] }, 100),
      ok({ summary: 's2', invariants: [] }, 100),
    ]);
    const warn = { n: 0 };
    const gen = createGenerateSemantic(provider, {
      maxTokensPerRun: 100,
      logger: { warn: () => warn.n++ },
    });
    const first = await gen(INPUT);
    expect(first).not.toBeNull();
    expect(provider.requests.length).toBe(1);
    const second = await gen(INPUT);
    expect(second).toBeNull();
    // analyze NOT called a second time.
    expect(provider.requests.length).toBe(1);
    expect(warn.n).toBe(1);
    // A third call still does not re-warn.
    await gen(INPUT);
    expect(warn.n).toBe(1);
  });

  it('reentrancy guard: refuses to recurse when HARNESS_COMPREHENSION_ACTIVE is already set', async () => {
    process.env[REENTRANCY_ENV] = '1';
    const provider = new StubProvider([ok({ summary: 's', invariants: [] })]);
    const gen = createGenerateSemantic(provider);
    expect(await gen(INPUT)).toBeNull();
    expect(provider.requests.length).toBe(0);
  });

  it('reentrancy guard: sets the flag for the child during analyze, restores it after', async () => {
    delete process.env[REENTRANCY_ENV];
    const provider = new StubProvider([ok({ summary: 's', invariants: [] })]);
    const gen = createGenerateSemantic(provider);
    await gen(INPUT);
    // The stub observed the flag set to '1' during the awaited analyze call...
    expect(provider.envDuringCall[0]).toBe('1');
    // ...and it is restored (unset) afterward.
    expect(process.env[REENTRANCY_ENV]).toBeUndefined();
  });
});

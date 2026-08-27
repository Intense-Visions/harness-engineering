import { describe, it, expect, afterEach } from 'vitest';
import type { SourceFile, SemanticInput, StaticExtraction } from '@harness-engineering/core';
import { compileModule } from '@harness-engineering/core';
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
  maybeCreateGenerateSemantic,
  isComprehensionReentrant,
  withComprehensionActive,
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

/**
 * Like {@link StubProvider} but each `analyze` yields (awaits a microtask) before
 * resolving, so concurrent sibling calls all interleave their awaits before any
 * resolves — the schedule under which a per-call env-var reentrancy flag would
 * silently drop siblings.
 */
class DelayingProvider implements AnalysisProvider {
  public requests: AnalysisRequest[] = [];
  private queue: Array<AnalysisResponse<unknown> | Error>;
  constructor(responses: Array<AnalysisResponse<unknown> | Error>) {
    this.queue = [...responses];
  }
  async analyze<T>(request: AnalysisRequest): Promise<AnalysisResponse<T>> {
    this.requests.push(request);
    await new Promise((r) => setTimeout(r, 0));
    const next = this.queue.shift();
    if (next instanceof Error) throw next;
    if (!next) throw new Error('DelayingProvider: no more canned responses');
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

  it('concurrency-safe: N concurrent sibling calls under withComprehensionActive ALL reach the provider (zero silent drops)', async () => {
    delete process.env[REENTRANCY_ENV];
    const N = 4;
    // A provider that yields (awaits a microtask) so all N calls interleave their
    // awaits BEFORE any resolves — the exact schedule that the old per-call
    // env-var flag turned into ~3/4 silent semantic:absent drops.
    const provider = new DelayingProvider(
      Array.from({ length: N }, (_, i) => ok({ summary: `s${i}`, invariants: [] }))
    );
    const gen = createGenerateSemantic(provider);
    const results = await withComprehensionActive(() =>
      Promise.all(Array.from({ length: N }, () => gen(INPUT)))
    );
    // Every sibling produced a real unit — nothing degraded to null.
    expect(results.every((r) => r !== null)).toBe(true);
    // Every sibling actually called the provider — N calls, no short-circuit.
    expect(provider.requests.length).toBe(N);
  });

  it('run-boundary guard: isComprehensionReentrant is true only when the env flag is preset (a nested child)', () => {
    delete process.env[REENTRANCY_ENV];
    expect(isComprehensionReentrant()).toBe(false);
    process.env[REENTRANCY_ENV] = '1';
    expect(isComprehensionReentrant()).toBe(true);
    // Honors an injected env too (child-process spawn shape).
    expect(isComprehensionReentrant({})).toBe(false);
    expect(isComprehensionReentrant({ [REENTRANCY_ENV]: '1' })).toBe(true);
  });

  it('run-boundary guard: withComprehensionActive sets the flag for the whole run and restores prev after', async () => {
    delete process.env[REENTRANCY_ENV];
    let flagDuring: string | undefined;
    const ret = await withComprehensionActive(async () => {
      flagDuring = process.env[REENTRANCY_ENV];
      return 'done';
    });
    expect(ret).toBe('done');
    expect(flagDuring).toBe('1');
    // Restored to the (unset) previous value after the run.
    expect(process.env[REENTRANCY_ENV]).toBeUndefined();

    // Restores a PRE-EXISTING value rather than deleting it.
    process.env[REENTRANCY_ENV] = 'preset';
    await withComprehensionActive(async () => {
      expect(process.env[REENTRANCY_ENV]).toBe('1');
    });
    expect(process.env[REENTRANCY_ENV]).toBe('preset');
  });

  it('run-boundary guard: withComprehensionActive restores the flag even when fn throws', async () => {
    delete process.env[REENTRANCY_ENV];
    await expect(
      withComprehensionActive(async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
    expect(process.env[REENTRANCY_ENV]).toBeUndefined();
  });
});

describe('maybeCreateGenerateSemantic + compileModule wire-through (SC5 / SC4)', () => {
  const stubStatic = (): StaticExtraction => ({
    interfaceContract: 'export function f(): void',
    dependencySlice: 'imports: ./x',
  });
  const sourceFiles: SourceFile[] = [{ path: 'a.ts', content: 'export const a = 1;' }];

  it('returns undefined when the resolver yielded null (SC4 — caller omits the seam → static-only)', () => {
    expect(maybeCreateGenerateSemantic(null)).toBeUndefined();
  });

  it('returns a function when a provider is supplied', () => {
    const provider = new StubProvider([ok({ summary: 's', invariants: [] })]);
    expect(typeof maybeCreateGenerateSemantic(provider)).toBe('function');
  });

  it('SC5: compileModule with the adapter emits a semantic:present unit', async () => {
    const provider = new StubProvider([
      ok({ summary: 'compiles a module', invariants: ['static always runs'] }, 20, 'model-z'),
    ]);
    const unit = await compileModule('pkg/mod', sourceFiles, {
      extractStatic: stubStatic,
      generateSemantic: createGenerateSemantic(provider),
    });
    expect(unit.provenance.semantic).toBe('present');
    expect(unit.summary).toBe('compiles a module');
    expect(unit.invariants).toEqual(['static always runs']);
    expect(unit.provenance.model).toBe('model-z');
    expect(provider.requests.length).toBe(1);
  });

  it('SC4: compileModule with NO generateSemantic emits a static-only semantic:absent unit, no provider interaction', async () => {
    const provider = new StubProvider([]); // must never be called
    const gen = maybeCreateGenerateSemantic(null); // resolver → null path
    const unit = await compileModule('pkg/mod', sourceFiles, {
      extractStatic: stubStatic,
      ...(gen ? { generateSemantic: gen } : {}),
    });
    expect(unit.provenance.semantic).toBe('absent');
    expect(unit.summary).toBe('');
    expect(unit.invariants).toHaveLength(0);
    expect(unit.provenance.model).toBeNull();
    expect(provider.requests.length).toBe(0);
    // interface contract (static half) is still present.
    expect(unit.interfaceContract).toContain('export function f');
  });
});

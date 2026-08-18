import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command } from 'commander';
import { createKnowledgePipelineCommand } from './knowledge-pipeline';

/**
 * Unit contract for `harness knowledge-pipeline`. Pins the CURRENT behavior of
 * the Commander wiring: flag/config -> runner option bag, JSON vs human report
 * rendering, and the `--drift-check` exit gate.
 *
 * Fully hermetic: the graph package (`GraphStore` / `KnowledgePipelineRunner`),
 * `resolveConfig`, and `fs.mkdir` are all mocked, so there is no real IO, no
 * subprocess, and no network. `console.log/warn/error` and `process.exit` are
 * spied so the runner never prints or exits for real.
 */

const hoisted = vi.hoisted(() => ({
  runMock: vi.fn(),
  loadMock: vi.fn(),
  mkdirMock: vi.fn(),
  resolveConfigMock: vi.fn(),
  // Captures the store instance passed to `new KnowledgePipelineRunner(store)`.
  runnerStore: { value: undefined as unknown },
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, mkdir: hoisted.mkdirMock };
});

vi.mock('@harness-engineering/graph', () => {
  class GraphStore {
    load = hoisted.loadMock;
  }
  class KnowledgePipelineRunner {
    run = hoisted.runMock;
    constructor(store: unknown) {
      hoisted.runnerStore.value = store;
    }
  }
  return { GraphStore, KnowledgePipelineRunner };
});

vi.mock('../config/loader', () => ({
  resolveConfig: hoisted.resolveConfigMock,
}));

// ─── Result factory ─────────────────────────────────────────────────────────

const GAP_DOMAINS = ['auth', 'api'] as const;

/**
 * A fully-populated KnowledgePipelineResult matching every field the command's
 * renderers read. Overrides let each test tweak just the slice it asserts on.
 */
function makeResult(overrides: Record<string, unknown> = {}): unknown {
  return {
    verdict: 'pass',
    baselineEmpty: false,
    driftScore: 1.5,
    iterations: 1,
    findings: { new: 2, stale: 0, drifted: 0, contradicting: 0 },
    extraction: {
      codeSignals: 5,
      diagrams: 1,
      linkerFacts: 3,
      businessKnowledge: 2,
      decisions: 1,
      images: 0,
    },
    errors: [],
    gaps: {
      domains: [...GAP_DOMAINS],
      totalEntries: 10,
      totalExtracted: 8,
      totalGaps: 2,
    },
    remediations: [],
    contradictions: { contradictions: [], sourcePairCounts: {}, totalChecked: 4 },
    coverage: { overallScore: 85, overallGrade: 'B', domains: [] },
    ...overrides,
  };
}

function makeProgram(): Command {
  const program = new Command();
  program.option('--json', 'JSON output');
  program.addCommand(createKnowledgePipelineCommand());
  return program;
}

async function runCli(args: string[]): Promise<void> {
  await makeProgram().parseAsync(['node', 'harness', 'knowledge-pipeline', ...args]);
}

describe('harness knowledge-pipeline — command contract', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    hoisted.runMock.mockReset();
    hoisted.loadMock.mockReset();
    hoisted.mkdirMock.mockReset();
    hoisted.resolveConfigMock.mockReset();
    hoisted.runnerStore.value = undefined;

    // Defaults: fresh graph load succeeds, mkdir succeeds, config absent.
    hoisted.loadMock.mockResolvedValue(undefined);
    hoisted.mkdirMock.mockResolvedValue(undefined);
    hoisted.resolveConfigMock.mockReturnValue({ ok: false });
    hoisted.runMock.mockResolvedValue(makeResult());

    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(((_code?: number) => undefined) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function runOpts(): Record<string, unknown> {
    expect(hoisted.runMock).toHaveBeenCalledTimes(1);
    return hoisted.runMock.mock.calls[0]![0] as Record<string, unknown>;
  }

  function joinedLog(): string {
    return logSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
  }

  // ── Runner wiring: default flags ──────────────────────────────────────────
  it('default invocation runs the pipeline with detect-only flags and no image/domain/inference options', async () => {
    await runCli([]);

    const opts = runOpts();
    expect(opts.fix).toBe(false);
    expect(opts.ci).toBe(false);
    expect(opts.analyzeImages).toBe(false);
    expect(opts.projectDir).toBe(process.cwd());
    // graphDir is derived from cwd and always points at .harness/graph.
    expect(String(opts.graphDir).replaceAll('\\', '/')).toMatch(/\.harness\/graph$/);
    expect(opts).not.toHaveProperty('domain');
    expect(opts).not.toHaveProperty('imagePaths');
    expect(opts).not.toHaveProperty('inferenceOptions');
    // Graph dir is ensured before the runner executes.
    expect(hoisted.mkdirMock).toHaveBeenCalledWith(opts.graphDir, { recursive: true });
    // The loaded store is the one handed to the runner.
    expect(hoisted.runnerStore.value).toBeDefined();
  });

  it('--fix and --ci propagate as booleans into the runner option bag', async () => {
    await runCli(['--fix', '--ci']);
    const opts = runOpts();
    expect(opts.fix).toBe(true);
    expect(opts.ci).toBe(true);
  });

  it('--domain limits the pipeline to the named domain', async () => {
    await runCli(['--domain', 'billing']);
    expect(runOpts().domain).toBe('billing');
  });

  // ── Image paths parsing (without --analyze-images, so no provider setup) ──
  it('--image-paths is split on commas and trimmed into an array', async () => {
    await runCli(['--image-paths', ' a.png , b.png ,c.png']);
    const opts = runOpts();
    expect(opts.imagePaths).toEqual(['a.png', 'b.png', 'c.png']);
    // Parsing image paths alone must NOT flip analyzeImages or set a provider.
    expect(opts.analyzeImages).toBe(false);
    expect(opts).not.toHaveProperty('analysisProvider');
  });

  // ── Config-derived inference options ──────────────────────────────────────
  it('maps knowledge.domainPatterns/domainBlocklist config into inferenceOptions', async () => {
    hoisted.resolveConfigMock.mockReturnValue({
      ok: true,
      value: {
        knowledge: {
          domainPatterns: ['^auth/'],
          domainBlocklist: ['node_modules'],
        },
      },
    });

    await runCli([]);

    expect(runOpts().inferenceOptions).toEqual({
      extraPatterns: ['^auth/'],
      extraBlocklist: ['node_modules'],
    });
  });

  it('omits inferenceOptions entirely when config has empty knowledge patterns and blocklist', async () => {
    hoisted.resolveConfigMock.mockReturnValue({
      ok: true,
      value: { knowledge: { domainPatterns: [], domainBlocklist: [] } },
    });

    await runCli([]);

    expect(runOpts()).not.toHaveProperty('inferenceOptions');
  });

  // ── JSON report rendering ─────────────────────────────────────────────────
  it('--json prints a single machine-readable object with collapsed counts', async () => {
    await makeProgram().parseAsync(['node', 'harness', '--json', 'knowledge-pipeline']);

    const jsonLine = logSpy.mock.calls
      .map((c: unknown[]) => String(c[0]))
      .find((l: string) => l.trim().startsWith('{'));
    expect(jsonLine).toBeDefined();
    const payload = JSON.parse(jsonLine!);

    expect(payload.verdict).toBe('pass');
    expect(payload.driftScore).toBe(1.5);
    // Nested collections are reduced to counts, not full arrays.
    expect(payload.gaps.domains).toBe(GAP_DOMAINS.length);
    expect(payload.contradictions.count).toBe(0);
    expect(payload.coverage.domains).toBe(0);
    expect(payload.coverage.overallScore).toBe(85);
    // Human summary header must NOT appear in JSON mode.
    expect(logSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n')).not.toMatch(
      /KNOWLEDGE PIPELINE/
    );
  });

  it('--json includes a materialization summary only when the result carries one', async () => {
    hoisted.runMock.mockResolvedValue(
      makeResult({
        materialization: {
          created: [{ filePath: 'docs/auth.md' }, { filePath: 'docs/api.md' }],
          skipped: [{ filePath: 'docs/legacy.md' }],
        },
      })
    );

    await makeProgram().parseAsync(['node', 'harness', '--json', 'knowledge-pipeline']);

    const jsonLine = logSpy.mock.calls
      .map((c: unknown[]) => String(c[0]))
      .find((l: string) => l.trim().startsWith('{'));
    const payload = JSON.parse(jsonLine!);
    expect(payload.materialization.created).toBe(2);
    expect(payload.materialization.skipped).toBe(1);
    expect(payload.materialization.files).toEqual(['docs/auth.md', 'docs/api.md']);
  });

  // ── Human report rendering ────────────────────────────────────────────────
  it('default (non-JSON) output renders the human verdict + drift/findings summary', async () => {
    await runCli([]);

    const out = joinedLog();
    expect(out).toMatch(/KNOWLEDGE PIPELINE/);
    expect(out).toMatch(/Verdict:/);
    expect(out).toMatch(/PASS/);
    expect(out).toMatch(/Drift Score: 1\.50/);
    expect(out).toMatch(/Findings: 2 new, 0 stale, 0 drifted, 0 contradicting/);
  });

  it('routes ingestion errors to stderr via console.warn', async () => {
    hoisted.runMock.mockResolvedValue(
      makeResult({ errors: ['bad frontmatter in a.md', 'unreadable b.md'] })
    );

    await runCli([]);

    const warned = warnSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(warned).toMatch(/2 ingestion warning\(s\)/);
    expect(warned).toMatch(/bad frontmatter in a\.md/);
  });

  // ── Drift-check exit gate ─────────────────────────────────────────────────
  it('--drift-check exits 1 and reports the count when unresolved drift exists', async () => {
    hoisted.runMock.mockResolvedValue(
      makeResult({ verdict: 'fail', findings: { new: 0, stale: 1, drifted: 2, contradicting: 1 } })
    );

    await runCli(['--drift-check']);

    expect(exitSpy).toHaveBeenCalledWith(1);
    // stale(1) + drifted(2) + contradicting(1) = 4 unresolved.
    const errored = errSpy.mock.calls.map((c: unknown[]) => c.map(String).join(' ')).join('\n');
    expect(errored).toMatch(/4 unresolved drift findings/);
  });

  it('--drift-check does NOT exit when only "new" findings exist (new is not unresolved drift)', async () => {
    hoisted.runMock.mockResolvedValue(
      makeResult({ findings: { new: 9, stale: 0, drifted: 0, contradicting: 0 } })
    );

    await runCli(['--drift-check']);

    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('without --drift-check, unresolved drift is reported but does not exit', async () => {
    hoisted.runMock.mockResolvedValue(
      makeResult({ findings: { new: 0, stale: 5, drifted: 0, contradicting: 0 } })
    );

    await runCli([]);

    expect(exitSpy).not.toHaveBeenCalled();
  });

  // ── Failure handling ──────────────────────────────────────────────────────
  it('surfaces a runner failure to stderr and exits 1', async () => {
    hoisted.runMock.mockRejectedValue(new Error('extractor exploded'));

    await runCli([]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errored = errSpy.mock.calls.map((c: unknown[]) => c.map(String).join(' ')).join('\n');
    expect(errored).toMatch(/Knowledge pipeline failed: extractor exploded/);
  });

  it('tolerates a failed graph load (fresh graph) and still runs the pipeline', async () => {
    hoisted.loadMock.mockRejectedValue(new Error('no graph on disk'));

    await runCli([]);

    expect(hoisted.runMock).toHaveBeenCalledTimes(1);
    expect(exitSpy).not.toHaveBeenCalled();
  });
});

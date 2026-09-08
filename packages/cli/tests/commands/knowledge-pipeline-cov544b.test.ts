import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command } from 'commander';

/**
 * Branch coverage for knowledge-pipeline.ts human renderers and config wiring
 * that the co-located contract test leaves uncovered: verdict badges
 * (warn/abstain/fail), the abstain narrative, first-run vs steady drift label,
 * convergence/remediation lines, materialization + contradiction + coverage
 * reports (all shapes), docsDir/adrDir/extractionExclude config plumbing, and
 * the --analyze-images provider-unavailable exit.
 */

const hoisted = vi.hoisted(() => ({
  runMock: vi.fn(),
  loadMock: vi.fn(),
  mkdirMock: vi.fn(),
  resolveConfigMock: vi.fn(),
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
  }
  return { GraphStore, KnowledgePipelineRunner };
});

vi.mock('../../src/config/loader', () => ({ resolveConfig: hoisted.resolveConfigMock }));

import { createKnowledgePipelineCommand } from '../../src/commands/knowledge-pipeline';

function makeResult(overrides: Record<string, unknown> = {}): unknown {
  return {
    verdict: 'pass',
    baselineEmpty: false,
    driftScore: 1.0,
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
    gaps: { domains: ['auth'], totalEntries: 10, totalExtracted: 8, totalGaps: 2 },
    remediations: [],
    contradictions: { contradictions: [], sourcePairCounts: {}, totalChecked: 4 },
    coverage: {
      overallScore: 85,
      overallGrade: 'B',
      graphPresent: true,
      measuredDomainCount: 1,
      domains: [],
    },
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

let logSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;
let errSpy: ReturnType<typeof vi.spyOn>;
let exitSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  hoisted.runMock.mockReset();
  hoisted.loadMock.mockReset().mockResolvedValue(undefined);
  hoisted.mkdirMock.mockReset().mockResolvedValue(undefined);
  hoisted.resolveConfigMock.mockReset().mockReturnValue({ ok: false });
  hoisted.runMock.mockResolvedValue(makeResult());

  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  exitSpy = vi.spyOn(process, 'exit').mockImplementation(((_c?: number) => undefined) as never);
});

afterEach(() => vi.restoreAllMocks());

function joinedLog(): string {
  return logSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
}
function runOpts(): Record<string, unknown> {
  return hoisted.runMock.mock.calls[0]![0] as Record<string, unknown>;
}

describe('verdict badges & drift labelling', () => {
  it('renders the WARN badge', async () => {
    hoisted.runMock.mockResolvedValue(makeResult({ verdict: 'warn' }));
    await runCli([]);
    expect(joinedLog()).toContain('WARN');
  });

  it('renders the FAIL badge for an unknown/fail verdict', async () => {
    hoisted.runMock.mockResolvedValue(makeResult({ verdict: 'fail' }));
    await runCli([]);
    expect(joinedLog()).toContain('FAIL');
  });

  it('renders ABSTAIN plus the empty-baseline narrative', async () => {
    hoisted.runMock.mockResolvedValue(makeResult({ verdict: 'abstain', baselineEmpty: true }));
    await runCli([]);
    const out = joinedLog();
    expect(out).toContain('ABSTAIN');
    expect(out).toMatch(/Inconclusive — empty baseline/);
    // baselineEmpty → first-run drift label
    expect(out).toMatch(/first run — no prior graph state/);
  });

  it('omits the first-run label once stale findings exist', async () => {
    hoisted.runMock.mockResolvedValue(
      makeResult({ findings: { new: 1, stale: 2, drifted: 0, contradicting: 0 } })
    );
    await runCli([]);
    expect(joinedLog()).not.toMatch(/first run — no prior graph state/);
  });

  it('prints convergence and remediation lines when present', async () => {
    hoisted.runMock.mockResolvedValue(
      makeResult({ iterations: 3, remediations: [{ id: 'r1' }, { id: 'r2' }] })
    );
    await runCli([]);
    const out = joinedLog();
    expect(out).toMatch(/Convergence: 3 iterations/);
    expect(out).toMatch(/Remediations: 2 applied/);
  });
});

describe('materialization & contradiction reports (human mode)', () => {
  it('prints materialization summary and created doc paths', async () => {
    hoisted.runMock.mockResolvedValue(
      makeResult({
        materialization: {
          created: [{ filePath: 'docs/a.md' }, { filePath: 'docs/b.md' }],
          skipped: [{ filePath: 'docs/legacy.md' }],
        },
      })
    );
    await runCli([]);
    const out = joinedLog();
    expect(out).toMatch(/Materialization: 2 docs created, 1 skipped/);
    expect(out).toContain('docs/a.md');
    expect(out).toContain('docs/b.md');
  });

  it('prints detected contradictions', async () => {
    hoisted.runMock.mockResolvedValue(
      makeResult({
        contradictions: {
          contradictions: [
            { description: 'X says A but Y says B', conflictType: 'value', severity: 'high' },
          ],
          sourcePairCounts: {},
          totalChecked: 7,
        },
      })
    );
    await runCli([]);
    const out = joinedLog();
    expect(out).toMatch(/Contradictions: 1 detected across 7 knowledge nodes/);
    expect(out).toContain('X says A but Y says B');
  });

  it('--check-contradictions prints the header even with zero contradictions', async () => {
    await runCli(['--check-contradictions']);
    expect(joinedLog()).toMatch(/Contradictions: 0 detected/);
  });
});

describe('coverage report shapes', () => {
  it('reports N/A and the graph-scan hint when no graph is present', async () => {
    hoisted.runMock.mockResolvedValue(
      makeResult({
        coverage: {
          overallScore: 0,
          overallGrade: 'F',
          graphPresent: false,
          measuredDomainCount: 0,
          domains: [],
        },
      })
    );
    await runCli(['--coverage']);
    const out = joinedLog();
    expect(out).toMatch(/Coverage: .*N\/A.* no graph found/);
    expect(out).toMatch(/harness graph scan/);
  });

  it('reports "no measurable domains" when graph present but overall grade is N/A', async () => {
    hoisted.runMock.mockResolvedValue(
      makeResult({
        coverage: {
          overallScore: 0,
          overallGrade: 'N/A',
          graphPresent: true,
          measuredDomainCount: 0,
          domains: [],
        },
      })
    );
    await runCli(['--coverage']);
    expect(joinedLog()).toMatch(/no measurable domains/);
  });

  it('renders measured and unmeasured per-domain lines', async () => {
    hoisted.runMock.mockResolvedValue(
      makeResult({
        coverage: {
          overallScore: 72,
          overallGrade: 'C',
          graphPresent: true,
          measuredDomainCount: 1,
          domains: [
            {
              domain: 'auth',
              measured: true,
              grade: 'B',
              score: 80,
              knowledgeEntries: 4,
              linkedEntities: 3,
              codeEntities: 5,
            },
            { domain: 'billing', measured: false, knowledgeEntries: 2 },
          ],
        },
      })
    );
    await runCli(['--coverage']);
    const out = joinedLog();
    expect(out).toMatch(/Coverage: C \(72\/100\)/);
    expect(out).toMatch(/auth: B \(80\/100\)/);
    expect(out).toMatch(/billing:.*no code to link/);
  });
});

describe('config plumbing into the runner options', () => {
  it('threads docsDir, adrDir and extractionExclude from config into the option bag', async () => {
    hoisted.resolveConfigMock.mockReturnValue({
      ok: true,
      value: {
        docsDir: './documentation',
        operationalPolicy: { adrDir: 'docs/adr' },
        knowledge: { extractionExclude: ['vendor/**'] },
      },
    });
    await runCli([]);
    const opts = runOpts();
    expect(opts.docsDir).toBe('./documentation');
    expect(opts.adrDir).toBe('docs/adr');
    expect(opts.extractionExclude).toEqual(['vendor/**']);
  });
});

describe('option plumbing & JSON / drift-check / failure paths', () => {
  it('--domain and --image-paths thread through into the option bag', async () => {
    await runCli(['--domain', 'billing', '--image-paths', ' a.png , b.png ']);
    const opts = runOpts();
    expect(opts.domain).toBe('billing');
    expect(opts.imagePaths).toEqual(['a.png', 'b.png']);
  });

  it('maps a patterns-only config into inferenceOptions with just extraPatterns', async () => {
    hoisted.resolveConfigMock.mockReturnValue({
      ok: true,
      value: { knowledge: { domainPatterns: ['^auth/'], domainBlocklist: [] } },
    });
    await runCli([]);
    expect(runOpts().inferenceOptions).toEqual({ extraPatterns: ['^auth/'] });
  });

  it('--json renders the machine-readable report including a materialization block', async () => {
    hoisted.runMock.mockResolvedValue(
      makeResult({
        materialization: {
          created: [{ filePath: 'docs/a.md' }],
          skipped: [],
        },
      })
    );
    await makeProgram().parseAsync(['node', 'harness', '--json', 'knowledge-pipeline']);
    const line = logSpy.mock.calls.map((c) => String(c[0])).find((l) => l.trim().startsWith('{'));
    const payload = JSON.parse(line!);
    expect(payload.verdict).toBe('pass');
    expect(payload.materialization.created).toBe(1);
    expect(payload.materialization.files).toEqual(['docs/a.md']);
  });

  it('--drift-check exits 1 and reports the unresolved count', async () => {
    hoisted.runMock.mockResolvedValue(
      makeResult({ verdict: 'fail', findings: { new: 0, stale: 1, drifted: 2, contradicting: 0 } })
    );
    await runCli(['--drift-check']);
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errSpy.mock.calls.map((c) => c.map(String).join(' ')).join('\n')).toMatch(
      /3 unresolved drift findings/
    );
  });

  it('surfaces a runner failure to stderr and exits 1', async () => {
    hoisted.runMock.mockRejectedValue(new Error('extractor exploded'));
    await runCli([]);
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errSpy.mock.calls.map((c) => c.map(String).join(' ')).join('\n')).toMatch(
      /Knowledge pipeline failed: extractor exploded/
    );
  });
});

describe('--analyze-images provider setup', () => {
  it('exits 1 when no analysis provider / API key is available', async () => {
    const priorKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      await runCli(['--analyze-images']);
    } finally {
      if (priorKey !== undefined) process.env.ANTHROPIC_API_KEY = priorKey;
    }
    // Provider setup exits 1 when neither the intelligence peer dep nor the
    // ANTHROPIC_API_KEY is available.
    expect(exitSpy).toHaveBeenCalledWith(1);
    // silence unused
    void errSpy;
    void warnSpy;
  });
});

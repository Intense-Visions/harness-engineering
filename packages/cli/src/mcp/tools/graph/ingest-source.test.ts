import * as path from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// The handler dynamically imports `@harness-engineering/graph` and
// `node:fs/promises`, and statically imports `loadIngestOptions`. All three are
// mocked so the test is hermetic: no real filesystem, no real graph engine, no
// subprocess. We assert the observable contract — which ingestors run for each
// `source`, how their results are aggregated, and the JSON payload shape.
const mocks = vi.hoisted(() => {
  // Distinct nodesAdded per ingestor so aggregation + branching are provable
  // from the returned payload. Expected sums are derived from these fixtures,
  // never hardcoded.
  const makeResult = (tag: string, nodesAdded: number) => ({
    nodesAdded,
    nodesUpdated: 2,
    edgesAdded: 3,
    edgesUpdated: 4,
    errors: [tag],
    durationMs: 5,
  });

  return {
    results: {
      code: makeResult('code-ingest', 10),
      knowledge: makeResult('knowledge-ingest', 100),
      git: makeResult('git-ingest', 1000),
      signals: makeResult('signals-ingest', 10000),
      diagrams: makeResult('diagrams-ingest', 100000),
    },
    nodeCount: 42,
    edgeCount: 7,
    ingestOptions: { sentinel: 'ingest-options' } as const,
    load: vi.fn(async () => {}),
    save: vi.fn(async () => {}),
    mkdir: vi.fn(async () => {}),
    codeCtor: vi.fn(),
    codeIngest: vi.fn(),
    link: vi.fn(),
    knowledgeIngestAll: vi.fn(),
    gitIngest: vi.fn(),
    signalsRun: vi.fn(),
    diagramsIngest: vi.fn(),
    loadIngestOptions: vi.fn(),
  };
});

vi.mock('@harness-engineering/graph', () => ({
  GraphStore: class {
    load = mocks.load;
    save = mocks.save;
    get nodeCount() {
      return mocks.nodeCount;
    }
    get edgeCount() {
      return mocks.edgeCount;
    }
  },
  CodeIngestor: class {
    constructor(store: unknown, options: unknown) {
      mocks.codeCtor(store, options);
    }
    ingest = mocks.codeIngest;
  },
  TopologicalLinker: class {
    constructor(_store: unknown) {}
    link = mocks.link;
  },
  KnowledgeIngestor: class {
    constructor(_store: unknown) {}
    ingestAll = mocks.knowledgeIngestAll;
  },
  GitIngestor: class {
    constructor(_store: unknown) {}
    ingest = mocks.gitIngest;
  },
  createExtractionRunner: () => ({ run: mocks.signalsRun }),
  DiagramParser: class {
    constructor(_store: unknown) {}
    ingest = mocks.diagramsIngest;
  },
}));

vi.mock('node:fs/promises', () => ({
  mkdir: mocks.mkdir,
  default: { mkdir: mocks.mkdir },
}));

// Same relative specifier the SUT uses; the test sits in the SUT's directory so
// this resolves to the identical module id the handler imports.
vi.mock('../../../commands/graph/ingest-options.js', () => ({
  loadIngestOptions: mocks.loadIngestOptions,
}));

import { handleIngestSource } from './ingest-source.js';

// Absolute, non-root project path (path.resolve guarantees both, cross-platform).
const PROJECT_PATH = path.resolve('canary-fake-project');
const GRAPH_DIR = path.join(PROJECT_PATH, '.harness', 'graph');
const EXTRACTED_DIR = path.join(PROJECT_PATH, '.harness', 'knowledge', 'extracted');

function parse(res: { content: Array<{ text: string }> }) {
  const first = res.content[0];
  if (!first) throw new Error('expected tool response content');
  return JSON.parse(first.text);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.load.mockResolvedValue(undefined);
  mocks.save.mockResolvedValue(undefined);
  mocks.mkdir.mockResolvedValue(undefined);
  mocks.link.mockReturnValue(undefined);
  mocks.loadIngestOptions.mockReturnValue(mocks.ingestOptions);
  mocks.codeIngest.mockResolvedValue(mocks.results.code);
  mocks.knowledgeIngestAll.mockResolvedValue(mocks.results.knowledge);
  mocks.gitIngest.mockResolvedValue(mocks.results.git);
  mocks.signalsRun.mockResolvedValue(mocks.results.signals);
  mocks.diagramsIngest.mockResolvedValue(mocks.results.diagrams);
});

describe('handleIngestSource — source branching', () => {
  it('source "code" runs only the code ingestor + topological linker', async () => {
    const res = await handleIngestSource({ path: PROJECT_PATH, source: 'code' });

    expect(mocks.codeIngest).toHaveBeenCalledTimes(1);
    expect(mocks.codeIngest).toHaveBeenCalledWith(PROJECT_PATH);
    expect(mocks.link).toHaveBeenCalledTimes(1);

    // The other branches must not run for a code-only ingest.
    expect(mocks.knowledgeIngestAll).not.toHaveBeenCalled();
    expect(mocks.gitIngest).not.toHaveBeenCalled();
    expect(mocks.signalsRun).not.toHaveBeenCalled();
    expect(mocks.diagramsIngest).not.toHaveBeenCalled();

    // Only the code result feeds the aggregate.
    const combined = parse(res);
    expect(combined.nodesAdded).toBe(mocks.results.code.nodesAdded);
    expect(combined.errors).toEqual(mocks.results.code.errors);
    expect(res.isError).toBeUndefined();
  });

  it('source "knowledge" runs only the knowledge ingestor', async () => {
    await handleIngestSource({ path: PROJECT_PATH, source: 'knowledge' });

    expect(mocks.knowledgeIngestAll).toHaveBeenCalledTimes(1);
    expect(mocks.knowledgeIngestAll).toHaveBeenCalledWith(PROJECT_PATH);
    expect(mocks.codeIngest).not.toHaveBeenCalled();
    expect(mocks.link).not.toHaveBeenCalled();
    expect(mocks.gitIngest).not.toHaveBeenCalled();
    expect(mocks.signalsRun).not.toHaveBeenCalled();
    expect(mocks.diagramsIngest).not.toHaveBeenCalled();
  });

  it('source "git" runs only the git ingestor', async () => {
    await handleIngestSource({ path: PROJECT_PATH, source: 'git' });

    expect(mocks.gitIngest).toHaveBeenCalledTimes(1);
    expect(mocks.gitIngest).toHaveBeenCalledWith(PROJECT_PATH);
    expect(mocks.codeIngest).not.toHaveBeenCalled();
    expect(mocks.knowledgeIngestAll).not.toHaveBeenCalled();
    expect(mocks.signalsRun).not.toHaveBeenCalled();
    expect(mocks.diagramsIngest).not.toHaveBeenCalled();
  });

  it('source "business-signals" runs the extraction runner against the extracted dir', async () => {
    await handleIngestSource({ path: PROJECT_PATH, source: 'business-signals' });

    expect(mocks.signalsRun).toHaveBeenCalledTimes(1);
    const [runProjectPath, , runExtractedDir] = mocks.signalsRun.mock.calls[0]!;
    expect(runProjectPath).toBe(PROJECT_PATH);
    expect(runExtractedDir).toBe(EXTRACTED_DIR);
    expect(mocks.codeIngest).not.toHaveBeenCalled();
    expect(mocks.diagramsIngest).not.toHaveBeenCalled();
  });

  it('source "diagrams" runs only the diagram parser', async () => {
    await handleIngestSource({ path: PROJECT_PATH, source: 'diagrams' });

    expect(mocks.diagramsIngest).toHaveBeenCalledTimes(1);
    expect(mocks.diagramsIngest).toHaveBeenCalledWith(PROJECT_PATH);
    expect(mocks.codeIngest).not.toHaveBeenCalled();
    expect(mocks.signalsRun).not.toHaveBeenCalled();
  });
});

describe('handleIngestSource — "all" aggregation', () => {
  it('runs every ingestor and sums their per-field results', async () => {
    const res = await handleIngestSource({ path: PROJECT_PATH, source: 'all' });

    expect(mocks.codeIngest).toHaveBeenCalledTimes(1);
    expect(mocks.link).toHaveBeenCalledTimes(1);
    expect(mocks.knowledgeIngestAll).toHaveBeenCalledTimes(1);
    expect(mocks.gitIngest).toHaveBeenCalledTimes(1);
    expect(mocks.signalsRun).toHaveBeenCalledTimes(1);
    expect(mocks.diagramsIngest).toHaveBeenCalledTimes(1);

    const all = Object.values(mocks.results);
    const sum = (
      key: 'nodesAdded' | 'nodesUpdated' | 'edgesAdded' | 'edgesUpdated' | 'durationMs'
    ) => all.reduce((acc, r) => acc + r[key], 0);

    const combined = parse(res);
    expect(combined.nodesAdded).toBe(sum('nodesAdded'));
    expect(combined.nodesUpdated).toBe(sum('nodesUpdated'));
    expect(combined.edgesAdded).toBe(sum('edgesAdded'));
    expect(combined.edgesUpdated).toBe(sum('edgesUpdated'));
    expect(combined.durationMs).toBe(sum('durationMs'));
    expect(combined.errors).toEqual(all.flatMap((r) => r.errors));
  });

  it('embeds live graph stats from the store', async () => {
    const combined = parse(await handleIngestSource({ path: PROJECT_PATH, source: 'all' }));
    expect(combined.graphStats).toEqual({
      totalNodes: mocks.nodeCount,
      totalEdges: mocks.edgeCount,
    });
  });
});

describe('handleIngestSource — wiring', () => {
  it('creates the graph dir, loads and saves the store at that dir', async () => {
    await handleIngestSource({ path: PROJECT_PATH, source: 'code' });

    expect(mocks.mkdir).toHaveBeenCalledWith(GRAPH_DIR, { recursive: true });
    expect(mocks.load).toHaveBeenCalledWith(GRAPH_DIR);
    expect(mocks.save).toHaveBeenCalledWith(GRAPH_DIR);
  });

  it('constructs the code ingestor with options from loadIngestOptions', async () => {
    await handleIngestSource({ path: PROJECT_PATH, source: 'code' });

    expect(mocks.loadIngestOptions).toHaveBeenCalledWith(PROJECT_PATH);
    expect(mocks.codeCtor).toHaveBeenCalledWith(expect.anything(), mocks.ingestOptions);
  });
});

describe('handleIngestSource — error handling', () => {
  it('returns an isError response when the project path is the filesystem root', async () => {
    // sanitizePath rejects the root before any ingestor runs.
    const res = await handleIngestSource({ path: path.parse(process.cwd()).root, source: 'all' });

    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toMatch(/^Error: /);
    expect(res.content[0]!.text).toContain('cannot use filesystem root');
    expect(mocks.codeIngest).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('returns an isError response when an ingestor step throws', async () => {
    mocks.load.mockRejectedValueOnce(new Error('graph store corrupt'));

    const res = await handleIngestSource({ path: PROJECT_PATH, source: 'all' });

    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toBe('Error: graph store corrupt');
    // Failure short-circuits before the save.
    expect(mocks.save).not.toHaveBeenCalled();
  });
});

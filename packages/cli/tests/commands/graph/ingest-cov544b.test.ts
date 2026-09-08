import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

/**
 * Branch coverage for graph/ingest.ts action wiring and the source branches the
 * co-located test leaves cold: handleIngestAction (missing-arg guard, JSON vs
 * human summary, error → exit 2), printIngestSummary warnings, and the
 * requirements / business-signals / figma / miro / --all source paths.
 */

const okResult = (over: Partial<Record<string, unknown>> = {}) => ({
  nodesAdded: 1,
  nodesUpdated: 0,
  edgesAdded: 1,
  edgesUpdated: 0,
  errors: [] as string[],
  durationMs: 5,
  ...over,
});

const mocks = vi.hoisted(() => {
  const mk = () => vi.fn().mockResolvedValue(undefined);
  return {
    load: mk(),
    save: mk(),
    code: vi.fn(),
    link: vi.fn(),
    knowledge: vi.fn(),
    bk: vi.fn(),
    bkSol: vi.fn(),
    bkStrat: vi.fn(),
    decision: vi.fn(),
    decisionArch: vi.fn(),
    git: vi.fn(),
    req: vi.fn(),
    extraction: vi.fn(),
    register: vi.fn(),
    syncAll: vi.fn(),
    sync: vi.fn(),
  };
});

vi.mock('@harness-engineering/graph', () => ({
  GraphStore: class {
    load = mocks.load;
    save = mocks.save;
  },
  CodeIngestor: class {
    ingest = mocks.code;
  },
  TopologicalLinker: class {
    link = mocks.link;
  },
  KnowledgeIngestor: class {
    ingestAll = mocks.knowledge;
  },
  BusinessKnowledgeIngestor: class {
    ingest = mocks.bk;
    ingestSolutions = mocks.bkSol;
    ingestStrategy = mocks.bkStrat;
  },
  DecisionIngestor: class {
    ingest = mocks.decision;
    ingestArchitecture = mocks.decisionArch;
  },
  GitIngestor: class {
    ingest = mocks.git;
  },
  RequirementIngestor: class {
    ingestSpecs = mocks.req;
  },
  SyncManager: class {
    registerConnector = mocks.register;
    syncAll = mocks.syncAll;
    sync = mocks.sync;
  },
  JiraConnector: class {},
  SlackConnector: class {},
  CIConnector: class {},
  ConfluenceConnector: class {},
  FigmaConnector: class {},
  MiroConnector: class {},
  createExtractionRunner: () => ({ run: mocks.extraction }),
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn().mockRejectedValue(new Error('no config')),
}));

// ingest-options is loaded synchronously; keep it inert.
vi.mock('../../../src/commands/graph/ingest-options.js', () => ({ loadIngestOptions: () => ({}) }));

import { createIngestCommand } from '../../../src/commands/graph/ingest';

let logSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;
let errSpy: ReturnType<typeof vi.spyOn>;
let exitSpy: ReturnType<typeof vi.spyOn>;
const EXIT = new Error('exit');
const exitCodes: number[] = [];

beforeEach(() => {
  for (const m of Object.values(mocks)) (m as ReturnType<typeof vi.fn>).mockReset?.();
  mocks.load.mockResolvedValue(undefined);
  mocks.save.mockResolvedValue(undefined);
  mocks.code.mockResolvedValue(okResult({ nodesAdded: 10, edgesAdded: 5 }));
  mocks.knowledge.mockResolvedValue(okResult({ nodesAdded: 3 }));
  for (const m of [mocks.bk, mocks.bkSol, mocks.bkStrat, mocks.decision, mocks.decisionArch]) {
    m.mockResolvedValue(okResult({ nodesAdded: 0, edgesAdded: 0, durationMs: 0 }));
  }
  mocks.git.mockResolvedValue(okResult({ nodesAdded: 20, edgesAdded: 15 }));
  mocks.req.mockResolvedValue(okResult({ nodesAdded: 2 }));
  mocks.extraction.mockResolvedValue(okResult({ nodesAdded: 4 }));
  mocks.syncAll.mockResolvedValue(okResult({ nodesAdded: 5, edgesAdded: 3 }));
  mocks.sync.mockResolvedValue(okResult({ nodesAdded: 2 }));

  exitCodes.length = 0;
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    exitCodes.push(code ?? 0);
    throw EXIT;
  }) as never);
});

afterEach(() => vi.restoreAllMocks());

function program(): Command {
  const p = new Command('harness').option('-c, --config <path>').option('--json');
  p.addCommand(createIngestCommand());
  return p;
}
async function drive(args: string[]): Promise<void> {
  try {
    await program().parseAsync(args, { from: 'user' });
  } catch (e) {
    if (e !== EXIT) throw e;
  }
}
function joined(spy: ReturnType<typeof vi.spyOn>): string {
  return spy.mock.calls.map((c) => c.map(String).join(' ')).join('\n');
}

describe('ingest action guard & output modes', () => {
  it('errors and exits 1 when neither --source nor --all is given', async () => {
    await drive(['ingest']);
    expect(joined(errSpy)).toMatch(/--source or --all is required/);
    expect(exitCodes).toContain(1);
  });

  it('prints a human summary line for a code ingest', async () => {
    await drive(['ingest', '--source', 'code']);
    expect(joined(logSpy)).toMatch(/Ingested \(code\): \+\d+ nodes, \+\d+ edges/);
    expect(mocks.save).toHaveBeenCalled();
  });

  it('routes parse/skip warnings to stderr via printIngestSummary', async () => {
    mocks.code.mockResolvedValue(okResult({ nodesAdded: 1, errors: ['bad.ts: parse error'] }));
    await drive(['ingest', '--source', 'code']);
    const w = joined(warnSpy);
    expect(w).toMatch(/1 parse\/skip warning\(s\)/);
    expect(w).toMatch(/bad\.ts: parse error/);
  });

  it('emits raw JSON when --json is set', async () => {
    await drive(['--json', 'ingest', '--source', 'code']);
    const line = logSpy.mock.calls.map((c) => String(c[0])).find((l) => l.trim().startsWith('{'));
    expect(line).toBeDefined();
    expect(JSON.parse(line!).nodesAdded).toBe(10);
  });

  it('exits 2 and reports when the ingest throws (unknown source)', async () => {
    await drive(['ingest', '--source', 'nosuch']);
    expect(joined(errSpy)).toMatch(/Ingest failed:.*Unknown source: nosuch/);
    expect(exitCodes).toContain(2);
  });
});

describe('ingest source branches', () => {
  it('runs the requirements ingestor', async () => {
    await drive(['ingest', '--source', 'requirements']);
    expect(mocks.req).toHaveBeenCalled();
    expect(joined(logSpy)).toMatch(/Ingested \(requirements\)/);
  });

  it('runs the business-signals extraction runner', async () => {
    await drive(['ingest', '--source', 'business-signals']);
    expect(mocks.extraction).toHaveBeenCalled();
  });

  it('runs a figma external connector via SyncManager.sync', async () => {
    await drive(['ingest', '--source', 'figma']);
    expect(mocks.register).toHaveBeenCalled();
    expect(mocks.sync).toHaveBeenCalledWith('figma');
  });

  it('runs a miro external connector via SyncManager.sync', async () => {
    await drive(['ingest', '--source', 'miro']);
    expect(mocks.sync).toHaveBeenCalledWith('miro');
  });

  it('runs the knowledge + business-knowledge + decision ingestors for --source knowledge', async () => {
    await drive(['ingest', '--source', 'knowledge']);
    expect(mocks.knowledge).toHaveBeenCalled();
    expect(mocks.bk).toHaveBeenCalled();
    expect(mocks.decision).toHaveBeenCalled();
  });

  it('honours --full and a --config-derived project path', async () => {
    await drive(['--config', '/proj/harness.config.json', 'ingest', '--source', 'code', '--full']);
    // projectPath resolves to the config's directory; code ingestor still runs.
    expect(mocks.code).toHaveBeenCalled();
    expect(joined(logSpy)).toMatch(/Ingested \(code\)/);
  });

  it('--all fans out across every ingestor and registers all six connectors', async () => {
    await drive(['ingest', '--all']);
    expect(mocks.code).toHaveBeenCalled();
    expect(mocks.link).toHaveBeenCalled();
    expect(mocks.knowledge).toHaveBeenCalled();
    expect(mocks.git).toHaveBeenCalled();
    expect(mocks.extraction).toHaveBeenCalled();
    expect(mocks.syncAll).toHaveBeenCalled();
    expect(mocks.register).toHaveBeenCalledTimes(6);
    expect(joined(logSpy)).toMatch(/Ingested \(all\)/);
  });
});

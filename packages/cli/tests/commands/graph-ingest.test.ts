import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock state ─────────────────────────────────────────────────────────────

const mockStore = {
  load: vi.fn().mockResolvedValue(undefined),
  save: vi.fn().mockResolvedValue(undefined),
};

const mockCodeIngest = vi.fn().mockResolvedValue({
  nodesAdded: 10,
  nodesUpdated: 0,
  edgesAdded: 5,
  edgesUpdated: 0,
  errors: [],
  durationMs: 100,
});

const mockLink = vi.fn();

const mockKnowledgeIngest = vi.fn().mockResolvedValue({
  nodesAdded: 3,
  nodesUpdated: 1,
  edgesAdded: 2,
  edgesUpdated: 0,
  errors: [],
  durationMs: 50,
});

const mockGitIngest = vi.fn().mockResolvedValue({
  nodesAdded: 20,
  nodesUpdated: 2,
  edgesAdded: 15,
  edgesUpdated: 0,
  errors: [],
  durationMs: 80,
});

const mockExtractionRun = vi.fn().mockResolvedValue({
  nodesAdded: 4,
  nodesUpdated: 0,
  edgesAdded: 0,
  edgesUpdated: 0,
  errors: [],
  durationMs: 60,
});

const mockRegisterConnector = vi.fn();
const mockSyncAll = vi.fn().mockResolvedValue({
  nodesAdded: 5,
  nodesUpdated: 0,
  edgesAdded: 3,
  edgesUpdated: 0,
  errors: [],
  durationMs: 200,
});
const mockSync = vi.fn().mockResolvedValue({
  nodesAdded: 2,
  nodesUpdated: 0,
  edgesAdded: 1,
  edgesUpdated: 0,
  errors: [],
  durationMs: 50,
});

// Use class syntax so `new GraphStore()` works
vi.mock('@harness-engineering/graph', () => ({
  GraphStore: class {
    load = mockStore.load;
    save = mockStore.save;
  },
  CodeIngestor: class {
    constructor() {}
    ingest = mockCodeIngest;
  },
  TopologicalLinker: class {
    constructor() {}
    link = mockLink;
  },
  KnowledgeIngestor: class {
    constructor() {}
    ingestAll = mockKnowledgeIngest;
  },
  GitIngestor: class {
    constructor() {}
    ingest = mockGitIngest;
  },
  SyncManager: class {
    constructor() {}
    registerConnector = mockRegisterConnector;
    syncAll = mockSyncAll;
    sync = mockSync;
  },
  JiraConnector: class {
    name = 'jira';
  },
  SlackConnector: class {
    name = 'slack';
  },
  CIConnector: class {
    name = 'ci';
  },
  ConfluenceConnector: class {
    name = 'confluence';
  },
  createExtractionRunner: () => ({ run: mockExtractionRun }),
}));

// Mock node:fs/promises for loadConnectorConfig
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

// ── Imports after mocks ────────────────────────────────────────────────────

import { runIngest, createIngestCommand } from '../../src/commands/graph/ingest';
import { readFile } from 'node:fs/promises';

const mockedReadFile = vi.mocked(readFile);

beforeEach(() => {
  vi.clearAllMocks();
  // Reset default behavior
  mockStore.load.mockResolvedValue(undefined);
  mockStore.save.mockResolvedValue(undefined);
  mockCodeIngest.mockResolvedValue({
    nodesAdded: 10,
    nodesUpdated: 0,
    edgesAdded: 5,
    edgesUpdated: 0,
    errors: [],
    durationMs: 100,
  });
  mockKnowledgeIngest.mockResolvedValue({
    nodesAdded: 3,
    nodesUpdated: 1,
    edgesAdded: 2,
    edgesUpdated: 0,
    errors: [],
    durationMs: 50,
  });
  mockGitIngest.mockResolvedValue({
    nodesAdded: 20,
    nodesUpdated: 2,
    edgesAdded: 15,
    edgesUpdated: 0,
    errors: [],
    durationMs: 80,
  });
  mockSyncAll.mockResolvedValue({
    nodesAdded: 5,
    nodesUpdated: 0,
    edgesAdded: 3,
    edgesUpdated: 0,
    errors: [],
    durationMs: 200,
  });
  mockSync.mockResolvedValue({
    nodesAdded: 2,
    nodesUpdated: 0,
    edgesAdded: 1,
    edgesUpdated: 0,
    errors: [],
    durationMs: 50,
  });
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('createIngestCommand', () => {
  it('creates a command named ingest', () => {
    const cmd = createIngestCommand();
    expect(cmd.name()).toBe('ingest');
  });

  it('has --source, --all, and --full options', () => {
    const cmd = createIngestCommand();
    const longs = cmd.options.map((o) => o.long);
    expect(longs).toContain('--source');
    expect(longs).toContain('--all');
    expect(longs).toContain('--full');
  });
});

describe('runIngest', () => {
  describe('code source', () => {
    it('ingests code and runs topological linker', async () => {
      const result = await runIngest('/project', 'code');
      expect(result.nodesAdded).toBe(10);
      expect(result.edgesAdded).toBe(5);
      expect(mockCodeIngest).toHaveBeenCalledWith('/project');
      expect(mockLink).toHaveBeenCalled();
      expect(mockStore.save).toHaveBeenCalled();
    });
  });

  describe('knowledge source', () => {
    it('ingests knowledge documents', async () => {
      const result = await runIngest('/project', 'knowledge');
      expect(result.nodesAdded).toBe(3);
      expect(result.nodesUpdated).toBe(1);
      expect(mockKnowledgeIngest).toHaveBeenCalledWith('/project');
      expect(mockStore.save).toHaveBeenCalled();
    });
  });

  describe('git source', () => {
    it('ingests git history', async () => {
      const result = await runIngest('/project', 'git');
      expect(result.nodesAdded).toBe(20);
      expect(result.edgesAdded).toBe(15);
      expect(mockGitIngest).toHaveBeenCalledWith('/project');
      expect(mockStore.save).toHaveBeenCalled();
    });
  });

  describe('unknown source', () => {
    it('throws for completely unknown source', async () => {
      await expect(runIngest('/project', 'nosource')).rejects.toThrow('Unknown source: nosource');
    });
  });

  describe('external connectors', () => {
    it('runs jira connector via SyncManager', async () => {
      mockedReadFile.mockResolvedValue(
        JSON.stringify({ graph: { connectors: { jira: { url: 'https://jira.test' } } } }) as never
      );

      const result = await runIngest('/project', 'jira');
      expect(result.nodesAdded).toBe(2);
      expect(mockRegisterConnector).toHaveBeenCalled();
      expect(mockSync).toHaveBeenCalledWith('jira');
      expect(mockStore.save).toHaveBeenCalled();
    });

    it('runs slack connector', async () => {
      mockedReadFile.mockRejectedValue(new Error('no config'));

      const result = await runIngest('/project', 'slack');
      expect(mockSync).toHaveBeenCalledWith('slack');
      expect(result.nodesAdded).toBe(2);
    });

    it('runs ci connector', async () => {
      mockedReadFile.mockRejectedValue(new Error('no config'));

      const result = await runIngest('/project', 'ci');
      expect(mockSync).toHaveBeenCalledWith('ci');
      expect(result.nodesAdded).toBe(2);
    });

    it('runs confluence connector', async () => {
      mockedReadFile.mockRejectedValue(new Error('no config'));

      const result = await runIngest('/project', 'confluence');
      expect(mockSync).toHaveBeenCalledWith('confluence');
      expect(result.nodesAdded).toBe(2);
    });
  });

  describe('--all flag', () => {
    it('runs code, knowledge, git, and all connectors', async () => {
      mockedReadFile.mockRejectedValue(new Error('no config'));

      const result = await runIngest('/project', '', { all: true });
      expect(mockCodeIngest).toHaveBeenCalled();
      expect(mockLink).toHaveBeenCalled();
      expect(mockKnowledgeIngest).toHaveBeenCalled();
      expect(mockGitIngest).toHaveBeenCalled();
      expect(mockSyncAll).toHaveBeenCalled();
      // 4 connectors registered
      expect(mockRegisterConnector).toHaveBeenCalledTimes(4);
      expect(mockStore.save).toHaveBeenCalled();
      // Merged totals: 10+3+20+4+5 = 42 (code+knowledge+git+signals+connectors)
      expect(result.nodesAdded).toBe(42);
      // Merged edges: 5+2+15+0+3 = 25
      expect(result.edgesAdded).toBe(25);
    });

    it('accumulates errors from all sources', async () => {
      mockCodeIngest.mockResolvedValue({
        nodesAdded: 1,
        nodesUpdated: 0,
        edgesAdded: 0,
        edgesUpdated: 0,
        errors: ['code error'],
        durationMs: 10,
      });
      mockKnowledgeIngest.mockResolvedValue({
        nodesAdded: 0,
        nodesUpdated: 0,
        edgesAdded: 0,
        edgesUpdated: 0,
        errors: ['knowledge error'],
        durationMs: 10,
      });
      mockGitIngest.mockResolvedValue({
        nodesAdded: 0,
        nodesUpdated: 0,
        edgesAdded: 0,
        edgesUpdated: 0,
        errors: [],
        durationMs: 10,
      });
      mockSyncAll.mockResolvedValue({
        nodesAdded: 0,
        nodesUpdated: 0,
        edgesAdded: 0,
        edgesUpdated: 0,
        errors: ['sync error'],
        durationMs: 10,
      });
      mockedReadFile.mockRejectedValue(new Error('no config'));

      const result = await runIngest('/project', '', { all: true });
      expect(result.errors).toEqual(['code error', 'knowledge error', 'sync error']);
    });
  });

  describe('loadConnectorConfig', () => {
    it('returns empty config when file read fails', async () => {
      mockedReadFile.mockRejectedValue(new Error('ENOENT'));

      const result = await runIngest('/project', 'jira');
      expect(result).toBeDefined();
      expect(mockRegisterConnector).toHaveBeenCalled();
    });

    it('returns specific connector config from harness.config.json', async () => {
      mockedReadFile.mockResolvedValue(
        JSON.stringify({
          graph: {
            connectors: {
              jira: { baseUrl: 'https://jira.example.com', projectKey: 'PROJ' },
            },
          },
        }) as never
      );

      await runIngest('/project', 'jira');
      expect(mockRegisterConnector).toHaveBeenCalled();
    });

    it('returns empty object when connector key is missing', async () => {
      mockedReadFile.mockResolvedValue(JSON.stringify({ graph: { connectors: {} } }) as never);

      await runIngest('/project', 'slack');
      expect(mockRegisterConnector).toHaveBeenCalled();
    });
  });
});
